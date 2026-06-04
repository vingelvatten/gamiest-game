// ============================================================================
// Bootstrap: title screen, class selection, and the main loop.
// ============================================================================
import "./styles.css";
import { COL } from "./config";
import { drawCharacter } from "./art";
import { CLASSES, ClassId } from "./progression";
import { addItem } from "./items";
import { Player } from "./entities";
import { World } from "./world";
import { UI, fmtTime } from "./ui";
import { View3D } from "./view3d";
import { applySaveData, clearSave, readSave, saveGame } from "./state";

const app = document.getElementById("app")!;
const randSeed = () => (Math.random() * 0xffffffff) >>> 0;
function parseCode(s: string): number | null {
  const n = parseInt((s || "").replace(/[^a-z0-9]/gi, ""), 36);
  return Number.isFinite(n) ? (n >>> 0) : null;
}

// ---- canvases: WebGL world (behind) + 2D label overlay (on top) ------------
const glCanvas = document.createElement("canvas");
glCanvas.id = "game";
const overlayCanvas = document.createElement("canvas");
overlayCanvas.id = "overlay";
app.appendChild(glCanvas);
app.appendChild(overlayCanvas);

function fit() {
  const w = Math.floor(window.innerWidth), h = Math.floor(window.innerHeight);
  glCanvas.width = w; glCanvas.height = h;
  view3d?.setSize(w, h);
}

// ---- screens ---------------------------------------------------------------
function clearScreens() { document.querySelectorAll(".screen").forEach((s) => s.remove()); }

function showTitle() {
  clearScreens();
  const save = readSave();
  const canContinue = save && save.runState === "playing";
  const s = document.createElement("div"); s.className = "screen title-screen";
  s.innerHTML = `
    <div class="title-stars"></div>
    <div class="title-inner">
      <h1 class="game-title">Aethermoor</h1>
      <p class="tagline">A Massively <i>Singleplayer</i> Roguelike</p>
      <div class="title-buttons">
        ${canContinue ? `<button id="continue" class="big-btn primary">Resume Run <span class="btn-sub">${fmtTime(save.runTime || 0)}</span></button>` : ""}
        <button id="newrun" class="big-btn${canContinue ? "" : " primary"}">New Run</button>
        <button id="entercode" class="big-btn">Enter Race Code</button>
      </div>
      <p class="title-foot">Race a seeded world and slay the Ancient Golem — fastest time wins. Share your code so friends run the exact same world.</p>
    </div>`;
  app.appendChild(s);
  document.getElementById("continue")?.addEventListener("click", () => {
    const data = readSave();
    if (!data) return showClassSelect(randSeed());
    const p = new Player(0, 0, data.player.cls as ClassId, data.player.name || "Hero");
    startGame(p, data, (data.seed ?? randSeed()) >>> 0);
  });
  document.getElementById("newrun")!.addEventListener("click", () => showClassSelect(randSeed()));
  document.getElementById("entercode")!.addEventListener("click", showCodeEntry);
}

function showCodeEntry() {
  clearScreens();
  const s = document.createElement("div"); s.className = "screen class-screen";
  s.innerHTML = `
    <div class="cs-inner narrow">
      <h2>Enter a race code</h2>
      <p class="cs-hint">Paste a friend's code to run the exact same seeded world.</p>
      <input id="code-input" class="code-input" maxlength="10" placeholder="e.g. 3X9F2K" autocomplete="off" />
      <div class="title-buttons">
        <button id="code-go" class="big-btn primary">Start</button>
        <button id="code-back" class="big-btn">Back</button>
      </div>
    </div>`;
  app.appendChild(s);
  const input = document.getElementById("code-input") as HTMLInputElement;
  input.focus();
  const go = () => { const seed = parseCode(input.value); if (seed == null) { input.classList.add("bad"); return; } showClassSelect(seed); };
  document.getElementById("code-go")!.addEventListener("click", go);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
  document.getElementById("code-back")!.addEventListener("click", showTitle);
}

function showClassSelect(seed: number) {
  clearScreens();
  let chosen: ClassId = "warrior";
  const code = (seed >>> 0).toString(36).toUpperCase().padStart(6, "0");
  const s = document.createElement("div"); s.className = "screen class-screen";
  s.innerHTML = `
    <div class="cs-inner">
      <h2>Choose your path</h2>
      <p class="cs-code">Race code <b>${code}</b></p>
      <div class="class-cards"></div>
      <div class="name-row">
        <label>Name your hero</label>
        <input id="hero-name" maxlength="14" value="Aria" />
      </div>
      <button id="begin" class="big-btn primary">Begin the run</button>
    </div>`;
  app.appendChild(s);
  const cards = s.querySelector(".class-cards")!;

  (Object.keys(CLASSES) as ClassId[]).forEach((id) => {
    const d = CLASSES[id];
    const card = document.createElement("div");
    card.className = "class-card" + (id === chosen ? " sel" : "");
    const cv = document.createElement("canvas"); cv.width = 80; cv.height = 90;
    const c = cv.getContext("2d")!;
    drawCharacter(c, 40, 56, { skin: "#e7b48a", hair: "#3a2c22", body: d.body, accent: d.accent, facing: "down", walk: 0, bob: 0, attack: 0, weapon: d.weapon }, 2.1);
    card.appendChild(cv);
    card.appendChild(Object.assign(document.createElement("h3"), { textContent: d.name }));
    card.appendChild(Object.assign(document.createElement("p"), { textContent: d.blurb }));
    const stat = document.createElement("div"); stat.className = "card-stats";
    stat.innerHTML = `<span>HP ${d.base.maxHp}</span><span>ATK ${d.base.atk}</span><span>DEF ${d.base.def}</span><span>MP ${d.base.maxMp}</span>`;
    card.appendChild(stat);
    const ab = document.createElement("div"); ab.className = "card-ab";
    ab.textContent = "Abilities: " + d.abilities.map((a) => a[0].toUpperCase() + a.slice(1)).join(", ");
    card.appendChild(ab);
    card.addEventListener("click", () => { chosen = id; cards.querySelectorAll(".class-card").forEach((x) => x.classList.remove("sel")); card.classList.add("sel"); });
    cards.appendChild(card);
  });

  document.getElementById("begin")!.addEventListener("click", () => {
    const name = (document.getElementById("hero-name") as HTMLInputElement).value.trim() || "Hero";
    const p = new Player(0, 0, chosen, name);
    startRun(p, seed);
  });
}

