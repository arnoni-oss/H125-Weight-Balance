#!/usr/bin/env python3
"""
Portfolio Dashboard Updater
Connects to IBKR Client Portal Gateway and refreshes dashboard.html.
Optionally calls Finnhub (news) + Claude API to rewrite the news and orders sections.

Prerequisites:
  1.  pip install requests anthropic
  2.  IBKR Client Portal Gateway running  →  https://localhost:5000
  3.  Logged in via browser at            →  https://localhost:5000
  4.  (Optional) Finnhub API key from finnhub.io (free)
  5.  (Optional) Anthropic API key from console.anthropic.com

Usage:
  python update_dashboard.py                  # full update including AI news
  python update_dashboard.py --no-ai          # skip AI — prices/MAs only
  python update_dashboard.py --file /path/to/dashboard.html
"""

import argparse
import json
import re
import time
import warnings
from datetime import date, timedelta
from pathlib import Path

import requests

warnings.filterwarnings("ignore", message="Unverified HTTPS request")

# ── API Keys — edit these once ────────────────────────────────────────────────
ANTHROPIC_API_KEY = "sk-ant-YOUR-KEY-HERE"   # console.anthropic.com
FINNHUB_API_KEY   = "YOUR-KEY-HERE"           # finnhub.io → free tier

# ── Ticker config ──────────────────────────────────────────────────────────────
# ath  = all-time high since position was opened (your reference price)
# excl = excluded from weight calculation (QQQ treated as separate LT core)

TICKERS = {
    "QQQ":   {"conid": 320227571, "exchange": "ARCA",   "ath": 793.0,  "bucket": "core",    "excl": True},
    "NBIS":  {"conid": 88819736,  "exchange": "NASDAQ", "ath": 278.8,  "bucket": "core",    "excl": False},
    "EUV":   {"conid": 880200639, "exchange": "ARCA",   "ath": 29.6,   "bucket": "core",    "excl": False},
    "DRAM":  {"conid": 870556708, "exchange": "NASDAQ", "ath": 70.0,   "bucket": "core",    "excl": False},
    "ANET":  {"conid": 740948854, "exchange": "NYSE",   "ath": 186.0,  "bucket": "core",    "excl": False},
    "SMH":   {"conid": 229725622, "exchange": "ARCA",   "ath": 715.0,  "bucket": "core",    "excl": False},
    "QCOM":  {"conid": 273544,    "exchange": "NASDAQ", "ath": 260.0,  "bucket": "core",    "excl": False},
    "MRVL":  {"conid": 483492393, "exchange": "NASDAQ", "ath": 332.0,  "bucket": "core",    "excl": False},
    "CRDO":  {"conid": 541265127, "exchange": "NASDAQ", "ath": 245.0,  "bucket": "core",    "excl": False},
    "IBM":   {"conid": 8314,      "exchange": "NYSE",   "ath": 340.0,  "bucket": "core",    "excl": False},
    "CLS":   {"conid": 695996615, "exchange": "NYSE",   "ath": 489.0,  "bucket": "core",    "excl": False},
    "DRAM":  {"conid": 870556708, "exchange": "NASDAQ", "ath": 70.0,   "bucket": "core",    "excl": False},
    "GOOGL": {"conid": 208813719, "exchange": "NASDAQ", "ath": 410.0,  "bucket": "core",    "excl": False},
    "HBMX":  {"conid": 888128348, "exchange": "ARCA",   "ath": 27.3,   "bucket": "core",    "excl": False},
    "QNTM":  {"conid": 787272463, "exchange": "NASDAQ", "ath": 35.0,   "bucket": "quantum", "excl": False},
    "IONQ":  {"conid": 517593749, "exchange": "NYSE",   "ath": 75.0,   "bucket": "quantum", "excl": False},
    "RDW":   {"conid": 512000171, "exchange": "NYSE",   "ath": 26.7,   "bucket": "space",   "excl": False},
    "NASA":  {"conid": 869314618, "exchange": "ARCA",   "ath": 43.0,   "bucket": "space",   "excl": False},
}

# ── IBKR Client Portal API ────────────────────────────────────────────────────

_sess = requests.Session()
_sess.verify = False
_gateway = "https://localhost:5000/v1/api"


def _get(path, **params):
    url = f"{_gateway}/{path.lstrip('/')}"
    r = _sess.get(url, params=params or None, timeout=20)
    r.raise_for_status()
    return r.json()


