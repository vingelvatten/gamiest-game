// ============================================================================
// Zone layouts. Each zone is a tile grid built procedurally (seeded, so the
// world is stable) plus portals, NPC placements and monster spawn tables.
// ============================================================================
import { T } from "./config";
import { RNG } from "./engine";
import type { MonsterKind } from "./art";
import type { NpcRole } from "./entities";

export interface PortalDef { x: number; y: number; w: number; h: number; to: string; sx: number; sy: number; label: string; }
export interface NpcDef {
  x: number; y: number; name: string; role: NpcRole;
  body: string; accent: string; hair?: string; skin?: string;
  weapon?: "sword" | "staff" | "bow" | "none"; shopId?: string; questIds?: string[]; lines?: string[];
}
export interface SpawnDef { kind: MonsterKind; min: number; max: number; weight: number; }
export interface ZoneDef {
  id: string; name: string; w: number; h: number;
  tiles: number[]; spawn: [number, number];
  portals: PortalDef[]; npcs: NpcDef[]; spawns: SpawnDef[]; target: number;
  boss?: { kind: MonsterKind; lvl: number; x: number; y: number };
  ambient: "town" | "green" | "dark" | "ruins";
  safe?: boolean;
}

class Grid {
  t: number[];
  constructor(public w: number, public h: number, fill: T) { this.t = new Array(w * h).fill(fill); }
  set(x: number, y: number, v: T) { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.t[y * this.w + x] = v; }
  get(x: number, y: number) { return this.t[y * this.w + x]; }
  rect(x: number, y: number, w: number, h: number, v: T) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, v); }
  border(v: T, thick = 1) {
    for (let i = 0; i < this.w; i++) for (let k = 0; k < thick; k++) { this.set(i, k, v); this.set(i, this.h - 1 - k, v); }
    for (let j = 0; j < this.h; j++) for (let k = 0; k < thick; k++) { this.set(k, j, v); this.set(this.w - 1 - k, j, v); }
  }
  hLine(x0: number, x1: number, y: number, v: T) { for (let x = x0; x <= x1; x++) this.set(x, y, v); }
  vLine(x: number, y0: number, y1: number, v: T) { for (let y = y0; y <= y1; y++) this.set(x, y, v); }
}

function house(g: Grid, x: number, y: number, w: number, h: number, roof: T, doorAt: number) {
  g.rect(x, y, w, h, T.Wall);
  g.rect(x, y, w, h - 1, roof);
  g.set(x + doorAt, y + h - 1, T.Door);
}

// ---------------------------------------------------------------------------
function buildTown(seed: number): ZoneDef {
  const w = 42, h = 34, g = new Grid(w, h, T.Grass);
  const rng = new RNG(seed);
  // grass texture variety
  for (let i = 0; i < g.t.length; i++) if (rng.chance(0.12)) g.t[i] = T.GrassAlt;
  g.border(T.StoneWall, 1);

  // central plaza
  g.rect(15, 12, 12, 9, T.Floor);
  // paths
  g.hLine(2, 39, 16, T.Path); g.hLine(2, 39, 17, T.Path);
  g.vLine(20, 2, 31, T.Path); g.vLine(21, 2, 31, T.Path);

  // houses around the plaza
  house(g, 6, 5, 7, 5, T.RoofRed, 3);     // general store (Tilda)
  house(g, 29, 5, 7, 5, T.RoofPurple, 3); // arcanum (Orin)
  house(g, 6, 24, 7, 5, T.RoofRed, 3);    // blacksmith (Brom)
  house(g, 29, 24, 7, 5, T.RoofRed, 3);   // home

  // little gardens
  for (let i = 0; i < 26; i++) {
    const x = rng.int(2, w - 3), y = rng.int(2, h - 3);
    if (g.get(x, y) === T.Grass || g.get(x, y) === T.GrassAlt) g.set(x, y, rng.chance(0.5) ? T.Flower : T.Bush);
  }
  // a few trees inside walls
  for (const [tx, ty] of [[3, 11], [38, 11], [3, 22], [38, 22], [19, 3], [22, 30]] as const) g.set(tx, ty, T.Tree);

  // east gate -> greenfields
  g.set(w - 1, 16, T.Portal); g.set(w - 1, 17, T.Portal);
  const portals: PortalDef[] = [{ x: w - 1, y: 15, w: 1, h: 4, to: "greenfields", sx: 2, sy: 19, label: "Greenfields →" }];

  const npcs: NpcDef[] = [
    { x: 20, y: 11, name: "Elder Maeve", role: "quest", body: "#7c3a8f", accent: "#f3c969", hair: "#d8d2c2", questIds: ["mq1", "mq2", "mq3", "mq4", "mq5"], lines: ["Aethermoor needs heroes, and you have the look of one."] },
    { x: 9, y: 10, name: "Tilda", role: "shop", body: "#3f9a55", accent: "#caa24a", shopId: "general", lines: ["Potions, trinkets — everything an adventurer needs!"] },
    { x: 32, y: 10, name: "Sage Orin", role: "shop", body: "#5566c0", accent: "#9b6bd6", hair: "#b9b3c4", weapon: "staff", shopId: "arcanum", questIds: ["sq_essence"], lines: ["The arcane is a patient teacher. Mind your mana."] },
    { x: 9, y: 23, name: "Brom the Smith", role: "shop", body: "#9aa3b0", accent: "#8a8f98", hair: "#3a2c22", weapon: "sword", shopId: "smith", lines: ["Steel doesn't lie. Pick something with weight to it."] },
    { x: 26, y: 17, name: "Ranger Kael", role: "quest", body: "#3f9a55", accent: "#caa24a", weapon: "bow", questIds: ["sq_pelts"], lines: ["The Darkwood's wolves have thick pelts. I'll pay for them."] },
    { x: 16, y: 17, name: "Captain Roe", role: "quest", body: "#c25b4a", accent: "#8a8f98", weapon: "sword", questIds: ["bounty_slimes", "bounty_undead"], lines: ["Standing bounties posted daily. Coin for culled beasts."] },
    { x: 22, y: 20, name: "Old Pim", role: "flavor", body: "#8a6a40", accent: "#6b4a2c", hair: "#d8d2c2", lines: ["In my day we walked to the Ruins uphill both ways!"] },
  ];

  return { id: "town", name: "Aethermoor", w, h, tiles: g.t, spawn: [20, 16], portals, npcs, spawns: [], target: 0, ambient: "town", safe: true };
}

