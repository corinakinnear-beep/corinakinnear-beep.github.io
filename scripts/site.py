#!/usr/bin/env python3
"""
Builds the shared pages of parladesigns.com from _src/:

    python3 scripts/site.py

  _src/moves.yaml + _src/templates/  ->  index.html            (the front door)
                                         designs/index.html    (design home)
                                         moves/index.html      (dance home)
                                         moves/works/…         (one page per work)
                                         moves/performing/, moves/teaching/, moves/bio/

Project folders (ensemble/, beachmap/, …), about/, spaces/ and current/ are not touched.
Images for the dance pages live in moves/img/<slug>/ and are named in moves.yaml.
Needs: python3 with jinja2 and pyyaml.
"""
import json
import sys
from pathlib import Path

import yaml
from jinja2 import Environment, FileSystemLoader, select_autoescape

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "_src"

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


def write(path, html):
    path = ROOT / path
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(html, encoding="utf-8")
    print(f"  + {path.relative_to(ROOT)}")


def main():
    data = yaml.safe_load((SRC / "moves.yaml").read_text(encoding="utf-8"))
    env = Environment(loader=FileSystemLoader(str(SRC / "templates")), autoescape=select_autoescape(["html"]),
                      trim_blocks=True, lstrip_blocks=True)
    base = dict(wordmark=WORDMARK, logo=LOGO, site=data["site"])
    works = data["works"]
    shown = [w for w in works if not w.get("list_only")]

    # give every image its pixel size, so pages can reserve the space before photos load
    def measure(images, folder):
        for im in images or []:
            f = ROOT / "moves" / "img" / folder / im["file"]
            if f.exists():
                try:
                    from PIL import Image
                    with Image.open(f) as pic:
                        im["w"], im["h"] = pic.size
                except Exception:
                    pass
    for w in works:
        measure(w.get("images"), w["slug"])
    measure(data["performing"].get("images"), "performing")
    measure(data["teaching"].get("images"), "teaching")
    measure([data["bio"]["hero"]] if data["bio"].get("hero") else [], "bio")
    measure(data["bio"].get("extra"), "bio")

    # the dance hero: first image of the newest work that has one, unless moves.yaml names one
    hero = None
    for w in shown:
        if w.get("images"):
            hero = {"src": f"/moves/img/{w['slug']}/{w['images'][0]['file']}", "alt": w["images"][0].get("alt") or w["title"]}
            break
    if data["site"].get("moves_hero"):
        hero = data["site"]["moves_hero"]

    def door_img(name):
        p = ROOT / "assets" / name
        return f"/assets/{name}" if p.exists() else None

    write("index.html", env.get_template("door.html").render(
        **base, section="home", title="Parla", description="Parla — creating and making. Designs and Moves by Corina Kinnear.",
        door_designs=door_img("door-designs.jpg"), door_moves=door_img("door-moves.jpg")))

    write("designs/index.html", env.get_template("designs.html").render(
        **base, section="designs", sub="home", title="Designs — Parla",
        description="Parla Designs — space design alongside the architect, and small apps and tools by Corina Kinnear."))

    write("spaces/index.html", env.get_template("spaces.html").render(
        **base, section="designs", sub="spaces", title="Spaces — Parla Designs",
        description="Space design alongside the architect: design intent, circulation and finish specification by Corina Kinnear."))

    write("moves/index.html", env.get_template("moves.html").render(
        **base, section="moves", sub="home", title="Moves — Parla", hero=hero,
        description="Parla Moves — choreography, direction and performance by Corina Kinnear.",
        works=works, performing=data["performing"], teaching=data["teaching"], bio=data["bio"]))

    write("moves/works/index.html", env.get_template("works.html").render(
        **base, section="moves", sub="works", title="Works — Parla Moves",
        description="Productions, films and commissions choreographed and directed by Corina Kinnear.",
        works=works, also=data.get("also", [])))

    for i, w in enumerate(shown):
        write(f"moves/works/{w['slug']}/index.html", env.get_template("work.html").render(
            **base, section="moves", sub="works", title=f"{w['title']} — Parla Moves",
            description=w["summary"].strip().split(". ")[0].rstrip(".") + ".",
            w=w, prev=shown[i - 1] if i > 0 else None, next=shown[i + 1] if i + 1 < len(shown) else None))

    write("moves/performing/index.html", env.get_template("performing.html").render(
        **base, section="moves", sub="performing", title="Performing — Parla Moves",
        description="Corina Kinnear's performing credits — opera, ballet, contemporary companies, film and television.",
        performing=data["performing"]))

    write("moves/teaching/index.html", env.get_template("teaching.html").render(
        **base, section="moves", sub="teaching", title="Teaching — Parla Moves",
        description="Classes, master classes, conventions and intensives taught by Corina Kinnear.",
        teaching=data["teaching"]))

    write("moves/bio/index.html", env.get_template("bio.html").render(
        **base, section="moves", sub="bio", title="Bio — Corina Kinnear",
        description="Corina Kinnear — choreographer, director and dancer; founder of Parlā.", bio=data["bio"]))

    # keep these folders off the public project list
    for folder in ("designs", "moves", "spaces"):
        (ROOT / folder / "parla.json").write_text('{ "hidden": true }\n', encoding="utf-8")
    print("done")


if __name__ == "__main__":
    sys.exit(main())
