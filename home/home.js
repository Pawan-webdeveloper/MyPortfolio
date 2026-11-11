// Pawan's portfolio home screen: a Pokémon-style start menu over the live game world.
// PLAY hands over to the game's own start button (#go); nothing in the game script is changed.
// While the home is open it owns the keyboard (capture phase), so the game never sees menu keys.
import * as C from "./content.js";
import { createSkillMap } from "./skillmap.js";

const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem(k);
      return v === null ? d : JSON.parse(v);
    } catch (_) {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch (_) {}
  },
};

/* ------------------------------------------------------------------ icons */
const I = {
  play: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"><rect x="3" y="9" width="26" height="15" rx="7.5" fill="#fbf8ef" stroke="#1f1d2b"/><path d="M9 13.5v6M6 16.5h6" stroke="#1f1d2b"/><circle cx="21.5" cy="14.5" r="1.8" fill="#d6452f" stroke="none"/><circle cx="24.5" cy="18.5" r="1.8" fill="#1f9a8a" stroke="none"/></svg>`,
  team: `<svg viewBox="0 0 32 32" stroke="#1f1d2b" stroke-width="2"><g><circle cx="9" cy="19" r="6" fill="#fbf8ef"/><path d="M3 19a6 6 0 0 1 12 0z" fill="#d6452f"/><circle cx="9" cy="19" r="1.8" fill="#fbf8ef"/></g><g><circle cx="23" cy="19" r="6" fill="#fbf8ef"/><path d="M17 19a6 6 0 0 1 12 0z" fill="#2f7fd1"/><circle cx="23" cy="19" r="1.8" fill="#fbf8ef"/></g><g><circle cx="16" cy="10" r="6" fill="#fbf8ef"/><path d="M10 10a6 6 0 0 1 12 0z" fill="#f2c230"/><circle cx="16" cy="10" r="1.8" fill="#fbf8ef"/></g></svg>`,
  journey: `<svg viewBox="0 0 32 32" stroke="#1f1d2b" stroke-width="2" stroke-linejoin="round"><rect x="3" y="7" width="26" height="18" rx="3" fill="#f2c230"/><rect x="6" y="11" width="8" height="10" rx="1.5" fill="#fbf8ef"/><circle cx="10" cy="15" r="2" fill="#1f1d2b" stroke="none"/><path d="M17 12h9M17 16h9M17 20h6" stroke-linecap="round"/></svg>`,
  skills: `<svg viewBox="0 0 32 32" stroke="#1f1d2b" stroke-width="2" stroke-linejoin="round"><path d="M3 8l8-3 10 3 8-3v19l-8 3-10-3-8 3z" fill="#9fd38c"/><path d="M11 5v19M21 8v19" stroke-opacity=".5"/><path d="M7 20c4-1 5-7 9-7s4 4 9 3" fill="none" stroke="#d6452f" stroke-dasharray="2 2"/><circle cx="25" cy="15" r="2.4" fill="#d6452f"/></svg>`,
  contact: `<svg viewBox="0 0 32 32" stroke="#1f1d2b" stroke-width="2" stroke-linejoin="round"><rect x="8" y="3" width="16" height="26" rx="4" fill="#2f7fd1"/><rect x="11" y="7" width="10" height="9" rx="1.5" fill="#d8f0c8"/><circle cx="13" cy="22" r="1.8" fill="#d6452f"/><circle cx="19" cy="22" r="1.8" fill="#1f3f7a"/></svg>`,
  scanlyfix: `<svg viewBox="0 0 32 32" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="13.5" r="8.5" fill="#d9efff" stroke="#1f1d2b" stroke-width="2.4"/><path d="M9.5 13.8l2.8 2.8 5.2-5.6" stroke="#1f9a8a" stroke-width="2.6"/><path d="M20 20l7 7" stroke="#1f1d2b" stroke-width="3.2"/></svg>`,
  bennet: `<svg viewBox="0 0 32 32" stroke-linejoin="round"><path d="M5 8a4 4 0 0 1 4-4h14a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H13l-6 5v-5.3A4 4 0 0 1 5 18z" fill="#ffe0b8" stroke="#1f1d2b" stroke-width="2.2"/><path d="M16 8.5l1.4 3.1 3.1 1.4-3.1 1.4L16 17.5l-1.4-3.1-3.1-1.4 3.1-1.4z" fill="#e2622f"/></svg>`,
  thirdeye: `<svg viewBox="0 0 32 32" stroke-linejoin="round"><path d="M3 16c3.5-6 8-9 13-9s9.5 3 13 9c-3.5 6-8 9-13 9S6.5 22 3 16z" fill="#efe3ff" stroke="#1f1d2b" stroke-width="2.2"/><circle cx="16" cy="16" r="5.2" fill="#7a4fc4" stroke="#1f1d2b" stroke-width="2"/><circle cx="16" cy="16" r="2" fill="#1f1d2b"/><circle cx="17.6" cy="14.4" r="1" fill="#fff"/></svg>`,
  mail: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6.5l8.5 7 8.5-7"/></svg>`,
  in: `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="9" width="3.4" height="11" rx=".6"/><circle cx="5.7" cy="5.6" r="2"/><path d="M10 9h3.2v1.6c.6-1 1.8-1.9 3.6-1.9 3 0 3.7 2 3.7 4.6V20h-3.4v-5.9c0-1.4-.3-2.6-1.8-2.6s-2 1.1-2 2.6V20H10z"/></svg>`,
  code: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 4.5l-3 15"/></svg>`,
  web: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>`,
};
const projIcon = (id) => I[id] || I.scanlyfix;

/* ------------------------------------------------------------------ sound */
// tiny square-wave blips for menu feedback; starts only after the first gesture
const sfx = {
  ctx: null,
  on: store.get("pw-home-sound", true),
  tone(seq) {
    if (!this.on) return;
    try {
      this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === "suspended") this.ctx.resume();
      let t = this.ctx.currentTime;
      for (const [f, d] of seq) {
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.type = "square";
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.035, t + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g).connect(this.ctx.destination);
        o.start(t);
        o.stop(t + d + 0.02);
        t += d * 0.9;
      }
    } catch (_) {}
  },
  move() {
    this.tone([[740, 0.045]]);
  },
  select() {
    this.tone([[988, 0.06], [1319, 0.09]]);
  },
  back() {
    this.tone([[659, 0.05], [494, 0.07]]);
  },
};

/* ------------------------------------------------------------------ menu */
const MENU = [
  {
    id: "play",
    label: "PLAY",
    sub: "Game Corner · Pawan World",
    icon: I.play,
    desc: "Jump into Pawan World, an open 3D world I built with three.js. Fly on Charizard, drive Gengar's jeep or run and glide as Greninja.",
  },
  {
    id: "team",
    label: "TEAM",
    sub: "Projects · my party",
    icon: I.team,
    desc: "My best projects, each one a Pokémon on my team: ScanlyFix, Bennet AI and ThirdEye. Tap one for the full card.",
  },
  {
    id: "journey",
    label: "JOURNEY",
    sub: "Trainer card · experience",
    icon: I.journey,
    desc: "My trainer card: who I am, the badges I've earned and the chapters of my work so far.",
  },
  {
    id: "skills",
    label: "SKILLS",
    sub: "Region map · tech stack",
    icon: I.skills,
    desc: "Walk the route from Frontend Town to DevOps Harbor. Every town is a part of my stack.",
  },
  {
    id: "contact",
    label: "CONTACT",
    sub: "Poké Gear · say hello",
    icon: I.contact,
    desc: "Email, LinkedIn, GitHub, or send me a message straight from here.",
  },
];

/* ------------------------------------------------------------------ DOM */
const home = document.createElement("div");
home.id = "home";
home.innerHTML = `
  <div class="h-scrim"></div><div class="h-grain"></div>
  <div class="h-wrap">
    <header class="h-top">
      <div class="h-brand">
        <img class="h-ball" src="icons/logo.svg?v=2" alt="" aria-hidden="true" />
        <div><h1>${esc(C.profile.name)}</h1><small>${esc(C.profile.role.toUpperCase())} · ID No.${esc(C.profile.trainerId)}</small></div>
      </div>
      <div class="h-tools">
        <button class="h-chip" id="hSound" aria-pressed="true" title="Menu sounds and game radio"><span aria-hidden="true">♪</span><span class="lbl">SOUND</span> <span class="st">ON</span></button>
        <button class="h-chip" id="hClassic" title="Plain one-page résumé">☰ <span>CLASSIC<span class="lbl"> VIEW</span></span></button>
      </div>
    </header>

    <div class="h-stage" id="hStage">
      <div class="h-load" id="hLoad" role="status">
        <div class="spin" aria-hidden="true"></div>
        <div class="bar" aria-hidden="true"><i id="hLoadBar"></i></div>
        <div class="txt" id="hLoadTxt">A wild portfolio appeared!</div>
      </div>
    </div>

    <div class="h-dialog">
      <div class="pk-box red" id="hDialog" title="Next">
        <span class="who">${esc(C.profile.short)}</span>
        <p id="hSay" aria-live="polite"></p>
        <span class="nxt" aria-hidden="true">▼</span>
      </div>
    </div>

    <nav class="h-menu" aria-label="Main menu">
      <div class="pk-box">
        <div class="h-menu-title"><span>MENU</span><span id="hReady">LOADING…</span></div>
        <ul>
          ${MENU.map(
            (m, i) => `<li><button class="h-item${m.id === "play" ? " h-play" : ""}" data-i="${i}" data-go="${m.id}">
              <span class="cur" aria-hidden="true">▶</span><span class="ico" aria-hidden="true">${m.icon}</span>
              <span><b>${m.label}</b><small>${esc(m.sub)}</small></span>${m.id === "play" ? '<span class="ld" id="hPlayLd"></span>' : ""}
            </button></li>`,
          ).join("")}
        </ul>
        <div class="h-desc" id="hDesc"></div>
        <div class="h-keys">↑↓ SELECT · ENTER OK · ESC BACK</div>
      </div>
    </nav>

    <footer class="h-foot">${esc(C.footer)}</footer>
  </div>

  <section class="h-sheet" id="sTeam" hidden aria-labelledby="tTeam"></section>
  <div class="sum-wrap" id="sSum" hidden></div>
  <section class="h-sheet" id="sJourney" hidden aria-labelledby="tJourney"></section>
  <section class="h-sheet" id="sSkills" hidden aria-labelledby="tSkills"></section>
  <section class="h-sheet" id="sContact" hidden aria-labelledby="tContact"></section>
  <section class="h-sheet classic" id="sClassic" hidden aria-labelledby="tClassic"></section>
`;
document.body.appendChild(home);
document.body.classList.add("home-on");
let homeOpen = true;

/* ------------------------------------------------------------------ sound toggle */
const sndBtn = $("#hSound");
const syncSound = () => {
  sndBtn.setAttribute("aria-pressed", String(sfx.on));
  $(".st", sndBtn).textContent = sfx.on ? "ON" : "OFF";
  const r = document.getElementById("radioOn");
  if (r) r.checked = sfx.on;
};
syncSound();
sndBtn.addEventListener("click", () => {
  sfx.on = !sfx.on;
  store.set("pw-home-sound", sfx.on);
  syncSound();
  sfx.select();
});

/* ------------------------------------------------------------------ dialog (typewriter) */
const sayEl = $("#hSay");
let typing = null, lineIdx = 0, sayTimer = 0;
const LINES = [...C.profile.intro];
function say(text, { hold = 5200, next = true } = {}) {
  clearTimeout(sayTimer);
  if (typing) cancelAnimationFrame(typing.raf);
  const done = () => {
    typing = null;
    sayEl.textContent = text;
    if (next) sayTimer = setTimeout(nextLine, hold);
  };
  if (REDUCED) return done();
  let i = 0, last = 0;
  typing = { text, done };
  const step = (t) => {
    if (!typing) return;
    if (t - last > 26) {
      last = t;
      i += 1;
      sayEl.textContent = text.slice(0, i);
    }
    if (i >= text.length) return done();
    typing.raf = requestAnimationFrame(step);
  };
  typing.raf = requestAnimationFrame(step);
}
function nextLine() {
  if (view !== "") return;
  lineIdx = (lineIdx + 1) % LINES.length;
  say(LINES[lineIdx]);
}
$("#hDialog").addEventListener("click", () => {
  if (typing) typing.done();
  else nextLine();
  sfx.move();
});

/* ------------------------------------------------------------------ menu */
const items = $$(".h-item", home);
const desc = $("#hDesc");
let sel = 0;
function select(i, { focus = false, sound = true } = {}) {
  i = (i + items.length) % items.length;
  if (i !== sel && sound) sfx.move();
  sel = i;
  items.forEach((b, k) => b.classList.toggle("sel", k === i));
  desc.textContent = MENU[i].desc;
  if (focus) items[i].focus({ preventScroll: false });
}
select(0, { sound: false });
items.forEach((b, i) => {
  b.addEventListener("pointerenter", (e) => e.pointerType === "mouse" && select(i));
  b.addEventListener("focus", () => select(i, { sound: false }));
  b.addEventListener("click", () => activate(MENU[i].id));
});
function activate(id) {
  if (id === "play") return play();
  sfx.select();
  go(id);
}

/* ------------------------------------------------------------------ game hand-off */
let gameReady = false;
const playBtn = items[0], playLd = $("#hPlayLd"), readyEl = $("#hReady");
playBtn.setAttribute("aria-disabled", "true");
let fakeP = 0;
const readyPoll = setInterval(() => {
  if (window.__game && !document.getElementById("loading")) {
    gameReady = true;
    clearInterval(readyPoll);
    playBtn.removeAttribute("aria-disabled");
    playLd.style.width = "0";
    readyEl.textContent = "WORLD READY";
  } else {
    // the world builds in one go; show steady progress while we wait for it
    fakeP = Math.min(0.92, fakeP + (0.92 - fakeP) * 0.04);
    playLd.style.width = (fakeP * 100).toFixed(1) + "%";
  }
}, 120);
function play() {
  if (!gameReady) {
    sfx.back();
    say("The world is still being painted… PLAY unlocks in a moment!", { next: true, hold: 3000 });
    return;
  }
  sfx.select();
  const r = document.getElementById("radioOn");
  if (r) r.checked = sfx.on;
  homeOpen = false;
  try {
    history.replaceState(null, "", location.pathname + location.search);
  } catch (_) {}
  document.body.classList.remove("home-on");
  home.classList.add("leaving");
  document.getElementById("go").click(); // the game's own start()
  clearTimeout(sayTimer);
  setTimeout(() => {
    home.hidden = true;
    if (stage) stage.dispose();
    portraits?.dispose();
  }, 650);
}

/* ------------------------------------------------------------------ 3D stage (lazy) */
let stage = null, portraits = null, stageMod = null;
const loadEl = $("#hLoad"), loadBar = $("#hLoadBar"), loadTxt = $("#hLoadTxt");
const stageReady = (async () => {
  try {
    stageMod = await import("./stage.js");
    portraits = stageMod.createPortraits();
    stage = await stageMod.createStage($("#hStage"), {
      onProgress(p) {
        loadBar.style.width = (p * 100).toFixed(1) + "%";
        loadTxt.textContent = p < 1 ? `Loading… ${Math.round(p * 100)}%` : "Ready!";
      },
    });
    loadEl.classList.add("done");
    setTimeout(() => loadEl.remove(), 600);
    if (!homeOpen) stage.dispose();
    else if (view !== "") stage.setActive(false);
    // warm up the party pictures in the background
    setTimeout(() => warmParty(), 600);
    return true;
  } catch (err) {
    console.warn("[home] 3D stage unavailable:", err);
    loadTxt.textContent = "PAWAN & GRENINJA";
    loadBar.parentElement.remove();
    $(".spin", loadEl).style.animation = "none";
    return false;
  }
})();

/* ------------------------------------------------------------------ routing */
// Sections are linkable (#team, #team/scanlyfix, #journey, #skills, #contact, #classic) and the
// browser Back button closes them. depth counts entries we pushed so B/Esc never leaves the site.
let view = null, depth = 0;
const SHEETS = { team: "#sTeam", journey: "#sJourney", skills: "#sSkills", contact: "#sContact", classic: "#sClassic" };
function go(route, { replace = false } = {}) {
  if (replace) history.replaceState({ home: route, d: depth }, "", "#" + route);
  else {
    depth += 1;
    history.pushState({ home: route, d: depth }, "", "#" + route);
  }
  render(route);
}
function back() {
  if (view === "") return;
  sfx.back();
  if (depth > 0) history.back();
  else {
    const parent = view.includes("/") ? view.split("/")[0] : "";
    history.replaceState({ home: parent, d: 0 }, "", parent ? "#" + parent : location.pathname + location.search);
    render(parent);
  }
}
addEventListener("popstate", (e) => {
  if (!homeOpen) return;
  depth = (e.state && e.state.d) || 0;
  render((e.state && e.state.home) ?? location.hash.slice(1));
});

const built = {};
function render(route) {
  route = route || "";
  const [sec, sub] = route.split("/");
  const prev = view;
  view = route;
  if (!SHEETS[sec] && sec !== "") return render("");
  // sheets
  for (const [k, sel] of Object.entries(SHEETS)) {
    const el = $(sel);
    const show = k === sec;
    if (show && !built[k]) {
      BUILD[k](el);
      built[k] = true;
    }
    if (show && el.hidden) {
      el.hidden = false;
      el.classList.remove("out");
      if (el._onShow) requestAnimationFrame(() => el._onShow());
    } else if (!show && !el.hidden) {
      el.hidden = true;
      if (el._onHide) el._onHide();
    }
  }
  // team summary card
  const sumWrap = $("#sSum");
  if (sec === "team" && sub) openSummary(sub, prev);
  else if (!sumWrap.hidden) closeSummary();
  // stage only renders when the menu is visible
  if (stage) stage.setActive(sec === "");
  if (sec === "") {
    if (prev && prev !== "") {
      const i = MENU.findIndex((m) => m.id === prev.split("/")[0]);
      if (i >= 0) select(i, { focus: true, sound: false });
    }
    if (!typing) sayTimer = setTimeout(nextLine, 1200);
  } else {
    clearTimeout(sayTimer);
    if (!sub) {
      const el = $(SHEETS[sec]);
      const target = sec === "team" && prev && prev.startsWith("team/") ? $(`.slot[data-id="${prev.split("/")[1]}"]`, el) : $(".h-back", el);
      requestAnimationFrame(() => target && target.focus({ preventScroll: true }));
    }
  }
}

/* ------------------------------------------------------------------ sheet helpers */
const sheet = (el, id, title, subtitle, body) => {
  el.innerHTML = `<div class="pk-box">
      <div class="h-sh-head">
        <h2 id="${id}" tabindex="-1">${title}${subtitle ? `<small>${subtitle}</small>` : ""}</h2>
        <button class="h-back" type="button" aria-label="Back"><span class="k" aria-hidden="true">B</span><span class="t">BACK</span></button>
      </div>
      <div class="h-sh-body">${body}</div>
    </div>`;
  $(".h-back", el).addEventListener("click", back);
  return el;
};
const typeChip = (name, t, extra = "") => {
  const ty = C.types[t] || C.types.frontend;
  return `<span class="type" style="--t:${ty.color}" ${extra}>${esc(name)}</span>`;
};
const ext = (href) => `href="${esc(href)}" target="_blank" rel="noopener"`;

/* ------------------------------------------------------------------ TEAM */
const snaps = {};
async function warmParty() {
  if (!portraits) return;
  for (const p of C.team) {
    if (snaps[p.pokemon]) continue;
    try {
      snaps[p.pokemon] = await portraits.snapshot(p.pokemon, 260, 260);
      for (const el of $$(`[data-snap="${p.pokemon}"]`)) setSnap(el, p.pokemon);
    } catch (e) {
      console.warn("[home] snapshot failed", p.pokemon, e);
    }
  }
}
function setSnap(el, name) {
  if (!snaps[name]) return;
  el.innerHTML = `<img src="${snaps[name]}" alt="" draggable="false">`;
}
const slotHTML = (p, i) => `
  <button class="slot${i === 0 ? " lead" : ""}" data-id="${p.id}" style="--c1:${p.color};--c2:${p.accent}" aria-label="${esc(p.name)}: ${esc(p.tagline)}">
    <span class="logo" aria-hidden="true">${projIcon(p.id)}</span>
    <span class="pm" data-snap="${p.pokemon}"><span class="ph"></span></span>
    <span class="info">
      <span class="nm">${esc(p.name.toUpperCase())}</span>
      <span class="sub" style="display:block">${p.pokemonName} · Lv${p.level}</span>
      <span class="tl" style="display:block">${esc(p.tagline)}</span>
      <span class="hp"><span>HP</span><span class="b"><i></i></span><em>LIVE</em></span>
    </span>
  </button>`;
const BUILD = {};
BUILD.team = (el) => {
  const [lead, ...rest] = C.team;
  sheet(
    el,
    "tTeam",
    "POKéMON PARTY",
    "My projects. Each one is a Pokémon on my team. Pick one to see its card.",
    `<div class="party">
      <div class="col">${slotHTML(lead, 0)}</div>
      <div class="col">${rest.map((p, i) => slotHTML(p, i + 1)).join("")}
        <p class="party-hint">◆ More projects live in the PC box below.</p>
      </div>
    </div>
    <div class="party-pc">
      <h3>PC BOX · MORE PROJECTS</h3>
      <div class="pc-grid">${C.pcBox
        .map(
          (p) => `<div class="pc-card"><b>${esc(p.name)}</b><span>${esc(p.desc)}</span>
            <span class="lk"><a ${ext(p.url)}>Live ↗</a><a ${ext(p.repo)}>Code ↗</a></span></div>`,
        )
        .join("")}</div>
    </div>`,
  );
  for (const s of $$(".slot", el)) {
    s.addEventListener("click", () => {
      sfx.select();
      go("team/" + s.dataset.id);
    });
    s.addEventListener("pointerenter", () => $$(".slot", el).forEach((x) => x.classList.toggle("sel", x === s)));
    s.addEventListener("focus", () => $$(".slot", el).forEach((x) => x.classList.toggle("sel", x === s)));
  }
  for (const pm of $$("[data-snap]", el)) setSnap(pm, pm.dataset.snap);
  warmParty();
};

let sumIdx = -1;
function openSummary(id, prev) {
  const i = C.team.findIndex((p) => p.id === id);
  if (i < 0) return go("team", { replace: true });
  const wrap = $("#sSum");
  const fromSlot = prev === "team" ? $(`#sTeam .slot[data-id="${id}"] .pm img`) : null;
  const switching = !wrap.hidden && sumIdx >= 0;
  sumIdx = i;
  const p = C.team[i];
  const statLabels = Object.keys(p.stats);
  wrap.hidden = false;
  wrap.innerHTML = `
    <article class="sum pk-box${fromSlot && !REDUCED ? " flip" : ""}" style="--c1:${p.color};--c2:${p.accent}" aria-labelledby="sumT">
      <div class="sum-top">
        <div class="tabs"><span>No.${String(i + 1).padStart(3, "0")}</span><span>PROJECT DATA</span></div>
        <h2 id="sumT" tabindex="-1">${esc(p.name.toUpperCase())}</h2>
        <p>${esc(p.tagline)}</p>
        <div class="acts">
          <a class="btn-pk go" ${ext(p.url)}>▶ VISIT ${esc(p.urlLabel.toUpperCase())}</a>
          ${p.repo ? `<a class="btn-pk" ${ext(p.repo)}>${I.code.replace("<svg", '<svg width="16" height="16"')} GITHUB</a>` : `<span class="btn-pk" style="opacity:.75;box-shadow:none">🔒 PRIVATE REPO</span>`}
        </div>
        <div class="sum-mon" aria-hidden="true">
          <span class="pm" data-snap="${p.pokemon}"></span>
          <span class="tag">${p.pokemonName} Lv${p.level}</span>
        </div>
      </div>
      <div class="sum-body">
        <section>
          <h3>INFO</h3>
          <p class="sum-desc">${esc(p.description)}</p>
          <p class="sum-role"><b>ROLE</b>${esc(p.role)}</p>
          <div class="stats">${statLabels.map((k) => `<div class="stat"><span>${esc(k.toUpperCase())}</span><b>${esc(p.stats[k])}</b></div>`).join("")}</div>
          <h3>TYPE · TECH STACK</h3>
          <div class="types">${p.stack.map(([n, t]) => typeChip(n, t)).join("")}</div>
        </section>
        <section>
          <h3>MOVES · KEY FEATURES</h3>
          <div class="moves">${p.moves
            .map((m) => `<div class="move"><b>${esc(m.name)}</b>${typeChip((C.types[m.type] || {}).label || "", m.type)}<p>${esc(m.desc)}</p></div>`)
            .join("")}</div>
          <h3 style="margin-top:22px">ARCHITECTURE</h3>
          <div class="arch">${p.arch
            .map((a, k) => `${k ? '<div class="arch-arrow" aria-hidden="true">▼</div>' : ""}<div class="arch-node"><b>${esc(a.label)}</b><span>${esc(a.sub)}</span></div>`)
            .join("")}</div>
        </section>
      </div>
      <div class="sum-foot">
        <button class="btn-pk" data-step="-1" type="button">◀ <span class="t">PREV</span></button>
        <button class="btn-pk red" data-back type="button">B · PARTY</button>
        <button class="btn-pk" data-step="1" type="button"><span class="t">NEXT</span> ▶</button>
      </div>
    </article>`;
  const card = $(".sum", wrap);
  if (card.classList.contains("flip")) card.style.animation = "h-fade .3s ease both";
  if (switching) {
    card.style.animation = "none";
    card.classList.add("swap");
  }
  $("[data-back]", wrap).addEventListener("click", back);
  for (const b of $$("[data-step]", wrap)) b.addEventListener("click", () => stepSummary(+b.dataset.step));
  const mon = $(".sum-mon", wrap), pm = $(".pm", mon);
  setSnap(pm, p.pokemon);
  // the Pokémon slides from its party slot into the card's top-right corner
  if (fromSlot && !REDUCED) {
    const a = fromSlot.getBoundingClientRect(), b = mon.getBoundingClientRect();
    const fly = document.createElement("img");
    fly.className = "fly";
    fly.src = fromSlot.src;
    fly.alt = "";
    Object.assign(fly.style, { left: a.left + "px", top: a.top + "px", width: a.width + "px", height: a.height + "px" });
    home.appendChild(fly);
    pm.style.visibility = "hidden";
    fromSlot.style.visibility = "hidden";
    requestAnimationFrame(() =>
      requestAnimationFrame(() => Object.assign(fly.style, { left: b.left + "px", top: b.top + "px", width: b.width + "px", height: b.height + "px" })),
    );
    setTimeout(() => {
      pm.style.visibility = "";
      fromSlot.style.visibility = "";
      fly.remove();
    }, 600);
  }
  // then the live 3D model takes over in the corner
  if (portraits) {
    const myIdx = i;
    setTimeout(
      () => {
        if (sumIdx !== myIdx || wrap.hidden) return;
        portraits.mount(mon, p.pokemon).catch(() => {});
      },
      fromSlot && !REDUCED ? 560 : 60,
    );
  }
  requestAnimationFrame(() => $("#sumT", wrap).focus({ preventScroll: true }));
}
function stepSummary(d) {
  const n = (sumIdx + d + C.team.length) % C.team.length;
  sfx.move();
  portraits?.unmount();
  go("team/" + C.team[n].id, { replace: true });
}
function closeSummary() {
  const wrap = $("#sSum");
  portraits?.unmount();
  sumIdx = -1;
  const card = $(".sum", wrap);
  if (card && !REDUCED) {
    card.classList.add("out");
    setTimeout(() => {
      if (sumIdx < 0) {
        wrap.hidden = true;
        wrap.innerHTML = "";
      }
    }, 200);
  } else {
    wrap.hidden = true;
    wrap.innerHTML = "";
  }
}

