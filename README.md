# parladesigns.com

This one repository is the whole website. GitHub Pages publishes it at **https://parladesigns.com**.

## How it is organized

```
index.html              the front door: Parla -> Designs | Moves
designs/index.html      the design home (Spaces, Apps & tools, Current)   -> /designs/
spaces/index.html       space-design services and case studies            -> /spaces/
moves/…                 the dance portfolio: works, performing, teaching, bio -> /moves/
about/index.html        the About page -> https://parladesigns.com/about/
_src/moves.yaml         the words for the front door and the Moves pages — edit this, not the HTML
_src/templates/         the page templates; scripts/site.py turns _src into the pages above
moves/img/<work>/       photos for each dance work, named in moves.yaml (web size, about 1800 px)
moves/video/            short self-hosted films (720p MP4, under 20 MB each) with posters in moves/img/video/
assets/site.css         the shared stylesheet (PARLA colors, type, layout)
current/                the code-protected "Current projects" part -> https://parladesigns.com/current/
                        (only locked, unreadable copies live here; see below)
scripts/lock.py         makes those locked copies from the readable originals
projects.json           the list the home page reads — generated, do not edit by hand
favicon.png, apple-touch-icon.png   the tab / home-screen icon, made from the PARLA logo
CNAME                   tells GitHub Pages the custom domain (leave as is)
.nojekyll               tells GitHub Pages to publish files exactly as they are
.github/workflows/      the robot that rebuilds projects.json and publishes on every change
scripts/build.py        the script that robot runs
scripts/cover.py        makes a cover.jpg screenshot for a project (used when publishing)

ensemble/index.html     -> https://parladesigns.com/ensemble/
beachmap/index.html     -> https://parladesigns.com/beachmap/
<anything>/index.html   -> https://parladesigns.com/<anything>/
```

**One folder = one project.** Any top-level folder that contains an `index.html`
(other than `about/`, `assets/`, `current/`, `designs/`, `moves/` and `spaces/`) appears under Apps & tools on /designs/ within about a minute
of being added, with:

- its **title** – taken from the page's `<title>`
- its **description** – taken from `<meta name="description" content="...">`
- its **cover** – a `cover.jpg` (or `.png` / `.webp`) in the same folder, if there is one
- its dates – from the git history

## Changing the front door, Designs or Moves pages

Edit `_src/moves.yaml` (text, credits, image file names) or a template in `_src/templates/`, then run

    python3 scripts/site.py

and upload the files it rewrote. Add a dance work by adding an entry under `works:` and its photos
under `moves/img/<slug>/` (the first photo is the large one at the top; `card: FILE` picks a different photo for the Works cards; `pos: "50% 20%"` moves its focal point).
A film can be a Vimeo embed (`video: {kind: vimeo, id: …}`) or a file in `moves/video/`
(`video: {kind: file, src: /moves/video/NAME.mp4, poster: /moves/img/video/NAME.jpg}`).

## Publishing a new project

Tell Claude, in a Cowork session with Chrome connected:

> Publish this to parladesigns.com as /NAME/

Claude puts the page (with a title, description and cover) into a folder called
`NAME`, uploads it to this repository, waits for the publish robot to finish,
and checks that `https://parladesigns.com/NAME/` and the home page are live.

To update a project, upload the changed files into the same folder — same names
replace the old files.

## Optional: `parla.json` in a project folder

Only needed when you want to override what the page itself says:

```json
{
  "title": "A different title",
  "description": "A different one-line description.",
  "cover": "photo.jpg",
  "order": 1,
  "hidden": true,
  "link": "https://somewhere-else.example"
}
```

`order` pins a project to the top (1 first, then 2, …); the rest sort newest first.
`hidden` keeps a project off the home page while it is still live at its address.

## The code-protected part (/current/)

`https://parladesigns.com/current/` asks for a code and then lists work-in-progress
pages, each at `https://parladesigns.com/current/<name>/`. Because this repository is
public, the readable pages are **not** stored here. They live only on Corina's Mac in
`~/Documents/parladesigns/_private/current/<name>/index.html`, next to the code in
`_private/current/CODE.txt`. `scripts/lock.py` scrambles them (AES-GCM, key derived from
the code) into the `current/` folder, and the small page around each one unscrambles it
in the visitor's browser after the right code is typed. Typing the code once opens every
page for that browser tab; the "Lock" link in the footer forgets it again.

To add or change a current project: put the page in `_private/current/<name>/`, run

    python3 scripts/lock.py _private/current current

and upload the `current/` folder. Never upload `_private/`.

Honest note on strength: a four-digit code keeps out casual visitors and search engines
(the pages are marked noindex and unreadable without the code), but someone determined
could try all 10,000 codes. Use a longer phrase if anything sensitive ever goes there —
the lock accepts any length.

## If something looks wrong

Open the **Actions** tab of this repository. Each publish is a run named
"Publish parladesigns.com"; a red one shows what failed. The site keeps serving
the last successful publish in the meantime.