def _post(path, **kwargs):
    url = f"{_gateway}/{path.lstrip('/')}"
    r = _sess.post(url, timeout=10, **kwargs)
    r.raise_for_status()
    return r.json()


def tickle():
    try:
        _post("tickle")
    except Exception:
        pass


def get_account_id():
    accounts = _get("portfolio/accounts")
    return accounts[0]["id"]


def get_positions(account_id):
    """Returns {conid_str: {qty, pnl_pct, market_value}}."""
    result = {}
    page = 0
    while True:
        rows = _get(f"portfolio/{account_id}/positions/{page}")
        if not rows:
            break
        for p in rows:
            conid = str(p.get("conid", ""))
            qty = p.get("position", 0)
            mv = p.get("mktValue", 0)
            avg_cost = p.get("avgCost", 0)
            unreal_pnl = p.get("unrealizedPnl", None)
            # Compute P/L % from first principles (total, not daily)
            cost_basis = avg_cost * abs(qty)
            pnl_pct = (unreal_pnl / cost_basis * 100) if (cost_basis and unreal_pnl is not None) else None
            result[conid] = {"qty": int(qty), "pnl_pct": pnl_pct, "market_value": mv}
        if len(rows) < 30:
            break
        page += 1
    return result


def get_cash(account_id):
    """Returns USD cash balance."""
    try:
        ledger = _get(f"portfolio/{account_id}/ledger")
        return float(ledger.get("USD", {}).get("cashbalance", 0))
    except Exception:
        # Fallback: use account summary
        summary = _get(f"portfolio/{account_id}/summary")
        return float(summary.get("totalcashvalue", {}).get("amount", 0))


def get_snapshots(conids):
    """
    Returns {conid_str: {price, chg_pct}} via market data snapshot.
    IBKR requires two calls — first subscribes, second returns data.
    Fields: 31=last price, 7635=% change from prior close
    """
    ids = ",".join(str(c) for c in conids)
    fields = "31,7635"
    # Subscribe
    _get("iserver/marketdata/snapshot", conids=ids, fields=fields)
    time.sleep(2)
    # Fetch
    data = _get("iserver/marketdata/snapshot", conids=ids, fields=fields)

    result = {}
    for item in data:
        conid = str(item.get("conid", ""))
        raw_price = item.get("31")
        raw_chg = item.get("7635")
        if raw_price is not None:
            # IBKR sometimes prefixes prices with C (closing) or H (halted)
            price = float(str(raw_price).lstrip("CH "))
            chg = float(str(raw_chg).replace("%", "").lstrip("CH ")) if raw_chg else None
            result[conid] = {"price": price, "chg_pct": chg}
    return result


def get_daily_closes(conid, exchange, n=50):
    """Last n daily closing prices, oldest first."""
    data = _get("iserver/marketdata/history",
                conid=conid, exchange=exchange,
                period="3M", bar="1d", outsideRth="false")
    bars = data.get("data", [])
    closes = [float(b["c"]) for b in bars if "c" in b]
    return closes[-n:]


def get_weekly_closes(conid, exchange, n=40):
    """Last n weekly closing prices, oldest first."""
    data = _get("iserver/marketdata/history",
                conid=conid, exchange=exchange,
                period="2Y", bar="1w", outsideRth="false")
    bars = data.get("data", [])
    closes = [float(b["c"]) for b in bars if "c" in b]
    return closes[-n:]


# ── Indicators ────────────────────────────────────────────────────────────────

def sma(closes, n):
    if len(closes) < n:
        return None
    return round(sum(closes[-n:]) / n, 2)


def rsi(closes, n=14):
    if len(closes) < n + 1:
        return None
    deltas = [closes[i] - closes[i - 1] for i in range(1, len(closes))]
    gains = [max(d, 0) for d in deltas]
    losses = [max(-d, 0) for d in deltas]
    avg_g = sum(gains[:n]) / n
    avg_l = sum(losses[:n]) / n
    for i in range(n, len(deltas)):
        avg_g = (avg_g * (n - 1) + gains[i]) / n
        avg_l = (avg_l * (n - 1) + losses[i]) / n
    if avg_l == 0:
        return 100
    return round(100 - 100 / (1 + avg_g / avg_l))