// ---- game ------------------------------------------------------------------
let world: World | null = null;
let ui: UI | null = null;
let view3d: View3D | null = null;

function startRun(player: Player, seed: number) {
  // starting kit by class
  const kit: Record<ClassId, string> = { warrior: "rusty_sword", mage: "oak_staff", ranger: "hunting_bow" };
  player.equipment.weapon = kit[player.cls];
  player.equipment.armor = "cloth_tunic";
  startGame(player, null, seed);
  addItem(player.inventory, "minor_potion", 4);
  world!.recomputePlayerStats();
  player.stats.hp = player.stats.maxHp; player.stats.mp = player.stats.maxMp;
  world!.enterZone("town");
  ui!.refresh();
  world!.notify(`Run begins! Slay the Ancient Golem in the Sunken Ruins. Press H for help.`);
  saveGame(world!);
}

function startGame(player: Player, save: any | null, seed: number) {
  clearScreens();
  world = new World(player, window.innerWidth, window.innerHeight, seed);
  ui = new UI(world);
  world.ui = ui;
  view3d = new View3D(glCanvas, overlayCanvas, world);
  world.input.attach(overlayCanvas);
  world.onAutosave = () => saveGame(world!);
  world.onRunEnd = (state) => showEndScreen(state);
  if (save) applySaveData(world, save);
  else if (!world.zone) world.enterZone("town");

  window.addEventListener("resize", fit);
  // save on tab close (only while a run is in progress)
  window.addEventListener("beforeunload", () => { if (world && world.runState === "playing") saveGame(world); });

  startLoop();
}

function showEndScreen(state: "won" | "dead") {
  view3d?.releaseLook();
  clearSave(); // a finished run is not resumable
  const w = world!;
  const win = state === "won";
  const s = document.createElement("div"); s.className = `screen end-screen ${win ? "win" : "dead"}`;
  s.innerHTML = `
    <div class="end-inner">
      <h1 class="end-title">${win ? "Golem Slain!" : "You Fell…"}</h1>
      <div class="end-time">${fmtTime(w.runTime)}</div>
      <p class="end-sub">${win ? "Boss cleared — now beat this time." : `Reached ${w.zone.name} · Level ${w.player.level}`}</p>
      <div class="end-code">RACE CODE <b>${w.code}</b> <button id="copycode" class="copy-btn">Copy</button></div>
      <p class="end-share">Send this code to a friend to race the identical world.</p>
      <div class="title-buttons">
        <button id="retry" class="big-btn primary">Retry This Seed</button>
        <button id="newrun2" class="big-btn">New Random Run</button>
      </div>
    </div>`;
  app.appendChild(s);
  document.getElementById("copycode")!.addEventListener("click", (e) => {
    navigator.clipboard?.writeText(w.code).catch(() => {});
    (e.target as HTMLElement).textContent = "Copied!";
  });
  document.getElementById("retry")!.addEventListener("click", () => { sessionStorage.setItem("pendingSeed", String(w.runSeed)); location.reload(); });
  document.getElementById("newrun2")!.addEventListener("click", () => { sessionStorage.setItem("pendingSeed", String(randSeed())); location.reload(); });
}

let running = false;
function startLoop() {
  if (running) return;
  running = true;
  let last = performance.now(), acc = 0;
  const step = 1 / 60;
  const frame = (now: number) => {
    let ft = (now - last) / 1000; last = now;
    if (ft > 0.25) ft = 0.25;
    acc += ft;
    let guard = 0;
    while (acc >= step && guard < 5) { world!.update(step); acc -= step; guard++; }
    ui!.update(ft);
    render();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function render() {
  if (world && view3d) view3d.render(world);
}

// kick off — resume a pending run after a reload, else show the title
const pendingSeed = sessionStorage.getItem("pendingSeed");
if (pendingSeed != null) { sessionStorage.removeItem("pendingSeed"); showClassSelect(parseInt(pendingSeed, 10) >>> 0); }
else showTitle();

// expose a tiny dev handle
(window as any).__aether = {
  newGame: () => { localStorage.clear(); location.reload(); },
  get world() { return world; },
  get ui() { return ui; },
  get view3d() { return view3d; },
};

// quiet unused-import lint in some configs
void COL;
