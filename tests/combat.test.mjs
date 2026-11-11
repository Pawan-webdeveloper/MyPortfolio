import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  TYPES,
  CHART,
  rawMult,
  typeMult,
  PARTY,
  SIGNATURES,
  SHAPES,
  bossStats,
  playerHit,
  bossHit,
  PLAYER_SCALE,
  loadDefeated,
  saveDefeated,
  clamp,
} from "../wild/combat.js";
import { REGIONS } from "../wild/roster.js";

const dex = JSON.parse(readFileSync(new URL("../wild/dex.json", import.meta.url), "utf8"));
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const bosses = [...new Set(Object.values(REGIONS).map((r) => r.boss))];
const seq = (...v) => {
  let i = 0;
  return () => v[i++ % v.length];
};

test("the type chart is the real one", () => {
  assert.equal(TYPES.length, 18);
  for (const t of Object.keys(CHART)) assert.ok(TYPES.includes(t));
  assert.equal(rawMult("water", ["fire"]), 2);
  assert.equal(rawMult("fire", ["water"]), 0.5);
  assert.equal(rawMult("electric", ["ground"]), 0);
  assert.equal(rawMult("ghost", ["normal"]), 0);
  assert.equal(rawMult("psychic", ["dark"]), 0);
  assert.equal(rawMult("dragon", ["fairy"]), 0);
  assert.equal(rawMult("ice", ["dragon", "flying"]), 4); // Rayquaza's weakness
  assert.equal(rawMult("ghost", ["psychic"]), 2); // Gengar vs Mewtwo
});

test("immunities and 4× are softened for the arena", () => {
  assert.equal(typeMult("psychic", ["dark"]), 0.25);
  assert.equal(typeMult("ice", ["dragon", "flying"]), 2.25);
  assert.equal(typeMult("normal", ["normal"]), 1);
});

test("your three Pokémon have four real moves each", () => {
  assert.deepEqual(PARTY.map((p) => p.name), ["Charizard", "Gengar", "Greninja"]);
  const kinds = new Set(["projectile", "multi", "melee", "dash", "cone", "beam", "lob", "strike", "ring"]);
  for (const p of PARTY) {
    assert.equal(p.moves.length, 4, p.name);
    assert.ok(p.hp >= 100 && p.hp <= 160);
    for (const m of p.moves) {
      assert.ok(TYPES.includes(m.type), `${m.n} type`);
      assert.ok(kinds.has(m.kind), `${m.n} kind`);
      assert.ok(m.cd > 0 && m.power > 0, `${m.n} numbers`);
    }
  }
});

test("all 32 bosses have a signature move and four dodgeable attacks", () => {
  assert.equal(bosses.length, 32);
  for (const id of bosses) {
    const b = bossStats(id, dex[id]);
    assert.ok(SIGNATURES[id], `${b.name} signature`);
    assert.equal(b.moves.length, 4, `${b.name} has 4 moves`);
    assert.equal(new Set(b.moves.map((m) => m.n)).size, 4, `${b.name} moves are distinct`);
    for (const m of b.moves) assert.ok(SHAPES.includes(m.shape), `${b.name} ${m.n}`);
    assert.ok(b.moves.some((m) => ["swipe", "slam", "dash"].includes(m.shape)), `${b.name} close attack`);
    assert.ok(b.moves.some((m) => ["beam", "volley", "rain"].includes(m.shape)), `${b.name} ranged attack`);
    assert.ok(b.hp >= 1650 && b.hp <= 2550, `${b.name} hp ${b.hp}`);
  }
});

