#!/usr/bin/env python3
"""
Locks the "Current projects" part of parladesigns.com behind a code.

    python3 scripts/lock.py _private/current current --code 6789

Reads  _private/current/<slug>/index.html   (the real pages — never uploaded)
Writes current/index.html                   (locked list of the pages)
       current/<slug>/index.html            (each page, locked)
       current/parla.json                   (keeps /current/ off the public home page)

How the lock works: every page is encrypted (AES-GCM) with a key derived from the
code (PBKDF2, SHA-256). The uploaded file holds only the scrambled bytes plus a small
page that asks for the code and unscrambles in the browser — the readable HTML never
reaches GitHub, which matters because the repository is public. Once a visitor has
typed the code, it is remembered for the browser tab so the other pages open at once.

Optional per page: _private/current/<slug>/parla.json with "title", "description",
"order" (1 = first) and/or "cover" (a jpg/png in the same folder, embedded in the list).
The code itself is read from --code, or from _private/current/CODE.txt.

Needs: python3 with the "cryptography" package (pip install cryptography).
"""
import argparse
import base64
import html as html_mod
import json
import os
import re
import sys
from pathlib import Path

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

ITERATIONS = 300_000
SKIP = {"index.html", "CODE.txt", ".salt", "README.md", "README.txt"}

WORDMARK = """<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <symbol id="parla" viewBox="8 4 203 51">
    <path d="M10.76,18.41h14.05c7.25,0,11.3,3.75,11.3,9.9s-4.05,10-11.3,10h-10.3v15.1h-3.75V18.41ZM24.71,34.81c4.85,0,7.55-2.35,7.55-6.5s-2.7-6.4-7.55-6.4h-10.2v12.9h10.2Z"/>
    <path d="M68.98,18.41h4.95l3.71,35h-4.1l-1.07-10.9h-15.9l-7.33,10.9h-4.1l23.84-35ZM72.15,39.11l-1.69-17.3-11.61,17.3h13.3Z"/>
    <path d="M96.77,18.41h14.55c7.25,0,11.3,3.65,11.3,9.65s-4.05,9.75-11.3,9.75h-.3l12.6,15.6h-4.8l-12.6-15.65h-5.7v15.65h-3.75V18.41ZM111.32,34.31c4.8,0,7.45-2.25,7.45-6.25s-2.65-6.15-7.45-6.15h-10.8v12.4h10.8Z"/>
    <path d="M140.42,18.41h3.75v31.5h16.95v3.5h-20.7V18.41Z"/>
    <path d="M179.9,18.41h4.95l23.79,35h-4.1l-7.33-10.9h-15.9l-1.07,10.9h-4.1l3.76-35ZM194.94,39.11l-11.61-17.3-1.69,17.3h13.3Z"/>
    <rect x="173.63" y="5.93" width="29.4" height="2.78"/>
  </symbol>
</svg>"""

LOGO = '<svg class="logo" viewBox="0 0 203 51" role="img" aria-label="Parla"><use href="#parla"/></svg>'

# ---------------------------------------------------------------- lock screen
SHELL = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Current — Parla Designs</title>
<meta name="robots" content="noindex, nofollow">
<link rel="icon" type="image/png" sizes="64x64" href="/favicon.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300&family=Outfit:wght@400;500&display=swap">
<link rel="stylesheet" href="/assets/site.css">
<style>
  .gate{padding:132px var(--gutter) 120px}
  .gate > *{max-width:560px}
  .gate h1{font-family:var(--serif); font-weight:300; font-size:clamp(44px,5.6vw,66px); line-height:1; margin:0 0 20px; color:var(--ink)}
  .gate .lede{font-size:clamp(22px,2.2vw,27px); color:var(--ink-2); font-style:normal; max-width:none; margin:0 0 40px}
  .gate form{display:flex; gap:12px; align-items:stretch; max-width:380px}
  .gate input{
    flex:1; min-width:0; font:inherit; font-size:22px; letter-spacing:.28em; padding:12px 16px;
    border:1px solid var(--line-2); border-radius:2px; background:#fff; color:var(--ink); outline:none;
  }
  .gate input:focus{border-color:var(--tangerine)}
  .gate button{
    font:inherit; font-size:12px; font-weight:500; letter-spacing:.11em; text-transform:uppercase;
    padding:0 22px; border:1px solid var(--aubergine); border-radius:2px; background:var(--aubergine); color:#fff; cursor:pointer;
  }
  .gate button:hover{background:var(--tangerine); border-color:var(--tangerine)}
  .gate button:disabled{opacity:.55; cursor:default}
  .gate .err{min-height:1.7em; margin:14px 0 0; color:var(--tangerine)}
  .gate .fine{margin:40px 0 0; color:var(--muted); font-size:14px}
  .gate.shake form{animation:shake .4s}
  @keyframes shake{20%{transform:translateX(-6px)}40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(4px)}}
  noscript p{padding:60px var(--gutter)}
