# Pawan World

A Pokémon fan-game customization by **Pawan** for [MyPortfolio](https://github.com/Pawan-webdeveloper/MyPortfolio).

Explore an endless ink-and-watercolour world with three playable Pokémon:

- **Charizard:** fly through the world.
- **Gengar:** drive a stylish jeep, park it, and get in or out.
- **Greninja:** walk, run, jump, and glide smoothly from Charizard's airborne position. Ash-inspired details appear during the glide and landing, then return to normal.

The existing world, driving speed, vehicle interactions, camera, weather, radio, and screen layout are preserved.

## Portfolio home screen

The page opens on Pawan's portfolio: a Pokémon-style start menu over the live (blurred) world, with Pawan in a trainer cap standing beside Greninja in a trainer-and-partner battle pose (Greninja carries its water shuriken).

| Menu | What it shows |
| --- | --- |
| **PLAY** | Starts the game through its own start button. Unlocks once the world has finished building. |
| **TEAM** | Projects as a Pokémon party (ScanlyFix · Greninja, Bennet AI · Charizard, ThirdEye · Gengar). Picking one slides the Pokémon into the corner of a summary card: description, role, tech-stack "types", features as "moves", architecture, and links. A PC box lists smaller projects. |
| **JOURNEY** | Trainer card (avatar, class, badges) and experience chapters. |
| **SKILLS** | A top-down pixel-art region (`home/skillmap.js`, original tiles drawn in code) with five skill towns, each with its own landmark: Frontend Town, Backend City HQ, Database Cave, AI Tower and DevOps Harbor. Walk Pawan's sprite with arrows/WASD or the on-screen D-pad, or tap to walk. Press A/Enter at a sign to read that town's skills. PREV/NEXT TOWN walk him there automatically. |
| **CONTACT** | Poké Gear with email, LinkedIn, GitHub and website, plus a message form that opens the visitor's mail app. |
| **CLASSIC VIEW** | Everything on one plain page, for visitors in a hurry. |

Controls: arrows or WASD to move, Enter or Space to select, Esc, Backspace or B to go back. Touch and mouse work everywhere. Sections are linkable (`#team`, `#team/scanlyfix`, `#journey`, `#skills`, `#contact`, `#classic`), and the browser Back button closes them.

- **Edit the text** in `home/content.js`. No UI code needs touching.
- The home code lives in `home/` (`home.js` menu and sections, `stage.js` 3D duo and card portraits, `home.css` styles scoped under `#home`). `hero.js` builds Pawan's model; `buildHero({ cap: true })` adds the trainer cap.
- The game script, styles and HUD markup in `index.html` are unchanged. While the home is open it holds the keyboard, so menu keys never reach the game. PLAY then calls the game's own `#go` button.
- **The trainer** is built in `home/trainer.js` on a CC0 base body (see credits below), packed into `models/hero/trainer.glb` by `tools/build-trainer.mjs`. Everything that makes him Pawan is added at runtime:
  - his skin tone, clean-shaven face and dark rectangular glasses
  - thick wavy hair: a volume layer plus a few hundred wavy locks that wrap the head
  - the printed t-shirt and straight-leg trousers, generated as cloth shells that follow the skeleton. The skin they cover is removed, so nothing clips through.
  - modelled black sports shoes (sole, welt, upper, laces) on the foot bones
  - his bead bracelet
  - a two-bone IK pose: one arm thrust up and ahead, the other hand on his hip
- If the trainer can't load, the older sculpted model in `hero.js` is used instead.
- Dev aids: `tools/stage-preview.html` (the duo on its own), `tools/trainer-preview.html` and `tools/hero-preview.html`.

### Home-screen credits

- Trainer base body and short scalp hair: [Universal Base Characters](https://quaternius.com/packs/universalbasecharacters.html) by Quaternius, Standard (free) version, **CC0 1.0** public domain. The hairstyle, clothing, shoes, glasses, bracelet, print and pose are original to this project.

## Controls

| Key | Action |
| --- | --- |
| 1 | Select Charizard |
| 2 | Select Gengar's jeep |
| 3 | Select Greninja |
| F | Cycle time of day |
| 0 | Automatic time of day |
| W / S | Throttle / brake, or walk forward / back |
| A / D | Steer |
| Space | Hop / jump |
| Shift | Boost / run |
| E | Get in / out of a vehicle |
| C | Cycle camera |
| Scroll, + / − | Zoom |
| [ / ] | Adjust field of view |
| K | Toggle rain |
| R / N / B | Radio on/off / next song / band |
| M | Minimap |
| P | Photo |
| H | Hide UI |
| Drag | Look around |

The existing on-screen **Switch** button cycles Pokémon; **Greninja** selects Greninja directly.

## Run locally

No build step. Serve this folder with a static server:

```bash
python3 -m http.server 8431
```

Open http://localhost:8431.

On phones, use landscape orientation. The existing joystick and six touch buttons provide camera, Switch, Ninja, get in/out, boost, and hop controls. The web manifest supports installing the game on a home screen. Offline caching covers resources already fetched; visit and load each character online before relying on cached assets.

## Tests

Requires Node.js. Run the included gameplay regression tests:

```bash
node --test
```

## Third-party source and rights

Pawan's work is the Pokémon customization, not authorship of all underlying code or assets.

- Pokémon names, characters, and model IP belong to Nintendo / Creatures Inc. / GAME FREAK inc. This is an unofficial, non-commercial fan project, not affiliated with or endorsed by those companies.
- Model source: `Pokemon-3D-api/assets`, paths `models/opt/regular/6.glb`, `94.glb`, and `658.glb`. Greninja's local asset retains selected animation clips from the original model. A repository's code license does not license the Pokémon model IP.
- three.js is loaded from a CDN and is MIT-licensed.
- The bundled Draco decoder is provided by Google under Apache-2.0. Its license is included in `vendor/draco/LICENSE`.

These source and legal notices are intentionally retained. No blanket ownership or license claim is made for third-party material.
