#!/usr/bin/env python
"""Simple HTTP server for the Incentives Wallet app.

Run: py -V:Astral/CPython3.11.15 serve.py
Open: http://localhost:8545
"""

import http.server
import socketserver
import os
import webbrowser
import threading

PORT = 8545
DIRECTORY = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def log_message(self, format, *args):
        pass  # Suppress logs


def main():
    os.chdir(DIRECTORY)
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"Incentives Wallet running at http://localhost:{PORT}")
        print("Press Ctrl+C to stop")
        webbrowser.open(f"http://localhost:{PORT}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down...")


if __name__ == "__main__":
    main()