def ema(closes, n):
    if len(closes) < n:
        return None
    k = 2 / (n + 1)
    val = sum(closes[:n]) / n
    for c in closes[n:]:
        val = c * k + val * (1 - k)
    return val


def macd_line(closes, fast=12, slow=26):
    """Returns MACD line = fast_EMA - slow_EMA."""
    if len(closes) < slow:
        return None
    e12 = ema(closes, fast)
    e26 = ema(closes, slow)
    if e12 is None or e26 is None:
        return None
    return round(e12 - e26, 2)


# ── HTML rebuilding ───────────────────────────────────────────────────────────

def _ma_td(ma_val, price):
    if ma_val is None:
        return '<td class="dim">n/a</td>'
    pct = (price / ma_val - 1) * 100
    d_cls = "pos" if pct >= 0 else "neg"
    sign = "+" if pct >= 0 else ""
    return f'<td class="ma">{ma_val:.0f}<span class="d {d_cls}">{sign}{pct:.1f}%</span></td>'


def rebuild_row(row_html, tkr, d):
    """
    Rebuild a data row, preserving the hand-edited role and note cells.
    All numeric/indicator cells are regenerated from fresh IBKR data.
    """
    # ── Preserve editorial cells ──────────────────────────────────────────────
    role_m = re.search(r'<td class="role">.*?</td>', row_html, re.DOTALL)
    note_m = re.search(r'<td class="note">.*?</td>', row_html, re.DOTALL)
    style_m = re.search(r'style="(--bucketc:[^"]*)"', row_html)

    role_td = role_m.group(0) if role_m else '<td class="role"></td>'
    note_td = note_m.group(0) if note_m else '<td class="note"></td>'
    style = style_m.group(1) if style_m else f"--bucketc:var(--{d['bucket']})"

    price = d["price"]
    ath = d["ath"]
    ath_pct = (price / ath - 1) * 100
    ath_cls = "ath-neg" if ath_pct < 0 else "ath-pos"

    # ── Quantity ──────────────────────────────────────────────────────────────
    qty = d["qty"]
    qty_td = f'<td class="poscol">{qty}</td>' if qty else '<td class="poscol dim">—</td>'

    # ── Weight ────────────────────────────────────────────────────────────────
    if d["excl"]:
        wt_td = ('<td class="wt dim">'
                 '<span class="wtv" style="font-size:10px;letter-spacing:.06em">'
                 'LT core · excl. from weights</span></td>')
    elif d["weight"] is not None:
        wt = d["weight"]
        bar_w = min(int(wt * 5), 100)
        wt_td = (f'<td class="wt"><span class="wtv">{wt:.1f}%</span>'
                 f'<span class="wtbar"><i style="width:{bar_w}%"></i></span></td>')
    else:
        wt_td = '<td class="wt dim">n/a</td>'

    # ── Price / ATH ───────────────────────────────────────────────────────────
    price_td = (f'<td><span class="price-main">{price:.2f}</span>'
                f'<span class="ath-pct {ath_cls}">({ath_pct:+.1f}% · ${ath})</span></td>')

    # ── P/L ───────────────────────────────────────────────────────────────────
    pl = d["pl_pct"]
    if pl is None:
        pl_td = '<td class="pl dim">—</td>'
    else:
        pl_cls = "pos" if pl >= 0 else "neg"
        pl_td = f'<td class="pl {pl_cls}">{"+" if pl >= 0 else ""}{pl:.1f}%</td>'

    # ── MAs ───────────────────────────────────────────────────────────────────
    ma20_td = _ma_td(d["ma20"], price)
    ma50_td = _ma_td(d["ma50"], price)
    ma40w_td = _ma_td(d["ma40w"], price)

    # ── RSI ───────────────────────────────────────────────────────────────────
    rv = d["rsi"]
    if rv is None:
        rsi_td = '<td class="dim">n/a</td>'
    else:
        rc = "pos" if rv > 60 else ("neg" if rv < 40 else "neu")
        rsi_td = f'<td class="{rc}">{rv}</td>'

    # ── MACD ──────────────────────────────────────────────────────────────────
    mv = d["macd"]
    if mv is None:
        macd_td = '<td class="dim">n/a</td>'
    else:
        mc = "pos" if mv >= 0 else "neg"
        macd_td = f'<td class="{mc}">{"+" if mv >= 0 else ""}{mv:.2f}</td>'

    return (
        f'<tr class="data" style="{style}">\n'
        f'                              <td class="tkr">{tkr}</td>\n'
        f'          {role_td}{qty_td}\n'
        f'          {wt_td}\n'
        f'          {price_td}{pl_td}\n'
        f'          \n'
        f'          {ma20_td}{ma50_td}{ma40w_td}\n'
        f'          {rsi_td}{macd_td}\n'
        f'          {note_td}</tr>'
    )


