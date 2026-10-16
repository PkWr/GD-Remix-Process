# Spot

Spot is a generative photo-remix tool by Patrick Walker. It cycles through photographs and remixes them live in the browser: duotone, pixelate, halftone and ASCII effects, moving strips with echo trails, blend overlays, and 3D forms that wear the images or bend them like glass. It runs on a phone, a laptop or desktop, and across the six walls of an Igloo immersive room.

## Open it

| | |
|---|---|
| App (matches your device) | https://pkwr.github.io/GD-Remix-Process/ |
| Spot Reel (showreel) | https://pkwr.github.io/GD-Remix-Process/showreel.html |
| Spot Room (Igloo walls) | https://pkwr.github.io/GD-Remix-Process/?stage=igloo |
| Igloo preview on a laptop | https://pkwr.github.io/GD-Remix-Process/?stage=igloo&preview |
| Igloo test page | https://pkwr.github.io/GD-Remix-Process/igloo-tests.html |
| Igloo check (machine report) | https://pkwr.github.io/GD-Remix-Process/igloo-check.html |
| About & credits | https://pkwr.github.io/GD-Remix-Process/about.html |

## Using it

- **C** controls · **P** pause · **F** fullscreen · **D** info panel · **V** camera · **L** live student photos · **S** lockup · **R** recording window · **1–9** scenes · **?** key list
- On phones and desktops a bar at the bottom (Camera · Controls · Info) appears when you tap or move the mouse.
- **Showreel:** ← → skip looks, − + change the pace, P pause.

### Profiles

With no `?stage=` the app picks one from the device: phones get the phone layout (1080 × 1920, Instagram Story), everything else gets desktop (fits the window). Choose another in **Show → Profile**, or link to one:

- `?stage=phone` · `?stage=desktop` · `?stage=igloo` (11520 × 1038, six walls) · `?stage=igloo&preview`

### Scenes and share links

Save a look in **Show → Scenes**; **Share** gives a link and a QR code (`?scene=…`) that opens exactly that look on any device. Add `&stage=…` to force a profile. Scenes in `scenes.json` appear on every machine.

## What's in the folder

| File | What it is |
|---|---|
| `index.html`, `app.js`, `style.css` | The app |
| `settings.js` | Every control: its label, range, default and where it sits in the panel. The panel, scenes, share links and the remote page are all built from it |
| `controls.html`, `controls.js` | Remote controls (another tab on the same computer) |
| `scenes.json` | Shared scenes (the Igloo tests) |
| `showreel.html`, `showreel.json` | The showreel and its list of looks (title + settings, seconds per look) |
| `igloo-tests.html`, `igloo-check.html` | Igloo test page and diagnostic page |
| `model-wrap-sketch.html` | Standalone sketch: photos wrapped round 3D models, drop in your own STL/OBJ |
| `seed-loader.html` | Drag-and-drop uploader for new photos |
| `assets/` | Demo and seed images, audio, branding |
| `vendor/` | three.js and qrcode-generator (MIT) |

No build step: the files are served as they are by GitHub Pages.

## Updating the site

From this folder in Terminal:

```
./push-to-github.sh "what changed"
```

The site updates a minute or two later. Press **D** in the app and check the version line.

## Licence

© 2026 Patrick Walker — all rights reserved. The repository is public so the app can be hosted; that is not permission to reuse it. See [LICENSE.md](LICENSE.md). Student work is shown with permission and remains the students'.
