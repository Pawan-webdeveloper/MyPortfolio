// Home-screen 3D stage: Pawan (trainer cap on) standing beside Greninja in the classic
// trainer-and-partner battle-ready pose, plus a small portrait renderer for the TEAM cards.
// Runs in its own transparent WebGL canvas layered over the (untouched) game canvas.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { buildHero } from "../hero.js";
import { buildTrainer } from "./trainer.js";

const ROOT = new URL("../", import.meta.url).href;
// same URLs the game requests, so the browser cache serves them once
export const MODEL_URLS = {
  greninja: ROOT + "models/pokemon/greninja-lite.glb?v=glide-1",
  charizard: ROOT + "models/pokemon/charizard.glb",
  gengar: ROOT + "models/pokemon/gengar.glb",
};
const HEIGHTS = { greninja: 1.5, charizard: 1.7, gengar: 1.25 };

const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const SMALL = Math.min(screen.width, screen.height) < 820 || matchMedia("(pointer: coarse)").matches;

let loader = null;
function getLoader() {
  if (!loader) loader = new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath(ROOT + "vendor/draco/"));
  return loader;
}
const glbCache = new Map();
export function loadGLB(url, onProgress) {
  if (!glbCache.has(url)) glbCache.set(url, getLoader().loadAsync(url, onProgress));
  return glbCache.get(url);
}

function findBone(root, prefix) {
  let out = null;
  root.traverse((o) => {
    if (!out && o.isBone && o.name.startsWith(prefix)) out = o;
  });
  return out;
}

// Normalise a Pokémon scene: real-world height, feet on y=0, centred, facing +Z (towards camera)
function preparePokemon(scene, name) {
  scene.traverse((o) => {
    if (/lod[12]/i.test(o.name)) o.visible = false;
    if (!o.isMesh) return;
    if (!o.geometry.getAttribute("normal")) o.geometry.computeVertexNormals();
    const conv = (m) => {
      const n = new THREE.MeshStandardMaterial({
        color: m.color ? m.color.clone() : 0xffffff,
        map: m.map || null,
        transparent: !!m.transparent,
        alphaTest: m.alphaTest || (m.transparent ? 0.3 : 0),
        side: m.side,
        roughness: 0.62,
        metalness: 0,
      });
      if (n.map) n.map.colorSpace = THREE.SRGBColorSpace;
      n.name = m.name;
      return n;
    };
    o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
    o.castShadow = true;
    o.frustumCulled = false;
  });
  const root = new THREE.Group();
  root.add(scene);
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene, true);
  const s = HEIGHTS[name] / Math.max(1e-3, box.getSize(new THREE.Vector3()).y);
  scene.scale.multiplyScalar(s);
  scene.updateMatrixWorld(true);
  box.setFromObject(scene, true);
  const c = box.getCenter(new THREE.Vector3());
  scene.position.set(scene.position.x - c.x, scene.position.y - box.min.y, scene.position.z - c.z);
  root.updateMatrixWorld(true);
  const feet = { greninja: ["left_foot_index_02", "left_foot_55"], charizard: ["LToe", "LFoot"], gengar: ["LToe", "LFoot"] }[name];
  const toe = findBone(scene, feet[0]), ankle = findBone(scene, feet[1]);
  if (toe && ankle) {
    const tz = toe.getWorldPosition(new THREE.Vector3()).z, az = ankle.getWorldPosition(new THREE.Vector3()).z;
    if (tz < az) scene.rotation.y += Math.PI; // toes point away from camera: turn around
  }
  root.updateMatrixWorld(true);
  return root;
}

