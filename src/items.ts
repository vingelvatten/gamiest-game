// ============================================================================
// Items, loot tables, equipment bonuses and shop stock.
// Items are referenced by string id everywhere (saves stay tiny & robust).
// ============================================================================
import { COL } from "./config";
import { RNG } from "./engine";
import { roundRect } from "./art";
import type { Stats } from "./progression";

export type Rarity = "common" | "uncommon" | "rare" | "epic";
export const RARITY_COL: Record<Rarity, string> = {
  common: "#cfc6b4", uncommon: "#6bbf59", rare: "#4a8fd2", epic: "#b76bd6",
};
export const RARITY_RANK: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 3 };

export type ItemType = "weapon" | "armor" | "trinket" | "potion" | "material";
export type IconKind =
  | "sword" | "greatsword" | "staff" | "bow" | "dagger"
  | "helm" | "armor" | "robe" | "ring" | "amulet"
  | "potionRed" | "potionBlue" | "herb" | "ore" | "bone" | "gem" | "pelt" | "silk" | "shard" | "scroll";

export interface Item {
  id: string;
  name: string;
  type: ItemType;
  rarity: Rarity;
  value: number;        // buy price (sell = half)
  icon: IconKind;
  desc: string;
  bonus?: Partial<Stats>; // for weapon/armor/trinket
  heal?: number;          // potion hp
  mana?: number;          // potion mp
  stack?: boolean;        // potions/materials stack
}

