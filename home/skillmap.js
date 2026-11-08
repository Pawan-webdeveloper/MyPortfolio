// SKILLS region map: a top-down pixel-art overworld in the style of classic handheld RPGs.
// All art is original and drawn in code: 16×16 tiles, a small trainer sprite of Pawan, and one
// landmark per skill town. Walk with arrows/WASD or the D-pad, tap a spot to walk there, and press
// A (Enter/Space) to read a town's sign. The camera follows the trainer with crisp integer scaling.

const TS = 16;
const COLS = 40, ROWS = 26;
const WPX = COLS * TS, HPX = ROWS * TS;
const T = { GRASS: 0, TALL: 1, PATH: 2, WATER: 3, TREE: 4, ROCK: 5, FLOWER: 6, FENCE: 7, SIGN: 8, SAND: 9, DOCK: 10, BRIDGE: 11, BLD: 12 };
const WALKABLE = new Set([T.GRASS, T.TALL, T.PATH, T.FLOWER, T.SAND, T.DOCK, T.BRIDGE]);
const PATHLIKE = new Set([T.PATH, T.BRIDGE]);

const P = {
  grass: "#9ad36a", grassD: "#79b84f", grassL: "#bfe68a",
  tall: "#5aa94a", tallD: "#2f6b2e", tallL: "#8fd36b",
  path: "#ead9a2", pathD: "#d4bf84", pathE: "#bfa56a",
  water: "#5fb9ee", waterD: "#3f97d6", waterL: "#a6dcf8", foam: "#e3f6fd",
  sand: "#f0e2b0", sandD: "#ddc98f",
  treeK: "#1f4226", treeL: "#7fcf6e", treeG: "#47a34f", treeD: "#2c763a", trunk: "#7a5232",
  shadow: "rgba(20,40,20,0.22)",
  ink: "#1f1d2b", wall: "#f3ead6", wallD: "#d8cbb0", win: "#9fd3f0", winD: "#5a9fcf", door: "#6b4a2e", doorD: "#4a321f",
  rock: "#a8916c", rockD: "#7f6a4c", rockL: "#c9b58c", rockK: "#4b3f2e",
  wood: "#b98b56", woodD: "#8a6239", woodK: "#5a3d22",
};

const hash = (x, y) => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return (h ^ (h >>> 16)) >>> 0;
};
function seeded(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

/* ------------------------------------------------------------------ map */
// Town anchors (the tile the trainer stands on in front of each landmark's door), routes between
// them as axis-aligned waypoints, and each landmark's footprint.
const ANCHOR = { front: [6, 19], back: [14, 9], data: [21, 20], ai: [28, 9], ops: [32, 17] };
const ROUTE = [
  [6, 19], [11, 19], [11, 12], [14, 12], [14, 9], [14, 12], [16, 12], [16, 22], [21, 22], [21, 20],
  [21, 22], [25, 22], [25, 10], [28, 10], [28, 9], [28, 10], [28, 18], [32, 18], [32, 17], [32, 18], [37, 18],
];

function buildMap(towns) {
  const g = new Uint8Array(COLS * ROWS).fill(T.GRASS);
  const get = (x, y) => (x < 0 || y < 0 || x >= COLS || y >= ROWS ? T.TREE : g[y * COLS + x]);
  const set = (x, y, v) => x >= 0 && y >= 0 && x < COLS && y < ROWS && (g[y * COLS + x] = v);
  const rnd = seeded(7331);
  const anchors = towns.map((t) => ANCHOR[t.id] || [Math.round((t.x / 100) * (COLS - 6)) + 3, Math.round((t.y / 100) * (ROWS - 6)) + 3]);

  // sea on the east, with a sandy beach
  const shore = (y) => 36 + (y < 9 ? 1 : 0) + Math.round(Math.sin(y * 0.7) * 0.6);
  for (let y = 0; y < ROWS; y++) {
    const s = shore(y);
    for (let x = s; x < COLS; x++) set(x, y, T.WATER);
    set(s - 1, y, T.SAND);
  }
  // pond near Frontend Town
  for (let y = 3; y <= 11; y++) for (let x = 2; x <= 10; x++) if (((x - 6) / 3.6) ** 2 + ((y - 7) / 2.9) ** 2 < 1) set(x, y, T.WATER);

  // routes (2 tiles wide), bridges where they cross water, a dock into the sea
  const carve = (x, y) => {
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const v = get(x + dx, y + dy);
      if (v === T.WATER) set(x + dx, y + dy, x + dx >= shore(y + dy) - 1 ? T.DOCK : T.BRIDGE);
      else set(x + dx, y + dy, v === T.SAND ? T.DOCK : T.PATH);
    }
  };
  for (let i = 1; i < ROUTE.length; i++) {
    let [x, y] = ROUTE[i - 1];
    const [x1, y1] = ROUTE[i];
    carve(x, y);
    while (x !== x1 || y !== y1) {
      x += Math.sign(x1 - x);
      y += Math.sign(y1 - y);
      carve(x, y);
    }
  }
  // the last stretch of route into the sea is a wooden dock
  for (let x = shore(18) - 2; x < COLS; x++) for (const y of [18, 19]) if (get(x, y) !== T.GRASS) set(x, y, x >= shore(y) - 1 ? T.DOCK : T.PATH);

  // landmarks (blocked footprints; the door tile stays walkable)
  const lm = [];
  const place = (kind, x, y, w, h, door, town = -1) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) set(i, j, T.BLD);
    lm.push({ kind, x, y, w, h, door, town });
  };
  towns.forEach((t, i) => {
    const [ax, ay] = anchors[i];
    const door = [ax, ay - 1];
    if (t.id === "front") {
      place("house", ax - 2, ay - 5, 4, 5, door, i);
      place("cottage", ax + 3, ay - 4, 3, 3, null);
    } else if (t.id === "back") place("hq", ax - 3, ay - 6, 7, 6, door, i);
    else if (t.id === "data") place("cave", ax - 3, ay - 5, 7, 5, door, i);
    else if (t.id === "ai") place("tower", ax - 1, ay - 8, 3, 8, door, i);
    else if (t.id === "ops") {
      place("warehouse", ax - 2, ay - 5, 5, 5, door, i);
      place("containers", ax - 2, ay - 8, 3, 2, null);
    } else place("house", ax - 2, ay - 5, 4, 5, door, i);
  });
  const doors = new Map();
  for (const l of lm) if (l.door) doors.set(l.door[1] * COLS + l.door[0], l.town);

  // signposts beside each town
  const signs = new Map();
  anchors.forEach(([ax, ay], i) => {
    for (const [sx, sy] of [[ax - 2, ay], [ax - 2, ay + 1], [ax + 3, ay], [ax - 3, ay]])
      if (get(sx, sy) === T.GRASS) {
        set(sx, sy, T.SIGN);
        signs.set(sy * COLS + sx, i);
        break;
      }
  });

  // tall grass patches along the routes
  for (const [x0, y0, x1, y1] of [[2, 21, 9, 23], [18, 5, 23, 8], [19, 11, 23, 14], [29, 20, 34, 23], [8, 12, 10, 16], [26, 13, 27, 17]])
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (get(x, y) === T.GRASS && rnd() < 0.86) set(x, y, T.TALL);

  // fences around Frontend Town's yard
  for (let x = 2; x <= 10; x++) if (get(x, 13) === T.GRASS) set(x, 13, T.FENCE);

  // trees: a thick border plus woods, kept clear of routes, doors and anchors
  const near = (x, y, r, types) => {
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (types.has(get(x + i, y + j))) return true;
    return false;
  };
  const busy = new Set([T.PATH, T.BRIDGE, T.DOCK, T.BLD, T.SIGN, T.FENCE]);
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      if (get(x, y) !== T.GRASS) continue;
      const edge = x === 0 || y === 0 || y === ROWS - 1 || (x === 1 && rnd() < 0.6) || (y === 1 && rnd() < 0.55) || (y === ROWS - 2 && rnd() < 0.5);
      if (edge && !near(x, y, 0, busy)) set(x, y, T.TREE);
    }
  for (let k = 0; k < 150; k++) {
    const x = 1 + Math.floor(rnd() * (COLS - 2)), y = 1 + Math.floor(rnd() * (ROWS - 2));
    if (get(x, y) !== T.GRASS || near(x, y, 1, busy) || anchors.some(([ax, ay]) => Math.abs(ax - x) < 3 && Math.abs(ay - y) < 3)) continue;
    set(x, y, T.TREE);
    if (rnd() < 0.5 && get(x + 1, y) === T.GRASS && !near(x + 1, y, 1, busy)) set(x + 1, y, T.TREE);
  }
  // boulders around the cave hill, flowers around towns
  for (let k = 0; k < 10; k++) {
    const x = 16 + Math.floor(rnd() * 11), y = 14 + Math.floor(rnd() * 6);
    if (get(x, y) === T.GRASS && !near(x, y, 1, new Set([T.PATH, T.SIGN]))) set(x, y, T.ROCK);
  }
  anchors.forEach(([ax, ay]) => {
    for (let k = 0; k < 14; k++) {
      const x = ax - 5 + Math.floor(rnd() * 11), y = ay - 3 + Math.floor(rnd() * 7);
      if (get(x, y) === T.GRASS) set(x, y, T.FLOWER);
    }
  });

  return { g, get, anchors, landmarks: lm, doors, signs, shore };
}