</style>
</head>
<body>
__WORDMARK__
<header class="mast">
  <div class="wrap">
    <a href="/" aria-label="Parla — home">__LOGO__</a>
    <nav>
      <a href="/designs/" aria-current="page">Designs</a>
      <a href="/moves/">Moves</a>
      <a href="/about/">About</a>
    </nav>
  </div>
</header>
<nav class="subnav" aria-label="Designs">
  <div class="wrap">
    <a href="/designs/">Overview</a>
    <a href="/spaces/">Spaces</a>
    <a href="/designs/#apps">Apps &amp; tools</a>
    <a href="/current/" aria-current="page">Current<span class="lock-ico">●</span></a>
  </div>
</nav>
<main>
  <section class="wrap gate" id="gate" hidden>
    <h1>Current projects</h1>
    <p class="lede">This part of the site is private.</p>
    <form id="form" autocomplete="off">
      <label class="sr" for="code">Code</label>
      <input id="code" name="code" type="password" inputmode="numeric" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Code" aria-describedby="err">
      <button type="submit" id="go">Open</button>
    </form>
    <p class="err" id="err" role="alert"></p>
    <p class="fine">Ask Corina for the code if you don't have it.</p>
  </section>
  <noscript><p>This page needs JavaScript to open.</p></noscript>
</main>
<footer>
  <div class="wrap">
    __LOGO__
    <div class="right"><span class="label">© <span id="year"></span> Parla</span><span class="label">parladesigns.com</span></div>
  </div>