const I = (it: Item) => it;
export const ITEMS: Record<string, Item> = {
  // --- weapons ---
  rusty_sword:   I({ id: "rusty_sword", name: "Rusty Sword", type: "weapon", rarity: "common", value: 15, icon: "sword", desc: "Seen better days.", bonus: { atk: 3 } }),
  iron_sword:    I({ id: "iron_sword", name: "Iron Sword", type: "weapon", rarity: "uncommon", value: 70, icon: "sword", desc: "Reliable steel edge.", bonus: { atk: 8, crit: 0.02 } }),
  knight_blade:  I({ id: "knight_blade", name: "Knight's Blade", type: "weapon", rarity: "rare", value: 220, icon: "greatsword", desc: "Forged for champions.", bonus: { atk: 16, def: 2 } }),
  dawnbreaker:   I({ id: "dawnbreaker", name: "Dawnbreaker", type: "weapon", rarity: "epic", value: 640, icon: "greatsword", desc: "Hums with morning light.", bonus: { atk: 28, crit: 0.06, maxHp: 20 } }),
  oak_staff:     I({ id: "oak_staff", name: "Oak Staff", type: "weapon", rarity: "common", value: 18, icon: "staff", desc: "A humble conduit.", bonus: { atk: 4, maxMp: 10 } }),
  ember_staff:   I({ id: "ember_staff", name: "Ember Staff", type: "weapon", rarity: "uncommon", value: 80, icon: "staff", desc: "Warm to the touch.", bonus: { atk: 10, maxMp: 20 } }),
  archmage_rod:  I({ id: "archmage_rod", name: "Archmage Rod", type: "weapon", rarity: "rare", value: 240, icon: "staff", desc: "Crackles with power.", bonus: { atk: 19, maxMp: 40, crit: 0.04 } }),
  hunting_bow:   I({ id: "hunting_bow", name: "Hunting Bow", type: "weapon", rarity: "common", value: 18, icon: "bow", desc: "Bent yew and gut string.", bonus: { atk: 4, crit: 0.03 } }),
  ranger_bow:    I({ id: "ranger_bow", name: "Ranger's Longbow", type: "weapon", rarity: "uncommon", value: 82, icon: "bow", desc: "Sings when loosed.", bonus: { atk: 9, crit: 0.06 } }),
  windpiercer:   I({ id: "windpiercer", name: "Windpiercer", type: "weapon", rarity: "rare", value: 245, icon: "bow", desc: "Arrows never waver.", bonus: { atk: 17, crit: 0.1, speed: 0.05 } }),
  // --- armor ---
  cloth_tunic:   I({ id: "cloth_tunic", name: "Cloth Tunic", type: "armor", rarity: "common", value: 12, icon: "robe", desc: "Better than nothing.", bonus: { def: 2, maxHp: 8 } }),
  leather_armor: I({ id: "leather_armor", name: "Leather Armor", type: "armor", rarity: "uncommon", value: 60, icon: "armor", desc: "Supple and quiet.", bonus: { def: 5, maxHp: 22 } }),
  chainmail:     I({ id: "chainmail", name: "Chainmail", type: "armor", rarity: "rare", value: 200, icon: "armor", desc: "Jangles reassuringly.", bonus: { def: 10, maxHp: 45 } }),
  guardian_plate:I({ id: "guardian_plate", name: "Guardian Plate", type: "armor", rarity: "epic", value: 600, icon: "armor", desc: "A fortress you can wear.", bonus: { def: 18, maxHp: 90, speed: -0.03 } }),
  mage_robe:     I({ id: "mage_robe", name: "Enchanted Robe", type: "armor", rarity: "uncommon", value: 64, icon: "robe", desc: "Woven with calm.", bonus: { def: 3, maxHp: 12, maxMp: 30 } }),
  // --- trinkets ---
  copper_ring:   I({ id: "copper_ring", name: "Copper Ring", type: "trinket", rarity: "common", value: 20, icon: "ring", desc: "A modest band.", bonus: { atk: 1, crit: 0.02 } }),
  swift_amulet:  I({ id: "swift_amulet", name: "Swift Amulet", type: "trinket", rarity: "uncommon", value: 90, icon: "amulet", desc: "Quickens the step.", bonus: { speed: 0.1, crit: 0.03 } }),
  vital_charm:   I({ id: "vital_charm", name: "Vital Charm", type: "trinket", rarity: "rare", value: 210, icon: "gem", desc: "A steady heartbeat.", bonus: { maxHp: 40, def: 3 } }),
  arcane_focus:  I({ id: "arcane_focus", name: "Arcane Focus", type: "trinket", rarity: "rare", value: 210, icon: "gem", desc: "Sharpens the mind.", bonus: { atk: 6, maxMp: 35 } }),
  // --- potions ---
  minor_potion:  I({ id: "minor_potion", name: "Minor Potion", type: "potion", rarity: "common", value: 12, icon: "potionRed", desc: "Restores 45 HP.", heal: 45, stack: true }),
  potion:        I({ id: "potion", name: "Healing Potion", type: "potion", rarity: "common", value: 28, icon: "potionRed", desc: "Restores 110 HP.", heal: 110, stack: true }),
  greater_potion:I({ id: "greater_potion", name: "Greater Potion", type: "potion", rarity: "uncommon", value: 60, icon: "potionRed", desc: "Restores 240 HP.", heal: 240, stack: true }),
  mana_potion:   I({ id: "mana_potion", name: "Mana Potion", type: "potion", rarity: "common", value: 24, icon: "potionBlue", desc: "Restores 60 MP.", mana: 60, stack: true }),
  // --- materials ---
  slime_gel:     I({ id: "slime_gel", name: "Slime Gel", type: "material", rarity: "common", value: 4, icon: "herb", desc: "Squishy and useful.", stack: true }),
  rat_tail:      I({ id: "rat_tail", name: "Rat Tail", type: "material", rarity: "common", value: 3, icon: "bone", desc: "Ew.", stack: true }),
  bat_wing:      I({ id: "bat_wing", name: "Bat Wing", type: "material", rarity: "common", value: 6, icon: "silk", desc: "Leathery and thin.", stack: true }),
  wolf_pelt:     I({ id: "wolf_pelt", name: "Wolf Pelt", type: "material", rarity: "common", value: 9, icon: "pelt", desc: "Warm winter fur.", stack: true }),
  boar_tusk:     I({ id: "boar_tusk", name: "Boar Tusk", type: "material", rarity: "uncommon", value: 14, icon: "bone", desc: "Sharp and sturdy.", stack: true }),
  spider_silk:   I({ id: "spider_silk", name: "Spider Silk", type: "material", rarity: "uncommon", value: 12, icon: "silk", desc: "Stronger than it looks.", stack: true }),
  old_bone:      I({ id: "old_bone", name: "Old Bone", type: "material", rarity: "common", value: 7, icon: "bone", desc: "Rattles faintly.", stack: true }),
  ghost_essence: I({ id: "ghost_essence", name: "Ghost Essence", type: "material", rarity: "rare", value: 30, icon: "shard", desc: "Cold to hold.", stack: true }),
  rune_shard:    I({ id: "rune_shard", name: "Rune Shard", type: "material", rarity: "rare", value: 40, icon: "shard", desc: "Etched with old power.", stack: true }),
  imp_horn:      I({ id: "imp_horn", name: "Imp Horn", type: "material", rarity: "uncommon", value: 18, icon: "bone", desc: "Faintly warm.", stack: true }),
};

