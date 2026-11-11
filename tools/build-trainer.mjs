// Builds models/hero/trainer.glb: the home-screen trainer body.
//
// Source: Quaternius "Universal Base Characters" (Standard, CC0 1.0), https://quaternius.com
// Uses the Superhero male body plus the short "Buzzed" hair and "Beard" meshes. They share
// the same 65-joint humanoid skeleton, so the hair is re-bound to the body's skin. Clothes, cap,
// glasses and the t-shirt print are added at runtime by home/trainer.js.
//
// Run from the repository root, pointing at the unzipped kit (folders body/ and hair/):
//   node tools/build-trainer.mjs /path/to/kit
// Requires the optional build dependencies in tools/package.json (npm install --prefix tools).
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(new URL("./package.json", import.meta.url));
const { NodeIO } = require("@gltf-transform/core");
const { ALL_EXTENSIONS } = require("@gltf-transform/extensions");
const { mergeDocuments, prune, dedup, textureCompress, draco, unpartition } = require("@gltf-transform/functions");
const sharp = require("sharp");
const draco3d = require("draco3dgltf");

const SRC = process.argv[2];
if (!SRC) throw new Error("usage: node tools/build-trainer.mjs <kit folder with body/ and hair/>");
const OUT = new URL("../models/hero/trainer.glb", import.meta.url);

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  "draco3d.encoder": await draco3d.createEncoderModule(),
  "draco3d.decoder": await draco3d.createDecoderModule(),
});

// The kit's glTFs reference a couple of "*_png.png" images that ship as "*.png"; repoint them.
async function readFixed(file) {
  const dir = path.dirname(file);
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  const at = (u) => path.join(dir, decodeURIComponent(u));
  for (const im of json.images || []) {
    if (fs.existsSync(at(im.uri))) continue;
    const alt = im.uri.replace(/_png\.png$/, ".png");
    if (!fs.existsSync(at(alt))) throw new Error("missing image " + im.uri);
    im.uri = alt;
  }
  const resources = {};
  for (const b of json.buffers || []) resources[b.uri] = new Uint8Array(fs.readFileSync(at(b.uri)));
  for (const im of json.images || []) resources[im.uri] = new Uint8Array(fs.readFileSync(at(im.uri)));
  return io.readJSON({ json, resources });
}

const doc = await readFixed(path.join(SRC, "body/Superhero_Male_FullBody.gltf"));
const root = doc.getRoot();
const skin = root.listSkins()[0];
const joints = skin.listJoints().map((j) => j.getName()).join();
const armature = root.listNodes().find((n) => n.getName() === "Armature");

for (const [file, name] of [
  ["hair/Hair_Buzzed.gltf", "Hair"],
  ["hair/Hair_Beard.gltf", "Beard"],
]) {
  const src = await readFixed(path.join(SRC, file));
  const sSkin = src.getRoot().listSkins()[0];
  if (sSkin.listJoints().map((j) => j.getName()).join() !== joints) throw new Error("skeleton differs: " + file);
  const meshNode = src.getRoot().listNodes().find((n) => n.getMesh());
  const map = mergeDocuments(doc, src);
  const node = map.get(meshNode);
  node.setName(name).setSkin(skin);
  const parent = node.getParentNode();
  if (parent) parent.removeChild(node);
  armature.addChild(node);
}
// drop the merged-in scenes (their duplicate armatures go with them in prune)
for (const s of root.listScenes().slice(1)) s.dispose();
root.setDefaultScene(root.listScenes()[0]);

// trim attributes three.js doesn't need here (extra UV sets and paint masks)
for (const mesh of root.listMeshes())
  for (const prim of mesh.listPrimitives())
    for (const sem of ["TEXCOORD_1", "TEXCOORD_2", "TEXCOORD_3", "COLOR_0", "COLOR_1"]) {
      const a = prim.getAttribute(sem);
      if (a) prim.setAttribute(sem, null);
    }

await doc.transform(
  dedup(),
  unpartition(),
  prune(),
  textureCompress({ encoder: sharp, targetFormat: "webp", resize: [1024, 1024], quality: 88 }),
  draco({ method: "edgebreaker" }),
);

fs.mkdirSync(path.dirname(OUT.pathname), { recursive: true });
await io.write(OUT.pathname, doc);
const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
console.log(`wrote ${path.relative(process.cwd(), OUT.pathname)} (${kb} KB)`);
console.log("meshes:", root.listMeshes().map((m) => m.getName()).join(", "));
console.log("nodes with mesh:", root.listNodes().filter((n) => n.getMesh()).map((n) => n.getName()).join(", "));
