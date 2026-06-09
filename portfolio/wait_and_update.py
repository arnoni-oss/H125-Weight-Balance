#!/usr/bin/env python3
"""
Polls IBKR Gateway until authenticated, then runs the full dashboard update
and opens the result in the default browser. Called by launch.bat.
"""

import argparse
import subprocess
import sys
import time
import webbrowser
from pathlib import Path

import requests
import warnings
warnings.filterwarnings("ignore", message="Unverified HTTPS request")

GATEWAY = "https://localhost:5000/v1/api"
POLL_INTERVAL = 3   # seconds between auth checks
MAX_WAIT = 300       # give up after 5 minutes


def is_authenticated():
    try:
        r = requests.get(f"{GATEWAY}/iserver/auth/status", verify=False, timeout=5)
        data = r.json()
        return data.get("authenticated", False)
    except Exception:
        return False


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--file", default="dashboard.html")
    args = p.parse_args()

    dashboard_path = Path(args.file).resolve()

    print()
    print("Waiting for IBKR login", end="", flush=True)
    elapsed = 0
    while elapsed < MAX_WAIT:
        if is_authenticated():
            break
        print(".", end="", flush=True)
        time.sleep(POLL_INTERVAL)
        elapsed += POLL_INTERVAL
    else:
        print("\n\nTimed out waiting for login. Please try again.")
        input("Press Enter to close...")
        return 1

    print("\n\nLogged in ✓  Running update...\n")

    # Run the full update
    result = subprocess.run(
        [sys.executable, str(Path(__file__).parent / "update_dashboard.py"),
         "--file", str(dashboard_path)],
        cwd=str(Path(__file__).parent),
    )

    if result.returncode != 0:
        print("\nUpdate failed. Check errors above.")
        input("Press Enter to close...")
        return 1

    # Open dashboard in browser
    print(f"\nOpening dashboard...")
    webbrowser.open(dashboard_path.as_uri())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