export interface ItemStack { id: string; qty: number; }
export interface Equipment { weapon: string | null; armor: string | null; trinket: string | null; }

export function equipBonus(eq: Equipment): Partial<Stats> {
  const out: Partial<Stats> = {};
  for (const id of [eq.weapon, eq.armor, eq.trinket]) {
    if (!id) continue;
    const b = ITEMS[id]?.bonus;
    if (!b) continue;
    for (const k in b) (out as any)[k] = ((out as any)[k] ?? 0) + (b as any)[k];
  }
  return out;
}

// ---- inventory ops (operate on a stack list) -------------------------------
export function addItem(inv: ItemStack[], id: string, qty = 1) {
  const it = ITEMS[id];
  if (!it) return;
  if (it.stack) {
    const ex = inv.find((s) => s.id === id);
    if (ex) { ex.qty += qty; return; }
  }
  if (it.stack) inv.push({ id, qty });
  else for (let i = 0; i < qty; i++) inv.push({ id, qty: 1 });
}
export function removeItem(inv: ItemStack[], id: string, qty = 1): boolean {
  const idx = inv.findIndex((s) => s.id === id);
  if (idx < 0) return false;
  inv[idx].qty -= qty;
  if (inv[idx].qty <= 0) inv.splice(idx, 1);
  return true;
}
export function countItem(inv: ItemStack[], id: string) {
  return inv.filter((s) => s.id === id).reduce((a, s) => a + s.qty, 0);
}
export const sellValue = (id: string) => Math.max(1, Math.floor((ITEMS[id]?.value ?? 2) / 2));

// ---- loot tables -----------------------------------------------------------
interface LootRoll { id: string; weight: number; qty?: [number, number]; }
export const LOOT: Record<string, LootRoll[]> = {
  slime:    [{ id: "slime_gel", weight: 60, qty: [1, 2] }, { id: "minor_potion", weight: 12 }, { id: "copper_ring", weight: 4 }],
  rat:      [{ id: "rat_tail", weight: 60 }, { id: "minor_potion", weight: 10 }, { id: "cloth_tunic", weight: 4 }],
  bat:      [{ id: "bat_wing", weight: 55 }, { id: "mana_potion", weight: 12 }, { id: "oak_staff", weight: 3 }],
  boar:     [{ id: "boar_tusk", weight: 55 }, { id: "potion", weight: 12 }, { id: "leather_armor", weight: 4 }],
  wolf:     [{ id: "wolf_pelt", weight: 55 }, { id: "potion", weight: 12 }, { id: "iron_sword", weight: 4 }, { id: "hunting_bow", weight: 3 }],
  spider:   [{ id: "spider_silk", weight: 55 }, { id: "swift_amulet", weight: 5 }, { id: "ranger_bow", weight: 3 }],
  skeleton: [{ id: "old_bone", weight: 55 }, { id: "iron_sword", weight: 7 }, { id: "chainmail", weight: 3 }, { id: "greater_potion", weight: 8 }],
  wraith:   [{ id: "ghost_essence", weight: 50 }, { id: "mage_robe", weight: 6 }, { id: "arcane_focus", weight: 4 }, { id: "greater_potion", weight: 8 }],
  imp:      [{ id: "imp_horn", weight: 50 }, { id: "ember_staff", weight: 6 }, { id: "vital_charm", weight: 3 }],
  golem:    [{ id: "rune_shard", weight: 55 }, { id: "knight_blade", weight: 5 }, { id: "guardian_plate", weight: 3 }, { id: "windpiercer", weight: 3 }, { id: "archmage_rod", weight: 3 }, { id: "dawnbreaker", weight: 2 }],
};

