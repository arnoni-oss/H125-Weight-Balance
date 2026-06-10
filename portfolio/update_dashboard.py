#!/usr/bin/env python3
"""
Portfolio Dashboard Updater
Connects to IBKR Client Portal Gateway and refreshes dashboard.html.
Also pulls fresh news from Finnhub (free) and updates the news section.

Prerequisites:
  1.  pip install requests
  2.  IBKR Client Portal Gateway running  →  https://localhost:5000
  3.  Logged in via browser at            →  https://localhost:5000
  4.  Finnhub API key from finnhub.io     →  free signup, takes 1 minute

Usage:
  python update_dashboard.py                  # full update: prices + news
  python update_dashboard.py --no-news        # skip news — prices/MAs only
  python update_dashboard.py --file /path/to/dashboard.html
"""

import argparse
import html as html_mod
import json
import re
import time
import warnings
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import requests

warnings.filterwarnings("ignore", message="Unverified HTTPS request")

# ── API Keys — edit these once ────────────────────────────────────────────────
FINNHUB_API_KEY = "YOUR-KEY-HERE"   # finnhub.io → free signup

# ── Ticker config ──────────────────────────────────────────────────────────────
# ath  = all-time high since position was opened (your reference price)
# excl = excluded from weight calculation (QQQ treated as separate LT core)
# finn = symbol to use for Finnhub news (None = skip news for this ticker)