/* --------------------------------------------------------------- drawing */
const rect = (c, x, y, w, h, col) => {
  c.fillStyle = col;
  c.fillRect(x, y, w, h);
};
const px = (c, x, y, col) => rect(c, x, y, 1, 1, col);
function sprite(c, rows, pal, ox, oy, flip = false) {
  for (let j = 0; j < rows.length; j++)
    for (let i = 0; i < rows[j].length; i++) {
      const ch = rows[j][i];
      if (ch === "." || ch === " ") continue;
      px(c, ox + (flip ? rows[j].length - 1 - i : i), oy + j, pal[ch]);
    }
}

const TREE = [
  "......kkkk......",
  "....kkLLGGkk....",
  "...kLLGGGGGGk...",
  "..kLGGGGGGDGGk..",
  "..kGGGLGGGGDGk..",
  ".kLGGGDGGGGGGGk.",
  ".kGGGGGGGGGDGGk.",
  ".kGGDGGGLGGGGDk.",
  ".kGGGGGGGDGGGGk.",
  "..kGGGGGGGGGDk..",
  "..kDGGGDGGGGDk..",
  "...kkDDGGDDkk...",
  ".....kkttkk.....",
  "......kttk......",
  ".....kttttk.....",
  "......kkkk......",
];
const TALL = [
  "................",
  ".k...k...k...k..",
  "kLk.kLk.kLk.kLk.",
  "kGLkkGLkkGLkkGLk",
  "kGGkkGGkkGGkkGGk",
  ".kk..kk..kk..kk.",
  "................",
  "...k...k...k...k",
  "..kLk.kLk.kLk.kL",
  "k.kGLkkGLkkGLkkG",
  "kkkGGkkGGkkGGkkG",
  "Gk.kk..kk..kk..k",
  "................",
  ".k...k...k...k..",
  "kLk.kLk.kLk.kLk.",
  "kGLkkGLkkGLkkGLk",
];