export function rollLoot(table: string, rng: RNG): { items: ItemStack[] } {
  const rolls = LOOT[table];
  const items: ItemStack[] = [];
  if (!rolls) return { items };
  const total = rolls.reduce((a, r) => a + r.weight, 0);
  // ~70% chance for one drop
  if (rng.chance(0.72)) {
    let r = rng.range(0, total);
    for (const roll of rolls) {
      r -= roll.weight;
      if (r <= 0) {
        const qty = roll.qty ? rng.int(roll.qty[0], roll.qty[1]) : 1;
        items.push({ id: roll.id, qty });
        break;
      }
    }
  }
  return { items };
}

// ---- shops -----------------------------------------------------------------
export interface Shop { name: string; stock: string[]; }
export const SHOPS: Record<string, Shop> = {
  general: { name: "General Store", stock: ["minor_potion", "potion", "greater_potion", "mana_potion", "cloth_tunic", "copper_ring"] },
  smith: { name: "Blacksmith", stock: ["iron_sword", "knight_blade", "leather_armor", "chainmail", "hunting_bow", "ranger_bow", "swift_amulet"] },
  arcanum: { name: "The Arcanum", stock: ["oak_staff", "ember_staff", "archmage_rod", "mage_robe", "arcane_focus", "vital_charm"] },
};

