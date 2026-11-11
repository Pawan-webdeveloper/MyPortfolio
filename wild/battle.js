// Boss battles for Pawan World — your three Pokémon vs one region boss, in an arena.
//
//   challenge  walk up to a boss and press E (or the gold button on phones) → Challenge card
//   loading    a VS screen while the arena and the models load
//   arena      its own THREE.Scene (index.html renders it instead of the world while you fight)
//   fight      move with WASD / the stick, SPACE (or DODGE) rolls through attacks with
//              invincibility frames, 1–4 (or the move buttons) use moves, Q / Tab / the party
//              cards switch Pokémon, Esc runs away. Every boss attack is telegraphed on the ground.
//   result     beat it and the boss is gone from its lair for good (wild.defeatBoss); lose and
//              your team is healed back at the lair, the boss still waiting.
//
// Data and damage math live in wild/combat.js (real moves, real type chart).
import * as THREE from "three";
import { PARTY, bossStats, playerHit, bossHit, effectLabel, TYPE_COLORS, clamp } from "./combat.js";
import { REGIONS, SINK } from "./roster.js";

const TAU = Math.PI * 2;
const BATTLE_SONG = "Clash of Paper";
const damp = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt));
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const mtof = (n) => 440 * Math.pow(2, (n - 69) / 12);
const rr = (a, b) => a + Math.random() * (b - a);
const cap = (s) => s[0].toUpperCase() + s.slice(1);

const THEMES = {
  town: { ground: "#eadbb9", ring: "#d8c49a", sky: "#cfe6f2" },
  field: { ground: "#c3e07f", ring: "#a9cc63", sky: "#d6eef7" },
  forest: { ground: "#86c06b", ring: "#6aa452", sky: "#cfe8de" },
  meadow: { ground: "#f3cfe0", ring: "#e9b5cd", sky: "#f3e3f0" },
  grove: { ground: "#f6d6de", ring: "#ecbcc8", sky: "#fbe7ec" },
  mountain: { ground: "#dcd7e8", ring: "#c4bdd6", sky: "#e3e6f3" },
  lake: { ground: "#57b9cc", ring: "#3f9fb4", sky: "#d4eef5", water: true },
};

/* boss attack shapes: windup (telegraph) seconds and reach, scaled by the boss's size */
const SHAPE = {
  swipe: { wind: 0.5, reach: 6.5, arc: 1.05 },
  slam: { wind: 0.75, reach: 7.5 },
  dash: { wind: 0.65, len: 28, speed: 36 },
  beam: { wind: 0.8, len: 46, width: 3.4, dur: 0.4 },
  volley: { wind: 0.55, shots: 3, gap: 0.16, speed: 21 },
  rain: { wind: 0.9, n: 3, radius: 3.4 },
};

/* Hard mode: bosses hit hard, attack often, chain attacks when enraged and sidestep your moves.
   Everything stays fair because every boss attack is telegraphed and leaves an opening after it. */
const HARD = { evade: 0.45, evadeEnraged: 0.65, evadeCd: 1.8, gap: [0.15, 0.5], chain: 0.5, track: 0.8, echo: 0.35, echoEnraged: 0.6, regen: 1.5 };

