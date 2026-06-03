// ============================================================================
// Quests: a short main questline plus side quests and repeatable bounties.
// Kill-progress is event driven; collect-progress is read from the inventory.
// ============================================================================
import { addItem, countItem, ITEMS, removeItem } from "./items";
import type { MonsterKind } from "./art";
import type { World } from "./world";

export type ObjType = "kill" | "collect" | "talk";
export interface QuestDef {
  id: string;
  name: string;
  giver: string;          // npc id
  desc: string;
  obj: { type: ObjType; target: string; count: number; label: string; zone?: string };
  reward: { xp: number; gold: number; items?: { id: string; qty: number }[] };
  next?: string;          // chained quest id
  prereq?: string;        // must have completed this first
  minLevel?: number;
  repeatable?: boolean;
}

export const QUESTS: Record<string, QuestDef> = {
  // ---- main questline (Elder Maeve) ----
  mq1: {
    id: "mq1", name: "A Rat Problem", giver: "elder",
    desc: "Field rats have overrun the Greenfields east of town. Thin them out.",
    obj: { type: "kill", target: "rat", count: 5, label: "Rats slain", zone: "greenfields" },
    reward: { xp: 60, gold: 25, items: [{ id: "minor_potion", qty: 3 }] }, next: "mq2",
  },
  mq2: {
    id: "mq2", name: "Gathering Storm", giver: "elder", prereq: "mq1",
    desc: "Slimes and boars grow bold. Cull eight beasts of the Greenfields.",
    obj: { type: "kill", target: "slime", count: 8, label: "Slimes slain", zone: "greenfields" },
    reward: { xp: 130, gold: 45, items: [{ id: "iron_sword", qty: 1 }] }, next: "mq3",
  },
  mq3: {
    id: "mq3", name: "The Darkwood Beckons", giver: "elder", prereq: "mq2", minLevel: 4,
    desc: "Something stirs in the Darkwood. Clear the spiders nesting at its edge.",
    obj: { type: "kill", target: "spider", count: 6, label: "Spiders slain", zone: "darkwood" },
    reward: { xp: 260, gold: 80, items: [{ id: "leather_armor", qty: 1 }] }, next: "mq4",
  },
  mq4: {
    id: "mq4", name: "Bones of the Past", giver: "elder", prereq: "mq3", minLevel: 7,
    desc: "The dead walk in the Sunken Ruins. Put the skeletons to rest.",
    obj: { type: "kill", target: "skeleton", count: 8, label: "Skeletons felled", zone: "ruins" },
    reward: { xp: 460, gold: 140, items: [{ id: "greater_potion", qty: 3 }] }, next: "mq5",
  },
  mq5: {
    id: "mq5", name: "The Stone Guardian", giver: "elder", prereq: "mq4", minLevel: 10,
    desc: "An ancient Golem guards the heart of the Ruins. End its long vigil.",
    obj: { type: "kill", target: "golem", count: 1, label: "Golem destroyed", zone: "ruins" },
    reward: { xp: 900, gold: 400, items: [{ id: "vital_charm", qty: 1 }] },
  },

  // ---- side quests ----
  sq_pelts: {
    id: "sq_pelts", name: "Pelts for Winter", giver: "hunter",
    desc: "Bring me five wolf pelts and I'll part with a charm of swiftness.",
    obj: { type: "collect", target: "wolf_pelt", count: 5, label: "Wolf Pelts" },
    reward: { xp: 180, gold: 30, items: [{ id: "swift_amulet", qty: 1 }] }, minLevel: 3,
  },
  sq_essence: {
    id: "sq_essence", name: "Essence Study", giver: "arcanist",
    desc: "The wraiths leave behind a chill essence. Gather three for my research.",
    obj: { type: "collect", target: "ghost_essence", count: 3, label: "Ghost Essence" },
    reward: { xp: 320, gold: 60, items: [{ id: "arcane_focus", qty: 1 }] }, minLevel: 6,
  },

  // ---- repeatable bounty (Captain Roe) ----
  bounty_slimes: {
    id: "bounty_slimes", name: "Bounty: Slime Cull", giver: "captain", repeatable: true,
    desc: "Standing order: cull ten slimes in the Greenfields for coin.",
    obj: { type: "kill", target: "slime", count: 10, label: "Slimes culled", zone: "greenfields" },
    reward: { xp: 90, gold: 70 },
  },
  bounty_undead: {
    id: "bounty_undead", name: "Bounty: Restless Dead", giver: "captain", repeatable: true, minLevel: 6,
    desc: "Standing order: destroy twelve undead in the Sunken Ruins.",
    obj: { type: "kill", target: "skeleton", count: 12, label: "Undead destroyed", zone: "ruins" },
    reward: { xp: 240, gold: 150 },
  },
};