// ---- icon drawing ----------------------------------------------------------
export function drawItemIcon(c: CanvasRenderingContext2D, x: number, y: number, item: Item, size: number) {
  c.save();
  c.translate(x, y);
  const s = size / 32;
  c.scale(s, s);
  // rarity glow chip background handled by caller; draw the icon centred in 32x32
  const k = item.icon;
  c.lineWidth = 2;
  switch (k) {
    case "sword": case "greatsword": {
      const wide = k === "greatsword";
      c.fillStyle = "#dbe0ea"; c.fillRect(wide ? 13 : 14, 4, wide ? 6 : 4, 18);
      c.fillStyle = COL.goldDark; c.fillRect(10, 21, 12, 3);
      c.fillStyle = COL.trunk; c.fillRect(15, 24, 2, 5); break;
    }
    case "staff": {
      c.fillStyle = COL.trunk; c.fillRect(15, 8, 3, 20);
      c.fillStyle = COL.mana; c.beginPath(); c.arc(16, 7, 5, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#cdd6ff"; c.beginPath(); c.arc(16, 7, 2, 0, Math.PI * 2); c.fill(); break;
    }
    case "bow": {
      c.strokeStyle = COL.trunk; c.lineWidth = 3; c.beginPath(); c.arc(12, 16, 11, -1.1, 1.1); c.stroke();
      c.strokeStyle = "#e8e2cf"; c.lineWidth = 1; c.beginPath(); c.moveTo(12 + Math.cos(-1.1) * 11, 16 + Math.sin(-1.1) * 11); c.lineTo(12 + Math.cos(1.1) * 11, 16 + Math.sin(1.1) * 11); c.stroke(); break;
    }
    case "dagger": { c.fillStyle = "#dbe0ea"; c.fillRect(15, 6, 3, 14); c.fillStyle = COL.goldDark; c.fillRect(12, 19, 9, 2); break; }
    case "armor": {
      c.fillStyle = "#9aa3b0"; roundRect(c, 8, 7, 16, 18, 4); c.fill();
      c.fillStyle = "#7d8794"; c.fillRect(8, 13, 16, 2); c.fillRect(15, 7, 2, 18); break;
    }
    case "robe": {
      c.fillStyle = COL.purple; c.beginPath(); c.moveTo(10, 8); c.lineTo(22, 8); c.lineTo(25, 26); c.lineTo(7, 26); c.closePath(); c.fill();
      c.fillStyle = COL.gold; c.fillRect(15, 8, 2, 18); break;
    }
    case "helm": { c.fillStyle = "#9aa3b0"; c.beginPath(); c.arc(16, 16, 9, Math.PI, 0); c.fill(); c.fillRect(7, 16, 18, 5); break; }
    case "ring": { c.strokeStyle = COL.gold; c.lineWidth = 3; c.beginPath(); c.arc(16, 18, 7, 0, Math.PI * 2); c.stroke(); c.fillStyle = COL.blue; c.beginPath(); c.arc(16, 9, 3, 0, Math.PI * 2); c.fill(); break; }
    case "amulet": { c.strokeStyle = COL.gold; c.lineWidth = 2; c.beginPath(); c.arc(16, 12, 7, 0.2, Math.PI - 0.2); c.stroke(); c.fillStyle = COL.green; c.beginPath(); c.arc(16, 20, 4, 0, Math.PI * 2); c.fill(); break; }
    case "gem": { c.fillStyle = COL.purple; c.beginPath(); c.moveTo(16, 6); c.lineTo(25, 15); c.lineTo(16, 27); c.lineTo(7, 15); c.closePath(); c.fill(); c.fillStyle = "rgba(255,255,255,0.4)"; c.beginPath(); c.moveTo(16, 6); c.lineTo(20, 15); c.lineTo(16, 27); c.closePath(); c.fill(); break; }
    case "potionRed": case "potionBlue": {
      c.fillStyle = "#cfd6e0"; c.fillRect(13, 5, 6, 4);
      c.fillStyle = k === "potionRed" ? COL.red : COL.mana;
      c.beginPath(); c.moveTo(11, 12); c.lineTo(21, 12); c.lineTo(22, 26); c.arc(16, 24, 6, 0, Math.PI); c.lineTo(10, 26); c.closePath(); c.fill();
      c.fillStyle = "rgba(255,255,255,0.4)"; c.fillRect(13, 14, 2, 8); break;
    }
    case "herb": { c.strokeStyle = COL.green; c.lineWidth = 2; c.beginPath(); c.moveTo(16, 26); c.lineTo(16, 12); c.stroke(); c.fillStyle = COL.green; c.beginPath(); c.ellipse(12, 14, 4, 6, -0.5, 0, Math.PI * 2); c.fill(); c.beginPath(); c.ellipse(20, 14, 4, 6, 0.5, 0, Math.PI * 2); c.fill(); break; }
    case "ore": { c.fillStyle = COL.stoneDark; c.beginPath(); c.moveTo(8, 20); c.lineTo(14, 10); c.lineTo(24, 14); c.lineTo(22, 24); c.closePath(); c.fill(); c.fillStyle = COL.gold; c.fillRect(14, 16, 3, 3); c.fillRect(18, 19, 2, 2); break; }
    case "bone": { c.strokeStyle = "#e9e4d4"; c.lineWidth = 4; c.lineCap = "round"; c.beginPath(); c.moveTo(10, 22); c.lineTo(22, 10); c.stroke(); c.fillStyle = "#f0ecdd"; c.beginPath(); c.arc(10, 22, 3, 0, Math.PI * 2); c.arc(22, 10, 3, 0, Math.PI * 2); c.fill(); break; }
    case "shard": { c.fillStyle = COL.blue; c.beginPath(); c.moveTo(16, 5); c.lineTo(21, 18); c.lineTo(14, 27); c.lineTo(11, 14); c.closePath(); c.fill(); break; }
    case "pelt": { c.fillStyle = "#8a7a66"; roundRect(c, 8, 9, 16, 14, 6); c.fill(); c.fillStyle = "#6b5a46"; c.fillRect(12, 12, 2, 8); c.fillRect(18, 12, 2, 8); break; }
    case "silk": { c.strokeStyle = "#d8d2c2"; c.lineWidth = 1; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(8, 8 + i * 5); c.lineTo(24, 10 + i * 5); c.stroke(); } c.beginPath(); c.moveTo(16, 6); c.lineTo(16, 26); c.stroke(); break; }
    case "scroll": { c.fillStyle = COL.parchment; roundRect(c, 9, 8, 14, 16, 2); c.fill(); c.strokeStyle = COL.goldDark; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(12, 12 + i * 4); c.lineTo(20, 12 + i * 4); c.stroke(); } break; }
    default: { c.fillStyle = COL.gold; c.beginPath(); c.arc(16, 16, 7, 0, Math.PI * 2); c.fill(); }
  }
  c.restore();
}
