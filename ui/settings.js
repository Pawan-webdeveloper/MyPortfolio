// Settings & guide for Pawan World — the ⚙ button (dash on desktop, touch buttons on phones) or Esc.
//
//   Pokémon    your three partners: what they do in the world and their four battle moves
//   Graphics   quality tier (saved as "pw-quality", applied on reload), rain, time of day, minimap
//   Controls   every key binding on a keyboard, the touch layout on phones, battle controls
//   Game       sound, progress (Pokédex, bosses beaten) and a progress reset
import { PARTY, TYPE_COLORS } from "../wild/combat.js";

const INK = "#1f1d2b",
  CANVAS = "#fbf8ef",
  RED = "#d6452f",
  GOLD = "#f2c230";

/** @param ctx { game, keys, quality: {tiers, index}, selectPokemon(k), currentPokemon(), toggleRain(), rainOn(),
 *   setTime(i), timeLabels, radio(), radioSet(on), nextSong(), minimap(on?), wild(), canOpen() } */
export function createSettings(ctx) {
  const root = document.createElement("div");
  root.id = "pwSettings";
  root.innerHTML = `<style>
    #pwSettings{position:fixed;inset:0;z-index:70;display:none;background:rgba(31,29,43,.42);font-family:"DM Sans",system-ui,sans-serif;color:${INK}}
    #pwSettings.open{display:flex;align-items:center;justify-content:center}
    #pwSettings .sheet{position:relative;width:min(760px,calc(100vw - 24px));height:min(560px,calc(100vh - 24px));background:${CANVAS};border:1.5px solid ${INK};
      box-shadow:4px 4px 0 ${INK};display:flex;flex-direction:column}
    #pwSettings header{display:flex;align-items:center;gap:12px;padding:12px 14px;border-bottom:1.5px solid ${INK}}
    #pwSettings header h2{margin:0;font-family:"Caveat Brush",cursive;font-weight:400;font-size:30px;line-height:1}
    #pwSettings .btn{font:700 11px "DM Sans",system-ui;letter-spacing:.14em;text-transform:uppercase;background:${CANVAS};color:${INK};border:1.5px solid ${INK};
      box-shadow:2px 2px 0 ${INK};padding:8px 12px;cursor:pointer}
    #pwSettings .btn:active{transform:translate(1px,1px);box-shadow:1px 1px 0 ${INK}}
    #pwSettings .btn.red{background:${RED};color:${CANVAS}}#pwSettings .btn.gold{background:${GOLD}}#pwSettings .btn.on{background:${INK};color:${CANVAS}}
    #pwSettings nav{display:flex;gap:0;margin-left:auto}
    #pwSettings nav button{font:700 10px "DM Sans";letter-spacing:.16em;text-transform:uppercase;padding:8px 12px;border:1.5px solid ${INK};background:${CANVAS};cursor:pointer;margin-left:-1.5px}
    #pwSettings nav button.on{background:${INK};color:${CANVAS}}
    #pwSettings .body{flex:1;overflow:auto;padding:14px 16px;-webkit-overflow-scrolling:touch}
    #pwSettings h3{margin:14px 0 8px;font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:${RED}}
    #pwSettings h3:first-child{margin-top:0}
    #pwSettings .cards{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
    #pwSettings .card{border:1.5px solid ${INK};padding:10px;background:#fff;position:relative}
    #pwSettings .card.cur{background:#fff4c9}
    #pwSettings .card b{font-family:"Caveat Brush",cursive;font-weight:400;font-size:26px;line-height:1;display:block}
    #pwSettings .chip{display:inline-block;padding:2px 6px;margin:4px 4px 0 0;border:1.2px solid ${INK};font:700 8.5px "DM Sans";letter-spacing:.12em;text-transform:uppercase}
    #pwSettings .card p{font-size:11px;margin:8px 0;line-height:1.35}
    #pwSettings .mv{display:flex;justify-content:space-between;font-size:11px;padding:3px 0 3px 8px;border-left:5px solid var(--c);margin:3px 0;background:rgba(31,29,43,.03)}
    #pwSettings .mv small{opacity:.65;font-size:9.5px;padding-right:4px}
    #pwSettings .row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:6px}
    #pwSettings .row label{font-size:12px;min-width:120px}
    #pwSettings table{width:100%;border-collapse:collapse;font-size:12px}
    #pwSettings td{padding:5px 6px;border-bottom:1px dashed rgba(31,29,43,.25);vertical-align:top}
    #pwSettings td:first-child{width:38%;white-space:nowrap}
    #pwSettings kbd{display:inline-block;min-width:18px;text-align:center;padding:1px 5px;border:1.2px solid ${INK};border-bottom-width:2.5px;font:700 10.5px "DM Sans";background:#fff;margin:1px 2px}
    #pwSettings .stat{display:inline-block;border:1.5px solid ${INK};padding:8px 12px;margin:0 8px 8px 0;background:#fff}
    #pwSettings .stat b{display:block;font-family:"Caveat Brush",cursive;font-weight:400;font-size:28px;line-height:1}
    #pwSettings .stat span{font-size:9px;letter-spacing:.18em;text-transform:uppercase}
    #pwSettings .note{font-size:11px;opacity:.75;margin:4px 0 10px}
    @media (max-width:700px),(max-height:480px){
      #pwSettings .sheet{width:100vw;height:100vh;border:0;box-shadow:none}
      #pwSettings .cards{grid-template-columns:repeat(3,minmax(210px,1fr));overflow-x:auto}
      #pwSettings header{padding:8px 10px;padding-left:calc(10px + env(safe-area-inset-left))}
      #pwSettings header h2{font-size:24px}
      #pwSettings nav button{padding:7px 8px;font-size:9px;letter-spacing:.1em}
    }
  </style>
  <div class="sheet">
    <header><button class="btn red" id="stBack">← Back</button><h2>Settings</h2>
      <nav><button data-tab="mons" class="on">Pokémon</button><button data-tab="gfx">Graphics</button><button data-tab="keys">Controls</button><button data-tab="game">Game</button></nav></header>
    <div class="body" id="stBody"></div>
  </div>`;
  document.body.appendChild(root);
  const $ = (id) => root.querySelector("#" + id);
  let tab = "mons",
    isOpen = false;
  const touch = () => document.body.classList.contains("touch");

  const ABILITY = {
    charizard: ["Flies anywhere", "Press 1 (or SWITCH). W climbs, S dives, A/D bank. Can't swim — deep water sinks it."],
    gengar: ["Jeep & on foot", "Press 2 (or SWITCH) to drive and call the jeep back; E gets out and leaves it parked. Fastest on roads; deep water sinks him."],
    greninja: ["Runs, jumps & walks on water", "Press 3 (or SWITCH). The only one that can cross deep lakes; glides down from Charizard."],
  };
  const chip = (t) => `<span class="chip" style="background:${TYPE_COLORS[t]}">${t}</span>`;
  const kbd = (...k) => k.map((x) => `<kbd>${x}</kbd>`).join("");

  function render() {
    root.querySelectorAll("nav button").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
    const body = $("stBody");
    if (tab === "mons") {
      const cur = ctx.currentPokemon();
      body.innerHTML =
        `<h3>Your team</h3><div class="cards">` +
        PARTY.map((p, i) => {
          const [ab, how] = ABILITY[p.key];
          return `<div class="card${p.key === cur ? " cur" : ""}"><b>${p.name}</b>${p.types.map(chip).join("")}
            <p><strong>${ab}.</strong> ${how}</p>
            <div style="font:700 9px DM Sans;letter-spacing:.18em;text-transform:uppercase;margin:8px 0 4px">Battle moves · ${p.hp} HP</div>
            ${p.moves.map((m) => `<div class="mv" style="--c:${TYPE_COLORS[m.type]}"><span>${m.n}</span><small>${m.type} · ${m.power} · ${m.cd}s</small></div>`).join("")}
            <div style="margin-top:10px"><button class="btn${p.key === cur ? " on" : ""}" data-use="${i + 1}">${p.key === cur ? "In use" : "Use " + p.name}</button></div></div>`;
        }).join("") +
        `</div><p class="note">In a boss battle all three fight together: switch between them to dodge type weaknesses and use their strengths.</p>`;
      body.querySelectorAll("[data-use]").forEach((b) =>
        (b.onclick = () => {
          ctx.selectPokemon(b.dataset.use);
          setTimeout(render, 60);
        }),
      );
    } else if (tab === "gfx") {
      const q = ctx.quality,
        rain = ctx.rainOn(),
        mm = ctx.minimap();
      body.innerHTML = `<h3>Quality</h3><div class="row">${q.tiers.map((t, i) => `<button class="btn${i === q.index ? " on" : ""}" data-q="${i}">${t}</button>`).join("")}</div>
        <p class="note">Lower quality draws fewer people, cars, Pokémon and shadows, for smoother play on phones. Changing it reloads the game.</p>
        <h3>World</h3>
        <div class="row"><label>Rain</label><button class="btn${rain ? " on" : ""}" id="stRain">${rain ? "On" : "Off"}</button></div>
        <div class="row"><label>Minimap</label><button class="btn${mm ? " on" : ""}" id="stMini">${mm ? "Shown" : "Hidden"}</button></div>
        <div class="row"><label>Time of day</label>${ctx.timeLabels.map((t, i) => `<button class="btn" data-time="${i}">${t}</button>`).join("")}</div>`;
      body.querySelectorAll("[data-q]").forEach((b) =>
        (b.onclick = () => {
          if (+b.dataset.q === q.index) return;
          try {
            localStorage.setItem("pw-quality", b.dataset.q);
          } catch (_) {}
          location.reload();
        }),
      );
      $("stRain").onclick = () => (ctx.toggleRain(), render());
      $("stMini").onclick = () => (ctx.minimap(!mm), render());
      body.querySelectorAll("[data-time]").forEach((b) => (b.onclick = () => ctx.setTime(+b.dataset.time)));
    } else if (tab === "keys") {
      const world = touch()
        ? [
            ["Left stick", "drive · walk · fly"],
            ["HOP", "jump (Greninja) · hop (jeep) · flap"],
            ["BOOST", "hold for speed"],
            ["GET IN/OUT", "walk, take any vehicle, greet a Pokémon, challenge a boss"],
            ["SWITCH", "Charizard → Gengar → Greninja"],
            ["🎥", "change camera"],
            ["Minimap", "tap for the world map"],
            ["Drag the screen", "look around"],
          ]
        : [
            [kbd("W", "A", "S", "D") + " / arrows", "drive · walk · fly"],
            [kbd("Space"), "hop / jump · flap"],
            [kbd("Shift"), "boost / run"],
            [kbd("E"), "get in / out · greet a Pokémon · challenge a boss"],
            [kbd("1") + kbd("2") + kbd("3"), "Charizard · Gengar · Greninja"],
            [kbd("M"), "world map (or click the minimap)"],
            [kbd("Esc"), "settings (this screen)"],
            [kbd("C"), "cycle camera"],
            [kbd("F") + " / " + kbd("0"), "time of day / automatic"],
            [kbd("K"), "rain"],
            [kbd("R") + kbd("N") + kbd("B"), "radio on/off · next song · band"],
            [kbd("P"), "photo"],
            [kbd("H"), "hide the interface"],
            [kbd("+") + kbd("−") + " · scroll", "zoom"],
            [kbd("[") + kbd("]"), "field of view"],
            ["Drag", "look around"],
          ];
      const battle = touch()
        ? [
            ["Left stick", "move (forward = toward the boss)"],
            ["Move buttons", "use a move (dark = cooling down)"],
            ["DODGE", "roll — you can't be hit while rolling"],
            ["Party cards", "switch Pokémon"],
            ["Run ✕", "leave the fight"],
          ]
        : [
            [kbd("W", "A", "S", "D"), "move (forward = toward the boss) · " + kbd("Shift") + " sprint"],
            [kbd("1") + kbd("2") + kbd("3") + kbd("4"), "the active Pokémon's moves"],
            [kbd("Space"), "dodge roll — invincible while rolling"],
            [kbd("Q") + " / " + kbd("Tab"), "switch Pokémon (or click a party card)"],
            [kbd("Esc") + " ×2", "run away"],
          ];
      const map = touch()
        ? [["Drag / pinch", "move · zoom"], ["Tap", "set a destination"], ["Boss star", "navigate to that boss"]]
        : [[kbd("M") + " / " + kbd("Esc"), "open / close"], ["Drag · scroll", "move · zoom"], ["Click", "set a destination · click a boss to navigate"]];
      const table = (rows) => `<table>${rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join("")}</table>`;
      body.innerHTML = `<h3>${touch() ? "Touch controls" : "Keyboard"}</h3>${table(world)}<h3>Boss battles</h3>${table(battle)}<h3>World map</h3>${table(map)}`;
    } else {
      const w = ctx.wild(),
        r = ctx.radio();
      const seen = w ? w.seen.size : 0,
        total = w ? Object.keys(w.dex).length : 164,
        beaten = w ? w.defeatedCount : 0;
      body.innerHTML = `<h3>Progress</h3>
        <div class="stat"><b>${seen}/${total}</b><span>Pokédex seen</span></div>
        <div class="stat"><b>${w ? w.greeted.size : 0}</b><span>Pokémon greeted</span></div>
        <div class="stat"><b>${beaten}</b><span>Bosses defeated</span></div>
        <h3>Sound</h3>
        <div class="row"><label>Radio</label><button class="btn${r.on ? " on" : ""}" id="stRadio">${r.on ? "On" : "Off"}</button>
          <button class="btn" id="stNext">Next song ♫</button><span class="note" style="margin:0">${r.song || ""}</span></div>
        <h3>About</h3>
        <p class="note">Every region has its own wild Pokémon and a legendary boss. Beat a boss with your team of three and it leaves its lair for good. The world map (M) shows every boss in view and can route you there.</p>
        <h3>Reset</h3>
        <div class="row"><button class="btn red" id="stReset">Reset progress</button><span class="note" style="margin:0">Clears the Pokédex, beaten bosses and boss lairs.</span></div>`;
      $("stRadio").onclick = () => (ctx.radioSet(!r.on), render());
      $("stNext").onclick = () => (ctx.nextSong(), setTimeout(render, 30));
      $("stReset").onclick = () => {
        if (!confirm("Reset all progress? Your Pokédex and beaten bosses will be cleared.")) return;
        for (const k of ["pw-dex", "pw-bosses", "pw-lairs"])
          try {
            localStorage.removeItem(k);
          } catch (_) {}
        location.reload();
      };
    }
  }
  root.querySelectorAll("nav button").forEach((b) => (b.onclick = () => ((tab = b.dataset.tab), render())));
  $("stBack").onclick = () => close();
  root.addEventListener("click", (e) => e.target === root && close());
  for (const ev of ["pointerdown", "pointermove", "pointerup", "touchstart", "touchmove", "wheel", "mousedown", "mouseup"])
    root.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });

  function open(t) {
    if (isOpen || (ctx.canOpen && !ctx.canOpen())) return;
    isOpen = true;
    if (t) tab = t;
    for (const k in ctx.keys) ctx.keys[k] = false;
    root.classList.add("open");
    render();
  }
  function close() {
    isOpen = false;
    root.classList.remove("open");
  }
  // Esc toggles the panel; while it's open, keys belong to it
  addEventListener(
    "keydown",
    (e) => {
      const k = e.key.toLowerCase();
      if (!isOpen) {
        if (k === "escape" && (!ctx.canOpen || ctx.canOpen())) {
          e.stopImmediatePropagation();
          open();
        }
        return;
      }
      e.stopImmediatePropagation();
      if (k === "escape" || k === "backspace") (e.preventDefault(), close());
    },
    true,
  );
  return {
    open,
    close,
    get isOpen() {
      return isOpen;
    },
  };
}
