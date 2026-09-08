#!/usr/bin/env python3
"""
Makes a cover image for a project page: cover.py <folder-or-url> <out.jpg>

Takes a 1280x800 screenshot of the page (served locally when given a folder)
and saves it as a JPEG. Used at publish time so every project has a preview
on the parladesigns.com home page. Needs Playwright with Chromium.
"""
import http.server
import socketserver
import sys
import threading
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

WIDTH, HEIGHT, QUALITY = 1280, 800, 82


def serve(folder):
    handler = lambda *a, **k: http.server.SimpleHTTPRequestHandler(*a, directory=str(folder), **k)
    httpd = socketserver.TCPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, f"http://127.0.0.1:{httpd.server_address[1]}/"


def main(target, out):
    httpd = None
    url = target
    if not target.startswith("http"):
        httpd, url = serve(Path(target).resolve())
    png = Path(out).with_suffix(".png")
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": WIDTH, "height": HEIGHT}, device_scale_factor=1)
        page.goto(url, wait_until="networkidle", timeout=45_000)
        page.wait_for_timeout(1200)  # let web fonts settle
        page.screenshot(path=str(png), full_page=False)
        browser.close()
    if httpd:
        httpd.shutdown()
    Image.open(png).convert("RGB").save(out, "JPEG", quality=QUALITY, optimize=True, progressive=True)
    if png != Path(out):
        png.unlink()
    print(f"wrote {out} ({Path(out).stat().st_size // 1024} KB)")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
