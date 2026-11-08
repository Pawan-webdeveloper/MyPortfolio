// Builds models/hero/pawan.glb — the player character shown on the home screen.
//
// The body is sculpted from signed-distance shapes (ellipsoids, tapered capsules, rounded boxes
// blended with smooth-min), meshed with surface nets, simplified and Draco-compressed. Materials,
// eyes, glasses, the shirt print and the bead bracelet are added at runtime by hero.js.
//
// Run from the PaperWorld folder:  node tools/build-hero.mjs
// Uses the glTF tooling already installed in ../my-game/node_modules.
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";

const require = createRequire(new URL("../../my-game/package.json", import.meta.url));
const { Document, NodeIO } = require("@gltf-transform/core");
const { KHRDracoMeshCompression } = require("@gltf-transform/extensions");
const { draco, simplify, weld } = require("@gltf-transform/functions");
const { MeshoptSimplifier } = require("meshoptimizer");
const draco3d = require("draco3dgltf");

/* ------------------------------------------------------------------ math */
const { abs, min, max, sqrt, sin, cos, atan2, PI, pow } = Math;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const mix = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const len2 = (x, y) => sqrt(x * x + y * y);
const len3 = (x, y, z) => sqrt(x * x + y * y + z * z);
const smin = (a, b, k) => {
  const h = max(k - abs(a - b), 0) / k;
  return min(a, b) - h * h * k * 0.25;
};
const smax = (a, b, k) => -smin(-a, -b, k);
const sphere = (x, y, z, cx, cy, cz, r) => len3(x - cx, y - cy, z - cz) - r;
function ell(x, y, z, cx, cy, cz, rx, ry, rz) {
  const px = (x - cx) / rx, py = (y - cy) / ry, pz = (z - cz) / rz;
  const k0 = len3(px, py, pz), k1 = len3(px / rx, py / ry, pz / rz);
  return k1 < 1e-9 ? -min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
}
// tapered capsule from a (radius r1) to b (radius r2)
function cone(x, y, z, a, b, r1, r2) {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const l2 = bax * bax + bay * bay + baz * baz, rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  const pax = x - a[0], pay = y - a[1], paz = z - a[2];
  const yv = pax * bax + pay * bay + paz * baz, zv = yv - l2;
  const qx = pax * l2 - bax * yv, qy = pay * l2 - bay * yv, qz = paz * l2 - baz * yv;
  const x2 = qx * qx + qy * qy + qz * qz, y2 = yv * yv * l2, z2 = zv * zv * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(zv) * a2 * z2 > k) return sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(yv) * a2 * y2 < k) return sqrt(x2 + y2) * il2 - r1;
  return (sqrt(x2 * a2 * il2) + yv * rr) * il2 - r1;
}
function rbox(px, py, pz, hx, hy, hz, r) {
  const qx = abs(px) - hx + r, qy = abs(py) - hy + r, qz = abs(pz) - hz + r;
  return len3(max(qx, 0), max(qy, 0), max(qz, 0)) + min(max(qx, qy, qz), 0) - r;
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const addv = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => scl(a, 1 / len3(a[0], a[1], a[2]));
const lerpv = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
// piecewise smooth profile through [y, value] keys
function profile(keys, y) {
  if (y <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++)
    if (y <= keys[i][0]) {
      const [y0, v0] = keys[i - 1], [y1, v1] = keys[i];
      return mix(v0, v1, sstep(y0, y1, y));
    }
  return keys[keys.length - 1][1];
}

/* --------------------------------------------------------- the skeleton */
// metres, y up, character faces +z, +x is the character's left
const HIP = [0, 0.92, 0];
const SPINE = [0, 1.02, 0];
const NECK = [0, 1.465, -0.02];
const hipJ = [0.094, 0.875, 0.0];
const knee = [0.106, 0.49, 0.014];
const ankle = [0.116, 0.1, -0.014];
const shoulder = [0.19, 1.418, -0.015];
const elbow = [0.258, 1.138, -0.045];
const wrist = [0.3, 0.887, -0.005];
const EYE = { x: 0.0322, y: 1.6675, z: 0.0712, r: 0.0138 };
export const RIG = { HIP, SPINE, NECK, shoulder, elbow, wrist, EYE };

/* ------------------------------------------------------------------ head */
function eyeOpening(ax, y, z) {
  // almond in the xy plane, tilted so the outer corner sits a little higher
  const tilt = 0.1, W = 0.0142, H = 0.0071;
  const dx = ax - EYE.x, dy = y - EYE.y - 0.0004;
  const qx = dx * cos(tilt) + dy * sin(tilt), qy = -dx * sin(tilt) + dy * cos(tilt) - qx * 0.06;
  const R = (W * W + H * H) / (2 * H), c = R - H;
  const lens = max(len2(qx, qy + c) - R, len2(qx, qy - c) - R);
  return max(lens, EYE.z + 0.0025 - z);
}
const cranium = (x, y, z) => ell(x, y, z, 0, 1.69, -0.016, 0.0765, 0.097, 0.1);
function nose(x, y, z) {
  const ax = abs(x);
  let n = cone(x, y, z, [0, 1.677, 0.081], [0, 1.632, 0.1], 0.0075, 0.0105);
  n = smin(n, sphere(x, y, z, 0, 1.6255, 0.0985, 0.0128), 0.01);
  n = smin(n, sphere(ax, y, z, 0.0132, 1.6215, 0.0875, 0.0102), 0.007);
  return n;
}
function lips(x, y, z) {
  let l = ell(x, y, z, 0, 1.5968, 0.0845, 0.0215, 0.0062, 0.0105);
  l = smin(l, ell(x, y, z, 0, 1.5852, 0.0822, 0.0185, 0.0074, 0.011), 0.004);
  return l;
}
function face(x, y, z) {
  const ax = abs(x);
  let d = cranium(x, y, z);
  d = smin(d, ell(x, y, z, 0, 1.608, 0.014, 0.0625, 0.068, 0.073), 0.035); // jaw mass
  d = smin(d, ell(ax, y, z, 0.049, 1.585, -0.012, 0.021, 0.024, 0.03), 0.03); // mandible angle
  d = smin(d, ell(x, y, z, 0, 1.562, 0.058, 0.027, 0.021, 0.024), 0.02); // chin
  d = smin(d, ell(ax, y, z, 0.046, 1.646, 0.054, 0.025, 0.019, 0.025), 0.022); // cheekbones
  d = smin(d, cone(ax, y, z, [0.0, 1.6915, 0.0775], [0.05, 1.6945, 0.0655], 0.0145, 0.011), 0.02); // brow ridge
  d = smin(d, sphere(ax, y, z, EYE.x, EYE.y, EYE.z, EYE.r + 0.0017), 0.008); // lids
  d = smax(d, -eyeOpening(ax, y, z), 0.0016);
  d = smin(d, nose(x, y, z), 0.008);
  d = smax(d, -ell(ax, y, z, 0.0074, 1.6138, 0.0955, 0.0042, 0.0022, 0.0042), 0.002); // nostrils
  d = smin(d, lips(x, y, z), 0.006);
  d = smax(d, -ell(x, y, z, 0, 1.5912, 0.0935, 0.0208, 0.001, 0.012), 0.0014); // mouth line
  let ear = ell(ax, y, z, 0.0745, 1.659, -0.012, 0.0135, 0.031, 0.02);
  ear = smax(ear, -ell(ax, y, z, 0.0845, 1.661, -0.008, 0.008, 0.021, 0.0125), 0.003);
  d = smin(d, ear, 0.006);
  return d;
}
function neck(x, y, z) {
  let n = cone(x, y, z, [0, 1.425, -0.024], [0, 1.6, -0.022], 0.053, 0.047);
  n = smin(n, ell(x, y, z, 0, 1.522, 0.021, 0.011, 0.016, 0.011), 0.012); // adam's apple
  return n;
}
const headSkin = (x, y, z) => smin(face(x, y, z), neck(x, y, z), 0.022);

function hairline(a) {
  // |angle| around the head (0 = front) -> lowest y of the hair
  const K = [
    [0, 1.744], [0.42, 1.741], [0.78, 1.722], [1.04, 1.7], [1.18, 1.662], [1.32, 1.655],
    [1.46, 1.692], [1.62, 1.7], [1.85, 1.692], [2.2, 1.64], [2.65, 1.6], [PI, 1.594],
  ];
  return profile(K, a);
}
const LOCKS = [];
{
  // front row: up off the forehead and back, like the reference photo
  const fr = [-0.052, -0.027, -0.002, 0.024, 0.048];
  fr.forEach((x, i) => {
    const s = i % 2 ? 1 : -1;
    LOCKS.push([[x * 0.95, 1.735, 0.07], [x * 1.04 + s * 0.004, 1.79, 0.066], [x * 1.12 - s * 0.006, 1.818, 0.012], 0.0165, 0.0145, 0.008]);
  });
  const mr = [-0.045, -0.015, 0.015, 0.044];
  mr.forEach((x, i) => {
    const s = i % 2 ? -1 : 1;
    LOCKS.push([[x, 1.775, 0.035], [x + s * 0.006, 1.815, -0.012], [x * 1.1, 1.806, -0.062], 0.018, 0.016, 0.009]);
  });
  const br = [-0.05, -0.018, 0.016, 0.048];
  br.forEach((x, i) => {
    const s = i % 2 ? 1 : -1;
    LOCKS.push([[x, 1.785, -0.035], [x * 1.08 + s * 0.005, 1.79, -0.088], [x * 1.12, 1.752, -0.118], 0.018, 0.0155, 0.009]);
  });
  for (const s of [1, -1]) {
    LOCKS.push([[0.06 * s, 1.742, 0.045], [0.072 * s, 1.772, -0.008], [0.07 * s, 1.762, -0.07], 0.014, 0.013, 0.008]);
    LOCKS.push([[0.066 * s, 1.765, -0.04], [0.074 * s, 1.75, -0.095], [0.06 * s, 1.715, -0.118], 0.014, 0.012, 0.008]);
  }
}
function hair(x, y, z) {
  const base = cranium(x, y, z);
  const a = abs(atan2(x, z + 0.01));
  const top = sstep(1.695, 1.75, y);
  let d = base - (0.0035 + 0.011 * top);
  d = smax(d, hairline(a) - y, 0.0035);
  let L = 1e9;
  for (const [p0, p1, p2, r0, r1, r2] of LOCKS) {
    const l = smin(cone(x, y, z, p0, p1, r0, r1), cone(x, y, z, p1, p2, r1, r2), 0.006);
    L = smin(L, l, 0.0055);
  }
  d = smin(d, L, 0.012);
  // soft wave across the volume
  d += 0.0012 * sin(x * 160 + z * 60) * sin(y * 120 + x * 40) * top;
  return d;
}
function beard(x, y, z) {
  const ax = abs(x);
  const f = face(x, y, z);
  let yl = 1.6125 - sstep(0.019, 0.034, ax) * 0.0175 + max(0, ax - 0.034) * 0.95 + max(0, ax - 0.06) * 1.7;
  let m = y - yl;
  m = max(m, mix(0.012, -0.04, sstep(1.645, 1.575, y)) - z);
  m = max(m, -(lips(x, y, z) - 0.0016));
  m = max(m, -(nose(x, y, z) - 0.0012));
  m = max(m, -(sphere(ax, y, z, 0.026, 1.592, 0.08, 0.006) - 0.0)); // clean mouth corners
  return max(f - 0.0034, m);
}
function brows(x, y, z) {
  const ax = abs(x);
  const t = clamp((ax - 0.0105) / 0.047, 0, 1);
  const yc = 1.6878 + 0.0082 * sin(t * PI * 0.9) - 0.002 * t;
  const th = mix(0.0045, 0.0021, t);
  let m = abs(y - yc) - th;
  m = max(m, max(0.0105 - ax, ax - 0.058));
  m = max(m, 0.045 - z);
  return max(face(x, y, z) - 0.0026, m);
}

/* ----------------------------------------------------------------- shirt */
const SH_A = [[0.845, 0.214], [0.95, 0.209], [1.07, 0.204], [1.2, 0.207], [1.3, 0.207], [1.38, 0.2], [1.47, 0.172]];
const SH_B = [[0.845, 0.128], [1.0, 0.121], [1.15, 0.124], [1.27, 0.131], [1.37, 0.121], [1.47, 0.098]];
const SH_Z = [[0.845, 0.0], [1.1, 0.004], [1.27, 0.008], [1.42, -0.01], [1.48, -0.018]];
const sleeveA = [0.135, 1.385, -0.016];
const sleeveDir = norm(sub(elbow, shoulder));
const sleeveEnd = addv(shoulder, scl(sleeveDir, 0.19));
function sleeve(ax, y, z) {
  let d = cone(ax, y, z, sleeveA, sleeveEnd, 0.07, 0.066);
  const t = dot(sub([ax, y, z], sleeveEnd), sleeveDir);
  d = smax(d, t, 0.006);
  // hollow opening so the arm visibly goes in
  const inner = cone(ax, y, z, addv(sleeveEnd, scl(sleeveDir, -0.07)), addv(sleeveEnd, scl(sleeveDir, 0.05)), 0.058, 0.06);
  d = smax(d, -inner, 0.003);
  // a few soft creases
  d += 0.0018 * sin(t * 90 + atan2(ax - sleeveEnd[0], z - sleeveEnd[2]) * 3) * sstep(-0.12, 0, t);
  return d;
}
function shirt(x, y, z) {
  const ax = abs(x);
  const a = profile(SH_A, y), b = profile(SH_B, y), zc = profile(SH_Z, y);
  const n = 3.0, qx = ax / a, qz = (z - zc) / b;
  let d = (pow(pow(qx, n) + pow(abs(qz), n), 1 / n) - 1) * min(a, b);
  const topY = 1.482 - max(0, ax - 0.05) * 0.4;
  d = smax(d, y - topY, 0.045);
  d = smax(d, 0.845 - y, 0.01);
  // loose drape folds near the hem
  const th = atan2(x, z);
  d += 0.0028 * sin(th * 9 + y * 6) * sstep(1.12, 0.88, y);
  d += 0.0016 * sin(th * 5 - y * 22) * sstep(1.3, 1.05, y) * sstep(0.12, 0.2, ax);
  d = smin(d, sleeve(ax, y, z), 0.035);
  // neck opening + ribbed collar
  d = smax(d, -ell(x, y, z, 0, 1.505, -0.014, 0.06, 0.052, 0.053), 0.006);
  const cy = 1.47, cz = -0.014;
  const qy = y - cy + 0.14 * (z - cz);
  const rr = len2(x, (z - cz) * (0.066 / 0.058)) - 0.066;
  const collar = len2(rr, qy) - 0.0085;
  d = smin(d, collar, 0.005);
  return d;
}

/* ------------------------------------------------------------- arms+hands */
function armFrame() {
  const down = norm(sub(wrist, elbow));
  let out = norm(sub([1, 0, 0], scl(down, down[0])));
  let fwd = cross(down, out);
  if (fwd[2] < 0) fwd = scl(fwd, -1);
  return { down, out, fwd };
}
const AF = armFrame();
const FINGERS = [
  // v offset (thumb side +), length scale, curl
  [0.026, 1.0, 0.85],
  [0.0085, 1.08, 1.0],
  [-0.0095, 1.02, 1.1],
  [-0.026, 0.82, 1.25],
];
function hand(u, v, w) {
  // u: down from wrist, v: towards thumb (forward), w: back of the hand (outwards)
  let d = rbox(u - 0.047, v, w + 0.001, 0.043, 0.039, 0.0125, 0.012);
  d = smin(d, ell(u, v, w, 0.035, 0.022, -0.008, 0.032, 0.02, 0.014), 0.01); // thenar
  let F = 1e9;
  for (const [vo, ls, curl] of FINGERS) {
    let pu = 0.086, pv = vo, pw = 0.001, ang = 0.12 * curl;
    const segs = [0.04 * ls, 0.026 * ls, 0.02 * ls], rads = [0.0092, 0.0084, 0.0077, 0.0068];
    const spread = vo * 0.9;
    let f = 1e9;
    for (let s = 0; s < 3; s++) {
      ang += [0.18, 0.42, 0.36][s] * curl;
      const nu = pu + cos(ang) * segs[s], nw = pw - sin(ang) * segs[s], nv = pv + spread * segs[s];
      f = smin(f, cone(u, v, w, [pu, pv, pw], [nu, nv, nw], rads[s], rads[s + 1]), 0.003);
      pu = nu; pv = nv; pw = nw;
    }
    F = smin(F, f, 0.0025);
  }
  d = smin(d, F, 0.007);
  // thumb
  let p = [0.018, 0.03, -0.008], T = 1e9;
  const dirs = [norm([0.62, 0.62, -0.3]), norm([0.82, 0.36, -0.38]), norm([0.9, 0.18, -0.4])];
  const tl = [0.04, 0.03, 0.024], tr = [0.0125, 0.0105, 0.0088, 0.0078];
  for (let s = 0; s < 3; s++) {
    const q = addv(p, scl(dirs[s], tl[s]));
    T = smin(T, cone(u, v, w, p, q, tr[s], tr[s + 1]), 0.003);
    p = q;
  }
  return smin(d, T, 0.008);
}
function armLocal(ax, y, z) {
  let d = cone(ax, y, z, shoulder, elbow, 0.046, 0.037);
  d = smin(d, cone(ax, y, z, elbow, wrist, 0.037, 0.0255), 0.02);
  const fm = lerpv(elbow, wrist, 0.28);
  d = smin(d, ell(ax, y, z, fm[0] + 0.004, fm[1], fm[2] + 0.004, 0.036, 0.075, 0.034), 0.03); // forearm muscle
  const p = sub([ax, y, z], wrist);
  const u = dot(p, AF.down) - 0.006, v = dot(p, AF.fwd), w = dot(p, AF.out);
  d = smin(d, hand(u, v, w), 0.014);
  return d;
}
function bracer(ax, y, z) {
  const arm = cone(ax, y, z, elbow, wrist, 0.037, 0.0255);
  const t = dot(sub([ax, y, z], elbow), norm(sub(wrist, elbow))) / len3(...sub(wrist, elbow));
  let d = arm - 0.0075 - 0.002 * sstep(0.75, 0.55, t);
  d = smax(d, max(0.42 - t, t - 0.86), 0.004);
  // lacing groove on the outer side
  return d;
}

/* ------------------------------------------------------------- legs/boots */
function legLocal(ax, y, z) {
  let d = cone(ax, y, z, hipJ, knee, 0.089, 0.066);
  d = smin(d, cone(ax, y, z, knee, ankle, 0.064, 0.052), 0.035);
  return d;
}
function pants(x, y, z) {
  const ax = abs(x);
  let d = ell(x, y, z, 0, 0.935, 0.0, 0.176, 0.13, 0.118);
  d = smin(d, legLocal(ax, y, z), 0.05);
  // bunching over the boots
  d = smin(d, ell(ax, y, z, ankle[0] + 0.001, 0.215, -0.008, 0.064, 0.042, 0.066), 0.03);
  // cargo pockets
  const pc = [0.188, 0.63, 0.012];
  const pk = rbox(ax - pc[0], y - pc[1], z - pc[2], 0.012, 0.062, 0.052, 0.01);
  d = smin(d, pk, 0.012);
  const flap = rbox(ax - pc[0] - 0.006, y - 0.688, z - pc[2], 0.008, 0.013, 0.055, 0.006);
  d = smin(d, flap, 0.004);
  // fabric folds at knees and ankles
  d += 0.0022 * sin(y * 95 + ax * 30) * (sstep(0.62, 0.5, y) * sstep(0.36, 0.48, y));
  d += 0.0025 * sin(y * 120 + z * 30) * sstep(0.34, 0.24, y);
  d = smax(d, 0.17 - y, 0.012);
  return d;
}
const SPLAY = 0.14;
function footLocal(ax, y, z) {
  const fx = ax - ankle[0], fz = z - ankle[2];
  const lx = fx * cos(SPLAY) - fz * sin(SPLAY), lz = fx * sin(SPLAY) + fz * cos(SPLAY);
  return [lx, y, lz];
}
function bootUpper(ax, y, z) {
  const [x, , zz] = footLocal(ax, y, z);
  let d = ell(x, y, zz, 0, 0.06, -0.035, 0.046, 0.058, 0.052);
  d = smin(d, ell(x, y, zz, 0.002, 0.055, 0.05, 0.05, 0.05, 0.078), 0.035);
  d = smin(d, ell(x, y, zz, 0.004, 0.046, 0.128, 0.047, 0.042, 0.052), 0.035);
  d = smin(d, cone(x, y, zz, [0, 0.07, 0.0], [0, 0.205, 0.004], 0.058, 0.057), 0.035);
  // padded collar
  d = smin(d, len2(len2(x, zz - 0.004) - 0.058, y - 0.205) - 0.008, 0.008);
  // tongue
  d = smin(d, cone(x, y, zz, [0, 0.09, 0.085], [0, 0.2, 0.045], 0.016, 0.014), 0.012);
  d = smax(d, 0.02 - y, 0.004);
  return d;
}
function sole(ax, y, z) {
  const [x, , zz] = footLocal(ax, y, z);
  let o = ell(x, 0.05, zz, 0, 0.06, -0.035, 0.046, 0.058, 0.052);
  o = smin(o, ell(x, 0.05, zz, 0.002, 0.055, 0.05, 0.05, 0.05, 0.078), 0.035);
  o = smin(o, ell(x, 0.05, zz, 0.004, 0.046, 0.128, 0.047, 0.042, 0.052), 0.035);
  o -= 0.0055;
  let d = smax(o, abs(y - 0.0135) - 0.0135, 0.004);
  return d;
}
// leg holster with a strap round the right thigh (-x side)
function holster(x, y, z) {
  if (x > 0) return 1;
  const ax = -x;
  const leg = legLocal(ax, y, z);
  const bandY = 0.705 - (z) * 0.05;
  let strap = smax(leg - 0.0042, abs(y - bandY) - 0.0115, 0.002);
  const bandY2 = 0.56;
  strap = min(strap, smax(leg - 0.0042, abs(y - bandY2) - 0.0095, 0.002));
  const pc = [0.205, 0.64, 0.03];
  let pouch = rbox(ax - pc[0], y - pc[1], z - pc[2], 0.024, 0.06, 0.046, 0.012);
  pouch = smin(pouch, rbox(ax - pc[0] - 0.006, y - 0.688, z - pc[2], 0.021, 0.016, 0.049, 0.008), 0.003);
  // hanger strap up to the waist
  const hang = rbox(ax - 0.19, y - 0.78, z - 0.03, 0.006, 0.09, 0.012, 0.004);
  return min(min(strap, pouch), hang);
}

// print coordinates for the shirt: arc length round the torso (stored as cos/sin so there is no seam)
const arcCache = new Map();
function shirtUV(x, y, z) {
  const yk = Math.round(clamp(y, 0.845, 1.48) * 1000);
  let tab = arcCache.get(yk);
  if (!tab) {
    const yy = yk / 1000, a = profile(SH_A, yy), b = profile(SH_B, yy), n = 3.0, N = 180;
    const pt = (t) => {
      const st = abs(sin(t)), ct = abs(cos(t));
      const rho = 1 / pow(pow(st / a, n) + pow(ct / b, n), 1 / n);
      return [rho * sin(t), rho * cos(t)];
    };
    tab = new Float64Array(N + 1);
    let prev = pt(0);
    for (let i = 1; i <= N; i++) {
      const p = pt((i / N) * PI);
      tab[i] = tab[i - 1] + len2(p[0] - prev[0], p[1] - prev[1]);
      prev = p;
    }
    arcCache.set(yk, tab);
  }
  const zc = profile(SH_Z, y);
  const th = atan2(x, z - zc), at = (abs(th) / PI) * 180, i0 = Math.floor(at), fr = at - i0;
  const s = mix(tab[i0], tab[min(i0 + 1, 180)], fr);
  const f = (Math.sign(th) * s) / (2 * tab[180]);
  return [[cos(f * 2 * PI), sin(f * 2 * PI)], [clamp((y - 0.845) / 0.635, 0, 1), 0]];
}

/* --------------------------------------------------------- surface nets */
function surfaceNets(f, bmin, bmax, h) {
  const nx = Math.ceil((bmax[0] - bmin[0]) / h) + 1;
  const ny = Math.ceil((bmax[1] - bmin[1]) / h) + 1;
  const nz = Math.ceil((bmax[2] - bmin[2]) / h) + 1;
  const V = new Float32Array(nx * ny * nz);
  let n = 0;
  for (let k = 0; k < nz; k++) {
    const z = bmin[2] + k * h;
    for (let j = 0; j < ny; j++) {
      const y = bmin[1] + j * h;
      for (let i = 0; i < nx; i++) V[n++] = f(bmin[0] + i * h, y, z);
    }
  }
  const at = (i, j, k) => V[i + nx * (j + ny * k)];
  const cnx = nx - 1, cny = ny - 1, cnz = nz - 1;
  const cell = new Int32Array(cnx * cny * cnz).fill(-1);
  const C = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cv = new Float64Array(8);
  const pos = [];
  for (let k = 0; k < cnz; k++)
    for (let j = 0; j < cny; j++)
      for (let i = 0; i < cnx; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          cv[c] = at(i + C[c][0], j + C[c][1], k + C[c][2]);
          if (cv[c] < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0, sy = 0, sz = 0, m = 0;
        for (const [a, b] of E) {
          if (cv[a] < 0 === cv[b] < 0) continue;
          const t = cv[a] / (cv[a] - cv[b]);
          sx += C[a][0] + t * (C[b][0] - C[a][0]);
          sy += C[a][1] + t * (C[b][1] - C[a][1]);
          sz += C[a][2] + t * (C[b][2] - C[a][2]);
          m++;
        }
        cell[i + cnx * (j + cny * k)] = pos.length / 3;
        pos.push(bmin[0] + (i + sx / m) * h, bmin[1] + (j + sy / m) * h, bmin[2] + (k + sz / m) * h);
      }
  const ci = (i, j, k) => cell[i + cnx * (j + cny * k)];
  const quads = [];
  for (let k = 1; k < nz - 1; k++)
    for (let j = 1; j < ny - 1; j++)
      for (let i = 1; i < nx - 1; i++) {
        const s0 = at(i, j, k) < 0;
        if (s0 !== at(i + 1, j, k) < 0 && i < cnx) quads.push(ci(i, j - 1, k - 1), ci(i, j, k - 1), ci(i, j, k), ci(i, j - 1, k));
        if (s0 !== at(i, j + 1, k) < 0 && j < cny) quads.push(ci(i - 1, j, k - 1), ci(i, j, k - 1), ci(i, j, k), ci(i - 1, j, k));
        if (s0 !== at(i, j, k + 1) < 0 && k < cnz) quads.push(ci(i - 1, j - 1, k), ci(i, j - 1, k), ci(i, j, k), ci(i - 1, j, k));
      }
  // project onto the surface and take the gradient as the normal
  const e = h * 0.25;
  const grad = (x, y, z) => {
    const gx = f(x + e, y, z) - f(x - e, y, z), gy = f(x, y + e, z) - f(x, y - e, z), gz = f(x, y, z + e) - f(x, y, z - e);
    const l = len3(gx, gy, gz) || 1;
    return [gx / l, gy / l, gz / l];
  };
  const nrm = new Float32Array(pos.length);
  for (let v = 0; v < pos.length; v += 3) {
    let x = pos[v], y = pos[v + 1], z = pos[v + 2];
    for (let it = 0; it < 2; it++) {
      const d = f(x, y, z), g = grad(x, y, z);
      const step = clamp(d, -h, h);
      x -= g[0] * step; y -= g[1] * step; z -= g[2] * step;
    }
    pos[v] = x; pos[v + 1] = y; pos[v + 2] = z;
    const g = grad(x, y, z);
    nrm[v] = g[0]; nrm[v + 1] = g[1]; nrm[v + 2] = g[2];
  }
  const idx = [];
  for (let q = 0; q < quads.length; q += 4) {
    const [a, b, c, d] = [quads[q], quads[q + 1], quads[q + 2], quads[q + 3]];
    if (a < 0 || b < 0 || c < 0 || d < 0) continue;
    const P = (i) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
    const fn = cross(sub(P(c), P(a)), sub(P(d), P(b)));
    const nn = [nrm[a * 3] + nrm[c * 3], nrm[a * 3 + 1] + nrm[c * 3 + 1], nrm[a * 3 + 2] + nrm[c * 3 + 2]];
    const flip = dot(fn, nn) < 0;
    // split along the shorter diagonal
    const ac = len3(...sub(P(a), P(c))), bd = len3(...sub(P(b), P(d)));
    let tris = ac < bd ? [a, b, c, a, c, d] : [a, b, d, b, c, d];
    if (flip) tris = [tris[0], tris[2], tris[1], tris[3], tris[5], tris[4]];
    idx.push(...tris);
  }
  return { pos: new Float32Array(pos), nrm, idx };
}

/* ------------------------------------------------------------- vertex colour */
const WHITE = () => [1, 1, 1];
function skinTone(x, y, z) {
  const ax = abs(x);
  let r = 1, g = 1, b = 1;
  const warm = (k, cr, cg, cb) => {
    r = mix(r, cr, k); g = mix(g, cg, k); b = mix(b, cb, k);
  };
  if (y > 1.5) {
    // warmth on nose, cheeks, ears
    warm(clamp(1 - sphere(x, y, z, 0, 1.625, 0.1, 0.0) / 0.018, 0, 1) * 0.5, 1.05, 0.9, 0.86);
    warm(clamp(1 - sphere(ax, y, z, 0.046, 1.64, 0.06, 0.0) / 0.03, 0, 1) * 0.35, 1.04, 0.9, 0.87);
    warm(clamp(1 - sphere(ax, y, z, 0.08, 1.66, -0.01, 0.0) / 0.03, 0, 1) * 0.55, 1.03, 0.86, 0.82);
    // lips
    const l = lips(x, y, z);
    warm(sstep(0.0018, -0.0008, l), 0.86, 0.6, 0.58);
    // eye surroundings: soft shadow, lash line on the upper lid
    const eo = eyeOpening(ax, y, EYE.z + 0.02);
    const ring = sstep(0.006, 0.0, eo);
    warm(ring * 0.4, 0.82, 0.74, 0.74);
    const above = y > EYE.y + 0.001 + (ax - EYE.x) * 0.1;
    warm(above ? sstep(0.0022, 0.0, eo) : sstep(0.0011, 0.0, eo) * 0.6, 0.12, 0.08, 0.07);
    // stubble shadow around the beard
    const bd = beard(x, y, z + 0.0) - 0.0;
    warm(sstep(0.012, 0.0, bd + 0.0034) * 0.4, 0.72, 0.68, 0.68);
    // hair shadow along the hairline
    const a = abs(atan2(x, z + 0.01));
    const hl = hairline(a);
    warm(sstep(-0.01, 0.003, y - hl) * 0.65, 0.35, 0.3, 0.29);
  }
  return [r, g, b];
}
function bootTone(x, y, z) {
  const ax = abs(x);
  const [lx, , lz] = footLocal(ax, y, z);
  // laces across the tongue
  const onTongue = abs(lx) < 0.022 && lz > 0.02 && y > 0.085 && y < 0.2;
  if (onTongue && (((y * 46) % 1) + 1) % 1 < 0.38) return [0.78, 0.56, 0.2];
  // darker welt near the sole, worn toe cap
  if (y < 0.03) return [0.17, 0.11, 0.07];
  const toe = sstep(0.09, 0.15, lz) * 0.25;
  return [mix(0.36, 0.44, toe), mix(0.22, 0.28, toe), mix(0.13, 0.17, toe)];
}

/* --------------------------------------------------------------- export */
const doc = new Document();
const buffer = doc.createBuffer();
const mats = {};
const mat = (name, c) => (mats[name] ??= doc.createMaterial(name).setBaseColorFactor([...c, 1]).setRoughnessFactor(0.7));
const nodes = {};
const node = (name, pivot, parent) => {
  const n = doc.createNode(name);
  nodes[name] = { n, pivot };
  if (parent) {
    const pp = nodes[parent].pivot;
    n.setTranslation(sub(pivot, pp));
    nodes[parent].n.addChild(n);
  } else n.setTranslation(pivot);
  return n;
};
const scene = doc.createScene("hero");
scene.addChild(node("Hero", [0, 0, 0]));
nodes.Hero.n.addChild(node("hips", HIP));
node("spine", SPINE, "hips");
node("neck", NECK, "spine");
node("armL", shoulder, "spine");
node("armR", [-shoulder[0], shoulder[1], shoulder[2]], "spine");

let totalTris = 0;
function part(name, nodeName, matName, color, f, bmin, bmax, h, colorFn = WHITE, uvFn = null) {
  const t0 = Date.now();
  const { pos, nrm, idx } = surfaceNets(f, bmin, bmax, h);
  const pivot = nodes[nodeName].pivot;
  const col = new Float32Array(pos.length);
  const uv0 = uvFn && new Float32Array((pos.length / 3) * 2), uv1 = uvFn && new Float32Array((pos.length / 3) * 2);
  for (let v = 0; v < pos.length; v += 3) {
    if (uvFn) {
      const [a, b] = uvFn(pos[v], pos[v + 1], pos[v + 2]), i2 = (v / 3) * 2;
      uv0[i2] = a[0]; uv0[i2 + 1] = a[1]; uv1[i2] = b[0]; uv1[i2 + 1] = b[1];
    }
    const c = colorFn(pos[v], pos[v + 1], pos[v + 2]);
    col[v] = c[0]; col[v + 1] = c[1]; col[v + 2] = c[2];
    pos[v] -= pivot[0]; pos[v + 1] -= pivot[1]; pos[v + 2] -= pivot[2];
  }
  const vc = pos.length / 3;
  const prim = doc
    .createPrimitive()
    .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(pos).setBuffer(buffer))
    .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(nrm).setBuffer(buffer))
    .setAttribute("COLOR_0", doc.createAccessor().setType("VEC3").setArray(col).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType("SCALAR").setArray(vc > 65535 ? new Uint32Array(idx) : new Uint16Array(idx)).setBuffer(buffer))
    .setMaterial(mat(matName, color));
  if (uvFn) {
    prim.setAttribute("TEXCOORD_0", doc.createAccessor().setType("VEC2").setArray(uv0).setBuffer(buffer));
    prim.setAttribute("TEXCOORD_1", doc.createAccessor().setType("VEC2").setArray(uv1).setBuffer(buffer));
  }
  const mesh = doc.createMesh(name).addPrimitive(prim);
  const n = doc.createNode(name).setMesh(mesh);
  nodes[nodeName].n.addChild(n);
  totalTris += idx.length / 3;
  console.log(`  ${name.padEnd(10)} ${String(idx.length / 3).padStart(7)} tris  ${Date.now() - t0}ms`);
}

