// Home-screen player character: Pawan, built by tools/build-hero.mjs (models/hero/pawan.glb).
// Renders in its own transparent canvas with soft PBR lighting so he reads like a game hero standing
// in front of the world. Idle breathing, blinking, head/eye tracking of the pointer, drag to spin.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

// keep in sync with tools/build-hero.mjs
const NECK = new THREE.Vector3(0, 1.465, -0.02);
const SHOULDER = new THREE.Vector3(0.19, 1.418, -0.015);
const ELBOW = new THREE.Vector3(0.258, 1.138, -0.045);
const WRIST = new THREE.Vector3(0.3, 0.887, -0.005);
const EYE = { x: 0.0322, y: 1.6675, z: 0.0712, r: 0.0138 };
const SPINE_Y = 1.02;

const C = {
  ink: "#141416",
  red: "#b9543b",
  red2: "#93402e",
  green: "#1f7d5e",
  green2: "#2c9a72",
  mustard: "#dcaa45",
  cream: "#ead9b1",
};

/* ------------------------------------------------------------ shirt print */
function seeded(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}
export function drawShirtPrint(P) {
  const W = 2048, H = 1024, TOP = 0.92, HM = 0.635;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const g = cv.getContext("2d");
  g.fillStyle = C.ink;
  g.fillRect(0, 0, W, H);
  const sy = (H * TOP) / HM, sx = W / P;
  // draw in shirt metres: x along the surface, y up from the hem; u is 0..1 round the body
  const at = (u, y, fn, half = 0.2) => {
    for (const o of [-1, 0, 1]) {
      const uu = u + o;
      if (uu * W + half * sx < 0 || uu * W - half * sx > W) continue;
      g.save();
      g.setTransform(sx, 0, 0, -sy, uu * W, H - y * sy);
      fn();
      g.restore();
    }
  };
  const ellipse = (x, y, rx, ry, rot = 0) => {
    g.beginPath();
    g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  };
  const leaf = (x, y, len, wid, rot) => {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(len * 0.5, wid, len, 0);
    g.quadraticCurveTo(len * 0.5, -wid, 0, 0);
    g.fill();
    g.restore();
  };
  const FRONT = 0.75, BACK = 0.25;
  const rnd = seeded(7);

  /* --- bottom: zig-zag borders, elephant parade, forest + temple skyline --- */
  const zig = (y, h, down) => {
    g.fillStyle = C.green;
    const n = Math.round(P / 0.009);
    for (let i = 0; i < n; i++) {
      const x = (i / n) * P;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + P / n, y);
      g.lineTo(x + P / n / 2, y + (down ? -h : h));
      g.fill();
    }
  };
  at(0, 0, () => {
    zig(0.022, 0.006, false);
    zig(0.088, 0.006, true);
    g.fillRect(0, 0.0195, P, 0.0018);
    g.fillRect(0, 0.0885, P, 0.0018);
  }, 0);
  at(1, 0, () => {}, 0);

  const elephant = () => {
    // faces left, feet on y=0, about 7cm long
    g.fillStyle = C.red;
    ellipse(0.002, 0.026, 0.022, 0.0145);
    g.fill();
    ellipse(-0.021, 0.031, 0.0105, 0.0105);
    g.fill();
    // trunk
    g.lineWidth = 0.0055;
    g.strokeStyle = C.red;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(-0.028, 0.028);
    g.quadraticCurveTo(-0.036, 0.016, -0.032, 0.008);
    g.quadraticCurveTo(-0.03, 0.003, -0.025, 0.006);
    g.stroke();
    // legs
    for (const lx of [-0.015, -0.007, 0.009, 0.017]) g.fillRect(lx - 0.0032, 0, 0.0064, 0.02);
    // tail
    g.lineWidth = 0.0016;
    g.beginPath();
    g.moveTo(0.023, 0.03);
    g.quadraticCurveTo(0.03, 0.022, 0.027, 0.014);
    g.stroke();
    // ear
    g.fillStyle = C.red2;
    ellipse(-0.012, 0.031, 0.0062, 0.0085, 0.2);
    g.fill();
    // tusk + eye
    g.strokeStyle = C.cream;
    g.lineWidth = 0.0016;
    g.beginPath();
    g.moveTo(-0.026, 0.024);
    g.quadraticCurveTo(-0.031, 0.019, -0.034, 0.021);
    g.stroke();
    g.fillStyle = C.ink;
    ellipse(-0.024, 0.034, 0.0013, 0.0013);
    g.fill();
    // saddle cloth
    g.fillStyle = C.green;
    g.beginPath();
    g.roundRect(-0.009, 0.017, 0.022, 0.02, 0.003);
    g.fill();
    g.strokeStyle = C.mustard;
    g.lineWidth = 0.0013;
    g.stroke();
    g.beginPath();
    g.moveTo(-0.007, 0.019);
    g.lineTo(0.011, 0.035);
    g.moveTo(0.011, 0.019);
    g.lineTo(-0.007, 0.035);
    g.stroke();
    // head ornament
    g.fillStyle = C.mustard;
    ellipse(-0.022, 0.0405, 0.0028, 0.0028);
    g.fill();
    for (const lx of [-0.015, -0.007, 0.009, 0.017]) g.fillRect(lx - 0.0034, 0.004, 0.0068, 0.0014);
  };
  const fan = () => {
    const cx = 0, cy = 0.006;
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * (0.08 + (0.84 * i) / 8);
      g.fillStyle = i % 2 ? C.green2 : C.red;
      g.save();
      g.translate(cx, cy);
      g.rotate(a - Math.PI / 2);
      g.beginPath();
      g.moveTo(-0.0025, 0.008);
      g.quadraticCurveTo(-0.0055, 0.026, 0, 0.034);
      g.quadraticCurveTo(0.0055, 0.026, 0.0025, 0.008);
      g.fill();
      g.restore();
    }
    g.fillStyle = C.mustard;
    g.beginPath();
    g.arc(cx, cy, 0.01, 0, Math.PI);
    g.fill();
    g.fillStyle = C.red;
    g.beginPath();
    g.arc(cx, cy, 0.0055, 0, Math.PI);
    g.fill();
  };
  {
    const n = Math.round(P / 0.12), step = 1 / n;
    for (let i = 0; i < n; i++) {
      at(i * step + 0.02, 0.03, elephant, 0.05);
      at(i * step + 0.02 + step / 2, 0.03, fan, 0.05);
    }
  }
  // forest
  const tree = (s, hue) => {
    g.fillStyle = C.ink;
    g.fillRect(-0.002 * s, 0, 0.004 * s, 0.03 * s);
    g.fillStyle = hue;
    g.fillRect(-0.0015 * s, 0, 0.003 * s, 0.03 * s);
    const cy = 0.055 * s, R = 0.033 * s;
    const rings = [[0, 1], [0.45, 7], [0.82, 12]];
    for (const [rr, cnt] of rings)
      for (let k = 0; k < cnt; k++) {
        const a = (k / cnt) * Math.PI * 2 + rr * 3;
        leaf(Math.cos(a) * R * rr, cy + Math.sin(a) * R * rr * 0.95, R * 0.48, R * 0.15, a + 0.35);
      }
  };
  for (let i = 0; i < 46; i++) {
    const u = (i + rnd() * 0.6) / 46;
    // leave room for the temples
    const dB = Math.abs(u - BACK), dF = Math.abs(u - FRONT);
    if (dB < 0.06 || dF < 0.05) continue;
    const s = 0.78 + rnd() * 0.55;
    at(u, 0.092, () => tree(s, rnd() > 0.5 ? C.green : C.green2), 0.06);
  }
  const temple = (s) => {
    g.fillStyle = C.green;
    const dome = (x, y, w, h) => {
      g.beginPath();
      g.moveTo(x - w, y);
      g.bezierCurveTo(x - w * 1.25, y + h * 0.55, x - w * 0.2, y + h * 0.7, x, y + h);
      g.bezierCurveTo(x + w * 0.2, y + h * 0.7, x + w * 1.25, y + h * 0.55, x + w, y);
      g.fill();
      g.fillRect(x - w * 0.08, y + h * 0.98, w * 0.16, h * 0.22);
      g.beginPath();
      g.arc(x, y + h * 1.22, w * 0.11, 0, Math.PI * 2);
      g.fill();
      // ribs
      g.strokeStyle = C.ink;
      g.lineWidth = 0.0012 * s;
      for (const f of [-0.5, 0, 0.5]) {
        g.beginPath();
        g.moveTo(x + w * f, y);
        g.quadraticCurveTo(x + w * f * 0.9, y + h * 0.55, x, y + h * 0.97);
        g.stroke();
      }
    };
    g.save();
    g.scale(s, s);
    // body with arches
    g.fillRect(-0.06, 0, 0.12, 0.035);
    g.fillStyle = C.ink;
    for (let i = -2; i <= 2; i++) {
      g.beginPath();
      g.moveTo(i * 0.022 - 0.0065, 0.004);
      g.lineTo(i * 0.022 - 0.0065, 0.02);
      g.quadraticCurveTo(i * 0.022, 0.03, i * 0.022 + 0.0065, 0.02);
      g.lineTo(i * 0.022 + 0.0065, 0.004);
      g.fill();
    }
    g.fillStyle = C.green;
    g.fillRect(-0.064, 0.034, 0.128, 0.005);
    dome(0, 0.039, 0.036, 0.075);
    dome(-0.05, 0.039, 0.014, 0.034);
    dome(0.05, 0.039, 0.014, 0.034);
    // minarets
    for (const mx of [-0.07, 0.07]) {
      g.fillStyle = C.green;
      g.fillRect(mx - 0.0045, 0, 0.009, 0.07);
      dome(mx, 0.07, 0.007, 0.016);
    }
    g.restore();
  };
  at(BACK, 0.09, () => temple(1.05), 0.09);
  at(FRONT, 0.09, () => temple(0.85), 0.09);

  /* --- back: sun with bow and arrow --- */
  at(BACK, 0.385, () => {
    // rays
    g.fillStyle = C.red;
    const nr = 13;
    for (let i = 0; i < nr; i++) {
      const a = Math.PI * (0.02 + (0.96 * i) / (nr - 1));
      const L = i % 2 ? 0.05 : 0.064, bend = (i - (nr - 1) / 2) * 0.012;
      g.save();
      g.rotate(a - Math.PI / 2);
      g.beginPath();
      g.moveTo(-0.0075, 0.051);
      g.bezierCurveTo(-0.004, 0.051 + L * 0.5, bend * 0.6 - 0.002, 0.051 + L * 0.8, bend, 0.051 + L);
      g.bezierCurveTo(bend * 0.6 + 0.002, 0.051 + L * 0.75, 0.005, 0.051 + L * 0.4, 0.0075, 0.051);
      g.fill();
      g.restore();
    }
    // disc
    g.beginPath();
    g.arc(0, 0, 0.044, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = C.ink;
    g.lineWidth = 0.0022;
    const spiral = (cx, cy, r, turns, dir) => {
      g.beginPath();
      for (let t = 0; t <= 1.001; t += 0.02) {
        const a = dir * t * turns * Math.PI * 2, rr = r * (1 - t * 0.85);
        const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
        t === 0 ? g.moveTo(px, py) : g.lineTo(px, py);
      }
      g.stroke();
    };
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      spiral(Math.cos(a) * 0.024, Math.sin(a) * 0.024, 0.011, 1.6, i % 2 ? 1 : -1);
    }
    spiral(0, 0, 0.012, 2, 1);
    g.beginPath();
    g.arc(0, 0, 0.0395, 0, Math.PI * 2);
    g.stroke();
    // bow
    g.lineCap = "round";
    g.strokeStyle = C.green2;
    g.lineWidth = 0.0085;
    g.beginPath();
    g.moveTo(-0.082, -0.002);
    g.bezierCurveTo(-0.05, -0.035, 0.05, -0.035, 0.082, -0.002);
    g.stroke();
    g.lineWidth = 0.004;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(0.08 * s, -0.003);
      g.quadraticCurveTo(0.094 * s, 0.006, 0.086 * s, 0.012);
      g.stroke();
    }
    // grip
    g.fillStyle = C.mustard;
    g.beginPath();
    g.roundRect(-0.016, -0.034, 0.032, 0.012, 0.005);
    g.fill();
    g.fillStyle = C.red;
    g.fillRect(-0.004, -0.035, 0.008, 0.014);
    // string
    g.strokeStyle = C.mustard;
    g.lineWidth = 0.0014;
    g.beginPath();
    g.moveTo(-0.082, -0.002);
    g.lineTo(0, -0.105);
    g.lineTo(0.082, -0.002);
    g.stroke();
    // arrow
    g.lineWidth = 0.0024;
    g.beginPath();
    g.moveTo(0, -0.108);
    g.lineTo(0, 0.012);
    g.stroke();
    g.fillStyle = C.mustard;
    g.beginPath();
    g.moveTo(0, 0.026);
    g.lineTo(-0.0065, 0.008);
    g.lineTo(0.0065, 0.008);
    g.fill();
    g.fillStyle = C.green2;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(0, -0.1);
      g.lineTo(0.007 * s, -0.112);
      g.lineTo(0.007 * s, -0.102);
      g.lineTo(0, -0.09);
      g.fill();
    }
  }, 0.12);

  /* --- yoke: floral band across the shoulders (back) --- */
  const rosette = () => {
    g.fillStyle = C.green;
    for (let k = 0; k < 4; k++) leaf(0, 0, 0.017, 0.0055, (k / 4) * Math.PI * 2 + Math.PI / 4);
    g.fillStyle = C.red;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      ellipse(Math.cos(a) * 0.0055, Math.sin(a) * 0.0055, 0.0035, 0.0024, a);
      g.fill();
    }
    g.fillStyle = C.mustard;
    ellipse(0, 0, 0.0034, 0.0034);
    g.fill();
    g.fillStyle = C.ink;
    ellipse(0, 0, 0.0013, 0.0013);
    g.fill();
  };
  const spacer = () => {
    g.fillStyle = C.green2;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.arc(0.0, 0, 0.007, s > 0 ? -0.9 : Math.PI - 0.9, s > 0 ? 0.9 : Math.PI + 0.9);
      g.arc(0.003 * s, 0, 0.0055, s > 0 ? 0.9 : Math.PI + 0.9, s > 0 ? -0.9 : Math.PI - 0.9, true);
      g.fill();
    }
    g.fillStyle = C.mustard;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(0, 0.009 * s);
      g.lineTo(-0.0028, 0.0145 * s);
      g.lineTo(0.0028, 0.0145 * s);
      g.fill();
    }
  };
  {
    const span = 0.36, n = 7;
    for (let i = 0; i < n; i++) {
      const x = -span / 2 + (i / (n - 1)) * span;
      at(BACK + x / P, 0.535, rosette, 0.03);
      if (i < n - 1) at(BACK + (x + span / (n - 1) / 2) / P, 0.535, spacer, 0.03);
    }
  }
  /* --- front: embroidered chest band + elephant badge --- */
  {
    const span = 0.34, n = 13;
    at(FRONT, 0.505, () => {
      g.fillStyle = C.green;
      g.fillRect(-span / 2, 0.0165, span, 0.0022);
      g.fillRect(-span / 2, -0.0185, span, 0.0022);
      for (let i = 0; i < n; i++) {
        const x = -span / 2 + ((i + 0.5) / n) * span;
        g.fillStyle = i % 2 ? C.red : "#c4606a";
        g.beginPath();
        g.moveTo(x, 0.013);
        g.lineTo(x + 0.0105, 0);
        g.lineTo(x, -0.013);
        g.lineTo(x - 0.0105, 0);
        g.fill();
        g.fillStyle = C.mustard;
        ellipse(x, 0, 0.0028, 0.0028);
        g.fill();
        g.fillStyle = C.green2;
        if (i < n - 1) {
          leaf(x + span / n / 2, 0.002, 0.008, 0.003, Math.PI / 2);
          leaf(x + span / n / 2, -0.002, 0.008, 0.003, -Math.PI / 2);
        }
      }
    }, 0.2);
    at(FRONT + 0.088 / P, 0.39, () => {
      g.strokeStyle = C.mustard;
      g.lineWidth = 0.0016;
      g.beginPath();
      g.arc(0, 0.022, 0.034, 0, Math.PI * 2);
      g.stroke();
      g.save();
      g.translate(0.002, 0.0);
      g.scale(0.82, 0.82);
      elephant();
      g.restore();
    }, 0.05);
  }

  /* --- sleeve band strip (top 6% of the texture) --- */
  {
    const sh = H * 0.06, period = W / 8;
    g.save();
    g.fillStyle = C.green;
    g.fillRect(0, 0, W, sh * 0.62);
    g.fillStyle = C.ink;
    g.fillRect(0, sh * 0.62, W, sh * 0.38);
    for (let i = 0; i < 8; i++) {
      const cx = i * period + period / 2, cy = sh * 0.31;
      g.strokeStyle = C.mustard;
      g.lineWidth = 3;
      g.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        const px = cx + Math.cos(a) * 46, py = cy + Math.sin(a) * 13;
        k ? g.lineTo(px, py) : g.moveTo(px, py);
      }
      g.closePath();
      g.stroke();
      g.fillStyle = C.red;
      g.fill();
      for (const s of [-1, 1]) {
        g.fillStyle = C.mustard;
        for (let d = 0; d < 3; d++) {
          const dx = cx + s * (80 + d * 30);
          g.beginPath();
          g.moveTo(dx, cy - 9);
          g.lineTo(dx + 9, cy);
          g.lineTo(dx, cy + 9);
          g.lineTo(dx - 9, cy);
          g.fill();
        }
      }
      // small diamonds below
      for (let d = 0; d < 6; d++) {
        const dx = i * period + (d + 0.5) * (period / 6), dy = sh * 0.81;
        g.fillStyle = d % 2 ? C.red : C.mustard;
        g.beginPath();
        g.moveTo(dx, dy - 5);
        g.lineTo(dx + 5, dy);
        g.lineTo(dx, dy + 5);
        g.lineTo(dx - 5, dy);
        g.fill();
      }
    }
    g.restore();
  }

  // screen-print grain
  const img = g.getImageData(0, 0, W, H), d = img.data, r2 = seeded(3);
  for (let i = 0; i < d.length; i += 4) {
    const k = 0.9 + r2() * 0.12;
    d[i] *= k;
    d[i + 1] *= k;
    d[i + 2] *= k;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/* --------------------------------------------------------------- eyes */
function eyeTexture() {
  // the eyeball's pole looks forward, so v is the angle from the gaze direction
  const W = 256, H = 256;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const g = cv.getContext("2d");
  const iris = 0.155, pupil = 0.062;
  for (let y = 0; y < H; y++) {
    const v = y / H;
    let col;
    if (v < pupil) col = [8, 6, 6];
    else if (v < iris) {
      const t = (v - pupil) / (iris - pupil);
      col = [mixc(78, 38, t), mixc(48, 24, t), mixc(28, 14, t)];
    } else if (v < iris + 0.012) col = [26, 16, 12];
    else {
      const t = Math.min(1, (v - iris) / 0.35);
      col = [mixc(246, 226, t), mixc(240, 214, t), mixc(236, 208, t)];
    }
    g.fillStyle = `rgb(${col.join(",")})`;
    g.fillRect(0, y, W, 1);
  }
  // iris fibres
  const r = seeded(11);
  for (let i = 0; i < 260; i++) {
    const x = r() * W;
    g.strokeStyle = `rgba(${r() > 0.5 ? "150,96,50" : "20,12,8"},${0.25 + r() * 0.3})`;
    g.lineWidth = 1 + r() * 1.5;
    g.beginPath();
    g.moveTo(x, pupil * H + 1);
    g.lineTo(x + (r() - 0.5) * 6, iris * H - 1);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function mixc(a, b, t) {
  return Math.round(a + (b - a) * t);
}

/* ---------------------------------------------------------- materials */
function hairStrands(mat, scale = 1) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vHP;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvHP = position;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vHP;")
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
        {
          float s = sin(vHP.x * ${(1500 * scale).toFixed(1)} + sin(vHP.z * 90.0) * 4.0 + sin(vHP.y * 140.0) * 2.0);
          float s2 = sin(vHP.x * ${(3700 * scale).toFixed(1)} + vHP.z * 400.0);
          normal = normalize(normal + (vec3(s, 0.0, 0.0) * 0.16 + vec3(0.0, s2, 0.0) * 0.08) );
        }`,
      );
  };
  return mat;
}
function makeShirtMaterial(printTex) {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.92,
    sheen: 1,
    sheenRoughness: 0.75,
    sheenColor: new THREE.Color("#4a4a55"),
  });
  const dir = ELBOW.clone().sub(SHOULDER).normalize();
  const end = SHOULDER.clone().addScaledVector(dir, 0.19);
  const b1 = new THREE.Vector3(0, 0, 1).cross(dir).normalize();
  const b2 = dir.clone().cross(b1).normalize();
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      uPrint: { value: printTex },
      uSEnd: { value: end },
      uSDir: { value: dir },
      uSB1: { value: b1 },
      uSB2: { value: b2 },
    });
    sh.vertexShader = sh.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute vec2 aCS; attribute vec2 aV; varying vec2 vCS; varying float vV; varying vec3 vHP;",
      )
      .replace("#include <begin_vertex>", `#include <begin_vertex>\nvCS = aCS; vV = aV.x; vHP = position + vec3(0.0, ${SPINE_Y.toFixed(3)}, 0.0);`);
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform sampler2D uPrint; uniform vec3 uSEnd, uSDir, uSB1, uSB2; varying vec2 vCS; varying float vV; varying vec3 vHP;",
      )
      .replace(
        "#include <map_fragment>",
        `{
          float ang = atan(vCS.y, vCS.x) / 6.2831853;
          float u1 = fract(ang + 0.75), u2 = fract(ang + 0.25);
          float v = clamp(vV, 0.0, 1.0) * 0.92;
          bool w2 = fwidth(u2) < fwidth(u1);
          vec2 gx = vec2(w2 ? dFdx(u2) : dFdx(u1), dFdx(v)), gy = vec2(w2 ? dFdy(u2) : dFdy(u1), dFdy(v));
          vec4 tc = textureGrad(uPrint, vec2(u1, 1.0 - v), gx, gy);
          vec3 q = vec3(abs(vHP.x), vHP.y, vHP.z);
          float t = dot(q - uSEnd, uSDir);
          vec3 rr = q - uSEnd - uSDir * t;
          if (t > -0.05 && q.x > 0.205 && length(rr) > 0.04) {
            tc = vec4(0.078, 0.078, 0.086, 1.0);
            if (t > -0.047 && t < -0.009) {
              float sa = atan(dot(rr, uSB1), dot(rr, uSB2)) / 6.2831853;
              float su = fract(sa + 0.5), su2 = fract(sa);
              float sv = (t + 0.047) / 0.038 * 0.06;
              bool s2 = fwidth(su2) < fwidth(su);
              tc = textureGrad(uPrint, vec2(su, sv), vec2(s2 ? dFdx(su2) : dFdx(su), dFdx(sv)), vec2(s2 ? dFdy(su2) : dFdy(su), dFdy(sv)));
            }
          }
          diffuseColor.rgb *= tc.rgb;
        }`,
      );
  };
  return m;
}

