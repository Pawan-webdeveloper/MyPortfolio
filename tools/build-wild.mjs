// Builds the wild Pokémon used across Pawan World's regions.
//
//   node tools/build-wild.mjs            build everything that is missing
//   node tools/build-wild.mjs --force    rebuild every model
//   node tools/build-wild.mjs 54 130     (re)build just these species
//
// Source models: github.com/Pokemon-3D-api/assets  (models/opt/regular/<dex>.glb)
// Species data:  pokeapi.co  (name, types, real height) → wild/dex.json
//
// Every model is made game-ready here so the browser does almost no work:
//   1. the rig's rest pose is baked into plain static meshes (no skinning at runtime → can be
//      GPU-instanced, and the model's lowest point is exact, so nothing sinks into the ground)
//   2. hidden LOD meshes, animations, skins and morph targets are dropped
//   3. primitives are merged per material, welded and simplified (meshoptimizer)
//   4. textures are resized (256 px wild, 512 px bosses) and stored as WebP
//   5. geometry is Draco-compressed
// The roster is checked against PokéAPI types first, so a misplaced species fails the build.
//
// Requires the optional build dependencies in tools/package.json (npm install --prefix tools).
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { REGIONS, BIOME_TYPES, allSpecies } from "../wild/roster.js";

const require = createRequire(new URL("./package.json", import.meta.url));
const { NodeIO, getBounds } = require("@gltf-transform/core");
const { ALL_EXTENSIONS } = require("@gltf-transform/extensions");
const { prune, dedup, weld, join, simplify, textureCompress, draco, flatten } = require("@gltf-transform/functions");
const { MeshoptSimplifier } = require("meshoptimizer");
const sharp = require("sharp");
const draco3d = require("draco3dgltf");

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT_DIR = path.join(ROOT, "models/pokemon/wild");
const DEX = path.join(ROOT, "wild/dex.json");
const CACHE = path.join(ROOT, "tools/.cache/wild");
const SRC = "https://raw.githubusercontent.com/Pokemon-3D-api/assets/main/models/opt/regular/";
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(CACHE, { recursive: true });

const args = process.argv.slice(2);
const force = args.includes("--force");
const only = args.filter((a) => /^\d+$/.test(a)).map(Number);

await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  "draco3d.encoder": await draco3d.createEncoderModule(),
  "draco3d.decoder": await draco3d.createDecoderModule(),
});

/* ---------- species data (PokéAPI) + roster validation ---------- */
async function cached(file, fetcher) {
  if (fs.existsSync(file)) return fs.readFileSync(file);
  const buf = await fetcher();
  fs.writeFileSync(file, buf);
  return buf;
}
async function get(url) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url);
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    if (r.status === 404) throw new Error(`404 ${url}`);
    await new Promise((res) => setTimeout(res, 800 * (i + 1)));
  }
  throw new Error(`failed ${url}`);
}
async function species(id) {
  const j = JSON.parse(await cached(path.join(CACHE, `${id}.json`), () => get(`https://pokeapi.co/api/v2/pokemon/${id}`)));
  const name = j.species?.name || j.name;
  const FIX = { "ho-oh": "Ho-Oh", flabebe: "Flabébé", "mr-mime": "Mr. Mime", "mime-jr": "Mime Jr." };
  return {
    name: FIX[name] || name.charAt(0).toUpperCase() + name.slice(1).replace(/-./g, (m) => " " + m[1].toUpperCase()),
    types: j.types.map((t) => t.type.name),
    height: j.height / 10,
    weight: j.weight / 10,
  };
}

const role = new Map(); // id → { region, role }
for (const [region, r] of Object.entries(REGIONS)) {
  const add = (id, rl) => {
    if (role.has(id)) throw new Error(`#${id} used twice (${role.get(id).region} and ${region})`);
    role.set(id, { region, role: rl, biome: r.biome });
  };
  add(r.boss, "boss");
  for (const k of ["land", "water", "shore"]) for (const id of r[k] || []) add(id, k);
  add(r.air, "air");
}
const data = {};
for (const id of allSpecies()) data[id] = await species(id);
const problems = [];
for (const [id, { region, role: rl, biome }] of role) {
  const t = data[id].types,
    ok = BIOME_TYPES[biome];
  if (!t.some((x) => ok.includes(x))) problems.push(`${data[id].name} (${t}) does not fit ${biome} (${region})`);
  if ((rl === "water" || rl === "shore") && !t.some((x) => x === "water" || x === "ice"))
    problems.push(`${data[id].name} is a ${rl} species but not a Water type (${region})`);
  if (biome === "lake" && t.includes("fire")) problems.push(`${data[id].name} is a Fire type in a lake (${region})`);
  if (biome !== "lake" && t.includes("water")) problems.push(`${data[id].name} is a Water type on land (${region})`);
}
if (problems.length) {
  console.error("Roster problems:\n  " + problems.join("\n  "));
  process.exit(1);
}
console.log(`[wild] roster OK: ${role.size} species across ${Object.keys(REGIONS).length} regions`);

