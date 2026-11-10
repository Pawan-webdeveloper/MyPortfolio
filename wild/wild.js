// Wild Pokémon for Pawan World.
//
// Each named region of the world has its own Pokémon (wild/roster.js), checked against PokéAPI
// types at build time. This module brings them to life around the player:
//
//   wanderers  roam the land, the shallows and the lakes near you (species = the region's roster)
//   herds      Miltank/Mareep/Deerling/Psyduck… where the world used to paint cows, sheep, deer, ducks
//   flocks     the region's bird Pokémon fly over in V formations (they replaced the paper birds)
//   bosses     one unique Pokémon per region, waiting at a fixed lair; a tracker shows the way
//
// They are solid: cars and Greninja bump into them (small ones get shoved, bosses don't budge),
// Charizard can't fly through them, and they react: timid ones run, curious ones come over,
// E (on foot) greets the nearest one. First sightings fill a Pokédex saved in localStorage
// (`pw-dex`) — the hook for battles later.
//
// Rendering: every model was baked to a static mesh by tools/build-wild.mjs, so each species is
// drawn with one InstancedMesh per material; motion (walk bob, waddle, hops, swimming, hovering,
// flight, squash & stretch) is procedural. Species load on demand and unload when unused.
import * as THREE from "three";
import { REGIONS, GAIT, SINK, TIMID, CURIOUS, FACE, WINGS, LEGS } from "./roster.js";

const HOP = new Set(GAIT.hop),
  WADDLE = new Set(GAIT.waddle),
  SLITHER = new Set(GAIT.slither),
  HOVER = new Set(GAIT.hover),
  WING_S = new Set(WINGS),
  BIPED_S = new Set(LEGS.biped),
  QUAD_S = new Set(LEGS.quad),
  TIMID_S = new Set(TIMID),
  CURIOUS_S = new Set(CURIOUS);

/** Game-unit height for a species (the player's Greninja is 2.6, Charizard 3). */
export function targetHeight(e) {
  return e.role === "boss"
    ? Math.min(13, Math.max(3.8, 2.6 + e.height * 1.9))
    : Math.min(5.5, Math.max(1.1, 1.1 + e.height * 1.5));
}

let defaultLoader = null; // one shared loader (and Draco worker pool), even for parallel loads
function loaderFor(base) {
  return (defaultLoader ??= Promise.all([
    import("three/addons/loaders/GLTFLoader.js"),
    import("three/addons/loaders/DRACOLoader.js"),
  ]).then(([{ GLTFLoader }, { DRACOLoader }]) =>
    new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath(base + "vendor/draco/")),
  ));
}

/**
 * Measure a walker's legs on its rest-pose mesh (which species are bipeds / quadrupeds / flyers
 * comes from roster.js):
 *   mode 1 biped · mode 2 quadruped · mode 3 flapping wings · mode 0 whole-body motion only
 * legTop is the hip (biped) or belly (quadruped) height: the lowest height where the body
 * closes over the gap between the legs. xc/zc is the centre of the feet; sideX/sideZ how far
 * out a vertex must be to count as fully "left/right" or "front/back" leg.
 */
function analyzeRig(id, parts, h, hx, hz) {
  const rig = { mode: 0, legTop: 0, xc: 0, zc: 0, sideX: 1, sideZ: 1, wingX: hx * 0.3 };
  if (WING_S.has(id)) {
    rig.mode = 3;
    return rig;
  }
  const quad = QUAD_S.has(id);
  if (!quad && !BIPED_S.has(id)) return rig;
  const feet = [],
    all = [];
  for (const p of parts) {
    const a = p.geometry.getAttribute("position");
    for (let i = 0; i < a.count; i++) {
      const v = [a.getX(i), a.getY(i), a.getZ(i)];
      all.push(v);
      if (v[1] < h * 0.06) feet.push(v);
    }
  }
  const med = (arr) => arr.sort((a, b) => a - b)[Math.floor(arr.length / 2)] ?? 0;
  const pct = (arr, q) => arr.sort((a, b) => a - b)[Math.floor((arr.length - 1) * q)] ?? 0;
  const xc = feet.length ? med(feet.map((v) => v[0])) : 0;
  let zc = feet.length ? med(feet.map((v) => v[2])) : 0;
  if (quad && feet.length) zc = (pct(feet.map((v) => v[2]), 0.05) + pct(feet.map((v) => v[2]), 0.95)) / 2;
  const fw = Math.max(0.1 * hx, feet.length ? pct(feet.map((v) => Math.abs(v[0] - xc)), 0.9) : 0.4 * hx),
    fl = Math.max(0.15 * hz, feet.length ? pct(feet.map((v) => Math.abs(v[2] - zc)), 0.9) : 0.5 * hz);
  const step = h * 0.02,
    bands = Math.ceil((h * 0.6) / step),
    filled = new Uint8Array(bands);
  for (const v of all) {
    const b = Math.floor(v[1] / step);
    if (b < 2 || b >= bands) continue;
    const inX = Math.abs(v[0] - xc) < 0.15 * fw,
      inZ = quad ? Math.abs(v[2] - zc) < 0.25 * fl : Math.abs(v[2] - zc) < 0.3 * hz;
    if (inX && inZ) filled[b] = 1;
  }
  let legTop = 0;
  for (let b = 2; b < bands; b++)
    if (filled[b]) {
      legTop = b * step;
      break;
    }
  if (legTop < h * 0.08) legTop = h * (quad ? 0.32 : 0.28); // legs pressed together: a sensible hip height
  Object.assign(rig, {
    mode: quad ? 2 : 1,
    legTop: clamp(legTop, h * 0.1, h * 0.5),
    xc,
    zc,
    sideX: Math.max(0.04, fw * 0.45),
    sideZ: Math.max(0.04, fl * 0.45),
  });
  return rig;
}