// Ash-Greninja style water shuriken (our own geometry)
function waterShuriken(radius) {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  const blades = 4, inner = radius * 0.2;
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2;
    const tip = [Math.cos(a) * radius, Math.sin(a) * radius];
    const a2 = a + Math.PI / blades;
    const valley = [Math.cos(a2) * inner, Math.sin(a2) * inner];
    const cA = a + 0.32, cR = radius * 0.62; // curved trailing edge for a swirl
    if (i === 0) shape.moveTo(Math.cos(a - Math.PI / blades) * inner, Math.sin(a - Math.PI / blades) * inner);
    shape.quadraticCurveTo(Math.cos(a - 0.08) * radius * 0.55, Math.sin(a - 0.08) * radius * 0.55, tip[0], tip[1]);
    shape.quadraticCurveTo(Math.cos(cA) * cR, Math.sin(cA) * cR, valley[0], valley[1]);
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: radius * 0.05, bevelEnabled: true, bevelThickness: radius * 0.03, bevelSize: radius * 0.025, bevelSegments: 3, curveSegments: 10 });
  geo.translate(0, 0, -radius * 0.025);
  const water = new THREE.MeshPhysicalMaterial({
    color: "#3ec3f2",
    emissive: "#0f8fd0",
    emissiveIntensity: 0.45,
    roughness: 0.12,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    transparent: true,
    opacity: 0.9,
  });
  const body = new THREE.Mesh(geo, water);
  body.castShadow = true;
  g.add(body);
  // bright inner swirl
  const hl = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 0.3, radius * 0.045, 10, 48),
    new THREE.MeshPhysicalMaterial({ color: "#e8fdff", emissive: "#9be9ff", emissiveIntensity: 0.6, roughness: 0.1, transparent: true, opacity: 0.95 }),
  );
  hl.position.z = radius * 0.06;
  g.add(hl);
  const core = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.11, 20, 14), water);
  core.scale.z = 0.6;
  core.position.z = radius * 0.05;
  g.add(core);
  return g;
}

function addLights(scene, renderer, shadowSize) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.environmentIntensity = 0.55;
  const key = new THREE.DirectionalLight("#fff0dc", 2.7);
  key.position.set(1.4, 3.4, 2.8);
  if (shadowSize) {
    key.castShadow = true;
    key.shadow.mapSize.set(shadowSize, shadowSize);
    Object.assign(key.shadow.camera, { left: -1.6, right: 1.6, top: 2.2, bottom: -0.4, near: 0.5, far: 9 });
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.012;
    key.shadow.radius = 4;
  }
  scene.add(key);
  const rim = new THREE.DirectionalLight("#8fe3ff", 3.0);
  rim.position.set(-2.4, 2.4, -2.4);
  scene.add(rim);
  const rim2 = new THREE.DirectionalLight("#ffd2a8", 1.5);
  rim2.position.set(2.6, 1.3, -2.0);
  scene.add(rim2);
  scene.add(new THREE.HemisphereLight("#d6ecff", "#8d7a62", 0.75));
  return key;
}

function makeRenderer(maxDpr) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.setClearColor(0x000000, 0);
  return renderer;
}

