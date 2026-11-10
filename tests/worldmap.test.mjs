import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const map = readFileSync(new URL("../nav/worldmap.js", import.meta.url), "utf8");

test("M and the minimap open the full map; Esc/M/Back close it", () => {
  assert.match(html, /if \(k === "m" && worldMap\) worldMap\.open\(\)/);
  assert.match(html, /\$\("minimap"\)\.addEventListener\("click"/);
  assert.match(map, /k === "m" \|\| k === "escape" \|\| k === "backspace"/);
  assert.match(map, /id="wmBack"/);
});

test("routes avoid deep water when driving, but not for Greninja on foot", () => {
  const cost = map.slice(map.indexOf("function cellCost"), map.indexOf("class Router"));
  const walk = cost.slice(0, cost.indexOf('if (onRoad) return 1;\n    if (deepWater'));
  assert.doesNotMatch(walk, /deepWater/);
  assert.match(cost, /if \(deepWater\(x, z\)\) return Infinity/);
});

test("on phones the place name is a small black caption that clears quickly", () => {
  assert.match(html, /body\.touch #title \.big\{font-size:21px;color:#1f1d2b/);
  assert.match(html, /contains\("touch"\) \? 1500 : 3200/);
});