/** Vertex-shader gait: legs swing about the hip (feet lift on the forward swing), wings flap. */
function patchGait(mat, rig) {
  const u = {
    uRig: { value: new THREE.Vector4(rig.legTop, rig.xc, rig.zc, rig.sideX) },
    uRig2: { value: new THREE.Vector4(rig.mode, rig.sideZ, rig.wingX, 0) },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 aGait;\nuniform vec4 uRig, uRig2;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        {
          float ph = aGait.x, amp = aGait.y, mode = uRig2.x;
          if (amp > 0.0005 && mode > 0.5) {
            if (mode < 2.5) {
              float L = uRig.x;
              float wgt = 1.0 - smoothstep(L * 0.72, L, transformed.y);
              float below = max(L - transformed.y, 0.0);
              float side = clamp((transformed.x - uRig.y) / uRig.w, -1.0, 1.0);
              if (mode > 1.5) side *= -clamp((transformed.z - uRig.z) / uRig2.y, -1.0, 1.0);
              float th = amp * side * sin(ph);
              transformed.z -= below * sin(th) * wgt;
              transformed.y += (below * (1.0 - cos(th)) + max(0.0, side * cos(ph)) * below * 0.35 * amp) * wgt;
            } else {
              float dx = transformed.x - uRig.y, ax = abs(dx);
              float d = max(ax - uRig2.z, 0.0);
              float phi = amp * sin(ph) * smoothstep(uRig2.z, uRig2.z * 1.4 + 0.01, ax);
              transformed.y += d * sin(phi);
              transformed.x -= sign(dx) * d * (1.0 - cos(phi));
            }
          }
        }`,
      );
  };
  mat.customProgramCacheKey = () => "wild-gait-1";
}

/**
 * Load a baked wild model and normalise it: feet exactly on y = 0, centred on its footprint,
 * facing the game's forward (−Z), scaled to its game height.
 */
export async function prepareSpecies(id, entry, base = "", height, { loader, material } = {}) {
  const gltf = await (loader || (await loaderFor(base))).loadAsync(`${base}models/pokemon/wild/${id}.glb`);
  gltf.scene.updateMatrixWorld(true);
  const parts = [];
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    if (!g.getAttribute("normal")) g.computeVertexNormals();
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    parts.push({ geometry: g, material: material ? material(m) : m });
  });
  const box = new THREE.Box3();
  for (const p of parts) {
    p.geometry.computeBoundingBox();
    box.union(p.geometry.boundingBox);
  }
  const size = box.getSize(new THREE.Vector3()),
    c = box.getCenter(new THREE.Vector3()),
    H = height ?? targetHeight(entry);
  let s = H / Math.max(1e-4, size.y);
  const long = Math.max(size.x, size.z) * s;
  if (long > H * 2.4) s *= (H * 2.4) / long; // long bodies (Onix, Gyarados) stay sensible
  const yaw = ((FACE[id] ?? 180) * Math.PI) / 180;
  for (const p of parts) {
    p.geometry.translate(-c.x, -box.min.y, -c.z);
    p.geometry.scale(s, s, s);
    if (yaw) p.geometry.rotateY(yaw); // the source rigs face +Z; the game's forward is −Z
    p.geometry.computeBoundingSphere();
  }
  const hx = (size.x * s) / 2,
    hz = (size.z * s) / 2,
    h = size.y * s;
  const rig = analyzeRig(id, parts, h, hx, hz);
  for (const p of parts) patchGait(p.material, rig);
  return { id, entry, parts, h, hx, hz, rig, r: Math.max(0.45, Math.max(hx, hz) * 0.78) };
}

/* ------------------------------------------------------------------ */

function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const strHash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};
const rr = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const typeLine = (e) => e.types.map((t) => t[0].toUpperCase() + t.slice(1)).join(" / ");

/**
 * @param ctx  hooks into the game (see index.html → "wild Pokémon"): scene, car, game, glider,
 *             camera, chunks, heightAt, groundAt, regionAt, roadNear, HALF, SH, WATER_Y,
 *             loader, material, quality, fx { burst, tip, toast, cry, shake }
 */
export async function createWild(ctx) {
  const { scene, car, game, glider, camera, chunks, heightAt, groundAt, regionAt, roadNear, HALF, SH, WATER_Y, fx } = ctx;
  const base = ctx.base || "";
  const dex = await (await fetch(`${base}wild/dex.json`)).json();
  const q = clamp(ctx.quality ?? 1, 0.3, 1);
  const N_WANDER = Math.round(28 * q),
    N_HERDS = Math.max(2, Math.round(6 * q)),
    N_FLOCKS = Math.max(2, Math.round(5 * q)),
    VIEW = 380; // beyond this they despawn (fog hides the hand-off)

  /* ---------- species: lazy load → instanced batch ---------- */
  const species = new Map();
  let now = 0;
  class Batch {
    constructor(sp) {
      this.sp = sp;
      this.cap = 0;
      this.n = 0;
      this.meshes = [];
      this.grow(8);
    }
    grow(cap) {
      const old = this.meshes;
      // per-instance gait (phase, amplitude), shared by every part of the species
      const ga = new THREE.InstancedBufferAttribute(new Float32Array(cap * 2), 2);
      ga.setUsage(THREE.DynamicDrawUsage);
      if (this.ga) ga.array.set(this.ga.array.subarray(0, this.n * 2));
      this.ga = ga;
      for (const p of this.sp.parts) p.geometry.setAttribute("aGait", ga);
      this.meshes = this.sp.parts.map((p, i) => {
        const im = new THREE.InstancedMesh(p.geometry, p.material, cap);
        im.frustumCulled = false;
        im.castShadow = true;
        im.receiveShadow = true;
        im.count = 0;
        im.name = `wild:${this.sp.entry.name}`;
        if (old[i]) {
          im.instanceMatrix.array.set(old[i].instanceMatrix.array.subarray(0, this.n * 16));
          scene.remove(old[i]);
          old[i].dispose();
        }
        scene.add(im);
        return im;
      });
      this.cap = cap;
    }
    push(m, ph = 0, amp = 0) {
      if (this.n >= this.cap) this.grow(this.cap * 2);
      for (const im of this.meshes) im.setMatrixAt(this.n, m);
      this.ga.array[this.n * 2] = ph;
      this.ga.array[this.n * 2 + 1] = amp;
      this.n++;
    }
    end() {
      for (const im of this.meshes) {
        im.visible = this.n > 0; // no empty draw calls (or shadow passes) for idle species
        if (im.count === 0 && this.n === 0) continue;
        im.count = this.n;
        im.instanceMatrix.needsUpdate = true;
      }
      if (this.n) this.ga.needsUpdate = true;
    }
    dispose() {
      for (const im of this.meshes) {
        scene.remove(im);
        im.dispose();
      }
      for (const p of this.sp.parts) {
        p.geometry.dispose();
        if (p.material.map) p.material.map.dispose();
        p.material.dispose();
      }
    }
  }
  function want(id) {
    let s = species.get(id);
    if (!s) {
      s = { state: "loading", last: now };
      species.set(id, s);
      if (!dex[id]) {
        s.state = "failed";
        return null;
      }
      prepareSpecies(id, dex[id], base, undefined, { loader: ctx.loader, material: ctx.material })
        .then((sp) => {
          s.sp = sp;
          s.batch = new Batch(sp);
          s.state = "ready";
        })
        .catch((e) => {
          s.state = "failed";
          console.warn(`[wild] #${id} failed to load`, e);
        });
    }
    s.last = now;
    return s.state === "ready" ? s : null;
  }
  const regionSpecies = (R) => [R.boss, ...(R.land || []), ...(R.water || []), ...(R.shore || []), R.air];

  /* ---------- Pokédex (seen / greeted), kept for battles later ---------- */
  const store = (() => {
    try {
      return JSON.parse(localStorage.getItem("pw-dex")) || {};
    } catch (_) {
      return {};
    }
  })();
  const seen = new Set(store.seen || []),
    greeted = new Set(store.greeted || []),
    bossesMet = new Set(store.bosses || []);
  const save = () => {
    try {
      localStorage.setItem("pw-dex", JSON.stringify({ seen: [...seen], greeted: [...greeted], bosses: [...bossesMet] }));
    } catch (_) {}
  };
  const TOTAL = Object.keys(dex).length;

  /* ---------- HUD: Pokédex count + boss tracker ---------- */
  const hud = document.createElement("div");
  hud.id = "wildHud";
  hud.className = "hud";
  hud.innerHTML = `<style>
    #wildHud{position:absolute;left:50%;top:14px;transform:translateX(-50%);display:flex;gap:8px;align-items:center;pointer-events:none;z-index:5}
    #wildHud .chip{background:rgba(251,248,239,.92);border:1.5px solid #1f1d2b;box-shadow:2px 2px 0 #1f1d2b;padding:5px 10px;
      font:700 9px "DM Sans",system-ui;letter-spacing:.18em;text-transform:uppercase;color:#1f1d2b;white-space:nowrap}
    #wildHud .ball{display:inline-block;width:9px;height:9px;border-radius:50%;border:1.5px solid #1f1d2b;margin-right:6px;vertical-align:-1px;
      background:linear-gradient(#d6452f 0 45%,#1f1d2b 45% 55%,#fbf8ef 55%)}
    #wildHud #wBoss{display:none}
    #wildHud #wBoss.on{display:block}
    #wildHud #wArrow{display:inline-block;margin-left:6px;transition:transform .2s;color:#d6452f}
    body.hidehud #wildHud,body.home-on #wildHud,.studio #wildHud{display:none}
    body.touch #wildHud{top:auto;bottom:calc(10px + env(safe-area-inset-bottom))}
  </style><div class="chip" id="wDex"><span class="ball"></span><span id="wDexN"></span></div>
  <div class="chip" id="wBoss">★ <span id="wBossT"></span><span id="wArrow">▲</span></div>`;
  (document.getElementById("hud") || document.body).appendChild(hud);
  const $w = (id) => hud.querySelector("#" + id);
  const updDex = () => ($w("wDexN").textContent = `Pokédex ${seen.size}/${TOTAL}`);
  updDex();

  /* tips are queued so a crowd of new sightings doesn't flash past */
  const tipQ = [];
  let tipT = 0;
  const queueTip = (k, h, p, ms = 3600) => {
    if (tipQ.length < 4) tipQ.push([k, h, p, ms]);
  };

  /* ---------- emote bubbles (! ♥ ?) ---------- */
  const emoteTex = {};
  for (const [k, ch, col] of [
    ["!", "!", "#d6452f"],
    ["love", "♥", "#e0418f"],
    ["?", "?", "#3a5bd9"],
    ["zz", "z", "#6b6b8a"],
  ]) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    g.fillStyle = "#fbf8ef";
    g.strokeStyle = "#1f1d2b";
    g.lineWidth = 4;
    g.beginPath();
    g.arc(32, 28, 22, 0, 7);
    g.moveTo(26, 48);
    g.lineTo(32, 60);
    g.lineTo(38, 48);
    g.fill();
    g.stroke();
    g.fillStyle = col;
    g.font = "bold 30px system-ui";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(ch, 32, 30);
    emoteTex[k] = new THREE.CanvasTexture(c);
    emoteTex[k].colorSpace = THREE.SRGBColorSpace;
  }
  const emotes = [];
  for (let i = 0; i < 8; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: emoteTex["!"], depthWrite: false }));
    s.visible = false;
    s.renderOrder = 5;
    scene.add(s);
    emotes.push({ s, m: null, t: 0 });
  }
  function emote(m, kind, t = 1.4) {
    let e = emotes.find((e) => e.m === m) || emotes.find((e) => !e.m) || emotes.reduce((a, b) => (a.t < b.t ? a : b));
    e.m = m;
    e.t = t;
    e.s.material.map = emoteTex[kind];
    e.s.visible = true;
  }

  /* ---------- the Pokémon themselves ---------- */
  const mons = new Set();
  function gaitOf(id, role) {
    if (role === "water") return "swim";
    if (HOVER.has(id)) return "hover";
    if (SLITHER.has(id)) return "slither";
    if (HOP.has(id)) return "hop";
    if (WADDLE.has(id)) return "waddle";
    return "walk";
  }
  function spawn(id, x, z, kind, extra = {}) {
    for (const k in extra) if (extra[k] === undefined) delete extra[k];
    const e = dex[id];
    const m = {
      id,
      e,
      kind, // wander | herd | flock | boss
      hab: extra.hab || (e.role === "water" ? "water" : e.role === "shore" ? "shore" : "land"),
      gait: extra.gait || gaitOf(id, e.role),
      x,
      z,
      y: 0,
      hd: Math.random() * 6.28,
      v: 0,
      tm: rr(0.3, 2),
      ph: Math.random() * 6.28,
      gp: Math.random() * 6.28,
      hx: x,
      hz: z,
      homeR: extra.homeR || 30,
      scale: extra.scale || 1,
      jy: 0,
      jv: 0,
      tumble: 0,
      kx: 0,
      kz: 0,
      bumpT: 0,
      greetT: 0,
      look: 0,
      gx: NaN,
      gz: NaN,
      gy: 0,
      sp: null,
      ...extra,
    };
    mons.add(m);
    want(id);
    return m;
  }
  const kill = (m) => {
    mons.delete(m);
    for (const e of emotes) if (e.m === m) (e.m = null), (e.s.visible = false);
  };

  /* habitat tests */
  const offRoad = (x, z, pad = 1.5) => roadNear(x, z).d > HALF + pad;
  function habOK(m, x, z) {
    if (m.kind === "flock") return true;
    const h = heightAt(x, z);
    switch (m.hab) {
      case "water":
        return h < WATER_Y - 0.9 && offRoad(x, z, SH + 3);
      case "shore":
        return h > WATER_Y - 1.6 && h < WATER_Y + 1.4 && offRoad(x, z, SH + 1);
      default:
        return h > WATER_Y + 0.35 && offRoad(x, z, SH + 1);
    }
  }

  /* region roster at a point; returns null where no roster applies */
  function rosterAt(x, z) {
    const r = regionAt(x, z);
    const R = REGIONS[r.name];
    return R ? { r, R } : null;
  }

  /* ---------- wanderers ---------- */
  const wanderers = [];
  function placeWanderer(slot, near) {
    for (let k = 0; k < 14; k++) {
      const an = Math.random() * 6.28,
        d = near ? rr(25, VIEW - 40) : rr(VIEW - 110, VIEW - 30),
        x = car.x + Math.cos(an) * d,
        z = car.z + Math.sin(an) * d;
      const ra = rosterAt(x, z);
      if (!ra) continue;
      const { R } = ra,
        h = heightAt(x, z);
      let list, hab;
      if (h < WATER_Y - 0.9) (list = R.water), (hab = "water");
      else if (h < WATER_Y + 0.4) (list = R.shore), (hab = "shore");
      else {
        if (!offRoad(x, z, SH + 2)) continue;
        list = HOVER.has(R.air) ? [...R.land, R.air] : R.land;
        hab = "land";
      }
      if (!list || !list.length) continue;
      const id = list[Math.floor(Math.random() * list.length)];
      if (!dex[id]) continue;
      const m = spawn(id, x, z, "wander", { hab, region: ra.r.name });
      if (!habOK(m, x, z)) {
        kill(m);
        continue;
      }
      slot.m = m;
      return;
    }
    slot.m = null;
    slot.wait = 1 + Math.random();
  }

  /* ---------- herds (where the world used to paint cows / sheep / deer / ducks) ---------- */
  const herds = new Map();
  function scanHerds() {
    const cand = [];
    for (const [key, c] of chunks)
      if (c.mons)
        for (const rec of c.mons) {
          const d = Math.hypot(rec.x - car.x, rec.z - car.z);
          if (d < VIEW - 40 && !herds.has(rec)) cand.push([d, rec, key]);
        }
    cand.sort((a, b) => a[0] - b[0]);
    for (const [, rec, key] of cand) {
      if (herds.size >= N_HERDS) break;
      const ra = rosterAt(rec.x, rec.z);
      const list = ra && (rec.kind === "ducks" ? ra.R.water : ra.R.land);
      if (!list || !list.length) {
        herds.set(rec, { key, members: [], empty: true });
        continue;
      }
      const id = list[0],
        hab = rec.kind === "ducks" ? "water" : "land",
        members = [],
        n = rec.kind === "ducks" ? Math.min(5, rec.n) : Math.min(5, Math.max(2, rec.n));
      const rnd = mulberry32(strHash(`${Math.round(rec.x)},${Math.round(rec.z)}`));
      for (let i = 0; i < n * 3 && members.length < n; i++) {
        const a = rnd() * 6.28,
          d = i ? 2 + rnd() * 7 : 0,
          x = rec.x + Math.cos(a) * d,
          z = rec.z + Math.sin(a) * d;
        const m = spawn(id, x, z, "herd", {
          hab,
          homeR: 11,
          region: ra.r.name,
          // a duck family: mum in front, little ones behind
          scale: rec.kind === "ducks" && members.length ? 0.62 : 0.85 + rnd() * 0.25,
          leader: rec.kind === "ducks" && members.length ? members[0] : null,
          gait: rec.kind === "ducks" ? "swim" : undefined,
        });
        m.hx = rec.x;
        m.hz = rec.z;
        if (!habOK(m, x, z)) {
          kill(m);
          continue;
        }
        members.push(m);
      }
      herds.set(rec, { key, members });
    }
    for (const [rec, hd] of herds) {
      if (!chunks.has(hd.key) || Math.hypot(rec.x - car.x, rec.z - car.z) > VIEW + 40) {
        for (const m of hd.members) kill(m);
        herds.delete(rec);
      }
    }
  }

  /* ---------- flocks of bird Pokémon ---------- */
  const flocks = [];
  for (let i = 0; i < N_FLOCKS; i++) flocks.push({ members: [], wait: i * 1.5, v: new THREE.Vector3(), alt: 0 });
  function placeFlock(f) {
    for (const m of f.members) kill(m);
    f.members = [];
    for (let k = 0; k < 8; k++) {
      const an = Math.random() * 6.28,
        d = rr(160, VIEW + 60),
        x = car.x + Math.cos(an) * d,
        z = car.z + Math.sin(an) * d,
        ra = rosterAt(x, z);
      if (!ra || HOVER.has(ra.R.air) || !dex[ra.R.air]) continue;
      const id = ra.R.air,
        n = 3 + Math.floor(Math.random() * 3),
        hdg = an + Math.PI + rr(-0.7, 0.7),
        th = targetHeight(dex[id]);
      f.v.set(Math.cos(hdg), 0, Math.sin(hdg)).multiplyScalar(rr(9, 13));
      f.x = x;
      f.z = z;
      f.alt = Math.max(heightAt(x, z), WATER_Y) + rr(16, 48);
      f.hd = Math.atan2(-f.v.x, -f.v.z);
      for (let i = 0; i < n; i++) {
        const s = Math.ceil(i / 2),
          sp = th * 1.7 + 1.5;
        const m = spawn(id, x, z, "flock", { gait: "bird", hab: "air", region: ra.r.name });
        m.ox = (i % 2 ? 1 : -1) * s * sp;
        m.oz = s * sp;
        m.oy = Math.sin(i * 1.7) * 0.8;
        m.flock = f;
        f.members.push(m);
      }
      return;
    }
    f.wait = 2;
  }

  /* ---------- bosses: one per region, fixed lair ---------- */
  const lairs = new Map(); // regionId → { status, ... }
  // every region instance has one fixed lair: the valid spot closest to the middle of its cell
  // (deterministic, so the map can show bosses of regions you haven't visited yet). Lairs found
  // before this rule existed are kept, so bosses you already met stay where they were.
  const savedLairs = (() => {
    try {
      return JSON.parse(localStorage.getItem("pw-lairs")) || {};
    } catch (_) {
      return {};
    }
  })();
  const lairQueue = new Set();
  function lairFor(r) {
    let L = lairs.get(r.id);
    if (L) return L;
    const R = REGIONS[r.name];
    if (!R || !dex[R.boss]) {
      L = { status: "none" };
      lairs.set(r.id, L);
      return L;
    }
    const mm = /^([a-z]+)(-?\d+),(-?\d+)$/.exec(r.id);
    const cx = +mm[2],
      cz = +mm[3];
    const town = mm[1] === "town",
      S = town ? 1 / 0.000267 : 6000,
      x0 = town ? (cx - 0.5) * S : cx * S,
      z0 = town ? (cz - 0.5) * S : cz * S;
    L = { status: "search", tries: 0, rnd: mulberry32(strHash(r.id)), x0, z0, S, id: R.boss, region: r.name, rid: r.id, mon: null, ex: x0 + S / 2, ez: z0 + S / 2, best: null, bestScore: 1e9 };
    L.hab = REGIONS[r.name].biome === "lake" ? "water" : "land";
    const sv = savedLairs[r.id];
    if (sv && sv[2] === R.boss) {
      L.status = "ready";
      L.x = sv[0];
      L.z = sv[1];
    }
    lairs.set(r.id, L);
    return L;
  }
  function searchLair(L, budget) {
    const e = dex[L.id],
      water = e.role === "boss" && L.region && REGIONS[L.region].biome === "lake",
      mountain = REGIONS[L.region].biome === "mountain";
    while (budget-- > 0 && L.status === "search") {
      if (++L.tries > 2500) {
        if (L.best) {
          L.status = "ready";
          [L.x, L.z] = L.best;
          savedLairs[L.rid] = [Math.round(L.x), Math.round(L.z), L.id];
          try {
            localStorage.setItem("pw-lairs", JSON.stringify(savedLairs));
          } catch (_) {}
        } else L.status = "none";
        return;
      }
      const x = L.x0 + L.rnd() * L.S,
        z = L.z0 + L.rnd() * L.S;
      const h = heightAt(x, z);
      if (water) {
        if (h > WATER_Y - 2.4) continue;
        const rd = roadNear(x, z).d;
        if (rd < 30 || rd > 160) continue;
        let deep = true;
        for (let a = 0; a < 6.28 && deep; a += 1.05) if (heightAt(x + Math.sin(a) * 9, z + Math.cos(a) * 9) > WATER_Y - 1.2) deep = false;
        if (!deep) continue;
      } else {
        if (h < WATER_Y + 1.5) continue;
        const rd = roadNear(x, z).d;
        if (rd < 24 || rd > (mountain ? 200 : 110)) continue;
        let flat = true;
        const tol = mountain ? 4.5 : 2.2;
        for (let a = 0; a < 6.28 && flat; a += 1.05) {
          const hh = heightAt(x + Math.sin(a) * 6, z + Math.cos(a) * 6);
          if (Math.abs(hh - h) > tol || hh < WATER_Y + 0.6) flat = false;
        }
        if (!flat) continue;
      }
      const score = Math.hypot(x - L.ex, z - L.ez);
      if (score >= L.bestScore) continue;
      if (regionAt(x, z).id !== L.rid) continue;
      L.bestScore = score;
      L.best = [x, z];
    }
  }
  const bossMats = {
    ring: new THREE.MeshBasicMaterial({ color: "#f2c230", transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }),
  };
  const ringGeo = new THREE.RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2);
  const starTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    g.fillStyle = "#f2c230";
    g.strokeStyle = "#1f1d2b";
    g.lineWidth = 4;
    g.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = (k * Math.PI) / 5,
        r = k % 2 ? 12 : 28;
      g.lineTo(32 + Math.sin(a) * r, 34 - Math.cos(a) * r);
    }
    g.closePath();
    g.fill();
    g.stroke();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  function spawnBoss(L) {
    const m = spawn(L.id, L.x, L.z, "boss", {
      hab: L.hab,
      homeR: 7,
      region: L.region,
      lair: L,
      // lake legends either fly over the water (Lugia) or swim / wade in it (Kyogre, Palkia)
      gait: L.hab === "water" ? (HOVER.has(L.id) ? "hover" : "swim") : undefined,
    });
    m.hd = L.rnd ? L.rnd() * 6.28 : 0;
    const ring = new THREE.Mesh(ringGeo, bossMats.ring);
    ring.renderOrder = 1;
    const star = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, depthWrite: false, fog: false }));
    star.renderOrder = 6;
    scene.add(ring, star);
    m.ring = ring;
    m.star = star;
    L.mon = m;
  }
  function despawnBoss(L) {
    const m = L.mon;
    scene.remove(m.ring, m.star);
    m.star.material.dispose();
    kill(m);
    L.mon = null;
  }

  /* ---------- per-frame motion ---------- */
  const M4 = new THREE.Matrix4(),
    P = new THREE.Vector3(),
    Q = new THREE.Quaternion(),
    E = new THREE.Euler(0, 0, 0, "YXZ"),
    S = new THREE.Vector3(),
    tmp = new THREE.Vector3();
  let playerSpeed = 0,
    lastPX = car.x,
    lastPZ = car.z;

  function footGround(m, sp) {
    // highest ground under the footprint, so no foot ever sinks into a slope
    if (Math.abs(m.x - m.gx) < 0.05 && Math.abs(m.z - m.gz) < 0.05) return m.gy;
    const s = Math.sin(m.hd),
      c = Math.cos(m.hd),
      a = sp.hz * 0.55 * m.scale,
      b = sp.hx * 0.55 * m.scale;
    let g = groundAt(m.x, m.z);
    g = Math.max(g, groundAt(m.x - s * a, m.z - c * a), groundAt(m.x + s * a, m.z + c * a));
    g = Math.max(g, groundAt(m.x + c * b, m.z - s * b), groundAt(m.x - c * b, m.z + s * b));
    m.gx = m.x;
    m.gz = m.z;
    m.gy = g;
    return g;
  }

  function steer(m, sp, dt, d2, dx, dz) {
    const spd = (1.3 + sp.h * 0.45) * (m.gait === "slither" ? 0.8 : 1) * (m.kind === "boss" ? 0.5 : 1);
    const d = Math.sqrt(d2);
    // headings (forward is −Z, so heading h moves along (−sin h, −cos h)); dx/dz point at the player
    const towardP = Math.atan2(-dx, -dz);
    m.tm -= dt;
    m.look = 0;
    if (m.kind === "boss") {
      if (d < 45) {
        m.v = 0;
        m.look = 1;
        m.tgt = towardP;
        return;
      }
    } else if (TIMID_S.has(m.id) && ((d < 15 && playerSpeed > 3) || d < 6.5) && !glider.on) {
      m.tgt = Math.atan2(dx, dz); // straight away from you
      m.v = spd * 2.3;
      m.tm = 0.6;
      if (!m.fled) {
        m.fled = true;
        emote(m, "!", 0.9);
      }
      return;
    } else if (CURIOUS_S.has(m.id) && d < 24 && playerSpeed < 6 && m.kind !== "flock") {
      m.tgt = towardP;
      m.look = 1;
      m.v = d > sp.r + 4.5 ? spd * 0.6 : 0;
      if (!m.curious) {
        m.curious = true;
        emote(m, "?", 1.1);
      }
      return;
    }
    m.fled = m.fled && d < 30;
    m.curious = m.curious && d < 34;
    if (d < 9 && playerSpeed < 2) m.look = 1;
    if (m.leader && mons.has(m.leader)) {
      // duck families paddle after their mother
      const lx = m.leader.x - m.x,
        lz = m.leader.z - m.z,
        ld = Math.hypot(lx, lz);
      m.tgt = Math.atan2(-lx, -lz);
      m.v = ld > 2.4 ? Math.min(spd * 1.2, ld) : 0;
      return;
    }
    if (m.tm < 0) {
      m.tm = rr(1.5, 5);
      if (Math.random() < (m.kind === "boss" ? 0.3 : 0.55)) {
        m.v = rr(spd * 0.4, spd);
        m.tgt = (m.tgt ?? m.hd) + rr(-1.4, 1.4);
        if (Math.hypot(m.x - m.hx, m.z - m.hz) > m.homeR) m.tgt = Math.atan2(-(m.hx - m.x), -(m.hz - m.z));
      } else m.v = 0;
    }
    if (m.look) m.tgt = towardP;
  }

  function moveGround(m, sp, dt) {
    if (m.tgt !== undefined) m.hd += angDiff(m.tgt, m.hd) * Math.min(1, dt * (m.look ? 4 : 3));
    let vx = -Math.sin(m.hd) * m.v,
      vz = -Math.cos(m.hd) * m.v;
    if (m.tumble > 0) {
      vx += m.kx;
      vz += m.kz;
      const k = Math.exp(-3 * dt);
      m.kx *= k;
      m.kz *= k;
    }
    if (!vx && !vz) return;
    const nx = m.x + vx * dt,
      nz = m.z + vz * dt;
    if (habOK(m, nx, nz)) {
      m.x = nx;
      m.z = nz;
    } else {
      m.kx = m.kz = 0;
      if (m.v > 0) {
        m.tgt = m.hd + Math.PI * rr(0.6, 1.4);
        m.hd += angDiff(m.tgt, m.hd) * 0.3;
        m.tm = rr(0.6, 1.5);
      }
    }
  }

  // gait phase/amplitude for the current frame (read by Batch.push → vertex shader)
  let gPh = 0,
    gAmp = 0;
  const TAU = Math.PI * 2;
  function pose(m, sp, t, dt) {
    const h = sp.h * m.scale,
      rig = sp.rig,
      spd = 1.3 + sp.h * 0.45,
      moving = Math.min(1, m.v / 0.35),
      run = clamp((m.v / spd - 1.15) / 0.6, 0, 1); // 0 walking … 1 running flat out
    const turn = Math.abs(angDiff(m.hd, m.lastHd ?? m.hd)) / Math.max(dt, 1e-3);
    m.lastHd = m.hd;
    let y,
      roll = 0,
      pitch = 0,
      yaw = m.hd,
      sy = 1;
    gAmp = 0;
    // reaction hops (greet / bump)
    if (m.jy > 0 || m.jv) {
      m.jv -= 28 * dt;
      m.jy += m.jv * dt;
      if (m.jy <= 0) {
        m.jy = 0;
        m.jv = m.jHops > 0 ? (m.jHops--, 6.5) : 0;
      }
    }
    const legs = rig.mode === 1 || rig.mode === 2,
      L = Math.max(0.15, rig.legTop * m.scale);
    if (m.gait === "hover" || (m.hab === "water" && m.gait !== "swim")) {
      // floats (ghosts, fairies, flying legends): over water too
      const g = Math.max(m.hab === "water" ? WATER_Y : footGround(m, sp), WATER_Y);
      y = g + 0.5 + h * 0.28 + Math.sin(t * 2 + m.ph) * 0.22;
      roll = Math.sin(t * 1.4 + m.ph) * 0.07;
      pitch = -moving * 0.14;
      if (rig.mode === 3) {
        m.gp = (m.gp + dt * (h > 6 ? 3.2 : 6.5)) % TAU;
        gAmp = h > 6 ? 0.32 : 0.45;
        y += Math.sin(m.gp) * h * 0.04; // each flap lifts the body a little
      }
    } else if (m.hab === "water") {
      y = WATER_Y - (SINK[m.id] ?? 0.3) * h + Math.sin(t * 1.6 + m.ph) * 0.06 * Math.sqrt(h);
      m.gp = (m.gp + dt * (1.2 + m.v * 2.2)) % TAU;
      roll = Math.sin(m.gp) * 0.05 + Math.sin(t * 1.3 + m.ph) * 0.03;
      pitch = Math.sin(t * 1.1 + m.ph) * 0.03 - moving * 0.06;
      if (m.gait === "slither") yaw += Math.sin(m.gp * 1.5) * 0.12 * (0.4 + moving);
      if (legs) {
        gAmp = 0.35 * moving; // paddling under the surface
        m.gp = (m.gp + dt * 4 * moving) % TAU;
      }
    } else {
      y = footGround(m, sp);
      if (m.gait === "hop") {
        // one hop covers ~0.55 body heights, so the hop rate follows the speed: no sliding
        m.gp = (m.gp + (dt * Math.PI * m.v) / Math.max(0.3, h * 0.55)) % TAU;
        const s = Math.abs(Math.sin(m.gp));
        y += moving * s * h * (0.2 + run * 0.12);
        sy = 1 + moving * (s < 0.2 ? -0.1 : 0.05 * s);
        pitch = -moving * Math.cos(m.gp) * 0.12;
      } else if (m.gait === "slither") {
        m.gp = (m.gp + (dt * m.v) / Math.max(0.3, h * 0.25)) % TAU;
        yaw += Math.sin(m.gp) * 0.16 * moving;
        sy = 1 + Math.sin(m.gp * 2) * 0.025 * moving;
      } else if (legs) {
        // stride: each leg swings ±amp about the hip; one cycle moves the body 4·L·sin(amp)
        const amp = clamp(0.3 + run * 0.32 + (m.v / L) * 0.02, 0.28, 0.72) * (m.gait === "waddle" ? 0.75 : 1);
        if (m.v > 0.05) m.gp = (m.gp + Math.min(26, (Math.PI * m.v) / (2 * L * Math.sin(amp))) * dt) % TAU;
        else if (turn > 0.4) m.gp = (m.gp + dt * 7) % TAU; // shuffle the feet when turning on the spot
        gAmp = m.v > 0.05 ? amp * moving : turn > 0.4 ? 0.14 : 0;
        const s = Math.sin(m.gp),
          c2 = 1 - Math.abs(s); // highest when the legs pass under the body
        y += (c2 * 0.06 + run * c2 * 0.16) * L * moving;
        if (m.gait === "waddle") roll = s * 0.14 * moving;
        else roll = s * (rig.mode === 1 ? 0.05 : 0.02) * moving;
        pitch = -run * 0.12 - Math.cos(m.gp * 2) * 0.015 * moving;
      } else {
        // no separate legs (Ditto, Diglett, Snover's robe…): a bouncy shuffle instead of sliding
        m.gp = (m.gp + (dt * Math.PI * m.v) / Math.max(0.25, h * 0.3)) % TAU;
        const s = Math.sin(m.gp);
        y += Math.abs(s) * h * 0.05 * moving;
        roll = s * (m.gait === "waddle" ? 0.14 : 0.07) * moving;
        sy = 1 + Math.abs(s) * 0.04 * moving;
      }
      if (m.hab === "shore") y = Math.max(y, WATER_Y - h * 0.18);
    }
    if (m.v < 0.05) sy *= 1 + Math.sin(t * 2.2 + m.ph) * 0.022; // breathing
    if (m.tumble > 0) {
      roll += Math.sin(m.tumble * 18) * 0.35 * Math.min(1, m.tumble);
      pitch -= 0.25 * Math.min(1, m.tumble);
      gAmp = Math.max(gAmp, 0.5);
      m.gp = (m.gp + dt * 14) % TAU; // legs flail
    }
    gPh = m.gp;
    m.y = y + m.jy;
    E.set(pitch, yaw, roll);
    Q.setFromEuler(E);
    const sc = m.scale;
    S.set(sc * (2 - sy) ** 0.5, sc * sy, sc * (2 - sy) ** 0.5);
    M4.compose(P.set(m.x, m.y, m.z), Q, S);
    return M4;
  }

  function separate(list) {
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        const dx = b.x - a.x,
          dz = b.z - a.z,
          rr_ = a.sp.r * a.scale + b.sp.r * b.scale;
        if (Math.abs(dx) > rr_ || Math.abs(dz) > rr_) continue;
        const d = Math.hypot(dx, dz);
        if (d >= rr_ || d < 1e-4) continue;
        const k = ((rr_ - d) / d) * 0.5,
          wa = a.kind === "boss" ? 0 : 1,
          wb = b.kind === "boss" ? 0 : 1;
        const ax = a.x - dx * k * wa,
          az = a.z - dz * k * wa,
          bx = b.x + dx * k * wb,
          bz = b.z + dz * k * wb;
        if (wa && habOK(a, ax, az)) (a.x = ax), (a.z = az);
        if (wb && habOK(b, bx, bz)) (b.x = bx), (b.z = bz);
      }
    }
  }

  /* ---------- reactions ---------- */
  function react(m, speed) {
    if (m.kind === "boss") {
      emote(m, "!", 1.2);
      fx.cry(m.sp.h, true);
      fx.shake(0.25);
      return;
    }
    if (speed > 6) {
      m.tumble = 1.1;
      m.jv = 7;
      m.jy = 0.01;
      emote(m, "!", 1.2);
      fx.burst(tmp.set(m.x, m.y + m.sp.h * 0.6, m.z), "#ffffff", 10);
    } else {
      m.jv = 5;
      m.jy = 0.01;
      emote(m, m.kind === "flock" ? "!" : "?", 1);
    }
    fx.cry(m.sp.h * m.scale, false);
  }

  const near = []; // ground Pokémon close enough to touch, rebuilt every frame

  /* ================= public API ================= */
  let regionTick = 0,
    herdTick = 0,
    seenTick = 0,
    evictTick = 0,
    curRegion = null,
    curLair = null;

  const api = {
    dex,
    seen,
    greeted,
    bossesMet,
    get count() {
      return mons.size;
    },
    /** every active Pokémon (debugging / tests) */
    get mons() {
      return [...mons];
    },
    /** boss lair of any region instance (from regionAt): { status, id, name, region, rid, x, z, met }.
     *  Unknown lairs are queued and found over the next frames (see pumpLairs). */
    bossLair(r) {
      const L = lairFor(r);
      if (L.status === "search") lairQueue.add(L);
      if (L.status === "none") return { status: "none" };
      return { status: L.status, id: L.id, name: dex[L.id].name, types: dex[L.id].types, region: L.region, rid: L.rid, x: L.x, z: L.z, met: bossesMet.has(L.rid) };
    },
    /** spend `budget` candidate checks on queued lair searches; returns how many are still pending */
    pumpLairs(budget = 300) {
      for (const L of lairQueue) {
        if (L.status === "search") searchLair(L, budget);
        if (L.status !== "search") lairQueue.delete(L);
        break; // one at a time keeps every frame cheap
      }
      return lairQueue.size;
    },
    /** current boss lair for the region you're in: { id, region, x, z, met } or null */
    get boss() {
      return curLair && curLair.status === "ready"
        ? { id: curLair.id, name: dex[curLair.id].name, region: curLair.region, x: curLair.x, z: curLair.z, met: bossesMet.has(curLair.rid) }
        : null;
    },

    update(dt, t) {
      now = t;
      // player speed (drive, walk and flight)
      const px = glider.on ? glider.pos.x : car.x,
        pz = glider.on ? glider.pos.z : car.z;
      playerSpeed = Math.hypot(px - lastPX, pz - lastPZ) / Math.max(dt, 1e-3);
      lastPX = px;
      lastPZ = pz;
      if (!wanderers.length) for (let i = 0; i < N_WANDER; i++) wanderers.push({ m: null, wait: i * 0.04, near: true });

      // region → preload its roster, find its boss lair
      if ((regionTick -= dt) <= 0) {
        regionTick = 0.5;
        const r = regionAt(car.x, car.z);
        if (!curRegion || r.id !== curRegion.id) {
          curRegion = r;
          const R = REGIONS[r.name];
          if (R) for (const id of regionSpecies(R)) want(id);
          curLair = R ? lairFor(r) : null;
        }
      }
      if (curLair && curLair.status === "search") searchLair(curLair, 260);
      for (const L of lairs.values()) {
        if (L.status !== "ready") continue;
        const d = Math.hypot(L.x - car.x, L.z - car.z);
        if (!L.mon && d < VIEW + 60) spawnBoss(L);
        else if (L.mon && d > VIEW + 160) despawnBoss(L);
      }

      // wanderers: keep the slots filled, recycle the far ones
      for (const s of wanderers) {
        if (s.m && !mons.has(s.m)) s.m = null;
        if (s.m) {
          const d = Math.hypot(s.m.x - car.x, s.m.z - car.z);
          if (d > VIEW + 20) {
            kill(s.m);
            s.m = null;
          } else continue;
        }
        if ((s.wait -= dt) > 0) continue;
        placeWanderer(s, s.near);
        s.near = false;
      }
      if ((herdTick -= dt) <= 0) {
        herdTick = 1;
        scanHerds();
      }
      // flocks
      for (const f of flocks) {
        if (!f.members.length) {
          if ((f.wait -= dt) <= 0) placeFlock(f);
          continue;
        }
        f.x += f.v.x * dt;
        f.z += f.v.z * dt;
        if (Math.hypot(f.x - car.x, f.z - car.z) > VIEW + 120) {
          placeFlock(f);
          continue;
        }
        if ((f.gT = (f.gT || 0) - dt) <= 0) {
          f.gT = 0.5;
          const ahead = Math.max(heightAt(f.x + f.v.x * 3, f.z + f.v.z * 3), heightAt(f.x, f.z), WATER_Y);
          f.minAlt = ahead + 12;
        }
        if (f.alt < f.minAlt) f.alt += Math.min(f.minAlt - f.alt, 8 * dt);
        const c = Math.cos(f.hd),
          s = Math.sin(f.hd);
        for (const m of f.members) {
          if (m.tumble > 0) {
            m.x += m.kx * dt;
            m.z += m.kz * dt;
            m.y += m.ky * dt;
            m.ky -= 6 * dt;
            continue;
          }
          m.x = f.x + c * m.ox + s * m.oz;
          m.z = f.z - s * m.ox + c * m.oz;
          m.hd = f.hd;
          m.v = 0;
        }
      }

      // --- move + draw everything ---
      for (const s of species.values()) if (s.batch) s.batch.n = 0;
      near.length = 0;
      for (const m of mons) {
        const s = want(m.id);
        if (!s) continue;
        const sp = (m.sp = s.sp);
        const dx = car.x - m.x,
          dz = car.z - m.z,
          d2 = dx * dx + dz * dz;
        if (m.bumpT > 0) m.bumpT -= dt;
        if (m.greetT > 0) m.greetT -= dt;
        if (m.tumble > 0) m.tumble -= dt;
        let mat;
        if (m.kind === "flock") {
          const h = sp.h;
          if (m.tumble <= 0) m.y = 0;
          const fl = m.flock;
          const baseY = m.tumble > 0 ? m.y : (fl ? fl.alt : m.y) + m.oy + Math.sin(t * 2.4 + m.ph) * 0.45;
          if (m.tumble <= 0) m.y = baseY;
          E.set(0.08, m.hd, Math.sin(t * 0.9 + m.ph) * 0.12 + (m.tumble > 0 ? m.tumble * 4 : 0));
          Q.setFromEuler(E);
          // wings beat, with a glide now and then; the body rises a touch on each down-stroke
          const glide = Math.sin(t * 0.35 + m.ph) > 0.55;
          m.gp = (m.gp + dt * (glide ? 2 : 8.5)) % TAU;
          gPh = m.gp;
          gAmp = sp.rig.mode === 3 ? (glide ? 0.12 : 0.55) : 0;
          if (m.tumble <= 0) m.y += Math.sin(m.gp) * h * 0.05;
          M4.compose(P.set(m.x, m.y, m.z), Q, S.set(1, 1, 1));
          mat = M4;
          m.top = m.y + h;
        } else {
          steer(m, sp, dt, d2, dx, dz);
          moveGround(m, sp, dt);
          mat = pose(m, sp, t, dt);
          m.top = m.y + sp.h * m.scale;
          if (d2 < 60 * 60) near.push(m);
          if (m.ring) {
            const R = sp.r * 2.2 + 1.5;
            m.ring.position.set(m.x, m.hab === "water" ? WATER_Y + 0.08 : footGround(m, sp) + 0.08, m.z);
            m.ring.scale.setScalar(R * (1 + Math.sin(t * 2) * 0.04));
            m.ring.rotation.y = t * 0.3;
            m.star.position.set(m.x, m.top + 1.6 + Math.sin(t * 2.2) * 0.3, m.z);
            const sd = Math.sqrt(d2);
            m.star.scale.setScalar(clamp(sd * 0.035, 1.4, 9));
            m.star.visible = !bossesMet.has(m.lair.rid) || sd > 40;
          }
        }
        // distance cull: small Pokémon far away are a few pixels — keep simulating, skip drawing
        const drawR = m.kind === "boss" || m.kind === "flock" ? 1e9 : 150 + sp.h * m.scale * 45;
        if (d2 < drawR * drawR) s.batch.push(mat, gPh, gAmp);
      }
      separate(near);
      for (const s of species.values()) if (s.batch) s.batch.end();

      // emotes follow their Pokémon
      for (const e of emotes) {
        if (!e.m) continue;
        e.t -= dt;
        if (e.t <= 0 || !mons.has(e.m) || !e.m.sp) {
          e.m = null;
          e.s.visible = false;
          continue;
        }
        const m = e.m,
          hh = m.top ?? m.y + 2;
        e.s.position.set(m.x, hh + 0.6 + Math.min(0.4, (1.4 - e.t) * 1.5), m.z);
        const k = clamp(Math.hypot(camera.position.x - m.x, camera.position.z - m.z) * 0.03, 0.9, 2.5);
        e.s.scale.setScalar(k);
      }

      // Charizard vs flying Pokémon: bump instead of flying through
      if (glider.on) {
        for (const f of flocks)
          for (const m of f.members) {
            if (!m.sp || m.tumble > 0) continue;
            tmp.set(m.x - glider.pos.x, m.y + m.sp.h * 0.5 - glider.pos.y, m.z - glider.pos.z);
            const d = tmp.length(),
              R = m.sp.r + m.sp.h * 0.3 + 2.2;
            if (d < R) {
              tmp.multiplyScalar(1 / Math.max(d, 1e-3));
              glider.pos.addScaledVector(tmp, -(R - d));
              if (glider.speed) glider.speed *= 0.85;
              m.tumble = 2.5;
              m.kx = tmp.x * 14;
              m.kz = tmp.z * 14;
              m.ky = tmp.y * 8 + 3;
              fx.shake(0.3);
              fx.burst(tmp.set(m.x, m.y + m.sp.h * 0.5, m.z), "#fbf8ef", 14);
              fx.cry(m.sp.h, false);
              emote(m, "!", 1);
            }
          }
      }

      // first sightings → Pokédex
      if ((seenTick -= dt) <= 0) {
        seenTick = 0.3;
        if (game.started)
          for (const m of mons) {
            if (!m.sp) continue;
            const d = Math.hypot(m.x - car.x, m.z - car.z);
            if (m.kind === "boss") {
              if (d < 70 && !bossesMet.has(m.lair.rid)) {
                bossesMet.add(m.lair.rid);
                if (!seen.has(m.id)) seen.add(m.id);
                save();
                updDex();
                fx.cry(m.sp.h, true);
                fx.shake(0.35);
                emote(m, "!", 2);
                queueTip(`★ ${m.region} boss`, m.e.name, `${typeLine(m.e)} · the strongest Pokémon here. Battles are coming soon.`, 5200);
              }
            } else if (d < (m.kind === "flock" ? 60 : 28) && !seen.has(m.id)) {
              seen.add(m.id);
              save();
              updDex();
              queueTip("◓ Wild Pokémon", m.e.name, `${typeLine(m.e)} · ${m.region} · ${seen.size} of ${TOTAL} seen`, 3600);
            }
          }
      }
      if ((tipT -= dt) <= 0 && tipQ.length) {
        const [k, h, p, ms] = tipQ.shift();
        fx.tip(k, h, p, ms);
        tipT = Math.min(ms / 1000, 2.8);
      }

      // boss tracker chip
      const B = api.boss,
        el = $w("wBoss");
      if (B && game.started && !bossesMet.has(curLair.rid)) {
        const dx = B.x - car.x,
          dz = B.z - car.z,
          d = Math.hypot(dx, dz);
        camera.getWorldDirection(tmp);
        const rel = Math.atan2(dx, -dz) - Math.atan2(tmp.x, -tmp.z);
        $w("wBossT").textContent = `${B.region} boss: ${B.name} · ${d > 1000 ? (d / 1000).toFixed(1) + " km" : Math.round(d) + " m"}`;
        $w("wArrow").style.transform = `rotate(${rel}rad)`;
        el.classList.add("on");
      } else el.classList.remove("on");

      // unload species nobody has used for a while
      if ((evictTick -= dt) <= 0) {
        evictTick = 5;
        for (const [id, s] of species)
          if (s.state === "ready" && now - s.last > 60 && s.batch.n === 0) {
            s.batch.dispose();
            species.delete(id);
          }
      }
    },

    /** push a body (the car / Greninja) out of every Pokémon it overlaps; returns true on contact */
    collide(body, RAD, mass, speed) {
      let hit = false;
      for (const m of near) {
        if (!m.sp) continue;
        if (body.y > m.top - 0.2) continue; // jumped over it
        const dx = body.x - m.x,
          dz = body.z - m.z,
          R = m.sp.r * m.scale + RAD;
        if (Math.abs(dx) > R || Math.abs(dz) > R) continue;
        const d = Math.hypot(dx, dz);
        if (d >= R) continue;
        const nx = d > 1e-4 ? dx / d : 1,
          nz = d > 1e-4 ? dz / d : 0,
          o = R - d;
        const mm = m.kind === "boss" ? 1e9 : (m.sp.h * m.scale) ** 3 * 0.5,
          share = clamp(mm / (mm + mass), 0.2, 1);
        body.x += nx * o * share;
        body.z += nz * o * share;
        if (share < 1) {
          const mx = m.x - nx * o * (1 - share),
            mz = m.z - nz * o * (1 - share);
          if (habOK(m, mx, mz)) (m.x = mx), (m.z = mz);
          if (speed > 6) {
            m.kx = -nx * Math.min(12, speed * 0.5);
            m.kz = -nz * Math.min(12, speed * 0.5);
          }
        }
        hit = true;
        if (m.bumpT <= 0) {
          m.bumpT = 0.8;
          react(m, speed);
        }
      }
      return hit;
    },

    /** highest Pokémon top under (x, z) – keeps Charizard from flying through them */
    topAt(x, z, pad) {
      let top = -1e9;
      for (const m of near) {
        if (!m.sp) continue;
        const R = m.sp.r * m.scale + pad;
        if (Math.abs(x - m.x) < R && Math.abs(z - m.z) < R && Math.hypot(x - m.x, z - m.z) < R && m.top > top) top = m.top;
      }
      return top;
    },

    /** nearest Pokémon you could greet on foot */
    nearestGreet(x, z) {
      let best = null,
        bd = 1e9;
      for (const m of near) {
        if (!m.sp) continue;
        const d = Math.hypot(m.x - x, m.z - z) - m.sp.r * m.scale;
        if (d < 4.5 && d < bd) (bd = d), (best = m);
      }
      return best;
    },

    greet(m) {
      if (!m || m.greetT > 0) return;
      m.greetT = 1.2;
      m.tgt = Math.atan2(m.x - car.x, m.z - car.z); // turn to face you
      m.look = 1;
      m.tm = 2.5;
      m.v = 0;
      m.fled = false;
      const first = !greeted.has(m.id);
      greeted.add(m.id);
      seen.add(m.id);
      save();
      updDex();
      if (m.kind === "boss") {
        emote(m, "!", 1.6);
        fx.cry(m.sp.h, true);
        fx.shake(0.4);
        fx.tip(`★ ${m.region} boss`, m.e.name, `${typeLine(m.e)} · ${m.e.height} m · It sizes you up… battles are coming soon.`, 4600);
        return;
      }
      m.jv = 6;
      m.jy = 0.01;
      m.jHops = 1;
      emote(m, "love", 1.6);
      fx.cry(m.sp.h * m.scale, false);
      fx.burst(tmp.set(m.x, m.y + m.sp.h * m.scale + 0.3, m.z), "#ff8fbf", 12);
      fx.tip(
        first ? "♥ New friend" : "♥ Hello again",
        m.e.name,
        `${typeLine(m.e)} · ${m.e.height} m · lives in ${m.region} · ${greeted.size} greeted`,
        3600,
      );
    },

    /** minimap: the region boss's lair (clamped to the edge when it's off the map) */
    minimap(g, W, toPx) {
      const B = api.boss;
      if (!B) return;
      let [px, py] = toPx(B.x, B.z);
      const r = W * 0.04,
        cx = W / 2,
        cy = W / 2,
        lim = W / 2 - r - 2,
        ox = px - cx,
        oy = py - cy,
        k = Math.max(Math.abs(ox), Math.abs(oy)) / lim;
      if (k > 1) (px = cx + ox / k), (py = cy + oy / k);
      g.save();
      g.lineWidth = W * 0.007;
      g.strokeStyle = "#1f1d2b";
      g.fillStyle = "#d6452f";
      g.beginPath();
      g.arc(px, py, r, Math.PI, 0);
      g.fill();
      g.fillStyle = "#fbf8ef";
      g.beginPath();
      g.arc(px, py, r, 0, Math.PI);
      g.fill();
      g.beginPath();
      g.arc(px, py, r, 0, 7);
      g.moveTo(px - r, py);
      g.lineTo(px + r, py);
      g.stroke();
      g.fillStyle = "#fbf8ef";
      g.beginPath();
      g.arc(px, py, r * 0.32, 0, 7);
      g.fill();
      g.stroke();
      g.restore();
    },
  };
  return api;
}
