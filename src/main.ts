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
import { UI } from "./ui";
import { applySaveData, hasSave, readSave, saveGame } from "./state";

const app = document.getElementById("app")!;

// ---- canvas ----------------------------------------------------------------
const canvas = document.createElement("canvas");
canvas.id = "game";
app.appendChild(canvas);
const ctx = canvas.getContext("2d")!;

function fit() {
  canvas.width = Math.floor(window.innerWidth);
  canvas.height = Math.floor(window.innerHeight);
}
fit();

// ---- screens ---------------------------------------------------------------
function clearScreens() { document.querySelectorAll(".screen").forEach((s) => s.remove()); }

function showTitle() {
  clearScreens();
  const s = document.createElement("div"); s.className = "screen title-screen";
  const cont = hasSave() ? `<button id="continue" class="big-btn primary">Continue</button>` : "";
  s.innerHTML = `
    <div class="title-stars"></div>
    <div class="title-inner">
      <h1 class="game-title">Aethermoor</h1>
      <p class="tagline">A Massively <i>Singleplayer</i> RPG</p>
      <div class="title-buttons">
        ${cont}
        <button id="newgame" class="big-btn${hasSave() ? "" : " primary"}">New Game</button>
      </div>
      <p class="title-foot">A living world of simulated adventurers — hunt, level, and climb the ranks.</p>
    </div>`;
  app.appendChild(s);
  (document.getElementById("continue") as HTMLButtonElement | null)?.addEventListener("click", () => {
    const data = readSave();
    if (!data) return showClassSelect();
    const p = new Player(0, 0, data.player.cls as ClassId, data.player.name || "Hero");
    startGame(p, data);
  });
  document.getElementById("newgame")!.addEventListener("click", showClassSelect);
}

function showClassSelect() {
  clearScreens();
  let chosen: ClassId = "warrior";
  const s = document.createElement("div"); s.className = "screen class-screen";
  s.innerHTML = `
    <div class="cs-inner">
      <h2>Choose your path</h2>
      <div class="class-cards"></div>
      <div class="name-row">
        <label>Name your hero</label>
        <input id="hero-name" maxlength="14" value="Aria" />
      </div>
      <button id="begin" class="big-btn primary">Begin your journey</button>
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
    startNewGame(p);
  });
}

// ---- game ------------------------------------------------------------------
let world: World | null = null;
let ui: UI | null = null;

function startNewGame(player: Player) {
  // starting kit by class
  const kit: Record<ClassId, string> = { warrior: "rusty_sword", mage: "oak_staff", ranger: "hunting_bow" };
  player.equipment.weapon = kit[player.cls];
  player.equipment.armor = "cloth_tunic";
  startGame(player, null);
  // give some pots after world exists
  addItem(player.inventory, "minor_potion", 4);
  world!.recomputePlayerStats();
  player.stats.hp = player.stats.maxHp; player.stats.mp = player.stats.maxMp;
  world!.enterZone("town");
  ui!.refresh();
  world!.notify("Welcome to Aethermoor! Press H for help. Find Elder Maeve (the ! marker).");
  saveGame(world!);
}

function startGame(player: Player, save: any | null) {
  clearScreens();
  world = new World(player, canvas.width, canvas.height);
  ui = new UI(world);
  world.ui = ui;
  world.onAutosave = () => saveGame(world!);
  if (save) applySaveData(world, save);
  else if (!world.zone) world.enterZone("town");

  window.addEventListener("resize", () => {
    fit();
    if (world) { world.camera.vw = canvas.width; world.camera.vh = canvas.height; }
  });
  // save on tab close
  window.addEventListener("beforeunload", () => { if (world) saveGame(world); });

  startLoop();
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
  if (!world) return;
  world.render(ctx);
}

// kick off
showTitle();

// expose a tiny dev handle
(window as any).__aether = {
  newGame: () => { localStorage.clear(); location.reload(); },
  get world() { return world; },
  get ui() { return ui; },
};

// quiet unused-import lint in some configs
void COL;
