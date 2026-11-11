// Full-screen world map for Pawan World.
//
//   open/close   M on a keyboard, or click/tap the minimap · Back button, Esc or M again to close
//   look around  drag to pan · mouse wheel, pinch or +/− to zoom · ◎ re-centres on you
//   destination  tap anywhere to drop a pin → the shortest route there is drawn, on the map, on the
//                minimap and as a direction chip on screen, with a light beacon at the spot
//   bosses       every region boss in view is marked (lairs are found on the fly); tap one, or pick it
//                in the list, to navigate to it
//
// Routes are A* over a terrain-cost grid: roads are fastest, fields slower, forests and town
// blocks (buildings) slower still, steep slopes cost extra, and deep water is impassable for the
// jeep. Greninja runs on water, so on foot water is fine; Charizard just flies straight. The route
// is re-planned when you stray from it or switch Pokémon. All heavy work is time-sliced per frame.
import * as THREE from "three";

const PAPER = "#fbf8ef",
  INK = "#1f1d2b",
  RED = "#d6452f",
  GOLD = "#f2c230";
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmtDist = (d) => (d >= 1000 ? (d / 1000).toFixed(1) + " km" : Math.round(d / 10) * 10 + " m");

/** small binary min-heap of node ids keyed by f */
class Heap {
  constructor() {
    this.ids = [];
    this.f = [];
  }
  get size() {
    return this.ids.length;
  }
  push(id, f) {
    const a = this.ids,
      b = this.f;
    let i = a.length;
    a.push(id);
    b.push(f);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (b[p] <= f) break;
      a[i] = a[p];
      b[i] = b[p];
      i = p;
    }
    a[i] = id;
    b[i] = f;
  }
  pop() {
    const a = this.ids,
      b = this.f,
      top = a[0],
      lastId = a.pop(),
      lastF = b.pop();
    if (a.length) {
      let i = 0;
      const n = a.length;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && b[c + 1] < b[c]) c++;
        if (b[c] >= lastF) break;
        a[i] = a[c];
        b[i] = b[c];
        i = c;
      }
      a[i] = lastId;
      b[i] = lastF;
    }
    return top;
  }
}

