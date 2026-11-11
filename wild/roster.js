// Wild Pokémon roster for Pawan World.
//
// Every named region in the game (index.html → REG) gets its own roster:
//   boss   one unique legendary / pseudo-legendary that guards a fixed lair in each instance of the
//          region – a mix of generations 1–7 (Mewtwo, Lugia, Kyogre, Giratina, Rayquaza, Tapu Lele…)
//   land   ground species (the first one is also used for herds that replaced cows/deer/sheep)
//   water  swimmers (lakes) – the first one also replaces the old duck families
//   shore  waders that stay in the shallows / on the beach
//   air    the region's flyer: "bird" species replace the old bird flocks, "hover" species
//          drift a few metres above the ground (bugs, ghosts, fairies)
//
// No species is used twice anywhere, so every region feels different.
// tools/build-wild.mjs checks every entry against PokéAPI: the species must exist,
// at least one of its types must be allowed in the biome, and water/shore species
// must actually be Water (or Ice) types – no Fire Pokémon in a lake.

export const BIOME_TYPES = {
  town: ["normal", "electric", "psychic", "fire", "fairy", "steel", "poison", "ghost", "dark", "flying"],
  field: ["normal", "grass", "electric", "ground", "bug", "fire", "flying"],
  forest: ["bug", "grass", "poison", "dark", "normal", "flying"],
  meadow: ["fairy", "bug", "grass", "normal", "flying"],
  grove: ["grass", "fairy", "psychic", "bug", "flying", "normal"],
  mountain: ["rock", "ground", "ice", "steel", "fighting", "dragon", "flying", "ghost"],
  lake: ["water", "ice", "flying", "dragon"],
};

export const REGIONS = {
  // ── towns: city critters, pets, electric & psychic types ─────────────
  "Café Lane": { biome: "town", boss: 150, land: [52, 133, 506], air: 519 },
  "Laundry Row": { biome: "town", boss: 791, land: [300, 509, 81], air: 333 },
  "Tram Street": { biome: "town", boss: 644, land: [25, 309, 417], air: 587 },
  "Lantern Market": { biome: "town", boss: 485, land: [58, 607, 390], air: 661 },
  "Pigeon Steps": { biome: "town", boss: 146, land: [19, 263, 399], air: 16 },
  "Teacup Quarter": { biome: "town", boss: 151, land: [517, 63, 280], air: 177 },
  "Ribbon Row": { biome: "town", boss: 716, land: [35, 684, 682], air: 176 },
  "Postcard Hill": { biome: "town", boss: 385, land: [235, 676, 677], air: 441 },
  "Marmalade Mews": { biome: "town", boss: 491, land: [431, 568, 132], air: 198 },

  // ── fields: farm & grassland Pokémon ─────────────────────────────────
  "Lemon Fields": { biome: "field", boss: 243, land: [179, 191, 172], air: 415 },
  "Lavender Flats": { biome: "field", boss: 640, land: [672, 43, 548], air: 12 },
  "Haybale Hills": { biome: "field", boss: 486, land: [241, 50, 128], air: 21 },
  "Buttercup Meadow": { biome: "field", boss: 244, land: [77, 27, 659], air: 276 },
  "Windmill Plains": { biome: "field", boss: 641, land: [749, 84, 231], air: 396 },

  // ── forests: bug, grass, poison & dark ───────────────────────────────
  "Nightwood Forest": { biome: "forest", boss: 717, land: [570, 48, 285], air: 163 },
  "Cedar Hush": { biome: "forest", boss: 251, land: [585, 273, 252], air: 731 },
  "Pinecone Hollow": { biome: "forest", boss: 649, land: [216, 204, 161], air: 722 },
  "Moss Library": { biome: "forest", boss: 787, land: [1, 46, 590], air: 269 },

  // ── meadows: fairies, bugs & flowers ─────────────────────────────────
  "Wildflower Meadow": { biome: "meadow", boss: 786, land: [669, 546, 69], air: 742 },
  "Poppy Plains": { biome: "meadow", boss: 492, land: [182, 406, 401], air: 187 },
  "Butterfly Hollow": { biome: "meadow", boss: 637, land: [10, 265, 664], air: 267 },
  "Rainbow Fields": { biome: "meadow", boss: 250, land: [427, 209, 39], air: 165 },

  // ── cherry-blossom groves: grass, fairy & psychic ────────────────────
  "Sakura Row": { biome: "grove", boss: 488, land: [420, 495, 540], air: 189 },
  "Blossom Hollow": { biome: "grove", boss: 719, land: [152, 753, 761], air: 743 },
  "Hanami Lane": { biome: "grove", boss: 380, land: [325, 764, 238], air: 178 },

  // ── mountains: rock, ground, ice, steel & dragon ─────────────────────
  "Silver Peaks": { biome: "mountain", boss: 646, land: [361, 220, 459], air: 225 },
  "Switchback Ridge": { biome: "mountain", boss: 383, land: [74, 95, 66], air: 227 },
  "Cloud Summit": { biome: "mountain", boss: 384, land: [246, 443, 744], air: 142 },
  "Mist Pass": { biome: "mountain", boss: 487, land: [304, 111, 447], air: 714 },

  // ── lakes: water types only ──────────────────────────────────────────
  "Teal Lake": { biome: "lake", boss: 382, water: [54, 270, 60, 118], shore: [656], air: 278 },
  "Salt Shore": { biome: "lake", boss: 249, water: [120, 223], shore: [98, 341], air: 279 },
  "Mirror Water": { biome: "lake", boss: 484, water: [580, 183, 194], shore: [86], air: 581 },
};