/* ------------------------------------------------------------------ JOURNEY */
BUILD.journey = (el) => {
  const P = C.profile;
  sheet(
    el,
    "tJourney",
    "TRAINER CARD",
    "Who I am, what I've earned, and the chapters so far.",
    `<div class="tc">
      <div>
        <div class="tcard">
          <div class="tcard-head"><span>TRAINER CARD</span><span>IDNo. ${esc(P.trainerId)}</span></div>
          <div class="tcard-in">
            <dl>
              <dt>NAME</dt><dd>${esc(P.name.toUpperCase())}</dd>
              <dt>CLASS</dt><dd>${esc(P.role)}</dd>
              <dt>HOME</dt><dd>${esc(P.location)}</dd>
              <dt>PARTY</dt><dd>${C.team.length} projects · ${C.pcBox.length} in PC</dd>
              <dt>SINCE</dt><dd>On GitHub since 2023</dd>
            </dl>
            <div class="ava" id="tcAva"><svg viewBox="0 0 80 90" width="70%" aria-hidden="true"><circle cx="40" cy="34" r="18" fill="#a8704c"/><path d="M20 30a20 18 0 0 1 40 0z" fill="#d6452f"/><path d="M33 30a7 7 0 0 1 14 0z" fill="#fbf8ef"/><path d="M14 90c2-20 12-28 26-28s24 8 26 28z" fill="#1f1d2b"/></svg></div>
          </div>
          <div class="badges">
            <div class="lbl">BADGES</div>
            <ul>${C.badges.map((b) => `<li><span class="badge" style="--b:${b.color}" aria-hidden="true">${b.icon}</span>${esc(b.name)}</li>`).join("")}</ul>
          </div>
        </div>
        <p class="tc-about">${esc(P.about)}</p>
      </div>
      <div class="tc-time">
        <h3>JOURNEY · EXPERIENCE</h3>
        <div class="chapters">${C.journey
          .map(
            (j) => `<div class="chap pk-box"><span class="when">${esc(j.when)}</span><div class="ch">${esc(j.chapter)}</div>
              <h4>${esc(j.title)}</h4><div class="org">${esc(j.org)}</div><p>${esc(j.text)}</p></div>`,
          )
          .join("")}</div>
        <p class="tz">${esc(P.timezones)}.</p>
      </div>
    </div>`,
  );
  stageReady.then((ok) => {
    if (!ok || !stage) return;
    try {
      const url = stage.snapshotTrainer(300, 340);
      $("#tcAva", el).innerHTML = `<img src="${url}" alt="Pawan's trainer avatar">`;
    } catch (_) {}
  });
};

