// ============================================================================
// Save / load to localStorage.
// ============================================================================
import { SAVE_KEY } from "./config";
import type { World } from "./world";

export function hasSave(): boolean { return !!localStorage.getItem(SAVE_KEY); }
export function readSave(): any | null {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY) || "null"); } catch { return null; }
}
export function clearSave() { localStorage.removeItem(SAVE_KEY); }

export function saveGame(world: World) {
  const p = world.player;
  const data = {
    v: 1, ts: Date.now(),
    player: {
      name: p.name, cls: p.cls, level: p.level, xp: p.xp, gold: p.gold,
      hp: p.stats.hp, mp: p.stats.mp, equipment: p.equipment, inventory: p.inventory,
      kills: p.kills, deaths: p.deaths, zone: world.zone.id,
    },
    quests: world.quests.serialize(),
    sim: world.sim.serialize(),
  };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* storage full / blocked */ }
}

export function applySaveData(world: World, data: any) {
  const p = world.player, d = data.player ?? {};
  p.level = d.level ?? 1; p.xp = d.xp ?? 0; p.gold = d.gold ?? 0;
  p.kills = d.kills ?? {}; p.deaths = d.deaths ?? 0;
  p.equipment = d.equipment ?? { weapon: null, armor: null, trinket: null };
  p.inventory = d.inventory ?? [];
  world.recomputePlayerStats();
  p.stats.hp = Math.min(p.stats.maxHp, d.hp ?? p.stats.maxHp);
  p.stats.mp = Math.min(p.stats.maxMp, d.mp ?? p.stats.maxMp);
  world.quests.load(data.quests);
  world.sim.load(data.sim);
  world.enterZone(d.zone ?? "town");
}
