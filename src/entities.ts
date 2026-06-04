// ============================================================================
// Entities: the player, simulated players, monsters and town NPCs.
// (Combat, loot and the sim AI are layered on in combat.ts / simulation.ts.)
// ============================================================================
import { BAL, COL } from "./config";
import { clamp, rng, TAU } from "./engine";
import { CharStyle, MonsterKind } from "./art";
import { CLASSES, ClassId, levelFromXp, Stats, statsForClass } from "./progression";
import type { World } from "./world";

let _id = 1;
export const nextId = () => _id++;

export type Facing = "down" | "up" | "left" | "right";
export function facingFrom(dx: number, dy: number, prev: Facing): Facing {
  if (dx === 0 && dy === 0) return prev;
  if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? "left" : "right";
  return dy < 0 ? "up" : "down";
}

export abstract class Entity {
  id = nextId();
  radius = 10;
  facing: Facing = "down";
  walk = 0;
  bob = 0;
  heading = 0; // movement direction in radians, for 3D model facing
  alive = true;
  hurt = 0; // white-flash timer
  abstract kind: "player" | "monster" | "npc" | "sim";
  constructor(public x: number, public y: number) {}
  get sortY() { return this.y; }
  abstract update(world: World, dt: number): void;

  protected animate(moving: boolean, dt: number, speedScale = 1) {
    if (moving) {
      this.walk += dt * 2.4 * speedScale;
      this.bob = Math.abs(Math.sin(this.walk * TAU)) * 2.2;
    } else {
      this.walk += dt * 0.4;
      this.bob = (Math.sin(this.walk * TAU) + 1) * 0.6;
    }
    if (this.hurt > 0) this.hurt = Math.max(0, this.hurt - dt);
  }
}

// ----------------------------------------------------------------------------
// Player
// ----------------------------------------------------------------------------
export class Player extends Entity {
  kind = "player" as const;
  override radius = 11;
  cls: ClassId;
  name: string;
  stats: Stats;
  xp = 0;
  level = 1;
  gold = 30;
  attackCd = 0;
  invuln = 0;
  abilityCd: Record<string, number> = {};
  // filled in by later systems (kept here so saves & UI can rely on them)
  inventory: import("./items").ItemStack[] = [];
  equipment: import("./items").Equipment = { weapon: null, armor: null, trinket: null };
  questFlags: Record<string, number> = {};
  kills: Record<string, number> = {};
  deaths = 0;
  respawnTimer = 0;

  constructor(x: number, y: number, cls: ClassId, name: string) {
    super(x, y);
    this.cls = cls;
    this.name = name;
    this.stats = statsForClass(cls, 1);
  }

  get isDead() { return this.stats.hp <= 0; }

  // recompute derived max stats from class+level, preserving current hp ratio
  refreshStats(equipBonus?: Partial<Stats>) {
    const base = statsForClass(this.cls, this.level);
    const hpRatio = this.stats.maxHp > 0 ? this.stats.hp / this.stats.maxHp : 1;
    const mpRatio = this.stats.maxMp > 0 ? this.stats.mp / this.stats.maxMp : 1;
    this.stats.maxHp = base.maxHp + (equipBonus?.maxHp ?? 0);
    this.stats.maxMp = base.maxMp + (equipBonus?.maxMp ?? 0);
    this.stats.atk = base.atk + (equipBonus?.atk ?? 0);
    this.stats.def = base.def + (equipBonus?.def ?? 0);
    this.stats.crit = base.crit + (equipBonus?.crit ?? 0);
    this.stats.speed = base.speed + (equipBonus?.speed ?? 0);
    this.stats.hp = clamp(Math.round(this.stats.maxHp * hpRatio), 1, this.stats.maxHp);
    this.stats.mp = clamp(Math.round(this.stats.maxMp * mpRatio), 0, this.stats.maxMp);
  }

  syncLevel() {
    const { level } = levelFromXp(this.xp);
    return level;
  }

