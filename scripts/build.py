#!/usr/bin/env python3
"""
Builds projects.json for the parladesigns.com home page.

Every top-level folder that contains an index.html is a project.
For each one we read:
  - title        -> the page's <title>                (or "title" in parla.json)
  - description  -> <meta name="description">         (or "description" in parla.json)
  - cover        -> cover.jpg / cover.png / cover.webp in the folder (or "cover" in parla.json)
  - added/updated dates from git history
Optional parla.json keys: title, description, cover, link, order, hidden.

Runs with nothing but the Python standard library. Never fails the build
because of one bad project - it just logs and skips it.
"""
import html
import json
import re
import subprocess
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKIP = {".git", ".github", "scripts", "assets", "node_modules", "_site"}
COVER_NAMES = ["cover.jpg", "cover.jpeg", "cover.png", "cover.webp"]


def clean(text):
    return re.sub(r"\s+", " ", html.unescape(text or "")).strip()


def read_head(path, limit=200_000):
    try:
        return path.read_text(encoding="utf-8", errors="replace")[:limit]
    except OSError:
        return ""


def find_title(src):
    m = re.search(r"<title[^>]*>(.*?)</title>", src, re.I | re.S)
    return clean(m.group(1)) if m else ""


def find_meta(src, name):
    # matches <meta name="description" content="..."> in either attribute order
    for tag in re.findall(r"<meta\b[^>]*>", src, re.I):
        attrs = dict(
            (k.lower(), v)
            for k, v in re.findall(r'([\w:-]+)\s*=\s*"([^"]*)"', tag)
        ) | dict(
            (k.lower(), v)
            for k, v in re.findall(r"([\w:-]+)\s*=\s*'([^']*)'", tag)
        )
        if attrs.get("name", "").lower() == name or attrs.get("property", "").lower() == name:
            return clean(attrs.get("content", ""))
    return ""


def git_dates(folder):
    """(added, updated) as YYYY-MM-DD from git history; falls back to today."""
    try:
        out = subprocess.run(
            ["git", "log", "--format=%cs", "--", folder.name],
            cwd=ROOT, capture_output=True, text=True, check=True,
        ).stdout.split()
        if out:
            return out[-1], out[0]
    except Exception as exc:  # no git, shallow clone, etc.
        print(f"  (git dates unavailable for {folder.name}: {exc})")
    today = date.today().isoformat()
    return today, today


def load_overrides(folder):
    p = folder / "parla.json"
    if not p.exists():
        return {}
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception as exc:
        print(f"  ! {folder.name}/parla.json could not be read ({exc}); ignoring it")
        return {}


def build_project(folder):
    index = folder / "index.html"
    if not index.exists():
        return None
    src = read_head(index)
    over = load_overrides(folder)
    if over.get("hidden"):
        print(f"  - {folder.name}: hidden via parla.json")
        return None

    title = clean(over.get("title")) or find_title(src) or folder.name.replace("-", " ").title()
    description = (
        clean(over.get("description"))
        or find_meta(src, "description")
        or find_meta(src, "og:description")
    )
    cover = clean(over.get("cover"))
    if not cover:
        for name in COVER_NAMES:
            if (folder / name).exists():
                cover = name
                break
    added, updated = git_dates(folder)
    order = over.get("order")
    try:
        order = float(order) if order is not None else None
    except (TypeError, ValueError):
        order = None

    return {
        "slug": folder.name,
        "title": title,
        "description": description,
        "url": clean(over.get("link")) or f"/{folder.name}/",
        "cover": f"/{folder.name}/{cover}" if cover and not cover.startswith(("http", "/")) else (cover or None),
        "added": added,
        "updated": updated,
        "order": order,
    }


def main():
    projects = []
    for folder in sorted(ROOT.iterdir()):
        if not folder.is_dir() or folder.name in SKIP or folder.name.startswith((".", "_")):
            continue
        try:
            item = build_project(folder)
        except Exception as exc:
            print(f"  ! skipping {folder.name}: {exc}")
            continue
        if item:
            projects.append(item)
            print(f"  + {item['slug']}: {item['title']!r}"
                  f"{' (no description)' if not item['description'] else ''}"
                  f"{' (no cover)' if not item['cover'] else ''}")

    # Explicit "order" first (smallest number first), then newest first.
    projects.sort(key=lambda p: (p["order"] is None, p["order"] or 0, ""))
    ordered = [p for p in projects if p["order"] is not None]
    rest = sorted([p for p in projects if p["order"] is None], key=lambda p: p["added"], reverse=True)
    projects = ordered + rest
    for p in projects:
        p.pop("order", None)

    out = ROOT / "projects.json"
    out.write_text(json.dumps({"generated": date.today().isoformat(), "projects": projects},
                              indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {out.relative_to(ROOT)} with {len(projects)} project(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
