// ============================================================================
// Classes, base stats, and leveling math.
// ============================================================================
import { BAL } from "./config";

export type ClassId = "warrior" | "mage" | "ranger";

export interface Stats {
  hp: number; maxHp: number;
  mp: number; maxMp: number;
  atk: number; def: number;
  crit: number;   // 0..1
  speed: number;  // px/sec multiplier base
}

export interface ClassDef {
  id: ClassId;
  name: string;
  blurb: string;
  weapon: "sword" | "staff" | "bow";
  body: string; accent: string; // sprite colours
  base: Omit<Stats, "hp" | "mp"> & { hp: number; mp: number };
  growth: { hp: number; mp: number; atk: number; def: number };
  // ability ids unlocked for this class (hotbar slots 2 & 3; slot 1 is basic attack)
  abilities: [string, string];
}

export const CLASSES: Record<ClassId, ClassDef> = {
  warrior: {
    id: "warrior",
    name: "Warrior",
    blurb: "Sturdy frontline brawler. Cleaves through crowds and shrugs off hits.",
    weapon: "sword",
    body: "#c25b4a", accent: "#8a8f98",
    base: { maxHp: 120, hp: 120, maxMp: 30, mp: 30, atk: 14, def: 7, crit: 0.08, speed: 1 },
    growth: { hp: 18, mp: 4, atk: 3.2, def: 1.8 },
    abilities: ["cleave", "warcry"],
  },
  mage: {
    id: "mage",
    name: "Mage",
    blurb: "Glass cannon. Hurls fireballs and freezes foes from range.",
    weapon: "staff",
    body: "#5566c0", accent: "#9b6bd6",
    base: { maxHp: 78, hp: 78, maxMp: 80, mp: 80, atk: 18, def: 3, crit: 0.1, speed: 1 },
    growth: { hp: 11, mp: 12, atk: 4.0, def: 0.9 },
    abilities: ["fireball", "frostnova"],
  },
  ranger: {
    id: "ranger",
    name: "Ranger",
    blurb: "Nimble archer. Rains arrows and darts away from danger.",
    weapon: "bow",
    body: "#3f9a55", accent: "#caa24a",
    base: { maxHp: 95, hp: 95, maxMp: 50, mp: 50, atk: 16, def: 5, crit: 0.14, speed: 1.08 },
    growth: { hp: 14, mp: 7, atk: 3.5, def: 1.3 },
    abilities: ["multishot", "dash"],
  },
};

export function statsForClass(cls: ClassId, level: number): Stats {
  const d = CLASSES[cls];
  const g = d.growth;
  const lv = level - 1;
  const maxHp = Math.round(d.base.maxHp + g.hp * lv);
  const maxMp = Math.round(d.base.maxMp + g.mp * lv);
  return {
    maxHp, hp: maxHp,
    maxMp, mp: maxMp,
    atk: Math.round((d.base.atk + g.atk * lv) * 10) / 10,
    def: Math.round((d.base.def + g.def * lv) * 10) / 10,
    crit: d.base.crit + lv * 0.003,
    speed: d.base.speed,
  };
}

// total XP required to *reach* a given level (cumulative)
export function xpToReach(level: number): number {
  let total = 0;
  for (let n = 1; n < level; n++) total += BAL.xpForLevel(n);
  return total;
}

// given total xp, return { level, into, need } for the current level
export function levelFromXp(totalXp: number): { level: number; into: number; need: number } {
  let level = 1;
  let remaining = totalXp;
  while (remaining >= BAL.xpForLevel(level)) {
    remaining -= BAL.xpForLevel(level);
    level++;
    if (level > 200) break;
  }
  return { level, into: remaining, need: BAL.xpForLevel(level) };
}