// soft battle pad under the duo
function battlePad() {
  const cv = document.createElement("canvas");
  cv.width = 512;
  cv.height = 256;
  const g = cv.getContext("2d");
  g.translate(256, 128);
  g.scale(1, 0.5);
  const grd = g.createRadialGradient(0, 0, 0, 0, 0, 250);
  grd.addColorStop(0, "rgba(251,248,239,0.95)");
  grd.addColorStop(0.72, "rgba(244,239,226,0.9)");
  grd.addColorStop(0.86, "rgba(214,204,180,0.85)");
  grd.addColorStop(1, "rgba(214,204,180,0)");
  g.fillStyle = grd;
  g.beginPath();
  g.arc(0, 0, 250, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 7;
  g.strokeStyle = "rgba(31,29,43,0.75)";
  g.beginPath();
  g.arc(0, 0, 214, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 3;
  g.strokeStyle = "rgba(31,154,138,0.7)";
  g.beginPath();
  g.arc(0, 0, 196, 0, Math.PI * 2);
  g.stroke();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 1.55), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(0.05, 0.001, 0.05);
  m.renderOrder = -1;
  return m;
}

/* ================================================================ stage */
export async function createStage(host, opts = {}) {
  const onProgress = opts.onProgress || (() => {});
  const renderer = makeRenderer(SMALL ? 1.5 : 2);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const canvas = renderer.domElement;
  canvas.className = "stage-canvas";
  canvas.setAttribute("aria-hidden", "true");
  host.appendChild(canvas);

  const scene = new THREE.Scene();
  addLights(scene, renderer, SMALL ? 1024 : 2048);
  const camera = new THREE.PerspectiveCamera(22, 1, 0.05, 40);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.ShadowMaterial({ opacity: 0.3 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground, battlePad());

  // progress across both downloads
  const prog = { hero: 0, gren: 0 };
  const report = () => onProgress(Math.min(1, prog.hero * 0.15 + prog.gren * 0.85));
  const pr = (k) => (e) => {
    if (e && e.total) prog[k] = e.loaded / e.total;
    report();
  };

  const [H, gGltf] = await Promise.all([
    // Pawan as a trainer (CC0 base body, dressed in home/trainer.js); the older sculpted model is a fallback
    buildTrainer({ loader: getLoader(), onProgress: pr("hero") }).catch((err) => {
      console.warn("[stage] trainer model failed, using fallback", err);
      return buildHero({ loader: getLoader(), onProgress: pr("hero"), cap: true });
    }),
    loadGLB(MODEL_URLS.greninja, pr("gren")),
  ]);
  const isTrainer = !!H.body;
  prog.hero = prog.gren = 1;
  report();

  // --- Pawan (trainer, left)
  const hero = H.rig;
  hero.position.set(-0.46, 0, 0);
  hero.rotation.y = 0.22;
  scene.add(hero);

  // --- Greninja (right), cloned so the portrait renderer can reuse the original
  const gScene = cloneSkinned(gGltf.scene);
  const gren = preparePokemon(gScene, "greninja");
  gren.position.set(0.56, 0, 0.12);
  gren.rotation.y = 0.1;
  scene.add(gren);
  const mixer = new THREE.AnimationMixer(gScene);
  const clip = (n) => gGltf.animations.find((a) => a.name.includes(n));
  const idle = mixer.clipAction(clip("defaultwait01"));
  idle.play();
  // Ash-Greninja's water shuriken on its back
  const spine = findBone(gScene, "spine_02");
  const shuriken = waterShuriken(0.62);
  {
    gren.updateMatrixWorld(true);
    const sp = spine.getWorldPosition(new THREE.Vector3());
    const back = new THREE.Vector3(0, 0, -1).applyQuaternion(gren.getWorldQuaternion(new THREE.Quaternion()));
    const holder = new THREE.Group();
    holder.position.copy(sp).addScaledVector(back, 0.24).add(new THREE.Vector3(0, 0.2, 0));
    holder.quaternion.copy(gren.getWorldQuaternion(new THREE.Quaternion()));
    holder.rotateX(-0.25);
    holder.add(shuriken);
    scene.add(holder);
    spine.attach(holder);
  }

  // jump on tap: plays Greninja's hop clips once, then back to idle
  const once = (n) => {
    const a = mixer.clipAction(clip(n));
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    return a;
  };
  const hopSeq = [once("jumpup01_start"), once("jumpdown01_start"), once("land02")];
  let hopping = false;
  function hop() {
    if (hopping || REDUCED) return;
    hopping = true;
    let i = 0;
    const playNext = (prev) => {
      const a = hopSeq[i++];
      if (!a) {
        idle.reset().fadeIn(0.25).play();
        if (prev) prev.fadeOut(0.25);
        hopping = false;
        return;
      }
      a.reset().play();
      if (prev) prev.crossFadeTo(a, 0.08, false);
      else idle.crossFadeTo(a, 0.12, false);
    };
    const onFin = (e) => {
      if (!hopSeq.includes(e.action)) return;
      if (i >= hopSeq.length) {
        mixer.removeEventListener("finished", onFin);
      }
      playNext(e.action);
    };
    mixer.addEventListener("finished", onFin);
    playNext(null);
  }

  // --- framing: keep both characters in view with headroom for any aspect
  const frame = () => {
    const w = host.clientWidth || 1, h = host.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const halfV = THREE.MathUtils.degToRad(camera.fov / 2);
    // world units to fit; narrow (portrait) stages get extra side room for the spinning shuriken
    const narrow = camera.aspect < 1.4;
    const needH = 2.2, needW = narrow ? 2.8 : 2.45, cx = narrow ? 0.14 : 0.06;
    const dH = needH / 2 / Math.tan(halfV);
    const dW = needW / 2 / (Math.tan(halfV) * camera.aspect);
    const d = Math.max(dH, dW);
    camera.position.set(cx, 1.18, d);
    camera.lookAt(cx, 0.98, 0);
    camera.updateProjectionMatrix();
  };
  frame();
  const ro = new ResizeObserver(frame);
  ro.observe(host);

  // --- pointer: trainer's head + eyes follow the cursor; tap Greninja to make it hop
  const look = new THREE.Vector2(), lookT = new THREE.Vector2();
  const onMove = (e) => {
    const r = canvas.getBoundingClientRect();
    if (!r.width) return;
    const hx = r.left + r.width * 0.36, hy = r.top + r.height * 0.18;
    lookT.set(THREE.MathUtils.clamp((e.clientX - hx) / (innerWidth * 0.5), -1, 1), THREE.MathUtils.clamp((e.clientY - hy) / (innerHeight * 0.6), -1, 1));
  };
  addEventListener("pointermove", onMove, { passive: true });
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const onTap = (e) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects([gren, hero], true)[0];
    if (!hit) return;
    let o = hit.object, isGren = false;
    while (o) {
      if (o === gren) isGren = true;
      o = o.parent;
    }
    if (isGren) hop();
    else wave = 1.6;
  };
  canvas.addEventListener("click", onTap);

  // --- pose: trainer thrusts his arm up and ahead ("Let's go, Greninja!") while Greninja holds its
  //     battle crouch beside him, water shuriken spinning on its back
  let wave = 0;
  const pose = { armL: [0, 0, 0], armR: [0, 0, 0], spine: [0, 0, 0], neck: [0, 0, 0], hips: [0, 0, 0] };
  const clock = new THREE.Clock();
  let raf = 0, running = false, intro = REDUCED ? 1 : 0, T = 0;
  const tick = () => {
    raf = running ? requestAnimationFrame(tick) : 0;
    step(Math.min(clock.getDelta(), 0.05));
  };
  const step = (dt) => {
    const t = (T += dt);
    intro = Math.min(1, intro + dt / 1.4);
    const k = 1 - Math.pow(1 - intro, 3); // ease out
    look.lerp(lookT, 1 - Math.exp(-dt * 4));
    wave = Math.max(0, wave - dt);
    const wv = wave > 0 ? Math.sin((1.6 - wave) * 9) * 0.25 * Math.min(1, wave * 2) : 0;
    const pulse = REDUCED ? 0 : Math.sin(t * 1.6) * 0.03;
    pose.armL[0] = (-2.0 + pulse) * k;
    pose.armL[2] = (0.5 + wv) * k;
    pose.armR[0] = 0.05 * k;
    pose.armR[2] = -0.14 * k;
    pose.spine[0] = 0.03 * k;
    pose.spine[1] = 0.12 * k;
    pose.neck[0] = 0.05 * k;
    pose.neck[1] = 0.1 * k;
    pose.k = k;
    pose.wave = wv;
    H.update(dt, REDUCED ? 0 : t, look, pose);
    if (!REDUCED) mixer.update(dt);
    else if (t < 0.1) mixer.update(0.5);
    shuriken.rotation.z -= dt * (REDUCED ? 0 : 1.6);
    hero.position.y = 0;
    renderer.render(scene, camera);
  };
  const setRunning = (v) => {
    if (v === running) return;
    running = v;
    if (v) {
      clock.getDelta();
      tick();
    } else cancelAnimationFrame(raf);
  };
  setRunning(true);
  const onVis = () => setRunning(document.visibilityState === "visible" && wantRun);
  let wantRun = true;
  document.addEventListener("visibilitychange", onVis);

  // waist-up still of Pawan for the trainer card (Greninja hidden, arm relaxed)
  function snapshotTrainer(w = 320, h = 360) {
    const pw = renderer.domElement.width, ph = renderer.domElement.height, pr = renderer.getPixelRatio();
    const cam = new THREE.PerspectiveCamera(20, w / h, 0.05, 30);
    const hp = hero.position;
    cam.position.set(hp.x + 0.35, 1.5, 2.6);
    cam.lookAt(hp.x, 1.36, 0);
    gren.visible = false;
    shuriken.parent.visible = false;
    H.update(0, T, new THREE.Vector2(-0.1, 0), isTrainer ? { k: 0, relaxed: true } : { armL: [0.04, 0, 0.12], armR: [0.04, 0, -0.12], neck: [0.02, -0.15, 0] });
    renderer.setPixelRatio(1);
    renderer.setSize(w * 2, h * 2, false);
    renderer.render(scene, cam);
    const url = renderer.domElement.toDataURL("image/png");
    gren.visible = true;
    shuriken.parent.visible = true;
    renderer.setPixelRatio(pr);
    renderer.setSize(pw / pr, ph / pr, false);
    frame();
    step(0);
    return url;
  }

  return {
    canvas,
    hop,
    snapshotTrainer,
    // dev/test hook: advance the animation without requestAnimationFrame (hidden tabs)
    debug: { scene, camera, renderer, hero: H, gren, shuriken, pose, render: () => renderer.render(scene, camera), advance(sec) { for (let i = 0; i < sec * 30; i++) step(1 / 30); } },
    setActive(v) {
      wantRun = v;
      onVis();
    },
    dispose() {
      wantRun = false;
      setRunning(false);
      ro.disconnect();
      removeEventListener("pointermove", onMove);
      document.removeEventListener("visibilitychange", onVis);
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}

/* ============================================================= portraits */
// One small renderer shared by every TEAM card. mount() moves its canvas into a card corner and
// animates that Pokémon; snapshot() renders a still PNG for the party list.
export function createPortraits() {
  let renderer = null, scene, camera, current = null, raf = 0, running = false;
  const models = {};
  const clock = new THREE.Clock();
  const init = () => {
    if (renderer) return;
    renderer = makeRenderer(SMALL ? 1.5 : 2);
    renderer.domElement.className = "portrait-canvas";
    renderer.domElement.setAttribute("aria-hidden", "true");
    scene = new THREE.Scene();
    addLights(scene, renderer, 0);
    camera = new THREE.PerspectiveCamera(24, 1, 0.05, 30);
  };
  async function get(name) {
    if (models[name]) return models[name];
    const gltf = await loadGLB(MODEL_URLS[name]);
    const sc = cloneSkinned(gltf.scene);
    const root = preparePokemon(sc, name);
    const m = { root, mixer: null, name };
    if (name === "greninja") {
      m.mixer = new THREE.AnimationMixer(sc);
      m.mixer.clipAction(gltf.animations.find((a) => a.name.includes("defaultwait01"))).play();
    }
    if (name === "charizard") {
      // wings-up battle stance: lift the arms out of the bind pose a little
      for (const b of ["LArm", "RArm"]) {
        const bone = findBone(sc, b);
        if (bone) bone.rotation.z += b[0] === "L" ? -0.15 : 0.15;
      }
    }
    models[name] = m;
    return m;
  }
  const fit = (name, w, h) => {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // generous headroom: Greninja's idle and Charizard's wings reach past their bind-pose height
    const H = HEIGHTS[name] * 1.3;
    const halfV = THREE.MathUtils.degToRad(camera.fov / 2);
    const d = Math.max(H / 2 / Math.tan(halfV), (HEIGHTS[name] * 1.15) / 2 / (Math.tan(halfV) * camera.aspect));
    camera.position.set(0, HEIGHTS[name] * 0.56, d);
    camera.lookAt(0, HEIGHTS[name] * 0.52, 0);
    camera.updateProjectionMatrix();
  };
  const show = (m) => {
    for (const k in models) scene.remove(models[k].root);
    scene.add(m.root);
  };
  const tick = () => {
    raf = running ? requestAnimationFrame(tick) : 0;
    if (!current) return;
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
    if (current.mixer && !REDUCED) current.mixer.update(dt);
    const r = current.root;
    r.rotation.y = REDUCED ? -0.35 : -0.35 + Math.sin(t * 0.6) * 0.25;
    r.position.y = current.name === "gengar" && !REDUCED ? Math.sin(t * 2) * 0.03 + 0.03 : 0;
    renderer.render(scene, camera);
  };
  return {
    preload: (names) => Promise.all(names.map((n) => loadGLB(MODEL_URLS[n]))),
    async snapshot(name, w = 220, h = 220) {
      init();
      const m = await get(name);
      show(m);
      if (m.mixer) m.mixer.update(0.4);
      m.root.rotation.y = -0.35;
      m.root.position.y = 0;
      fit(name, w, h);
      renderer.render(scene, camera);
      const url = renderer.domElement.toDataURL("image/png");
      if (current) {
        show(current);
        const host = renderer.domElement.parentElement;
        if (host) fit(current.name, host.clientWidth, host.clientHeight);
      }
      return url;
    },
    async mount(host, name) {
      init();
      const m = await get(name);
      current = m;
      show(m);
      host.appendChild(renderer.domElement);
      fit(name, host.clientWidth || 160, host.clientHeight || 160);
      if (!running) {
        running = true;
        clock.getDelta();
        tick();
      }
    },
    unmount() {
      running = false;
      cancelAnimationFrame(raf);
      current = null;
      if (renderer) renderer.domElement.remove();
    },
    dispose() {
      this.unmount();
      if (renderer) {
        renderer.dispose();
        renderer.forceContextLoss();
        renderer = null;
      }
    },
  };
}
