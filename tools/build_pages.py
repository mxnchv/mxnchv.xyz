#!/usr/bin/env python3
"""Generate one static copy of index.html per section, so every section has its own address.

    python3 tools/build_pages.py

GitHub Pages serves mxnchv.xyz/lab from lab.html, mxnchv.xyz/branding from branding.html, etc.
Each copy is index.html with the section preselected (data-start) and its own title / share tags,
so it opens straight on that section. Also writes 404.html (unknown addresses show the home page).
Always edit index.html, then run this script: the generated files are overwritten.
"""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent.parent
SITE = 'https://mxnchv.xyz'
SECTIONS = ['branding', 'videogames', 'content', 'collabs', 'lab']
NOTE = '<!-- generated from index.html by tools/build_pages.py — do not edit by hand -->\n'


def page(src, name=None, base=False):
    out = src
    if name:
        out = out.replace('<html lang="en">', f'<html lang="en" data-start="{name}">', 1)
        out = re.sub(r'<title>.*?</title>', f'<title>{name} — mxnchv</title>', out, count=1)
        out = out.replace(f'href="{SITE}/"', f'href="{SITE}/{name}"', 1)                   # canonical
        out = out.replace(f'property="og:url" content="{SITE}/"', f'property="og:url" content="{SITE}/{name}"', 1)
        out = out.replace('property="og:title" content="mxnchv — audio design"',
                          f'property="og:title" content="{name} — mxnchv"', 1)
    if base:  # 404 can be served at any depth: resolve the site's files from the root
        out = out.replace('<head>', '<head>\n  <base href="/">', 1)
    return out.replace('<!DOCTYPE html>', '<!DOCTYPE html>\n' + NOTE, 1)


def main():
    src = (ROOT / 'index.html').read_text()
    assert '<html lang="en">' in src and '<!DOCTYPE html>' in src
    for name in SECTIONS:
        (ROOT / f'{name}.html').write_text(page(src, name))
    (ROOT / '404.html').write_text(page(src, base=True))
    print('wrote', ', '.join(f'{n}.html' for n in SECTIONS), 'and 404.html')


if __name__ == '__main__':
    main()
