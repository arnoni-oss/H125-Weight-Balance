# Portfolio Dashboard — Setup Guide

## First-time setup (do this once)

### Step 1 — Install Python
Go to **https://python.org** → Downloads → install Python 3.  
**Important:** tick the box that says **"Add Python to PATH"** during install.

### Step 2 — Install IBKR Client Portal Gateway
This is a small program from IBKR that lets scripts talk to your account.

1. Log in to **https://interactivebrokers.com**
2. Go to **Trading → IBKR APIs → Client Portal Web API**
3. Download the **Client Portal Gateway** (a `.zip` file)
4. Unzip it anywhere on your PC (e.g. `C:\ibkr-gateway\`)

### Step 3 — Put your dashboard file here
Copy your `dashboard.html` into the same folder as `run.bat`  
(the `portfolio` folder in this repo).

---

## Every time you want to update the dashboard

1. **Start the IBKR Gateway**
   - Open a Command Prompt in the unzipped gateway folder
   - Run: `bin\run.bat root\conf.yaml`
   - A browser will open — log in with your IBKR credentials

2. **Double-click `run.bat`** in the `portfolio` folder

   The script will:
   - Pull live prices from your account
   - Recalculate all MAs, RSI, and MACD
   - Rewrite `dashboard.html` with fresh data
   - Open it in your browser automatically

That's it.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Python is not installed` | Install Python from python.org — tick "Add to PATH" |
| `Gateway not detected` | Start the gateway first, then log in at https://localhost:5000 |
| `pip` errors | Run `python -m pip install requests` manually in a terminal |
| Prices show old data | The gateway session expired — restart it and log in again |

---

## Folder layout

```
portfolio/
  dashboard.html        ← your dashboard (put it here)
  run.bat               ← double-click this to update
  update_dashboard.py   ← the updater script
  requirements.txt      ← Python dependencies (auto-installed by run.bat)
```