/* ------------------------------------------------------------------ SKILLS (region map) */
// A walkable pixel-art overworld (home/skillmap.js). Each town is one part of the stack.
BUILD.skills = (el) => {
  const T = C.towns;
  sheet(
    el,
    "tSkills",
    "REGION MAP · SKILLS",
    "Walk the routes. Every town is part of my stack.",
    `<div class="sk">
      <div class="pmap" id="pmap">
        <div class="pm-loc" id="pmLoc" aria-hidden="true"></div>
        <div class="pm-say pk-box red" id="pmSay" hidden><p aria-live="polite"></p><span class="nxt" aria-hidden="true">▼</span></div>
        <div class="pm-pad">
          <button type="button" data-d="up" aria-label="Walk up">▲</button>
          <button type="button" data-d="left" aria-label="Walk left">◀</button>
          <button type="button" data-d="right" aria-label="Walk right">▶</button>
          <button type="button" data-d="down" aria-label="Walk down">▼</button>
        </div>
        <button type="button" class="pm-a" aria-label="A: read sign">A</button>
      </div>
      <div class="map-side">
        <div class="map-info pk-box" id="mapInfo" aria-live="polite"></div>
        <div class="map-ctrl">
          <button class="btn-pk" id="mPrev" type="button">◀ PREV TOWN</button>
          <button class="btn-pk go" id="mNext" type="button">NEXT TOWN ▶</button>
        </div>
        <p class="map-help">ARROWS / WASD WALK · ENTER READ A SIGN · OR TAP A SPOT, BUILDING OR SIGN</p>
      </div>
    </div>
    <div class="map-all">
      <h3 class="sr">All skills</h3>
      <ul>${T.map((t) => `<li style="--t:${C.types[t.type].color}"><b>${esc(t.name)}</b>${t.skills.map(esc).join(" · ")}</li>`).join("")}</ul>
    </div>`,
  );
  const host = $("#pmap", el), info = $("#mapInfo", el), loc = $("#pmLoc", el), say = $("#pmSay", el);
  const showTown = (i) => {
    const t = T[i];
    info.innerHTML = `<h3>TOWN ${i + 1} / ${T.length}</h3><h4>${esc(t.name)}</h4>
      <div class="kind">${C.types[t.type].label} type · ${t.skills.length} moves learned</div>
      <div class="types">${t.skills.map((s) => typeChip(s, t.type)).join("")}</div>`;
  };
  let locT = 0, current = 0;
  const banner = (i) => {
    loc.textContent = T[i].name.toUpperCase();
    loc.classList.remove("show");
    void loc.offsetWidth;
    loc.classList.add("show");
    clearTimeout(locT);
    locT = setTimeout(() => loc.classList.remove("show"), 2600);
  };
  const sayTown = (i) => {
    const t = T[i];
    say.hidden = false;
    $("p", say).textContent = `${t.name.toUpperCase()}! PAWAN knows ${t.skills.length} moves here: ${t.skills.join(", ")}.`;
    sfx.select();
  };
  const map = createSkillMap(host, {
    towns: T,
    reduced: REDUCED,
    sfx: { bump: () => sfx.tone([[150, 0.05]]) },
    onTown: (i) => {
      current = i;
      showTown(i);
      banner(i);
    },
    onSign: (i) => {
      current = i;
      showTown(i);
      sayTown(i);
    },
  });
  showTown(0);
  const walk = (d) => {
    const n = (Math.max(0, map.town >= 0 ? map.town : current) + d + T.length) % T.length;
    say.hidden = true;
    sfx.move();
    map.walkToTown(n, () => sayTown(n));
  };
  $("#mPrev", el).addEventListener("click", () => walk(-1));
  $("#mNext", el).addEventListener("click", () => walk(1));
  say.addEventListener("click", () => (say.hidden = true));
  for (const b of $$(".pm-pad button", el)) {
    const d = b.dataset.d;
    const release = () => map.press(d, false);
    b.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      say.hidden = true;
      map.press(d, true);
      try {
        b.setPointerCapture(e.pointerId);
      } catch (_) {}
    });
    for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) b.addEventListener(ev, release);
  }
  const pressA = () => {
    if (!say.hidden) say.hidden = true;
    else map.interact();
  };
  $(".pm-a", el).addEventListener("click", pressA);
  el._onShow = () => map.start();
  el._onHide = () => map.stop();
  el._key = (dir, down) => {
    if (down) say.hidden = true;
    map.press(dir, down);
  };
  el._a = pressA;
};

