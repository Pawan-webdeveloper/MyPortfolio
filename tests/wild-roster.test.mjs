import assert from "node:assert/strict";
import { readFileSync, existsSync, statSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { REGIONS, BIOME_TYPES, allSpecies, GAIT, SINK, LEGS, WINGS } from "../wild/roster.js";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const dex = JSON.parse(readFileSync(new URL("../wild/dex.json", import.meta.url), "utf8"));

// region names as the game defines them (index.html → const REG = { biome: [[name, jp, sub], …] })
function gameRegions() {
  const start = html.indexOf("const REG = {");
  const end = html.indexOf("function regionAt", start);
  const REG = vm.runInNewContext("(" + html.slice(start + "const REG = ".length, end).trim().replace(/;$/, "") + ")");
  const out = {};
  for (const [biome, list] of Object.entries(REG)) for (const [name] of list) out[name] = biome;
  return out;
}

test("every region in the game has a roster in the right biome", () => {
  const regs = gameRegions();
  assert.ok(Object.keys(regs).length >= 30, "found the game's region list");
  for (const [name, biome] of Object.entries(regs)) {
    assert.ok(REGIONS[name], `${name} needs a roster`);
    assert.equal(REGIONS[name].biome, biome, `${name} is a ${biome} region`);
  }
  for (const name of Object.keys(REGIONS)) assert.ok(regs[name], `${name} is not a region in the game`);
});

test("each region has a unique boss and no species appears twice", () => {
  const seen = new Map();
  for (const [name, r] of Object.entries(REGIONS))
    for (const id of [r.boss, ...(r.land || []), ...(r.water || []), ...(r.shore || []), r.air]) {
      assert.ok(!seen.has(id), `#${id} is in both ${seen.get(id)} and ${name}`);
      seen.set(id, name);
    }
});

test("types fit the habitat (checked against PokéAPI data in dex.json)", () => {
  for (const [name, r] of Object.entries(REGIONS)) {
    const ok = BIOME_TYPES[r.biome];
    for (const [role, ids] of [["boss", [r.boss]], ["land", r.land || []], ["water", r.water || []], ["shore", r.shore || []], ["air", [r.air]]])
      for (const id of ids) {
        const t = dex[id].types;
        assert.ok(t.some((x) => ok.includes(x)), `${dex[id].name} (${t}) in ${name}`);
        if (role === "water" || role === "shore") assert.ok(t.includes("water") || t.includes("ice"), `${dex[id].name} must be a Water type`);
        if (r.biome === "lake") assert.ok(!t.includes("fire"), `no Fire types in ${name}`);
        else assert.ok(!t.includes("water"), `${dex[id].name} is a Water type on land (${name})`);
      }
  }
});

test("every species has an optimised model and dex entry", () => {
  for (const id of allSpecies()) {
    assert.ok(dex[id], `dex entry for #${id}`);
    const f = new URL(`../models/pokemon/wild/${id}.glb`, import.meta.url);
    assert.ok(existsSync(f), `model for #${id}`);
    assert.ok(statSync(f).size < 200 * 1024, `#${id} model is under 200 KB`);
    assert.ok(dex[id].max[1] > dex[id].min[1], `#${id} has a real height`);
  }
  for (const id of [...Object.values(GAIT).flat(), ...Object.keys(SINK).map(Number)]) assert.ok(Number.isInteger(id));
});

test("the old painted animals became Pokémon without changing the seeded world", () => {
  // the painters still run (same rand() draws) but into a sink, and leave a herd spot behind
  for (const k of ["cows", "deer", "ducks", "sheep"]) assert.match(html, new RegExp(`herdOf\\("${k}"`));
  assert.match(html, /const animals = new Crowd\(ASPEC, \[\], true\)/);
  assert.match(html, /CC\.cols\.length = nc/);
});

test("everything comes from generations 1–7, and bosses span them", () => {
  const gen = (id) => [151, 251, 386, 493, 649, 721, 809].findIndex((last) => id <= last) + 1;
  for (const id of allSpecies()) assert.ok(id <= 809, `${dex[id].name} (#${id}) is newer than gen 7`);
  const bossGens = new Set(Object.values(REGIONS).map((r) => gen(r.boss)));
  for (let g = 1; g <= 7; g++) assert.ok(bossGens.has(g), `a boss from gen ${g}`);
});

test("leg / wing lists only name roster species, and none twice", () => {
  const all = new Set(allSpecies());
  const listed = [...LEGS.biped, ...LEGS.quad, ...WINGS];
  for (const id of listed) assert.ok(all.has(id), `#${id} is not in the roster`);
  assert.equal(new Set(listed).size, listed.length, "a species is in two motion lists");
});

test("deep water: lakes outside towns get deep, Greninja walks on them, others sink", () => {
  assert.match(html, /HV\.h = WATER_Y - d \* \(1 \+ 2\.5 \* k\)/);
  assert.match(html, /const ninjaFloor = \(x, z\) => Math\.max\(groundAt\(x, z\), WATER_Y/);
  assert.match(html, /startSink\("drive"\)/);
  assert.match(html, /startSink\("fly"\)/);
});
