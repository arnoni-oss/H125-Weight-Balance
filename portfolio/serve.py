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
    """Get the PC's local network IP address."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "localhost"


def main():
    folder = Path(__file__).parent
    os.chdir(folder)

    ip = local_ip()
    url_pc    = f"http://localhost:{PORT}/dashboard.html"
    url_phone = f"http://{ip}:{PORT}/dashboard.html"

    print()
    print("=" * 52)
    print("  Portfolio Dashboard — Web Server")
    print("=" * 52)
    print()
    print(f"  Open on this PC   →  {url_pc}")
    print()
    print(f"  Open on iPhone    →  {url_phone}")
    print(f"  (must be on same WiFi as this PC)")
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
