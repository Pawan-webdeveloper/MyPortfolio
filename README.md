# Pawan World

A Pokémon fan-game customization by **Pawan** for [MyPortfolio](https://github.com/Pawan-webdeveloper/MyPortfolio).

Explore an endless ink-and-watercolour world with three playable Pokémon:

- **Charizard:** fly through the world.
- **Gengar:** drive a stylish jeep, park it, and get in or out.
- **Greninja:** walk, run, jump, and glide smoothly from Charizard's airborne position. Ash-inspired details appear during the glide and landing, then return to normal.

The existing world, driving speed, vehicle interactions, camera, weather, radio, and screen layout are preserved.

## Wild Pokémon

The world's animals are gone; every region now has its own wild Pokémon, picked by type for the place:

- **32 regions, 164 species from generations 1–7, no repeats.** Towns get city Pokémon and pets (Meowth, Pikachu, Litwick…), fields get farm and grassland ones (Mareep, Miltank, Ponyta…), forests get Bug/Grass/Dark types, meadows and cherry groves get Fairy and Grass types, mountains get Rock/Ground/Ice/Steel, and lakes get Water types only. The full list is in `wild/roster.js`.
- **One legendary boss per region, drawn from every generation 1–7:** Mewtwo in Café Lane, Mew in Teacup Quarter, Lugia off Salt Shore, Kyogre in Teal Lake, Palkia in Mirror Water, Rayquaza on Crane Summit, Giratina in Origami Pass, Groudon on Folded Ridge, Kyurem on Paper Peaks, Ho-Oh over Rainbow Fields, Darkrai in Marmalade Mews, Yveltal in Inkwood Forest, Xerneas on Ribbon Row, Solgaleo, Zekrom, Tapu Lele, Tapu Bulu and more. Each boss waits at a fixed lair (chosen a short drive from where you first enter, then remembered), marked by a gold ring and a star. A tracker chip at the top and a Poké Ball on the minimap point the way.
- **Herds and flocks:** where the world used to paint cows, sheep, deer and ducks there are now herds of the region's Pokémon (Miltank, Ponyta, Deerling, Psyduck families on the lakes). The paper-bird flocks became flocks of the region's bird Pokémon (Pidgey, Wingull, Starly…).
- **Solid and reactive:** the car and Greninja bump into them (small ones get knocked over, bosses don't budge), and Charizard can't fly through them. Timid ones run, curious ones come over to look, and on foot **E** greets the nearest one. First sightings fill a Pokédex (top of the screen, saved in `localStorage` as `pw-dex`).
- **Light on performance:** `tools/build-wild.mjs` bakes each rigged model into a static mesh, simplifies it, shrinks textures to 256 px WebP (512 px for bosses) and Draco-compresses it (4.7 MB for all 164, about 28 KB each). In game each species is one instanced mesh per material, loaded only when its region is near and unloaded when unused. They really walk: the vertex shader swings bipeds' legs left/right and quadrupeds' legs in diagonal pairs about the hip (measured from each model; which species is which is listed in `wild/roster.js` → `LEGS`), lifting each foot on the forward swing. Step rate follows speed, so feet don't slide, and running means longer strides, a forward lean and more bounce. Birds and bugs beat their wings (`WINGS`), hoppers hop in time with their speed, and blob-shaped Pokémon shuffle. Feet sit exactly on the ground: models are grounded on their true lowest point and placed on the highest terrain under their footprint.
- Rebuild models with `node tools/build-wild.mjs` (it checks every species' types against PokéAPI first). Check them by eye with `tools/wild-preview.html` (`?anim=walk|run&view=side` plays the walk cycle).

## Boss battles

Walk up to a region's boss on foot and press **E** (on phones: GET IN/OUT) for a **Challenge** card. Accept and a VS loading screen takes you into an arena: **your Charizard, Gengar and Greninja against the boss**, until one side's health runs out.

- **Your team:** each Pokémon has four real moves (types, powers, cooldowns from the games) plus a short shared cooldown between moves:
  - Charizard (Fire/Flying): Flamethrower, Air Slash, Dragon Claw, Fire Blast
  - Gengar (Ghost/Poison): Shadow Ball, Sludge Bomb, Thunderbolt, Shadow Claw
  - Greninja (Water/Dark): Water Shuriken, Night Slash, Hydro Pump, Dark Pulse
- **The boss** uses its signature move (Mewtwo's Psystrike, Kyogre's Origin Pulse, Giratina's Shadow Force, Rayquaza's Dragon Ascent…) and three moves of its types. Every attack is **telegraphed in red on the ground** (arcs, rings, charge lanes, beam lines, falling circles) and its name appears under the boss's health bar. The boss's body glows in the move's colour while it charges.
- **Hard mode is the only mode.** Three or four clean hits knock out one of your Pokémon, so you have to dodge. The boss holds the middle of the arena, circles you, **sidesteps attacks it sees coming** (it can't be hit mid-sidestep), keeps aiming until late in its windup, often follows a meteor attack with a second wave, and below half health it enrages: faster windups, more shots, attacks chained back to back. A fight lasts about 2–3 minutes. The opening is right after it attacks, while it recovers.
- **Dodge:** roll with **Space** (DODGE on phones); you're invincible for the first part of the roll, so you can roll *through* attacks or just move out of the red zone. The roll has a short cooldown, so against chained attacks you also need to walk out.
- **Resting:** Pokémon on the bench slowly recover HP, so switch before one faints.
- **Types matter:** damage uses the real type chart with STAB and crits (immunities are softened to ×0.25 so every boss is beatable). Switch (**Q / Tab**, or tap a party card) to resist a boss's moves; a fainted Pokémon is swapped out automatically.
- **Win and the boss leaves its lair for good** (saved in `localStorage` as `pw-bosses`), and the world map marks it ✓. Lose and your team is healed: try again or leave; the boss keeps waiting. **Esc twice** (or Run ✕) gets away.
- **Attack effects** are built per element: flame jets that cool into smoke, water beams with spray, forked lightning, claw marks on the target's body, lobbed bombs that leave scorch marks, shockwave rings and dust.
- Code: `wild/combat.js` (type chart, moves, damage; tested in `tests/combat.test.mjs`) and `wild/battle.js` (the arena scene, boss AI, dodging, effects, HUD; difficulty knobs are the `HARD` and `SHAPE` tables at the top, plus `BOSS_SCALE` and boss HP in `combat.js`). `index.html` renders the arena scene instead of the world while you fight.

## Settings

The **⚙ Settings** button (on the dash on desktop, among the touch buttons on phones) or **Esc** opens a guide: your Pokémon (abilities and battle moves; switch from there), graphics (quality, rain, time of day, minimap), every key binding (or the touch layout on phones) and game progress (Pokédex, bosses defeated, reset). Code: `ui/settings.js`.

## World map

Press **M** (or click / tap the minimap) for a full-screen map. It shows where you are, the roads and regions, and **every region boss** in view (lairs are found on the fly; the list on the side is sorted by distance). Drag to move, scroll / pinch / +− to zoom, ◎ to re-centre.

- **Tap anywhere** to drop a pin, or **tap a boss → Navigate**. The shortest route is drawn on the map and the minimap, a chip at the top of the screen points the way with the distance left, and a light beacon marks the spot.
- Routes prefer roads, avoid town blocks and slow forests, and never send the jeep into deep water. On foot (Greninja) water is fine, and Charizard flies straight. Wander off or switch Pokémon and the route is re-planned.
- The code is in `nav/worldmap.js`; `index.html` only passes it the world helpers and calls `worldMap.update()` each frame.

## Deep water

Lakes outside towns are now deep (town ponds stay shallow, and the shorelines are where they always were). The sea is painted by depth: dark blue in the middle, light turquoise in the shallows.

- **Gengar's jeep** (or any borrowed car) and **Charizard** sink if they go into deep water, then come back up at the last dry spot you passed, facing away from the water.
- **Greninja** runs across deep water on the surface, splashing as it goes.

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
| E | Get in / out of a vehicle · on foot: greet a Pokémon, challenge a boss |
| Esc | Settings & guide |
| C | Cycle camera |
| Scroll, + / − | Zoom |
| [ / ] | Adjust field of view |
| K | Toggle rain |
| R / N / B | Radio on/off / next song / band |
| M | World map (or click / tap the minimap) · M, Esc or Back closes it |
| P | Photo |
| H | Hide UI |
| Drag | Look around |

The on-screen **Switch** button cycles Pokémon; **⚙ Settings** opens the settings & guide. Boss-battle controls: WASD move, Space dodge, 1–4 moves, Q/Tab switch, Esc ×2 run.

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
- Model source: `Pokemon-3D-api/assets`, paths `models/opt/regular/6.glb`, `94.glb`, and `658.glb`, plus the 164 wild Pokémon in `models/pokemon/wild/` (same repository, `models/opt/regular/<dex number>.glb`, re-processed by `tools/build-wild.mjs`).
- Species names, types and heights come from [PokéAPI](https://pokeapi.co/). Greninja's local asset retains selected animation clips from the original model. A repository's code license does not license the Pokémon model IP.
- three.js is loaded from a CDN and is MIT-licensed.
- The bundled Draco decoder is provided by Google under Apache-2.0. Its license is included in `vendor/draco/LICENSE`.

These source and legal notices are intentionally retained. No blanket ownership or license claim is made for third-party material.