/* ---------------------------------------------------------- trainer cap */
// Red-and-white trainer cap with a short brim, sized to sit over the hair. Built in hero space and
// returned offset by -NECK so it can be parented straight onto the neck bone.
const CAP = { x: 0, y: 1.7, z: -0.018, rx: 0.112, ry: 0.15, rz: 0.142 };
function trainerCap(cfg) {
  const o = typeof cfg === "object" ? cfg : {};
  const fabric = (color) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.82, sheen: 0.6, sheenRoughness: 0.6, sheenColor: new THREE.Color("#ffffff") });
  const red = fabric(o.color || "#cf3a2c"), white = fabric("#f4f1ea");
  const g = new THREE.Group();
  g.name = "Trainer cap";
  // crown: red back, white front panel
  const crown = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.5), red);
  crown.scale.set(CAP.rx, CAP.ry, CAP.rz);
  crown.position.set(CAP.x, CAP.y, CAP.z);
  crown.rotation.x = -0.12;
  const front = new THREE.Mesh(new THREE.SphereGeometry(1.012, 40, 20, Math.PI * 0.5 - 0.78, 1.56, 0.12, Math.PI * 0.5 - 0.17), white);
  front.scale.copy(crown.scale);
  front.position.copy(crown.position);
  front.rotation.copy(crown.rotation);
  // emblem: a small teal half-moon on the white panel
  const emb = new THREE.Mesh(new THREE.CircleGeometry(0.019, 32, 0, Math.PI), new THREE.MeshPhysicalMaterial({ color: "#1f9a8a", roughness: 0.5 }));
  {
    // a point on the crown at elevation e, plus the crown's own tilt
    const e = 0.42, tilt = -0.12;
    const y0 = CAP.ry * Math.sin(e), z0 = CAP.rz * Math.cos(e);
    const ny = y0 / (CAP.ry * CAP.ry), nz = z0 / (CAP.rz * CAP.rz), na = Math.atan2(ny, nz);
    const y1 = y0 * Math.cos(tilt) - z0 * Math.sin(tilt), z1 = y0 * Math.sin(tilt) + z0 * Math.cos(tilt);
    const a = na - tilt;
    emb.position.set(CAP.x, CAP.y + y1 + Math.sin(a) * 0.0025, CAP.z + z1 + Math.cos(a) * 0.0025);
    emb.rotation.x = -a;
  }
  const emb2 = new THREE.Mesh(new THREE.CircleGeometry(0.019, 32, Math.PI, Math.PI), new THREE.MeshPhysicalMaterial({ color: "#1f1d2b", roughness: 0.5 }));
  emb2.position.copy(emb.position);
  emb2.rotation.copy(emb.rotation);
  emb.position.z += 0.0015;
  emb2.position.z += 0.0015;
  // band around the base
  const band = new THREE.Mesh(new THREE.TorusGeometry(1, 0.012, 8, 64), red);
  band.scale.set(CAP.rx * 1.0, CAP.rz * 1.0, 1);
  band.rotation.x = Math.PI / 2 - 0.12;
  band.position.set(CAP.x, CAP.y + 0.002, CAP.z);
  // brim: flattened half-ellipse in front, tilted slightly down
  const brimShape = new THREE.Shape();
  brimShape.absellipse(0, 0, CAP.rx * 0.93, CAP.rz * 0.5 + 0.072, Math.PI, Math.PI * 2, true);
  const brim = new THREE.Mesh(new THREE.ExtrudeGeometry(brimShape, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2, curveSegments: 32 }), red);
  brim.rotation.x = Math.PI / 2 + 0.16;
  brim.position.set(CAP.x, CAP.y + 0.006, CAP.z + CAP.rz * 0.5);
  // button
  const btn = new THREE.Mesh(new THREE.SphereGeometry(0.011, 12, 8), red);
  btn.position.set(CAP.x, CAP.y + CAP.ry * 0.99 - 0.002, CAP.z - 0.012);
  g.add(crown, front, emb, emb2, band, brim, btn);
  g.traverse((m) => m.isMesh && (m.castShadow = true));
  g.position.set(-NECK.x, -NECK.y, -NECK.z);
  return g;
}