function drawGrass(c, x, y) {
  const X = x * TS, Y = y * TS, r = hash(x, y);
  rect(c, X, Y, TS, TS, P.grass);
  for (let k = 0; k < 3; k++) {
    const tx = X + 2 + ((r >>> (k * 6)) % 11), ty = Y + 3 + ((r >>> (k * 6 + 3)) % 10);
    px(c, tx, ty, P.grassD);
    px(c, tx + 2, ty, P.grassD);
    px(c, tx + 1, ty + 1, P.grassD);
  }
  if (r % 3 === 0) px(c, X + 1 + (r % 13), Y + 1 + ((r >>> 5) % 13), P.grassL);
  if (r % 5 === 0) px(c, X + 1 + ((r >>> 9) % 13), Y + 1 + ((r >>> 12) % 13), P.grassL);
}
function drawTall(c, x, y) {
  rect(c, x * TS, y * TS, TS, TS, P.tall);
  sprite(c, TALL, { k: P.tallD, G: P.tall, L: P.tallL }, x * TS, y * TS);
}
function drawPath(c, x, y, m) {
  const X = x * TS, Y = y * TS, r = hash(x, y);
  rect(c, X, Y, TS, TS, P.path);
  for (let k = 0; k < 4; k++) px(c, X + 1 + ((r >>> (k * 5)) % 14), Y + 1 + ((r >>> (k * 5 + 2)) % 14), P.pathD);
  const open = (dx, dy) => PATHLIKE.has(m.get(x + dx, y + dy)) || m.doors.has((y + dy) * COLS + x + dx) || m.get(x + dx, y + dy) === T.DOCK;
  const N = open(0, -1), S = open(0, 1), Wd = open(-1, 0), E = open(1, 0);
  const fringe = (horiz, at, dir) => {
    for (let i = 0; i < TS; i++) {
      const bump = (hash(x * 31 + i, y * 17 + at) % 3 === 0) ? 1 : 0;
      for (let d = 0; d < 2 + bump; d++) {
        const xx = horiz ? X + i : at + dir * d, yy = horiz ? at + dir * d : Y + i;
        px(c, xx, yy, P.grass);
      }
      const e = 2 + bump;
      if (horiz) px(c, X + i, at + dir * e, P.pathE);
      else px(c, at + dir * e, Y + i, P.pathE);
    }
  };
  if (!N) fringe(true, Y, 1);
  if (!S) fringe(true, Y + TS - 1, -1);
  if (!Wd) fringe(false, X, 1);
  if (!E) fringe(false, X + TS - 1, -1);
}
function drawWater(c, x, y, f, m) {
  const X = x * TS, Y = y * TS, r = hash(x, y);
  rect(c, X, Y, TS, TS, P.water);
  for (let k = 0; k < 2; k++) {
    const wx = X + 2 + ((r >>> (k * 7)) % 9) + (f ? 1 : 0), wy = Y + 3 + ((r >>> (k * 7 + 3)) % 10);
    rect(c, wx, wy, 3, 1, P.waterL);
    px(c, wx + 3, wy + 1, P.waterL);
    px(c, wx - 1, wy + 1, P.waterD);
  }
  const land = (dx, dy) => {
    const v = m.get(x + dx, y + dy);
    return v !== T.WATER && v !== T.DOCK && v !== T.BRIDGE;
  };
  const band = (horiz, at, dir) => {
    for (let i = 0; i < TS; i++) {
      const w = (i + (f ? 2 : 0)) % 6 < 3 ? 2 : 1;
      for (let d = 0; d < w; d++) horiz ? px(c, X + i, at + dir * d, d ? P.waterL : P.foam) : px(c, at + dir * d, Y + i, d ? P.waterL : P.foam);
    }
  };
  if (land(0, -1)) band(true, Y, 1);
  if (land(0, 1)) band(true, Y + TS - 1, -1);
  if (land(-1, 0)) band(false, X, 1);
  if (land(1, 0)) band(false, X + TS - 1, -1);
}
function drawSand(c, x, y) {
  const X = x * TS, Y = y * TS, r = hash(x, y);
  rect(c, X, Y, TS, TS, P.sand);
  for (let k = 0; k < 5; k++) px(c, X + 1 + ((r >>> (k * 4)) % 14), Y + 1 + ((r >>> (k * 4 + 2)) % 14), P.sandD);
}
function drawTree(c, x, y) {
  drawGrass(c, x, y);
  const X = x * TS, Y = y * TS;
  c.fillStyle = P.shadow;
  c.beginPath();
  c.ellipse(X + 8, Y + 14, 6, 2, 0, 0, Math.PI * 2);
  c.fill();
  sprite(c, TREE, { k: P.treeK, L: P.treeL, G: P.treeG, D: P.treeD, t: P.trunk }, X, Y);
}
function drawRock(c, x, y) {
  drawGrass(c, x, y);
  const X = x * TS, Y = y * TS;
  sprite(
    c,
    [
      "................",
      "................",
      "......kkkk......",
      "....kkLLLRkk....",
      "...kLLLRRRRRk...",
      "..kLLRRRRRRRDk..",
      "..kLRRRRRRRDDk..",
      ".kRRRRRRRRRDDDk.",
      ".kRRRRRRRRDDDDk.",
      ".kDRRRRRRDDDDDk.",
      "..kDDDDDDDDDDk..",
      "...kkkkkkkkkk...",
      "................",
      "................",
      "................",
      "................",
    ],
    { k: P.rockK, L: P.rockL, R: P.rock, D: P.rockD },
    X,
    Y + 2,
  );
}
function drawFlower(c, x, y, f) {
  drawGrass(c, x, y);
  const X = x * TS, Y = y * TS, r = hash(x, y);
  const cols = [["#f0564a", "#ffd34d"], ["#ffffff", "#f5c23a"], ["#f59ad0", "#ffe36b"]][r % 3];
  for (const [fx, fy] of [[3, 4], [10, 9]]) {
    const ox = X + fx + (f ? 1 : 0), oy = Y + fy;
    px(c, ox + 1, oy + 4, P.grassD);
    px(c, ox + 1, oy + 5, P.grassD);
    px(c, ox + 1, oy, cols[0]);
    px(c, ox, oy + 1, cols[0]);
    px(c, ox + 2, oy + 1, cols[0]);
    px(c, ox + 1, oy + 2, cols[0]);
    px(c, ox + 1, oy + 1, cols[1]);
  }
}
function drawFence(c, x, y) {
  drawGrass(c, x, y);
  const X = x * TS, Y = y * TS;
  rect(c, X, Y + 5, TS, 2, "#f7f0e0");
  rect(c, X, Y + 10, TS, 2, "#f7f0e0");
  rect(c, X, Y + 7, TS, 1, "#a8977a");
  rect(c, X, Y + 12, TS, 1, "#a8977a");
  for (const p of [2, 11]) {
    rect(c, X + p, Y + 2, 3, 12, "#f7f0e0");
    rect(c, X + p + 3, Y + 2, 1, 12, "#a8977a");
    rect(c, X + p, Y + 14, 4, 1, "#8a7a62");
  }
}
function drawSign(c, x, y) {
  drawGrass(c, x, y);
  const X = x * TS, Y = y * TS;
  rect(c, X + 7, Y + 9, 2, 6, P.woodD);
  rect(c, X + 2, Y + 2, 12, 8, P.woodK);
  rect(c, X + 3, Y + 3, 10, 6, P.wood);
  rect(c, X + 4, Y + 4, 8, 1, "#e9cf9c");
  rect(c, X + 4, Y + 6, 6, 1, "#e9cf9c");
  rect(c, X + 3, Y + 8, 10, 1, P.woodD);
}
function drawDock(c, x, y, m) {
  const X = x * TS, Y = y * TS;
  if (m.get(x, y + 1) === T.WATER || m.get(x, y - 1) === T.WATER) drawWater(c, x, y, 0, m);
  rect(c, X, Y, TS, TS, P.wood);
  for (let i = 0; i < TS; i += 4) rect(c, X + i, Y, 1, TS, P.woodD);
  rect(c, X, Y, TS, 1, P.woodK);
  rect(c, X, Y + TS - 1, TS, 1, P.woodK);
  if (hash(x, y) % 2) rect(c, X + 6, Y + 6, 1, 1, P.woodK);
}
function drawBridge(c, x, y, m) {
  drawWater(c, x, y, 0, m);
  const X = x * TS, Y = y * TS;
  rect(c, X, Y + 1, TS, 14, P.wood);
  for (let i = 1; i < 15; i += 3) rect(c, X, Y + i, TS, 1, P.woodD);
  rect(c, X, Y, TS, 1, P.woodK);
  rect(c, X, Y + 15, TS, 1, P.woodK);
}