/* ---------- small mat4 helpers (column-major, like glTF) ---------- */
const mul = (a, b) => {
  const o = new Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return o;
};
const isIdentity = (m) => m.every((v, i) => Math.abs(v - (i % 5 === 0 ? 1 : 0)) < 1e-5);

/* Bake the rest pose: skinned vertices → Σ w·(jointWorld·inverseBind)·v, others → nodeWorld·v */
function bakeStatic(doc) {
  const root = doc.getRoot(),
    scene = root.getDefaultScene() || root.listScenes()[0];
  const meshNodes = [];
  scene.traverse((n) => {
    if (n.getMesh()) meshNodes.push(n);
  });
  const done = new Set();
  const isLod = (n) => /lod[12]/i.test(n.getName()) || /lod[12]/i.test(n.getMesh().getName());
  const hasMain = meshNodes.some((n) => !isLod(n)); // some models only ship an "lod2" mesh
  for (const node of meshNodes) {
    // LOD copies that the original exporter hid
    if (hasMain && isLod(node)) {
      node.dispose();
      continue;
    }
    const skin = node.getSkin(),
      world = node.getWorldMatrix();
    let jm = null;
    if (skin) {
      const joints = skin.listJoints(),
        ibm = skin.getInverseBindMatrices();
      jm = joints.map((j, i) => mul(j.getWorldMatrix(), ibm ? ibm.getElement(i, []) : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]));
    }
    const mesh = node.getMesh().clone(); // primitives may be shared between nodes
    node.setMesh(mesh);
    for (const prim of mesh.listPrimitives()) {
      for (const t of prim.listTargets()) prim.removeTarget(t);
      const pos = prim.getAttribute("POSITION"),
        nor = prim.getAttribute("NORMAL"),
        J = [prim.getAttribute("JOINTS_0"), prim.getAttribute("JOINTS_1")].filter(Boolean),
        W = [prim.getAttribute("WEIGHTS_0"), prim.getAttribute("WEIGHTS_1")].filter(Boolean);
      const n = pos.getCount(),
        P = new Float32Array(n * 3),
        N = nor ? new Float32Array(n * 3) : null,
        v = [],
        nv = [],
        jv = [],
        wv = [];
      for (let i = 0; i < n; i++) {
        pos.getElement(i, v);
        if (nor) nor.getElement(i, nv);
        let m;
        if (jm && J.length) {
          m = new Array(16).fill(0);
          let sum = 0;
          for (let s = 0; s < J.length; s++) {
            J[s].getElement(i, jv);
            W[s].getElement(i, wv);
            for (let k = 0; k < 4; k++) {
              const w = wv[k];
              if (!w) continue;
              const mj = jm[jv[k]];
              if (!mj) continue;
              sum += w;
              for (let e = 0; e < 16; e++) m[e] += mj[e] * w;
            }
          }
          if (sum > 1e-6) for (let e = 0; e < 16; e++) m[e] /= sum;
          else m = world;
        } else m = world;
        P[i * 3] = m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12];
        P[i * 3 + 1] = m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13];
        P[i * 3 + 2] = m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14];
        if (N) {
          // rest-pose bones are rigid (+ uniform scale), so the linear part is fine for normals
          const x = m[0] * nv[0] + m[4] * nv[1] + m[8] * nv[2],
            y = m[1] * nv[0] + m[5] * nv[1] + m[9] * nv[2],
            z = m[2] * nv[0] + m[6] * nv[1] + m[10] * nv[2],
            l = Math.hypot(x, y, z) || 1;
          N[i * 3] = x / l;
          N[i * 3 + 1] = y / l;
          N[i * 3 + 2] = z / l;
        }
      }
      prim.setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(P).setBuffer(pos.getBuffer()));
      if (N) prim.setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(N).setBuffer(pos.getBuffer()));
      for (const a of ["JOINTS_0", "JOINTS_1", "WEIGHTS_0", "WEIGHTS_1"]) prim.setAttribute(a, null);
      // vertex colours and extra UV sets aren't used by the toon materials
      for (const a of ["COLOR_0", "TEXCOORD_1", "TANGENT"]) prim.setAttribute(a, null);
    }
    done.add(node);
  }
  // put every baked mesh directly under the scene with an identity transform
  for (const node of done) {
    if (node.isDisposed()) continue;
    node.setSkin(null).setMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    for (const p of node.listParents()) if (p.propertyType === "Node") p.removeChild(node);
    scene.addChild(node);
  }
  for (const child of scene.listChildren()) if (!done.has(child)) child.dispose();
  for (const s of root.listSkins()) s.dispose();
  for (const a of root.listAnimations()) {
    for (const c of a.listChannels()) c.dispose();
    for (const s of a.listSamplers()) s.dispose();
    a.dispose();
  }
  for (const n of root.listNodes()) if (!done.has(n)) n.dispose();
}