/* -------------------------------------------------------------- build */
// Builds Pawan (model, materials, eyes, glasses, bracelet) without a renderer, so he can share a scene
// with other characters. update(dt, t, look, pose) runs the idle animation; pose adds per-bone offsets
// ({ hips, spine, neck, armL, armR: [x, y, z] radians }) on top of the idle so callers can strike a pose.
export async function buildHero(opts = {}) {
  // load the body
  const base = new URL(".", import.meta.url).href;
  const loader = opts.loader || new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath(base + "vendor/draco/"));
  const gltf = await loader.loadAsync(base + "models/hero/pawan.glb", opts.onProgress);
  const hero = gltf.scene;
  const bones = {};
  hero.traverse((o) => (bones[o.name] = o));

  const skin = new THREE.MeshPhysicalMaterial({
    color: "#a8704c",
    vertexColors: true,
    roughness: 0.5,
    sheen: 0.7,
    sheenRoughness: 0.45,
    sheenColor: new THREE.Color("#ff9070"),
    clearcoat: 0.08,
    clearcoatRoughness: 0.6,
  });
  const hair = hairStrands(
    new THREE.MeshPhysicalMaterial({
      color: "#16110f",
      roughness: 0.38,
      sheen: 1,
      sheenRoughness: 0.35,
      sheenColor: new THREE.Color("#5b5050"),
    }),
  );
  const beardM = hairStrands(new THREE.MeshPhysicalMaterial({ color: "#1b1512", roughness: 0.62, sheen: 0.6, sheenColor: new THREE.Color("#3a3230") }), 1.6);
  const pantsM = new THREE.MeshPhysicalMaterial({ color: "#26282e", roughness: 0.86, sheen: 0.8, sheenRoughness: 0.6, sheenColor: new THREE.Color("#5a5e6a") });
  const leather = new THREE.MeshPhysicalMaterial({ color: "#ffffff", vertexColors: true, roughness: 0.48, clearcoat: 0.35, clearcoatRoughness: 0.45 });
  const leatherPlain = new THREE.MeshPhysicalMaterial({ color: "#6b4328", roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.5 });
  const soleM = new THREE.MeshStandardMaterial({ color: "#2a211c", roughness: 0.8 });

  let shirtM = null;
  hero.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    const name = o.material.name;
    if (name === "skin") o.material = skin;
    else if (name === "hair") o.material = hair;
    else if (name === "beard") o.material = beardM;
    else if (name === "pants") o.material = pantsM;
    else if (name === "sole") o.material = soleM;
    else if (name === "leather") o.material = o.geometry.getAttribute("color") && o.name === "boots" ? leather : leatherPlain;
    else if (name === "shirt") {
      const geo = o.geometry;
      geo.setAttribute("aCS", geo.getAttribute("uv"));
      geo.setAttribute("aV", geo.getAttribute("uv1"));
      shirtM = shirtM || makeShirtMaterial(drawShirtPrint(opts.perimeter || 1.16));
      o.material = shirtM;
    }
  });

  // eyes, lids, glasses, bracelet
  const neck = bones.neck;
  const local = (x, y, z) => new THREE.Vector3(x - NECK.x, y - NECK.y, z - NECK.z);
  const eyeGeo = new THREE.SphereGeometry(EYE.r, 40, 28);
  eyeGeo.rotateX(Math.PI / 2); // pole faces forward
  const eyeMat = new THREE.MeshPhysicalMaterial({ map: eyeTexture(), roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.04 });
  const lidMat = skin.clone();
  lidMat.vertexColors = false;
  lidMat.color = new THREE.Color("#8f5d40");
  const eyes = [], lids = [];
  for (const s of [1, -1]) {
    const e = new THREE.Mesh(eyeGeo, eyeMat);
    e.position.copy(local(EYE.x * s, EYE.y, EYE.z));
    neck.add(e);
    eyes.push(e);
    // eyelid: a skin cap that rolls down over the eye to blink
    const lid = new THREE.Mesh(new THREE.SphereGeometry(EYE.r + 0.0009, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.5), lidMat);
    const piv = new THREE.Group();
    piv.position.copy(e.position);
    piv.add(lid);
    lid.rotation.x = -Math.PI * 0.5; // cap rotated up and back, hidden under the brow skin
    neck.add(piv);
    lids.push(lid);
  }

  // glasses
  const metal = new THREE.MeshPhysicalMaterial({ color: "#c7a46a", metalness: 1, roughness: 0.28 });
  const glassM = new THREE.MeshPhysicalMaterial({
    color: "#dfe9ef",
    metalness: 0,
    roughness: 0.04,
    transparent: true,
    opacity: 0.12,
    envMapIntensity: 2.2,
    depthWrite: false,
  });
  const glasses = new THREE.Group();
  const GZ = 0.1015, GY = 1.6705, GR = 0.0205;
  for (const s of [1, -1]) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(GR, 0.00125, 8, 64), metal);
    rim.scale.set(1.04, 0.86, 1);
    rim.position.set(0.0335 * s, GY, GZ - Math.abs(0.0335) * 0.06);
    rim.rotation.y = 0.08 * s;
    glasses.add(rim);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(GR, 48), glassM);
    lens.scale.copy(rim.scale);
    lens.position.copy(rim.position);
    lens.rotation.copy(rim.rotation);
    glasses.add(lens);
    const temple = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.0545 * s, GY + 0.002, GZ - 0.004),
      new THREE.Vector3(0.0715 * s, GY + 0.004, GZ - 0.016),
      new THREE.Vector3(0.081 * s, GY + 0.006, 0.05),
      new THREE.Vector3(0.0815 * s, GY + 0.004, 0.0),
      new THREE.Vector3(0.0795 * s, GY - 0.006, -0.022),
      new THREE.Vector3(0.074 * s, GY - 0.022, -0.03),
    ]);
    glasses.add(new THREE.Mesh(new THREE.TubeGeometry(temple, 40, 0.0011, 6), metal));
  }
  const bridge = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.0135, GY + 0.004, GZ + 0.0005),
    new THREE.Vector3(0, GY + 0.0075, GZ + 0.002),
    new THREE.Vector3(0.0135, GY + 0.004, GZ + 0.0005),
  ]);
  glasses.add(new THREE.Mesh(new THREE.TubeGeometry(bridge, 16, 0.0011, 6), metal));
  glasses.position.set(-NECK.x, -NECK.y, -NECK.z);
  glasses.traverse((o) => (o.castShadow = o.isMesh && o.material === metal));
  neck.add(glasses);

  // bead bracelet on the right wrist
  {
    const armR = bones.armR;
    const down = new THREE.Vector3(-WRIST.x, WRIST.y, WRIST.z).sub(new THREE.Vector3(-ELBOW.x, ELBOW.y, ELBOW.z)).normalize();
    const c = new THREE.Vector3(-WRIST.x, WRIST.y, WRIST.z).addScaledVector(down, -0.014);
    const b1 = new THREE.Vector3(1, 0, 0).cross(down).normalize(), b2 = down.clone().cross(b1).normalize();
    const cols = ["#c0392b", "#f1c40f", "#27ae60", "#111111", "#ecf0f1", "#2980b9", "#e67e22"];
    const beadGeo = new THREE.SphereGeometry(0.0052, 12, 10);
    const n = 15;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const p = c.clone().addScaledVector(b1, Math.cos(a) * 0.0305).addScaledVector(b2, Math.sin(a) * 0.0285);
      const bead = new THREE.Mesh(beadGeo, new THREE.MeshPhysicalMaterial({ color: cols[i % cols.length], roughness: 0.3, clearcoat: 0.6 }));
      bead.position.copy(p).sub(new THREE.Vector3(-SHOULDER.x, SHOULDER.y, SHOULDER.z));
      bead.castShadow = true;
      armR.add(bead);
    }
  }
  // brass rivets on the holster pouch
  {
    const brass = new THREE.MeshPhysicalMaterial({ color: "#d4a849", metalness: 1, roughness: 0.3 });
    const hips = bones.hips;
    const g = new THREE.SphereGeometry(0.0045, 12, 8);
    const r = new THREE.Mesh(g, brass);
    r.position.set(-0.205 - 0.0 - 0.0, 0.676 - 0.92, 0.03 + 0.052);
    hips.add(r);
    const buckle = new THREE.Mesh(new THREE.TorusGeometry(0.009, 0.0022, 6, 4), brass);
    buckle.position.set(-0.197, 0.705 - 0.92, 0.095);
    buckle.rotation.set(0, -0.35, Math.PI / 4);
    hips.add(buckle);
  }

  if (opts.cap) {
    neck.add(trainerCap(opts.cap));
    // the cap presses the hair down a little so none of it pokes through the crown
    const hairMesh = hero.getObjectByName("hair");
    if (hairMesh) hairMesh.scale.set(0.97, 0.9, 0.97);
  }

  const rig = new THREE.Group();
  rig.add(hero);

  const { hips, spine, armL, armR } = bones;
  const rest = {};
  for (const k of ["hips", "spine", "neck", "armL", "armR"]) rest[k] = bones[k].quaternion.clone();
  let nextBlink = 1.5, blinkT = -1;
  const eul = new THREE.Euler();
  const q = new THREE.Quaternion();
  const Z3 = [0, 0, 0];
  const poseBone = (b, x, y, z, add = Z3) => {
    eul.set(x + add[0], y + add[1], z + add[2]);
    b.quaternion.copy(rest[b.name]).multiply(q.setFromEuler(eul));
  };
  const update = (dt, t, look, pose = {}) => {
    const br = Math.sin(t * 1.55);
    poseBone(hips, 0, Math.sin(t * 0.35) * 0.015, Math.sin(t * 0.5) * 0.012, pose.hips);
    poseBone(spine, -0.012 + br * 0.008, Math.sin(t * 0.35 + 0.6) * -0.02, Math.sin(t * 0.5) * -0.016, pose.spine);
    spine.scale.set(1 + br * 0.004, 1 + br * 0.005, 1 + br * 0.008);
    poseBone(bones.neck, look.y * 0.16 + Math.sin(t * 0.7) * 0.015, look.x * 0.42 + Math.sin(t * 0.31) * 0.05, -look.x * 0.04, pose.neck);
    poseBone(armL, br * 0.012, 0, Math.sin(t * 0.8) * 0.012 + 0.01, pose.armL);
    poseBone(armR, br * 0.012, 0, -Math.sin(t * 0.8 + 0.7) * 0.012 - 0.01, pose.armR);
    for (const e of eyes) e.rotation.set(look.y * 0.25, look.x * 0.35, 0);
    // blink
    nextBlink -= dt;
    if (nextBlink <= 0 && blinkT < 0) blinkT = 0;
    let close = 0;
    if (blinkT >= 0) {
      blinkT += dt;
      close = Math.sin(Math.min(1, blinkT / 0.16) * Math.PI);
      if (blinkT > 0.16) {
        blinkT = -1;
        nextBlink = 2.2 + Math.random() * 3.2;
      }
    }
    for (const l of lids) l.rotation.x = -Math.PI * 0.5 + close * 1.25 + look.y * 0.12;
  };
  return { rig, hero, bones, eyes, lids, update };
}

