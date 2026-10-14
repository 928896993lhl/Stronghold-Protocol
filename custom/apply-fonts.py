#!/usr/bin/env python3
"""Self-host the Google Fonts request the stock install makes to fonts.googleapis.com.

In mainland China that request cost ~0.94 MB across 17 cross-border requests on every cold load
(1 CSS ~119 KB gzipped declaring 412 @font-face rules, plus ~16 woff2 subsets of Noto Sans SC).

This copies the bundle from custom/fonts-bundle into public/assets/fonts/ and swaps the
stylesheet href in index.html. Idempotent: safe to run again, and again after an official
update (which overwrites index.html because it is listed in MANIFEST.json).

Layouts (auto-detected, or force with STRONGHOLD_ROOT):
  server:  /opt/stronghold/custom/apply-fonts.py   ->  ROOT = /opt/stronghold/Stronghold-Protocol
  repo:    <clone>/custom/apply-fonts.py           ->  ROOT = <clone>

Run:   python3 custom/apply-fonts.py
Undo:  git checkout -- public/index.html                       (repo: the tag keeps the pristine copy)
       cp -a custom/base/public/index.html public/index.html   (server: first run saves the backup)

Note: the woff2 binaries are NOT kept in git (10 MB of third-party files). Rebuild them with
custom/fetch-fonts-bundle.py before the first run in a fresh checkout; the @font-face sheet
(fonts.css) itself is committed under custom/fonts-bundle/.
"""
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
CUSTOM = HERE
BUNDLE = os.path.join(CUSTOM, "fonts-bundle")
DEFAULT_ROOT = "/opt/stronghold/Stronghold-Protocol"


def resolve_root():
    env = os.environ.get("STRONGHOLD_ROOT")
    if env:
        return os.path.abspath(env)
    # repo layout: custom/ sits inside the project root
    if os.path.isdir(os.path.join(os.path.dirname(HERE), "public")):
        return os.path.dirname(HERE)
    return DEFAULT_ROOT


ROOT = resolve_root()
DEST = os.path.join(ROOT, "public", "assets", "fonts")
INDEX = os.path.join(ROOT, "public", "index.html")
BASE_INDEX = os.path.join(CUSTOM, "base", "public", "index.html")

GOOGLE = "https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700;900&family=Oxanium:wght@400;500;600;700&family=Rajdhani:wght@500;600;700&display=swap"
LOCAL = "/assets/fonts/fonts.css"

EXPECTED_FACES = 421
EXPECTED_WOFF2 = 112


def main():
    if not os.path.isdir(BUNDLE):
        print("FATAL: %s missing - fetch the bundle first (custom/fetch-fonts-bundle.py)" % BUNDLE)
        return 1

    # 1. Back up the pristine index.html once (skip inside a git checkout: the tag/upstream has it).
    if not os.path.exists(BASE_INDEX):
        if os.path.isdir(os.path.join(ROOT, ".git")):
            print("[fonts] git checkout detected - pristine index.html kept by git, no file backup")
        else:
            os.makedirs(os.path.dirname(BASE_INDEX), exist_ok=True)
            shutil.copy2(INDEX, BASE_INDEX)
            print("[fonts] saved pristine index.html -> %s" % BASE_INDEX)

    # 2. Art payload. Nuke-then-copy so a re-run cannot leave stale files behind.
    os.makedirs(DEST, exist_ok=True)
    for name in os.listdir(DEST):
        p = os.path.join(DEST, name)
        shutil.rmtree(p) if os.path.isdir(p) else os.remove(p)
    for name in os.listdir(BUNDLE):
        src = os.path.join(BUNDLE, name)
        dst = os.path.join(DEST, name)
        if os.path.isdir(src):
            shutil.copytree(src, dst)
        else:
            shutil.copy2(src, dst)
    wf = os.path.join(DEST, "webfonts")
    if os.path.isdir(wf):
        nwoff = len([f for f in os.listdir(wf) if f.endswith(".woff2")])
        faces = open(os.path.join(DEST, "fonts.css"), encoding="utf-8").read().count("@font-face")
        print("[fonts] %s woff2 subsets, %d @font-face rules, ---> %s" % (nwoff, faces, DEST))
        if nwoff != EXPECTED_WOFF2 or faces != EXPECTED_FACES:
            print("WARNING: expected %d woff2 / %d faces" % (EXPECTED_WOFF2, EXPECTED_FACES))
    else:
        print("[fonts] webfonts/ absent - run custom/fetch-fonts-bundle.py to download the woff2 subsets")

    # 3. index.html: point the stylesheet at the local sheet and drop both preconnects.
    html = open(INDEX, encoding="utf-8").read()
    if LOCAL in html and ('href="' + GOOGLE + '"') not in html:
        print("[fonts] index.html already local - nothing to do")
        return 0

    before = html
    html = html.replace(GOOGLE, LOCAL)
    html = html.replace('  <link rel="preconnect" href="https://fonts.googleapis.com" />\n', "")
    html = html.replace('  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />\n', "")
    html = html.replace(
        "  <!-- Web fonts: never render-blocking (LAN/offline play must still start); system fallbacks in theme.css. -->",
        "  <!-- Web fonts: never render-blocking (LAN/offline play must still start); system fallbacks in theme.css.\n"
        "       Self-hosted since 2026-10-09 (see /opt/stronghold/custom/apply-fonts.py): the original\n"
        "       fonts.googleapis.com request cost ~0.94 MB over 17 cross-border requests per cold load. -->",
    )
    if html == before:
        print("FATAL: could not rewrite index.html - layout changed in an update?")
        return 1
    # newline="\n": never translate to CRLF on Windows checkouts (upstream files are LF).
    open(INDEX, "w", encoding="utf-8", newline="\n").write(html)
    left = html.count("fonts.googleapis.com") + html.count("fonts.gstatic.com")
    print("[fonts] index.html: href -> %s, %d Google references left" % (LOCAL, left))
    return 0


if __name__ == "__main__":
    sys.exit(main())
