# Pawan World

A Pokémon fan-game customization by **Pawan** for [MyPortfolio](https://github.com/Pawan-webdeveloper/MyPortfolio).

Explore an endless ink-and-watercolour world with three playable Pokémon:

- **Charizard:** fly through the world.
- **Gengar:** drive a stylish jeep, park it, and get in or out.
- **Greninja:** walk, run, jump, and glide smoothly from Charizard's airborne position. Ash-inspired details appear during the glide and landing, then return to normal.

The existing world, driving speed, vehicle interactions, camera, weather, radio, and screen layout are preserved.

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

- The base game is adapted from [Paper World](https://github.com/aadil6971/PaperWorld). Its source does not provide a LICENSE file. Rebranding does not grant redistribution rights; permission for public redistribution remains unverified.
- Pokémon names, characters, and model IP belong to Nintendo / Creatures Inc. / GAME FREAK inc. This is an unofficial, non-commercial fan project, not affiliated with or endorsed by those companies.
- Model source: `Pokemon-3D-api/assets`, paths `models/opt/regular/6.glb`, `94.glb`, and `658.glb`. Greninja's local asset retains selected animation clips from the original model. A repository's code license does not license the Pokémon model IP.
- three.js is loaded from a CDN and is MIT-licensed.
- The bundled Draco decoder is provided by Google under Apache-2.0. Its license is included in `vendor/draco/LICENSE`.

These source and legal notices are intentionally retained. No blanket ownership or license claim is made for third-party material.