test("damage: STAB, type matchups, crits, never zero", () => {
  const mewtwo = bossStats(150, dex[150]),
    [char, gengar, gren] = PARTY;
  const flat = seq(0.99, 0.5); // no crit, middle variance
  const shadowBall = gengar.moves[0];
  assert.equal(playerHit(shadowBall, gengar, mewtwo, flat).dmg, Math.round(80 * PLAYER_SCALE * 1.5 * 2)); // STAB + super effective
  const psy = mewtwo.moves.find((m) => m.type === "psychic");
  assert.ok(bossHit(psy, mewtwo, gren, flat).dmg < bossHit(psy, mewtwo, gengar, flat).dmg / 2, "Greninja resists Psychic, Gengar doesn't");
  assert.ok(playerHit(shadowBall, gengar, mewtwo, seq(0.05, 0.5)).dmg > playerHit(shadowBall, gengar, mewtwo, flat).dmg, "crit");
  for (let i = 0; i < 300; i++) {
    const b = bossStats(bosses[i % 32], dex[bosses[i % 32]]),
      p = PARTY[i % 3];
    const h = bossHit(b.moves[i % 4], b, p).dmg;
    assert.ok(h >= 1 && h < p.hp * 0.6, "a boss hit never one-shots you");
    assert.ok(bossHit(b.moves[i % 4], b, p, seq(0.99, 0.5)).dmg >= p.hp * 0.06, "hard mode: every boss hit hurts");
    assert.ok(playerHit(p.moves[i % 4], p, b).dmg >= 1);
  }
});

test("a fight lasts a while: no move takes more than a fifth of a boss", () => {
  for (const id of bosses) {
    const b = bossStats(id, dex[id]);
    for (const p of PARTY) for (const m of p.moves) assert.ok(playerHit(m, p, b, seq(0.05, 0.99)).dmg < b.hp / 5, `${m.n} vs ${b.name}`);
  }
});

test("beaten bosses survive a save/load round-trip and version checks", () => {
  const mem = new Map();
  const shim = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const set = loadDefeated(shim);
  assert.equal(set.size, 0);
  set.add("town0,-1");
  saveDefeated(set, shim);
  assert.deepEqual([...loadDefeated(shim)], ["town0,-1"]);
  mem.set("pw-bosses", JSON.stringify({ v: 99, defeated: ["x"] }));
  assert.equal(loadDefeated(shim).size, 0);
  mem.set("pw-bosses", "not json");
  assert.equal(loadDefeated(shim).size, 0);
});

test("the arena is wired in: challenge on E, own scene, beaten bosses leave", () => {
  assert.match(html, /mon\.kind === "boss" && battle\) battle\.offer\(mon\)/);
  assert.match(html, /renderer\.render\(arena \? battle\.scene : scene, camera\)/);
  const wild = readFileSync(new URL("../wild/wild.js", import.meta.url), "utf8");
  assert.match(wild, /if \(L\.status !== "ready" \|\| defeated\.has\(L\.rid\)\)/);
});

test("touch buttons: labels fit, NINJA became Settings", () => {
  assert.match(html, /<span class="t">SWITCH<\/span>/);
  assert.match(html, /<span class="t">SETTINGS<\/span>/);
  assert.match(html, /\.tb span\.t\{display:block;font-size:8\.5px/);
  assert.match(html, /act === "g" && settings\) settings\.open\(\)/);
});

test("hard mode: the boss dodges, chains attacks and Greninja keeps its feet on the floor", () => {
  const src = readFileSync(new URL("../wild/battle.js", import.meta.url), "utf8");
  const hard = Function(`return (${src.match(/const HARD = (\{[^}]*\});/)[1]})`)();
  assert.ok(hard.evade >= 0.3 && hard.evadeEnraged > hard.evade, "the boss sidesteps, more when enraged");
  assert.ok(hard.track >= 0.7 && hard.track < 0.9, "aimed attacks lock late, but leave time to react");
  assert.match(src, /function bossEvade\(\)/);
  assert.match(src, /B\.iframe > 0/); // a sidestepping boss can't be hit
  assert.match(src, /mm\.footOf/); // per-clip foot height: no sinking into the floor
  assert.match(src, /hurtPlayer\(s\.move, s\.x - s\.vx, s\.z - s\.vz, 0\.5\)/); // one volley shot ≠ the whole move
  // a volley can't delete a Pokémon: two shots of the strongest one stay under its max HP
  const xerneas = bossStats(716, dex[716]),
    moonblast = xerneas.moves.find((m) => m.shape === "volley");
  for (const p of PARTY) assert.ok(bossHit(moonblast, xerneas, p, seq(0.05, 0.99)).dmg * 0.5 * 2 < p.hp, p.name);
});

test("clamp is inclusive", () => {
  assert.equal(clamp(5, 0, 1), 1);
  assert.equal(clamp(-1, 0, 1), 0);
});