</footer>
<script id="locked" type="application/json">__PAYLOAD__</script>
<script>
(async function () {
  document.getElementById('year').textContent = new Date().getFullYear();
  var data = JSON.parse(document.getElementById('locked').textContent);
  var b64 = function (s) { return Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); }); };
  var salt = b64(data.salt), iv = b64(data.iv), ct = b64(data.ct);
  var cacheKey = 'parla-lock:' + data.salt;
  var gate = document.getElementById('gate'), form = document.getElementById('form'),
      input = document.getElementById('code'), err = document.getElementById('err'), go = document.getElementById('go');

  async function keyFromCode(code) {
    var base = await crypto.subtle.importKey('raw', new TextEncoder().encode(code), 'PBKDF2', false, ['deriveBits']);
    var bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt, iterations: data.iter }, base, 256);
    return new Uint8Array(bits);
  }
  async function open(raw) {
    var key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['decrypt']);
    var plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, ct);   // throws if the code is wrong
    return new TextDecoder().decode(plain);
  }
  async function show(html) {
    // document.open() is ignored while the page is still being parsed, so wait until it is done
    if (document.readyState === 'loading') await new Promise(function (r) { document.addEventListener('DOMContentLoaded', r, { once: true }); });
    await new Promise(function (r) { setTimeout(r, 0); });
    document.open(); document.write(html); document.close();
  }

  if (!(window.crypto && crypto.subtle)) { gate.hidden = false; err.textContent = 'This browser cannot open the page (it needs a secure https connection).'; form.hidden = true; return; }

  if (/(^|[?&])lock(&|$)/.test(location.search)) {        // the "Lock" link in the footer of the list
    try { Object.keys(sessionStorage).forEach(function (k) { if (k.indexOf('parla-lock:') === 0) sessionStorage.removeItem(k); }); } catch (_) {}
    try { history.replaceState(null, '', location.pathname); } catch (_) {}
  }
  try {
    var cached = sessionStorage.getItem(cacheKey);
    if (cached) { await show(await open(b64(cached))); return; }
  } catch (e) { try { sessionStorage.removeItem(cacheKey); } catch (_) {} }

  gate.hidden = false; input.focus();
  form.addEventListener('submit', async function (ev) {
    ev.preventDefault(); err.textContent = ''; go.disabled = true; gate.classList.remove('shake');
    try {
      var raw = await keyFromCode(input.value.trim());
      var html = await open(raw);
      try { sessionStorage.setItem(cacheKey, btoa(String.fromCharCode.apply(null, raw))); } catch (_) {}
      await show(html);
    } catch (e) {
      err.textContent = "That's not it — try again.";
      gate.classList.add('shake'); input.select(); go.disabled = false;
    }
  });
})();
</script>
</body>
</html>
"""

# ------------------------------------------------------- the (locked) list page
INDEX = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Current projects — Parla Designs</title>
<meta name="robots" content="noindex, nofollow">
<link rel="icon" type="image/png" sizes="64x64" href="/favicon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300&family=Outfit:wght@400;500&display=swap">
<link rel="stylesheet" href="/assets/site.css">
<style>
  .intro{padding:104px var(--gutter) 72px}
  .intro h1{font-family:var(--serif); font-weight:300; font-size:clamp(44px,5.6vw,66px); line-height:1; margin:0 0 18px; color:var(--ink)}
  .intro .lede{font-size:clamp(22px,2.2vw,27px); color:var(--ink-2); font-style:italic; margin:0}
  .card .placeholder{aspect-ratio:16/10}
  .lock{font-size:12px; letter-spacing:.11em; text-transform:uppercase; color:var(--muted); border-bottom:1px solid var(--line-2); padding-bottom:2px}
  .lock:hover{color:var(--tangerine); border-color:var(--tangerine)}
</style>
</head>
<body>
__WORDMARK__
<header class="mast">
  <div class="wrap">
    <a href="/" aria-label="Parla — home">__LOGO__</a>
    <nav>
      <a href="/designs/" aria-current="page">Designs</a>
      <a href="/moves/">Moves</a>
      <a href="/about/">About</a>
    </nav>
  </div>
</header>
<nav class="subnav" aria-label="Designs">
  <div class="wrap">
    <a href="/designs/">Overview</a>
    <a href="/spaces/">Spaces</a>
    <a href="/designs/#apps">Apps &amp; tools</a>
    <a href="/current/" aria-current="page">Current<span class="lock-ico">●</span></a>
  </div>
</nav>
<main>
  <section class="wrap intro">
    <h1>Current projects</h1>
    <p class="lede">work in progress.</p>
  </section>
  <section class="wrap">
    <div class="grid">
__CARDS__
    </div>
  </section>
</main>
<footer>
  <div class="wrap">
    __LOGO__
    <div class="right"><span class="label">© <span id="year"></span> Parla</span><a class="lock" href="/current/?lock">Lock</a></div>
  </div>
</footer>
<script>document.getElementById('year').textContent = new Date().getFullYear();</script>
</body>
</html>
"""

CARD = """      <a class="card" href="/current/{slug}/">
        {visual}
        <div class="body">
          <h3>{title}</h3>
          {desc}
          <div class="meta"><span class="tag">/current/{slug}</span></div>
        </div>
      </a>"""


def clean(s):
    return re.sub(r"\s+", " ", html_mod.unescape(s or "")).strip()


def find_title(src):
    m = re.search(r"<title[^>]*>(.*?)</title>", src, re.I | re.S)
    return clean(m.group(1)) if m else ""


def find_description(src):
    for tag in re.findall(r"<meta\b[^>]*>", src[:200_000], re.I):
        attrs = dict((k.lower(), v) for k, v in re.findall(r'([\w:-]+)\s*=\s*["\']([^"\']*)["\']', tag))
        if attrs.get("name", "").lower() == "description":
            return clean(attrs.get("content", ""))
    return ""


def data_uri(path):
    mime = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp"}.get(path.suffix.lower().lstrip("."), "application/octet-stream")
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode()