TICKERS = {
    # hard_stop = fixed price stop (spec trades); None = use MA40w as backstop
    # stop_label = label shown under the stop % in the Stop/Backstop column
    "QQQ":   {"conid": 320227571, "exchange": "ARCA",   "ath": 749.0,  "bucket": "core",    "excl": True,  "finn": "QQQ",  "hard_stop": None,  "stop_label": "MA40w"},
    "NBIS":  {"conid": 88819736,  "exchange": "NASDAQ", "ath": 279.0,  "bucket": "core",    "excl": False, "finn": "NBIS", "hard_stop": None,  "stop_label": "trim→10%"},
    "EUV":   {"conid": 880200639, "exchange": "ARCA",   "ath": 30.0,   "bucket": "core",    "excl": False, "finn": None,   "hard_stop": None,  "stop_label": "no backstop"},
    "DRAM":  {"conid": 870556708, "exchange": "NASDAQ", "ath": 70.0,   "bucket": "core",    "excl": False, "finn": None,   "hard_stop": None,  "stop_label": "MA40w"},
    "ANET":  {"conid": 740948854, "exchange": "NYSE",   "ath": 180.0,  "bucket": "core",    "excl": False, "finn": "ANET", "hard_stop": None,  "stop_label": "MA40w"},
    "SMH":   {"conid": 229725622, "exchange": "ARCA",   "ath": 643.0,  "bucket": "core",    "excl": False, "finn": "SMH",  "hard_stop": None,  "stop_label": "MA40w"},
    "QCOM":  {"conid": 273544,    "exchange": "NASDAQ", "ath": 260.0,  "bucket": "core",    "excl": False, "finn": "QCOM", "hard_stop": None,  "stop_label": "MA40w"},
    "MRVL":  {"conid": 483492393, "exchange": "NASDAQ", "ath": 324.0,  "bucket": "core",    "excl": False, "finn": "MRVL", "hard_stop": None,  "stop_label": "MA40w"},
    "CRDO":  {"conid": 541265127, "exchange": "NASDAQ", "ath": 246.0,  "bucket": "core",    "excl": False, "finn": "CRDO", "hard_stop": None,  "stop_label": "MA40w"},
    "IBM":   {"conid": 8314,      "exchange": "NYSE",   "ath": 332.0,  "bucket": "core",    "excl": False, "finn": "IBM",  "hard_stop": None,  "stop_label": "MA40w"},
    "CLS":   {"conid": 695996615, "exchange": "NYSE",   "ath": 474.0,  "bucket": "core",    "excl": False, "finn": "CLS",  "hard_stop": None,  "stop_label": "MA40w"},
    "GOOGL": {"conid": 208813719, "exchange": "NASDAQ", "ath": 409.0,  "bucket": "core",    "excl": False, "finn": "GOOGL","hard_stop": None,  "stop_label": "MA40w"},
    "HBMX":  {"conid": 888128348, "exchange": "ARCA",   "ath": 28.0,   "bucket": "core",    "excl": False, "finn": None,   "hard_stop": None,  "stop_label": "no backstop"},
    "QNTM":  {"conid": 787272463, "exchange": "NASDAQ", "ath": 35.0,   "bucket": "quantum", "excl": False, "finn": None,   "hard_stop": 23.0,  "stop_label": "stop $23"},
    "IONQ":  {"conid": 517593749, "exchange": "NYSE",   "ath": 85.0,   "bucket": "quantum", "excl": False, "finn": "IONQ", "hard_stop": 50.0,  "stop_label": "stop $50"},
    "RDW":   {"conid": 512000171, "exchange": "NYSE",   "ath": 27.0,   "bucket": "space",   "excl": False, "finn": "RDW",  "hard_stop": 18.90, "stop_label": "stop $18.90"},
    "NASA":  {"conid": 869314618, "exchange": "ARCA",   "ath": 43.0,   "bucket": "space",   "excl": False, "finn": None,   "hard_stop": 27.0,  "stop_label": "stop $27"},
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
            avg_cost = p.get("avgCost", 0)
            unreal_pnl = p.get("unrealizedPnl", None)
            cost_basis = avg_cost * abs(qty)
            pnl_pct = (unreal_pnl / cost_basis * 100) if (cost_basis and unreal_pnl is not None) else None
            result[conid] = {"qty": int(qty), "pnl_pct": pnl_pct, "market_value": p.get("mktValue", 0)}
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
        summary = _get(f"portfolio/{account_id}/summary")
        return float(summary.get("totalcashvalue", {}).get("amount", 0))


def get_snapshots(conids):
    """Returns {conid_str: {price, chg_pct}} — two calls, 2s apart."""
    ids = ",".join(str(c) for c in conids)
    fields = "31,7635"
    _get("iserver/marketdata/snapshot", conids=ids, fields=fields)
    time.sleep(2)
    data = _get("iserver/marketdata/snapshot", conids=ids, fields=fields)
    result = {}
    for item in data:
        conid = str(item.get("conid", ""))
        raw_price = item.get("31")
        raw_chg = item.get("7635")
        if raw_price is not None:
            price = float(str(raw_price).lstrip("CH "))
            chg = float(str(raw_chg).replace("%", "").lstrip("CH ")) if raw_chg else None
            result[conid] = {"price": price, "chg_pct": chg}
    return result


def get_daily_closes(conid, exchange, n=50):
    data = _get("iserver/marketdata/history",
                conid=conid, exchange=exchange,
                period="3M", bar="1d", outsideRth="false")
    bars = data.get("data", [])
    return [float(b["c"]) for b in bars if "c" in b][-n:]


def get_weekly_closes(conid, exchange, n=40):
    data = _get("iserver/marketdata/history",
                conid=conid, exchange=exchange,
                period="2Y", bar="1w", outsideRth="false")
    bars = data.get("data", [])
    return [float(b["c"]) for b in bars if "c" in b][-n:]


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
    if len(closes) < slow:
        return None
    e12 = ema(closes, fast)
    e26 = ema(closes, slow)
    if e12 is None or e26 is None:
        return None
    return round(e12 - e26, 2)


# ── Finnhub news ──────────────────────────────────────────────────────────────

FINNHUB_BASE = "https://finnhub.io/api/v1"


def _fh_get(path, **params):
    params["token"] = FINNHUB_API_KEY
    r = requests.get(f"{FINNHUB_BASE}/{path}", params=params, timeout=10)
    if r.status_code != 200:
        return []
    return r.json()


def get_ticker_news(symbol, days=7):
    """Returns up to 3 recent news items for a ticker."""
    to_dt = date.today()
    from_dt = to_dt - timedelta(days=days)
    items = _fh_get("company-news", symbol=symbol,
                    **{"from": str(from_dt), "to": str(to_dt)})
    if not isinstance(items, list):
        return []
    return items[:3]


def get_market_news(days=2):
    """Returns top general market headlines for the macro section."""
    items = _fh_get("news", category="general")
    if not isinstance(items, list):
        return []
    cutoff = datetime.now(timezone.utc).timestamp() - days * 86400
    recent = [i for i in items if i.get("datetime", 0) >= cutoff]
    return (recent or items)[:5]


def _fmt_date(ts):
    """Unix timestamp → 'Jun 9' style label."""
    try:
        return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%b %-d")
    except Exception:
        return str(date.today())


def _esc(text):
    """Escape HTML special chars in text from API."""
    return html_mod.escape(str(text or ""))


def build_ncard(label, items):
    """Build one .ncard div from a list of Finnhub news items."""
    if not items:
        return ""
    top = items[0]
    headline = _esc(top.get("headline", ""))
    summary = _esc(top.get("summary", headline))
    # Truncate long summaries
    if len(summary) > 220:
        summary = summary[:217] + "…"
    source = _esc(top.get("source", "Finnhub"))
    url = top.get("url", "#")
    date_label = _fmt_date(top.get("datetime", 0))

    # Extra headlines as bullet lines
    extra = ""
    for item in items[1:]:
        h = _esc(item.get("headline", ""))
        if h:
            extra += f" · {h}"

    return (
        f'      <div class="ncard">\n'
        f'        <div class="nhead"><span class="ntkr">{label}</span>'
        f'<span class="ndate">{date_label}</span></div>\n'
        f'        <p>{summary}{extra}</p>\n'
        f'        <div class="nsrc">Source: <a href="{url}">{source}</a></div>\n'
        f'      </div>'
    )


def build_macro_section(market_news, today_str):
    """Build the .macro div from general market headlines."""
    if not market_news:
        return None
    lines = ""
    for item in market_news[:4]:
        h = _esc(item.get("headline", ""))
        s = _esc(item.get("summary", ""))
        if len(s) > 180:
            s = s[:177] + "…"
        if h:
            lines += f"        <p>{h} — {s}</p>\n"
    src_links = []
    seen = set()
    for item in market_news[:3]:
        src = _esc(item.get("source", ""))
        url = item.get("url", "#")
        if src and src not in seen:
            src_links.append(f'<a href="{url}">{src}</a>')
            seen.add(src)
    src_line = " · ".join(src_links) if src_links else "Finnhub"
    return (
        f'    <div class="macro">\n'
        f'      <h3>Macro — market headlines · {today_str}</h3>\n'
        f'{lines}'
        f'      <div class="nsrc" style="margin-top:10px">Sources: {src_line}</div>\n'
        f'    </div>'
    )


def inject_news(html, macro_html, ncards_html):
    """Replace the .macro div and the contents of .ngrid with fresh content."""
    if macro_html:
        html = re.sub(
            r'<div class="macro">.*?</div>',
            macro_html,
            html,
            count=1,
            flags=re.DOTALL,
        )
    if ncards_html:
        html = re.sub(
            r'(<div class="ngrid">).*?(</div>)',
            f'\\1\n{ncards_html}\n    \\2',
            html,
            count=1,
            flags=re.DOTALL,
        )
    return html


# ── HTML rebuilding ───────────────────────────────────────────────────────────

def _ma_td(ma_val, price):
    if ma_val is None:
        return '<td class="dim">n/a</td>'
    pct = (price / ma_val - 1) * 100
    d_cls = "pos" if pct >= 0 else "neg"
    sign = "+" if pct >= 0 else ""
    return f'<td class="ma">{ma_val:.0f}<span class="d {d_cls}">{sign}{pct:.1f}%</span></td>'


def _stop_td(price, stop_price, label):
    """Build the Stop/Backstop column cell."""
    if stop_price is None:
        return (f'<td class="stop"><span class="stop-val stop-ok dim">—</span>'
                f'<span class="stop-label">{label}</span></td>')
    pct = (price / stop_price - 1) * 100
    cls = "stop-breach" if pct < 0 else ("stop-warn" if pct < 8 else "stop-ok")
    sign = "+" if pct >= 0 else ""
    return (f'<td class="stop"><span class="stop-val {cls}">{sign}{pct:.1f}%</span>'
            f'<span class="stop-label">{label}</span></td>')


def _risk_class(price, stop_price):
    """Return row risk CSS class based on distance to stop."""
    if stop_price is None:
        return ""
    pct = (price / stop_price - 1) * 100
    if pct < 0:
        return " risk-breach"
    if pct < 8:
        return " risk-warn"
    return ""


def rebuild_row(row_html, tkr, d):
    """Rebuild a data row, preserving the hand-edited role and note cells."""
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

    qty = d["qty"]
    qty_td = f'<td class="poscol">{qty}</td>' if qty else '<td class="poscol dim">—</td>'

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

    price_td = (f'<td><span class="price-main">{price:.2f}</span>'
                f'<span class="ath-pct {ath_cls}">({ath_pct:+.1f}% · ${ath})</span></td>')

    pl = d["pl_pct"]
    if pl is None:
        pl_td = '<td class="pl dim">—</td>'
    else:
        pl_cls = "pos" if pl >= 0 else "neg"
        pl_td = f'<td class="pl {pl_cls}">{"+" if pl >= 0 else ""}{pl:.1f}%</td>'

    ma20_td = _ma_td(d["ma20"], price)
    ma50_td = _ma_td(d["ma50"], price)
    ma40w_td = _ma_td(d["ma40w"], price)

    # ── Stop / Backstop ───────────────────────────────────────────────────────
    hard_stop = d.get("hard_stop")
    stop_label = d.get("stop_label", "MA40w")
    if hard_stop is not None:
        stop_price = hard_stop
        lbl = stop_label
    elif d["ma40w"] is not None and stop_label == "MA40w":
        stop_price = d["ma40w"]
        lbl = f"MA40w ${d['ma40w']:.0f}"
    else:
        stop_price = None
        lbl = stop_label
    stop_td = _stop_td(price, stop_price, lbl)
    risk_cls = _risk_class(price, stop_price)

    rv = d["rsi"]
    if rv is None:
        rsi_td = '<td class="dim">n/a</td>'
    else:
        rc = "pos" if rv > 60 else ("neg" if rv < 40 else "neu")
        rsi_td = f'<td class="{rc}">{rv}</td>'

    mv = d["macd"]
    if mv is None:
        macd_td = '<td class="dim">n/a</td>'
    else:
        mc = "pos" if mv >= 0 else "neg"
        macd_td = f'<td class="{mc}">{"+" if mv >= 0 else ""}{mv:.2f}</td>'

    return (
        f'<tr class="data{risk_cls}" style="{style}">\n'
        f'                              <td class="tkr">{tkr}</td>\n'
        f'          {role_td}{qty_td}\n'
        f'          {wt_td}\n'
        f'          {price_td}{pl_td}\n'
        f'          \n'
        f'          {ma20_td}{ma50_td}{ma40w_td}\n'
        f'          {stop_td}{rsi_td}{macd_td}\n'
        f'          {note_td}</tr>'
    )


def apply_row_update(html, tkr, row_data):
    def replacer(m):
        row = m.group(0)
        if f'<td class="tkr">{tkr}</td>' in row:
            return rebuild_row(row, tkr, row_data)
        return row
    return re.sub(r'<tr class="data"[^>]*>.*?</tr>', replacer, html, flags=re.DOTALL)


def update_cash_row(html, cash_usd, cash_pct):
    html = re.sub(r'<td class="neu">~\$[\d,]+</td>',
                  f'<td class="neu">~${cash_usd:,.0f}</td>', html)
    html = re.sub(
        r'(<td class="wt"><span class="wtv" style="color:var\(--ink-dim\)">)([\d.]+%)',
        f'\\g<1>{cash_pct:.1f}%', html)
    html = re.sub(
        r'(<i style="width:)\d+(%";background:var\(--ink-faint\)">)',
        f'\\g<1>{min(int(cash_pct * 5), 100)}\\g<2>', html)
    return html


def set_comment_block(html, tag, content):
    return re.sub(
        rf'<!-- {tag}_BEGIN.*?{tag}_END -->',
        f'<!-- {tag}_BEGIN\n{content}\n{tag}_END -->',
        html, flags=re.DOTALL)


def set_update_date(html, d):
    return re.sub(r'<!-- last_full_update: [\d-]+ -->', f'<!-- last_full_update: {d} -->', html)


def update_stale_badge(html, date_str):
    """Update the MA freshness badge in the thead (e.g. 'Jun 8' → today)."""
    return re.sub(
        r'(<span class="stale-badge \w+"[^>]*>)[^<]*(</span>)',
        f'\\g<1>{date_str}\\g<2>',
        html,
    )


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    p = argparse.ArgumentParser(description="Update portfolio dashboard from IBKR live data")
    p.add_argument("--file", default="dashboard.html", help="Path to dashboard HTML file")
    p.add_argument("--host", default="localhost", help="Client Portal Gateway host")
    p.add_argument("--port", default=5000, type=int, help="Client Portal Gateway port")
    p.add_argument("--no-news", action="store_true", help="Skip Finnhub news update")
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

    store_m = re.search(r'<!-- PRICE_STORE_BEGIN\n(.*?)\nPRICE_STORE_END -->', html, re.DOTALL)
    price_store = json.loads(store_m.group(1)) if store_m else {}

    # ── Connect to IBKR ───────────────────────────────────────────────────────
    print("Pinging IBKR Gateway...")
    try:
        tickle()
        account_id = get_account_id()
    except Exception as e:
        print(f"ERROR: Cannot reach IBKR Gateway at {_gateway}")
        print(f"  Make sure the gateway is running and you are logged in.")
        print(f"  Detail: {e}")
        return 1
    print(f"Connected  →  account {account_id}")

    # ── Positions & cash ──────────────────────────────────────────────────────
    print("Fetching positions and cash...")
    positions = get_positions(account_id)
    cash_usd = get_cash(account_id)

    # ── Price snapshots ───────────────────────────────────────────────────────
    print("Fetching live prices...")
    all_conids = [cfg["conid"] for cfg in TICKERS.values()]
    try:
        snapshots = get_snapshots(all_conids)
    except Exception as e:
        print(f"WARNING: Snapshot failed ({e}), will use cached prices")
        snapshots = {}

    # ── Total portfolio value (non-QQQ) ──────────────────────────────────────
    total_non_qqq = cash_usd
    for tkr, cfg in TICKERS.items():
        if cfg["excl"]:
            continue
        conid_str = str(cfg["conid"])
        qty = positions.get(conid_str, {}).get("qty", 0)
        price = snapshots.get(conid_str, {}).get("price", 0)
        total_non_qqq += qty * price

    print(f"  Total (ex-QQQ): ${total_non_qqq:,.0f}  |  Cash: ${cash_usd:,.0f}")

    # ── Price history, indicators, row updates ────────────────────────────────
    print("\nFetching price history and updating rows...")
    ma_cache = {}

    for tkr, cfg in TICKERS.items():
        conid = cfg["conid"]
        conid_str = str(conid)
        exchange = cfg["exchange"]
        snap = snapshots.get(conid_str, {})
        price = snap.get("price")

        if price is None:
            stored_daily = price_store.get(tkr, {}).get("daily50", [])
            price = stored_daily[-1] if stored_daily else 0
            print(f"  {tkr:6s}  ⚠  no live price, using cached {price:.2f}")
        else:
            print(f"  {tkr:6s}  ${price:.2f}", end="  ")

        try:
            daily = get_daily_closes(conid, exchange, n=50)
            weekly = get_weekly_closes(conid, exchange, n=40)
            print("✓")
        except Exception as e:
            print(f"⚠ history failed ({e}), using cache")
            daily = price_store.get(tkr, {}).get("daily50", [])
            weekly = price_store.get(tkr, {}).get("weekly", [])

        if daily and price and abs(daily[-1] - price) / price > 0.001:
            daily = daily[1:] + [price]

        price_store[tkr] = {"daily50": daily, "weekly": weekly}

        ma20_val  = sma(daily, 20)
        ma50_val  = sma(daily, 50)
        ma40w_val = sma(weekly, 40)
        rsi_val   = rsi(daily)
        macd_val  = macd_line(daily)

        d20  = round((price / ma20_val  - 1) * 100, 1) if (ma20_val  and price) else None
        d50  = round((price / ma50_val  - 1) * 100, 1) if (ma50_val  and price) else None
        d200 = round((price / ma40w_val - 1) * 100, 1) if (ma40w_val and price) else None

        ma_cache[tkr] = {"ma20": ma20_val, "ma50": ma50_val, "ma200": ma40w_val,
                         "d20": d20, "d50": d50, "d200": d200}

        pos = positions.get(conid_str, {})
        qty = pos.get("qty", 0)
        weight = ((qty * price) / total_non_qqq * 100) if (total_non_qqq and not cfg["excl"]) else None

        html = apply_row_update(html, tkr, {
            "price": price, "ath": cfg["ath"], "pl_pct": pos.get("pnl_pct"),
            "qty": qty, "weight": weight,
            "ma20": ma20_val, "ma50": ma50_val, "ma40w": ma40w_val,
            "rsi": rsi_val, "macd": macd_val,
            "excl": cfg["excl"], "bucket": cfg["bucket"],
            "hard_stop": cfg.get("hard_stop"),
            "stop_label": cfg.get("stop_label", "MA40w"),
        })
        time.sleep(0.25)

    cash_pct = (cash_usd / total_non_qqq * 100) if total_non_qqq else 0
    html = update_cash_row(html, cash_usd, cash_pct)

    # ── Finnhub news update ───────────────────────────────────────────────────
    if not args.no_news and FINNHUB_API_KEY != "YOUR-KEY-HERE":
        print("\nFetching news from Finnhub...")
        today_str = date.today().strftime("%b %-d, %Y")

        # Macro section — general market headlines
        market_news = get_market_news(days=2)
        macro_html = build_macro_section(market_news, today_str)
        print(f"  Macro: {len(market_news)} headlines")

        # Per-ticker news cards
        ncards = []
        for tkr, cfg in TICKERS.items():
            symbol = cfg.get("finn")
            if not symbol:
                continue
            items = get_ticker_news(symbol, days=7)
            if items:
                ncards.append(build_ncard(tkr, items))
                print(f"  {tkr:6s}  {len(items)} article(s)")
            time.sleep(0.15)  # Finnhub free tier: 60 calls/min

        ncards_html = "\n".join(ncards)
        html = inject_news(html, macro_html, ncards_html)
        print(f"  News section updated with {len(ncards)} ticker cards")
    elif args.no_news:
        print("\nSkipping news (--no-news flag)")
    else:
        print("\nSkipping news (FINNHUB_API_KEY not set — edit the key at top of script)")

    # ── Save ──────────────────────────────────────────────────────────────────
    # Update stale MA badge in table header
    badge_date = date.today().strftime("%b %-d")
    html = update_stale_badge(html, badge_date)

    html = set_comment_block(html, "PRICE_STORE", json.dumps(price_store))
    html = set_comment_block(html, "MA_CACHE", json.dumps(ma_cache))
    html = set_update_date(html, str(date.today()))

    dashboard_path.write_text(html, encoding="utf-8")
    print(f"\n✅  Dashboard updated  →  {dashboard_path.resolve()}")
    print(f"    Cash  : ${cash_usd:,.0f}  ({cash_pct:.1f}%)")
    print(f"    Total : ${total_non_qqq:,.0f}  (ex-QQQ)")
    print(f"    Date  : {date.today()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