/* landmarks: original buildings, drawn over their footprints */
function outlineRect(c, x, y, w, h, fill, line = P.ink) {
  rect(c, x, y, w, h, line);
  rect(c, x + 1, y + 1, w - 2, h - 2, fill);
}
function windowAt(c, x, y, w = 10, h = 9, lit = false) {
  outlineRect(c, x, y, w, h, lit ? "#ffe9a8" : P.win);
  rect(c, x + 1, y + 1, w - 2, 2, lit ? "#fff6d6" : "#d2eefc");
  rect(c, x + Math.floor(w / 2), y + 1, 1, h - 2, P.ink);
  rect(c, x + 1, y + Math.floor(h / 2), w - 2, 1, P.ink);
}
function doorAt(c, cx, by, w = 12, h = 17) {
  const x = cx - w / 2, y = by - h;
  outlineRect(c, x, y, w, h, P.door);
  rect(c, x + 2, y + 2, w - 4, 5, "#8a643f");
  px(c, x + w - 4, y + Math.floor(h / 2) + 1, "#f2c230");
  rect(c, x - 1, by - 1, w + 2, 1, P.doorD);
}
function roofRows(c, X, Y, Wp, rows, col, dark, light) {
  for (let i = 0; i < rows; i++) {
    const inset = Math.max(0, 5 - i);
    rect(c, X + inset, Y + i, Wp - inset * 2, 1, i % 3 === 2 ? dark : col);
    if (i % 3 === 0) rect(c, X + inset + 2, Y + i, Math.max(0, Wp - inset * 2 - 4), 1, light);
  }
  rect(c, X, Y + rows - 2, Wp, 2, dark);
  rect(c, X + 4, Y, Wp - 8, 1, P.ink);
  for (let i = 0; i < 6; i++) {
    px(c, X + 5 - i - 1 < X ? X : X + 5 - i - 1, Y + i, P.ink);
    px(c, X + Wp - 5 + i, Y + i, P.ink);
  }
  rect(c, X - 1, Y + 5, 1, rows - 5, P.ink);
  rect(c, X + Wp, Y + 5, 1, rows - 5, P.ink);
  rect(c, X - 1, Y + rows, Wp + 2, 1, P.ink);
}
function shadowUnder(c, l) {
  c.fillStyle = P.shadow;
  c.fillRect(l.x * TS + 3, (l.y + l.h) * TS - 3, l.w * TS - 2, 4);
}
function drawLandmark(c, l, f) {
  const X = l.x * TS, Y = l.y * TS, Wp = l.w * TS, Hp = l.h * TS;
  const doorCx = l.door ? l.door[0] * TS + 8 : X + Wp / 2;
  shadowUnder(c, l);
  if (l.kind === "house" || l.kind === "cottage") {
    const big = l.kind === "house";
    const roof = big ? "#e2643e" : "#3fa08f", dark = big ? "#a8422a" : "#2b7468", light = big ? "#f38f63" : "#69c2b2";
    const roofH = big ? 40 : 26;
    outlineRect(c, X + 2, Y + roofH - 2, Wp - 4, Hp - roofH + 1, P.wall);
    rect(c, X + 3, Y + Hp - 5, Wp - 6, 3, P.wallD);
    // chimney
    if (big) {
      outlineRect(c, X + Wp - 18, Y - 2, 8, 12, "#b3533a");
      rect(c, X + Wp - 19, Y - 3, 10, 2, P.ink);
    }
    roofRows(c, X + 1, Y + 2, Wp - 2, roofH - 4, roof, dark, light);
    const wy = Y + roofH + 4;
    if (big) {
      windowAt(c, X + 6, wy);
      windowAt(c, X + Wp - 16, wy);
      doorAt(c, doorCx, Y + Hp - 1);
      // </> plaque above the door
      outlineRect(c, doorCx - 8, Y + roofH - 8, 16, 7, "#1f9a8a");
      rect(c, doorCx - 5, Y + roofH - 5, 2, 1, "#fff");
      rect(c, doorCx + 3, Y + roofH - 5, 2, 1, "#fff");
      px(c, doorCx, Y + roofH - 6, "#fff");
      px(c, doorCx - 1, Y + roofH - 4, "#fff");
    } else {
      windowAt(c, X + 4, wy - 2, 9, 8);
      doorAt(c, X + Wp - 12, Y + Hp - 1, 10, 13);
    }
  } else if (l.kind === "hq") {
    // Backend City HQ: flat blue roof, rows of windows with blinking server lights
    outlineRect(c, X + 2, Y + 14, Wp - 4, Hp - 15, "#e9eef5");
    rect(c, X + 3, Y + Hp - 6, Wp - 6, 4, "#c9d3e0");
    outlineRect(c, X, Y + 4, Wp, 12, "#3f7fd1");
    rect(c, X + 1, Y + 5, Wp - 2, 2, "#7fb0ea");
    rect(c, X + 1, Y + 13, Wp - 2, 2, "#2c5fa3");
    // dish
    outlineRect(c, X + 10, Y - 4, 12, 7, "#d9e2ee");
    rect(c, X + 15, Y + 2, 2, 3, P.ink);
    for (let row = 0; row < 2; row++)
      for (let i = 0; i < 5; i++) {
        const wx = X + 8 + i * 20, wy = Y + 22 + row * 22;
        if (wx + 12 > X + Wp - 4) continue;
        if (row === 1 && Math.abs(wx + 6 - doorCx) < 14) continue;
        outlineRect(c, wx, wy, 13, 14, "#2a3f5c");
        for (let k = 0; k < 3; k++) {
          const on = (hash(i + row * 7 + k, l.x) + f) % 3 !== 0;
          px(c, wx + 3 + k * 3, wy + 4, on ? ["#5ef08a", "#5ec6f0", "#f0c85e"][k] : "#3c5577");
          rect(c, wx + 2, wy + 7 + k * 2, 9, 1, "#3c5577");
        }
      }
    doorAt(c, doorCx, Y + Hp - 1, 16, 18);
    rect(c, doorCx, Y + Hp - 18, 1, 17, P.ink);
  } else if (l.kind === "cave") {
    // Database Cave: a rocky hill with a dark mouth and glowing data crystals
    const pal = { k: P.rockK, L: P.rockL, R: P.rock, D: P.rockD };
    c.fillStyle = P.rockK;
    c.beginPath();
    c.moveTo(X, Y + Hp);
    c.lineTo(X + 6, Y + 18);
    c.lineTo(X + 22, Y + 6);
    c.lineTo(X + 44, Y + 2);
    c.lineTo(X + 70, Y + 4);
    c.lineTo(X + 94, Y + 12);
    c.lineTo(X + Wp - 4, Y + 26);
    c.lineTo(X + Wp, Y + Hp);
    c.closePath();
    c.fill();
    c.fillStyle = P.rock;
    c.beginPath();
    c.moveTo(X + 2, Y + Hp - 1);
    c.lineTo(X + 8, Y + 19);
    c.lineTo(X + 23, Y + 8);
    c.lineTo(X + 44, Y + 4);
    c.lineTo(X + 69, Y + 6);
    c.lineTo(X + 92, Y + 14);
    c.lineTo(X + Wp - 6, Y + 27);
    c.lineTo(X + Wp - 2, Y + Hp - 1);
    c.closePath();
    c.fill();
    // strata + highlights
    for (let k = 0; k < 14; k++) {
      const r = hash(k, l.y);
      const sx = X + 8 + (r % (Wp - 22)), sy = Y + 14 + ((r >>> 8) % (Hp - 26));
      rect(c, sx, sy, 6 + (r % 5), 1, P.rockD);
      rect(c, sx + 1, sy - 1, 3, 1, P.rockL);
    }
    rect(c, X + 22, Y + 9, 20, 2, P.rockL);
    rect(c, X + 48, Y + 6, 16, 2, P.rockL);
    // mouth
    const mx = doorCx - 11, my = Y + Hp - 26;
    c.fillStyle = P.rockK;
    c.beginPath();
    c.ellipse(doorCx, my + 12, 13, 13, 0, Math.PI, 0);
    c.lineTo(doorCx + 13, Y + Hp);
    c.lineTo(doorCx - 13, Y + Hp);
    c.fill();
    c.fillStyle = "#14121c";
    c.beginPath();
    c.ellipse(doorCx, my + 13, 10, 11, 0, Math.PI, 0);
    c.lineTo(doorCx + 10, Y + Hp);
    c.lineTo(doorCx - 10, Y + Hp);
    c.fill();
    void mx;
    // crystals (data shards), twinkling
    for (const [cx, cy, col] of [[X + 16, Y + Hp - 16, "#a890f0"], [X + Wp - 20, Y + Hp - 18, "#6ed3ff"], [X + 30, Y + 20, "#a890f0"]]) {
      outlineRect(c, cx, cy, 5, 9, col);
      px(c, cx + 1, cy + 1, f ? "#ffffff" : "#e8e0ff");
      px(c, cx + 2, cy - 1, P.ink);
    }
    void pal;
  } else if (l.kind === "tower") {
    // AI Tower: stacked purple floors, glowing windows, antenna with a blinking beacon
    const body = "#efe8fb", band = "#9b59d0", bandD = "#6c3a99";
    outlineRect(c, X + 4, Y + 16, Wp - 8, Hp - 17, body);
    for (let fy = Y + 24; fy < Y + Hp - 24; fy += 18) {
      rect(c, X + 4, fy, Wp - 8, 3, band);
      rect(c, X + 4, fy + 3, Wp - 8, 1, bandD);
      for (const wx of [X + 10, X + Wp - 20]) outlineRect(c, wx, fy + 7, 10, 7, (hash(wx, fy) + f) % 4 ? "#7ee8ff" : "#c9f5ff");
    }
    // dome
    c.fillStyle = P.ink;
    c.beginPath();
    c.ellipse(X + Wp / 2, Y + 17, Wp / 2 - 3, 12, 0, Math.PI, 0);
    c.fill();
    c.fillStyle = band;
    c.beginPath();
    c.ellipse(X + Wp / 2, Y + 17, Wp / 2 - 4, 11, 0, Math.PI, 0);
    c.fill();
    rect(c, X + Wp / 2 - 6, Y + 9, 4, 2, "#c79bea");
    rect(c, X + Wp / 2, Y - 6, 1, 12, P.ink);
    rect(c, X + Wp / 2 - 1, Y - 9, 3, 3, f ? "#ff5a4a" : "#7a2a24");
    doorAt(c, doorCx, Y + Hp - 1, 12, 16);
  } else if (l.kind === "warehouse") {
    // DevOps Harbor warehouse: teal corrugated roof, wide roller door
    outlineRect(c, X + 2, Y + 30, Wp - 4, Hp - 31, "#e8e2d6");
    rect(c, X + 3, Y + Hp - 5, Wp - 6, 3, P.wallD);
    roofRows(c, X + 1, Y + 6, Wp - 2, 26, "#2f9a8a", "#1f6e63", "#5cc4b2");
    for (let i = X + 6; i < X + Wp - 4; i += 4) rect(c, i, Y + 12, 1, 18, "#1f6e63");
    outlineRect(c, doorCx - 12, Y + Hp - 22, 24, 21, "#9aa6b2");
    for (let i = Y + Hp - 20; i < Y + Hp - 2; i += 3) rect(c, doorCx - 11, i, 22, 1, "#7a8794");
    windowAt(c, X + 6, Y + 36, 10, 8);
  } else if (l.kind === "containers") {
    // stacked shipping containers
    const cols = [["#d6452f", "#a33322"], ["#2f7fd1", "#235f9d"], ["#f2c230", "#c49a1d"]];
    const boxes = [[0, 12, 0], [18, 12, 1], [8, 0, 2]];
    for (const [bx, by, ci] of boxes) {
      const x0 = X + 2 + bx, y0 = Y + 4 + by;
      outlineRect(c, x0, y0, 26, 14, cols[ci][0]);
      for (let i = x0 + 3; i < x0 + 24; i += 3) rect(c, i, y0 + 2, 1, 10, cols[ci][1]);
    }
  }
}
function drawBoat(c, x, y, f) {
  const X = x * TS, Y = y * TS + (f ? 1 : 0);
  outlineRect(c, X - 4, Y + 7, 30, 9, "#f4efe2");
  rect(c, X - 3, Y + 12, 28, 2, "#d6452f");
  outlineRect(c, X + 6, Y - 1, 12, 9, "#ffffff");
  rect(c, X + 8, Y + 1, 8, 3, P.win);
  rect(c, X + 11, Y - 9, 1, 9, P.ink);
  rect(c, X + 12, Y - 9, 6, 4, "#1f9a8a");
}