def encrypt(key, plain, salt):
    iv = os.urandom(12)
    ct = AESGCM(key).encrypt(iv, plain.encode("utf-8"), None)
    return json.dumps({
        "v": 1, "iter": ITERATIONS,
        "salt": base64.b64encode(salt).decode(),
        "iv": base64.b64encode(iv).decode(),
        "ct": base64.b64encode(ct).decode(),
    })


def shell(payload):
    return (SHELL.replace("__WORDMARK__", WORDMARK).replace("__LOGO__", LOGO)
                 .replace("__PAYLOAD__", payload.replace("</", "<\\/")))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("src", help="folder with the real pages, e.g. _private/current")
    ap.add_argument("out", help="folder to write the locked pages into, e.g. current")
    ap.add_argument("--code", help="the code (otherwise read from <src>/CODE.txt)")
    args = ap.parse_args()

    src, out = Path(args.src), Path(args.out)
    code = args.code
    if not code and (src / "CODE.txt").exists():
        code = (src / "CODE.txt").read_text(encoding="utf-8").strip()
    if not code:
        sys.exit("No code given: pass --code or put it in CODE.txt inside the source folder.")

    salt_file = src / ".salt"
    if salt_file.exists():
        salt = base64.b64decode(salt_file.read_text().strip())
    else:
        salt = os.urandom(16)
        salt_file.write_text(base64.b64encode(salt).decode() + "\n")
    key = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ITERATIONS).derive(code.encode("utf-8"))

    out.mkdir(parents=True, exist_ok=True)
    pages = []
    for folder in sorted(p for p in src.iterdir() if p.is_dir() and not p.name.startswith((".", "_"))):
        index = folder / "index.html"
        if not index.exists():
            print(f"  - {folder.name}: no index.html, skipped")
            continue
        page = index.read_text(encoding="utf-8")
        over = {}
        pj = folder / "parla.json"
        if pj.exists():
            try:
                over = json.loads(pj.read_text(encoding="utf-8"))
            except Exception as exc:
                print(f"  ! {folder.name}/parla.json ignored ({exc})")
        title = clean(over.get("title")) or find_title(page) or folder.name.replace("-", " ").title()
        desc = clean(over.get("description")) or find_description(page)
        cover = None
        for name in ([over["cover"]] if over.get("cover") else []) + ["cover.jpg", "cover.jpeg", "cover.png", "cover.webp"]:
            if (folder / name).exists():
                cover = data_uri(folder / name)
                break
        order = over.get("order")
        pages.append({"slug": folder.name, "title": title, "desc": desc, "cover": cover,
                      "order": float(order) if isinstance(order, (int, float)) else None,
                      "mtime": index.stat().st_mtime})
        (out / folder.name).mkdir(parents=True, exist_ok=True)
        (out / folder.name / "index.html").write_text(shell(encrypt(key, page, salt)), encoding="utf-8")
        print(f"  + locked /{out.name}/{folder.name}/  ({title!r}{', no description' if not desc else ''})")

    pinned = sorted([p for p in pages if p["order"] is not None], key=lambda p: p["order"])
    rest = sorted([p for p in pages if p["order"] is None], key=lambda p: p["mtime"], reverse=True)
    cards = []
    for p in pinned + rest:
        visual = (f'<img class="cover" src="{p["cover"]}" alt="" loading="lazy">' if p["cover"]
                  else f'<div class="placeholder" aria-hidden="true">{html_mod.escape(p["title"][:1])}</div>')
        cards.append(CARD.format(slug=p["slug"], title=html_mod.escape(p["title"]), visual=visual,
                                 desc=f'<p>{html_mod.escape(p["desc"])}</p>' if p["desc"] else ""))
    if not cards:
        cards.append('      <p class="note">Nothing here yet.</p>')
    listing = INDEX.replace("__WORDMARK__", WORDMARK).replace("__LOGO__", LOGO).replace("__CARDS__", "\n".join(cards))
    (out / "index.html").write_text(shell(encrypt(key, listing, salt)), encoding="utf-8")
    (out / "parla.json").write_text('{ "hidden": true }\n', encoding="utf-8")
    print(f"  + locked /{out.name}/ list with {len(pages)} page(s); wrote {out}/parla.json (hidden)")


if __name__ == "__main__":
    main()
