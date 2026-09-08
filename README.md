# parladesigns.com

This one repository is the whole website. GitHub Pages publishes it at **https://parladesigns.com**.

## How it is organized

```
index.html              the home page (lists every project automatically)
about/index.html        the About page -> https://parladesigns.com/about/
                        (its parla.json says "hidden", so it is not listed as a project)
assets/site.css         the shared stylesheet (PARLA colors, type, layout) for those two pages
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
(other than `about/` and `assets/`) appears on the home page within about a minute
of being added, with:

- its **title** – taken from the page's `<title>`
- its **description** – taken from `<meta name="description" content="...">`
- its **cover** – a `cover.jpg` (or `.png` / `.webp`) in the same folder, if there is one
- its dates – from the git history

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

## If something looks wrong

Open the **Actions** tab of this repository. Each publish is a run named
"Publish parladesigns.com"; a red one shows what failed. The site keeps serving
the last successful publish in the meantime.