/* --------------------------------------------------------------- trainer */
// Pawan: dark wavy hair, rectangular glasses, black tee with a green band, dark trousers, black shoes.
const PAL_T = { k: "#1f1d2b", h: "#2b211c", H: "#4d3c31", s: "#b8896b", S: "#93684f", g: "#141014", w: "#cfe7f2", t: "#1c1c22", G: "#1f9a8a", p: "#2c2f38", b: "#0e0e10" };
const HEAD = {
  down: [
    "...kkkkkkkk.....",
    "..khhhHhhhHhk...",
    ".khhhhhhhhhhhk..",
    ".khhhhhhhhhhhk..",
    ".khsssssssshhk..",
    ".ksgggsssgggsk..",
    ".ksgwgsssgwgsk..",
    "..ksssssssssk...",
    "...kssSSSssk....",
  ],
  up: [
    "...kkkkkkkk.....",
    "..khhhHhhhhhk...",
    ".khhhhhhhhHhhk..",
    ".khhhhHhhhhhhk..",
    ".khhhhhhhhhhhk..",
    ".kshhhhhhhhhsk..",
    ".kshhhhhhhhhsk..",
    "..kshhhhhhhsk...",
    "...ksssssssk....",
  ],
  left: [
    "....kkkkkkk.....",
    "..kkhhhHhhhk....",
    ".khhhhhhhhhhk...",
    ".khhhhhhhhhhhk..",
    ".kssshhhhhhhhk..",
    ".kgggsshhhhhhk..",
    ".kgwgssshhhhk...",
    ".kssssssshhhk...",
    "..kSssssssk.....",
  ],
};
const BODY = {
  down: ["...kktttttkk....", "..kstGGGGGGtsk..", "..ksttttttttsk..", "..kkttttttttkk..", "...kttttttttk..."],
  up: ["...kktttttkk....", "..ksttttttttsk..", "..kstGGGGGGtsk..", "..kkttttttttkk..", "...kttttttttk..."],
  left: ["....kttttttk....", "...ktGGGGGGtk...", "...kttsstttk....", "...kttsstttk....", "....kttttttk...."],
};
function legs(c, dir, frame, ox, oy) {
  const k = PAL_T.k, p = PAL_T.p, b = PAL_T.b;
  if (dir === "left") {
    if (frame === 0) {
      rect(c, ox + 5, oy + 14, 6, 2, k);
      rect(c, ox + 6, oy + 14, 4, 1, p);
      rect(c, ox + 4, oy + 15, 7, 1, b);
    } else {
      const a = frame === 1 ? 0 : 1;
      rect(c, ox + 3 + a, oy + 14, 4, 2, k);
      rect(c, ox + 4 + a, oy + 14, 2, 1, p);
      rect(c, ox + 2 + a, oy + 15, 5, 1, b);
      rect(c, ox + 8 - a, oy + 14, 4, 2, k);
      rect(c, ox + 9 - a, oy + 14, 2, 1, p);
      rect(c, ox + 8 - a, oy + 15, 4, 1, b);
    }
    return;
  }
  const leg = (x, lift) => {
    rect(c, ox + x, oy + 14, 4, 2 - lift, k);
    rect(c, ox + x + 1, oy + 14, 2, 1, p);
    rect(c, ox + x, oy + 15 - lift, 4, 1, b);
  };
  leg(4, frame === 2 ? 1 : 0);
  leg(8, frame === 1 ? 1 : 0);
}
function makeTrainerFrames() {
  const frames = {};
  for (const dir of ["down", "up", "left", "right"]) {
    frames[dir] = [];
    const base = dir === "right" ? "left" : dir;
    for (let f = 0; f < 3; f++) {
      const cv = document.createElement("canvas");
      cv.width = 16;
      cv.height = 18;
      const c = cv.getContext("2d");
      const bob = f ? 1 : 0;
      sprite(c, HEAD[base], PAL_T, 0, bob);
      sprite(c, BODY[base], PAL_T, 0, 9 + bob);
      legs(c, base, f, 0, 2);
      if (dir === "right") {
        const m = document.createElement("canvas");
        m.width = 16;
        m.height = 18;
        const mc = m.getContext("2d");
        mc.translate(16, 0);
        mc.scale(-1, 1);
        mc.drawImage(cv, 0, 0);
        frames[dir].push(m);
      } else frames[dir].push(cv);
    }
  }
  return frames;
}