function triCount(doc) {
  let t = 0;
  for (const m of doc.getRoot().listMeshes())
    for (const p of m.listPrimitives()) t += (p.getIndices()?.getCount() ?? p.getAttribute("POSITION").getCount()) / 3;
  return Math.round(t);
}

async function build(id) {
  const out = path.join(OUT_DIR, `${id}.glb`),
    infoFile = path.join(CACHE, `${id}.info.json`);
  const boss = role.get(id).role === "boss";
  const raw = await cached(path.join(CACHE, `${id}.glb`), () => get(`${SRC}${id}.glb`));
  if (!force && fs.existsSync(out) && fs.existsSync(infoFile) && !only.includes(id)) return JSON.parse(fs.readFileSync(infoFile));
  const doc = await io.readBinary(new Uint8Array(raw));
  const before = triCount(doc);
  bakeStatic(doc);
  // the game draws these with toon materials: no PBR metal, and no alpha *blending* on solid bodies
  for (const m of doc.getRoot().listMaterials()) {
    m.setMetallicFactor(0);
    if (m.getAlphaMode() === "BLEND") m.setAlphaMode("MASK").setAlphaCutoff(0.4);
  }
  await doc.transform(flatten(), join({ keepNamed: false }), weld(), dedup());
  const target = boss ? 6000 : 2600;
  const t0 = triCount(doc);
  if (t0 > target)
    await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: target / t0, error: boss ? 0.002 : 0.004, lockBorder: false }));
  const px = boss ? 512 : 256;
  await doc.transform(
    textureCompress({ encoder: sharp, targetFormat: "webp", resize: [px, px], quality: 82 }),
    prune(),
    dedup(),
    draco({ quantizePosition: 14, quantizeNormal: 8, quantizeTexcoord: 12 }),
  );
  // keyframe data whose animation is gone (only the Root still lists it)
  for (const a of doc.getRoot().listAccessors()) if (a.listParents().every((p) => p.propertyType === "Root")) a.dispose();
  const scene = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];
  const b = getBounds(scene);
  await io.write(out, doc);
  const info = {
    tris: triCount(doc),
    srcTris: before,
    bytes: fs.statSync(out).size,
    min: b.min.map((v) => +v.toFixed(5)),
    max: b.max.map((v) => +v.toFixed(5)),
  };
  fs.writeFileSync(infoFile, JSON.stringify(info));
  return info;
}

const ids = only.length ? only : [...role.keys()];
const dex = fs.existsSync(DEX) ? JSON.parse(fs.readFileSync(DEX, "utf8")) : {};
let total = 0;
for (const id of ids) {
  try {
    const info = await build(id);
    const r = role.get(id);
    dex[id] = { ...data[id], region: r.region, role: r.role, biome: r.biome, tris: info.tris, bytes: info.bytes, min: info.min, max: info.max };
    total += info.bytes;
    console.log(`[wild] #${id} ${data[id].name.padEnd(12)} ${r.role.padEnd(5)} ${info.srcTris}→${info.tris} tris  ${(info.bytes / 1024).toFixed(0)} KB`);
  } catch (e) {
    console.error(`[wild] #${id} FAILED: ${e.message}`);
    process.exitCode = 1;
  }
}
// keep the manifest stable (sorted by dex number) and drop stale entries
const sorted = {};
for (const id of [...role.keys()].sort((a, b) => a - b)) if (dex[id]) sorted[id] = dex[id];
fs.writeFileSync(DEX, JSON.stringify(sorted, null, 0).replace(/\},"/g, '},\n"'));
console.log(`[wild] ${ids.length} models, ${(total / 1024 / 1024).toFixed(2)} MB → ${path.relative(ROOT, OUT_DIR)}`);