def apply_row_update(html, tkr, row_data):
    """Find the data row for tkr and rebuild it in-place."""
    def replacer(m):
        row = m.group(0)
        if f'<td class="tkr">{tkr}</td>' in row:
            return rebuild_row(row, tkr, row_data)
        return row

    return re.sub(r'<tr class="data"[^>]*>.*?</tr>', replacer, html, flags=re.DOTALL)


def update_cash_row(html, cash_usd, cash_pct):
    """Update the cash row amount and weight %."""
    html = re.sub(r'<td class="neu">~\$[\d,]+</td>',
                  f'<td class="neu">~${cash_usd:,.0f}</td>', html)
    html = re.sub(
        r'(<td class="wt"><span class="wtv" style="color:var\(--ink-dim\)">)([\d.]+%)',
        f'\\g<1>{cash_pct:.1f}%',
        html,
    )
    html = re.sub(
        r'(<i style="width:)\d+(%";background:var\(--ink-faint\)">)',
        f'\\g<1>{min(int(cash_pct * 5), 100)}\\g<2>',
        html,
    )
    return html


def set_comment_block(html, tag, content):
    return re.sub(
        rf'<!-- {tag}_BEGIN.*?{tag}_END -->',
        f'<!-- {tag}_BEGIN\n{content}\n{tag}_END -->',
        html,
        flags=re.DOTALL,
    )