/* -------------------------------------------------------------- the map */
export function createSkillMap(host, { towns, onTown, onSign, sfx, reduced }) {
  const m = buildMap(towns);
  // two pre-rendered worlds (water, flowers and lights alternate between them)
  const worlds = [0, 1].map((f) => {
    const cv = document.createElement("canvas");
    cv.width = WPX;
    cv.height = HPX + TS; // a spare row so sprites near the bottom don't clip
    const c = cv.getContext("2d");
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) {
        const v = m.g[y * COLS + x];
        if (v === T.TALL) drawTall(c, x, y);
        else if (v === T.PATH) drawPath(c, x, y, m);
        else if (v === T.WATER) drawWater(c, x, y, f, m);
        else if (v === T.SAND) drawSand(c, x, y);
        else if (v === T.ROCK) drawRock(c, x, y);
        else if (v === T.FLOWER) drawFlower(c, x, y, f);
        else if (v === T.FENCE) drawFence(c, x, y);
        else if (v === T.SIGN) drawSign(c, x, y);
        else if (v === T.DOCK) drawDock(c, x, y, m);
        else if (v === T.BRIDGE) drawBridge(c, x, y, m);
        else drawGrass(c, x, y);
      }
    // doors read as path under the landmark
    for (const l of [...m.landmarks].sort((a, b) => a.y + a.h - (b.y + b.h))) drawLandmark(c, l, f);
    drawBoat(c, COLS - 3, 19, f);
    // trees overlap the row above them a little, so draw their crowns last
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (m.g[y * COLS + x] === T.TREE) drawTree(c, x, y);
    return cv;
  });
  const frames = makeTrainerFrames();

  const canvas = document.createElement("canvas");
  canvas.className = "pm-canvas";
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "Pixel map of the skill region. Use the arrow keys or tap to walk.");
  host.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  // trainer state: tile position, facing, smooth movement
  const start = m.anchors[0];
  const me = { x: start[0], y: start[1], fx: start[0], fy: start[1], dir: "up", moving: 0, from: [0, 0], walkT: 0, frame: 0 };
  let held = null, queue = [], town = -1, onArrive = null;
  let S = 2, dpr = 1, vw = 0, vh = 0, camX = 0, camY = 0;
  const resize = () => {
    const r = host.getBoundingClientRect();
    if (!r.width) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    S = r.width >= 1150 ? 3 : 2;
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    vw = r.width / S;
    vh = r.height / S;
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  const walkable = (x, y) => WALKABLE.has(m.get(x, y)) || m.doors.has(y * COLS + x);
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const tryStep = (dir) => {
    me.dir = dir;
    const [dx, dy] = DIRS[dir];
    const nx = me.x + dx, ny = me.y + dy;
    if (!walkable(nx, ny)) {
      sfx?.bump?.();
      return false;
    }
    me.from = [me.x, me.y];
    me.x = nx;
    me.y = ny;
    me.moving = 1;
    me.walkT = 0;
    me.frame = me.frame === 1 ? 2 : 1;
    return true;
  };
  const townAt = (x, y) => {
    if (m.doors.has(y * COLS + x)) return m.doors.get(y * COLS + x);
    let best = -1, bd = 1e9;
    m.anchors.forEach(([ax, ay], i) => {
      const d = Math.max(Math.abs(ax - x), Math.abs(ay - y));
      if (d <= 3 && d < bd) (best = i), (bd = d);
    });
    return best;
  };
  const arrived = () => {
    const t = townAt(me.x, me.y);
    if (t !== town) {
      town = t;
      if (t >= 0) onTown?.(t);
    }
    if (!queue.length && onArrive) {
      const f = onArrive;
      onArrive = null;
      f();
    }
  };

  // breadth-first path to a tile
  const pathTo = (tx, ty) => {
    const key = (x, y) => y * COLS + x;
    const prev = new Map([[key(me.x, me.y), -1]]);
    const q = [[me.x, me.y]];
    while (q.length) {
      const [x, y] = q.shift();
      if (x === tx && y === ty) break;
      for (const [dx, dy] of Object.values(DIRS)) {
        const nx = x + dx, ny = y + dy, k = key(nx, ny);
        if (prev.has(k) || !walkable(nx, ny)) continue;
        prev.set(k, key(x, y));
        q.push([nx, ny]);
      }
    }
    if (!prev.has(key(tx, ty))) return null;
    const out = [];
    for (let k = key(tx, ty); k !== key(me.x, me.y); k = prev.get(k)) out.unshift([k % COLS, Math.floor(k / COLS)]);
    return out;
  };
  const dirTo = ([x, y]) => (x > me.x ? "right" : x < me.x ? "left" : y > me.y ? "down" : "up");

  function walkToTown(i, cb) {
    const [ax, ay] = m.anchors[i];
    const p = pathTo(ax, ay);
    if (!p) return;
    queue = p;
    onArrive = () => {
      me.dir = "up";
      cb?.();
    };
    if (!p.length) onArrive();
  }

  // tap/click a tile to walk there (tapping a building walks to its door)
  canvas.addEventListener("pointerdown", (e) => {
    const r = canvas.getBoundingClientRect();
    const wx = (e.clientX - r.left) / S + camX, wy = (e.clientY - r.top) / S + camY;
    let tx = Math.floor(wx / TS), ty = Math.floor(wy / TS);
    const v = m.get(tx, ty);
    if (v === T.BLD) {
      const l = m.landmarks.find((l) => tx >= l.x && tx < l.x + l.w && ty >= l.y && ty < l.y + l.h);
      if (l && l.town >= 0) return walkToTown(l.town, () => onSign?.(l.town));
      return;
    }
    if (v === T.SIGN) {
      const i = m.signs.get(ty * COLS + tx);
      const spots = [[tx + 1, ty], [tx, ty + 1], [tx - 1, ty], [tx, ty - 1]].filter(([x, y]) => walkable(x, y));
      for (const [x, y] of spots) {
        const p = pathTo(x, y);
        if (p) {
          queue = p;
          onArrive = () => {
            me.dir = dirTo([tx, ty]);
            onSign?.(i);
          };
          if (!p.length) onArrive();
          return;
        }
      }
      return;
    }
    if (!walkable(tx, ty)) return;
    const p = pathTo(tx, ty);
    if (p) {
      queue = p;
      onArrive = null;
    }
  });

  function interact() {
    const [dx, dy] = DIRS[me.dir];
    const tx = me.x + dx, ty = me.y + dy;
    if (m.signs.has(ty * COLS + tx)) return onSign?.(m.signs.get(ty * COLS + tx)), true;
    const t = m.doors.get(ty * COLS + tx) ?? (m.doors.has(me.y * COLS + me.x) ? m.doors.get(me.y * COLS + me.x) : undefined);
    if (t !== undefined) return onSign?.(t), true;
    if (town >= 0) return onSign?.(town), true;
    return false;
  }

  /* ---- loop */
  let raf = 0, last = 0, anim = 0, running = false;
  const STEP = 0.17; // seconds per tile
  const loop = (now) => {
    raf = running ? requestAnimationFrame(loop) : 0;
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    anim += dt;
    // movement
    if (me.moving) {
      me.walkT += dt / STEP;
      if (me.walkT >= 1) {
        me.moving = 0;
        me.walkT = 1;
        arrived();
      }
    }
    if (!me.moving) {
      if (queue.length) tryStep(dirTo(queue.shift())) || (queue = []);
      else if (held) tryStep(held);
      else me.frame = 0;
    }
    const t = me.moving ? me.walkT : 1;
    me.fx = me.from[0] + (me.x - me.from[0]) * (me.moving ? t : 1);
    me.fy = me.from[1] + (me.y - me.from[1]) * (me.moving ? t : 1);
    // camera follows the trainer, clamped to the world
    // landmarks sit north of where the trainer stands, so frame a little above him
    const pxX = me.fx * TS + 8, pxY = me.fy * TS + 8 - Math.min(48, vh * 0.18);
    camX = Math.max(0, Math.min(WPX - vw, pxX - vw / 2));
    camY = Math.max(0, Math.min(HPX - vh, pxY - vh / 2));
    if (vw > WPX) camX = (WPX - vw) / 2;
    if (vh > HPX) camY = (HPX - vh) / 2;
    camX = Math.round(camX * S) / S;
    camY = Math.round(camY * S) / S;
    draw();
  };
  function draw() {
    const k = S * dpr;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#1f4226";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const world = worlds[reduced ? 0 : Math.floor(anim / 0.5) % 2];
    ctx.drawImage(world, 0, 0, WPX, HPX, -camX * k, -camY * k, WPX * k, HPX * k);
    // trainer
    const sx = (me.fx * TS - camX) * k, sy = (me.fy * TS - 4 - camY) * k;
    ctx.fillStyle = "rgba(20,30,20,0.28)";
    ctx.beginPath();
    ctx.ellipse(sx + 8 * k, sy + 17 * k, 5 * k, 1.6 * k, 0, 0, Math.PI * 2);
    ctx.fill();
    const fr = frames[me.dir][me.moving ? me.frame : 0];
    ctx.drawImage(fr, 0, 0, 16, 18, sx, sy, 16 * k, 18 * k);
    // tall grass covers the trainer's legs
    const tile = m.get(Math.round(me.fx), Math.round(me.fy));
    if (tile === T.TALL) {
      const tx = Math.round(me.fx), ty = Math.round(me.fy);
      ctx.drawImage(world, tx * TS, ty * TS + 9, TS, 7, (tx * TS - camX) * k, (ty * TS + 9 - camY) * k, TS * k, 7 * k);
    }
  }

  return {
    towns: m.anchors.length,
    walkToTown,
    interact,
    press(dir, down) {
      if (down) {
        queue = [];
        onArrive = null;
        held = dir;
      } else if (held === dir) held = null;
    },
    get town() {
      return town;
    },
    start() {
      if (running) return;
      running = true;
      last = 0;
      resize();
      raf = requestAnimationFrame(loop);
      arrived();
    },
    stop() {
      running = false;
      held = null;
      cancelAnimationFrame(raf);
    },
    destroy() {
      this.stop();
      ro.disconnect();
      canvas.remove();
    },
  };
}