  update(world: World, dt: number) {
    for (const k in this.abilityCd) this.abilityCd[k] = Math.max(0, this.abilityCd[k] - dt);
    if (this.attackCd > 0) this.attackCd -= dt;
    if (this.invuln > 0) this.invuln -= dt;

    if (this.isDead) { this.animate(false, dt); return; }

    // passive regen
    this.stats.hp = Math.min(this.stats.maxHp, this.stats.hp + dt * (1.2 + this.level * 0.1));
    this.stats.mp = Math.min(this.stats.maxMp, this.stats.mp + dt * (3 + this.level * 0.2));

    const inp = world.input;
    if (world.uiBlockingInput) { this.animate(false, dt); return; }

    // camera-relative movement: forward = away from camera, right = strafe
    let mf = 0, mr = 0;
    if (inp.isDown("w", "arrowup")) mf += 1;
    if (inp.isDown("s", "arrowdown")) mf -= 1;
    if (inp.isDown("d", "arrowright")) mr += 1;
    if (inp.isDown("a", "arrowleft")) mr -= 1;
    const yaw = world.viewYaw;
    const fx = -Math.sin(yaw), fy = -Math.cos(yaw);
    const rx = Math.cos(yaw), ry = -Math.sin(yaw);
    let dx = fx * mf + rx * mr, dy = fy * mf + ry * mr;
    const moving = dx !== 0 || dy !== 0;
    if (moving) {
      const len = Math.hypot(dx, dy);
      dx /= len; dy /= len;
      this.heading = Math.atan2(dy, dx);
      this.facing = facingFrom(dx, dy, this.facing);
      const sp = BAL.playerSpeed * this.stats.speed;
      world.moveEntity(this, dx * sp * dt, dy * sp * dt);
    }
    this.animate(moving, dt, this.stats.speed);

    world.tryPlayerActions(this, dt);
  }
}

// ----------------------------------------------------------------------------
// Monster
// ----------------------------------------------------------------------------
export interface MonsterDef {
  kind: MonsterKind;
  name: string;
  hp: number; atk: number; def: number;
  xp: number; gold: [number, number];
  speed: number;
  scale?: number;
  ranged?: boolean;
  lootTable?: string;
}

export class Monster extends Entity {
  kind = "monster" as const;
  def: MonsterDef;
  hp: number; maxHp: number;
  level: number;
  attackCd = 0;
  state: "idle" | "wander" | "chase" | "attack" = "wander";
  homeX: number; homeY: number;
  wanderT = 0;
  tx = 0; ty = 0;
  targetId = 0; // who it's fighting (player or sim)

  constructor(x: number, y: number, def: MonsterDef, level: number) {
    super(x, y);
    this.def = def;
    this.level = level;
    const scale = 1 + (level - 1) * 0.12;
    this.maxHp = Math.round(def.hp * scale);
    this.hp = this.maxHp;
    this.homeX = x; this.homeY = y;
    this.tx = x; this.ty = y;
    this.radius = 11 * (def.scale ?? 1);
  }

  takeHit(dmg: number) {
    this.hp -= dmg;
    this.hurt = 0.12;
    if (this.hp <= 0) this.alive = false;
  }

  update(world: World, dt: number) {
    if (this.attackCd > 0) this.attackCd -= dt;
    world.monsterAI(this, dt);
    this.animate(this.state === "chase" || this.state === "wander", dt);
  }
}

// ----------------------------------------------------------------------------
// NPC (town): shopkeeper, quest givers, flavour folk
// ----------------------------------------------------------------------------
export type NpcRole = "shop" | "quest" | "flavor" | "trainer";
export class Npc extends Entity {
  kind = "npc" as const;
  name: string;
  role: NpcRole;
  style: CharStyle;
  shopId?: string;
  questIds: string[];
  lines: string[];
  faceT = 0;

  constructor(x: number, y: number, opts: {
    name: string; role: NpcRole; body: string; accent: string; hair?: string; skin?: string;
    weapon?: CharStyle["weapon"]; shopId?: string; questIds?: string[]; lines?: string[];
  }) {
    super(x, y);
    this.name = opts.name;
    this.role = opts.role;
    this.shopId = opts.shopId;
    this.questIds = opts.questIds ?? [];
    this.lines = opts.lines ?? ["Safe travels, friend."];
    this.style = {
      skin: opts.skin ?? "#e7b48a", hair: opts.hair ?? "#46341f",
      body: opts.body, accent: opts.accent,
      facing: "down", walk: 0, bob: 0, attack: 0, weapon: opts.weapon ?? "none",
    };
  }

  update(world: World, dt: number) {
    this.animate(false, dt);
    this.style.bob = this.bob;
    // turn toward the player when close
    const p = world.player;
    if (Math.hypot(p.x - this.x, p.y - this.y) < 90) {
      this.style.facing = facingFrom(p.x - this.x, p.y - this.y, this.style.facing);
      this.heading = Math.atan2(p.y - this.y, p.x - this.x);
    }
  }
}

// ---- shared little drawers -------------------------------------------------
export function nameTag(c: CanvasRenderingContext2D, x: number, y: number, text: string, color: string, sub?: string) {
  c.font = "bold 10px 'Segoe UI', sans-serif";
  c.textAlign = "center"; c.textBaseline = "middle";
  const w = c.measureText(text).width + 8;
  c.fillStyle = "rgba(20,16,30,0.55)";
  c.fillRect(x - w / 2, y - 7, w, 13);
  c.fillStyle = color;
  c.fillText(text, x, y);
  if (sub) {
    c.font = "9px 'Segoe UI', sans-serif"; c.fillStyle = COL.gold;
    c.fillText(sub, x, y + 11);
  }
}

export { rng };
