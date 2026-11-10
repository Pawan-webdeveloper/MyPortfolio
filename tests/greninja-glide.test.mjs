import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const utils = ['clamp', 'damp'].map(name => html.match(new RegExp(`const ${name} = [^;]+;`))[0]).join('\n');
function functionSource(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const brace = html.indexOf('{', start);
  let depth = 1, end = brace + 1;
  while (depth && end < html.length) {
    if (html[end] === '{') depth++;
    if (html[end] === '}') depth--;
    end++;
  }
  return html.slice(start, end);
}
function getStep() {
  const step = vm.runInNewContext(`${utils}\n${functionSource('stepNinjaGlide')}\nstepNinjaGlide`);
  return (s, floor, turn, boost, dt) => step(s, floor, turn, boost, dt, () => {});
}
function getUpdate(car, floor, collision, landing = 0) {
  const ctx = {
    car,
    ninja: { gliding: !landing, landing, pitch: 0, bank: 0 },
    keys: {},
    game: { boost: 0 },
    groundAt: floor,
    ninjaFloor: floor,
    obstacleTop: () => 10,
    collide: () => collision(car),
    greninjaBody: { rotation: { set() {} } },
    carPos: { copy() {} },
    YUP: {},
    A: {},
    sfxThud() {},
    spawnBurst() {},
    V3: () => ({ set() { return this; } }),
    nLand: { getClip: () => ({ duration: 0.683333 }), reset() { return this; }, play() {} },
    nFall: { reset() { return this; }, play() {} },
  };
  car.g = { position: { set() {} }, quaternion: { setFromAxisAngle() {} } };
  vm.createContext(ctx);
  vm.runInContext(`${utils}\n${['stepNinjaGlide', 'landNinja', 'updateNinjaGlide'].map(functionSource).join('\n')}`, ctx);
  return ctx;
}
const state = (extra = {}) => ({ x: 0, y: 80, z: 0, heading: 0, v: 38, vy: 0, air: true, ...extra });

test('gliding retains airborne position and forward momentum on its first frame', () => {
  const step = getStep(), s = state();
  step(s, () => 0, 0, false, 1 / 60);
  assert.ok(s.y > 79.8 && s.y < 80);
  assert.ok(s.z < -0.6 && s.v > 37);
  assert.equal(s.air, true);
});

test('descent remains continuous, lands on terrain, and settles at walking speed', () => {
  const step = getStep(), s = state();
  let landed = false;
  for (let i = 0; i < 1200 && !landed; i++) {
    const y = s.y;
    landed = step(s, () => 0, 0, false, 1 / 60);
    assert.ok(s.y <= y && y - s.y < 0.5);
    assert.ok(s.y >= 0);
  }
  assert.equal(landed, true);
  assert.equal(s.y, 0);
  assert.equal(s.air, false);
  assert.equal(s.vy, 0);
  assert.ok(s.v <= 5.2);
});

test('glide can steer without changing altitude discontinuously', () => {
  const step = getStep(), s = state();
  for (let i = 0; i < 30; i++) step(s, () => 0, 1, false, 1 / 60);
  assert.ok(s.heading > 0 && s.x < -1);
  assert.ok(s.y > 70 && s.y < 80);
});

test('30, 60, and 120 fps produce consistent descent and landing times', () => {
  const step = getStep();
  const simulate = fps => {
    const s = state();
    let elapsed = 0;
    while (s.air && elapsed < 20) {
      step(s, () => 0, 0, false, 1 / fps);
      elapsed += 1 / fps;
    }
    return { s, elapsed };
  };
  const a = simulate(30), b = simulate(60), c = simulate(120);
  assert.ok(Math.abs(a.elapsed - c.elapsed) < 0.1);
  assert.ok(Math.abs(a.s.z - c.s.z) < 1);
  assert.ok(Math.abs(b.s.z - c.s.z) < 0.5);
});

test('climbing momentum is preserved before the glide naturally descends', () => {
  const step = getStep(), s = state({ vy: 15 });
  step(s, () => 0, 0, false, 1 / 60);
  assert.ok(s.vy > 0 && s.y > 80);
  for (let i = 0; i < 60; i++) step(s, () => 0, 0, false, 1 / 60);
  assert.ok(s.vy < 0);
});

test('landing samples the ground under the new position and never penetrates a slope', () => {
  const step = getStep(), s = state(), floor = (x, z) => 8 + Math.abs(z) * 0.01;
  for (let i = 0; i < 1200 && s.air; i++) {
    step(s, floor, 0, false, 1 / 60);
    assert.ok(s.y >= floor(s.x, s.z));
  }
  assert.equal(s.air, false);
  assert.equal(s.y, floor(s.x, s.z));
});

test('collision correction samples contact at the corrected position', () => {
  const s = state({ y: 0.2, v: 5.2, vy: -4.5 });
  const ctx = getUpdate(s, x => x, car => { car.x = 1; });
  ctx.updateNinjaGlide(1 / 60);
  assert.equal(s.x, 1);
  assert.ok(s.y >= 1, 'collision must not leave Greninja below the corrected terrain');
  assert.equal(s.air, false);
  assert.ok(ctx.ninja.landing > 0);
});

test('landing slide leaving a ramp resumes descent instead of teleporting down', () => {
  const s = state({ y: 4, z: -0.05, v: 5.2, air: false });
  const floor = (x, z) => z >= -0.06 ? 4 : 0;
  const ctx = getUpdate(s, floor, () => {}, 0.6);
  ctx.updateNinjaGlide(1 / 60);
  assert.ok(s.y > 3.5, 'a ramp edge must not snap Greninja to the lower ground');
  assert.equal(s.air, true);
  assert.equal(ctx.ninja.gliding, true);
  assert.equal(ctx.ninja.landing, 0);
  ctx.updateNinjaGlide(1 / 60);
  assert.ok(s.y < 4 && s.y > 3.5);
});

function getAppearance(ninja) {
  const details = [{ visible: false }, { visible: false }];
  const ctx = {
    ninja,
    ninjaDetails: details,
    glider: { on: true, kind: 'eagle' },
    car: { skin: {} },
    roverSkin: {},
    humanSkin: {},
  };
  vm.createContext(ctx);
  vm.runInContext(functionSource('animatePokemon'), ctx);
  return { update: () => ctx.animatePokemon(1 / 60), details };
}

test('Ash details last through the glide and landing, then return to normal', () => {
  const ninja = { awakened: true, gliding: true, landing: 0 };
  const look = getAppearance(ninja);
  look.update();
  assert.ok(look.details.every(detail => detail.visible));
  ninja.gliding = false;
  ninja.landing = 0.4;
  look.update();
  assert.ok(look.details.every(detail => detail.visible));
  ninja.landing = 0;
  look.update();
  assert.equal(ninja.awakened, false);
  assert.ok(look.details.every(detail => !detail.visible));
});

test('ordinary ground-jump landings do not awaken normal Greninja', () => {
  const ninja = { awakened: false, gliding: false, landing: 0.4 };
  const look = getAppearance(ninja);
  look.update();
  assert.ok(look.details.every(detail => !detail.visible));
  assert.equal(ninja.awakened, false);
});