// ---------------------------------------------------------------------------
function buildGreenfields(seed: number): ZoneDef {
  const w = 54, h = 40, g = new Grid(w, h, T.Grass);
  const rng = new RNG(seed);
  for (let i = 0; i < g.t.length; i++) if (rng.chance(0.16)) g.t[i] = T.GrassAlt;

  // forest edges (top & bottom bands of trees)
  for (let x = 0; x < w; x++) {
    if (rng.chance(0.7)) g.set(x, 0, T.Tree);
    if (rng.chance(0.7)) g.set(x, h - 1, T.Tree);
    if (rng.chance(0.4)) g.set(x, 1, T.Tree);
    if (rng.chance(0.4)) g.set(x, h - 2, T.Tree);
  }
  // scattered trees / bushes / flowers
  for (let i = 0; i < 130; i++) {
    const x = rng.int(2, w - 3), y = rng.int(2, h - 3);
    const r = rng.next();
    g.set(x, y, r < 0.45 ? T.Tree : r < 0.7 ? T.Bush : T.Flower);
  }
  // a pond with a bridge
  g.rect(33, 8, 8, 6, T.Water);
  g.set(36, 8, T.Bridge); g.set(36, 9, T.Bridge); g.set(36, 13, T.Bridge); g.set(36, 14, T.Bridge);
  g.rect(34, 10, 6, 2, T.Water);

  // winding main path west->east
  let py = 19;
  for (let x = 1; x < w - 1; x++) {
    g.set(x, py, T.Path); g.set(x, py + 1, T.Path);
    if (rng.chance(0.18)) py += rng.chance(0.5) ? 1 : -1;
    py = Math.max(4, Math.min(h - 6, py));
  }

  // portals
  g.set(0, 19, T.Portal); g.set(0, 20, T.Portal);
  g.set(w - 1, py, T.Portal); g.set(w - 1, py + 1, T.Portal);
  const portals: PortalDef[] = [
    { x: 0, y: 18, w: 1, h: 4, to: "town", sx: 40, sy: 16, label: "← Aethermoor" },
    { x: w - 1, y: py - 1, w: 1, h: 4, to: "darkwood", sx: 2, sy: 20, label: "Darkwood →" },
  ];

  const spawns: SpawnDef[] = [
    { kind: "rat", min: 1, max: 3, weight: 34 },
    { kind: "slime", min: 1, max: 4, weight: 40 },
    { kind: "boar", min: 2, max: 4, weight: 26 },
  ];
  return { id: "greenfields", name: "The Greenfields", w, h, tiles: g.t, spawn: [3, 19], portals, npcs: [], spawns, target: 13, ambient: "green" };
}

