# Portfolio Dashboard — Session Context
**Last updated: Jun 10, 2026**
Paste this at the start of a new Claude Code session along with your `dashboard.html` file.

---

## What We Built

A self-updating portfolio dashboard system:
- `dashboard.html` — single-file dark-theme HTML dashboard
- `update_dashboard.py` — pulls live data from IBKR + news from Finnhub, rewrites the HTML
- `wait_and_update.py` — polls IBKR auth status, runs update when logged in, opens dashboard
- `launch.bat` — one double-click: starts IBKR gateway, opens login, auto-detects login, updates, opens browser
- `serve.py` — local WiFi web server so iPhone can open the dashboard (port 8080)
- `requirements.txt` — just `requests`

All files live in the `portfolio/` folder of the repo `arnoni-oss/H125-Weight-Balance`, branch `claude/sleepy-turing-w8bi9o`.

---

## How to Use

### Daily update (PC)
1. Double-click `launch.bat`
2. Log in at `https://localhost:5000` (IBKR gateway)
3. Dashboard updates automatically and opens in browser

### Open on iPhone (home WiFi only — Tailscale not yet set up)
- After `launch.bat` runs, also run `serve.py`
- It prints a URL like `http://192.168.x.x:8080/dashboard.html`
- Bookmark that on iPhone

### Tailscale (TODO — not done yet)
- User was about to install Tailscale on PC + iPhone for anywhere access
- Once installed: update `serve.py` to detect Tailscale IP and print it
- **Next session: say "let's finish Tailscale setup"**

---

## Dashboard Rules

**Weight basis:** All weights are % of non-QQQ portfolio (cash + all stocks except QQQ = 100%). QQQ shown separately as "LT core · excl. from weights."

**Column order:** Ticker · Role · Qty · Weight · Price/ATH · P/L · MA20 · MA50 · MA40w · Stop/Backstop · RSI · MACD · Notes

**MA definitions:**
- MA20 = 20-day SMA (daily closes)
- MA50 = 50-day SMA (daily closes)
- MA40w = 40-week SMA (weekly closes) — long-term backstop

**Stop/Backstop column:**
- Green = >8% above stop
- Orange = within 8% of stop
- Red = stop broken

**Row highlight:**
- Orange row = within 8% of stop (risk-warn)
- Red row = stop broken (risk-breach)

**What the script updates automatically:**
- Prices, ATH %, P/L, qty, weights
- MA20, MA50, MA40w + % distance
- Stop/Backstop % and row color
- RSI, MACD
- Cash balance
- MA freshness badge in header
- News section (via Finnhub free API — set `FINNHUB_API_KEY` at top of script)

**What stays manual (never auto-updated):**
- News macro commentary
- Orders panel
- Trade Journal
- Event countdown bar
- Playbook rules cards

---

## Ticker Config (in update_dashboard.py)

| Ticker | ConID | Exchange | ATH | Hard Stop | Stop Label |
|--------|-------|----------|-----|-----------|------------|
| QQQ | 320227571 | ARCA | 749 | — | MA40w |
| NBIS | 88819736 | NASDAQ | 279 | — | trim→10% |
| EUV | 880200639 | ARCA | 30 | — | no backstop |
| DRAM | 870556708 | NASDAQ | 70 | — | MA40w |
| ANET | 740948854 | NYSE | 180 | — | MA40w |
| SMH | 229725622 | ARCA | 643 | — | MA40w |
| QCOM | 273544 | NASDAQ | 260 | — | MA40w |
| MRVL | 483492393 | NASDAQ | 324 | — | MA40w |
| CRDO | 541265127 | NASDAQ | 246 | — | MA40w |
| IBM | 8314 | NYSE | 332 | — | MA40w |
| CLS | 695996615 | NYSE | 474 | — | MA40w |
| GOOGL | 208813719 | NASDAQ | 409 | — | MA40w |
| HBMX | 888128348 | ARCA | 28 | — | no backstop |
| QNTM | 787272463 | NASDAQ | 35 | $23 | stop $23 |
| IONQ | 517593749 | NYSE | 85 | $50 | stop $50 |
| RDW | 512000171 | NYSE | 27 | $18.90 | stop $18.90 |
| NASA | 869314618 | ARCA | 43 | $27 | stop $27 |

**To add a new position:** add a row to `TICKERS` dict in `update_dashboard.py` and add the row manually to `dashboard.html`.

**To update an ATH:** edit the `ath` value in `TICKERS` when a new high is set.

---

## API Keys (edit at top of update_dashboard.py)

```python
FINNHUB_API_KEY = "YOUR-KEY-HERE"   # finnhub.io — free signup
```

Anthropic API was considered and dropped — not needed, Finnhub covers news for free.

---

## IBKR Gateway Setup (Windows)

Gateway location: `C:\Users\97252\Downloads\clientportal.gw`
- Start: open cmd in that folder → `bin\run.bat root\conf.yaml`
- Login: browser opens at `https://localhost:5000`
- Java is required — install from java.com if not present

Gateway path is hardcoded in `launch.bat` — update the `GATEWAY=` line if you move it.

---

## Repo Info

- Repo: `arnoni-oss/H125-Weight-Balance`
- Branch: `claude/sleepy-turing-w8bi9o`
- Portfolio files: `portfolio/` folder

---

## Pending / Next Session TODOs

1. **Tailscale setup** — install on PC + iPhone, then say "finish Tailscale setup"
2. **Finnhub API key** — sign up at finnhub.io, paste key into `update_dashboard.py`
3. **Test full run** — run `launch.bat` end-to-end for the first time
4. **RDW** — stop was broken Jun 9 ($18.90), consider closing position
