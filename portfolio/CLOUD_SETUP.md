# Cloud Dashboard — Anywhere Access (PC off), Free + Private

This sets up **one bookmark** on your iPhone that always shows a fresh dashboard,
even when your PC is off — using free Yahoo data on a schedule, hosted privately
behind a login.

```
GitHub Action (every 15 min, Yahoo data)
   → commits dashboard.html to a PRIVATE repo
       → Cloudflare Pages auto-publishes it
           → Cloudflare Access locks it behind YOUR email login
               → you open one URL on iPhone, anywhere
```

**Real-time vs delayed:** This cloud copy is ~15 min delayed (Yahoo). For true
real-time, use the IBKR `/update` URL at home (PC on). Same dashboard, two feeds.

---

## Part 1 — Create the private repo

1. github.com → **New repository** → name it e.g. `portfolio-private` → set
   **Private** → Create.
2. Into that repo, copy these files from `portfolio/` here:
   - `update_dashboard.py`
   - `dashboard.html`   ← your real one (this is fine; the repo is private)
   - `holdings.json`    ← copy from `holdings.example.json` and fill in real qty/avg_cost/cash
   - `requirements.txt`
   - move `cloud/portfolio-update.yml` → `.github/workflows/portfolio-update.yml`
   - **Do NOT** copy the `.gitignore` from here (it blocks dashboard.html/holdings.json — you WANT those in the private repo).
3. Commit and push.

### Fill in holdings.json
Yahoo can't see your IBKR positions, so enter them once (update when you trade):
```json
{ "cash_usd": 12345,
  "positions": { "IBM": { "qty": 100, "avg_cost": 240.50 }, ... } }
```
> **QNTM symbol mismatch:** Yahoo's `QNTM` is a different company (~$3.89, not your
> quantum holding). Find the correct Yahoo symbol for your QNTM and add a `yahoo`
> override in `update_dashboard.py`'s `TICKERS`, e.g.
> `"QNTM": { ..., "yahoo": "CORRECT_SYMBOL" }`.

### (Optional) news in the cloud
Repo **Settings → Secrets and variables → Actions → New secret**:
name `FINNHUB_API_KEY`, value = your finnhub.io key. Without it, news is skipped.

### Test the Action
Repo **Actions** tab → "Update portfolio dashboard" → **Run workflow**. It should
fetch prices, commit an updated `dashboard.html`, and go green.

---

## Part 2 — Cloudflare Pages (free hosting)

1. Sign up at **dash.cloudflare.com** (free).
2. **Workers & Pages → Create → Pages → Connect to Git** → authorize GitHub →
   pick `portfolio-private`.
3. Build settings:
   - Framework preset: **None**
   - Build command: *(leave empty)*
   - Build output directory: `/`  (root)
4. **Save and Deploy.** You get a URL like `https://portfolio-private.pages.dev`.
5. Every time the Action commits, Cloudflare auto-redeploys within ~1 min.

Your dashboard is at `https://portfolio-private.pages.dev/dashboard.html`.
> Want the bare domain to work? Add a file `_redirects` to the repo root with:
> `/   /dashboard.html   302`

---

## Part 3 — Cloudflare Access (lock it to YOU)

Right now the `.pages.dev` URL is public-but-unguessable. Lock it down:

1. Cloudflare dash → **Zero Trust** (free plan, up to 50 users).
2. **Access → Applications → Add an application → Self-hosted.**
3. Application domain: your `portfolio-private.pages.dev`.
4. Add a policy: Action **Allow**, rule **Emails** = your email (`arnonhamou@gmail.com`).
5. Save. Now opening the URL prompts a one-time email code; only you get in.
   iPhone stays logged in after the first time.

---

## Part 4 — iPhone bookmark

1. Open `https://portfolio-private.pages.dev/dashboard.html` in Safari.
2. Log in via the email code (first time only).
3. Share → **Add to Home Screen.** Done — one tap, anywhere, PC off.

---

## Daily reality

| Situation | What you do | Freshness |
|-----------|-------------|-----------|
| Home, PC on, want real-time | `launch.bat` → log in → tap `/update` | live (IBKR) |
| Anywhere, PC off | tap the Cloudflare home-screen icon | ≤15 min (Yahoo) |
| After a trade | edit `holdings.json` in the private repo (qty/cash) | next cron run |

The cron only runs during US market hours (Mon–Fri). Off-hours it just shows the
last close, which is correct.