// Per-species movement tweaks. Anything not listed walks.
//   hop     bouncy hops (rabbits, frogs, springy things)
//   waddle  short-legged rocking walk
//   slither long bodies that glide along the ground
//   hover   floats above the ground (ghosts, bugs, fairies, Magnemite …)
//   bird    flies in flocks high above (only for air species)
//   swim    floats on the water surface (water species)
export const GAIT = {
  hop: [656, 427, 659, 325, 60, 39, 35, 194, 98, 341, 183, 172, 25, 300, 191, 420, 238, 280],
  waddle: [54, 399, 52, 263, 431, 1, 152, 270, 580, 361, 220, 304, 590, 285, 568, 132, 46, 10, 265, 664, 406, 182],
  slither: [95, 208, 130],
  hover: [
    74, 81, 607, 609, 479, 63, 682, 684, 517, 12, 415, 742, 743, 187, 189, 267, 269, 165, 669, 547, 666, 764, 177, 225,
    // legendary bosses that float or fly
    150, 151, 385, 491, 251, 488, 380, 384, 249, 250, 146, 717, 641, 637, 786, 787, 719,
  ],
};

// How each walker's legs move (models ship without walk clips, so legs are animated in the
// vertex shader; wild.js measures hip height and foot spacing from the model itself).
// Species in neither list move their whole body (blobs, robes, serpents, floaters, hoppers).
export const LEGS = {
  biped: [
    52, 417, 390, 235, 677, 43, 241, 27, 84, 48, 252, 216, 161, 69, 182, 401, 209, 495, 753, 361, 459, 66, 246, 443, 447,
    54, 183, 194, 280, 644, 486, 649, 646, 383, 484,
  ],
  quad: [
    133, 506, 300, 509, 309, 58, 19, 263, 399, 676, 431, 179, 672, 128, 77, 749, 231, 570, 585, 1, 46, 152, 744, 304, 111,
    791, 485, 716, 243, 640, 244, 492, 487,
  ],
};

// Flyers whose wings flap (spread wings / big wing-like arms in the rest pose).
export const WINGS = [519, 333, 587, 661, 16, 177, 176, 441, 198, 415, 12, 21, 276, 396, 163, 731, 722, 269, 742, 187, 267, 165, 189, 743, 178, 225, 227, 142, 714, 278, 279, 581, 249, 250, 146, 717, 637];

// How deep swimmers sit in the water (fraction of their height below the surface).
export const SINK = { 382: 0.45, 484: 0.22, 130: 0.45, 131: 0.3, 120: 0.25, 223: 0.35, 54: 0.25, 270: 0.3, 60: 0.3, 580: 0.25, 183: 0.3, 194: 0.3, 118: 0.35, 86: 0.3 };

// The source rigs face +Z and get turned 180° to face the game's forward (−Z).
// Models that need a different turn (degrees) are listed here.
// Checked by eye with tools/wild-preview.html.
export const FACE = {};

// Timid species run away from you; bold ones walk up to look at you.
export const TIMID = [19, 263, 399, 427, 659, 27, 50, 585, 672, 179, 831, 241, 77, 84, 285, 1, 152, 669, 10, 265, 664, 401, 420, 132, 498, 361, 220, 304, 74];
export const CURIOUS = [52, 133, 25, 58, 506, 509, 300, 235, 677, 39, 35, 209, 216, 570, 744, 447, 66, 54, 183];

export function allSpecies() {
  const s = new Set();
  for (const r of Object.values(REGIONS)) {
    s.add(r.boss);
    for (const k of ["land", "water", "shore"]) for (const id of r[k] || []) s.add(id);
    s.add(r.air);
  }
  return [...s];
}
