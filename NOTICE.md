# Third-Party Notices

Pawan World is an unofficial, non-commercial Pokémon fan project. It is not
affiliated with, sponsored by, or endorsed by Nintendo, Creatures Inc., GAME
FREAK inc., or The Pokémon Company.

The MIT license in [LICENSE](LICENSE) covers the original source code in this
repository. It does not cover Pokémon intellectual property or the third-party
assets and libraries listed below.

## Pokémon intellectual property

Pokémon names, characters, artwork, and 3D models are © Nintendo / Creatures
Inc. / GAME FREAK inc. They are used here for non-commercial fan purposes only.
No ownership claim is made over any Pokémon material.

## 3D models

- **Pokémon models:** sourced from [Pokemon-3D-api/assets](https://github.com/Pokemon-3D-api/assets),
  paths `models/opt/regular/<dex number>.glb`. The wild Pokémon in
  `models/pokemon/wild/` were re-processed by `tools/build-wild.mjs` (rest pose
  baked, simplified, texture-compressed, and Draco-compressed).
- **Trainer base body and short scalp hair:** [Universal Base Characters](https://quaternius.com/packs/universalbasecharacters.html)
  by Quaternius, Standard (free) version, released under **CC0 1.0**. Hair,
  clothing, shoes, glasses, bracelet, print, and pose are original to this
  project.

## Species data

Species names, types, heights, and weights come from [PokéAPI](https://pokeapi.co/).

## Libraries and tools

- [three.js](https://threejs.org) r170 — MIT License.
- [Draco](https://github.com/google/draco) decoder — Apache License 2.0. The
  license text ships with the decoder in `vendor/draco/LICENSE`.
- [Google Fonts](https://fonts.google.com): Caveat Brush, Kalam, DM Sans,
  Noto Sans JP, and Press Start 2P — SIL Open Font License 1.1. Fonts are
  loaded from Google Fonts at runtime.

## Asset build tooling (optional)

`tools/build-wild.mjs`, `tools/build-hero.mjs`, and `tools/build-trainer.mjs`
use the following packages, installed from `tools/package.json`:

- `@gltf-transform/core`, `@gltf-transform/extensions`,
  `@gltf-transform/functions` — MIT License.
- `draco3dgltf` — Apache License 2.0.
- `meshoptimizer` — MIT License.
- `sharp` — Apache License 2.0.

## Fan-project terms

This project is provided for portfolio, educational, and fan purposes. Do not
sell it, bundle it into a commercial product, or imply that it is an official
Pokémon product. If a rights holder asks for content to be removed, it will be.