/** Douglas–Peucker simplification of a polyline [[x,z],…] */
function simplify(pts, eps) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, az] = pts[a],
      [bx, bz] = pts[b],
      dx = bx - ax,
      dz = bz - az,
      L = Math.hypot(dx, dz) || 1;
    let best = -1,
      bd = eps;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i][0] - ax) * dz - (pts[i][1] - az) * dx) / L;
      if (d > bd) (bd = d), (best = i);
    }
    if (best > 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/**
 * @param ctx hooks into the game (index.html → "world map"): car, game, glider, camera, scene,
 *   heightAt, groundAt, roadNear, regionAt, townM, forestM, mountainM, deepWater, mapColor,
 *   WATER_Y, HALF, toast, wild() (the wild-Pokémon system, may be null), canOpen()
 */
export function createWorldMap(ctx) {
  const { car, game, glider, camera, scene, heightAt, groundAt, roadNear, regionAt, townM, forestM, mountainM, deepWater, mapColor, WATER_Y, HALF, toast } = ctx;
  const wild = () => ctx.wild && ctx.wild();

  /* ------------------------------ DOM ------------------------------ */
  const root = document.createElement("div");
  root.id = "wmap";
  root.innerHTML = `<style>
    #wmap{position:fixed;inset:0;z-index:60;display:none;background:#e9e2cf;font-family:"DM Sans",system-ui,sans-serif;color:${INK};
      touch-action:none;user-select:none;-webkit-user-select:none}
    #wmap.open{display:block}
    #wmap canvas{position:absolute;inset:0;width:100%;height:100%;cursor:grab}
    #wmap canvas.drag{cursor:grabbing}
    #wmap .wm-btn{font:700 11px "DM Sans",system-ui;letter-spacing:.14em;text-transform:uppercase;background:${PAPER};color:${INK};
      border:1.5px solid ${INK};box-shadow:2px 2px 0 ${INK};padding:9px 14px;cursor:pointer;border-radius:0}
    #wmap .wm-btn:active{transform:translate(1px,1px);box-shadow:1px 1px 0 ${INK}}
    #wmap .wm-btn.red{background:${RED};color:${PAPER}}
    #wmap .wm-btn.gold{background:${GOLD}}
    #wmap .wm-top{position:absolute;left:calc(14px + env(safe-area-inset-left));top:calc(12px + env(safe-area-inset-top));display:flex;gap:12px;align-items:center;right:220px}
    #wmap .wm-where{background:rgba(251,248,239,.92);border:1.5px solid ${INK};padding:5px 12px;line-height:1.15;max-width:46vw}
    #wmap .wm-where b{font-family:"Caveat Brush",cursive;font-weight:400;font-size:22px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #wmap .wm-where span{font-size:10px;letter-spacing:.12em;text-transform:uppercase;opacity:.75}
    #wmap .wm-zoom{position:absolute;right:calc(14px + env(safe-area-inset-right));bottom:calc(84px + env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:8px}
    #wmap .wm-zoom .wm-btn{width:44px;height:44px;padding:0;font-size:20px;letter-spacing:0}
    #wmap .wm-route{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(14px + env(safe-area-inset-bottom));display:none;gap:8px;align-items:center;
      background:rgba(251,248,239,.95);border:1.5px solid ${INK};box-shadow:2px 2px 0 ${INK};padding:6px 6px 6px 12px;max-width:calc(100vw - 28px)}
    #wmap .wm-route.on{display:flex}
    #wmap .wm-route span{font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #wmap .wm-route .wm-btn{padding:7px 10px;white-space:nowrap}
    #wmap .wm-bosses{position:absolute;right:calc(14px + env(safe-area-inset-right));top:calc(12px + env(safe-area-inset-top));width:200px;
      background:rgba(251,248,239,.95);border:1.5px solid ${INK};box-shadow:2px 2px 0 ${INK};max-height:calc(100vh - 250px);display:flex;flex-direction:column}
    #wmap .wm-bosses h4{margin:0;padding:8px 10px;font-size:10px;letter-spacing:.2em;text-transform:uppercase;border-bottom:1.5px solid ${INK};cursor:pointer;display:flex;justify-content:space-between}
    #wmap .wm-bosses ul{list-style:none;margin:0;padding:0;overflow:auto}
    #wmap .wm-bosses li{display:flex;align-items:center;gap:8px;padding:6px 10px;border-bottom:1px dashed rgba(31,29,43,.25);cursor:pointer;font-size:12px}
    #wmap .wm-bosses li:hover{background:#fff4c9}
    #wmap .wm-bosses li i{font-style:normal;color:${RED}}
    #wmap .wm-bosses li small{display:block;font-size:9px;letter-spacing:.1em;text-transform:uppercase;opacity:.7}
    #wmap .wm-bosses li em{margin-left:auto;font-style:normal;font-size:10px;font-weight:700;white-space:nowrap}
    #wmap .wm-bosses.min ul{display:none}
    #wmap .wm-card{position:absolute;display:none;transform:translate(-50%,calc(-100% - 22px));background:${PAPER};border:1.5px solid ${INK};
      box-shadow:3px 3px 0 ${INK};padding:9px 12px;min-width:170px;text-align:center}
    #wmap .wm-card.on{display:block}
    #wmap .wm-card .k{font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:${RED}}
    #wmap .wm-card b{display:block;font-family:"Caveat Brush",cursive;font-weight:400;font-size:26px;line-height:1.05}
    #wmap .wm-card p{margin:2px 0 8px;font-size:11px}
    #wmap.routing .wm-help{display:none}
    #wmap .wm-help{position:absolute;left:calc(14px + env(safe-area-inset-left));bottom:calc(14px + env(safe-area-inset-bottom));font-size:10px;letter-spacing:.12em;
      text-transform:uppercase;background:rgba(251,248,239,.85);padding:5px 8px;border:1px solid rgba(31,29,43,.4)}
    #navChip{position:absolute;left:50%;top:46px;transform:translateX(-50%);z-index:5;display:none;align-items:center;gap:7px;pointer-events:auto;cursor:pointer;
      background:rgba(251,248,239,.92);border:1.5px solid ${INK};box-shadow:2px 2px 0 ${INK};padding:4px 10px;
      font:700 9px "DM Sans",system-ui;letter-spacing:.16em;text-transform:uppercase;color:${INK};white-space:nowrap}
    #navChip.on{display:flex}
    #navChip .arr{display:inline-block;font-size:13px;color:${RED};transition:transform .15s}
    body.hidehud #navChip,body.home-on #navChip,.studio #navChip{display:none!important}
    body.touch #navChip{top:auto;bottom:calc(44px + env(safe-area-inset-bottom))}
    #minimap{pointer-events:auto;cursor:pointer}
    @media (max-width:760px),(max-height:480px){
      #wmap .wm-top{right:auto}
      #wmap .wm-where b{font-size:18px}
      #wmap .wm-bosses{top:auto;bottom:calc(14px + env(safe-area-inset-bottom));right:auto;left:calc(14px + env(safe-area-inset-left));width:190px;max-height:52vh}
      #wmap .wm-help{display:none}
      #wmap .wm-route{left:auto;right:calc(70px + env(safe-area-inset-right));transform:none;bottom:calc(14px + env(safe-area-inset-bottom));max-width:calc(100vw - 300px)}
      #wmap .wm-zoom{bottom:calc(14px + env(safe-area-inset-bottom))}
    }
  </style>
  <canvas></canvas>
  <div class="wm-top">
    <button class="wm-btn red" id="wmBack">← Back</button>
    <div class="wm-where"><b id="wmHere">Map</b><span id="wmSub">Tap the map to set a destination</span></div>
  </div>
  <div class="wm-bosses" id="wmBosses"><h4 id="wmBossHead"><span>★ Region bosses</span><span id="wmBossN"></span></h4><ul id="wmBossList"></ul></div>
  <div class="wm-zoom"><button class="wm-btn" id="wmIn" title="Zoom in">+</button><button class="wm-btn" id="wmOut" title="Zoom out">−</button><button class="wm-btn" id="wmMe" title="Centre on you">◎</button></div>
  <div class="wm-route" id="wmRoute"><span id="wmRouteT"></span><button class="wm-btn gold" id="wmGo">Go</button><button class="wm-btn" id="wmClear">Clear</button></div>
  <div class="wm-card" id="wmCard"><div class="k" id="wmCardK"></div><b id="wmCardN"></b><p id="wmCardP"></p><button class="wm-btn gold" id="wmCardGo">Navigate</button></div>
  <div class="wm-help">Drag to move · scroll to zoom · click to set a destination · M / Esc to close</div>`;
  document.body.appendChild(root);
  const $ = (id) => root.querySelector("#" + id);
  const cv = root.querySelector("canvas"),
    g = cv.getContext("2d");
  const chip = document.createElement("div");
  chip.id = "navChip";
  chip.innerHTML = `<span>📍</span><span id="navT"></span><span class="arr" id="navA">▲</span>`;
  (document.getElementById("hud") || document.body).appendChild(chip);
  chip.addEventListener("click", () => open());
  if (matchMedia("(max-width:760px),(max-height:480px)").matches) $("wmBosses").classList.add("min");
  $("wmBossHead").onclick = () => $("wmBosses").classList.toggle("min");

  /* ------------------------------ view ------------------------------ */
  const view = { cx: 0, cz: 0, upp: 5 }; // world units per CSS pixel
  let W = 0,
    H = 0,
    DPR = 1,
    isOpen = false;
  const toScreen = (x, z) => [(x - view.cx) / view.upp + W / 2, (z - view.cz) / view.upp + H / 2];
  const toWorld = (sx, sy) => [(sx - W / 2) * view.upp + view.cx, (sy - H / 2) * view.upp + view.cz];
  function resize() {
    DPR = Math.min(2, devicePixelRatio || 1);
    W = root.clientWidth;
    H = root.clientHeight;
    cv.width = Math.round(W * DPR);
    cv.height = Math.round(H * DPR);
  }
  addEventListener("resize", () => isOpen && resize());

  /* ---------- terrain layer: painted a few rows per frame ---------- */
  const TN = 300;
  const layer = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = TN;
    return { c, g: c.getContext("2d"), img: null, x0: 0, z0: 0, ts: 0, ready: false };
  })();
  const job = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = TN;
    const gg = c.getContext("2d");
    return { c, g: gg, img: gg.createImageData(TN, TN), x0: 0, z0: 0, ts: 0, row: -1 };
  })();
  function wantTerrain() {
    const halfW = (W / 2) * view.upp,
      halfH = (H / 2) * view.upp,
      ts = Math.max(3, (Math.max(halfW, halfH) * 2 * 1.35) / TN); // the view plus a margin
    const covers = (L) =>
      L.ts &&
      Math.abs(Math.log(L.ts / ts)) < 0.5 &&
      view.cx - halfW > L.x0 &&
      view.cx + halfW < L.x0 + TN * L.ts &&
      view.cz - halfH > L.z0 &&
      view.cz + halfH < L.z0 + TN * L.ts;
    if ((layer.ready && covers(layer)) || (job.row >= 0 && covers(job))) return;
    startJob(ts);
  }
  function startJob(ts) {
    job.ts = ts;
    job.x0 = view.cx - (TN * ts) / 2;
    job.z0 = view.cz - (TN * ts) / 2;
    job.row = 0;
    job.g.clearRect(0, 0, TN, TN);
    job.img.data.fill(0);
  }
  function pumpTerrain(ms) {
    if (job.row < 0) return;
    const t0 = performance.now(),
      d = job.img.data;
    while (job.row < TN && performance.now() - t0 < ms) {
      const z = job.z0 + (job.row + 0.5) * job.ts;
      for (let i = 0; i < TN; i++) {
        const c = mapColor(job.x0 + (i + 0.5) * job.ts, z),
          k = (job.row * TN + i) * 4;
        d[k] = c[0];
        d[k + 1] = c[1];
        d[k + 2] = c[2];
        d[k + 3] = 255;
      }
      job.row++;
    }
    job.g.putImageData(job.img, 0, 0);
    if (job.row >= TN) {
      layer.g.drawImage(job.c, 0, 0);
      Object.assign(layer, { x0: job.x0, z0: job.z0, ts: job.ts, ready: true });
      job.row = -1;
    }
  }

  /* ---------- roads as vector lines (rebuilt when the view moves a lot) ---------- */
  let roads = { key: "", lines: [] };
  function wantRoads() {
    if (!ctx.roadLines) return;
    const span = Math.max(W, H) * view.upp * 1.5,
      q = span / 4,
      key = `${Math.round(view.cx / q)},${Math.round(view.cz / q)},${Math.round(Math.log2(view.upp) * 2)}`;
    if (key === roads.key) return;
    const cx = Math.round(view.cx / q) * q,
      cz = Math.round(view.cz / q) * q;
    roads = { key, lines: ctx.roadLines(cx - span, cz - span, cx + span, cz + span, Math.max(12, view.upp * 6)) };
  }

  /* ---------- regions + bosses in view ---------- */
  let regions = new Map(), // id → { r, sx, sz, n }
    rjob = null;
  function wantRegions() {
    const span = Math.max(W, H) * view.upp * 1.4,
      step = Math.max(160, span / 16),
      x0 = view.cx - span / 2,
      z0 = view.cz - span / 2,
      n = Math.ceil(span / step);
    if (rjob && rjob.key === `${Math.round(x0 / step)},${Math.round(z0 / step)},${Math.round(step)}`) return;
    rjob = { key: `${Math.round(x0 / step)},${Math.round(z0 / step)},${Math.round(step)}`, x0, z0, step, n, i: 0, acc: new Map() };
  }
  function pumpRegions(ms) {
    if (!rjob || rjob.i >= rjob.n * rjob.n) return;
    const t0 = performance.now();
    while (rjob.i < rjob.n * rjob.n && performance.now() - t0 < ms) {
      const x = rjob.x0 + ((rjob.i % rjob.n) + 0.5) * rjob.step,
        z = rjob.z0 + (Math.floor(rjob.i / rjob.n) + 0.5) * rjob.step,
        r = regionAt(x, z);
      let e = rjob.acc.get(r.id);
      if (!e) rjob.acc.set(r.id, (e = { r: { ...r }, sx: 0, sz: 0, n: 0 }));
      e.sx += x;
      e.sz += z;
      e.n++;
      rjob.i++;
    }
    if (rjob.i >= rjob.n * rjob.n) regions = rjob.acc;
  }
  function bossesInView() {
    const w = wild(),
      out = [];
    if (!w) return out;
    for (const e of regions.values()) {
      const b = w.bossLair(e.r);
      if (b.status === "none") continue;
      out.push({ ...b, e, d: b.status === "ready" ? Math.hypot(b.x - car.x, b.z - car.z) : Infinity });
    }
    return out.sort((a, b) => a.d - b.d);
  }

  /* ------------------------------ routing ------------------------------ */
  const moveMode = () => (glider.on ? "fly" : game.mode === "walk" ? "walk" : "drive");
  function cellCost(x, z, cs, mode) {
    const rd = roadNear(x, z).d,
      onRoad = rd < Math.max(HALF + 1, cs * 0.6);
    if (mode === "walk") {
      if (onRoad) return 1;
      return townM(x, z) > 0.5 ? 1.7 : 1.15;
    }
    if (onRoad) return 1;
    if (deepWater(x, z)) return Infinity; // the jeep would sink
    if (townM(x, z) > 0.5) return 3.5; // between buildings
    if (heightAt(x, z) < WATER_Y) return 3; // wading through shallows is slow
    const tw = townM(x, z);
    if (forestM(x, z, tw) > 0.5) return 1.75;
    if (mountainM(x, z) > 0.35) return 1.6;
    return 1.36;
  }
  class Router {
    constructor(sx, sz, gx, gz, mode) {
      this.mode = mode;
      this.goal = [gx, gz];
      const dist = Math.hypot(gx - sx, gz - sz),
        cs = clamp(dist / 230, 10, 40),
        m = Math.max(350, dist * 0.35);
      this.cs = cs;
      this.x0 = Math.min(sx, gx) - m;
      this.z0 = Math.min(sz, gz) - m;
      this.nx = Math.ceil((Math.max(sx, gx) + m - this.x0) / cs);
      this.nz = Math.ceil((Math.max(sz, gz) + m - this.z0) / cs);
      const N = this.nx * this.nz;
      this.cost = new Float32Array(N).fill(-1);
      this.h = new Float32Array(N).fill(NaN);
      this.g = new Float32Array(N).fill(Infinity);
      this.came = new Int32Array(N).fill(-1);
      this.closed = new Uint8Array(N);
      this.open = new Heap();
      this.s = this.idx(sx, sz);
      this.t = this.idx(gx, gz);
      this.g[this.s] = 0;
      this.open.push(this.s, this.heur(this.s));
      this.best = this.s;
      this.bestH = this.heur(this.s);
      this.done = false;
      this.found = false;
      this.start = [sx, sz];
    }
    idx(x, z) {
      return clamp(Math.floor((z - this.z0) / this.cs), 0, this.nz - 1) * this.nx + clamp(Math.floor((x - this.x0) / this.cs), 0, this.nx - 1);
    }
    pos(i) {
      return [this.x0 + ((i % this.nx) + 0.5) * this.cs, this.z0 + (Math.floor(i / this.nx) + 0.5) * this.cs];
    }
    heur(i) {
      const dx = Math.abs((i % this.nx) - (this.t % this.nx)),
        dz = Math.abs(Math.floor(i / this.nx) - Math.floor(this.t / this.nx));
      return (Math.max(dx, dz) + 0.4142 * Math.min(dx, dz)) * this.cs;
    }
    costOf(i) {
      if (this.cost[i] < 0) {
        const [x, z] = this.pos(i);
        this.cost[i] = i === this.s ? 1 : cellCost(x, z, this.cs, this.mode);
      }
      return this.cost[i];
    }
    heightOf(i) {
      if (Number.isNaN(this.h[i])) {
        const [x, z] = this.pos(i);
        this.h[i] = Math.max(heightAt(x, z), WATER_Y);
      }
      return this.h[i];
    }
    step(ms) {
      const t0 = performance.now(),
        nx = this.nx,
        nz = this.nz;
      let n = 0;
      while (this.open.size) {
        if ((++n & 255) === 0 && performance.now() - t0 > ms) return false;
        const c = this.open.pop();
        if (this.closed[c]) continue;
        this.closed[c] = 1;
        if (c === this.t) {
          this.found = true;
          break;
        }
        const hc = this.heur(c);
        if (hc < this.bestH) (this.bestH = hc), (this.best = c);
        const cx = c % nx,
          cz = (c / nx) | 0,
          cc = this.costOf(c),
          h0 = this.heightOf(c);
        for (let dz = -1; dz <= 1; dz++)
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dz) continue;
            const x = cx + dx,
              z = cz + dz;
            if (x < 0 || z < 0 || x >= nx || z >= nz) continue;
            const j = z * nx + x;
            if (this.closed[j]) continue;
            const cj = this.costOf(j);
            if (cj === Infinity) continue;
            const len = (dx && dz ? 1.4142 : 1) * this.cs,
              slope = Math.abs(this.heightOf(j) - h0) / len,
              steep = this.mode === "walk" ? 1 + Math.max(0, slope - 0.5) * 2 : 1 + Math.max(0, slope - 0.18) * 5;
            const gj = this.g[c] + len * ((cc + cj) / 2) * steep;
            if (gj < this.g[j]) {
              this.g[j] = gj;
              this.came[j] = c;
              this.open.push(j, gj + this.heur(j));
            }
          }
      }
      this.done = true;
      return true;
    }
    path() {
      const end = this.found ? this.t : this.best,
        pts = [];
      for (let i = end; i >= 0; i = this.came[i]) pts.push(this.pos(i));
      pts.reverse();
      pts[0] = this.start.slice();
      if (this.found) pts.push(this.goal.slice());
      return simplify(pts, this.cs * 0.6);
    }
  }

  /* ---------- route state + in-world beacon ---------- */
  const route = { goal: null, label: "", boss: null, pts: null, status: "", mode: "", router: null, i: 0, offT: 0, left: 0 };
  const beacon = (() => {
    const grp = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.4, 1.4, 160, 16, 1, true).translate(0, 80, 0),
      new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.35, depthWrite: false, fog: false, side: THREE.DoubleSide }),
    );
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.6, 3.4, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: RED, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }),
    );
    ring.position.y = 0.15;
    beam.renderOrder = ring.renderOrder = 2;
    grp.add(beam, ring);
    grp.visible = false;
    scene.add(grp);
    return { grp, beam, ring };
  })();
  function setDestination(x, z, label, boss = null) {
    route.goal = [x, z];
    route.label = label;
    route.boss = boss;
    planRoute();
    beacon.grp.position.set(x, Math.max(groundAt(x, z), WATER_Y), z);
    beacon.grp.visible = true;
    updRouteBar();
  }
  function planRoute() {
    if (!route.goal) return;
    route.mode = moveMode();
    route.i = 0;
    route.offT = 0;
    if (route.mode === "fly") {
      route.router = null;
      route.pts = [[car.x, car.z], route.goal.slice()];
      route.status = "ok";
      return;
    }
    route.router = new Router(car.x, car.z, route.goal[0], route.goal[1], route.mode);
    route.status = "search";
    if (!route.pts) route.pts = [[car.x, car.z], route.goal.slice()]; // straight line until the real route is ready
  }
  function clearRoute() {
    Object.assign(route, { goal: null, label: "", boss: null, pts: null, status: "", router: null });
    beacon.grp.visible = false;
    chip.classList.remove("on");
    updRouteBar();
  }
  function pathLength(pts, from = 0) {
    let L = 0;
    for (let i = from; i < pts.length - 1; i++) L += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    return L;
  }
  function updRouteBar() {
    const bar = $("wmRoute");
    root.classList.toggle("routing", !!route.goal);
    if (!route.goal) {
      bar.classList.remove("on");
      $("wmSub").textContent = "Tap the map to set a destination";
      return;
    }
    bar.classList.add("on");
    const via = route.mode === "fly" ? "flying" : route.mode === "walk" ? "on foot" : "by road";
    let t;
    if (route.status === "search") t = `Finding the shortest way to ${route.label}…`;
    else t = `${route.label} · ${fmtDist(route.left || pathLength(route.pts))} ${via}`;
    if (route.status === "partial") t += " · the rest is deep water (Greninja can cross it)";
    $("wmRouteT").textContent = t;
  }

  /* ------------------------------ input ------------------------------ */
  const ptrs = new Map();
  let drag = null,
    pinch = null;
  cv.addEventListener("pointerdown", (e) => {
    cv.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    $("wmCard").classList.remove("on");
    if (ptrs.size === 1) drag = { x: e.clientX, y: e.clientY, cx: view.cx, cz: view.cz, moved: false };
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), upp: view.upp };
      drag = null;
    }
  });
  cv.addEventListener("pointermove", (e) => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch && ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (pinch.upp * pinch.d) / Math.max(10, Math.hypot(a[0] - b[0], a[1] - b[1])));
    } else if (drag) {
      const dx = e.clientX - drag.x,
        dy = e.clientY - drag.y;
      if (Math.hypot(dx, dy) > 6) drag.moved = true;
      if (drag.moved) {
        cv.classList.add("drag");
        view.cx = drag.cx - dx * view.upp;
        view.cz = drag.cz - dy * view.upp;
      }
    }
  });
  const up = (e) => {
    const wasTap = drag && !drag.moved && ptrs.size === 1;
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    cv.classList.remove("drag");
    if (wasTap) tap(e.clientX - root.getBoundingClientRect().left, e.clientY - root.getBoundingClientRect().top);
    if (!ptrs.size) drag = null;
  };
  cv.addEventListener("pointerup", up);
  cv.addEventListener("pointercancel", (e) => {
    ptrs.delete(e.pointerId);
    drag = pinch = null;
  });
  cv.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      zoomAt(e.offsetX, e.offsetY, view.upp * Math.exp(e.deltaY * 0.0015));
    },
    { passive: false },
  );
  function zoomAt(sx, sy, upp) {
    const [wx, wz] = toWorld(sx, sy);
    view.upp = clamp(upp, 0.9, 40);
    view.cx = wx - (sx - W / 2) * view.upp;
    view.cz = wz - (sy - H / 2) * view.upp;
  }
  $("wmIn").onclick = () => zoomAt(W / 2, H / 2, view.upp / 1.6);
  $("wmOut").onclick = () => zoomAt(W / 2, H / 2, view.upp * 1.6);
  $("wmMe").onclick = () => ((view.cx = car.x), (view.cz = car.z));
  $("wmBack").onclick = () => close();
  $("wmClear").onclick = () => clearRoute();
  $("wmGo").onclick = () => close();
  // the game shouldn't see pointer/touch input aimed at the map
  for (const ev of ["pointerdown", "pointermove", "pointerup", "touchstart", "touchmove", "touchend", "mousedown", "mousemove", "mouseup", "click", "wheel"])
    root.addEventListener(ev, (e) => e.stopPropagation(), { passive: ev !== "wheel" && ev !== "touchmove" });
  root.addEventListener("touchmove", (e) => !e.target.closest(".wm-bosses ul") && e.preventDefault(), { passive: false });

  let cardBoss = null;
  function showBossCard(b, sx, sy) {
    cardBoss = b;
    $("wmCardK").textContent = b.defeated ? `✓ ${b.region} boss · defeated` : `★ ${b.region} boss${b.met ? " · met" : ""}`;
    $("wmCardGo").style.display = b.defeated ? "none" : "";
    $("wmCardN").textContent = b.name;
    $("wmCardP").textContent = `${b.types.map((t) => t[0].toUpperCase() + t.slice(1)).join(" / ")} · ${fmtDist(Math.hypot(b.x - car.x, b.z - car.z))} away`;
    const c = $("wmCard");
    c.style.left = clamp(sx, 100, W - 100) + "px";
    c.style.top = clamp(sy, 140, H) + "px";
    c.classList.add("on");
  }
  $("wmCardGo").onclick = () => {
    if (cardBoss) setDestination(cardBoss.x, cardBoss.z, `${cardBoss.name} (${cardBoss.region} boss)`, cardBoss.rid);
    $("wmCard").classList.remove("on");
  };
  function tap(sx, sy) {
    // a boss icon?
    for (const b of lastBosses) {
      if (b.status !== "ready") continue;
      const [bx, by] = toScreen(b.x, b.z);
      if (Math.hypot(bx - sx, by - sy) < 22) return showBossCard(b, bx, by);
    }
    const [x, z] = toWorld(sx, sy),
      r = regionAt(x, z);
    setDestination(x, z, `a spot in ${r.name}`);
  }
  $("wmBossList").addEventListener("click", (e) => {
    const li = e.target.closest("li");
    if (!li) return;
    const b = lastBosses.find((q) => q.rid === li.dataset.rid);
    if (!b || b.status !== "ready") return;
    view.cx = b.x;
    view.cz = b.z;
    showBossCard(b, W / 2, H / 2);
  });

  // keys while the map is open: they belong to the map, not the game
  addEventListener(
    "keydown",
    (e) => {
      if (!isOpen) return;
      const k = e.key.toLowerCase();
      e.stopImmediatePropagation();
      if (k === "m" || k === "escape" || k === "backspace") {
        e.preventDefault();
        close();
      } else if (k === "+" || k === "=") zoomAt(W / 2, H / 2, view.upp / 1.4);
      else if (k === "-" || k === "_") zoomAt(W / 2, H / 2, view.upp * 1.4);
      else if (k.startsWith("arrow")) {
        e.preventDefault();
        const s = 80 * view.upp;
        if (k === "arrowleft") view.cx -= s;
        if (k === "arrowright") view.cx += s;
        if (k === "arrowup") view.cz -= s;
        if (k === "arrowdown") view.cz += s;
      }
    },
    true,
  );

  /* ------------------------------ draw ------------------------------ */
  let lastBosses = [],
    listT = 0;
  function drawPin(x, y, col) {
    g.save();
    g.translate(x, y);
    g.fillStyle = col;
    g.strokeStyle = INK;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(-9, -12, -9, -24, 0, -24);
    g.bezierCurveTo(9, -24, 9, -12, 0, 0);
    g.fill();
    g.stroke();
    g.fillStyle = PAPER;
    g.beginPath();
    g.arc(0, -16, 3.5, 0, 7);
    g.fill();
    g.restore();
  }
  function drawBossIcon(x, y, met, active, beaten) {
    g.save();
    g.translate(x, y);
    const k = view.upp > 14 ? 0.62 : view.upp > 7 ? 0.8 : 1;
    g.scale(k, k);
    g.fillStyle = beaten ? "#c9c4bd" : active ? RED : met ? "#b9a7e3" : GOLD;
    g.strokeStyle = INK;
    g.lineWidth = 2;
    g.beginPath();
    g.arc(0, 0, 13, 0, 7);
    g.fill();
    g.stroke();
    g.fillStyle = INK;
    g.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = (k * Math.PI) / 5,
        r = k % 2 ? 3.4 : 8;
      g.lineTo(Math.sin(a) * r, -Math.cos(a) * r);
    }
    g.closePath();
    g.fill();
    g.restore();
  }
  function strokePath(gg, pts, toPx, width, from = 0) {
    if (!pts || pts.length < 2) return;
    gg.beginPath();
    for (let i = from; i < pts.length; i++) {
      const [x, y] = toPx(pts[i][0], pts[i][1]);
      i === from ? gg.moveTo(x, y) : gg.lineTo(x, y);
    }
    gg.lineJoin = gg.lineCap = "round";
    gg.strokeStyle = INK;
    gg.lineWidth = width + 3;
    gg.stroke();
    gg.strokeStyle = route.status === "search" ? "rgba(214,69,47,.55)" : RED;
    gg.lineWidth = width;
    gg.setLineDash(route.status === "search" ? [width * 2, width * 2] : []);
    gg.stroke();
    gg.setLineDash([]);
  }
  function draw() {
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.fillStyle = "#e9e2cf";
    g.fillRect(0, 0, W, H);
    g.imageSmoothingEnabled = true;
    const blit = (L) => {
      const [x, y] = toScreen(L.x0, L.z0),
        s = (TN * L.ts) / view.upp;
      g.drawImage(L.c, x, y, s, s);
    };
    if (layer.ready) blit(layer);
    if (job.row > 0) blit(job);
    // roads
    g.lineJoin = g.lineCap = "round";
    for (const pass of [0, 1])
      for (const r of roads.lines) {
        g.beginPath();
        for (let i = 0; i < r.pts.length; i++) {
          const [x, y] = toScreen(r.pts[i][0], r.pts[i][1]);
          i ? g.lineTo(x, y) : g.moveTo(x, y);
        }
        const w = Math.max(r.sec ? 1.2 : 1.8, 22 / view.upp) * (r.sec ? 0.8 : 1);
        g.strokeStyle = pass ? "#3a3550" : "rgba(251,248,239,.9)";
        g.lineWidth = pass ? w : w + 2.5;
        g.stroke();
      }
    // paper grain + grid every 1 km
    g.strokeStyle = "rgba(31,29,43,.08)";
    g.lineWidth = 1;
    const grid = view.upp > 12 ? 5000 : 1000;
    for (let x = Math.floor((view.cx - (W / 2) * view.upp) / grid) * grid; x < view.cx + (W / 2) * view.upp; x += grid) {
      const [sx] = toScreen(x, 0);
      g.beginPath();
      g.moveTo(sx, 0);
      g.lineTo(sx, H);
      g.stroke();
    }
    for (let z = Math.floor((view.cz - (H / 2) * view.upp) / grid) * grid; z < view.cz + (H / 2) * view.upp; z += grid) {
      const [, sy] = toScreen(0, z);
      g.beginPath();
      g.moveTo(0, sy);
      g.lineTo(W, sy);
      g.stroke();
    }
    // region names
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `400 ${view.upp > 14 ? 15 : 19}px "Caveat Brush",cursive`;
    for (const e of regions.values()) {
      if (e.n < 2) continue;
      const [sx, sy] = toScreen(e.sx / e.n, e.sz / e.n);
      if (sx < -80 || sy < -20 || sx > W + 80 || sy > H + 20) continue;
      g.lineWidth = 4;
      g.strokeStyle = "rgba(251,248,239,.85)";
      g.strokeText(e.r.name, sx, sy);
      g.fillStyle = "rgba(31,29,43,.8)";
      g.fillText(e.r.name, sx, sy);
    }
    // route + destination
    if (route.pts) strokePath(g, route.pts, toScreen, 5, Math.max(0, route.i));
    if (route.goal) {
      const [gx, gy] = toScreen(route.goal[0], route.goal[1]);
      drawPin(gx, gy, RED);
    }
    // bosses
    g.font = `700 10px "DM Sans",sans-serif`;
    for (const b of lastBosses) {
      if (b.status !== "ready") continue;
      const [sx, sy] = toScreen(b.x, b.z);
      if (sx < -20 || sy < -20 || sx > W + 20 || sy > H + 20) continue;
      drawBossIcon(sx, sy, b.met, route.boss === b.rid, b.defeated);
      if (b.defeated) {
        g.fillStyle = INK;
        g.font = `700 14px "DM Sans",sans-serif`;
        g.fillText("✓", sx + 11, sy - 11);
        g.font = `700 10px "DM Sans",sans-serif`;
      }
      if (view.upp < 16) {
        g.lineWidth = 3;
        g.strokeStyle = PAPER;
        g.strokeText(b.name.toUpperCase(), sx, sy + 22);
        g.fillStyle = INK;
        g.fillText(b.name.toUpperCase(), sx, sy + 22);
      }
    }
    // you
    const [px, py] = toScreen(car.x, car.z);
    g.save();
    g.translate(px, py);
    g.fillStyle = "rgba(214,69,47,.18)";
    g.beginPath();
    g.arc(0, 0, 22 + Math.sin(performance.now() / 300) * 3, 0, 7);
    g.fill();
    g.rotate(-car.heading);
    g.fillStyle = RED;
    g.strokeStyle = INK;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, -13);
    g.lineTo(9, 10);
    g.lineTo(0, 5);
    g.lineTo(-9, 10);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
    // north + scale bar
    g.fillStyle = INK;
    g.font = `700 13px "DM Sans",sans-serif`;
    const small = matchMedia("(max-width:760px),(max-height:480px)").matches;
    g.fillText("N ↑", W - 34, small ? 28 : H - 250);
    const nice = [100, 250, 500, 1000, 2000, 5000, 10000].find((v) => v / view.upp > 70) || 10000,
      bw = nice / view.upp,
      bx = W - bw - 76,
      by = H - 26;
    if (!matchMedia("(max-width:760px),(max-height:480px)").matches) {
      g.fillRect(bx, by, bw, 4);
      g.fillText(fmtDist(nice), bx + bw / 2, by - 9);
    }
  }
  function updBossList() {
    const ul = $("wmBossList"),
      ready = lastBosses.filter((b) => b.status === "ready"),
      pending = lastBosses.length - ready.length;
    $("wmBossN").textContent = pending ? `${ready.length} · finding ${pending}…` : `${ready.length}`;
    ul.innerHTML = ready
      .slice(0, 24)
      .map(
        (b) =>
          `<li data-rid="${b.rid}"${b.defeated ? ' style="opacity:.5"' : ""}><i>${b.defeated ? "✓" : "★"}</i><div>${b.name}<small>${b.region}${b.defeated ? " · defeated" : ""}</small></div><em>${fmtDist(b.d)}</em></li>`,
      )
      .join("");
  }

  /* ------------------------------ open / close ------------------------------ */
  function open() {
    if (isOpen || (ctx.canOpen && !ctx.canOpen())) return;
    isOpen = true;
    game.mapOpen = true;
    for (const k in ctx.keys || {}) ctx.keys[k] = false;
    root.classList.add("open");
    resize();
    view.cx = car.x;
    view.cz = car.z;
    if (!layer.ready) view.upp = clamp(2600 / Math.max(W, H), 1.6, 4); // ~2.6 km across
    const r = regionAt(car.x, car.z);
    $("wmHere").textContent = `You're in ${r.name}`;
    updRouteBar();
  }
  function close() {
    if (!isOpen) return;
    isOpen = false;
    game.mapOpen = false;
    root.classList.remove("open");
    $("wmCard").classList.remove("on");
  }

  /* ------------------------------ per frame ------------------------------ */
  let chipT = 0;
  const tmp = new THREE.Vector3();
  function update(dt) {
    // route planning runs whether or not the map is open (4 ms a frame at most)
    if (route.router && !route.router.done) {
      if (route.router.step(isOpen ? 6 : 3)) {
        route.pts = route.router.path();
        route.status = route.router.found ? "ok" : "partial";
        route.i = 0;
        route.router = null;
        updRouteBar();
      }
    }
    if (route.goal) followRoute(dt);
    if (isOpen) {
      wantTerrain();
      pumpTerrain(5);
      wantRoads();
      wantRegions();
      pumpRegions(2);
      const w = wild();
      if (w) {
        const t0 = performance.now();
        while (performance.now() - t0 < 3 && w.pumpLairs(120) > 0);
      }
      if ((listT -= dt) <= 0) {
        listT = 0.4;
        lastBosses = bossesInView();
        updBossList();
        updRouteBar();
      }
      draw();
    }
  }
  function followRoute(dt) {
    const pts = route.pts,
      gx = route.goal[0],
      gz = route.goal[1],
      dGoal = Math.hypot(gx - car.x, gz - car.z);
    beacon.beam.material.opacity = 0.22 + Math.sin(performance.now() / 400) * 0.08;
    beacon.ring.rotation.y += dt;
    beacon.grp.scale.setScalar(clamp(dGoal / 120, 1, 6));
    if (dGoal < (glider.on ? 40 : 22)) {
      toast(route.boss ? `★ You found ${route.label.split(" (")[0]}!` : "📍 You've arrived");
      clearRoute();
      return;
    }
    // re-plan when you switch Pokémon or wander off the route
    const mode = moveMode();
    if (mode !== route.mode && !(route.status === "search" && route.router)) return planRoute();
    if (!pts || pts.length < 2) return;
    let best = route.i,
      bd = Infinity,
      bt = 0;
    for (let i = Math.max(0, route.i - 1); i < Math.min(pts.length - 1, route.i + 8); i++) {
      const [ax, az] = pts[i],
        [bx, bz] = pts[i + 1],
        vx = bx - ax,
        vz = bz - az,
        L2 = vx * vx + vz * vz || 1,
        t = clamp(((car.x - ax) * vx + (car.z - az) * vz) / L2, 0, 1),
        d = Math.hypot(ax + vx * t - car.x, az + vz * t - car.z);
      if (d < bd) (bd = d), (best = i), (bt = t);
    }
    route.i = best;
    if (route.status !== "search" && mode !== "fly") {
      route.offT = bd > 75 ? route.offT + dt : 0;
      if (route.offT > 1.5) return planRoute();
    }
    // distance left along the route, and a point ~45 m ahead to point the arrow at
    const [ax, az] = pts[best],
      [bx, bz] = pts[best + 1],
      segL = Math.hypot(bx - ax, bz - az);
    route.left = segL * (1 - bt) + pathLength(pts, best + 1);
    let need = 45,
      tx = bx,
      tz = bz;
    if (segL * (1 - bt) < need) {
      need -= segL * (1 - bt);
      for (let i = best + 1; i < pts.length - 1; i++) {
        const L = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
        if (L >= need) {
          tx = pts[i][0] + ((pts[i + 1][0] - pts[i][0]) * need) / L;
          tz = pts[i][1] + ((pts[i + 1][1] - pts[i][1]) * need) / L;
          need = 0;
          break;
        }
        need -= L;
        tx = pts[i + 1][0];
        tz = pts[i + 1][1];
      }
    } else {
      tx = ax + ((bx - ax) * (bt * segL + need)) / segL;
      tz = az + ((bz - az) * (bt * segL + need)) / segL;
    }
    if ((chipT -= dt) <= 0 && game.started) {
      chipT = 0.1;
      camera.getWorldDirection(tmp);
      const rel = Math.atan2(tx - car.x, -(tz - car.z)) - Math.atan2(tmp.x, -tmp.z);
      $n("navT").textContent = `${route.label.split(" (")[0]} · ${fmtDist(route.left)}`;
      $n("navA").style.transform = `rotate(${rel}rad)`;
      chip.classList.add("on");
    }
  }
  const $n = (id) => chip.querySelector("#" + id);

  /** minimap overlay: remaining route + destination pin (clamped to the edge when off the map) */
  function minimap(mg, MW, toPx) {
    if (!route.goal) return;
    mg.save();
    mg.beginPath();
    mg.arc(MW / 2, MW / 2, MW / 2, 0, 7);
    mg.clip();
    if (route.pts) {
      mg.beginPath();
      const pts = route.pts;
      for (let i = route.i; i < pts.length; i++) {
        const [x, y] = toPx(pts[i][0], pts[i][1]);
        i === route.i ? mg.moveTo(...toPx(car.x, car.z)) : 0;
        mg.lineTo(x, y);
      }
      mg.lineJoin = mg.lineCap = "round";
      mg.strokeStyle = INK;
      mg.lineWidth = MW * 0.03;
      mg.stroke();
      mg.strokeStyle = RED;
      mg.lineWidth = MW * 0.018;
      mg.stroke();
    }
    let [x, y] = toPx(route.goal[0], route.goal[1]);
    const lim = MW / 2 - MW * 0.06,
      ox = x - MW / 2,
      oy = y - MW / 2,
      k = Math.hypot(ox, oy) / lim;
    if (k > 1) (x = MW / 2 + ox / k), (y = MW / 2 + oy / k);
    mg.fillStyle = RED;
    mg.strokeStyle = INK;
    mg.lineWidth = MW * 0.008;
    mg.beginPath();
    mg.arc(x, y, MW * 0.035, 0, 7);
    mg.fill();
    mg.stroke();
    mg.restore();
  }

  return {
    open,
    close,
    toggle: () => (isOpen ? close() : open()),
    get isOpen() {
      return isOpen;
    },
    update,
    minimap,
    setDestination,
    clearRoute,
    get route() {
      return route;
    },
    get view() {
      return view;
    },
  };
}
