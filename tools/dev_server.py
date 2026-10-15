#!/usr/bin/env python3
"""Static dev server with caching disabled (python3 tools/dev_server.py [port])."""
import http.server
import sys


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8787
http.server.ThreadingHTTPServer(("", port), NoCache).serve_forever()
