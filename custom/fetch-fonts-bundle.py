#!/usr/bin/env python3
"""Rebuild custom/fonts-bundle from Google Fonts (woff2 subsets + fonts.css).

The bundle is a build artifact: 112 woff2 subsets plus the @font-face sheet that
apply-fonts.py installs into public/assets/fonts/. The binaries are deliberately
NOT kept in git (10 MB of third-party files); this script regenerates them.

Run:  python3 custom/fetch-fonts-bundle.py
Out:  custom/fonts-bundle/webfonts/*.woff2 + custom/fonts-bundle/fonts.css

Note: Google occasionally changes the subset list. The count check (112) is a
drift alarm, not a hard failure - re-run apply-fonts.py afterwards either way.
"""
import os
import re
import shutil
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
BUNDLE = os.path.join(HERE, "fonts-bundle")
WEBFONTS = os.path.join(BUNDLE, "webfonts")

# A modern browser UA is required: without it the css2 API answers with TTF.
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
CSS_URL = ("https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700;900"
           "&family=Oxanium:wght@400;500;600;700&family=Rajdhani:wght@500;600;700&display=swap")
EXPECTED_WOFF2 = 112


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def main():
    if os.path.isdir(WEBFONTS):
        shutil.rmtree(WEBFONTS)  # nuke-then-fetch: no stale subsets survive
    os.makedirs(WEBFONTS, exist_ok=True)

    css = get(CSS_URL).decode("utf-8")
    with open(os.path.join(BUNDLE, "fonts.css"), "w", encoding="utf-8") as f:
        f.write(css)

    urls = sorted(set(re.findall(r"url\((https://fonts\.gstatic\.com/[^)]+\.woff2)\)", css)))
    print("[fetch] %d woff2 subsets declared by fonts.css" % len(urls))
    for i, u in enumerate(urls, 1):
        name = u.rsplit("/", 1)[-1]
        with open(os.path.join(WEBFONTS, name), "wb") as f:
            f.write(get(u))
        if i % 20 == 0 or i == len(urls):
            print("[fetch] %d/%d" % (i, len(urls)))

    n = len([f for f in os.listdir(WEBFONTS) if f.endswith(".woff2")])
    print("[fetch] done: %d woff2 in %s" % (n, WEBFONTS))
    if n != EXPECTED_WOFF2:
        print("WARNING: expected %d woff2 - Google may have changed the subset list" % EXPECTED_WOFF2)
    return 0


if __name__ == "__main__":
    sys.exit(main())
