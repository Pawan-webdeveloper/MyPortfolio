// Pawan as a Pokémon trainer for the home screen.
//
// Body and short hair: Quaternius "Universal Base Characters" (CC0), packed into
// models/hero/trainer.glb by tools/build-trainer.mjs (the kit's beard is in the file but dropped
// here). Everything that makes him Pawan is added here: skin tone, his printed t-shirt
// (drawShirtPrint from hero.js), trousers and black shoes built as cloth shells that follow the
// skeleton (with the skin they cover removed, so nothing clips through), gold round glasses and
// his bead bracelet. Poses use two-bone IK so arms bend at the elbow.
//
// API matches buildHero(): { rig, bones, update(dt, t, look, pose) }.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { drawShirtPrint } from "../hero.js";

const ROOT = new URL("../", import.meta.url).href;
export const TRAINER_URL = ROOT + "models/hero/trainer.glb";
const HEIGHT = 1.8;

const V = () => new THREE.Vector3();
const _a = V(), _b = V(), _c = V(), _d = V();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();

/* ------------------------------------------------------------ cloth shells */
// Copies the triangles of `src` (a SkinnedMesh) whose vertices pass `keep`, welds them,
// smooths away muscle detail (fabric doesn't follow abs), pushes the surface out by `offset`
// and returns a SkinnedMesh bound to the same skeleton.
function clothShell(src, keep, { offset, smooth = 8, minOffset = offset * 0.6, uv = null, colorAt = null, radial = null, floorY = null, material }) {
  const g = src.geometry;
  const pos = g.getAttribute("position"), nrm = g.getAttribute("normal");
  const si = g.getAttribute("skinIndex"), sw = g.getAttribute("skinWeight");
  const idx = g.index ? g.index.array : Array.from({ length: pos.count }, (_, i) => i);
  const n = pos.count;
  const ok = new Uint8Array(n);
  for (let i = 0; i < n; i++) ok[i] = keep(i) ? 1 : 0;
  // weld by position so UV seams don't split the cloth
  const key = new Map(), group = new Int32Array(n);
  const gp = [], gn = [], gsrc = [];
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(pos.getX(i) * 2e4)},${Math.round(pos.getY(i) * 2e4)},${Math.round(pos.getZ(i) * 2e4)}`;
    let id = key.get(k);
    if (id === undefined) {
      id = gp.length / 3;
      key.set(k, id);
      gp.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      gn.push(0, 0, 0);
      gsrc.push(i);
    }
    group[i] = id;
    gn[id * 3] += nrm.getX(i);
    gn[id * 3 + 1] += nrm.getY(i);
    gn[id * 3 + 2] += nrm.getZ(i);
  }
  const G = gp.length / 3;
  const tris = [], full = [];
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    if (ok[a] + ok[b] + ok[c] >= 2) tris.push(group[a], group[b], group[c]);
    if (ok[a] + ok[b] + ok[c] === 3) full.push(t);
  }
  // neighbours + boundary detection on the kept patch
  const nb = Array.from({ length: G }, () => new Set());
  const edgeCount = new Map();
  for (let t = 0; t < tris.length; t += 3)
    for (let e = 0; e < 3; e++) {
      const a = tris[t + e], b = tris[t + ((e + 1) % 3)];
      nb[a].add(b);
      nb[b].add(a);
      const k = a < b ? a * G + b : b * G + a;
      edgeCount.set(k, (edgeCount.get(k) || 0) + 1);
    }
  const border = new Uint8Array(G);
  for (const [k, c] of edgeCount)
    if (c === 1) {
      border[Math.floor(k / G)] = 1;
      border[k % G] = 1;
    }
  // body triangles this cloth fully hides (so skin can never poke through). Two rings next to
  // the cloth's open edges are kept, so sleeve and hem openings still show skin just inside.
  const near = border.slice();
  for (let ring = 0; ring < 1; ring++) {
    const prev = near.slice();
    for (let i = 0; i < G; i++) if (prev[i]) for (const j of nb[i]) near[j] = 1;
  }
  const covers = full.filter((t) => !near[group[idx[t]]] && !near[group[idx[t + 1]]] && !near[group[idx[t + 2]]]);
  // base normals (unit), inflate, smooth, keep a minimum clearance from the body
  const base = new Float32Array(gp), N = new Float32Array(G * 3);
  for (let i = 0; i < G; i++) {
    _a.set(gn[i * 3], gn[i * 3 + 1], gn[i * 3 + 2]).normalize();
    N[i * 3] = _a.x;
    N[i * 3 + 1] = _a.y;
    N[i * 3 + 2] = _a.z;
  }
  const P = new Float32Array(G * 3);
  for (let i = 0; i < G; i++) {
    const o = typeof offset === "function" ? offset(gsrc[i], base[i * 3 + 1]) : offset;
    for (let k = 0; k < 3; k++) P[i * 3 + k] = base[i * 3 + k] + N[i * 3 + k] * o;
  }
  // loose fit: push the cloth out to a minimum radius around a bone axis (straight-leg pants)
  const fitRadial = () => {
    if (!radial) return;
    for (let i = 0; i < G; i++) {
      const f = radial(gsrc[i], base[i * 3], base[i * 3 + 1], base[i * 3 + 2]);
      if (!f) continue;
      const { a, b, r } = f;
      _b.subVectors(b, a);
      _a.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
      const t = Math.min(1, Math.max(0, _c.subVectors(_a, a).dot(_b) / _b.lengthSq()));
      const C = _d.copy(a).addScaledVector(_b, t);
      const dir = _c.subVectors(_a, C);
      const len = dir.length();
      if (len > 1e-6 && len < r) {
        dir.multiplyScalar(r / len);
        P[i * 3] = C.x + dir.x;
        P[i * 3 + 1] = C.y + dir.y;
        P[i * 3 + 2] = C.z + dir.z;
      }
    }
  };
  fitRadial();
  // never sink into the body: keep at least minOffset of clearance along the skin normal
  const clearance = () => {
    for (let i = 0; i < G; i++) {
      const dx = P[i * 3] - base[i * 3], dy = P[i * 3 + 1] - base[i * 3 + 1], dz = P[i * 3 + 2] - base[i * 3 + 2];
      const along = dx * N[i * 3] + dy * N[i * 3 + 1] + dz * N[i * 3 + 2];
      const mo = typeof minOffset === "function" ? minOffset(gsrc[i], base[i * 3 + 1]) : minOffset;
      if (along < mo) for (let k = 0; k < 3; k++) P[i * 3 + k] += N[i * 3 + k] * (mo - along);
    }
  };
  const tmp = new Float32Array(G * 3);
  for (let it = 0; it < smooth; it++) {
    tmp.set(P);
    for (let i = 0; i < G; i++) {
      if (!nb[i].size || border[i]) continue;
      let x = 0, y = 0, z = 0;
      for (const j of nb[i]) {
        x += tmp[j * 3];
        y += tmp[j * 3 + 1];
        z += tmp[j * 3 + 2];
      }
      const m = nb[i].size;
      P[i * 3] = tmp[i * 3] * 0.4 + (x / m) * 0.6;
      P[i * 3 + 1] = tmp[i * 3 + 1] * 0.4 + (y / m) * 0.6;
      P[i * 3 + 2] = tmp[i * 3 + 2] * 0.4 + (z / m) * 0.6;
    }
    clearance();
  }
  // tidy the cut edges: average each border vertex with its border neighbours so hems,
  // cuffs and the collar read as clean lines instead of zig-zags
  {
    const bn = Array.from({ length: G }, () => []);
    for (const [k, c] of edgeCount) {
      if (c !== 1) continue;
      const a = Math.floor(k / G), b = k % G;
      bn[a].push(b);
      bn[b].push(a);
    }
    for (let it = 0; it < 8; it++) {
      tmp.set(P);
      for (let i = 0; i < G; i++) {
        if (!border[i] || bn[i].length < 2) continue;
        for (let k = 0; k < 3; k++) {
          let m = 0;
          for (const j of bn[i]) m += tmp[j * 3 + k];
          P[i * 3 + k] = tmp[i * 3 + k] * 0.5 + (m / bn[i].length) * 0.5;
        }
      }
      // averaging a loop (a sleeve opening) shrinks it into the arm: push it back out each pass
      fitRadial();
      clearance();
    }
  }
  // flat sole: nothing below the floor line
  if (floorY !== null) for (let i = 0; i < G; i++) P[i * 3 + 1] = Math.max(P[i * 3 + 1], floorY);
  // smooth normals of the cloth itself
  const CN = new Float32Array(G * 3);
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t], b = tris[t + 1], c = tris[t + 2];
    _a.fromArray(P, a * 3);
    _b.fromArray(P, b * 3).sub(_a);
    _c.fromArray(P, c * 3).sub(_a);
    _d.crossVectors(_b, _c);
    for (const v of [a, b, c]) {
      CN[v * 3] += _d.x;
      CN[v * 3 + 1] += _d.y;
      CN[v * 3 + 2] += _d.z;
    }
  }
  // un-indexed output so per-triangle UV fixes (cylinder seam) are possible
  const T = tris.length;
  const oP = new Float32Array(T * 3), oN = new Float32Array(T * 3), oI = new Float32Array(T * 4), oW = new Float32Array(T * 4);
  const oU = uv ? new Float32Array(T * 2) : null, oC = colorAt ? new Float32Array(T * 3) : null;
  for (let t = 0; t < T; t++) {
    const gi = tris[t], s = gsrc[gi];
    oP.set(P.subarray(gi * 3, gi * 3 + 3), t * 3);
    _a.fromArray(CN, gi * 3).normalize();
    oN[t * 3] = _a.x;
    oN[t * 3 + 1] = _a.y;
    oN[t * 3 + 2] = _a.z;
    for (let k = 0; k < 4; k++) {
      oI[t * 4 + k] = si.getComponent(s, k);
      oW[t * 4 + k] = sw.getComponent(s, k);
    }
    if (oU) {
      const [u, v] = uv(P[gi * 3], P[gi * 3 + 1], P[gi * 3 + 2]);
      oU[t * 2] = u;
      oU[t * 2 + 1] = v;
    }
    if (oC) oC.set(colorAt(P[gi * 3], P[gi * 3 + 1], P[gi * 3 + 2]), t * 3);
  }
  if (oU)
    for (let t = 0; t < T; t += 3) {
      const u0 = oU[t * 2], u1 = oU[t * 2 + 2], u2 = oU[t * 2 + 4];
      const mx = Math.max(u0, u1, u2);
      if (mx - Math.min(u0, u1, u2) > 0.5) for (let k = 0; k < 3; k++) if (oU[(t + k) * 2] < mx - 0.5) oU[(t + k) * 2] += 1;
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(oP, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(oN, 3));
  geo.setAttribute("skinIndex", new THREE.BufferAttribute(oI, 4));
  geo.setAttribute("skinWeight", new THREE.BufferAttribute(oW, 4));
  if (oU) geo.setAttribute("uv", new THREE.BufferAttribute(oU, 2));
  if (oC) geo.setAttribute("color", new THREE.BufferAttribute(oC, 3));
  const mesh = new THREE.SkinnedMesh(geo, material);
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.bind(src.skeleton, src.bindMatrix);
  mesh.userData.covers = covers;
  src.parent.add(mesh);
  return mesh;
}

// Drop the body triangles that clothing fully covers. Hidden skin can't clip through sleeves,
// hems or trouser legs when the arms bend, and there's less to draw.
function hideCovered(body, shells) {
  const g = body.geometry;
  if (!g.index) return;
  const src = g.index.array;
  const hide = new Uint8Array(src.length / 3);
  for (const m of shells) for (const t of m.userData.covers || []) hide[t / 3] = 1;
  const out = [];
  for (let t = 0; t < src.length; t += 3) if (!hide[t / 3]) out.push(src[t], src[t + 1], src[t + 2]);
  g.setIndex(out);
}

/* ---------------------------------------------------------------- props */
function seeded(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}
const smooth01 = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Dark rectangular acetate frames (like Pawan's), sized from the eye positions.
function glasses(eyeL, eyeR, earZ) {
  const frame = new THREE.MeshPhysicalMaterial({ color: "#1d1613", roughness: 0.28, clearcoat: 0.8, clearcoatRoughness: 0.15 });
  const lensM = new THREE.MeshPhysicalMaterial({ color: "#dfe9ef", roughness: 0.04, transparent: true, opacity: 0.14, envMapIntensity: 2.2, depthWrite: false });
  const g = new THREE.Group();
  g.name = "Glasses";
  const sep = eyeL.distanceTo(eyeR);
  const W = sep * 0.86, H = sep * 0.62, rr = H * 0.32, tube = sep * 0.04;
  const mid = eyeL.clone().add(eyeR).multiplyScalar(0.5);
  const fz = sep * 0.36;
  const rect = (cx, cy, z) => {
    const pts = [];
    const corners = [[W / 2 - rr, H / 2 - rr, 0], [-W / 2 + rr, H / 2 - rr, Math.PI / 2], [-W / 2 + rr, -H / 2 + rr, Math.PI], [W / 2 - rr, -H / 2 + rr, Math.PI * 1.5]];
    for (const [x, y, a0] of corners)
      for (let k = 0; k <= 6; k++) {
        const a = a0 + (k / 6) * (Math.PI / 2);
        pts.push(new THREE.Vector3(cx + x + Math.cos(a) * rr, cy + y + Math.sin(a) * rr, z));
      }
    return pts;
  };
  for (const [eye, s] of [[eyeL, 1], [eyeR, -1]]) {
    const c = eye.clone().sub(mid);
    const cx = c.x + s * sep * 0.02, cy = c.y + H * 0.06;
    const rim = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rect(cx, cy, fz), true), 64, tube, 8, true), frame);
    rim.scale.set(1, 1, 1);
    // thicker browline along the top
    const brow = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(cx - W / 2 + rr * 0.4, cy + H / 2 - tube * 0.2, fz), new THREE.Vector3(cx + W / 2 - rr * 0.4, cy + H / 2 - tube * 0.2, fz)]), 8, tube * 1.45, 8),
      frame,
    );
    const shape = new THREE.Shape(rect(cx, cy, 0).map((p) => new THREE.Vector2(p.x, p.y)));
    const lens = new THREE.Mesh(new THREE.ShapeGeometry(shape, 8), lensM);
    lens.position.z = fz - tube * 0.3;
    const ex = cx + s * (W / 2 + tube * 0.5), ey = cy + H * 0.3;
    const temple = new THREE.CatmullRomCurve3([
      new THREE.Vector3(ex, ey, fz - tube),
      new THREE.Vector3(ex + s * sep * 0.12, ey + sep * 0.01, fz - sep * 0.5),
      new THREE.Vector3(ex + s * sep * 0.17, ey, earZ - mid.z + sep * 0.4),
      new THREE.Vector3(ex + s * sep * 0.15, ey - sep * 0.28, earZ - mid.z - sep * 0.15),
    ]);
    g.add(rim, brow, lens, new THREE.Mesh(new THREE.TubeGeometry(temple, 40, tube * 0.75, 6), frame));
  }
  const bridge = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-sep / 2 + W / 2 - sep * 0.02, sep * 0.07, fz),
    new THREE.Vector3(0, sep * 0.12, fz + sep * 0.03),
    new THREE.Vector3(sep / 2 - W / 2 + sep * 0.02, sep * 0.07, fz),
  ]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(bridge, 16, tube * 0.9, 8), frame));
  g.position.copy(mid);
  g.traverse((m) => m.isMesh && m.material === frame && (m.castShadow = true));
  return g;
}

// Thick, wavy hair with volume on top and shorter sides: an inflated layer over the kit's short
// scalp hair for the overall shape, then a few hundred tapered, wavy locks for the texture.
function wavyHair(scalp) {
  const rnd = seeded(20251108);
  const sg = scalp.geometry, pos = sg.getAttribute("position"), nrm = sg.getAttribute("normal");
  scalp.updateMatrixWorld(true);
  const M = scalp.matrixWorld, NM = new THREE.Matrix3().getNormalMatrix(M);
  // weld scalp points in world space
  const key = new Map(), groupOf = new Int32Array(pos.count), P = [], N = [];
  for (let i = 0; i < pos.count; i++) {
    const p = V().fromBufferAttribute(pos, i).applyMatrix4(M);
    const n = V().fromBufferAttribute(nrm, i).applyMatrix3(NM);
    const k = `${Math.round(p.x * 4000)},${Math.round(p.y * 4000)},${Math.round(p.z * 4000)}`;
    let id = key.get(k);
    if (id === undefined) {
      id = P.length;
      key.set(k, id);
      P.push(p);
      N.push(V());
    }
    N[id].add(n);
    groupOf[i] = id;
  }
  for (const n of N) n.normalize();
  const box = new THREE.Box3().setFromPoints(P), c = box.getCenter(V()), size = box.getSize(V());
  const topOf = (p) => smooth01(c.y - size.y * 0.1, box.max.y, p.y);
  const frontOf = (p) => (p.z - c.z) / (size.z / 2);
  const volOf = (p) => {
    const t = topOf(p), f = frontOf(p);
    return 0.004 + 0.03 * Math.pow(t, 1.3) + 0.012 * Math.max(0, f) * t;
  };
  const Q = P.map((p, i) => p.clone().addScaledVector(N[i], volOf(p)));
  const mat = new THREE.MeshPhysicalMaterial({
    color: "#2b211c",
    vertexColors: true,
    roughness: 0.5,
    sheen: 0.9,
    sheenRoughness: 0.35,
    sheenColor: new THREE.Color("#7a665a"),
    clearcoat: 0.12,
    clearcoatRoughness: 0.4,
  });
  const g = new THREE.Group();
  g.name = "Hair";
  // volume layer
  {
    const geo = new THREE.BufferGeometry();
    const vp = new Float32Array(pos.count * 3), vn = new Float32Array(pos.count * 3), vc = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const id = groupOf[i];
      Q[id].toArray(vp, i * 3);
      N[id].toArray(vn, i * 3);
      vc.set([0.62, 0.62, 0.62], i * 3);
    }
    geo.setAttribute("position", new THREE.BufferAttribute(vp, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(vn, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(vc, 3));
    geo.setIndex(sg.index);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    g.add(m);
  }
  // locks: they lie on the head (wrapped around an ellipsoid fitted to the volume layer), flow
  // up-and-back from the hairline, lift at the front and wave gently; sides stay short
  const vb = new THREE.Box3().setFromPoints(Q), ec = vb.getCenter(V()), er = vb.getSize(V()).multiplyScalar(0.5);
  const toE = (p) => V().subVectors(p, ec).divide(er), fromE = (e) => e.clone().multiply(er).add(ec);
  const up = V().set(0, 1, 0), back = V().set(0, 0, -1), down = V().set(0, -1, 0);
  const geos = [];
  const S = 12, R = 6;
  let made = 0;
  for (let tries = 0; tries < 9000 && made < 460; tries++) {
    const id = Math.floor(rnd() * P.length);
    const p = Q[id], n = N[id];
    const top = topOf(P[id]), front = frontOf(P[id]), side = Math.abs(n.x);
    if (rnd() > 0.3 + 0.7 * top) continue;
    made++;
    const fr = Math.max(0, front) * top;
    // flow direction in the scalp's tangent plane: up/back on top, down/back on the sides
    const flow = V()
      .addScaledVector(back, 0.75 - 0.5 * fr)
      .addScaledVector(up, 0.25 + 0.9 * fr)
      .addScaledVector(down, 0.9 * side * (1 - top))
      .addScaledVector(V().set(n.x > 0 ? 1 : -1, 0, 0), 0.15 * side);
    flow.addScaledVector(n, -flow.dot(n));
    flow.x += (rnd() - 0.5) * 0.5;
    flow.z += (rnd() - 0.5) * 0.3;
    flow.addScaledVector(n, -flow.dot(n)).normalize();
    const L = 0.022 + 0.07 * top + 0.025 * fr + rnd() * 0.02;
    const w0 = 0.011 + 0.008 * rnd() + 0.004 * top, th0 = w0 * 0.5;
    const phase = rnd() * Math.PI * 2, waves = 1.1 + rnd() * 0.8, amp = (0.004 + 0.006 * rnd()) * (0.5 + top);
    const root = p.clone().addScaledVector(n, -0.006);
    const re = toE(root), rl = re.length();
    const sideA = V().crossVectors(flow, n).normalize();
    const pts = [];
    for (let k = 0; k <= S; k++) {
      const t = k / S, a = phase + t * waves * Math.PI * 2;
      const q = root.clone().addScaledVector(flow, L * t).addScaledVector(sideA, amp * Math.sin(a) * t);
      // wrap onto the head: keep the point at (root height + lift) on the ellipsoid
      const lift = 0.006 * t + (0.004 + 0.02 * fr) * Math.sin(Math.PI * Math.min(1, t * 1.2)) + amp * 0.7 * Math.cos(a) * t;
      const e = toE(q);
      const targetLen = rl + lift / Math.min(er.x, er.y, er.z);
      pts.push(fromE(e.normalize().multiplyScalar(targetLen)));
    }
    const vp = new Float32Array(((S + 1) * R + 1) * 3), vc = new Float32Array(((S + 1) * R + 1) * 3), idx = [];
    const shade = 0.78 + rnd() * 0.34;
    for (let k = 0; k <= S; k++) {
      const t = k / S;
      const T = V().subVectors(pts[Math.min(S, k + 1)], pts[Math.max(0, k - 1)]).normalize();
      const out = toE(pts[k]).normalize().divide(er).normalize();
      const Bv = V().crossVectors(T, out);
      if (Bv.lengthSq() < 1e-6) Bv.copy(sideA);
      Bv.normalize();
      const Nv = V().crossVectors(Bv, T).normalize();
      const w = w0 * Math.pow(1 - t, 0.6) + 0.0006, th = th0 * Math.pow(1 - t, 0.6) + 0.0005;
      const col = (0.55 + 0.45 * t) * shade;
      for (let j = 0; j < R; j++) {
        const ang = (j / R) * Math.PI * 2;
        const v = pts[k].clone().addScaledVector(Bv, Math.cos(ang) * w).addScaledVector(Nv, Math.sin(ang) * th);
        v.toArray(vp, (k * R + j) * 3);
        vc.set([col, col, col], (k * R + j) * 3);
      }
    }
    const tip = (S + 1) * R;
    pts[S].clone().addScaledVector(V().subVectors(pts[S], pts[S - 1]).normalize(), 0.003).toArray(vp, tip * 3);
    vc.set([shade, shade, shade], tip * 3);
    for (let k = 0; k < S; k++)
      for (let j = 0; j < R; j++) {
        const a2 = k * R + j, b2 = k * R + ((j + 1) % R), c2 = (k + 1) * R + j, d = (k + 1) * R + ((j + 1) % R);
        idx.push(a2, c2, b2, b2, c2, d);
      }
    for (let j = 0; j < R; j++) idx.push(S * R + j, tip, S * R + ((j + 1) % R));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(vp, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(vc, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    geos.push(geo);
  }
  const locks = new THREE.Mesh(mergeGeometries(geos), mat);
  locks.castShadow = true;
  g.add(locks);
  return g;
}

// A black sports shoe built around a foot's footprint (world-space bounding box of the foot).
function sneaker(foot) {
  const size = foot.getSize(V()), c = foot.getCenter(V());
  const L = size.z + 0.03, W = size.x + 0.024, heelZ = foot.min.z - 0.016, cx = c.x, floor = foot.min.y;
  const g = new THREE.Group();
  g.name = "Shoe";
  // footprint half-width along the length (u: 0 heel → 1 toe), rounded heel and toe
  const se = (x, e) => Math.pow(Math.max(0, 1 - Math.pow(Math.abs(x), e)), 1 / e);
  const hw = (u) => {
    let w;
    if (u < 0.16) w = 0.76 * se((0.16 - u) / 0.16, 2.2);
    else if (u < 0.42) w = 0.76 + ((u - 0.16) / 0.26) * 0.05;
    else if (u < 0.7) w = 0.81 + ((u - 0.42) / 0.28) * 0.19;
    else w = se((u - 0.7) / 0.3, 2.6);
    return (w * W) / 2;
  };
  const outline = (scale) => {
    const pts = [];
    const n = 48;
    for (let i = 0; i <= n; i++) pts.push(new THREE.Vector2(cx + hw(i / n) * scale, -(heelZ + (i / n) * L)));
    for (let i = n; i >= 0; i--) pts.push(new THREE.Vector2(cx - hw(i / n) * scale, -(heelZ + (i / n) * L)));
    return new THREE.Shape(pts);
  };
  const slab = (scale, y0, depth, color, rough) => {
    const geo = new THREE.ExtrudeGeometry(outline(scale), { depth, bevelEnabled: true, bevelThickness: 0.0025, bevelSize: 0.0025, bevelSegments: 2, curveSegments: 4 });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, y0, 0);
    const m = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color, roughness: rough, clearcoat: 0.1 }));
    m.castShadow = m.receiveShadow = true;
    return m;
  };
  const outsole = 0.011, midsole = 0.016, soleTop = floor + outsole + midsole;
  g.add(slab(1.0, floor + 0.0025, outsole - 0.004, "#0c0c0e", 0.9));
  g.add(slab(0.985, floor + outsole, midsole - 0.004, "#232327", 0.65));
  // thin grey welt line between sole and upper
  g.add(slab(0.995, soleTop - 0.004, 0.0015, "#4a4a52", 0.5));
  // upper: lofted arch over the footprint
  const Hk = [[0, 0.06], [0.12, 0.07], [0.3, 0.082], [0.5, 0.066], [0.7, 0.05], [0.86, 0.04], [1, 0.022]];
  const H = (u) => {
    for (let i = 1; i < Hk.length; i++)
      if (u <= Hk[i][0]) {
        const t = (u - Hk[i - 1][0]) / (Hk[i][0] - Hk[i - 1][0]);
        return Hk[i - 1][1] + (Hk[i][1] - Hk[i - 1][1]) * (0.5 - 0.5 * Math.cos(Math.PI * t));
      }
    return Hk[Hk.length - 1][1];
  };
  const NU = 44, NV = 20;
  const vp = [], vc = [], idx = [];
  const cMain = new THREE.Color("#131316"), cToe = new THREE.Color("#0b0b0d"), cHeel = new THREE.Color("#1b1b1f"), cCollar = new THREE.Color("#2a2a30");
  for (let a = 0; a <= NU; a++) {
    const u = a / NU;
    for (let b = 0; b <= NV; b++) {
      const v = (b / NV) * Math.PI, sv = Math.sin(v);
      const x = cx + hw(u) * 0.97 * Math.cos(v), y = soleTop - 0.004 + H(u) * Math.pow(sv, 0.8), z = heelZ + u * L;
      vp.push(x, y, z);
      const top = Math.pow(sv, 0.8) > 0.9;
      const col = u > 0.84 ? cToe : u < 0.16 && !top ? cHeel : u > 0.06 && u < 0.36 && top ? cCollar : cMain;
      vc.push(col.r, col.g, col.b);
    }
  }
  for (let a = 0; a < NU; a++)
    for (let b = 0; b < NV; b++) {
      const i0 = a * (NV + 1) + b, i1 = i0 + 1, i2 = i0 + NV + 1, i3 = i2 + 1;
      idx.push(i0, i1, i2, i1, i3, i2);
    }
  const ug = new THREE.BufferGeometry();
  ug.setAttribute("position", new THREE.Float32BufferAttribute(vp, 3));
  ug.setAttribute("color", new THREE.Float32BufferAttribute(vc, 3));
  ug.setIndex(idx);
  ug.computeVertexNormals();
  const upper = new THREE.Mesh(ug, new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.38, clearcoat: 0.55, clearcoatRoughness: 0.3, side: THREE.DoubleSide }));
  upper.castShadow = upper.receiveShadow = true;
  g.add(upper);
  // laces across the instep, following the slope of the upper
  const laceM = new THREE.MeshPhysicalMaterial({ color: "#1e1e23", roughness: 0.75 });
  for (let i = 0; i < 5; i++) {
    const u = 0.4 + i * 0.055;
    const z = heelZ + u * L, y = soleTop - 0.004 + H(u);
    const slope = Math.atan2(H(u + 0.01) - H(u - 0.01), 0.02 * L);
    const lace = new THREE.Mesh(new THREE.BoxGeometry(hw(u) * 1.15, 0.0035, 0.006), laceM);
    lace.position.set(cx, y + 0.0025, z);
    lace.rotation.x = -slope;
    lace.rotation.z = (i % 2 ? 1 : -1) * 0.08;
    g.add(lace);
  }
  // heel pull tab
  const tab = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.022, 0.006), new THREE.MeshPhysicalMaterial({ color: "#3a3a42", roughness: 0.6 }));
  tab.position.set(cx, soleTop + H(0) - 0.004, heelZ - 0.001);
  tab.rotation.x = 0.25;
  g.add(tab);
  g.traverse((m) => m.isMesh && (m.castShadow = true));
  return g;
}

function beadBracelet(center, axis, radius) {
  const g = new THREE.Group();
  const b1 = new THREE.Vector3(1, 0, 0).cross(axis).normalize(), b2 = axis.clone().cross(b1).normalize();
  const cols = ["#c0392b", "#f1c40f", "#27ae60", "#111111", "#ecf0f1", "#2980b9", "#e67e22"];
  const geo = new THREE.SphereGeometry(radius * 0.16, 12, 10);
  const n = 16;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const m = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color: cols[i % cols.length], roughness: 0.3, clearcoat: 0.6 }));
    m.position.copy(center).addScaledVector(b1, Math.cos(a) * radius).addScaledVector(b2, Math.sin(a) * radius);
    m.castShadow = true;
    g.add(m);
  }
  return g;
}

/* ------------------------------------------------------------------ build */
export async function buildTrainer(opts = {}) {
  const gltf = await opts.loader.loadAsync(TRAINER_URL, opts.onProgress);
  const model = gltf.scene;
  const rig = new THREE.Group();
  rig.name = "Pawan";
  rig.add(model);
  model.updateMatrixWorld(true);

  const bones = {};
  let body = null, hair = null, beard = null, brows = null, eyes = null;
  model.traverse((o) => {
    if (o.isBone) bones[o.name] = o;
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    o.frustumCulled = false;
    const nm = o.name.toLowerCase();
    if (nm.includes("superhero")) body = o;
    else if (nm.startsWith("hair")) hair = o;
    else if (nm.startsWith("beard")) beard = o;
    else if (nm.startsWith("eyebrow")) brows = o;
    else if (nm.startsWith("eyes")) eyes = o;
  });

  // real-world height, feet on the floor
  const box = new THREE.Box3().setFromObject(body, true);
  const s = HEIGHT / box.getSize(V()).y;
  model.scale.setScalar(s);
  model.position.y = -box.min.y * s;
  rig.updateMatrixWorld(true);

  /* ---- materials: Pawan's skin tone, dark hair; clean-shaven (the kit's beard is dropped) */
  if (beard) beard.removeFromParent();
  const skinM = body.material;
  skinM.color.set("#c8b0a2");
  skinM.roughness = 0.74;
  for (const m of [hair, brows]) {
    if (!m) continue;
    m.material = m.material.clone();
    m.material.color.set(m === hair ? "#2e2622" : "#3a302b");
    m.material.roughness = 0.75;
  }

  // per-vertex helpers in bind pose (model space before scaling = geometry space)
  const g = body.geometry;
  const P = g.getAttribute("position"), SI = g.getAttribute("skinIndex"), SW = g.getAttribute("skinWeight");
  const boneNames = body.skeleton.bones.map((b) => b.name);
  const bindPos = (name) => {
    // joint position in geometry space: inverse of the bone's inverse-bind matrix
    const i = boneNames.indexOf(name);
    return V().setFromMatrixPosition(body.skeleton.boneInverses[i].clone().invert());
  };
  const weightOf = (i, test) => {
    let w = 0;
    for (let k = 0; k < 4; k++) if (test(boneNames[SI.getComponent(i, k)] || "")) w += SW.getComponent(i, k);
    return w;
  };
  const along = (i, from, to) => {
    _a.fromBufferAttribute(P, i).sub(from);
    _b.copy(to).sub(from);
    return _a.dot(_b) / _b.lengthSq();
  };
  const J = {};
  for (const n of ["pelvis", "spine_03", "neck_01", "Head", "upperarm_l", "lowerarm_l", "upperarm_r", "lowerarm_r", "thigh_l", "calf_l", "foot_l", "ball_l", "thigh_r", "calf_r", "foot_r", "ball_r", "hand_l", "hand_r"])
    J[n] = bindPos(n);
  const hemY = J.pelvis.y + (J.spine_03.y - J.pelvis.y) * 0.08;
  // neckline: a scoop around the neck axis, a little deeper at the front
  const neckX = J.neck_01.x, neckZ = J.neck_01.z;
  const collarY = J.neck_01.y - 0.04 / s;
  const inNeckHole = (i) => {
    const x = P.getX(i) - neckX, y = P.getY(i), z = P.getZ(i) - neckZ;
    const r = Math.hypot(x, z);
    if (y > J.neck_01.y + 0.02 / s && r < 0.13 / s) return true;
    const drop = z > 0 ? 0.035 / s : 0.012 / s;
    return r < 0.085 / s && y > collarY - drop;
  };
  const isUpper = (n) => /^(spine|clavicle|pelvis)/.test(n);
  const isArm = (n) => /^upperarm/.test(n);
  const isLow = (n) => /^(lowerarm|hand|thumb|index|middle|ring|pinky)/.test(n);
  const isNeck = (n) => /^(neck|Head)/.test(n);
  const isLeg = (n) => /^(thigh|calf)/.test(n);
  const isFoot = (n) => /^(foot|ball)/.test(n);

  /* ---- t-shirt */
  const shirtKeep = (i) => {
    const y = P.getY(i);
    if (y < hemY) return false;
    if (weightOf(i, isNeck) > 0.5 || weightOf(i, isLow) > 0.2) return false;
    if (inNeckHole(i)) return false;
    const wa = weightOf(i, isArm);
    if (wa > 0.15) {
      const side = P.getX(i) > 0 ? "l" : "r";
      const t = along(i, J["upperarm_" + side], J["lowerarm_" + side]);
      if (t > 0.48) return false;
    }
    return weightOf(i, (n) => isUpper(n) || isArm(n)) > 0.5;
  };
  // measure the chest for the print's proportions
  let cx = 0, cz = 0, cn = 0, rx = 0, rz = 0;
  const chestY = (hemY + collarY) / 2;
  for (let i = 0; i < P.count; i++)
    if (Math.abs(P.getY(i) - chestY) < 0.02 && weightOf(i, isArm) < 0.1) {
      cx += P.getX(i);
      cz += P.getZ(i);
      cn++;
    }
  cx /= cn || 1;
  cz /= cn || 1;
  for (let i = 0; i < P.count; i++)
    if (Math.abs(P.getY(i) - chestY) < 0.02 && weightOf(i, isArm) < 0.1) {
      rx = Math.max(rx, Math.abs(P.getX(i) - cx));
      rz = Math.max(rz, Math.abs(P.getZ(i) - cz));
    }
  const perim = Math.PI * (3 * (rx + rz) - Math.sqrt((3 * rx + rz) * (rx + 3 * rz))) * s * 1.1;
  const print = drawShirtPrint(perim);
  const shirtH = collarY - hemY;
  const shirtM = new THREE.MeshPhysicalMaterial({ map: print, roughness: 0.9, sheen: 1, sheenRoughness: 0.75, sheenColor: new THREE.Color("#4a4a55"), side: THREE.DoubleSide });
  const sh = 1 / s; // geometry units per metre
  // sleeves sit a little loose around the upper arm (2 cm off the skin, measured from the bone)
  const sleeveFit = (i, x, y, z) => {
    if (weightOf(i, isArm) < 0.45) return null;
    const side = x > 0 ? "l" : "r";
    const a = J["upperarm_" + side], b = J["lowerarm_" + side];
    _b.subVectors(b, a);
    _a.set(x, y, z);
    const t = Math.min(1, Math.max(0, _c.subVectors(_a, a).dot(_b) / _b.lengthSq()));
    const d = _a.distanceTo(_d.copy(a).addScaledVector(_b, t));
    return { a, b, r: d + 0.02 / s };
  };
  const shirt = clothShell(body, shirtKeep, {
    offset: (i, y) => (0.012 + Math.max(0, 1 - (y - hemY) / (shirtH * 0.45)) * 0.012) * sh,
    minOffset: (i) => (weightOf(i, isArm) > 0.3 ? 0.012 : 0.007) * sh,
    radial: sleeveFit,
    smooth: 14,
    uv: (x, y, z) => [0.75 + Math.atan2(x - cx, z - cz) / (Math.PI * 2), Math.min(1, Math.max(0, ((y - hemY) / shirtH) * 0.92))],
    material: shirtM,
  });
  shirt.name = "Shirt";

  /* ---- pants */
  const pantsKeep = (i) => {
    const y = P.getY(i);
    if (y > hemY + shirtH * 0.18) return false;
    // trousers run down to the ankle, where the shoe collar takes over
    if (weightOf(i, isFoot) > 0.3 || (y - box.min.y) * s < 0.075) return false;
    return weightOf(i, (n) => isLeg(n) || n === "pelvis" || n === "spine_01") > 0.5;
  };
  const pantsM = new THREE.MeshPhysicalMaterial({ color: "#2a2d35", roughness: 0.88, sheen: 0.8, sheenRoughness: 0.6, sheenColor: new THREE.Color("#5a5e6a"), side: THREE.DoubleSide });
  // straight-leg cut: thigh 10.5 cm radius tapering to 8 cm at the ankle
  const legAxis = (i) => {
    const side = P.getX(i) > 0 ? "l" : "r";
    const wt = weightOf(i, (n) => n === "thigh_" + side), wc = weightOf(i, (n) => n === "calf_" + side || n === "foot_" + side);
    if (wt + wc < 0.4) return null;
    const onCalf = P.getY(i) < J["calf_" + side].y;
    const a = onCalf ? J["calf_" + side] : J["thigh_" + side], b = onCalf ? J["foot_" + side] : J["calf_" + side];
    const t = Math.min(1, Math.max(0, (a.y - P.getY(i)) / (a.y - b.y)));
    const r = onCalf ? 0.088 - t * 0.008 : 0.104 - t * 0.016;
    return { a, b, r: r / s };
  };
  const pants = clothShell(body, pantsKeep, { offset: 0.012 * sh, minOffset: 0.009 * sh, smooth: 18, radial: (i) => legAxis(i), material: pantsM });
  pants.name = "Pants";

  /* ---- shoes: modelled black sports shoes on the foot bones; the bare feet are removed */
  const footBox = { l: new THREE.Box3(), r: new THREE.Box3() };
  for (let i = 0; i < P.count; i++)
    if (weightOf(i, isFoot) > 0.35) footBox[P.getX(i) > 0 ? "l" : "r"].expandByPoint(_a.fromBufferAttribute(P, i).applyMatrix4(body.matrixWorld));
  for (const side of ["l", "r"]) {
    const shoe = sneaker(footBox[side]);
    rig.add(shoe);
    shoe.updateMatrixWorld(true);
    bones["foot_" + side].attach(shoe);
  }
  hideCovered(body, [shirt, pants]);
  {
    // feet and ankles live inside the shoes and trouser legs now
    const ankleTop = box.min.y + 0.11 / s;
    const src = g.index.array, out = [];
    for (let t = 0; t < src.length; t += 3)
      if (!(P.getY(src[t]) < ankleTop && P.getY(src[t + 1]) < ankleTop && P.getY(src[t + 2]) < ankleTop)) out.push(src[t], src[t + 1], src[t + 2]);
    g.setIndex(out);
  }

  // superhero arms → regular arms: slim the arm chain a little (bone Y runs along the arm)
  for (const side of ["l", "r"]) bones["upperarm_" + side].scale.set(0.86, 1, 0.86);

  /* ---- glasses, bracelet (attached to bones in bind pose so they follow) */
  const head = bones.Head;
  const toWorld = (p) => p.clone().applyMatrix4(body.matrixWorld);
  if (eyes) {
    // eye centres from the eye mesh, split into left/right halves
    const ep = eyes.geometry.getAttribute("position");
    const L = V(), R = V();
    let nl = 0, nr = 0;
    for (let i = 0; i < ep.count; i++) {
      _a.fromBufferAttribute(ep, i);
      if (_a.x > 0) (L.add(_a), nl++);
      else (R.add(_a), nr++);
    }
    L.divideScalar(nl || 1);
    R.divideScalar(nr || 1);
    const eL = toWorld(L), eR = toWorld(R);
    const earZ = toWorld(J.Head).z - 0.02;
    const gl = glasses(eL, eR, earZ);
    rig.add(gl);
    gl.updateMatrixWorld(true);
    head.attach(gl);
  }
  if (hair) {
    // Pawan's thick wavy hair, grown from the kit's short scalp hair (kept underneath for the sides)
    const hg = wavyHair(hair);
    rig.add(hg);
    hg.updateMatrixWorld(true);
    head.attach(hg);
  }
  {
    const w = toWorld(J.hand_r), e = toWorld(J.lowerarm_r);
    const axis = w.clone().sub(e).normalize();
    const br = beadBracelet(w.clone().addScaledVector(axis, -0.035), axis, 0.034);
    rig.add(br);
    br.updateMatrixWorld(true);
    bones.lowerarm_r.attach(br);
  }

  /* ------------------------------------------------------------ posing */
  const rest = new Map();
  for (const b of body.skeleton.bones) rest.set(b, b.quaternion.clone());
  const resetPose = () => {
    for (const [b, q] of rest) b.quaternion.copy(q);
  };
  // feet keep their bind orientation relative to the rig, so soles stay flat in a wide stance
  rig.updateMatrixWorld(true);
  const rigInv = rig.getWorldQuaternion(new THREE.Quaternion()).invert();
  const footRest = {};
  for (const side of ["l", "r"]) footRest[side] = rigInv.clone().multiply(bones["foot_" + side].getWorldQuaternion(new THREE.Quaternion()));
  const flatFeet = () => {
    rig.updateMatrixWorld(true);
    const rq = rig.getWorldQuaternion(_q2);
    for (const side of ["l", "r"]) {
      const f = bones["foot_" + side];
      const want = rq.clone().multiply(footRest[side]);
      f.quaternion.copy(f.parent.getWorldQuaternion(_q3).invert().multiply(want));
    }
  };
  const aim = (bone, child, target) => {
    bone.updateWorldMatrix(true, false);
    child.updateWorldMatrix(false, false);
    const bp = bone.getWorldPosition(_a), cp = child.getWorldPosition(_b);
    const cur = cp.sub(bp).normalize(), want = _c.copy(target).sub(bp).normalize();
    const dq = _q1.setFromUnitVectors(cur, want);
    const bw = bone.getWorldQuaternion(_q2), pw = bone.parent.getWorldQuaternion(_q3).invert();
    bone.quaternion.copy(pw.multiply(dq.multiply(bw)));
    bone.updateWorldMatrix(false, true);
  };
  const ik = (side, target, pole) => {
    const up = bones["upperarm_" + side], lo = bones["lowerarm_" + side], ha = bones["hand_" + side];
    rig.updateMatrixWorld(true);
    const S = up.getWorldPosition(V()), E = lo.getWorldPosition(V()), W = ha.getWorldPosition(V());
    const L1 = S.distanceTo(E), L2 = E.distanceTo(W);
    const d = Math.min(S.distanceTo(target), L1 + L2 - 1e-4);
    const u = target.clone().sub(S).normalize();
    const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const pd = pole.clone().sub(S);
    pd.addScaledVector(u, -pd.dot(u)).normalize();
    const elbow = S.clone().addScaledVector(u, a).addScaledVector(pd, h);
    aim(up, lo, elbow);
    aim(lo, ha, S.clone().addScaledVector(u, d));
  };
  // curl fingers: amount 0..1 per finger; axis found once by testing which local axis curls toward the palm
  const fingers = (side, curl) => {
    for (const [f, amt] of Object.entries(curl))
      for (let k = 1; k <= 3; k++) {
        const b = bones[`${f}_0${k}_${side}`];
        if (!b) continue;
        const ang = amt * (f === "thumb" ? 0.45 : k === 1 ? 1.15 : 1.35);
        b.quaternion.multiply(_q1.setFromAxisAngle(_a.set(side === "l" ? -1 : 1, 0, 0), ang));
      }
  };
  const rotLocal = (b, x, y, z) => b && b.quaternion.multiply(_q1.setFromEuler(new THREE.Euler(x, y, z)));

  // targets are in rig space (rig faces +Z, +X is his left)
  const tgt = V(), pole = V();
  const update = (dt, t, look, pose = {}) => {
    resetPose();
    const k = pose.k ?? 1;
    const br = Math.sin(t * 1.55);
    // stance: chest up, slight turn towards his partner, head follows the pointer
    rotLocal(bones.spine_01, 0, 0.06 * k + Math.sin(t * 0.35) * 0.01, 0);
    rotLocal(bones.spine_02, -0.03 * k + br * 0.008, 0.05 * k, 0);
    rotLocal(bones.spine_03, -0.04 * k + br * 0.01, 0.04 * k, 0);
    rotLocal(bones.neck_01, look.y * 0.12, look.x * 0.25 - 0.05 * k, 0);
    rotLocal(bones.Head, look.y * 0.14 + 0.03, look.x * 0.3 - 0.06 * k, -look.x * 0.04);
    rotLocal(bones.thigh_l, 0, 0, -0.06 * k);
    rotLocal(bones.thigh_r, 0, 0, 0.06 * k);
    flatFeet();
    rig.updateMatrixWorld(true);
    // both arms blend from "relaxed at his sides" (k = 0) to the pose (k = 1);
    // pose.relaxed keeps both arms down (used for the trainer-card portrait)
    const kr = pose.relaxed ? 0 : 1;
    const S = rig.worldToLocal(bones.upperarm_l.getWorldPosition(V()));
    const relaxed = (sh, side) => V().set(sh.x + 0.07 * side, sh.y - 0.55, sh.z + 0.05);
    // left arm (toward Greninja): thrust up and ahead, index finger pointing
    const pulse = Math.sin(t * 1.6) * 0.02;
    const wave = pose.wave || 0;
    tgt.set(S.x + 0.34, S.y + 0.36 + pulse + wave * 0.05, S.z + 0.38);
    tgt.lerpVectors(relaxed(S, 1), tgt, k);
    pole.set(S.x + 0.5 - 0.4 * (1 - k), S.y - 0.6 + 0.3 * (1 - k), S.z - 0.2 - 0.4 * (1 - k));
    ik("l", rig.localToWorld(tgt.clone()), rig.localToWorld(pole.clone()));
    rotLocal(bones.hand_l, 0, 0, 0.15 * k);
    fingers("l", { index: 0.05 * k + 0.25 * (1 - k), middle: 0.95 * k + 0.3 * (1 - k), ring: 1 * k + 0.35 * (1 - k), pinky: 1 * k + 0.4 * (1 - k), thumb: 0.6 * k + 0.2 * (1 - k) });
    // right hand on the hip, elbow out
    const Sr = rig.worldToLocal(bones.upperarm_r.getWorldPosition(V()));
    const hip = rig.worldToLocal(bones.thigh_r.getWorldPosition(V()));
    tgt.set(hip.x - 0.07, hip.y + 0.1 + br * 0.003, hip.z + 0.03);
    tgt.lerpVectors(relaxed(Sr, -1), tgt, kr);
    pole.set(Sr.x - 0.6 + 0.5 * (1 - kr), Sr.y - 0.2 - 0.1 * (1 - kr), Sr.z - 0.35 - 0.15 * (1 - kr));
    ik("r", rig.localToWorld(tgt.clone()), rig.localToWorld(pole.clone()));
    rotLocal(bones.hand_r, 0.2 * kr, 0, -0.3 * kr);
    const fr = kr ? 1 : 0.35;
    fingers("r", { index: 0.85 * fr, middle: 0.9 * fr, ring: 0.95 * fr, pinky: 1 * fr, thumb: 0.5 * fr });
  };

  return { rig, hero: model, bones, body, update };
}
