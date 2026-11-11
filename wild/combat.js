// Boss-battle data and math for Pawan World.
//
// Pure data + functions (no DOM, no three.js): wild/battle.js runs the arena fight,
// tests/combat.test.mjs checks the numbers.
//
// The fight is real-time: your three Pokémon (Charizard, Gengar, Greninja) against one
// region boss. Every Pokémon has four real moves with its real types; damage uses the real
// type chart, STAB and crits, scaled to arena-sized HP bars:
//   dmg = power × scale × STAB(1.5) × typeMult × variance(0.9–1.1) × crit(1.5)
// Moves share a 0.5 s global cooldown (battle.js), so a fight lasts about one to two minutes.
// Immunities don't zero a hit (×0.25) so no boss is unbeatable, and 4× caps at 2.5×.
import { GAIT, WINGS, LEGS } from "./roster.js";

export const TYPES = ["normal", "fire", "water", "electric", "grass", "ice", "fighting", "poison", "ground", "flying", "psychic", "bug", "rock", "ghost", "dragon", "dark", "steel", "fairy"];

/* attacking type → defending type multipliers that aren't 1 (the real chart, gen 6+) */
export const CHART = {
  normal: { rock: 0.5, ghost: 0, steel: 0.5 },
  fire: { fire: 0.5, water: 0.5, grass: 2, ice: 2, bug: 2, rock: 0.5, dragon: 0.5, steel: 2 },
  water: { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
  electric: { water: 2, electric: 0.5, grass: 0.5, ground: 0, flying: 2, dragon: 0.5 },
  grass: { fire: 0.5, water: 2, grass: 0.5, poison: 0.5, ground: 2, flying: 0.5, bug: 0.5, rock: 2, dragon: 0.5, steel: 0.5 },
  ice: { fire: 0.5, water: 0.5, grass: 2, ice: 0.5, ground: 2, flying: 2, dragon: 2, steel: 0.5 },
  fighting: { normal: 2, ice: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, rock: 2, ghost: 0, dark: 2, steel: 2, fairy: 0.5 },
  poison: { grass: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0, fairy: 2 },
  ground: { fire: 2, electric: 2, grass: 0.5, poison: 2, flying: 0, bug: 0.5, rock: 2, steel: 2 },
  flying: { electric: 0.5, grass: 2, fighting: 2, bug: 2, rock: 0.5, steel: 0.5 },
  psychic: { fighting: 2, poison: 2, psychic: 0.5, dark: 0, steel: 0.5 },
  bug: { fire: 0.5, grass: 2, fighting: 0.5, poison: 0.5, flying: 0.5, psychic: 2, ghost: 0.5, dark: 2, steel: 0.5, fairy: 0.5 },
  rock: { fire: 2, ice: 2, fighting: 0.5, ground: 0.5, flying: 2, bug: 2, steel: 0.5 },
  ghost: { normal: 0, psychic: 2, ghost: 2, dark: 0.5 },
  dragon: { dragon: 2, steel: 0.5, fairy: 0 },
  dark: { fighting: 0.5, psychic: 2, ghost: 2, dark: 0.5, fairy: 0.5 },
  steel: { fire: 0.5, water: 0.5, electric: 0.5, ice: 2, rock: 2, steel: 0.5, fairy: 2 },
  fairy: { fire: 0.5, fighting: 2, poison: 0.5, dragon: 2, dark: 2, steel: 0.5 },
};

/** the real multiplier of one attack type against a (single or dual) type */
export function rawMult(atk, defTypes) {
  const row = CHART[atk] || {};
  let m = 1;
  for (const t of defTypes) m *= row[t] ?? 1;
  return m;
}
/** the arena's multiplier: immunities become ×0.25, 4× is capped at 2.25× */
export function typeMult(atk, defTypes) {
  const m = rawMult(atk, defTypes);
  return m === 0 ? 0.25 : clamp(m, 0.25, 2.25);
}
export function effectLabel(m) {
  return m === 0 || m <= 0.26 ? "It barely affects it…" : m < 1 ? "Not very effective…" : m > 1 ? "It's super effective!" : "";
}

export const TYPE_COLORS = {
  normal: "#cfcabc", fire: "#ff7a3c", water: "#4fa4ff", electric: "#ffd94a", grass: "#5cc46a", ice: "#9fdcff",
  fighting: "#d65a4a", poison: "#b45aff", ground: "#d9b06a", flying: "#a8c0ff", psychic: "#ff6bd6", bug: "#a8c93a",
  rock: "#c9b184", ghost: "#8a6bd6", dragon: "#7a5cff", dark: "#5a4a6a", steel: "#b8c4cc", fairy: "#ffa8d8",
};

/* ---------------- your team ----------------
   kind: projectile (aimed shot) · multi (spread of shots) · melee (arc in front) · dash (lunge + hit)
         cone (short-range fan) · beam (instant line) · lob (lands on the target after a delay, AOE)
         strike (lightning on the target) · ring (burst around you)
   power is the real base power; cd is the cooldown in seconds. */
export const PARTY = [
  {
    key: "charizard",
    name: "Charizard",
    types: ["fire", "flying"],
    hp: 138,
    speed: 10,
    flies: true,
    moves: [
      { n: "Flamethrower", type: "fire", kind: "cone", power: 90, cd: 1.6, range: 12, arc: 0.55 },
      { n: "Air Slash", type: "flying", kind: "projectile", power: 75, cd: 0.8, range: 40, speed: 34, size: 0.7, look: "blade" },
      { n: "Dragon Claw", type: "dragon", kind: "melee", power: 80, cd: 0.7, range: 6, arc: 1 },
      { n: "Fire Blast", type: "fire", kind: "lob", power: 110, cd: 6, range: 34, radius: 5.5, delay: 0.55 },
    ],
  },
  {
    key: "gengar",
    name: "Gengar",
    types: ["ghost", "poison"],
    hp: 122,
    speed: 10.5,
    floats: true,
    moves: [
      { n: "Shadow Ball", type: "ghost", kind: "projectile", power: 80, cd: 1, range: 40, speed: 26, size: 0.8 },
      { n: "Sludge Bomb", type: "poison", kind: "lob", power: 90, cd: 3.2, range: 32, radius: 4.5, delay: 0.6 },
      { n: "Thunderbolt", type: "electric", kind: "strike", power: 90, cd: 3, range: 40, delay: 0.35 },
      { n: "Shadow Claw", type: "ghost", kind: "melee", power: 70, cd: 0.6, range: 5.5, arc: 1 },
    ],
  },
  {
    key: "greninja",
    name: "Greninja",
    types: ["water", "dark"],
    hp: 128,
    speed: 11.5,
    moves: [
      { n: "Water Shuriken", type: "water", kind: "multi", power: 20, shots: 3, cd: 0.8, range: 40, speed: 36, size: 0.5, spread: 0.12, look: "shuriken" },
      { n: "Night Slash", type: "dark", kind: "dash", power: 70, cd: 1.2, range: 12, lunge: 10 },
      { n: "Hydro Pump", type: "water", kind: "beam", power: 110, cd: 5, range: 30, width: 2.6 },
      { n: "Dark Pulse", type: "dark", kind: "ring", power: 80, cd: 3, radius: 10 },
    ],
  },
];

/* ---------------- bosses ----------------
   Every boss has its signature move plus three typed moves. Each move uses one of the
   boss attack shapes — all telegraphed on the ground, all dodgeable:
     swipe  arc in front of the boss          slam   ring around the boss
     dash   charge along a line               beam   long line aimed at you
     volley shots fired at you                rain   circles dropped on and around you */
export const SIGNATURES = {
  150: { n: "Psystrike", type: "psychic", shape: "rain", power: 100 },
  791: { n: "Sunsteel Strike", type: "steel", shape: "dash", power: 100 },
  644: { n: "Bolt Strike", type: "electric", shape: "dash", power: 110 },
  485: { n: "Magma Storm", type: "fire", shape: "slam", power: 100 },
  146: { n: "Sky Attack", type: "flying", shape: "dash", power: 110 },
  151: { n: "Ancient Power", type: "rock", shape: "volley", power: 80 },
  716: { n: "Moonblast", type: "fairy", shape: "volley", power: 95 },
  385: { n: "Doom Desire", type: "steel", shape: "rain", power: 110 },
  491: { n: "Dark Void", type: "dark", shape: "slam", power: 100 },
  243: { n: "Thunder", type: "electric", shape: "rain", power: 110 },
  640: { n: "Sacred Sword", type: "fighting", shape: "swipe", power: 90 },
  486: { n: "Crush Grip", type: "normal", shape: "swipe", power: 110 },
  244: { n: "Eruption", type: "fire", shape: "rain", power: 110 },
  641: { n: "Bleakwind Storm", type: "flying", shape: "slam", power: 100 },
  717: { n: "Oblivion Wing", type: "flying", shape: "beam", power: 90 },
  251: { n: "Leaf Storm", type: "grass", shape: "volley", power: 100 },
  649: { n: "Techno Blast", type: "normal", shape: "beam", power: 110 },
  787: { n: "Nature's Madness", type: "fairy", shape: "slam", power: 90 },
  786: { n: "Psyshock", type: "psychic", shape: "rain", power: 90 },
  492: { n: "Seed Flare", type: "grass", shape: "slam", power: 110 },
  637: { n: "Fiery Dance", type: "fire", shape: "volley", power: 90 },
  250: { n: "Sacred Fire", type: "fire", shape: "beam", power: 100 },
  488: { n: "Psycho Cut", type: "psychic", shape: "volley", power: 80 },
  719: { n: "Diamond Storm", type: "rock", shape: "rain", power: 100 },
  380: { n: "Mist Ball", type: "psychic", shape: "volley", power: 95 },
  646: { n: "Glaciate", type: "ice", shape: "slam", power: 95 },
  383: { n: "Precipice Blades", type: "ground", shape: "rain", power: 120 },
  384: { n: "Dragon Ascent", type: "flying", shape: "dash", power: 120 },
  487: { n: "Shadow Force", type: "ghost", shape: "dash", power: 120 },
  382: { n: "Origin Pulse", type: "water", shape: "slam", power: 110 },
  249: { n: "Aeroblast", type: "flying", shape: "beam", power: 100 },
  484: { n: "Spacial Rend", type: "dragon", shape: "beam", power: 110 },
};

/* typed moves (real names) for the boss's other three slots */
export const TYPE_MOVES = {
  normal: [["Hyper Voice", "slam", 90], ["Body Slam", "dash", 85], ["Swift", "volley", 60]],
  fire: [["Flamethrower", "beam", 90], ["Fire Blast", "rain", 110], ["Flame Charge", "dash", 70]],
  water: [["Hydro Pump", "beam", 110], ["Surf", "slam", 90], ["Water Pulse", "volley", 60]],
  electric: [["Thunderbolt", "rain", 90], ["Discharge", "slam", 80], ["Wild Charge", "dash", 90]],
  grass: [["Solar Beam", "beam", 120], ["Petal Blizzard", "slam", 90], ["Magical Leaf", "volley", 60]],
  ice: [["Ice Beam", "beam", 90], ["Blizzard", "rain", 110], ["Ice Shard", "volley", 60]],
  fighting: [["Close Combat", "swipe", 110], ["Aura Sphere", "volley", 80], ["Drain Punch", "dash", 75]],
  poison: [["Sludge Bomb", "rain", 90], ["Poison Jab", "swipe", 80], ["Gunk Shot", "volley", 90]],
  ground: [["Earthquake", "slam", 100], ["Earth Power", "rain", 90], ["Bulldoze", "dash", 60]],
  flying: [["Air Slash", "volley", 75], ["Hurricane", "rain", 110], ["Brave Bird", "dash", 110]],
  psychic: [["Psychic", "rain", 90], ["Psybeam", "beam", 65], ["Zen Headbutt", "dash", 80]],
  bug: [["Bug Buzz", "slam", 90], ["Signal Beam", "beam", 75], ["X-Scissor", "swipe", 80]],
  rock: [["Stone Edge", "rain", 100], ["Rock Slide", "volley", 75], ["Head Smash", "dash", 120]],
  ghost: [["Shadow Ball", "volley", 80], ["Shadow Claw", "swipe", 70], ["Hex", "rain", 65]],
  dragon: [["Dragon Pulse", "beam", 85], ["Draco Meteor", "rain", 130], ["Dragon Claw", "swipe", 80]],
  dark: [["Dark Pulse", "slam", 80], ["Crunch", "swipe", 80], ["Night Daze", "volley", 85]],
  steel: [["Flash Cannon", "beam", 80], ["Iron Tail", "swipe", 100], ["Meteor Mash", "dash", 90]],
  fairy: [["Moonblast", "volley", 95], ["Dazzling Gleam", "slam", 80], ["Play Rough", "swipe", 90]],
};
export const SHAPES = ["swipe", "slam", "dash", "beam", "volley", "rain"];

const FLYERS = new Set([...WINGS, ...GAIT.hover]);

/** the boss's four moves: signature first, then typed moves with varied shapes */
export function bossMoves(id, e) {
  const sig = SIGNATURES[id] || { n: TYPE_MOVES[e.types[0]][0][0], type: e.types[0], shape: TYPE_MOVES[e.types[0]][0][1], power: TYPE_MOVES[e.types[0]][0][2] };
  const out = [{ ...sig, sig: true }];
  const pool = [];
  for (const t of e.types) for (const [n, shape, power] of TYPE_MOVES[t] || []) pool.push({ n, type: t, shape, power });
  // prefer shapes the boss doesn't have yet, and moves of its first type
  for (const m of pool) {
    if (out.length >= 4) break;
    if (out.some((o) => o.n === m.n || o.shape === m.shape)) continue;
    out.push(m);
  }
  for (const m of [...pool, ...TYPE_MOVES.normal.map(([n, shape, power]) => ({ n, type: "normal", shape, power }))]) {
    if (out.length >= 4) break;
    if (!out.some((o) => o.n === m.n)) out.push(m);
  }
  // every boss needs something for close range and something for far away
  const close = (s) => s === "swipe" || s === "slam" || s === "dash",
    far = (s) => s === "beam" || s === "volley" || s === "rain";
  if (!out.some((m) => close(m.shape))) out[3] = { n: FLYERS.has(id) ? "Wing Attack" : "Body Slam", type: FLYERS.has(id) ? "flying" : "normal", shape: FLYERS.has(id) ? "dash" : "slam", power: 75 };
  if (!out.some((m) => far(m.shape))) out[3] = { n: "Swift", type: "normal", shape: "volley", power: 60 };
  return out.slice(0, 4);
}

/** boss stat block from its dex entry */
export function bossStats(id, e) {
  return {
    name: e.name,
    types: e.types,
    hp: Math.round(1500 + clamp(e.height, 1, 7) * 150), // hard mode: a boss is a long fight
    moves: bossMoves(id, e),
    flies: FLYERS.has(id),
    quad: LEGS.quad.includes(id),
  };
}

/* ---------------- damage ---------------- */
// Hard mode: three or four clean hits knock out one of your Pokémon, so every attack has to be dodged.
export const PLAYER_SCALE = 0.1,
  BOSS_SCALE = 0.22;

/** a hit with `move` from a Pokémon of `atkTypes` on `defTypes`. Returns { dmg, crit, mult } */
export function damage(move, atkTypes, defTypes, scale, rnd = Math.random) {
  const stab = atkTypes.includes(move.type) ? 1.5 : 1,
    mult = typeMult(move.type, defTypes),
    crit = rnd() < 0.1;
  const dmg = Math.max(1, Math.round(move.power * scale * stab * mult * (0.9 + rnd() * 0.2) * (crit ? 1.5 : 1)));
  return { dmg, crit, mult: rawMult(move.type, defTypes) };
}
export const playerHit = (move, attacker, boss, rnd) => damage(move, attacker.types, boss.types, PLAYER_SCALE, rnd);
/** boss hits: resistances only halve them (no hiding behind a type), and they're capped at half
 *  your Pokémon's max HP, so even a lucky crit never one-shots you */
export const bossHit = (move, boss, defender, rnd = Math.random) => {
  const stab = boss.types.includes(move.type) ? 1.5 : 1,
    mult = Math.max(0.5, typeMult(move.type, defender.types)),
    crit = rnd() < 0.1;
  const dmg = Math.max(1, Math.round(move.power * BOSS_SCALE * stab * mult * (0.9 + rnd() * 0.2) * (crit ? 1.5 : 1)));
  return { dmg: Math.min(dmg, Math.round(defender.hp * 0.5)), crit, mult: rawMult(move.type, defender.types) };
};

export function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

/* ---------- defeated-boss persistence (versioned) ---------- */
const KEY = "pw-bosses";

export function loadDefeated(storage = globalThis.localStorage) {
  try {
    const raw = JSON.parse(storage.getItem(KEY));
    if (!raw || raw.v !== 1) return new Set();
    return new Set(raw.defeated || []);
  } catch (_) {
    return new Set();
  }
}

export function saveDefeated(set, storage = globalThis.localStorage) {
  try {
    storage.setItem(KEY, JSON.stringify({ v: 1, defeated: [...set] }));
  } catch (_) {}
}
