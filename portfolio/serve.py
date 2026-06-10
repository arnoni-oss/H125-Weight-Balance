#!/usr/bin/env python3
"""
Portfolio dashboard web server.
Start this once (or at Windows boot) — then a single URL does everything:

  http://<tailscale-ip>:8080/update   ← tap this on iPhone or PC to refresh
  http://<tailscale-ip>:8080/dashboard.html  ← view only (no refresh)

Add to Windows startup:  put a shortcut to serve_startup.vbs in
  %APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
"""

import http.server
import os
import socket
import socketserver
import subprocess
import webbrowser
from pathlib import Path

PORT = 8080
SCRIPT_DIR = Path(__file__).parent


def local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return None


def tailscale_ip():
    import subprocess as sp
    try:
        out = sp.check_output(
            ["tailscale", "ip", "-4"],
            stderr=sp.DEVNULL,
            timeout=3,
        ).decode().strip()
        if out:
            return out
    except Exception:
        pass
    try:
        import ipaddress
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if ipaddress.ip_address(ip) in ipaddress.ip_network("100.64.0.0/10"):
                return ip
    except Exception:
        pass
    return None


_UPDATE_HTML = """\
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Updating dashboard…</title>
<style>
  body {{ background:#0f172a; color:#94a3b8; font-family:system-ui,sans-serif;
         display:flex; flex-direction:column; align-items:center;
         justify-content:center; height:100dvh; margin:0; gap:1.2rem; }}
  h1   {{ color:#f1f5f9; font-size:1.3rem; margin:0; }}
  pre  {{ background:#1e293b; padding:1rem 1.4rem; border-radius:.6rem;
          font-size:.8rem; color:#f87171; max-width:90vw; white-space:pre-wrap; }}
  a    {{ color:#60a5fa; }}
  .spin {{ width:2.5rem; height:2.5rem; border:3px solid #334155;
           border-top-color:#60a5fa; border-radius:50%;
           animation:spin .8s linear infinite; }}
  @keyframes spin {{ to {{ transform:rotate(360deg) }} }}
  {extra_css}
</style>
{head_extra}
</head>
<body>
{body}
</body>
</html>
"""

_UPDATING_BODY = """\
<div class="spin"></div>
<h1>Updating dashboard…</h1>
<p style="font-size:.85rem">This takes ~15 seconds. Don't close the tab.</p>
"""

_OK_BODY = """\
<h1 style="color:#4ade80">✓ Update complete</h1>
<p style="font-size:.85rem">Redirecting to dashboard…</p>
"""

_ERR_BODY = """\
<h1>Update failed</h1>
<pre>{output}</pre>
{hint}
<p><a href="/dashboard.html">← Open last saved dashboard</a></p>
"""

_IBKR_HINT = """\
<p style="font-size:.85rem; color:#fbbf24">
  IBKR Gateway isn't running or you're not logged in.<br>
  Start the gateway, log in at
  <a href="https://localhost:5000" target="_blank">localhost:5000</a>,
  then try again.
</p>
"""


class DashboardHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path in ("/update", "/update/"):
            self._handle_update()
        else:
            super().do_GET()

    def _handle_update(self):
        # Send a "Updating…" page that polls /update_status via SSE-style refresh
        # Simpler: run synchronously, page shows loading spinner while waiting
        self._send_html(
            _UPDATE_HTML.format(
                extra_css="",
                head_extra="",
                body=_UPDATING_BODY,
            )
        )
        self.wfile.flush()

        # Run the update script
        script = SCRIPT_DIR / "update_dashboard.py"
        try:
            result = subprocess.run(
                ["python", str(script)],
                capture_output=True,
                text=True,
                timeout=90,
                cwd=str(SCRIPT_DIR),
            )
            success = result.returncode == 0
            output = (result.stdout + result.stderr).strip()
        except subprocess.TimeoutExpired:
            success = False
            output = "Update timed out (90 s). Is IBKR Gateway slow to respond?"
        except Exception as e:
            success = False
            output = str(e)

        if success:
            # Auto-redirect to fresh dashboard after 1.5 s
            self._send_html(
                _UPDATE_HTML.format(
                    extra_css="",
                    head_extra='<meta http-equiv="refresh" content="1.5;url=/dashboard.html">',
                    body=_OK_BODY,
                )
            )
        else:
            ibkr_down = "Cannot reach IBKR" in output or "not logged" in output.lower()
            hint = _IBKR_HINT if ibkr_down else ""
            self._send_html(
                _UPDATE_HTML.format(
                    extra_css="",
                    head_extra="",
                    body=_ERR_BODY.format(output=output, hint=hint),
                )
            )

    def _send_html(self, html: str):
        data = html.encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *a):
        pass  # silence per-request logs


def main():
    os.chdir(SCRIPT_DIR)

    wifi_ip = local_ip()
    ts_ip = tailscale_ip()

    def url(ip, path="update"):
        return f"http://{ip}:{PORT}/{path}"

    print()
    print("=" * 58)
    print("  Portfolio Dashboard — Server ready")
    print("=" * 58)
    print()
    print(f"  This PC  →  {url('localhost')}")
    print()
    if wifi_ip:
        print(f"  iPhone (home WiFi) →  {url(wifi_ip)}")
        print()
    if ts_ip:
        print(f"  iPhone (anywhere)  →  {url(ts_ip)}   ← Tailscale ✓")
        print()
    elif not wifi_ip:
        print("  No network address found. Check WiFi / Tailscale.")
        print()

    print("  Tap the /update URL to refresh the dashboard.")
    print("  Tap /dashboard.html to view without refreshing.")
    print()
    print("  Press Ctrl+C to stop")
    print()

    webbrowser.open(f"http://localhost:{PORT}/dashboard.html")

    with socketserver.TCPServer(("", PORT), DashboardHandler) as httpd:
        httpd.allow_reuse_address = True
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")


if __name__ == "__main__":
    main()
