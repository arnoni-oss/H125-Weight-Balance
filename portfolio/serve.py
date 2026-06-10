#!/usr/bin/env python3
"""
Serves the portfolio folder over HTTP on your local WiFi network.
Run this once — then open the printed URL on any device on the same WiFi.
"""

import http.server
import os
import socket
import socketserver
import sys
import webbrowser
from pathlib import Path

PORT = 8080


def local_ip():
    """Get the PC's local WiFi IP address."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return None


def tailscale_ip():
    """Return the Tailscale IP if Tailscale is running, else None."""
    import subprocess
    # Ask tailscale directly — most reliable on Windows
    try:
        out = subprocess.check_output(
            ["tailscale", "ip", "-4"],
            stderr=subprocess.DEVNULL,
            timeout=3,
        ).decode().strip()
        if out:
            return out
    except Exception:
        pass
    # Fallback: scan interface IPs for 100.x.x.x (Tailscale CGNAT range)
    try:
        import ipaddress
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if ipaddress.ip_address(ip) in ipaddress.ip_network("100.64.0.0/10"):
                return ip
    except Exception:
        pass
    return None


def main():
    folder = Path(__file__).parent
    os.chdir(folder)

    wifi_ip = local_ip()
    ts_ip   = tailscale_ip()

    url_pc   = f"http://localhost:{PORT}/dashboard.html"
    url_wifi = f"http://{wifi_ip}:{PORT}/dashboard.html" if wifi_ip else None
    url_ts   = f"http://{ts_ip}:{PORT}/dashboard.html"  if ts_ip   else None

    print()
    print("=" * 56)
    print("  Portfolio Dashboard — Web Server")
    print("=" * 56)
    print()
    print(f"  Open on this PC   →  {url_pc}")
    print()
    if url_wifi:
        print(f"  iPhone (home WiFi) →  {url_wifi}")
        print(f"  (must be on same WiFi as this PC)")
        print()
    if url_ts:
        print(f"  iPhone (anywhere)  →  {url_ts}")
        print(f"  (via Tailscale — works on any network)")
        print()
    elif not url_wifi:
        print("  No network address found — check WiFi or Tailscale.")
        print()
    print("  Press Ctrl+C to stop the server")
    print()

    # Open in Chrome automatically
    webbrowser.open(url_pc)

    handler = http.server.SimpleHTTPRequestHandler
    handler.log_message = lambda *a: None  # silence request logs

    with socketserver.TCPServer(("", PORT), handler) as httpd:
        httpd.allow_reuse_address = True
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")


if __name__ == "__main__":
    main()