/* ------------------------------------------------------------------ CONTACT (Poké Gear) */
BUILD.contact = (el) => {
  const K = C.contact;
  const link = (href, icon, label, value, color, attrs = "") =>
    `<a class="gear-link" href="${esc(href)}" ${attrs} style="--gb:${color}"><span class="gi" aria-hidden="true">${icon}</span><span><b>${label}</b><span>${esc(value)}</span></span><span class="ar" aria-hidden="true">▶</span></a>`;
  sheet(
    el,
    "tContact",
    "POKé GEAR · CONTACT",
    "Pick a channel, or write me a message right here.",
    `<div class="gear">
      <div>
        <div class="gear-dev">
          <div class="gear-scr">
            <div class="hd"><span>POKé GEAR</span><span>${esc(C.profile.location.split(",")[0].toUpperCase())}</span></div>
            <div class="gear-links">
              ${link("mailto:" + K.email, I.mail, "EMAIL", K.email, "#d6452f")}
              ${link(K.linkedin, I.in, "LINKEDIN", "in/" + K.linkedinHandle, "#2f6fb8", 'target="_blank" rel="noopener"')}
              ${link(K.github, I.code, "GITHUB", "@" + K.githubHandle, "#1f1d2b", 'target="_blank" rel="noopener"')}
              ${link(K.website, I.web, "WEBSITE", K.websiteLabel, "#1f9a8a", 'target="_blank" rel="noopener"')}
            </div>
          </div>
          <div class="gear-btns" aria-hidden="true"><i></i><i></i></div>
        </div>
        <p class="tz">${esc(C.profile.timezones)}.</p>
      </div>
      <div class="mail pk-box">
        <h3>MAIL · SEND A MESSAGE</h3>
        <form id="mailForm" novalidate>
          <label>YOUR NAME<input name="name" autocomplete="name" required maxlength="80"></label>
          <label>YOUR EMAIL<input name="email" type="email" autocomplete="email" required maxlength="120"></label>
          <label>MESSAGE<textarea name="message" required maxlength="2000" placeholder="Hi Pawan, I'd love to talk about…"></textarea></label>
          <label class="hp-trap" aria-hidden="true">LEAVE EMPTY<input name="website" tabindex="-1" autocomplete="off"></label>
          <div class="row">
            <button class="btn-pk red" type="submit">✉ SEND MAIL</button>
            <button class="btn-pk" type="button" id="copyMail">${I.copy.replace("<svg", '<svg width="16" height="16"')} COPY EMAIL</button>
          </div>
          <div class="msg" id="mailMsg" role="status"></div>
        </form>
      </div>
    </div>`,
  );
  const form = $("#mailForm", el), msg = $("#mailMsg", el);
  let lastSend = 0;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(form));
    msg.classList.remove("err");
    if (d.website) return; // bot
    if (!d.name.trim() || !/^\S+@\S+\.\S+$/.test(d.email) || d.message.trim().length < 5) {
      msg.classList.add("err");
      msg.textContent = "It's not very effective… fill in your name, a valid email and a message.";
      sfx.back();
      return;
    }
    if (Date.now() - lastSend < 8000) {
      msg.textContent = "Already on its way! Give it a few seconds.";
      return;
    }
    lastSend = Date.now();
    const subject = `Portfolio message from ${d.name.trim()}`;
    const body = `${d.message.trim()}\n\n${d.name.trim()}\n${d.email.trim()}`;
    location.href = `mailto:${K.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    msg.textContent = "Message ready in your mail app! It's super effective!";
    sfx.select();
  });
  $("#copyMail", el).addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(K.email);
      msg.classList.remove("err");
      msg.textContent = `Copied ${K.email}!`;
    } catch (_) {
      msg.textContent = K.email;
    }
    sfx.select();
  });
};

/* ------------------------------------------------------------------ CLASSIC VIEW */
BUILD.classic = (el) => {
  const P = C.profile, K = C.contact;
  sheet(
    el,
    "tClassic",
    "CLASSIC VIEW",
    "Everything on one plain page.",
    `<div class="cv">
      <h1>${esc(P.name)}</h1>
      <div class="lead">${esc(P.role)} · ${esc(P.location)}</div>
      <div class="links">
        <a href="mailto:${esc(K.email)}">${esc(K.email)}</a>
        <a ${ext(K.linkedin)}>LinkedIn</a>
        <a ${ext(K.github)}>GitHub</a>
        <a ${ext(K.website)}>${esc(K.websiteLabel)}</a>
      </div>
      <p>${esc(P.about)}</p>
      <h2>Projects</h2>
      ${C.team
        .map(
          (p) => `<div class="proj"><h3>${esc(p.name)} <span class="meta">· <a ${ext(p.url)}>${esc(p.urlLabel)}</a>${p.repo ? ` · <a ${ext(p.repo)}>GitHub</a>` : ""}</span></h3>
          <div>${esc(p.description)}</div>
          <div class="meta">${esc(p.role)}</div>
          <ul>${p.moves.map((m) => `<li><b>${esc(m.name.charAt(0) + m.name.slice(1).toLowerCase())}</b>: ${esc(m.desc)}</li>`).join("")}</ul>
          <div class="stack"><b>Architecture:</b> ${p.arch.map((a) => esc(a.label)).join(" → ")}</div>
          <div class="stack"><b>Stack:</b> ${p.stack.map(([n]) => esc(n)).join(", ")}</div></div>`,
        )
        .join("")}
      <div class="proj"><h3>More</h3><ul>${C.pcBox.map((p) => `<li><a ${ext(p.url)}>${esc(p.name)}</a>: ${esc(p.desc)} (<a ${ext(p.repo)}>code</a>)</li>`).join("")}</ul></div>
      <h2>Experience</h2>
      ${C.journey.map((j) => `<div class="job"><h3>${esc(j.title)}</h3><div class="meta">${esc(j.org)} · ${esc(j.when)}</div><div>${esc(j.text)}</div></div>`).join("")}
      <h2>Skills</h2>
      <div class="skills"><dl>${C.towns.map((t) => `<dt>${esc(t.name.replace(/ (Town|City|Cave|Tower|Harbor)$/, ""))}</dt><dd>${t.skills.map(esc).join(", ")}</dd>`).join("")}</dl></div>
      <h2>Contact</h2>
      <p>${esc(P.timezones)}. Email <a href="mailto:${esc(K.email)}">${esc(K.email)}</a> or find me on <a ${ext(K.linkedin)}>LinkedIn</a> and <a ${ext(K.github)}>GitHub</a>.</p>
      <p class="fine">${esc(C.footer)}</p>
    </div>`,
  );
};
$("#hClassic").addEventListener("click", () => {
  sfx.select();
  if (view === "classic") return back();
  if (view !== "") go("classic", { replace: true });
  else go("classic");
});

/* ------------------------------------------------------------------ keyboard */
// Capture phase on window: runs before the game's keydown listener and stops it while the home
// is open (otherwise Enter would start the game). keyup is left alone so the game's key state
// can never get stuck.
addEventListener(
  "keydown",
  (e) => {
    if (!homeOpen) return;
    e.stopImmediatePropagation();
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    const t = e.target;
    const inField = t && t.closest && t.closest("input, textarea, select, [contenteditable]");
    if (inField) {
      if (k === "Escape") {
        t.blur();
        back();
      }
      return;
    }
    const isBtn = t && t.closest && t.closest("#home button, #home a");
    const up = k === "ArrowUp" || k === "w" || k === "W";
    const down = k === "ArrowDown" || k === "s" || k === "S";
    const left = k === "ArrowLeft" || k === "a" || k === "A";
    const right = k === "ArrowRight" || k === "d" || k === "D";
    if (k === "Escape" || k === "Backspace" || k === "b" || k === "B") {
      e.preventDefault();
      return back();
    }
    const [sec, sub] = view.split("/");
    if (sec === "") {
      const cols = matchMedia("(max-width: 900px), (orientation: portrait)").matches;
      if (up || down || left || right) {
        e.preventDefault();
        let n = sel;
        if (!cols) n = sel + (up || left ? -1 : 1);
        else if (left || right) n = sel === 0 ? (right ? 1 : sel) : sel + (left ? -1 : 1);
        else n = up ? (sel <= 2 ? 0 : sel - 2) : sel === 0 ? 1 : Math.min(items.length - 1, sel + 2);
        return select(n, { focus: true });
      }
      if ((k === "Enter" || k === " ") && !isBtn) {
        e.preventDefault();
        return activate(MENU[sel].id);
      }
      return;
    }
    if (sec === "team" && sub) {
      if (left || right) {
        e.preventDefault();
        return stepSummary(left ? -1 : 1);
      }
      return;
    }
    if (sec === "team") {
      const slots = $$("#sTeam .slot");
      const cur = slots.indexOf(document.activeElement);
      if (up || down || left || right) {
        e.preventDefault();
        const n = cur < 0 ? 0 : (cur + (up || left ? -1 : 1) + slots.length) % slots.length;
        slots[n].focus();
        sfx.move();
      }
      return;
    }
    if (sec === "skills") {
      const dir = up ? "up" : down ? "down" : left ? "left" : right ? "right" : null;
      if (dir) {
        e.preventDefault();
        if (!e.repeat) $("#sSkills")._key?.(dir, true);
        return;
      }
      if ((k === "Enter" || k === " ") && !isBtn) {
        e.preventDefault();
        $("#sSkills")._a?.();
      }
    }
  },
  true,
);

// releasing a direction key stops the trainer on the skills map (keyup also reaches the game, harmlessly)
addEventListener("keyup", (e) => {
  if (!homeOpen || view !== "skills") return;
  const dir = { ArrowUp: "up", w: "up", W: "up", ArrowDown: "down", s: "down", S: "down", ArrowLeft: "left", a: "left", A: "left", ArrowRight: "right", d: "right", D: "right" }[e.key];
  if (dir) $("#sSkills")._key?.(dir, false);
});

/* ------------------------------------------------------------------ boot */
{
  const r = location.hash.slice(1);
  history.replaceState({ home: "", d: 0 }, "", location.pathname + location.search);
  render("");
  if (r && SHEETS[r.split("/")[0]]) go(r);
  say(LINES[0]);
}