export function createBattle(ctx) {
  const { camera, game, car, keys, A, SONGS, toast } = ctx;
  const wild = () => ctx.wild();
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const touch = () => document.body.classList.contains("touch");

  /* ================= arena scene ================= */
  const scene = new THREE.Scene();
  const hemi = new THREE.HemisphereLight(0xffffff, 0x9a90b8, 1.15);
  const sun = new THREE.DirectionalLight(0xfff3df, 2.1);
  sun.position.set(-30, 60, 25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 200 });
  scene.add(hemi, sun, sun.target);
  const world = new THREE.Group(); // rebuilt for every fight (theme, size)
  scene.add(world);
  let R = 32; // arena radius

  const decalMat = (col, op) => new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide });
  function pokeballTex() {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d");
    g.strokeStyle = "rgba(31,29,43,.55)";
    g.lineWidth = 9;
    g.beginPath();
    g.arc(128, 128, 112, 0, TAU);
    g.moveTo(16, 128);
    g.lineTo(88, 128);
    g.moveTo(168, 128);
    g.lineTo(240, 128);
    g.stroke();
    g.beginPath();
    g.arc(128, 128, 38, 0, TAU);
    g.stroke();
    g.fillStyle = "rgba(214,69,47,.18)";
    g.beginPath();
    g.arc(128, 128, 108, Math.PI, 0);
    g.fill();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  const ballTex = pokeballTex();
  let crowd = null,
    flags = [];
  function buildArena(theme, bossH, types) {
    for (const o of [...world.children]) {
      world.remove(o);
      o.traverse((q) => {
        if (q.geometry) q.geometry.dispose();
      });
    }
    R = 34 + Math.min(8, bossH * 0.6);
    scene.background = new THREE.Color(theme.sky);
    scene.fog = new THREE.Fog(theme.sky, R + 40, R + 170);
    const outer = new THREE.Mesh(new THREE.CircleGeometry(R + 90, 64).rotateX(-Math.PI / 2), ctx.toon(theme.water ? "#9fd9e2" : theme.ring));
    outer.position.y = -0.05;
    outer.receiveShadow = true;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(R, 72).rotateX(-Math.PI / 2), ctx.toon(theme.ground));
    floor.receiveShadow = true;
    const edge = new THREE.Mesh(new THREE.RingGeometry(R - 0.5, R, 96).rotateX(-Math.PI / 2), decalMat("#1f1d2b", 0.75));
    edge.position.y = 0.02;
    const mid = new THREE.Mesh(new THREE.RingGeometry(R * 0.32 - 0.25, R * 0.32, 72).rotateX(-Math.PI / 2), decalMat("#1f1d2b", 0.3));
    mid.position.y = 0.02;
    const ball = new THREE.Mesh(new THREE.CircleGeometry(7, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: ballTex, transparent: true, depthWrite: false }));
    ball.position.y = 0.03;
    // low paper wall with posts
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(R + 2.5, R + 2.5, 1.6, 72, 1, true), ctx.toon("#fbf8ef", { side: THREE.DoubleSide }));
    wall.position.y = 0.8;
    wall.castShadow = wall.receiveShadow = true;
    world.add(outer, floor, edge, mid, ball, wall);
    // stands + crowd (instanced paper cut-outs that cheer on big hits)
    const N = 150,
      body = new THREE.BoxGeometry(0.9, 1.7, 0.5);
    crowd = new THREE.InstancedMesh(body, ctx.toon("#ffffff"), N);
    crowd.castShadow = true;
    crowd.userData.base = [];
    const cols = ["#d6452f", "#3a5bd9", "#f2c230", "#1fb5a8", "#7b3fe4", "#e0418f", "#fbf8ef", "#5cc46a"],
      M = new THREE.Matrix4(),
      C = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const tier = i % 3,
        a = (i / N) * TAU + tier * 0.07,
        r = R + 6 + tier * 2.6,
        y = 0.85 + tier * 1.3;
      crowd.userData.base.push([Math.cos(a) * r, y, Math.sin(a) * r, a, Math.random() * TAU]);
      M.makeRotationY(-a + Math.PI / 2).setPosition(Math.cos(a) * r, y, Math.sin(a) * r);
      crowd.setMatrixAt(i, M);
      crowd.setColorAt(i, C.set(cols[i % cols.length]));
    }
    const stands = new THREE.Mesh(new THREE.CylinderGeometry(R + 13, R + 5, 4, 72, 1, true), ctx.toon("#efe6d2", { side: THREE.DoubleSide }));
    stands.position.y = 1.2;
    stands.receiveShadow = true;
    world.add(stands, crowd);
    // banner poles in the boss's colours
    flags = [];
    const pole = new THREE.CylinderGeometry(0.12, 0.12, 9, 6),
      flag = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(2.6, -0.7, 0), new THREE.Vector3(0, -1.6, 0)]);
    flag.computeVertexNormals();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU,
        x = Math.cos(a) * (R + 16), // behind the stands: never between the camera and the fight
        z = Math.sin(a) * (R + 16);
      const p = new THREE.Mesh(pole, ctx.toon("#3a3550"));
      p.position.set(x, 6.5, z);
      p.scale.y = 1.5;
      const f = new THREE.Mesh(flag, ctx.toon(TYPE_COLORS[types[i % types.length]] || "#d6452f", { side: THREE.DoubleSide }));
      f.position.set(x, 13, z);
      f.scale.setScalar(1.6);
      f.rotation.y = -a;
      flags.push(f);
      world.add(p, f);
    }
    sun.shadow.camera.left = sun.shadow.camera.bottom = -(R + 15);
    sun.shadow.camera.right = sun.shadow.camera.top = R + 15;
    sun.shadow.camera.updateProjectionMatrix();
  }

  /* ---------- particles: colour, size and opacity change over each particle's life, so fire
     cools from yellow to red to smoke and swells as it rises, water sprays and falls, wisps shrink ---------- */
  const dotTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d"),
      gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.35, "rgba(255,255,255,.9)");
    gr.addColorStop(0.7, "rgba(255,255,255,.35)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const _c = new THREE.Color(),
    _c2 = new THREE.Color();
  const PN = 2600,
    PSIZE = 1.3; // every particle is drawn this much bigger than its nominal size
  const ps = {
    i: 0,
    pos: new Float32Array(PN * 3).fill(-9999),
    col: new Float32Array(PN * 3),
    size: new Float32Array(PN),
    alpha: new Float32Array(PN),
    vel: new Float32Array(PN * 3),
    life: new Float32Array(PN),
    max: new Float32Array(PN),
    c0: new Float32Array(PN * 3),
    c1: new Float32Array(PN * 3),
    s0: new Float32Array(PN),
    s1: new Float32Array(PN),
    grav: new Float32Array(PN),
    drag: new Float32Array(PN),
    a: new Float32Array(PN),
  };
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(ps.pos, 3));
  pGeo.setAttribute("color", new THREE.BufferAttribute(ps.col, 3));
  pGeo.setAttribute("aSize", new THREE.BufferAttribute(ps.size, 1));
  pGeo.setAttribute("aAlpha", new THREE.BufferAttribute(ps.alpha, 1));
  const pMat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: dotTex }, uScale: { value: 600 } },
    vertexShader: `attribute float aSize; attribute float aAlpha; attribute vec3 color; uniform float uScale; varying vec3 vC; varying float vA;
      void main(){ vC = color; vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D uMap; varying vec3 vC; varying float vA;
      void main(){ float m = texture2D(uMap, gl_PointCoord).a; float a = m * vA; if (a < 0.02) discard;
        // hot centre, darker rim: every puff keeps a readable edge on the pale arena floor
        vec3 c = mix(vC * 0.62, vC, smoothstep(0.3, 0.75, m)); c = mix(c, vec3(1.0), smoothstep(0.93, 1.0, m) * 0.35);
        gl_FragColor = vec4(c, min(1.0, a * 1.25)); }`,
    transparent: true,
    depthWrite: false,
  });
  const points = new THREE.Points(pGeo, pMat);
  points.frustumCulled = false;
  points.renderOrder = 4;
  scene.add(points);
  /** one particle: colour c0→c1, size s0→s1 over `life` seconds */
  function emit(x, y, z, vx, vy, vz, c0, c1, s0, s1, life, grav = 0, drag = 0, alpha = 1) {
    const i = ps.i++ % PN,
      j = i * 3;
    ps.pos[j] = x;
    ps.pos[j + 1] = y;
    ps.pos[j + 2] = z;
    ps.vel[j] = vx;
    ps.vel[j + 1] = vy;
    ps.vel[j + 2] = vz;
    _c.set(c0);
    ps.c0[j] = _c.r;
    ps.c0[j + 1] = _c.g;
    ps.c0[j + 2] = _c.b;
    _c.set(c1);
    ps.c1[j] = _c.r;
    ps.c1[j + 1] = _c.g;
    ps.c1[j + 2] = _c.b;
    ps.s0[i] = s0 * PSIZE;
    ps.s1[i] = s1 * PSIZE;
    ps.life[i] = ps.max[i] = life;
    ps.grav[i] = grav;
    ps.drag[i] = drag;
    ps.a[i] = alpha;
  }
  function updParticles(dt) {
    const cv = document.getElementById("c");
    pMat.uniforms.uScale.value = (cv ? cv.height : innerHeight) * 0.83;
    for (let i = 0; i < PN; i++) {
      if (ps.life[i] <= 0) continue;
      const j = i * 3;
      ps.life[i] -= dt;
      if (ps.life[i] <= 0) {
        ps.pos[j + 1] = -9999;
        ps.alpha[i] = 0;
        continue;
      }
      const k = 1 - ps.life[i] / ps.max[i];
      ps.vel[j + 1] -= ps.grav[i] * dt;
      if (ps.drag[i]) {
        const d = Math.exp(-ps.drag[i] * dt);
        ps.vel[j] *= d;
        ps.vel[j + 1] *= d;
        ps.vel[j + 2] *= d;
      }
      ps.pos[j] += ps.vel[j] * dt;
      ps.pos[j + 1] = Math.max(0.04, ps.pos[j + 1] + ps.vel[j + 1] * dt);
      ps.pos[j + 2] += ps.vel[j + 2] * dt;
      ps.col[j] = ps.c0[j] + (ps.c1[j] - ps.c0[j]) * k;
      ps.col[j + 1] = ps.c0[j + 1] + (ps.c1[j + 1] - ps.c0[j + 1]) * k;
      ps.col[j + 2] = ps.c0[j + 2] + (ps.c1[j + 2] - ps.c0[j + 2]) * k;
      ps.size[i] = ps.s0[i] + (ps.s1[i] - ps.s0[i]) * k;
      ps.alpha[i] = ps.a[i] * Math.min(1, k * 10) * (1 - k * k);
    }
    for (const n of ["position", "color", "aSize", "aAlpha"]) pGeo.attributes[n].needsUpdate = true;
  }
  const rv = () => rr(-1, 1);
  /* generic sparks (kept for dust, dodge rolls, small hits) */
  function burst(x, y, z, col, n = 14, speed = 7, up = 3, life = 0.7) {
    for (let k = 0; k < n; k++) {
      const l = Math.hypot(1, 1, 1),
        vx = (rv() / l) * rr(speed * 0.5, speed * 1.4),
        vy = (rr(-0.6, 1) / l) * rr(speed * 0.5, speed * 1.4) + up,
        vz = (rv() / l) * rr(speed * 0.5, speed * 1.4);
      emit(x, y, z, vx, vy, vz, Math.random() < 0.3 ? "#ffffff" : col, col, 0.45, 0.1, life * rr(0.6, 1.2), 9, 0.5);
    }
  }
  function puff(x, y, z, col, n = 10, speed = 4, life = 0.6, grav = -1.5) {
    for (let k = 0; k < n; k++) emit(x, y, z, rv() * speed, rr(-0.2, 1) * speed, rv() * speed, col, col, 0.7, 1.9, life * rr(0.7, 1.2), grav, 2.5, 0.75);
  }
  const dust = (x, z, n = 8, speed = 4) => {
    for (let k = 0; k < n; k++) emit(x + rv() * 0.5, 0.25, z + rv() * 0.5, rv() * speed, rr(0.5, 2), rv() * speed, "#efe6d2", "#d8c9a8", 0.6, 1.8, rr(0.4, 0.8), -0.5, 3, 0.6);
  };

  /* ---------- the elements: what each type's energy looks like ---------- */
  const fireP = (x, y, z, vx, vy, vz, sc = 1, life = 0.6) => {
    // flame body: yellow → deep orange-red, swelling as it rises
    emit(x, y, z, vx, vy, vz, "#ffd83a", "#e2300a", 0.7 * sc, 1.9 * sc, life * rr(0.5, 0.9), -5, 1.8);
    // white-hot heart
    if (Math.random() < 0.55) emit(x, y, z, vx * 1.05, vy, vz * 1.05, "#fffbe0", "#ffae1a", 0.45 * sc, 0.8 * sc, life * rr(0.35, 0.6), -4, 1.8);
    // smoke left behind
    if (Math.random() < 0.3) emit(x, y, z, vx * 0.55, vy + 1.5, vz * 0.55, "#b3532a", "#3a3338", 0.9 * sc, 2.6 * sc, life * rr(1.1, 1.7), -4, 1.6, 0.5);
  };
  const waterP = (x, y, z, vx, vy, vz, sc = 1, life = 0.6) => {
    emit(x, y, z, vx, vy, vz, "#bfeaff", "#2a78e0", 0.62 * sc, 0.3 * sc, life * rr(0.6, 1.1), 16, 0.3, 0.95);
    if (Math.random() < 0.3) emit(x, y, z, vx * 0.8, vy + 1, vz * 0.8, "#ffffff", "#9fd2f5", 0.5 * sc, 1.3 * sc, life * rr(0.5, 0.8), 3, 2, 0.6); // spray
  };
  const sparkP = (x, y, z, vx, vy, vz, sc = 1, life = 0.35) => emit(x, y, z, vx, vy, vz, "#fffbe0", "#ffc21a", 0.42 * sc, 0.06, life * rr(0.5, 1.1), 10, 1.5);
  const wispP = (x, y, z, vx, vy, vz, sc = 1, life = 0.7, c0 = "#a678ff", c1 = "#160b22") => emit(x, y, z, vx, vy, vz, c0, c1, 1.25 * sc, 0.15, life * rr(0.6, 1.1), -1.5, 2.2, 0.9);
  const gloopP = (x, y, z, vx, vy, vz, sc = 1, life = 0.7) => emit(x, y, z, vx, vy, vz, "#d58cff", "#6a1fa8", 0.65 * sc, 0.42 * sc, life * rr(0.6, 1.1), 14, 0.4);
  const windP = (x, y, z, vx, vy, vz, sc = 1, life = 0.4) => emit(x, y, z, vx, vy, vz, "#e6efff", "#8fb0ee", 0.5 * sc, 1.3 * sc, life * rr(0.6, 1), 0, 2.5, 0.6);
  function elemP(type) {
    switch (type) {
      case "fire": return fireP;
      case "water": case "ice": return waterP;
      case "electric": return sparkP;
      case "ghost": return wispP;
      case "dark": return (x, y, z, vx, vy, vz, sc, life) => wispP(x, y, z, vx, vy, vz, sc, life, "#6a5a8a", "#0c0814");
      case "psychic": return (x, y, z, vx, vy, vz, sc, life) => wispP(x, y, z, vx, vy, vz, sc, life, "#ff8fe4", "#a01f8f");
      case "fairy": return (x, y, z, vx, vy, vz, sc, life) => wispP(x, y, z, vx, vy, vz, sc, life, "#ffc4ea", "#f0569f");
      case "dragon": return (x, y, z, vx, vy, vz, sc = 1, life = 0.6) => emit(x, y, z, vx, vy, vz, "#b9a8ff", "#4a2fd6", 0.65 * sc, 1.7 * sc, life * rr(0.5, 0.9), -4, 1.8);
      case "poison": return gloopP;
      case "flying": case "normal": return windP;
      case "grass": case "bug": return (x, y, z, vx, vy, vz, sc = 1, life = 0.6) => emit(x, y, z, vx, vy, vz, "#c8f06a", "#2f8a3c", 0.5 * sc, 0.3 * sc, life * rr(0.6, 1.1), 6, 1.2);
      default: {
        const col = TYPE_COLORS[type] || "#ffffff"; // rock, ground, steel, fighting: chunky debris
        return (x, y, z, vx, vy, vz, sc = 1, life = 0.6) => emit(x, y, z, vx, vy, vz, col, col, 0.55 * sc, 0.32 * sc, life * rr(0.6, 1.1), 14, 0.4);
      }
    }
  }
  /** an explosion of a type's energy where a hit lands */
  function elemBurst(type, x, y, z, power = 1) {
    const P_ = elemP(type),
      n = Math.round(20 * power);
    for (let k = 0; k < n; k++) {
      const sp = rr(3, 9) * (0.7 + power * 0.3);
      P_(x, y, z, rv() * sp, rr(-0.3, 1.2) * sp, rv() * sp, 0.8 + power * 0.3, 0.6);
    }
    if (type === "electric") for (let k = 0; k < 8; k++) sparkP(x, y, z, rv() * 14, rr(0, 12), rv() * 14, 1.2, 0.3);
    if (type === "water" || type === "ice") for (let k = 0; k < 10 * power; k++) waterP(x, y, z, rv() * 6, rr(4, 10), rv() * 6, 1, 0.8);
  }

  /* ---------- light from the attacks: a hit lights up the fighters for an instant ---------- */
  const flash = new THREE.PointLight(0xffffff, 0, 34, 1.6);
  scene.add(flash);
  function flashAt(x, y, z, col, power = 1) {
    flash.color.set(col);
    flash.position.set(x, y, z);
    flash.intensity = Math.max(flash.intensity, 70 * Math.min(2, power));
  }

  /* ---------- telegraph decals (outline + filling interior shows the timing) ---------- */
  const decals = [];
  const DANGER = "#e0362a";
  function decal(kind, opts) {
    let geo, rimPts;
    if (kind === "circle") {
      geo = new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2);
      rimPts = Array.from({ length: 49 }, (_, i) => new THREE.Vector3(Math.cos((i / 48) * TAU), 0, Math.sin((i / 48) * TAU)));
    } else if (kind === "sector") {
      geo = new THREE.CircleGeometry(1, 32, Math.PI / 2 - opts.arc, opts.arc * 2).rotateX(-Math.PI / 2);
      rimPts = [new THREE.Vector3(0, 0, 0)];
      for (let i = 0; i <= 24; i++) {
        const a = Math.PI / 2 - opts.arc + (i / 24) * opts.arc * 2;
        rimPts.push(new THREE.Vector3(Math.cos(a), 0, -Math.sin(a)));
      }
      rimPts.push(new THREE.Vector3(0, 0, 0));
    } else {
      geo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0).rotateX(-Math.PI / 2); // rect along −Z
      rimPts = [[-0.5, 0], [0.5, 0], [0.5, -1], [-0.5, -1], [-0.5, 0]].map(([x, z]) => new THREE.Vector3(x, 0, z));
    }
    const base = new THREE.Mesh(geo, decalMat(DANGER, 0.14)),
      fill = new THREE.Mesh(geo, decalMat(DANGER, 0.3)),
      rim = new THREE.Line(new THREE.BufferGeometry().setFromPoints(rimPts), new THREE.LineBasicMaterial({ color: DANGER, transparent: true, opacity: 0.95, depthWrite: false }));
    const g = new THREE.Group();
    g.add(base, fill, rim);
    base.renderOrder = fill.renderOrder = rim.renderOrder = 2;
    g.position.set(opts.x, 0.06 + decals.length * 0.004, opts.z);
    g.rotation.y = opts.rot || 0;
    if (kind === "rect") g.scale.set(opts.w, 1, opts.len);
    else g.scale.setScalar(opts.r);
    const d = { g, fill, kind, t: 0, dur: opts.dur, geo, rimGeo: rim.geometry };
    fill.scale.set(kind === "rect" ? 1 : 0.01, 1, 0.01);
    scene.add(g);
    decals.push(d);
    return d;
  }
  function killDecal(d) {
    scene.remove(d.g);
    d.geo.dispose();
    d.rimGeo.dispose();
    d.g.children.forEach((c) => c.material.dispose());
    const i = decals.indexOf(d);
    if (i >= 0) decals.splice(i, 1);
  }
  function updDecals(dt) {
    for (const d of [...decals]) {
      d.t += dt;
      const k = clamp(d.t / d.dur, 0, 1);
      if (d.kind === "rect") d.fill.scale.set(1, 1, Math.max(0.01, k));
      else d.fill.scale.setScalar(Math.max(0.01, k));
      // flashes brighter in the last fifth: "it lands NOW"
      d.fill.material.opacity = k > 0.8 ? 0.5 + Math.sin(d.t * 50) * 0.12 : 0.26 + k * 0.14;
      if (d.t > d.dur + 0.08) killDecal(d);
    }
  }

  /* ---------- short-lived visuals: beams, flame streams, lightning, slashes, shockwaves ---------- */
  const fx = [];
  function addFx(mesh, life, upd) {
    scene.add(mesh);
    const f = { mesh, life, t: 0, upd, dt: 0 };
    fx.push(f);
    return f;
  }
  function updFx(dt) {
    flash.intensity *= Math.exp(-16 * dt);
    for (const f of [...fx]) {
      f.t += dt;
      f.dt = dt;
      if (f.upd) f.upd(f, Math.min(1, f.t / f.life));
      if (f.t >= f.life) {
        scene.remove(f.mesh);
        f.mesh.traverse((q) => {
          if (q.geometry && !q.geometry.userData.shared) q.geometry.dispose();
          if (q.material) q.material.dispose();
        });
        fx.splice(fx.indexOf(f), 1);
      }
    }
  }
  const glowMat = (col, op = 0.85) => new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide });
  const _v = new THREE.Vector3();

  /** a beam of energy from (x,y,z) to (tx,ty,tz): it shoots out, pulses, streams particles along
   *  itself and splashes where it ends (Hydro Pump, Flash Cannon, Dragon Pulse…) */
  function beamFx(x, y, z, tx, ty, tz, width, type, life = 0.45) {
    const col = TYPE_COLORS[type],
      len = Math.hypot(tx - x, ty - y, tz - z),
      g = new THREE.Group(),
      mk = (r, c, o) => new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.7, 1, 14, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5), glowMat(c, o)),
      outer = mk(width / 2, col, 0.45),
      mid = mk(width / 3.2, col, 0.75),
      core = mk(width / 7, "#ffffff", 0.95);
    g.add(outer, mid, core);
    g.position.set(x, y, z);
    g.lookAt(tx, ty, tz);
    const dx = (tx - x) / len,
      dy = (ty - y) / len,
      dz = (tz - z) / len,
      P_ = elemP(type);
    addFx(g, life, (f, k) => {
      const reach = Math.min(1, k * 7), // shoots out in the first 15%
        fade = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1,
        pulse = 1 + Math.sin(f.t * 55) * 0.12;
      g.scale.set(pulse * fade, pulse * fade, len * reach);
      outer.material.opacity = 0.45 * fade;
      mid.material.opacity = 0.75 * fade;
      core.material.opacity = 0.95 * fade;
      // material streaming along the beam, and spraying off where it lands
      for (let i = 0; i < 5; i++) {
        const a = Math.random() * len * reach;
        P_(x + dx * a + rv() * width * 0.3, y + dy * a + rv() * width * 0.3, z + dz * a + rv() * width * 0.3, dx * 30 + rv() * 2, dy * 30 + rr(0, 2), dz * 30 + rv() * 2, 0.7, 0.3);
      }
      if (reach >= 1) for (let i = 0; i < 4; i++) P_(tx, ty, tz, rv() * 8 - dx * 4, rr(1, 9), rv() * 8 - dz * 4, 1, 0.5);
      flashAt(tx, ty + 1, tz, col, 0.5 * fade);
    });
  }
  /** a jet of flame (or breath of any element) from the mouth: hundreds of particles that cool and
   *  swell as they travel, for `life` seconds */
  function streamFx(type, life, from, to, range, arc) {
    const P_ = elemP(type),
      col = TYPE_COLORS[type];
    addFx(new THREE.Group(), life, (f) => {
      const [x, y, z] = from(),
        [tx, ty, tz] = to(),
        d = Math.hypot(tx - x, ty - y, tz - z) || 1,
        dx = (tx - x) / d,
        dy = (ty - y) / d,
        dz = (tz - z) / d,
        sp = 26,
        n = Math.max(6, Math.round(f.dt * 620));
      for (let i = 0; i < n; i++) {
        const s1 = rv() * arc * sp * 0.55,
          s2 = rv() * arc * sp * 0.4;
        // sideways spread across the jet (perpendicular to its direction in the ground plane) + a little up/down
        P_(x, y, z, dx * sp * rr(0.8, 1.15) - dz * s1, dy * sp + s2 + 1, dz * sp * rr(0.8, 1.15) + dx * s1, 1.35, Math.min(range, d + 2) / sp);
      }
      flashAt(x + dx * 3, y + 1, z + dz * 3, col, 0.45);
    });
  }
  /** a ring racing outwards along the ground, kicking up dust */
  function ringFx(x, y, z, r, col, life = 0.45) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 64).rotateX(-Math.PI / 2), glowMat(col, 0.9)),
      m2 = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 64).rotateX(-Math.PI / 2), glowMat("#ffffff", 0.5));
    const g = new THREE.Group();
    g.add(m, m2);
    g.position.set(x, y, z);
    let last = 0;
    addFx(g, life, (f, k) => {
      const e = 1 - (1 - k) * (1 - k),
        rad = 0.3 + r * e;
      g.scale.setScalar(rad);
      m.material.opacity = 0.9 * (1 - k);
      m2.material.opacity = 0.5 * (1 - k);
      if (rad - last > 1.2 && y < 1) {
        last = rad;
        for (let a = 0; a < TAU; a += TAU / 14) emit(x + Math.cos(a) * rad, 0.3, z + Math.sin(a) * rad, Math.cos(a) * 3, rr(1, 3), Math.sin(a) * 3, "#efe6d2", "#cdbd9a", 0.7, 2, 0.5, -0.5, 2.5, 0.5);
      }
    });
  }
  /** a dark circle burnt (or splashed) onto the floor that fades over a few seconds */
  const scorchTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d"),
      gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    gr.addColorStop(0, "rgba(255,255,255,.85)");
    gr.addColorStop(0.55, "rgba(255,255,255,.55)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  function scorch(x, z, r, col = "#2a2228", life = 4) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: scorchTex, color: col, transparent: true, opacity: 0.6, depthWrite: false }));
    m.position.set(x, 0.045, z);
    m.scale.setScalar(r);
    m.renderOrder = 1;
    addFx(m, life, (f, k) => (m.material.opacity = 0.6 * (1 - k * k)));
  }
  // claw marks / a blade's arc: upright crescents sweeping across the target
  function slashFx(x, y, z, hd, r, col, tilt = 0.7, claws = 1) {
    const g = new THREE.Group(),
      arcs = [];
    for (let i = 0; i < claws; i++) {
      const off = (i - (claws - 1) / 2) * r * 0.34,
        outer = new THREE.Mesh(new THREE.RingGeometry(r * 0.82, r, 28, 1, 0.2 * Math.PI, 0.6 * Math.PI), glowMat(col, 0.95)),
        core = new THREE.Mesh(new THREE.RingGeometry(r * 0.88, r * 0.95, 28, 1, 0.24 * Math.PI, 0.52 * Math.PI), glowMat("#ffffff", 0.95));
      outer.material.depthTest = core.material.depthTest = false;
      outer.renderOrder = core.renderOrder = 8;
      outer.position.y = core.position.y = off;
      g.add(outer, core);
      arcs.push(outer, core);
    }
    g.position.set(x, y - r * 0.4, z);
    addFx(g, 0.2, (f, k) => {
      g.rotation.set(0, hd, tilt + 1 - k * 2, "YXZ");
      for (const a of arcs) a.material.opacity = 0.95 * (1 - k * k);
    });
  }
  const sparkGeo = (() => {
    const sh = new THREE.Shape();
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU + Math.PI / 2,
        r = k % 2 ? 0.16 : 0.75;
      k ? sh.lineTo(Math.cos(a) * r, Math.sin(a) * r) : sh.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const g = new THREE.ShapeGeometry(sh);
    g.userData.shared = true; // reused by every impact: never disposed
    return g;
  })();
  // a small hit spark that faces the camera
  function impactFx(x, y, z, col, size = 3.5) {
    const g = new THREE.Group(),
      ring = new THREE.Mesh(new THREE.RingGeometry(0.78, 1, 28), glowMat(col, 0.9)),
      star = new THREE.Mesh(sparkGeo, glowMat("#ffffff", 0.95));
    ring.material.depthTest = star.material.depthTest = false;
    ring.renderOrder = star.renderOrder = 8;
    g.add(ring, star);
    g.position.set(x, y, z);
    g.lookAt(camera.position);
    addFx(g, 0.2, (f, k) => {
      ring.scale.setScalar(0.3 + k * size * 0.4);
      star.scale.setScalar((1 - k) * size * 0.45);
      star.rotation.z = k * 1.5;
      ring.material.opacity = 0.9 * (1 - k);
      star.material.opacity = 0.95 * (1 - k);
    });
  }
  /** something falling from the sky onto a marked circle, trailing its element */
  function meteorFx(x, z, type, dur) {
    const col = TYPE_COLORS[type],
      P_ = elemP(type),
      g = new THREE.Group(),
      core = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 10), glowMat("#ffffff", 0.95)),
      halo = new THREE.Mesh(new THREE.SphereGeometry(1.5, 12, 10), glowMat(col, 0.5));
    g.add(core, halo);
    const sx = x + rr(-6, 6),
      sz = z + rr(-6, 6),
      sy = 42;
    addFx(g, dur, (f, k) => {
      const e = k * k;
      g.position.set(sx + (x - sx) * e, sy - (sy - 0.8) * e, sz + (z - sz) * e);
      for (let i = 0; i < 3; i++) P_(g.position.x + rv() * 0.5, g.position.y, g.position.z + rv() * 0.5, rv() * 1.5, rr(1, 4), rv() * 1.5, 1.1, 0.45);
    });
  }
  /** a burst of energy swelling out from a point (Dark Pulse, Discharge, explosions) */
  function domeFx(x, y, z, r, col, life = 0.4) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, TAU, 0, Math.PI / 2), glowMat(col, 0.22));
    m.position.set(x, y, z);
    addFx(m, life, (f, k) => {
      const e = 1 - (1 - k) * (1 - k);
      m.scale.setScalar(0.4 + r * e);
      m.material.opacity = 0.22 * (1 - k);
    });
  }
  /** lightning: a jagged, forked bolt from the sky that flickers twice and lights the arena */
  function boltFx(x, z, col = "#ffd94a", topY = 44) {
    const g = new THREE.Group();
    const seg = (a, b, r, c, o) => {
      const len = a.distanceTo(b),
        m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6, 1, true), glowMat(c, o));
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(_v.set(0, 1, 0), b.clone().sub(a).normalize());
      g.add(m);
    };
    const path = (from, to, n, jit, r) => {
      let p = from.clone();
      for (let i = 1; i <= n; i++) {
        const q = from.clone().lerp(to, i / n);
        if (i < n) q.add(new THREE.Vector3(rv() * jit, rv() * jit * 0.4, rv() * jit));
        seg(p, q, r * 2.6, col, 0.45);
        seg(p, q, r, "#ffffff", 1);
        if (r > 0.1 && i > 2 && i < n - 1 && Math.random() < 0.35) path(q, q.clone().add(new THREE.Vector3(rv() * 7, -rr(4, 9), rv() * 7)), 3, jit * 0.6, r * 0.5);
        p = q;
      }
    };
    path(new THREE.Vector3(x + rv() * 4, topY, z + rv() * 4), new THREE.Vector3(x, 0.2, z), 9, 2.4, 0.16);
    flashAt(x, 6, z, "#fff6c2", 2.2);
    addFx(g, 0.34, (f, k) => {
      g.visible = k < 0.32 || (k > 0.45 && k < 0.8); // two flickers
      const o = k < 0.45 ? 1 : 1 - (k - 0.45) / 0.55;
      g.children.forEach((m, i) => (m.material.opacity = (i % 2 ? 1 : 0.45) * o));
      if (k > 0.45 && k < 0.5) flashAt(x, 6, z, "#fff6c2", 1.2);
    });
    for (let i = 0; i < 16; i++) sparkP(x, 0.5, z, rv() * 12, rr(2, 12), rv() * 12, 1.3, 0.45);
    scorch(x, z, 3, "#2a2228", 3);
  }
  /** energy gathering into a point while a move charges */
  function chargeFx(type, x, y, z, r, n = 2) {
    const P_ = elemP(type);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU,
        e = rr(-0.6, 1),
        d = r * rr(0.8, 1.2),
        px = x + Math.cos(a) * d,
        py = Math.max(0.3, y + e * d * 0.6),
        pz = z + Math.sin(a) * d;
      P_(px, py, pz, ((x - px) / 0.35) * 0.9, ((y - py) / 0.35) * 0.9, ((z - pz) / 0.35) * 0.9, 0.7, 0.4);
    }
  }

  /* ================= HUD ================= */
  const ui = document.createElement("div");
  ui.id = "pwBattle";
  ui.innerHTML = `<style>
    body.arena #ui>*:not(#touch),body.arena #tbtns,body.arena #tq,body.arena #wildHud,body.arena #navChip,body.arena #hint,body.arena #toast{display:none!important}
    #pwBattle{position:fixed;inset:0;pointer-events:none;z-index:40;font:700 10px "DM Sans",system-ui;color:#1f1d2b;letter-spacing:.12em;text-transform:uppercase;
      -webkit-user-select:none;user-select:none}
    #pwBattle .pb-plate{position:absolute;background:rgba(251,248,239,.94);border:1.5px solid #1f1d2b;box-shadow:2px 2px 0 #1f1d2b}
    #pwBattle .pb-btn{pointer-events:auto;font:700 11px "DM Sans",system-ui;letter-spacing:.14em;text-transform:uppercase;background:#fbf8ef;color:#1f1d2b;
      border:1.5px solid #1f1d2b;box-shadow:2px 2px 0 #1f1d2b;padding:10px 16px;cursor:pointer}
    #pwBattle .pb-btn:active{transform:translate(1px,1px);box-shadow:1px 1px 0 #1f1d2b}
    #pwBattle .pb-btn.gold{background:#f2c230}#pwBattle .pb-btn.red{background:#d6452f;color:#fbf8ef}
    #pwBattle .chip{display:inline-block;padding:2px 7px;margin-right:4px;border:1.2px solid #1f1d2b;font-size:9px;letter-spacing:.12em}
    #pwBattle .bar{position:relative;height:10px;background:#e7e0d0;border:1.5px solid #1f1d2b;overflow:hidden}
    #pwBattle .bar i,#pwBattle .bar b{position:absolute;inset:0;transform-origin:left}
    #pwBattle .bar b{background:#f2c230;transition:transform .6s .25s}
    #pwBattle .bar i{background:#4fae5c;transition:transform .12s}
    #pwBattle .bar.mid i{background:#e8b42c}#pwBattle .bar.low i{background:#d6452f}
    /* offer card */
    #pbOffer{position:absolute;left:50%;bottom:18%;transform:translateX(-50%);padding:14px 18px;text-align:center;display:none;pointer-events:auto;min-width:260px}
    #pbOffer.on{display:block}
    #pbOffer .k{color:#d6452f;font-size:9px;letter-spacing:.22em}
    #pbOffer b{display:block;font-family:"Caveat Brush",cursive;font-weight:400;font-size:34px;letter-spacing:0;text-transform:none;line-height:1.05;margin:2px 0 4px}
    #pbOffer p{margin:0 0 10px;font-size:10px;opacity:.8;text-transform:none;letter-spacing:.04em}
    #pbOffer .row{display:flex;gap:10px;justify-content:center}
    /* loading */
    #pbLoad{position:absolute;inset:0;display:none;pointer-events:auto;background:#fbf8ef;overflow:hidden;z-index:5}
    #pbLoad.on{display:block}
    #pbLoad .split{position:absolute;inset:0;background:linear-gradient(105deg,#3a5bd9 0 49.6%,#1f1d2b 49.6% 50.4%,#d6452f 50.4% 100%);opacity:.92}
    #pbLoad .side{position:absolute;top:50%;transform:translateY(-50%);color:#fbf8ef;width:38%}
    #pbLoad .l{left:6%}#pbLoad .r{right:6%;text-align:right}
    #pbLoad .side small{display:block;font-size:10px;letter-spacing:.24em;opacity:.85;margin-bottom:8px}
    #pbLoad .side .nm{font-family:"Caveat Brush",cursive;font-size:clamp(30px,6vw,64px);letter-spacing:0;text-transform:none;line-height:1}
    #pbLoad .side .team{font-family:"Caveat Brush",cursive;font-size:clamp(20px,3.4vw,34px);letter-spacing:0;text-transform:none;line-height:1.15}
    #pbLoad .vs{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) rotate(-8deg);font-family:"Caveat Brush",cursive;font-size:clamp(60px,12vw,140px);
      color:#f2c230;text-shadow:4px 4px 0 #1f1d2b;letter-spacing:0}
    #pbLoad .prog{position:absolute;left:50%;bottom:9%;transform:translateX(-50%);width:min(420px,70vw);text-align:center;color:#fbf8ef}
    #pbLoad .prog .bar{margin-top:8px;background:rgba(251,248,239,.3);border-color:#fbf8ef}
    #pbLoad .prog .bar i{background:#f2c230;transition:transform .2s}
    /* fight HUD */
    #pbFight{position:absolute;inset:0;display:none}
    #pbFight.on{display:block}
    #pbBoss{left:50%;top:12px;transform:translateX(-50%);width:min(440px,60vw);padding:7px 12px}
    #pbBoss .nm{font-size:12px;letter-spacing:.2em;display:flex;justify-content:space-between;align-items:center;margin-bottom:5px}
    #pbBoss .rage{color:#d6452f;display:none}#pbBoss.enraged .rage{display:inline}
    #pbRun{position:absolute;right:calc(14px + env(safe-area-inset-right));top:12px;padding:8px 12px}
    #pbParty{position:absolute;left:calc(14px + env(safe-area-inset-left));top:12px;display:flex;flex-direction:column;gap:6px;pointer-events:auto}
    #pbParty .mon{width:150px;padding:5px 8px;cursor:pointer;background:rgba(251,248,239,.9);border:1.5px solid #1f1d2b;box-shadow:2px 2px 0 #1f1d2b;position:relative}
    #pbParty .mon.on{background:#fff4c9;transform:translateX(6px)}
    #pbParty .mon.out{opacity:.45;filter:grayscale(1)}
    #pbParty .mon .n{display:flex;justify-content:space-between;font-size:9px;margin-bottom:3px}
    #pbParty .mon .bar{height:7px}
    #pbMoves{position:absolute;right:calc(14px + env(safe-area-inset-right));bottom:calc(14px + env(safe-area-inset-bottom));display:grid;grid-template-columns:repeat(2,minmax(120px,1fr));gap:8px;pointer-events:auto}
    #pbMoves .mv{position:relative;overflow:hidden;text-align:left;padding:8px 10px 8px 14px;min-height:42px;background:#fbf8ef;border:1.5px solid #1f1d2b;box-shadow:2px 2px 0 #1f1d2b;cursor:pointer;
      font:700 11px "DM Sans",system-ui;letter-spacing:.06em;text-transform:none;color:#1f1d2b}
    #pbMoves .mv:before{content:"";position:absolute;left:0;top:0;bottom:0;width:6px;background:var(--c)}
    #pbMoves .mv small{display:block;font-size:8px;letter-spacing:.16em;text-transform:uppercase;opacity:.7}
    #pbMoves .mv .key{position:absolute;right:6px;top:5px;font-size:9px;opacity:.55}
    #pbMoves .mv .cd{position:absolute;inset:0;background:rgba(31,29,43,.45);transform-origin:bottom;transform:scaleY(0)}
    #pbMoves .mv.wait{color:#6a6678}
    #pbMoves .mv.flash{animation:pbflash .25s}
    @keyframes pbflash{0%{background:#f2c230}100%{background:#fbf8ef}}
    #pbDodge{position:absolute;right:calc(14px + env(safe-area-inset-right));bottom:calc(126px + env(safe-area-inset-bottom));width:74px;height:74px;border-radius:50%;
      background:#d6452f;color:#fbf8ef;font:700 11px "DM Sans";letter-spacing:.1em;border:1.5px solid #1f1d2b;box-shadow:2px 2px 0 #1f1d2b;pointer-events:auto;display:none}
    #pbDodge .cd{position:absolute;inset:0;border-radius:50%;background:rgba(31,29,43,.35);transform:scale(0)}
    #pbKeys{position:absolute;left:50%;bottom:calc(12px + env(safe-area-inset-bottom));transform:translateX(-50%);font-size:9px;padding:5px 10px;color:#4a4658;white-space:nowrap}
    #pbBan{position:absolute;left:50%;top:24%;transform:translate(-50%,-50%) scale(.85);text-align:center;opacity:0;transition:opacity .2s,transform .2s;
      font-family:"Caveat Brush",cursive;font-size:clamp(22px,3.6vw,40px);letter-spacing:0;text-transform:none;color:#1f1d2b;text-shadow:2px 2px 0 #fbf8ef,-1px -1px 0 #fbf8ef;white-space:nowrap}
    #pbBan.show{opacity:1;transform:translate(-50%,-50%) scale(1)}
    #pbBan small{display:block;font:700 11px "DM Sans";letter-spacing:.22em;text-transform:uppercase;color:#d6452f}
    #pbCall,#pbEff{position:absolute;left:50%;transform:translateX(-50%);opacity:0;transition:opacity .15s;white-space:nowrap;
      border:1.5px solid #1f1d2b;box-shadow:2px 2px 0 #1f1d2b;padding:3px 10px}
    #pbCall{top:60px;font-size:11px;letter-spacing:.2em;background:#1f1d2b;color:#fbf8ef}
    #pbCall b{color:var(--c,#f2c230)}
    #pbCall.sig{background:#d6452f}
    #pbCall.sig b{color:#fff4c9}
    #pbEff{top:88px;font-size:9px;letter-spacing:.18em;background:rgba(251,248,239,.94);color:#1f1d2b}
    #pbCall.show,#pbEff.show{opacity:1}
    .pb-dmg{position:absolute;left:0;top:0;font:700 17px "DM Sans";color:#1f1d2b;text-shadow:1.5px 1.5px 0 #fbf8ef;letter-spacing:0;will-change:transform,opacity}
    .pb-dmg.super{font-size:23px;color:#d6452f}.pb-dmg.weak{font-size:14px;color:#6a6678}.pb-dmg.crit{color:#7a3cd6}
    .pb-dmg.ouch{color:#d6452f}.pb-dmg.miss{font-size:13px;color:#1fb5a8}
    #pbHurt{position:absolute;inset:0;opacity:0;background:radial-gradient(ellipse at center,transparent 50%,rgba(214,69,47,.55));transition:opacity .3s}
    #pbHurt.on{opacity:1;transition:opacity .05s}
    /* result */
    #pbResult{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:none;padding:18px 24px;text-align:center;pointer-events:auto;min-width:280px}
    #pbResult.on{display:block}
    #pbResult b{display:block;font-family:"Caveat Brush",cursive;font-weight:400;font-size:40px;letter-spacing:0;text-transform:none;line-height:1}
    #pbResult p{font-size:11px;letter-spacing:.04em;text-transform:none;margin:6px 0 14px}
    #pbResult .row{display:flex;gap:10px;justify-content:center}
    body.touch #pbDodge{display:block}
    body.touch #pbKeys,body.touch #pbMoves .mv .key{display:none}
    body.touch #pbMoves{grid-template-columns:repeat(2,104px);gap:6px;bottom:calc(10px + env(safe-area-inset-bottom))}
    body.touch #pbMoves .mv{min-height:38px;padding:6px 8px 6px 12px;font-size:10px}
    body.touch #pbDodge{bottom:calc(104px + env(safe-area-inset-bottom));right:calc(232px + env(safe-area-inset-right))}
    body.touch #pbParty .mon{width:118px;padding:4px 6px}
    body.touch #pbBoss{width:min(320px,48vw)}
  </style>
  <div class="pb-plate" id="pbOffer"><div class="k" id="pbOfK"></div><b id="pbOfN"></b><p id="pbOfP"></p>
    <div class="row"><button class="pb-btn gold" id="pbGo">⚔ Challenge</button><button class="pb-btn" id="pbNo">Not now</button></div></div>
  <div id="pbLoad"><div class="split"></div>
    <div class="side l"><small>Your team</small><div class="team" id="pbLTeam"></div></div>
    <div class="vs">VS</div>
    <div class="side r"><small id="pbLReg"></small><div class="nm" id="pbLBoss"></div><div id="pbLTypes" style="margin-top:8px"></div></div>
    <div class="prog"><span id="pbLTip"></span><div class="bar"><i id="pbLBar" style="transform:scaleX(0)"></i></div></div></div>
  <div id="pbFight">
    <div class="pb-plate" id="pbBoss"><div class="nm"><span id="pbBN"></span><span class="rage">ENRAGED</span></div>
      <div class="bar" id="pbBBar"><b></b><i></i></div></div>
    <button class="pb-btn" id="pbRun">Run ✕</button>
    <div id="pbParty"></div>
    <div id="pbMoves"></div>
    <button id="pbDodge">DODGE<span class="cd"></span></button>
    <div class="pb-plate" id="pbKeys">WASD move · SPACE dodge · 1–4 moves · Q switch · ESC run</div>
    <div id="pbCall"></div><div id="pbEff"></div><div id="pbBan"></div>
  </div>
  <div id="pbHurt"></div>
  <div id="pbDmg" style="position:absolute;inset:0;overflow:hidden"></div>
  <div class="pb-plate" id="pbResult"><b id="pbRT"></b><p id="pbRP"></p><div class="row" id="pbRB"></div></div>`;
  document.body.appendChild(ui);
  const $ = (id) => ui.querySelector("#" + id);

  const dmgPool = [];
  for (let i = 0; i < 14; i++) {
    const el = document.createElement("div");
    el.className = "pb-dmg";
    el.style.opacity = "0";
    $("pbDmg").appendChild(el);
    dmgPool.push({ el, t: 9, p: new THREE.Vector3() });
  }
  function dmgText(x, y, z, txt, cls = "") {
    const d = dmgPool.reduce((a, b) => (b.t > a.t ? b : a));
    d.t = 0;
    d.sum = 0;
    d.who = null;
    d.p.set(x, y, z);
    d.el.textContent = txt;
    d.el.className = "pb-dmg " + cls;
    return d;
  }
  // hits on the same target within 0.45 s roll into one number (Water Shuriken's 3 hits → one total)
  function dmgNum(who, amount, cls, x, y, z) {
    const live = dmgPool.find((d) => d.who === who && d.t < 0.45);
    if (live) {
      live.sum += amount;
      live.t = Math.min(live.t, 0.12);
      live.el.textContent = (who === "p" ? "-" : "") + live.sum;
      if (cls) live.el.className = "pb-dmg " + cls;
      return;
    }
    const d = dmgText(x, y, z, (who === "p" ? "-" : "") + amount, cls);
    d.who = who;
    d.sum = amount;
  }
  const P3 = new THREE.Vector3();
  function updDmg(dt) {
    for (const d of dmgPool) {
      if (d.t > 0.9) continue;
      d.t += dt;
      d.p.y += dt * 2;
      P3.copy(d.p).project(camera);
      if (P3.z > 1) {
        d.el.style.opacity = "0";
        continue;
      }
      d.el.style.opacity = String(clamp(1.8 - d.t * 2, 0, 1));
      d.el.style.transform = `translate(${((P3.x * 0.5 + 0.5) * innerWidth).toFixed(1)}px,${((-P3.y * 0.5 + 0.5) * innerHeight).toFixed(1)}px) translate(-50%,-50%) scale(${(1 + Math.max(0, 0.25 - d.t) * 2).toFixed(2)})`;
    }
  }
  let banT = 0,
    effT = 0,
    callT = 0;
  // the boss's move name, in a pill under its health bar
  function callout(mv) {
    const el = $("pbCall");
    el.innerHTML = `⚠ <b>${mv.n}</b>`;
    el.style.setProperty("--c", TYPE_COLORS[mv.type]);
    el.classList.toggle("sig", !!mv.sig);
    el.classList.add("show");
    callT = 1.5;
  }
  function banner(main, sub = "", secs = 1.6) {
    $("pbBan").innerHTML = main + (sub ? `<small>${sub}</small>` : "");
    $("pbBan").classList.add("show");
    banT = secs;
  }
  function effText(t) {
    if (!t) {
      $("pbEff").classList.remove("show");
      effT = 0;
      return;
    }
    $("pbEff").textContent = t;
    $("pbEff").classList.add("show");
    effT = 1.3;
  }
  function hurtFlash() {
    $("pbHurt").classList.add("on");
    setTimeout(() => $("pbHurt").classList.remove("on"), 120);
  }

  /* ================= audio ================= */
  const sfx = {
    hit(big) {
      if (!A.ctx) return;
      const t = A.ctx.currentTime;
      ctx.tone("square", big ? 220 : 340, t, 0.08, { peak: 0.14, dec: 0.4, sus: 0, rel: 0.2, out: A.sfx });
      ctx.noiseHit(t, { f: big ? 600 : 1200, q: 0.8, peak: big ? 0.28 : 0.16, dec: big ? 0.3 : 0.12, out: A.sfx });
    },
    cast(type) {
      if (!A.ctx) return;
      const f = { fire: 260, water: 520, electric: 880, ghost: 300, poison: 240, dark: 200, flying: 640, dragon: 180 }[type] || 400;
      ctx.tone("triangle", f, A.ctx.currentTime, 0.12, { peak: 0.09, dec: 0.3, sus: 0, rel: 0.15, out: A.sfx });
    },
    whoosh() {
      if (A.ctx) ctx.noiseHit(A.ctx.currentTime, { f: 1800, q: 0.4, peak: 0.12, dec: 0.18, out: A.sfx });
    },
    hurt() {
      if (!A.ctx) return;
      ctx.tone("sawtooth", 150, A.ctx.currentTime, 0.18, { peak: 0.13, dec: 0.5, sus: 0, rel: 0.2, out: A.sfx });
      ctx.noiseHit(A.ctx.currentTime, { f: 400, q: 0.6, peak: 0.2, dec: 0.2, out: A.sfx });
    },
    warn() {
      if (A.ctx) ctx.tone("square", 760, A.ctx.currentTime, 0.05, { peak: 0.05, dec: 0.2, sus: 0, rel: 0.05, out: A.sfx });
    },
    roar() {
      if (!A.ctx) return;
      const t = A.ctx.currentTime;
      ctx.tone("sawtooth", 72, t, 0.6, { peak: 0.18, dec: 0.7, sus: 0.4, rel: 0.4, out: A.sfx, lp: 700 });
      ctx.tone("square", 108, t + 0.05, 0.5, { peak: 0.08, dec: 0.6, sus: 0.3, rel: 0.4, out: A.sfx, lp: 900 });
    },
    fanfare() {
      if (!A.ctx) return;
      const t = A.ctx.currentTime;
      [0, 4, 7, 12, 16].forEach((n, i) => ctx.tone("triangle", mtof(67 + n), t + i * 0.12, 0.16, { peak: 0.14, dec: 0.3, sus: 0.2, rel: 0.5, out: A.sfx }));
    },
    sad() {
      if (!A.ctx) return;
      const t = A.ctx.currentTime;
      [7, 3, 0, -5].forEach((n, i) => ctx.tone("triangle", mtof(62 + n), t + i * 0.2, 0.2, { peak: 0.11, dec: 0.4, sus: 0.2, rel: 0.5, out: A.sfx }));
    },
  };

  /* ================= models ================= */
  const teamModels = {}; // key → { root, mixer, act } (loaded once, reused)
  async function loadTeam(onProgress) {
    let done = 0;
    await Promise.all(
      PARTY.map(async (p) => {
        if (!teamModels[p.key]) {
          const m = await ctx.loadModel(p.key);
          const holder = new THREE.Group();
          holder.add(m.root);
          m.root.traverse((o) => o.isMesh && (o.castShadow = true));
          const mm = { root: holder, inner: m.root, mixer: null, act: {}, foot: 0 };
          if (m.animations && m.animations.length) {
            // The clips carry root motion (an "origin" position track) that drags the whole model
            // around — and down into the floor. Movement comes from the game instead, exactly like
            // the overworld does it (index.html → nMixer).
            for (const c of m.animations) c.tracks = c.tracks.filter((t) => !(t.name.startsWith("origin") && t.name.endsWith(".position")));
            mm.mixer = new THREE.AnimationMixer(m.model);
            for (const [k, pat] of [["idle", /defaultwait01_loop$/], ["walk", /walk01_loop$/], ["run", /run01_loop$/]]) {
              const clip = m.animations.find((c) => pat.test(c.name));
              if (clip) {
                mm.act[k] = mm.mixer.clipAction(clip);
                mm.act[k].setEffectiveWeight(0).play();
              }
            }
            // measure the lowest point of each pose so the feet sit exactly on the ground
            const box = new THREE.Box3();
            holder.updateMatrixWorld(true);
            mm.footOf = {};
            for (const k of Object.keys(mm.act)) {
              for (const j of Object.keys(mm.act)) mm.act[j].setEffectiveWeight(j === k ? 1 : 0);
              let low = Infinity;
              const dur = mm.act[k].getClip().duration;
              for (let i = 0; i < 6; i++) {
                mm.mixer.setTime((dur * i) / 6);
                holder.updateMatrixWorld(true);
                box.setFromObject(holder, true);
                low = Math.min(low, box.min.y);
              }
              mm.footOf[k] = -low;
            }
            mm.mixer.setTime(0);
            for (const j of Object.keys(mm.act)) mm.act[j].setEffectiveWeight(j === "idle" ? 1 : 0);
          }
          teamModels[p.key] = mm;
        }
        onProgress(++done / PARTY.length);
      }),
    );
  }
  function bossModel(sp) {
    const g = new THREE.Group();
    const ga = new THREE.InstancedBufferAttribute(new Float32Array(2), 2);
    ga.setUsage(THREE.DynamicDrawUsage);
    for (const p of sp.parts) {
      const geo = p.geometry.clone();
      geo.setAttribute("aGait", ga);
      const im = new THREE.InstancedMesh(geo, p.material, 1);
      im.setMatrixAt(0, new THREE.Matrix4());
      im.castShadow = true;
      im.frustumCulled = false;
      g.add(im);
    }
    g.userData.ga = ga;
    g.userData.mats = sp.parts.map((p) => p.material);
    return g;
  }

  /* ================= state ================= */
  const st = {
    phase: "off", // off · offer · loading · intro · fight · win · lose · result
    m: null, // the overworld boss
    stats: null,
    team: [],
    active: 2,
    t: 0,
    freeze: 0,
    trauma: 0,
    runArm: 0,
    camSave: null,
    song: 0,
  };
  const GCD = 0.5; // global cooldown between any two moves
  // how long each kind of move animates your Pokémon's body (see poseModels)
  const ANIM_DUR = { melee: 0.3, dash: 0.35, projectile: 0.25, multi: 0.3, cone: 0.5, beam: 0.45, lob: 0.4, strike: 0.45, ring: 0.45 };
  const P = { x: 0, z: 0, y: 0, hd: 0, vx: 0, vz: 0, roll: 0, rx: 0, rz: 0, rollCd: 0, iframe: 0, cast: 0, gcd: 0, lunge: null, switchCd: 0, spin: 0, hurtT: 0 };
  const B = { x: 0, z: 0, y: 0, hd: 0, v: 0, state: "idle", t: 0, cd: 2, move: null, last: null, enraged: false, hp: 1, maxHp: 1, model: null, sp: null, r: 2, h: 4, gp: 0, jump: 0, dash: null, aim: null, shotsLeft: 0, shotT: 0, rainSpots: [], flash: 0, faint: 0, lean: 0 };
  const shots = []; // { mesh, x,y,z, vx,vy,vz, r, life, from, move, lob }
  const shake = (v) => (st.trauma = Math.min(1, st.trauma + (reduced ? v * 0.3 : v)));
  const mon = () => st.team[st.active];

  /* ================= flow ================= */
  function offer(m) {
    if (st.phase !== "off" || !m || !m.lair) return;
    st.phase = "offer";
    st.m = m;
    const e = m.e;
    $("pbOfK").textContent = `★ ${m.region} boss`;
    $("pbOfN").textContent = e.name;
    $("pbOfP").textContent = `${e.types.map(cap).join(" / ")} · Your Charizard, Gengar & Greninja vs ${e.name}`;
    $("pbOffer").classList.add("on");
  }
  function closeOffer() {
    $("pbOffer").classList.remove("on");
    if (st.phase === "offer") st.phase = "off";
  }
  $("pbNo").onclick = () => closeOffer();
  $("pbGo").onclick = () => challenge();

  async function challenge() {
    const m = st.m;
    $("pbOffer").classList.remove("on");
    if (!m) return (st.phase = "off");
    st.phase = "loading";
    document.body.classList.add("arena");
    for (const k in keys) keys[k] = false;
    st.camSave = { p: camera.position.clone(), q: camera.quaternion.clone(), fov: camera.fov };
    st.stats = bossStats(m.id, m.e);
    $("pbLTeam").innerHTML = PARTY.map((p) => `${p.name} <span style="font:700 10px DM Sans;letter-spacing:.14em;opacity:.8">${p.types.join(" / ").toUpperCase()}</span>`).join("<br>");
    $("pbLBoss").textContent = m.e.name;
    $("pbLReg").textContent = `${m.region} boss`;
    $("pbLTypes").innerHTML = m.e.types.map((t) => `<span class="chip" style="background:${TYPE_COLORS[t]};color:#1f1d2b;border-color:#fbf8ef">${t.toUpperCase()}</span>`).join("");
    const tips = [
      "Dodge rolls make you invincible for a moment — roll through attacks",
      "Red areas on the ground show exactly where the boss will hit",
      "Switch Pokémon to resist the boss's moves — types matter",
      "Ranged moves are safe; melee moves hit harder up close",
      "Bosses sidestep attacks they see coming — strike right after they attack, while they recover",
      "Pokémon resting on the bench slowly recover HP — switch before one faints",
      "A second wave of meteors often follows the first — keep moving",
    ];
    $("pbLTip").textContent = tips[Math.floor(Math.random() * tips.length)];
    $("pbLoad").classList.add("on");
    const bar = $("pbLBar");
    let prog = 0;
    const setProg = (v) => (bar.style.transform = `scaleX(${(prog = Math.max(prog, v))})`);
    setProg(0.05);
    const t0 = performance.now();
    try {
      const sp = m.sp || (await wild().species(m.id));
      setProg(0.25);
      await loadTeam((k) => setProg(0.25 + k * 0.6));
      buildArena(THEMES[(REGIONS[m.region] || {}).biome] || THEMES.field, sp.h, m.e.types);
      setupFight(sp);
      setProg(1);
    } catch (e) {
      console.warn("[battle] could not start", e);
      $("pbLoad").classList.remove("on");
      exit("The arena couldn't be set up — try again");
      return;
    }
    await new Promise((r) => setTimeout(r, Math.max(0, 1600 - (performance.now() - t0))));
    $("pbLoad").classList.remove("on");
    st.phase = "intro";
    st.t = 0;
    game.fade = 1;
    game.fadeTarget = 0;
    if (A.on) {
      st.song = A.song;
      const i = SONGS.findIndex((s) => s.n === BATTLE_SONG);
      if (i >= 0) {
        A.song = i;
        A.bar = A.step = 0;
        if (ctx.uiRadio) ctx.uiRadio();
      }
    }
    sfx.roar();
    shake(0.5);
    banner(`${m.e.name} appeared!`, `${m.region} boss`, 2);
  }

  function setupFight(sp) {
    // team: full HP, start with the Pokémon you were using
    st.team = PARTY.map((p) => ({ ...p, hpNow: p.hp, cd: [0, 0, 0, 0], out: false }));
    st.active = ctx.currentPokemon ? Math.max(0, PARTY.findIndex((p) => p.key === ctx.currentPokemon())) : 2;
    for (const p of PARTY) scene.remove(teamModels[p.key].root);
    scene.add(teamModels[mon().key].root);
    Object.assign(P, { x: 0, z: R * 0.55, y: 0, hd: 0, vx: 0, vz: 0, roll: 0, rollCd: 0, iframe: 0, cast: 0, gcd: 0, lunge: null, switchCd: 0, spin: 0, hurtT: 0 });
    // boss
    if (B.model) scene.remove(B.model);
    B.sp = sp;
    // the giants (Rayquaza, Kyogre, Yveltal…) are scaled down a little so they fit the arena and you can get near them
    const vs = (B.vs = Math.min(1, 9 / sp.r));
    B.model = bossModel(sp);
    scene.add(B.model);
    Object.assign(B, {
      x: 0, z: -R * 0.35, y: 0, hd: 0, v: 0, state: "idle", t: 0, cd: 1.2, move: null, last: null, enraged: false,
      hp: st.stats.hp, maxHp: st.stats.hp, r: clamp(sp.r * vs * 0.8, 1.4, 7.2), h: sp.h * vs, gp: 0, jump: 0, dash: null, aim: null, // r: its body (not the wingspan or tail)
      shotsLeft: 0, rainSpots: [], flash: 0, faint: 0, lean: 0,
      swim: st.m.hab === "water" && st.m.gait === "swim",
      vx: 0, vz: 0, evade: null, evadeCd: 2, iframe: 0, echo: false, strafe: 1, strafeT: 1, act: null, hitT: 0, dodgeShown: false,
    });
    B.ra = Math.min(B.r, 4.5); // how wide it is when it charges: narrow enough to roll out of its lane
    B.hd = Math.atan2(-(P.x - B.x), -(P.z - B.z));
    for (const s of [...shots]) killShot(s);
    for (const d of [...decals]) killDecal(d);
    buildHud();
    st.snapCam = true;
    $("pbFight").classList.add("on");
    $("pbBoss").classList.remove("enraged");
    $("pbBN").innerHTML = `${st.stats.name} ${st.stats.types.map((t) => `<span class="chip" style="background:${TYPE_COLORS[t]}">${t.toUpperCase()}</span>`).join("")}`;
    setBars();
  }

  function exit(msg) {
    st.phase = "off";
    document.body.classList.remove("arena");
    $("pbFight").classList.remove("on");
    $("pbResult").classList.remove("on");
    $("pbLoad").classList.remove("on");
    $("pbBan").classList.remove("show");
    for (const s of [...shots]) killShot(s);
    for (const d of [...decals]) killDecal(d);
    if (B.sp) for (const mat of B.sp.parts.map((p) => p.material)) if (mat.emissive) mat.emissive.setRGB(0, 0, 0);
    if (st.camSave) {
      camera.position.copy(st.camSave.p);
      camera.quaternion.copy(st.camSave.q);
      camera.fov = st.camSave.fov;
      camera.updateProjectionMatrix();
    }
    if (A.on && SONGS[A.song] && SONGS[A.song].n === BATTLE_SONG) {
      A.song = st.song;
      A.bar = A.step = 0;
      if (ctx.uiRadio) ctx.uiRadio();
    }
    for (const k in keys) keys[k] = false;
    game.fade = 1;
    game.fadeTarget = 0;
    if (msg) toast(msg);
  }

  function result(win) {
    st.phase = "result";
    const m = st.m;
    $("pbRT").textContent = win ? `★ ${st.stats.name} defeated!` : "Your team fainted…";
    $("pbRP").textContent = win
      ? `${m.region} is clear — its boss is gone from the lair for good.`
      : `${st.stats.name} is still guarding ${m.region}. Your Pokémon are healed — try another type matchup!`;
    const row = $("pbRB");
    row.innerHTML = "";
    const btn = (label, cls, fn) => {
      const b = document.createElement("button");
      b.className = "pb-btn " + cls;
      b.textContent = label;
      b.onclick = fn;
      row.appendChild(b);
    };
    if (win)
      btn("Continue", "gold", () => {
        const w = wild();
        if (w && m.lair) w.defeatBoss(m.lair.rid);
        exit(`★ ${st.stats.name} defeated · ${m.region} cleared`);
      });
    else {
      btn("Try again", "gold", () => {
        $("pbResult").classList.remove("on");
        setupFight(B.sp);
        st.phase = "intro";
        st.t = 0;
        banner(`${st.stats.name} is back!`, "round 2", 1.6);
      });
      btn("Leave", "", () => exit("Your team rested up. The boss is still there."));
    }
    $("pbResult").classList.add("on");
  }

  /* ================= HUD ================= */
  function buildHud() {
    $("pbParty").innerHTML = st.team
      .map((p, i) => `<div class="mon" data-i="${i}"><div class="n"><span>${p.name}</span><span class="hpn"></span></div><div class="bar"><b></b><i></i></div></div>`)
      .join("");
    $("pbParty").querySelectorAll(".mon").forEach((el) => (el.onclick = () => switchTo(+el.dataset.i)));
    buildMoves();
  }
  function buildMoves() {
    const p = mon();
    $("pbMoves").innerHTML = p.moves
      .map((mv, i) => `<button class="mv" data-i="${i}" style="--c:${TYPE_COLORS[mv.type]}"><span class="key">${i + 1}</span>${mv.n}<small>${mv.type} · ${mv.power}</small><span class="cd"></span></button>`)
      .join("");
    $("pbMoves").querySelectorAll(".mv").forEach((el) =>
      el.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        useMove(+el.dataset.i);
      }),
    );
  }
  function setBars() {
    const r = B.hp / B.maxHp,
      bb = $("pbBBar");
    bb.querySelector("i").style.transform = bb.querySelector("b").style.transform = `scaleX(${r})`;
    bb.classList.toggle("mid", r < 0.5);
    bb.classList.toggle("low", r < 0.2);
    $("pbParty")
      .querySelectorAll(".mon")
      .forEach((el, i) => {
        const p = st.team[i],
          k = p.hpNow / p.hp,
          bar = el.querySelector(".bar");
        bar.querySelector("i").style.transform = bar.querySelector("b").style.transform = `scaleX(${k})`;
        bar.classList.toggle("mid", k < 0.5);
        bar.classList.toggle("low", k < 0.2);
        el.querySelector(".hpn").textContent = `${Math.ceil(p.hpNow)}/${p.hp}`;
        el.classList.toggle("on", i === st.active);
        el.classList.toggle("out", p.out);
      });
  }
  function updMoveCds() {
    const p = mon();
    $("pbMoves")
      .querySelectorAll(".mv")
      .forEach((el, i) => {
        const k = Math.max(p.cd[i] > 0 ? p.cd[i] / p.moves[i].cd : 0, P.gcd > 0 ? (P.gcd / GCD) * 0.45 : 0);
        el.querySelector(".cd").style.transform = `scaleY(${k})`;
        el.classList.toggle("wait", k > 0);
      });
    $("pbDodge").querySelector(".cd").style.transform = `scale(${P.rollCd > 0 ? P.rollCd / 0.75 : 0})`;
  }
  $("pbRun").onclick = () => run();
  $("pbDodge").addEventListener("pointerdown", (e) => {
    e.preventDefault();
    dodge();
  });
  function run() {
    if (st.phase !== "fight" && st.phase !== "intro") return;
    exit("Got away safely!");
  }

  /* ================= input ================= */
  addEventListener(
    "keydown",
    (e) => {
      if (st.phase === "off") return;
      const k = e.key.toLowerCase();
      if (st.phase === "offer") {
        if (k === "enter" || k === "e") (challenge(), e.preventDefault());
        else if (k === "escape" || k === "backspace") closeOffer();
        else return; // walking away is fine
        e.stopImmediatePropagation();
        return;
      }
      const movement = ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift"].includes(k);
      if (!movement) e.stopImmediatePropagation(); // the world doesn't get battle keys
      if (k === " " || k === "tab" || k.startsWith("arrow")) e.preventDefault();
      if (e.repeat) return;
      if (st.phase === "result") {
        if (k === "enter" || k === " ") $("pbRB").querySelector("button")?.click();
        return;
      }
      if ("1234".includes(k) && k.length === 1) useMove(+k - 1);
      else if (k === " ") dodge();
      else if (k === "q" || k === "tab" || k === "e") switchTo(-1);
      else if (k === "escape") {
        if (st.runArm > 0) run();
        else {
          st.runArm = 1.6;
          banner("Run away?", "press ESC again", 1.4);
        }
      }
    },
    true,
  );

  /* ================= player actions ================= */
  function dodge() {
    if (st.phase !== "fight" || P.rollCd > 0 || P.lunge || mon().out) return;
    const f = toBoss(),
      ix = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0),
      iy = (keys.w || keys.arrowup ? 1 : 0) - (keys.s || keys.arrowdown ? 1 : 0);
    let dx = f.x * iy - f.z * ix,
      dz = f.z * iy + f.x * ix;
    if (!ix && !iy) (dx = -f.z), (dz = f.x); // no input: sidestep
    const l = Math.hypot(dx, dz) || 1;
    P.rx = dx / l;
    P.rz = dz / l;
    P.roll = 0.3;
    P.iframe = 0.32;
    P.rollCd = 1.15;
    P.spin = 0;
    P.hd = Math.atan2(-P.rx, -P.rz); // dive in the direction of the roll
    P.anim = null;
    sfx.whoosh();
    dust(P.x, P.z, 8, 4);
  }
  function switchTo(i) {
    if (st.phase !== "fight" && st.phase !== "intro") return;
    if (P.switchCd > 0) return;
    const n = st.team.length;
    if (i < 0) {
      for (let k = 1; k <= n; k++) {
        const j = (st.active + k) % n;
        if (!st.team[j].out) {
          i = j;
          break;
        }
      }
    }
    if (i < 0 || i === st.active || st.team[i].out) return;
    scene.remove(teamModels[mon().key].root);
    st.active = i;
    scene.add(teamModels[mon().key].root);
    P.switchCd = 1.2;
    P.iframe = Math.max(P.iframe, 0.5);
    P.cast = 0;
    P.lunge = null;
    burst(P.x, 1.5, P.z, "#f2c230", 20, 6, 3);
    ringFx(P.x, 0.2, P.z, 4, "#f2c230");
    banner(`Go! ${mon().name}!`, mon().types.join(" / "), 1.1);
    sfx.cast("normal");
    buildMoves();
    setBars();
  }
  const toBoss = () => {
    const dx = B.x - P.x,
      dz = B.z - P.z,
      d = Math.hypot(dx, dz) || 1;
    return { x: dx / d, z: dz / d, d };
  };
  const chestY = () => (mon().flies ? 3.4 : mon().floats ? 2 : 1.6);
  function useMove(i) {
    if (st.phase !== "fight") return;
    const p = mon();
    if (p.out || P.roll > 0 || P.lunge || P.switchCd > 0.9) return;
    const mv = p.moves[i];
    if (!mv) return;
    const btn = $("pbMoves").querySelectorAll(".mv")[i];
    if (p.cd[i] > 0 || P.gcd > 0) return;
    p.cd[i] = mv.cd;
    P.gcd = GCD;
    if (btn) (btn.classList.remove("flash"), void btn.offsetWidth, btn.classList.add("flash"));
    P.cast = 0.32;
    P.anim = { kind: mv.kind, t: 0, dur: ANIM_DUR[mv.kind] || 0.3 };
    sfx.cast(mv.type);
    const f = toBoss(),
      type = mv.type,
      col = TYPE_COLORS[type];
    P.hd = Math.atan2(-f.x, -f.z); // every move is aimed: turn to face the boss
    bossEvade(); // it may see it coming and sidestep
    const mouth = () => {
        const g = toBoss();
        return [P.x + g.x * 1.6, P.y + chestY() + 0.3, P.z + g.z * 1.6];
      },
      target = () => [B.x, B.y + B.h * 0.5, B.z],
      reach = (r) => toBoss().d - B.r < r;
    switch (mv.kind) {
      case "projectile":
      case "multi": {
        const n = mv.shots || 1;
        for (let k = 0; k < n; k++)
          later(k * 0.07, () => {
            const g = toBoss(),
              [mx, my, mz] = mouth(),
              a = (k - (n - 1) / 2) * (mv.spread || 0),
              ca = Math.cos(a),
              sa = Math.sin(a),
              dx = g.x * ca - g.z * sa,
              dz = g.z * ca + g.x * sa,
              dy = (B.y + B.h * 0.5 - my) / Math.max(1, g.d);
            addShot({ x: mx, y: my, z: mz, vx: dx * mv.speed, vy: dy * mv.speed, vz: dz * mv.speed, r: mv.size, life: mv.range / mv.speed, from: "p", move: mv, col });
            flashAt(mx, my, mz, col, 0.25);
          });
        break;
      }
      case "melee":
        later(0.08, () => {
          const g = toBoss(),
            hit = reach(mv.range),
            at = hit ? Math.max(1, g.d - B.r * 0.7) : Math.min(g.d, mv.range) * 0.8 + 1,
            r = hit ? clamp(B.h * 0.4, 2, 3.2) : 2.2,
            sy = hit ? B.y + clamp(B.h * 0.5, 1.4, 4.5) : P.y + chestY();
          slashFx(P.x + g.x * at, sy + r * 0.4, P.z + g.z * at, Math.atan2(-g.x, -g.z), r, col, Math.random() < 0.5 ? 0.7 : -0.7, /Claw/.test(mv.n) ? 3 : 1);
          if (hit) {
            const P_ = elemP(type);
            for (let k = 0; k < 12; k++) P_(P.x + g.x * at, sy + rv(), P.z + g.z * at, g.x * rr(2, 9) + rv() * 4, rr(-1, 5), g.z * rr(2, 9) + rv() * 4, 0.9, 0.4);
          }
        });
        later(0.13, () => (reach(mv.range) ? hitBoss(mv) : whiff()));
        break;
      case "dash":
        P.lunge = { t: 0, dur: 0.2, dx: f.x, dz: f.z, dist: Math.max(0, Math.min(mv.lunge, f.d - B.r - 1.2)), mv };
        P.iframe = Math.max(P.iframe, 0.3);
        sfx.whoosh();
        dust(P.x, P.z, 6, 5);
        break;
      case "cone":
        streamFx(type, 0.5, mouth, target, mv.range, mv.arc);
        later(0.2, () => (reach(mv.range) ? hitBoss(mv) : whiff()));
        later(0.4, () => reach(mv.range) && scorch(B.x, B.z, B.r + 1.5, "#2a2228", 3.5));
        break;
      case "beam": {
        const [mx, my, mz] = mouth(),
          hit = reach(mv.range),
          end = hit ? target() : [mx + f.x * mv.range, my, mz + f.z * mv.range];
        beamFx(mx, my, mz, end[0], end[1], end[2], mv.width * 0.55, type, 0.45);
        shake(0.25);
        later(0.07, () => (reach(mv.range) ? hitBoss(mv) : whiff()));
        if (hit && type === "water") later(0.3, () => scorch(B.x, B.z, B.r + 2, "#2f7fd6", 4));
        break;
      }
      case "lob": {
        const [mx, my, mz] = mouth(),
          flight = mv.delay + 0.15,
          tx = B.x,
          tz = B.z;
        addShot({ x: mx, y: my + 0.8, z: mz, vx: (tx - mx) / flight, vy: 9.8 * 0.5 * flight + (0.5 - my - 0.8) / flight, vz: (tz - mz) / flight, r: mv.power >= 100 ? 1.5 : 1.1, life: flight, from: "p", move: mv, col, lob: { tx, tz } });
        break;
      }
      case "strike":
        // static crackles over the boss, then the bolt
        addFx(new THREE.Group(), mv.delay, () => {
          for (let k = 0; k < 2; k++) sparkP(B.x + rv() * B.r, B.y + B.h + rr(0.5, 3), B.z + rv() * B.r, rv() * 3, rr(-6, 0), rv() * 3, 0.9, 0.2);
        });
        later(mv.delay, () => {
          boltFx(B.x, B.z, col);
          sfx.hit(true);
          shake(0.4);
          hitBoss(mv);
        });
        break;
      case "ring":
        later(0.12, () => {
          ringFx(P.x, 0.3, P.z, mv.radius, col, 0.4);
          later(0.09, () => ringFx(P.x, 0.3, P.z, mv.radius * 0.8, col, 0.35));
          domeFx(P.x, 0.2, P.z, mv.radius, col, 0.35);
          const P_ = elemP(type);
          for (let a = 0; a < TAU; a += TAU / 44) P_(P.x, P.y + rr(0.4, 1.8), P.z, Math.cos(a) * rr(16, 22), rr(-1, 3), Math.sin(a) * rr(16, 22), 1.5, mv.radius / 19);
          flashAt(P.x, P.y + 2, P.z, col, 0.8);
          shake(0.3);
        });
        later(0.2, () => (reach(mv.radius) ? hitBoss(mv) : whiff()));
        break;
    }
  }
  const decalAt = (x, z, r, dur, col) => decal("circle", { x, z, r, dur, col });
  function whiff() {
    if (B.iframe > 0) return hitBoss({ type: "normal", power: 0 }); // shows "dodged!" once
    dmgText(B.x, B.y + B.h + 0.8, B.z, "missed", "miss");
  }
  const timers = [];
  const later = (t, fn) => timers.push({ t, fn });

  function hitBoss(mv) {
    if (st.phase !== "fight" || B.hp <= 0) return;
    if (B.iframe > 0) {
      // it slipped out of the way
      if (!B.dodgeShown) {
        B.dodgeShown = true;
        dmgText(B.x, B.y + B.h + 0.8, B.z, "dodged!", "miss");
        effText(`${st.stats.name} dodged it!`);
      }
      return;
    }
    const { dmg, crit, mult } = playerHit(mv, mon(), st.stats);
    B.hp = Math.max(0, B.hp - dmg);
    B.flash = 0.09;
    B.hitT = 0.16;
    const big = mult > 1 || crit || mv.power >= 100;
    {
      const g = toBoss(),
        ix = B.x - g.x * B.r * 0.75,
        iz = B.z - g.z * B.r * 0.75,
        iy = B.y + B.h * 0.5;
      impactFx(ix, iy, iz, TYPE_COLORS[mv.type], big ? 5 : 3.5);
      burst(ix, iy, iz, TYPE_COLORS[mv.type], big ? 10 : 6, 6, 2, 0.45);
    }
    st.freeze = reduced ? 0 : big ? 0.09 : 0.05;
    shake(big ? 0.4 : 0.22);
    sfx.hit(big);
    dmgNum("b", dmg, mult > 1 ? "super" : mult < 1 ? "weak" : crit ? "crit" : "", B.x, B.y + B.h + 0.6, B.z);
    effText(crit ? "A critical hit!" + (mult > 1 ? " It's super effective!" : "") : effectLabel(mult));
    cheer(big ? 1 : 0.4);
    setBars();
    if (B.hp <= 0) {
      st.phase = "win";
      st.t = 0;
      B.faint = 0;
      for (const d of [...decals]) killDecal(d);
      for (const s of [...shots]) if (s.from === "b") killShot(s);
      sfx.roar();
      later(0.6, () => sfx.fanfare());
      shake(0.8);
      banner(`${st.stats.name} fainted!`, "", 2.2);
      cheer(2);
    } else if (!B.enraged && B.hp < B.maxHp * 0.5) {
      B.enraged = true;
      $("pbBoss").classList.add("enraged");
      sfx.roar();
      shake(0.5);
      banner(`${st.stats.name} is enraged!`, "faster · chains attacks", 1.4);
      B.cd = Math.min(B.cd, 0.3);
    }
  }

  /** `part`: the share of the move's damage this hit carries (each shot of a volley is only part of it) */
  function hurtPlayer(mv, fromX, fromZ, part = 1) {
    if (st.phase !== "fight") return false;
    const p = mon();
    if (p.out) return false;
    if (P.iframe > 0) {
      dmgText(P.x, P.y + 3.4, P.z, "dodged!", "miss");
      return false;
    }
    const hit = bossHit(mv, st.stats, p),
      mult = hit.mult,
      dmg = Math.max(1, Math.round(hit.dmg * part));
    p.hpNow = Math.max(0, p.hpNow - dmg);
    P.iframe = 0.5;
    P.hurtT = 0.3;
    dmgNum("p", dmg, "ouch", P.x, P.y + 3.6, P.z);
    impactFx(P.x, P.y + chestY(), P.z, TYPE_COLORS[mv.type], 3);
    effText(mult > 1 ? `It's super effective on ${p.name}!` : mult < 1 ? `${p.name} resists it` : "");
    sfx.hurt();
    shake(0.45);
    hurtFlash();
    const dx = P.x - fromX,
      dz = P.z - fromZ,
      d = Math.hypot(dx, dz) || 1;
    P.vx += (dx / d) * 14;
    P.vz += (dz / d) * 14;
    setBars();
    if (p.hpNow <= 0) faint();
    return true;
  }
  function faint() {
    const p = mon();
    p.out = true;
    banner(`${p.name} fainted!`, "", 1.4);
    sfx.sad();
    setBars();
    const next = st.team.findIndex((q) => !q.out);
    if (next < 0) {
      st.phase = "lose";
      st.t = 0;
      return;
    }
    later(1.1, () => {
      P.switchCd = 0;
      switchTo(next);
    });
  }
  function cheer(k) {
    if (crowd) crowd.userData.cheer = Math.max(crowd.userData.cheer || 0, k);
  }

  /* ================= projectiles ================= */
  const shotGeo = new THREE.SphereGeometry(1, 14, 10);
  const starGeo = (() => {
    const sh = new THREE.Shape();
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU,
        r = k % 2 ? 0.32 : 1;
      k ? sh.lineTo(Math.cos(a) * r, Math.sin(a) * r) : sh.moveTo(r, 0);
    }
    sh.closePath();
    const hole = new THREE.Path();
    hole.absarc(0, 0, 0.14, 0, TAU, true);
    sh.holes.push(hole);
    return new THREE.ShapeGeometry(sh);
  })();
  const bladeGeo = new THREE.RingGeometry(0.65, 1, 24, 1, 0.1 * Math.PI, 0.8 * Math.PI);
  const CORE = { fire: "#fff6c4", ghost: "#170b26", dark: "#0c0814", poison: "#5a1f8a", electric: "#ffffff", psychic: "#fff0fb" };
  // a projectile: an orb of its element (default), a spinning shuriken or a crescent blade of wind
  function addShot(o) {
    const look = (o.move && o.move.look) || "orb",
      type = o.move ? o.move.type : "normal",
      g = new THREE.Group(),
      spin = new THREE.Group();
    g.add(spin);
    if (look === "shuriken") {
      const m = new THREE.Mesh(starGeo, glowMat(o.col, 1)),
        e = new THREE.Mesh(starGeo, glowMat("#ffffff", 0.9));
      e.scale.setScalar(0.6);
      e.position.z = 0.01;
      spin.add(m, e);
    } else if (look === "blade") {
      const m = new THREE.Mesh(bladeGeo, glowMat(o.col, 0.95)),
        e = new THREE.Mesh(bladeGeo, glowMat("#ffffff", 0.85));
      e.scale.setScalar(0.85);
      spin.add(m, e);
    } else {
      const halo = new THREE.Mesh(shotGeo, glowMat(o.col, 0.35)),
        body = new THREE.Mesh(shotGeo, glowMat(o.col, 0.95)),
        core = new THREE.Mesh(shotGeo, glowMat(CORE[type] || "#ffffff", 0.95));
      halo.scale.setScalar(1.55);
      core.scale.setScalar(0.6);
      spin.add(halo, body, core);
      o.halo = halo;
    }
    g.scale.setScalar(o.r * (look === "orb" ? 1 : look === "blade" ? 2.6 : 1.8));
    g.position.set(o.x, o.y, o.z);
    g.lookAt(o.x + o.vx, o.y + o.vy, o.z + o.vz); // flat shapes face along their flight
    Object.assign(o, { look, type, spin, mesh: g, P_: elemP(type) });
    scene.add(g);
    shots.push(o);
  }
  function killShot(s) {
    scene.remove(s.mesh);
    s.mesh.traverse((q) => q.material && q.material.dispose());
    const i = shots.indexOf(s);
    if (i >= 0) shots.splice(i, 1);
  }
  /** a lobbed move lands: Fire Blast's five-armed blaze, Sludge Bomb's splat, … */
  function explode(mv, x, z, col) {
    const type = mv.type,
      big = mv.power >= 100;
    ringFx(x, 0.3, z, mv.radius, col, 0.45);
    domeFx(x, 0.6, z, mv.radius * 0.8, col, 0.3);
    elemBurst(type, x, 1, z, big ? 2.6 : 1.8);
    flashAt(x, 3, z, col, big ? 2 : 1.2);
    shake(big ? 0.6 : 0.4);
    sfx.hit(true);
    if (type === "fire") {
      for (let a = 0; a < 5; a++) {
        const ang = (a / 5) * TAU + Math.PI / 2;
        for (let j = 0; j < 9; j++) fireP(x, 1 + j * 0.1, z, Math.cos(ang) * (5 + j * 2.4), 2 + Math.sin(ang) * 2, Math.sin(ang) * (5 + j * 2.4), 1.5, 0.7);
      }
      for (let j = 0; j < 14; j++) emit(x + rv(), 1, z + rv(), rv() * 2, rr(4, 9), rv() * 2, "#ff8a3c", "#3a3338", 1.2, 3.4, rr(0.8, 1.4), -2, 1.4, 0.6); // smoke column
      scorch(x, z, mv.radius, "#2a2228", 5);
    } else if (type === "poison") {
      for (let j = 0; j < 22; j++) gloopP(x, 0.6, z, rv() * 9, rr(3, 9), rv() * 9, 1.3, 0.8);
      scorch(x, z, mv.radius, "#7a2fb8", 5);
    } else scorch(x, z, mv.radius * 0.8, "#2a2228", 3.5);
  }
  function updShots(dt) {
    for (const s of [...shots]) {
      s.life -= dt;
      if (s.lob) s.vy -= 9.8 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      s.mesh.position.set(s.x, s.y, s.z);
      if (s.look === "shuriken") s.spin.rotation.z += dt * 30;
      else if (s.look === "blade") s.spin.rotation.z = Math.sin(s.life * 30) * 0.15;
      else {
        s.spin.rotation.y += dt * 7;
        if (s.halo) s.halo.scale.setScalar(1.45 + Math.sin(s.life * 40) * 0.18);
      }
      // a trail of its element streaming off behind it
      if (dt > 0) for (let i = 0; i < 3; i++) s.P_(s.x + rv() * s.r * 0.5, s.y + rv() * s.r * 0.5, s.z + rv() * s.r * 0.5, -s.vx * 0.12 + rv(), -s.vy * 0.12 + rr(0, 1), -s.vz * 0.12 + rv(), 0.6 + s.r * 0.6, 0.4);
      if (s.from === "p") {
        if (s.lob) {
          if (s.life <= 0) {
            const mv = s.move;
            explode(mv, s.lob.tx, s.lob.tz, s.col);
            if (Math.hypot(B.x - s.lob.tx, B.z - s.lob.tz) < mv.radius + B.r * 0.6) hitBoss(mv);
            else whiff();
            killShot(s);
          }
          continue;
        }
        const dh = Math.hypot(s.x - B.x, s.z - B.z);
        if (dh < B.r * 0.85 + s.r && s.y > B.y - 0.5 && s.y < B.y + B.h + 1) {
          if (B.iframe <= 0) {
            elemBurst(s.type, s.x, s.y, s.z, 0.6);
            flashAt(s.x, s.y, s.z, s.col, 0.5);
          }
          hitBoss(s.move);
          killShot(s);
          continue;
        }
      } else if (Math.hypot(s.x - P.x, s.z - P.z) < 1.2 + s.r && Math.abs(s.y - (P.y + chestY())) < 2 + s.r) {
        if (P.iframe <= 0) {
          elemBurst(s.type, s.x, s.y, s.z, 0.7);
          flashAt(s.x, s.y, s.z, s.col, 0.6);
        }
        hurtPlayer(s.move, s.x - s.vx, s.z - s.vz, 0.5);
        killShot(s);
        continue;
      }
      if (s.y < 0.15 && !s.lob) {
        elemBurst(s.type, s.x, 0.3, s.z, 0.4);
        killShot(s);
        continue;
      }
      if (s.life <= 0 || Math.hypot(s.x, s.z) > R + 20) killShot(s);
    }
  }

  /* ================= boss brain ================= */
  const CLOSE = new Set(["swipe", "slam", "dash"]);
  function pickMove(d) {
    const moves = st.stats.moves,
      close = d < B.r + 11;
    let opts = moves.filter((m) => (close ? true : !["swipe", "slam"].includes(m.shape)) && m !== B.last);
    if (!opts.length) opts = moves;
    const sig = opts.find((m) => m.sig);
    if (sig && Math.random() < (B.enraged ? 0.45 : 0.28)) return sig;
    // up close prefer close attacks, far away prefer ranged
    const pref = opts.filter((m) => (close ? CLOSE.has(m.shape) : !CLOSE.has(m.shape) || m.shape === "dash"));
    const pool = pref.length && Math.random() < 0.75 ? pref : opts;
    return pool[Math.floor(Math.random() * pool.length)];
  }
  function windup(mv, quick = 1) {
    const S = SHAPE[mv.shape],
      k = (mv.sig ? 1.15 : 1) * (B.enraged ? 0.8 : 1) * quick;
    if (B.decal) killDecal(B.decal);
    for (const sp of B.rainSpots) killDecal(sp.d);
    B.rainSpots = [];
    Object.assign(B, { state: "windup", meteors: false, move: mv, last: mv, t: 0, wind: S.wind * k, decal: null, act: null });
    const f = toBoss(); // player → boss, so the boss aims along −f
    B.aimX = -f.x;
    B.aimZ = -f.z;
    callout(mv);
    sfx.warn();
    const rot = Math.atan2(-B.aimX, -B.aimZ);
    switch (mv.shape) {
      case "swipe":
        B.decal = decal("sector", { x: B.x, z: B.z, r: (S.reach + B.r) * (mv.sig ? 1.15 : 1), arc: S.arc, rot, dur: B.wind });
        break;
      case "slam":
        B.decal = decal("circle", { x: B.x, z: B.z, r: (S.reach + B.r) * (mv.sig ? 1.2 : 1), dur: B.wind });
        break;
      case "dash":
      case "beam":
        B.decalW = mv.shape === "dash" ? B.ra * 2 + 0.6 : S.width * (mv.sig ? 1.35 : 1);
        B.decalLen = S.len;
        B.decal = decal("rect", { x: B.x, z: B.z, w: B.decalW, len: B.decalLen, rot, dur: B.wind });
        break;
      case "volley":
        B.shotsLeft = S.shots + (B.enraged ? 2 : 0) + (mv.sig ? 2 : 0);
        B.shotT = 0;
        // the line the shots will fly along (tracks you until they're fired) — step off it
        B.decal = decal("rect", { x: B.x, z: B.z, w: 2, len: 40, rot, dur: B.wind * 0.55 });
        break;
      case "rain": {
        B.rainSpots = [];
        const n = S.n + (B.enraged ? 1 : 0) + (mv.sig ? 1 : 0);
        for (let i = 0; i < n; i++) {
          let x, z;
          for (let tries = 0; tries < 12; tries++) {
            const a = Math.random() * TAU,
              d = i === 0 ? 0 : rr(5, 10);
            x = P.x + P.vx * 0.3 + Math.cos(a) * d;
            z = P.z + P.vz * 0.3 + Math.sin(a) * d;
            const l = Math.hypot(x, z);
            if (l > R - 2) (x *= (R - 2) / l), (z *= (R - 2) / l);
            if (B.rainSpots.every((q) => Math.hypot(q.x - x, q.z - z) > S.radius * 1.5)) break;
          }
          B.rainSpots.push({ x, z, d: decal("circle", { x, z, r: S.radius, dur: B.wind }) });
        }
        break;
      }
    }
  }
  function strike() {
    const mv = B.move,
      S = SHAPE[mv.shape],
      type = mv.type,
      col = TYPE_COLORS[type];
    B.state = "strike";
    B.t = 0;
    B.act = { kind: mv.shape, t: 0, dur: 0.3 };
    switch (mv.shape) {
      case "swipe": {
        const dx = P.x - B.x,
          dz = P.z - B.z,
          d = Math.hypot(dx, dz),
          cosA = (dx * B.aimX + dz * B.aimZ) / (d || 1),
          R_ = (S.reach + B.r) * (mv.sig ? 1.15 : 1),
          hd = Math.atan2(-B.aimX, -B.aimZ);
        slashFx(B.x + B.aimX * (B.r + 1.5), B.y + B.h * 0.45 + 1.4, B.z + B.aimZ * (B.r + 1.5), hd, clamp(B.r * 0.9, 2.6, 4), col, 0.7, /Claw|Sword/.test(mv.n) ? 3 : 1);
        const P_ = elemP(type);
        for (let a = -S.arc; a <= S.arc; a += 0.18) {
          const ca = Math.cos(a),
            sa = Math.sin(a),
            vx = B.aimX * ca - B.aimZ * sa,
            vz = B.aimZ * ca + B.aimX * sa;
          P_(B.x + vx * (B.r + 1), B.y + B.h * 0.4, B.z + vz * (B.r + 1), vx * 16, rr(0, 2), vz * 16, 1.1, Math.max(0.2, (R_ - B.r) / 16));
        }
        if (d < R_ + 0.6 && cosA > Math.cos(S.arc + 0.1)) hurtPlayer(mv, B.x, B.z);
        sfx.hit(false);
        return recover(0.6);
      }
      case "slam": {
        const R_ = (S.reach + B.r) * (mv.sig ? 1.2 : 1);
        ringFx(B.x, 0.3, B.z, R_, col, 0.5);
        const P_ = elemP(type);
        for (let a = 0; a < TAU; a += TAU / 30) P_(B.x + Math.cos(a) * B.r, 0.6, B.z + Math.sin(a) * B.r, Math.cos(a) * 18, rr(1, 5), Math.sin(a) * 18, 1.5, Math.max(0.2, (R_ - B.r) / 18));
        elemBurst(type, B.x, 1, B.z, 1.6);
        scorch(B.x, B.z, R_ * 0.75, "#2a2228", 4);
        flashAt(B.x, 3, B.z, col, 1.6);
        shake(0.65);
        sfx.hit(true);
        const d = Math.hypot(P.x - B.x, P.z - B.z);
        if (d < R_ + 0.6) hurtPlayer(mv, B.x, B.z);
        return recover(0.8);
      }
      case "dash":
        B.dash = { left: S.len, hit: false };
        sfx.whoosh();
        return;
      case "beam": {
        const len = B.decalLen,
          w = B.decalW,
          oy = B.y + B.h * 0.6,
          ox = B.x + B.aimX * B.r * 0.7,
          oz = B.z + B.aimZ * B.r * 0.7;
        beamFx(ox, oy, oz, B.x + B.aimX * len, 1.2, B.z + B.aimZ * len, w * 0.7, type, S.dur + 0.1);
        shake(0.45);
        sfx.hit(true);
        const rx = P.x - B.x,
          rz = P.z - B.z,
          along = rx * B.aimX + rz * B.aimZ,
          perp = Math.abs(rx * -B.aimZ + rz * B.aimX);
        if (along > 0 && along < len && perp < w / 2 + 0.9) hurtPlayer(mv, B.x, B.z);
        return recover(0.75);
      }
      case "volley":
        return; // fired over time in tickBoss
      case "rain": {
        for (const sp of B.rainSpots) {
          elemBurst(type, sp.x, 0.8, sp.z, 1.5);
          ringFx(sp.x, 0.25, sp.z, S.radius, col, 0.35);
          scorch(sp.x, sp.z, S.radius * 0.9, "#2a2228", 3.5);
        }
        flashAt(P.x, 4, P.z, col, 1.4);
        shake(0.5);
        sfx.hit(true);
        if (B.rainSpots.some((sp) => Math.hypot(P.x - sp.x, P.z - sp.z) < S.radius + 0.5)) hurtPlayer(mv, P.x - 1, P.z - 1);
        B.rainSpots = [];
        // hard mode: a second wave often follows, aimed at wherever you ran to
        if (!B.echo && Math.random() < (B.enraged ? HARD.echoEnraged : HARD.echo)) {
          B.echo = true;
          return windup(mv, 0.85);
        }
        return recover(0.7);
      }
    }
  }
  // after every attack the boss is open for a moment — that's when to hit it
  function recover(t) {
    B.state = "recover";
    B.echo = false;
    B.t = 0;
    B.rec = t * (B.enraged ? 0.8 : 1);
    B.cd = B.enraged && Math.random() < HARD.chain ? 0.05 : rr(HARD.gap[0], HARD.gap[1]) * (B.enraged ? 0.7 : 1);
  }
  // the boss reads your move and sidesteps it (only while it's free to move: never mid-attack or while recovering)
  function bossEvade() {
    if (st.phase !== "fight" || B.state !== "chase" || B.evadeCd > 0 || B.hp <= 0) return;
    if (Math.random() > (B.enraged ? HARD.evadeEnraged : HARD.evade)) return;
    B.evadeCd = HARD.evadeCd * (B.enraged ? 0.75 : 1);
    later(0.06, () => {
      if (B.state !== "chase" || B.hp <= 0) return;
      const f = toBoss();
      let dx = -f.z,
        dz = f.x;
      // step to the side that keeps it nearer the middle of the arena
      if (Math.hypot(B.x + dx * 8, B.z + dz * 8) > Math.hypot(B.x - dx * 8, B.z - dz * 8)) (dx = -dx), (dz = -dz);
      B.evade = { t: 0, dur: 0.26, dx, dz, dist: 7 + B.r * 0.6 };
      B.iframe = 0.36;
      B.dodgeShown = false;
      sfx.whoosh();
      dust(B.x, B.z, 12, 6);
    });
  }

  function tickBoss(dt) {
    const f = toBoss(),
      d = f.d,
      speed = (B.enraged ? 9.5 : 7.5) * (B.swim ? 0.85 : 1),
      faceP = Math.atan2(f.x, f.z); // boss heading that faces the player (forward is −Z)
    B.t += dt;
    B.evadeCd -= dt;
    B.iframe -= dt;
    if (B.act && (B.act.t += dt) > B.act.dur) B.act = null;
    if (B.evade) {
      const e = B.evade,
        step = (e.dist / e.dur) * dt;
      B.x += e.dx * step;
      B.z += e.dz * step;
      if ((e.t += dt) >= e.dur) B.evade = null;
      B.hd += angDiff(faceP, B.hd) * Math.min(1, dt * 10);
    } else
      switch (B.state) {
        case "idle":
        case "chase": {
          B.state = "chase";
          // hold the middle of the arena: close in when you're far, circle when you're near
          const c = Math.hypot(B.x, B.z);
          let mx = 0,
            mz = 0;
          if (c > R * 0.4) (mx = -B.x / c), (mz = -B.z / c);
          else if (d > B.r + 10) (mx = -f.x), (mz = -f.z);
          else if (d > B.r + 3) {
            if ((B.strafeT -= dt) <= 0) (B.strafeT = rr(1.2, 2.6)), (B.strafe = Math.random() < 0.5 ? 1 : -1);
            mx = f.z * B.strafe * 0.55;
            mz = -f.x * B.strafe * 0.55;
          }
          B.vx = damp(B.vx, mx * speed, 5, dt);
          B.vz = damp(B.vz, mz * speed, 5, dt);
          B.hd += angDiff(faceP, B.hd) * Math.min(1, dt * 6);
          B.cd -= dt;
          if (B.cd <= 0) windup(pickMove(d));
          break;
        }
        case "windup": {
          B.vx = damp(B.vx, 0, 9, dt);
          B.vz = damp(B.vz, 0, 9, dt);
          const k = B.t / B.wind,
            mv = B.move;
          // aimed attacks track you until late in the windup, then lock: that's your cue to dodge
          if ((mv.shape === "beam" || mv.shape === "dash" || mv.shape === "swipe" || mv.shape === "volley") && k < HARD.track) {
            B.aimX = -f.x;
            B.aimZ = -f.z;
            if (B.decal) {
              B.decal.g.position.set(B.x, B.decal.g.position.y, B.z);
              B.decal.g.rotation.y = Math.atan2(-B.aimX, -B.aimZ);
            }
          }
          B.hd += angDiff(Math.atan2(-B.aimX, -B.aimZ), B.hd) * Math.min(1, dt * 9);
          if (mv.shape === "slam") B.jump = Math.sin(Math.min(1, k) * Math.PI) * 4.5;
          // energy gathers into it while it charges
          if (dt > 0) chargeFx(mv.type, B.x + B.aimX * B.r * 0.5, B.y + B.h * 0.6, B.z + B.aimZ * B.r * 0.5, B.r + 2.5, mv.sig ? 3 : 2);
          if (mv.shape === "rain" && !B.meteors && k > 0.45) {
            B.meteors = true;
            for (const sp of B.rainSpots) meteorFx(sp.x, sp.z, mv.type, B.wind - B.t);
          }
          if (mv.shape === "volley") {
            B.shotT -= dt;
            if (k > 0.55 && B.shotT <= 0 && B.shotsLeft > 0) {
              B.shotT = SHAPE.volley.gap;
              B.shotsLeft--;
              const oy = B.y + B.h * 0.6,
                lead = B.shotsLeft % 2 ? Math.hypot(P.x - B.x, P.z - B.z) / SHAPE.volley.speed : 0.12,
                tx = P.x + P.vx * lead + rr(-0.6, 0.6),
                tz = P.z + P.vz * lead + rr(-0.6, 0.6),
                ty = P.y + chestY(),
                dx = tx - B.x,
                dz = tz - B.z,
                dd = Math.hypot(dx, dz) || 1,
                sp = SHAPE.volley.speed * (mv.sig ? 1.15 : 1);
              addShot({ x: B.x + (dx / dd) * B.r, y: oy, z: B.z + (dz / dd) * B.r, vx: (dx / dd) * sp, vy: ((ty - oy) / dd) * sp, vz: (dz / dd) * sp, r: mv.sig ? 0.9 : 0.7, life: 4, from: "b", move: mv, col: TYPE_COLORS[mv.type] });
              B.act = { kind: "volley", t: 0, dur: 0.14 };
              flashAt(B.x, oy, B.z, TYPE_COLORS[mv.type], 0.4);
              sfx.cast(mv.type);
            }
            if (B.shotsLeft <= 0 && k >= 1) recover(0.55);
            break;
          }
          if (k >= 1) {
            B.jump = 0;
            strike();
          }
          break;
        }
        case "strike":
          if (B.dash) {
            const step = SHAPE.dash.speed * dt;
            B.x += B.aimX * step;
            B.z += B.aimZ * step;
            B.dash.left -= step;
            if (dt > 0) {
              dust(B.x - B.aimX * B.r, B.z - B.aimZ * B.r, 2, 3);
              B.dash.P_ ||= elemP(B.move.type);
              B.dash.P_(B.x + rv() * B.r, B.y + B.h * rr(0.2, 0.8), B.z + rv() * B.r, -B.aimX * 6, rr(0, 2), -B.aimZ * 6, 1.2, 0.4);
            }
            // it hits what's in its lane as its body sweeps through (the lane is the marked strip)
            const rx = P.x - B.x,
              rz = P.z - B.z;
            if (!B.dash.hit && Math.abs(rx * B.aimX + rz * B.aimZ) < B.ra + 1.3 && Math.abs(rx * -B.aimZ + rz * B.aimX) < B.ra + 1.2) {
              B.dash.hit = true;
              if (hurtPlayer(B.move, B.x - B.aimX, B.z - B.aimZ)) sfx.hit(true);
            }
            if (B.dash.left <= 0 || Math.hypot(B.x, B.z) > R - B.r - 1) {
              B.dash = null;
              shake(0.3);
              dust(B.x, B.z, 14, 7);
              recover(0.95);
            }
          }
          break;
        case "recover":
          B.vx = damp(B.vx, 0, 6, dt);
          B.vz = damp(B.vz, 0, 6, dt);
          B.hd += angDiff(faceP, B.hd) * Math.min(1, dt * 3);
          if (B.t > B.rec) B.state = "chase";
          break;
      }
    if (!B.dash && !B.evade) {
      B.x += B.vx * dt;
      B.z += B.vz * dt;
    }
    B.v = Math.hypot(B.vx, B.vz);
    const l = Math.hypot(B.x, B.z),
      lim = R - B.r - 2;
    if (l > lim) (B.x *= lim / l), (B.z *= lim / l);
  }

  /* ================= per-frame ================= */
  function tickPlayer(dt) {
    const p = mon(),
      f = toBoss();
    P.iframe -= dt;
    P.rollCd -= dt;
    P.switchCd -= dt;
    P.cast -= dt;
    P.gcd -= dt;
    P.hurtT -= dt;
    if (P.anim && (P.anim.t += dt) > P.anim.dur) P.anim = null;
    for (let i = 0; i < 4; i++) if (p.cd[i] > 0) p.cd[i] = Math.max(0, p.cd[i] - dt);
    // Pokémon resting on the bench slowly get their breath back: switching is how you recover
    for (const q of st.team) if (q !== p && !q.out && q.hpNow < q.hp) q.hpNow = Math.min(q.hp, q.hpNow + HARD.regen * dt);
    if ((P.barT = (P.barT || 0) + dt) > 0.5) (P.barT = 0), setBars();
    if (p.out) {
      P.vx = damp(P.vx, 0, 6, dt);
      P.vz = damp(P.vz, 0, 6, dt);
    } else if (P.lunge) {
      const L = P.lunge;
      L.t += dt;
      const step = (L.dist / L.dur) * dt;
      P.x += L.dx * step;
      P.z += L.dz * step;
      if (dt > 0) wispP(P.x, P.y + chestY(), P.z, -L.dx * 3, 0.5, -L.dz * 3, 0.9, 0.3, "#6a5a8a", "#0c0814");
      if (L.t >= L.dur) {
        const mv = L.mv;
        slashFx(P.x + L.dx * 2, P.y + chestY() + 1.2, P.z + L.dz * 2, Math.atan2(-L.dx, -L.dz), 2.8, TYPE_COLORS[mv.type], -0.7);
        if (toBoss().d - B.r < 3.2) hitBoss(mv);
        else whiff();
        P.lunge = null;
      }
    } else if (P.roll > 0) {
      P.roll -= dt;
      P.vx = P.rx * 24;
      P.vz = P.rz * 24;
      P.spin += dt * (TAU / 0.3);
    } else {
      const ix = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0),
        iy = (keys.w || keys.arrowup ? 1 : 0) - (keys.s || keys.arrowdown ? 1 : 0);
      let dx = f.x * iy - f.z * ix,
        dz = f.z * iy + f.x * ix;
      const l = Math.hypot(dx, dz);
      const sp = p.speed * (keys.shift ? 1.35 : 1) * (P.cast > 0 ? 0.5 : 1);
      if (l > 0) (dx = (dx / l) * sp), (dz = (dz / l) * sp);
      P.vx = damp(P.vx, dx, 10, dt);
      P.vz = damp(P.vz, dz, 10, dt);
      P.spin = 0;
    }
    if (!P.lunge) {
      P.x += P.vx * dt;
      P.z += P.vz * dt;
    }
    // stay in the arena, and out of the boss
    const l = Math.hypot(P.x, P.z);
    if (l > R - 1.5) (P.x *= (R - 1.5) / l), (P.z *= (R - 1.5) / l);
    const bx = P.x - B.x,
      bz = P.z - B.z,
      bd = Math.hypot(bx, bz),
      minD = B.r + 1.1;
    if (bd < minD && B.hp > 0 && !B.dash) (P.x = B.x + (bx / (bd || 1)) * minD), (P.z = B.z + (bz / (bd || 1)) * minD);
    // look where you run; turn to the boss when you attack or stand still
    if (P.roll <= 0 && !p.out) {
      const speed = Math.hypot(P.vx, P.vz),
        aiming = P.cast > 0 || P.anim || P.lunge || speed < 1.5,
        want = aiming ? Math.atan2(-f.x, -f.z) : Math.atan2(-P.vx, -P.vz);
      P.hd += angDiff(want, P.hd) * Math.min(1, dt * (aiming ? 16 : 11));
    }
  }

  const M4 = new THREE.Matrix4();
  function poseModels(dt, t) {
    /* ---------- your Pokémon ---------- */
    const p = mon(),
      mm = teamModels[p.key],
      speed = Math.hypot(P.vx, P.vz);
    const y = p.flies ? 2 + Math.sin(t * 3) * 0.35 : p.floats ? 0.6 + Math.sin(t * 2.4) * 0.25 : 0;
    P.y = y;
    // attack body animation: lunges, recoil, leaning into a stream, hops and spins
    let fwd = 0,
      hop = 0,
      yawA = 0,
      pitchA = 0,
      shakeA = 0,
      pop = 1;
    if (P.anim) {
      const k = P.anim.t / P.anim.dur,
        e = Math.sin(Math.min(1, k) * Math.PI);
      switch (P.anim.kind) {
        case "melee":
          fwd = 2 * e;
          yawA = Math.sin(k * TAU) * 0.22;
          pop = 1 + 0.1 * e;
          pitchA = -0.22 * e;
          break;
        case "dash":
          pitchA = -0.3 * e;
          break;
        case "projectile":
        case "multi":
          fwd = k < 0.25 ? k * 2.4 : -0.6 * e; // throw forward, then recoil
          pitchA = 0.12 * e;
          yawA = P.anim.kind === "multi" ? Math.sin(k * TAU * 1.5) * 0.3 : 0;
          break;
        case "cone":
        case "beam":
          pitchA = -0.2 * e;
          shakeA = 0.08 * e;
          fwd = -0.5 * e;
          break;
        case "lob":
        case "strike":
          hop = 1.2 * e;
          pitchA = 0.22 * e;
          break;
        case "ring":
          hop = 1.8 * e;
          yawA = k * TAU;
          pop = 1 + 0.12 * e;
          break;
      }
    }
    let rollPitch = 0,
      rollF = 0,
      rollY = 0;
    if (P.roll > 0) {
      // a forward somersault about the body's middle (the model's origin is at its feet)
      const c = 1.5,
        th = P.spin;
      rollPitch = -th;
      rollF = c * Math.sin(th);
      rollY = c * (1 - Math.cos(th));
    }
    if (p.out) {
      // fainted: topple over backwards, then fade away
      const k = clamp(st.outT || 0, 0, 1);
      pitchA += Math.min(1, k * 1.8) * 1.35;
    }
    const scale = 1.3 * pop * (p.out ? Math.max(0.01, 1 - Math.max(0, (st.outT || 0) - 0.55) * 2.2) : 1);
    // animated models (Greninja): blend idle / walk / run by speed and keep the feet on the floor in every pose
    let foot = 0;
    if (mm.mixer && mm.act.idle) {
      const w = Math.min(1, speed / 4.5),
        r = mm.act.run ? clamp((speed - 4.5) / 5, 0, 1) : 0,
        weights = { idle: 1 - w, walk: mm.act.walk ? w * (1 - r) : 0, run: mm.act.walk ? w * r : w };
      let tot = 0;
      for (const k of Object.keys(mm.act)) {
        const a = mm.act[k],
          cur = damp(a.getEffectiveWeight(), weights[k] ?? 0, 14, dt || 0.016);
        a.setEffectiveWeight(cur);
        foot += cur * (mm.footOf[k] || 0);
        tot += cur;
      }
      foot = tot > 0 ? foot / tot : 0;
      if (mm.act.run) mm.act.run.timeScale = clamp(speed / 9, 0.7, 1.5);
      mm.mixer.update(dt);
    }
    const fwdX = -Math.sin(P.hd),
      fwdZ = -Math.cos(P.hd),
      bob = !p.flies && !p.floats && !mm.act.idle ? Math.abs(Math.sin(t * speed * 1.3)) * 0.15 * Math.min(1, speed / 4) : 0;
    mm.root.position.set(P.x + fwdX * (fwd + rollF) + (shakeA ? Math.sin(t * 70) * shakeA : 0), y + hop + rollY + bob + foot * scale, P.z + fwdZ * (fwd + rollF));
    const lean = mm.act.idle ? 0 : Math.min(0.14, speed * 0.012);
    mm.root.rotation.set(-lean + pitchA + rollPitch, P.hd + yawA, P.hurtT > 0 ? Math.sin(P.hurtT * 40) * 0.18 : 0, "YXZ");
    mm.root.scale.setScalar(scale);

    /* ---------- the boss ---------- */
    const g = B.model,
      ga = g.userData.ga,
      rig = B.sp.rig;
    // bosses stand on the arena floor; fliers and floaters hover just above it
    let by = B.swim ? -(SINK[st.m.id] ?? 0.3) * B.h : st.stats.flies ? (rig.mode === 3 ? 1 : 0.45) + Math.sin(t * 1.8) * 0.2 : 0;
    by += B.jump;
    B.y = by;
    const v = B.dash ? SHAPE.dash.speed : B.evade ? 20 : B.v;
    if (rig.mode === 3) {
      B.gp = (B.gp + dt * (st.stats.flies ? 5 : 3)) % TAU;
      ga.array[1] = 0.4;
    } else if (rig.mode === 1 || rig.mode === 2) {
      const L = Math.max(0.3, rig.legTop * B.vs);
      if (v > 0.3) B.gp = (B.gp + Math.min(24, (Math.PI * v) / (2 * L * 0.4)) * dt) % TAU;
      ga.array[1] = v > 0.3 ? clamp(0.3 + v * 0.02, 0.3, 0.7) : 0;
    } else ga.array[1] = 0;
    ga.array[0] = B.gp;
    ga.needsUpdate = true;
    // body language: rear back while charging, throw itself into the strike, sag while it recovers
    const yawK = Math.min(1, 3.2 / (B.sp.r * B.vs)); // long or wide bodies swing less, or they'd sweep the whole arena
    let sy = 1 + Math.sin(t * 2.2) * 0.02,
      pitch = 0,
      yaw = 0,
      push = 0;
    if (B.state === "windup") {
      const k = Math.min(1, B.t / B.wind),
        sh = B.move.shape;
      pitch = 0.1 * k;
      sy *= sh === "dash" ? 1 - 0.1 * k : 1 + 0.05 * Math.sin(k * Math.PI);
      if (sh === "swipe") yaw = -0.7 * k * yawK;
      if (sh === "rain") by += 0.8 * k;
      push = -0.6 * k;
    }
    if (B.act) {
      const k = B.act.t / B.act.dur,
        e = Math.sin(Math.min(1, k) * Math.PI);
      if (B.act.kind === "swipe") (yaw = (-0.7 + 1.6 * Math.min(1, k * 2.5)) * yawK), (push = 1.6 * e), (pitch = -0.12 * e);
      else if (B.act.kind === "slam") sy *= 1 - 0.22 * e;
      else if (B.act.kind === "beam" || B.act.kind === "volley") (push = -0.9 * e), (pitch = -0.08 * e);
      else if (B.act.kind === "rain") pitch = -0.12 * e;
    }
    if (B.dash) (pitch = -0.14), (sy *= 0.95);
    if (B.state === "recover") (pitch = -0.08 * Math.sin(Math.min(1, B.t / B.rec) * Math.PI)), (sy *= 1 - 0.04 * Math.sin(Math.min(1, B.t / B.rec) * Math.PI));
    if (st.phase === "win") {
      B.faint = Math.min(1, B.faint + dt * 0.6);
      by -= B.faint * B.h * 0.4;
    }
    // recoil when hit: rock back away from you
    B.hitT = Math.max(0, (B.hitT || 0) - dt);
    const rk = B.hitT > 0 ? Math.sin((B.hitT / 0.16) * Math.PI) : 0,
      away = toBoss(),
      fx_ = -Math.sin(B.hd),
      fz_ = -Math.cos(B.hd);
    g.position.set(B.x + away.x * rk * 0.5 + fx_ * push, by, B.z + away.z * rk * 0.5 + fz_ * push);
    g.rotation.set(pitch + rk * 0.12 + (st.phase === "win" ? B.faint * 0.9 : 0), B.hd + yaw, st.phase === "win" ? B.faint * 0.4 : 0, "YXZ");
    g.scale.set(B.vs / Math.sqrt(sy), B.vs * sy, B.vs / Math.sqrt(sy));
    // its body glows with the move's energy while it charges; a white flash when it's hit; faded while it sidesteps
    B.flash -= dt;
    const charge = B.state === "windup" ? Math.min(1, B.t / B.wind) : 0;
    if (charge > 0) _c2.set(TYPE_COLORS[B.move.type]).multiplyScalar(0.12 + charge * 0.4);
    for (const mat of g.userData.mats) {
      if (!mat.emissive) continue;
      if (B.flash > 0) mat.emissive.setScalar(0.55);
      else if (charge > 0) mat.emissive.copy(_c2);
      else mat.emissive.setScalar(0);
    }
    g.visible = !(B.iframe > 0 && Math.sin(t * 60) > 0.2);
    // crowd bounce
    if (crowd) {
      const c = (crowd.userData.cheer = Math.max(0, (crowd.userData.cheer || 0) - dt * 0.8));
      crowd.userData.base.forEach(([x, y, z, a, ph], i) => {
        M4.makeRotationY(-a + Math.PI / 2).setPosition(x, y + Math.max(0, Math.sin(t * 9 + ph)) * (0.08 + c * 0.6), z);
        crowd.setMatrixAt(i, M4);
      });
      crowd.instanceMatrix.needsUpdate = true;
    }
    for (const fl of flags) fl.rotation.z = Math.sin(t * 3 + fl.position.x) * 0.15;
  }

  const camT = new THREE.Vector3(),
    camL = new THREE.Vector3();
  function tickCamera(dt, t) {
    const f = toBoss(),
      p = mon();
    if (st.phase === "intro") {
      // circle the boss while it roars, then swing behind you
      const k = clamp(st.t / 2.2, 0, 1),
        a = B.hd + 0.6 - k * 1.2,
        dist = 10 + B.h * 1.2;
      camT.set(B.x - Math.sin(a) * dist, B.h * 0.5 + 3, B.z - Math.cos(a) * dist);
      camL.set(B.x, B.h * 0.55, B.z);
    } else {
      // over your shoulder, looking past you at the boss; high enough to read the floor markings
      const back = 12.5 + B.h * 0.4 + Math.max(0, B.r - 2.5) * 0.8 + (p.flies ? 1.5 : 0),
        up = 6.2 + B.h * 0.22;
      camT.set(P.x - f.x * back - f.z * 3.2, P.y * 0.5 + up, P.z - f.z * back + f.x * 3.2);
      // it may float out over the wall and the stands — it just rises to clear them
      const cr = Math.hypot(camT.x, camT.z);
      if (cr > R + 10) (camT.x *= (R + 10) / cr), (camT.z *= (R + 10) / cr);
      if (cr > R - 1) camT.y = Math.max(camT.y, 7.6 + (Math.min(cr, R + 10) - (R - 1)) * 0.28);
      const ahead = Math.min(f.d, 14) * 0.55;
      camL.set(P.x + f.x * ahead, 1.6 + B.h * 0.28, P.z + f.z * ahead);
    }
    const k = 1 - Math.exp(-(st.phase === "intro" ? 2.5 : 4.5) * dt);
    if (!camera.userData.look) camera.userData.look = camL.clone();
    if (st.snapCam) {
      // first frame in the arena: jump straight there (the camera was out in the world)
      st.snapCam = false;
      camera.position.copy(camT);
      camera.userData.look.copy(camL);
    }
    camera.position.lerp(camT, k);
    camera.userData.look.lerp(camL, k);
    if (st.trauma > 0) {
      st.trauma = Math.max(0, st.trauma - dt * 1.8);
      const sh = st.trauma * st.trauma;
      camera.position.x += Math.sin(t * 47) * sh * 0.55;
      camera.position.y += Math.sin(t * 61) * sh * 0.4;
      camera.position.z += Math.cos(t * 53) * sh * 0.55;
    }
    camera.lookAt(camera.userData.look);
  }

  let lastT = 0;
  function update(dt, t) {
    if (st.phase === "off" || st.phase === "offer") {
      if (st.phase === "offer" && st.m && (!st.m.sp || Math.hypot(car.x - st.m.x, car.z - st.m.z) > st.m.sp.r + 14)) closeOffer();
      return;
    }
    if (st.phase === "loading") return;
    lastT = t;
    if (st.runArm > 0) st.runArm -= dt;
    if (banT > 0 && (banT -= dt) <= 0) $("pbBan").classList.remove("show");
    if (effT > 0 && (effT -= dt) <= 0) $("pbEff").classList.remove("show");
    if (callT > 0 && (callT -= dt) <= 0) $("pbCall").classList.remove("show");
    updDmg(dt);
    // hit-stop: the world freezes for a few frames, the camera and UI keep going
    const frozen = st.freeze > 0;
    if (frozen) st.freeze -= dt;
    const sdt = frozen ? 0 : dt;
    for (const tm of [...timers]) {
      tm.t -= sdt;
      if (tm.t <= 0) {
        timers.splice(timers.indexOf(tm), 1);
        tm.fn();
      }
    }
    st.t += dt;
    if (st.phase === "intro") {
      if (st.t > 2.3) {
        st.phase = "fight";
        banner(`Go! ${mon().name}!`, "", 1.2);
      }
    } else if (st.phase === "fight") {
      tickPlayer(sdt);
      tickBoss(sdt);
      updShots(sdt);
    } else if (st.phase === "win") {
      if (st.t > 2.6) result(true);
    } else if (st.phase === "lose") {
      st.outT = Math.min(1, (st.outT || 0) + dt);
      if (st.t > 1.8) result(false);
    }
    st.outT = mon().out ? Math.min(1, (st.outT || 0) + dt * 1.1) : 0;
    updDecals(sdt);
    updFx(dt);
    updParticles(sdt);
    poseModels(sdt, t);
    tickCamera(dt, t);
    updMoveCds();
  }

  return {
    scene,
    /** true while the arena (or its loading screen) owns the screen */
    get inArena() {
      return st.phase !== "off" && st.phase !== "offer";
    },
    get active() {
      return st.phase !== "off" && st.phase !== "offer";
    },
    get offering() {
      return st.phase === "offer";
    },
    get state() {
      return { phase: st.phase, boss: B, player: P, team: st.team, active: st.active, stats: st.stats };
    },
    offer,
    challenge,
    /** dev aid: make the boss start its i-th move now (used to check every attack's animation) */
    debugBossMove(i) {
      if (st.phase === "fight" && st.stats.moves[i]) windup(st.stats.moves[i]);
    },
    useMove,
    dodge,
    switchTo,
    run,
    update,
  };
}