console.log("[hero] meshing…");
part("head", "neck", "skin", [0.62, 0.42, 0.3], headSkin, [-0.105, 1.4, -0.135], [0.105, 1.8, 0.13], 0.0021, skinTone);
part("hair", "neck", "hair", [0.05, 0.04, 0.035], hair, [-0.11, 1.57, -0.15], [0.11, 1.85, 0.11], 0.0024);
part("beard", "neck", "beard", [0.05, 0.04, 0.035], beard, [-0.09, 1.52, -0.06], [0.09, 1.67, 0.11], 0.0016);
part("brows", "neck", "beard", [0.05, 0.04, 0.035], brows, [-0.07, 1.67, 0.03], [0.07, 1.715, 0.11], 0.0012);
part("shirt", "spine", "shirt", [0.07, 0.07, 0.08], shirt, [-0.33, 0.82, -0.18], [0.33, 1.52, 0.18], 0.0048, WHITE, shirtUV);
for (const [s, nn] of [[1, "armL"], [-1, "armR"]]) {
  const f = (x, y, z) => armLocal(x * s, y, z);
  const xs = s > 0 ? [0.12, 0.4] : [-0.4, -0.12];
  part(`skin_${nn}`, nn, "skin", [0.62, 0.42, 0.3], f, [xs[0], 0.74, -0.12], [xs[1], 1.5, 0.12], 0.0022);
}
part("bracer", "armL", "leather", [0.33, 0.2, 0.12], (x, y, z) => (x < 0 ? 1 : bracer(x, y, z)), [0.18, 0.85, -0.1], [0.37, 1.16, 0.08], 0.0026);
part("pants", "hips", "pants", [0.12, 0.12, 0.13], pants, [-0.26, 0.15, -0.16], [0.26, 1.08, 0.16], 0.0048);
part("boots", "hips", "leather", [0.33, 0.2, 0.12], (x, y, z) => bootUpper(abs(x), y, z), [-0.22, 0.0, -0.1], [0.22, 0.26, 0.22], 0.0028, bootTone);
part("soles", "hips", "sole", [0.13, 0.1, 0.08], (x, y, z) => sole(abs(x), y, z), [-0.22, -0.005, -0.1], [0.22, 0.035, 0.22], 0.0026);
part("holster", "hips", "leather", [0.33, 0.2, 0.12], holster, [-0.29, 0.48, -0.13], [-0.08, 0.9, 0.14], 0.0032);
console.log(`[hero] ${totalTris} triangles before simplify`);

const io = new NodeIO().registerExtensions([KHRDracoMeshCompression]).registerDependencies({
  "draco3d.encoder": await draco3d.createEncoderModule(),
  "draco3d.decoder": await draco3d.createDecoderModule(),
});
await MeshoptSimplifier.ready;
await doc.transform(
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: 0.3, error: 0.0006 }),
  draco({ quantizePosition: 14, quantizeNormal: 10, quantizeColor: 8 }),
);
let after = 0;
for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) after += p.getIndices().getCount() / 3;
console.log(`[hero] ${after} triangles after simplify`);
mkdirSync(new URL("../models/hero/", import.meta.url), { recursive: true });
await io.write(new URL("../models/hero/pawan.glb", import.meta.url).pathname, doc);
console.log("[hero] wrote models/hero/pawan.glb");