/* -------------------------------------------------------------- mount */
export async function mountHero(host, opts = {}) {
  const view = opts.view || "full";
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.maxDpr || 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0);
  host.appendChild(renderer.domElement);
  const canvas = renderer.domElement;
  canvas.style.cssText = "width:100%;height:100%;display:block;touch-action:pan-y";

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;

  const camera = new THREE.PerspectiveCamera(20, 1, 0.05, 30);

  // lights: warm key, teal rim, cool sky fill
  const key = new THREE.DirectionalLight("#fff0dc", 2.7);
  key.position.set(1.6, 3.2, 2.6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -0.8;
  key.shadow.camera.right = 0.8;
  key.shadow.camera.top = 2.0;
  key.shadow.camera.bottom = -0.3;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 8;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.012;
  key.shadow.radius = 4;
  scene.add(key);
  const rim = new THREE.DirectionalLight("#8fe3ff", 3.2);
  rim.position.set(-2.2, 2.4, -2.4);
  scene.add(rim);
  const rim2 = new THREE.DirectionalLight("#ffd2a8", 1.4);
  rim2.position.set(2.4, 1.2, -2.0);
  scene.add(rim2);
  scene.add(new THREE.HemisphereLight("#d6ecff", "#8d7a62", 0.75));

  // ground: soft contact shadow only
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.ShadowMaterial({ opacity: 0.28 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 128;
    const g = cv.getContext("2d");
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, "rgba(20,16,24,0.55)");
    grd.addColorStop(0.5, "rgba(20,16,24,0.22)");
    grd.addColorStop(1, "rgba(20,16,24,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    const blob = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.55),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false }),
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.002;
    scene.add(blob);
  }
  const H = await buildHero(opts);
  const { rig, bones } = H;
  scene.add(rig);
  const baseYaw = opts.yaw ?? 0.32;
  rig.rotation.y = baseYaw;

  // camera framing
  const frame = () => {
    const w = host.clientWidth || 1, h = host.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    if (view === "face") {
      camera.fov = 14;
      camera.position.set(0, 1.66, 1.05);
      camera.lookAt(0, 1.66, 0);
    } else if (view === "torso") {
      camera.fov = 18;
      camera.position.set(0, 1.25, 2.6);
      camera.lookAt(0, 1.2, 0);
    } else {
      // fit full body with a little headroom; height ~ 1.95 world units visible
      const fitH = 2.05;
      const dist = fitH / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const d = Math.max(dist, (0.9 / camera.aspect) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
      camera.position.set(0, 1.05, d);
      camera.lookAt(0, 0.93, 0);
    }
    camera.updateProjectionMatrix();
  };
  frame();
  const ro = new ResizeObserver(frame);
  ro.observe(host);

  // interaction: drag to spin, head/eyes follow the pointer
  let spin = 0, spinV = 0, dragging = false, lastX = 0;
  const look = new THREE.Vector2(0, 0), lookT = new THREE.Vector2(0, 0);
  canvas.addEventListener("pointerdown", (e) => {
    dragging = true;
    lastX = e.clientX;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    spinV = dx * 0.012;
    spin += spinV;
  });
  const end = () => (dragging = false);
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  const onMove = (e) => {
    const r = canvas.getBoundingClientRect();
    // head position on screen is roughly at the top-centre of the canvas
    const hx = r.left + r.width * 0.5, hy = r.top + r.height * 0.16;
    lookT.set(THREE.MathUtils.clamp((e.clientX - hx) / (window.innerWidth * 0.5), -1, 1), THREE.MathUtils.clamp((e.clientY - hy) / (window.innerHeight * 0.6), -1, 1));
  };
  window.addEventListener("pointermove", onMove);

  // idle animation
  const clock = new THREE.Clock();
  let running = true, raf = 0, visible = true;
  const tick = () => {
    raf = running ? requestAnimationFrame(tick) : 0;
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
    look.lerp(lookT, 1 - Math.exp(-dt * 4));
    H.update(dt, t, look);
    // spin and settle
    if (!dragging) {
      spinV *= Math.exp(-dt * 3);
      spin += spinV;
      spin *= Math.exp(-dt * (Math.abs(spinV) < 0.002 ? 1.2 : 0));
    }
    rig.rotation.y = baseYaw + spin;
    renderer.render(scene, camera);
  };
  tick();

  return {
    renderer,
    scene,
    camera,
    rig,
    bones,
    setVisible(v) {
      if (v === visible) return;
      visible = v;
      running = v;
      if (v && !raf) {
        clock.getDelta();
        tick();
      }
    },
    dispose() {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      renderer.dispose();
      canvas.remove();
    },
  };
}