def set_update_date(html, d):
    return re.sub(r'<!-- last_full_update: [\d-]+ -->', f'<!-- last_full_update: {d} -->', html)


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    p = argparse.ArgumentParser(description="Update portfolio dashboard from IBKR live data")
    p.add_argument("--file", default="dashboard.html", help="Path to dashboard HTML file")
    p.add_argument("--host", default="localhost", help="Client Portal Gateway host")
    p.add_argument("--port", default=5000, type=int, help="Client Portal Gateway port")
    args = p.parse_args()

    global _gateway
    _gateway = f"https://{args.host}:{args.port}/v1/api"

    dashboard_path = Path(args.file)
    if not dashboard_path.exists():
        print(f"ERROR: {dashboard_path} not found.")
        print("Put dashboard.html in the same folder as this script, or pass --file <path>")
        return 1

    print(f"Reading {dashboard_path} ...")
    html = dashboard_path.read_text(encoding="utf-8")

    # Load existing price store (fallback if API fails for a ticker)
    store_m = re.search(r'<!-- PRICE_STORE_BEGIN\n(.*?)\nPRICE_STORE_END -->', html, re.DOTALL)
    price_store = json.loads(store_m.group(1)) if store_m else {}

    # ── Connect ───────────────────────────────────────────────────────────────
    print("Pinging IBKR Gateway...")
    try:
        tickle()
        account_id = get_account_id()
    except Exception as e:
        print(f"ERROR: Cannot reach IBKR Gateway at {_gateway}")
        print(f"  Make sure Client Portal Gateway is running and you are logged in.")
        print(f"  Detail: {e}")
        return 1
    print(f"Connected  →  account {account_id}")

    # ── Positions & cash ──────────────────────────────────────────────────────
    print("Fetching positions and cash...")
    positions = get_positions(account_id)
    cash_usd = get_cash(account_id)

    conid_to_tkr = {str(cfg["conid"]): tkr for tkr, cfg in TICKERS.items()}

    # ── Price snapshots ───────────────────────────────────────────────────────
    print("Fetching live prices (2 calls with 2s gap)...")
    all_conids = [cfg["conid"] for cfg in TICKERS.values()]
    try:
        snapshots = get_snapshots(all_conids)
    except Exception as e:
        print(f"WARNING: Snapshot failed ({e}), will use cached prices")
        snapshots = {}

    # ── Total portfolio value (non-QQQ) for weight calculation ───────────────
    total_non_qqq = cash_usd
    for tkr, cfg in TICKERS.items():
        if cfg["excl"]:
            continue
        conid_str = str(cfg["conid"])
        pos = positions.get(conid_str, {})
        snap = snapshots.get(conid_str, {})
        qty = pos.get("qty", 0)
        price = snap.get("price", 0)
        total_non_qqq += qty * price

    print(f"  Total (ex-QQQ): ${total_non_qqq:,.0f}  |  Cash: ${cash_usd:,.0f}")

    # ── Pull history, calculate indicators, update rows ───────────────────────
    print("\nFetching price history and updating rows...")
    ma_cache = {}

    for tkr, cfg in TICKERS.items():
        conid = cfg["conid"]
        conid_str = str(conid)
        exchange = cfg["exchange"]
        snap = snapshots.get(conid_str, {})
        price = snap.get("price")

        if price is None:
            # Fall back to last known price from store
            stored_daily = price_store.get(tkr, {}).get("daily50", [])
            price = stored_daily[-1] if stored_daily else 0
            print(f"  {tkr:6s}  ⚠  no live price, using cached {price:.2f}")
        else:
            print(f"  {tkr:6s}  ${price:.2f}", end="  ")

        # Pull history (with fallback to cached store)
        try:
            daily = get_daily_closes(conid, exchange, n=50)
            weekly = get_weekly_closes(conid, exchange, n=40)
            print("✓")
        except Exception as e:
            print(f"⚠ history failed ({e}), using cache")
            daily = price_store.get(tkr, {}).get("daily50", [])
            weekly = price_store.get(tkr, {}).get("weekly", [])

        # Append today's close if not already there (avoids duplicates)
        if daily and price and abs(daily[-1] - price) / price > 0.001:
            daily = daily[1:] + [price]  # rolling 50-day window

        price_store[tkr] = {"daily50": daily, "weekly": weekly}

        # ── Indicators ────────────────────────────────────────────────────────
        ma20_val = sma(daily, 20)
        ma50_val = sma(daily, 50)
        ma40w_val = sma(weekly, 40)
        rsi_val = rsi(daily)
        macd_val = macd_line(daily)

        d20 = round((price / ma20_val - 1) * 100, 1) if (ma20_val and price) else None
        d50 = round((price / ma50_val - 1) * 100, 1) if (ma50_val and price) else None
        d200 = round((price / ma40w_val - 1) * 100, 1) if (ma40w_val and price) else None

        ma_cache[tkr] = {
            "ma20": ma20_val, "ma50": ma50_val, "ma200": ma40w_val,
            "d20": d20, "d50": d50, "d200": d200,
        }

        # ── Weight ────────────────────────────────────────────────────────────
        pos = positions.get(conid_str, {})
        qty = pos.get("qty", 0)
        mv = qty * price
        weight = (mv / total_non_qqq * 100) if (total_non_qqq and not cfg["excl"]) else None

        row_data = {
            "price": price,
            "ath": cfg["ath"],
            "pl_pct": pos.get("pnl_pct"),
            "qty": qty,
            "weight": weight,
            "ma20": ma20_val,
            "ma50": ma50_val,
            "ma40w": ma40w_val,
            "rsi": rsi_val,
            "macd": macd_val,
            "excl": cfg["excl"],
            "bucket": cfg["bucket"],
        }

        html = apply_row_update(html, tkr, row_data)
        time.sleep(0.25)  # gentle rate limiting

    # ── Cash row ──────────────────────────────────────────────────────────────
    cash_pct = (cash_usd / total_non_qqq * 100) if total_non_qqq else 0
    html = update_cash_row(html, cash_usd, cash_pct)

    # ── Persist data store and date ───────────────────────────────────────────
    html = set_comment_block(html, "PRICE_STORE", json.dumps(price_store))
    html = set_comment_block(html, "MA_CACHE", json.dumps(ma_cache))
    html = set_update_date(html, str(date.today()))

    # ── Write ─────────────────────────────────────────────────────────────────
    dashboard_path.write_text(html, encoding="utf-8")
    print(f"\n✅  Dashboard updated  →  {dashboard_path.resolve()}")
    print(f"    Cash  : ${cash_usd:,.0f}  ({cash_pct:.1f}%)")
    print(f"    Total : ${total_non_qqq:,.0f}  (ex-QQQ)")
    print(f"    Date  : {date.today()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
