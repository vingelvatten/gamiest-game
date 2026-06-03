// ============================================================================
// Aethermoor — global config: palette, tile definitions, and balance tuning.
// Everything visual derives from this palette so the look stays cohesive.
// ============================================================================

export const TILE = 32; // pixels per tile

// ---- Palette ---------------------------------------------------------------
export const COL = {
  // UI / ink
  ink: "#1a1726",
  inkSoft: "#2c2740",
  parchment: "#f4e9d0",
  parchment2: "#e7d6b0",
  gold: "#f3c969",
  goldDark: "#b8862f",
  red: "#d2544a",
  green: "#6bbf59",
  blue: "#4a8fd2",
  mana: "#5d7bf0",
  purple: "#9b6bd6",
  // world — grass / town / dark / ruins
  grass: "#5a9a45",
  grassAlt: "#52923e",
  grassDark: "#3f7a33",
  path: "#c4a363",
  pathDark: "#a98a4d",
  dirt: "#8a6a40",
  water: "#3f86c4",
  waterDeep: "#2f6ba8",
  sand: "#dbc38a",
  stone: "#8d8a98",
  stoneDark: "#6f6c7d",
  floor: "#b9a98a",
  wall: "#6a5640",
  roof: "#a8463c",
  roof2: "#7c3a8f",
  door: "#52351f",
  tree: "#2f6f37",
  treeDark: "#245a2c",
  trunk: "#6b4a2c",
  bush: "#3c7a3a",
  flowerA: "#e7d24a",
  flowerB: "#e36a8c",
  darkGrass: "#3a4a52",
  darkGrass2: "#33424a",
  darkTree: "#27414a",
  ruinFloor: "#9a9384",
  ruinStone: "#7d7668",
  snow: "#e8eef2",
  shadow: "rgba(20,16,30,0.28)",
} as const;

// ---- Tiles -----------------------------------------------------------------
export enum T {
  Grass,
  GrassAlt,
  Path,
  Dirt,
  Water,
  Sand,
  Tree,
  Bush,
  Flower,
  Floor,
  Wall,
  RoofRed,
  RoofPurple,
  Door,
  Fence,
  DarkGrass,
  DarkTree,
  RuinFloor,
  RuinStone,
  Bridge,
  Portal, // visual marker for zone edges/stairs
  StoneWall,
}

export interface TileInfo {
  solid: boolean;
}

export const TILES: Record<T, TileInfo> = {
  [T.Grass]: { solid: false },
  [T.GrassAlt]: { solid: false },
  [T.Path]: { solid: false },
  [T.Dirt]: { solid: false },
  [T.Water]: { solid: true },
  [T.Sand]: { solid: false },
  [T.Tree]: { solid: true },
  [T.Bush]: { solid: true },
  [T.Flower]: { solid: false },
  [T.Floor]: { solid: false },
  [T.Wall]: { solid: true },
  [T.RoofRed]: { solid: true },
  [T.RoofPurple]: { solid: true },
  [T.Door]: { solid: false },
  [T.Fence]: { solid: true },
  [T.DarkGrass]: { solid: false },
  [T.DarkTree]: { solid: true },
  [T.RuinFloor]: { solid: false },
  [T.RuinStone]: { solid: true },
  [T.Bridge]: { solid: false },
  [T.Portal]: { solid: false },
  [T.StoneWall]: { solid: true },
};

// ---- Balance ---------------------------------------------------------------
export const BAL = {
  playerSpeed: 132, // px/sec
  monsterSpeed: 70,
  simSpeed: 116,
  attackCooldown: 0.42,
  baseAttackRange: 46,
  aggroRange: 190,
  leashRange: 420,
  respawnTime: 4.0,
  monsterRespawnTime: 9.0,
  // XP curve: xp needed to go from level n -> n+1
  xpForLevel: (n: number) => Math.floor(28 * Math.pow(n, 1.55) + 12 * n),
  simCount: 46, // total simulated players in the world
  autosaveInterval: 20, // seconds
};

export const SAVE_KEY = "aethermoor.save.v1";