export class QuestLog {
  active: Record<string, number> = {}; // questId -> kill progress
  completed: Set<string> = new Set();
  talked: Set<string> = new Set();     // npc ids talked-to (for talk objectives)

  isActive(id: string) { return id in this.active; }
  isDone(id: string) { return this.completed.has(id); }

  available(npcId: string, world: World): string[] {
    const out: string[] = [];
    for (const q of Object.values(QUESTS)) {
      if (q.giver !== npcId) continue;
      if (this.isActive(q.id)) continue;
      if (this.isDone(q.id) && !q.repeatable) continue;
      if (q.prereq && !this.completed.has(q.prereq)) continue;
      if (q.minLevel && world.player.level < q.minLevel) continue;
      out.push(q.id);
    }
    return out;
  }

  accept(id: string) { if (!this.isActive(id)) this.active[id] = 0; }

  onKill(kind: MonsterKind, zoneId: string) {
    for (const id in this.active) {
      const q = QUESTS[id];
      if (q.obj.type !== "kill") continue;
      if (q.obj.target !== kind) continue;
      if (q.obj.zone && q.obj.zone !== zoneId) continue;
      this.active[id] = Math.min(q.obj.count, this.active[id] + 1);
    }
  }
  onTalk(npcId: string) { this.talked.add(npcId); }

  progress(id: string, world: World): number {
    const q = QUESTS[id];
    if (!q) return 0;
    if (q.obj.type === "kill") return this.active[id] ?? 0;
    if (q.obj.type === "collect") return Math.min(q.obj.count, countItem(world.player.inventory, q.obj.target));
    if (q.obj.type === "talk") return this.talked.has(q.obj.target) ? q.obj.count : 0;
    return 0;
  }

  canTurnIn(id: string, world: World) { return this.isActive(id) && this.progress(id, world) >= QUESTS[id].obj.count; }

  // npc marker: any quest ready to turn in? any to offer?
  marker(npcId: string, world: World): "available" | "turnin" | "none" {
    for (const id in this.active) if (QUESTS[id].giver === npcId && this.canTurnIn(id, world)) return "turnin";
    if (this.available(npcId, world).length > 0) return "available";
    return "none";
  }

  turnIn(id: string, world: World) {
    const q = QUESTS[id];
    if (!q || !this.canTurnIn(id, world)) return;
    if (q.obj.type === "collect") removeItem(world.player.inventory, q.obj.target, q.obj.count);
    delete this.active[id];
    if (!q.repeatable) this.completed.add(id);
    // rewards
    world.player.gold += q.reward.gold;
    world.grantXp(q.reward.xp);
    for (const it of q.reward.items ?? []) addItem(world.player.inventory, it.id, it.qty);
    const rewardTxt = [`${q.reward.xp} XP`, `${q.reward.gold}g`, ...(q.reward.items ?? []).map((i) => `${i.qty}× ${ITEMS[i.id].name}`)].join(", ");
    world.notify(`Quest complete: ${q.name}  (+${rewardTxt})`);
    world.sim.chat.system(`${world.player.name} completed "${q.name}"!`);
    if (q.next) world.notify(`New quest available from ${q.giver === "elder" ? "Elder Maeve" : "the giver"}.`);
  }

  serialize() { return { active: this.active, completed: [...this.completed], talked: [...this.talked] }; }
  load(d: any) {
    this.active = d?.active ?? {};
    this.completed = new Set(d?.completed ?? []);
    this.talked = new Set(d?.talked ?? []);
  }
}