// ---------------------------------------------------------------------------
function buildDarkwood(seed: number): ZoneDef {
  const w = 54, h = 42, g = new Grid(w, h, T.DarkGrass);
  const rng = new RNG(seed);
  // dense dark trees
  for (let i = 0; i < 360; i++) {
    const x = rng.int(1, w - 2), y = rng.int(1, h - 2);
    g.set(x, y, rng.chance(0.85) ? T.DarkTree : T.Bush);
  }
  g.border(T.DarkTree, 1);
  // gloomy pools
  g.rect(20, 26, 7, 5, T.Water); g.rect(40, 10, 5, 5, T.Water);

  // clear a meandering path west->east
  let py = 20;
  for (let x = 1; x < w - 1; x++) {
    for (let k = -1; k <= 1; k++) g.set(x, py + k, T.DarkGrass);
    g.set(x, py, T.Path);
    if (rng.chance(0.25)) py += rng.chance(0.5) ? 1 : -1;
    py = Math.max(4, Math.min(h - 6, py));
  }
  // a couple clearings
  for (const [cx, cy] of [[14, 12], [30, 30], [44, 22]] as const) g.rect(cx - 2, cy - 2, 5, 5, T.DarkGrass);

  g.set(0, 20, T.Portal); g.set(0, 21, T.Portal);
  g.set(w - 1, py, T.Portal); g.set(w - 1, py + 1, T.Portal);
  const portals: PortalDef[] = [
    { x: 0, y: 19, w: 1, h: 4, to: "greenfields", sx: 51, sy: 19, label: "← Greenfields" },
    { x: w - 1, y: py - 1, w: 1, h: 4, to: "ruins", sx: 2, sy: 20, label: "Sunken Ruins →" },
  ];
  const spawns: SpawnDef[] = [
    { kind: "bat", min: 4, max: 6, weight: 30 },
    { kind: "spider", min: 4, max: 7, weight: 30 },
    { kind: "wolf", min: 5, max: 8, weight: 26 },
    { kind: "wraith", min: 6, max: 9, weight: 14 },
  ];
  return { id: "darkwood", name: "The Darkwood", w, h, tiles: g.t, spawn: [3, 20], portals, npcs: [], spawns, target: 14, ambient: "dark" };
}

// ---------------------------------------------------------------------------
function buildRuins(seed: number): ZoneDef {
  const w = 50, h = 42, g = new Grid(w, h, T.RuinFloor);
  const rng = new RNG(seed);
  for (let i = 0; i < g.t.length; i++) { const r = rng.next(); if (r < 0.14) g.t[i] = T.DarkGrass; else if (r < 0.18) g.t[i] = T.Grass; }
  g.border(T.RuinStone, 1);

  // broken wall structures
  for (let i = 0; i < 10; i++) {
    const x = rng.int(4, w - 10), y = rng.int(4, h - 10), bw = rng.int(4, 9), bh = rng.int(3, 7);
    for (let j = 0; j < bh; j++) for (let k = 0; k < bw; k++) {
      if ((j === 0 || j === bh - 1 || k === 0 || k === bw - 1) && rng.chance(0.6)) g.set(x + k, y + j, T.RuinStone);
    }
  }
  // central boss chamber
  const cx = Math.floor(w / 2), cy = Math.floor(h / 2);
  g.rect(cx - 5, cy - 5, 11, 11, T.RuinFloor);
  for (let k = -5; k <= 5; k++) { g.set(cx + k, cy - 5, T.RuinStone); g.set(cx + k, cy + 5, T.RuinStone); g.set(cx - 5, cy + k, T.RuinStone); g.set(cx + 5, cy + k, T.RuinStone); }
  g.set(cx, cy - 5, T.RuinFloor); g.set(cx, cy + 5, T.RuinFloor); // doorways

  // entry path
  g.hLine(1, cx - 5, 20, T.RuinFloor);

  g.set(0, 20, T.Portal); g.set(0, 21, T.Portal);
  const portals: PortalDef[] = [{ x: 0, y: 19, w: 1, h: 4, to: "darkwood", sx: 51, sy: 20, label: "← Darkwood" }];
  const spawns: SpawnDef[] = [
    { kind: "skeleton", min: 7, max: 10, weight: 40 },
    { kind: "imp", min: 8, max: 11, weight: 30 },
  ];
  return {
    id: "ruins", name: "The Sunken Ruins", w, h, tiles: g.t, spawn: [3, 20], portals, npcs: [], spawns, target: 12,
    boss: { kind: "golem", lvl: 12, x: cx, y: cy }, ambient: "ruins",
  };
}

// Every zone's layout derives from the run seed, so a given code reproduces
// the exact same world for everyone racing it.
export function buildZones(seed: number): Record<string, ZoneDef> {
  const s = seed >>> 0;
  return {
    town: buildTown((s ^ 0x1a2b) >>> 0),
    greenfields: buildGreenfields((s ^ 0x2c3d) >>> 0),
    darkwood: buildDarkwood((s ^ 0x3e4f) >>> 0),
    ruins: buildRuins((s ^ 0x4f60) >>> 0),
  };
}
