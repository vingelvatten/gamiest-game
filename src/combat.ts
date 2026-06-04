// ============================================================================
// Combat: damage math, projectiles, floating numbers, hit particles, and the
// per-class ability set. All "who takes damage" routing goes through World so
// combat stays decoupled from the entity/sim modules.
// ============================================================================
import { COL } from "./config";
import { rng, TAU, dist } from "./engine";
import { Entity, Monster, Player } from "./entities";
import { CLASSES } from "./progression";
import type { World } from "./world";

// ---- floaters & particles --------------------------------------------------
export class DamageNumber {
  life = 0.85; age = 0; // age drives the upward float; x,y are the world anchor
  constructor(public x: number, public y: number, public text: string, public color: string, public big = false) {}
  update(dt: number) { this.age += dt; this.life -= dt; }
}

export class Particle {
  life: number; maxLife: number;
  constructor(public x: number, public y: number, public vx: number, public vy: number,
    public color: string, public size: number, life: number, public grav = 0) {
    this.life = life; this.maxLife = life;
  }
  update(dt: number) { this.x += this.vx * dt; this.y += this.vy * dt; this.vy += this.grav * dt; this.life -= dt; }
  render(c: CanvasRenderingContext2D) {
    c.globalAlpha = Math.max(0, this.life / this.maxLife);
    c.fillStyle = this.color;
    c.fillRect(this.x - this.size / 2, this.y - this.size / 2, this.size, this.size);
    c.globalAlpha = 1;
  }
}

export function burst(world: World, x: number, y: number, color: string, n = 8, spd = 90) {
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, TAU), s = rng.range(spd * 0.3, spd);
    world.particles.push(new Particle(x, y, Math.cos(a) * s, Math.sin(a) * s - 20, color, rng.range(2, 4), rng.range(0.3, 0.6), 140));
  }
}

// ---- projectiles -----------------------------------------------------------
export type Faction = "ally" | "enemy";
export class Projectile {
  life = 1.4;
  radius = 6;
  dead = false;
  pierce = 0;
  hitIds = new Set<number>();
  constructor(
    public x: number, public y: number,
    public vx: number, public vy: number,
    public dmg: number, public crit: boolean,
    public faction: Faction,
    public kind: "arrow" | "fireball" | "frost" | "bolt",
    public color: string,
    public radiusAoe = 0,
    public owner?: Entity,
  ) {}

  update(world: World, dt: number) {
    this.x += this.vx * dt; this.y += this.vy * dt; this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    if (world.isSolid(this.x, this.y)) { this.onHit(world, null); return; }
    if (this.faction === "ally") {
      for (const m of world.monsters()) {
        if (!m.alive || this.hitIds.has(m.id)) continue;
        if (dist(this.x, this.y, m.x, m.y) < this.radius + m.radius) { this.onHit(world, m); if (this.dead) return; }
      }
    } else {
      const p = world.player;
      if (!p.isDead && dist(this.x, this.y, p.x, p.y) < this.radius + p.radius) { this.onHit(world, p); return; }
      for (const s of world.sims()) {
        if (!s.alive || this.hitIds.has(s.id)) continue;
        if (dist(this.x, this.y, s.x, s.y) < this.radius + s.radius) { this.onHit(world, s); if (this.dead) return; }
      }
    }
  }

  private onHit(world: World, target: any) {
    if (this.kind === "fireball" || this.radiusAoe > 0) {
      burst(world, this.x, this.y, this.color, 14, 130);
      world.camera.addShake(3);
      // AoE
      if (this.faction === "ally") {
        for (const m of world.monsters()) if (m.alive && dist(this.x, this.y, m.x, m.y) < this.radiusAoe + m.radius)
          world.damageMonster(m, this.dmg, this.crit, this.owner);
      } else {
        const p = world.player;
        if (!p.isDead && dist(this.x, this.y, p.x, p.y) < this.radiusAoe + p.radius) world.damagePlayer(this.dmg);
        for (const s of world.sims()) if (s.alive && dist(this.x, this.y, s.x, s.y) < this.radiusAoe + s.radius) world.damageSim(s, this.dmg);
      }
      this.dead = true;
      return;
    }
    if (target) {
      if (target instanceof Monster) world.damageMonster(target, this.dmg, this.crit, this.owner);
      else if (target instanceof Player) world.damagePlayer(this.dmg);
      else world.damageSim(target, this.dmg);
      burst(world, this.x, this.y, this.color, 6, 80);
      this.hitIds.add(target.id);
      if (this.pierce > 0) { this.pierce--; } else { this.dead = true; }
    } else { this.dead = true; burst(world, this.x, this.y, this.color, 4, 60); }
  }

  render(c: CanvasRenderingContext2D) {
    const ang = Math.atan2(this.vy, this.vx);
    c.save(); c.translate(this.x, this.y); c.rotate(ang);
    if (this.kind === "arrow") {
      c.strokeStyle = "#e8e2cf"; c.lineWidth = 2; c.beginPath(); c.moveTo(-8, 0); c.lineTo(6, 0); c.stroke();
      c.fillStyle = "#cfd6e0"; c.beginPath(); c.moveTo(6, 0); c.lineTo(2, -3); c.lineTo(2, 3); c.fill();
    } else {
      const glow = this.kind === "fireball" ? "#ff8a3c" : this.color;
      c.fillStyle = "rgba(255,255,255,0.25)"; c.beginPath(); c.arc(0, 0, this.radius + 3, 0, TAU); c.fill();
      c.fillStyle = glow; c.beginPath(); c.arc(0, 0, this.radius, 0, TAU); c.fill();
      c.fillStyle = "#fff"; c.beginPath(); c.arc(-1, -1, this.radius * 0.4, 0, TAU); c.fill();
    }
    c.restore();
  }
}

// ---- damage math -----------------------------------------------------------
export function computeDamage(atk: number, def: number, crit: number) {
  const variance = rng.range(0.85, 1.15);
  let dmg = Math.max(1, (atk - def * 0.55) * variance);
  const isCrit = rng.chance(crit);
  if (isCrit) dmg *= 1.7;
  return { dmg: Math.max(1, Math.round(dmg)), crit: isCrit };
}

// aim direction: along the player's heading (camera-forward), with a soft
// auto-aim that snaps toward the nearest enemy inside a frontal cone.
export function aimDir(world: World, px: number, py: number): { dx: number; dy: number } {
  const h = world.player.heading;
  let dx = Math.cos(h), dy = Math.sin(h);
  let best: Monster | null = null, bestDot = 0.5;
  for (const m of world.monsters()) {
    const mx = m.x - px, my = m.y - py, d = Math.hypot(mx, my);
    if (d < 1 || d > 380) continue;
    const dot = (mx / d) * dx + (my / d) * dy;
    if (dot > bestDot) { bestDot = dot; best = m; }
  }
  if (best) { const mx = best.x - px, my = best.y - py, d = Math.hypot(mx, my) || 1; dx = mx / d; dy = my / d; }
  return { dx, dy };
}

// ---- player attacks --------------------------------------------------------
export function meleeSwing(world: World, px: number, py: number, dirx: number, diry: number, atk: number, crit: number, range: number, arc: number, color: string, source?: Entity) {
  let any = false;
  for (const m of world.monsters()) {
    if (!m.alive) continue;
    const d = dist(px, py, m.x, m.y);
    if (d > range + m.radius) continue;
    const a = Math.atan2(m.y - py, m.x - px);
    const facing = Math.atan2(diry, dirx);
    let diff = Math.abs(((a - facing + Math.PI) % TAU) - Math.PI);
    if (diff <= arc / 2) {
      const { dmg, crit: c } = computeDamage(atk, m.def.def, crit);
      world.damageMonster(m, dmg, c, source);
      any = true;
    }
  }
  // swing arc fx
  for (let i = 0; i < 5; i++) {
    const t = i / 4, a = Math.atan2(diry, dirx) - arc / 2 + arc * t;
    world.particles.push(new Particle(px + Math.cos(a) * range * 0.7, py + Math.sin(a) * range * 0.7, 0, 0, color, 3, 0.18));
  }
  return any;
}

export function basicAttack(world: World, p: Player) {
  const { dx, dy } = aimDir(world, p.x, p.y);
  p.facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "left" : "right") : (dy < 0 ? "up" : "down");
  const cls = CLASSES[p.cls].weapon;
  if (cls === "sword") {
    meleeSwing(world, p.x, p.y, dx, dy, p.stats.atk, p.stats.crit, 50, Math.PI * 0.9, "#fff4d0", p);
  } else if (cls === "staff") {
    const { dmg, crit } = computeDamage(p.stats.atk * 0.9, 0, p.stats.crit);
    const pr = new Projectile(p.x + dx * 14, p.y + dy * 14, dx * 300, dy * 300, dmg, crit, "ally", "bolt", COL.mana, 0, p);
    world.projectiles.push(pr);
  } else {
    const { dmg, crit } = computeDamage(p.stats.atk, 0, p.stats.crit);
    const pr = new Projectile(p.x + dx * 14, p.y + dy * 14, dx * 420, dy * 420, dmg, crit, "ally", "arrow", "#e8e2cf", 0, p);
    world.projectiles.push(pr);
  }
  world.camera.addShake(1);
}

// ---- abilities -------------------------------------------------------------
export interface Ability {
  id: string; name: string; mp: number; cd: number; key: string; desc: string;
  color: string;
  exec(world: World, p: Player, dx: number, dy: number): void;
}

export const ABILITIES: Record<string, Ability> = {
  cleave: {
    id: "cleave", name: "Cleave", mp: 8, cd: 3.5, key: "Q", color: COL.red,
    desc: "A wide sweep hitting everything in front for 180% ATK.",
    exec(world, p, dx, dy) {
      meleeSwing(world, p.x, p.y, dx, dy, p.stats.atk * 1.8, p.stats.crit + 0.05, 64, Math.PI * 1.2, "#ffd0a0", p);
      world.camera.addShake(4); burst(world, p.x + dx * 30, p.y + dy * 30, "#ffd0a0", 12, 120);
    },
  },
  warcry: {
    id: "warcry", name: "War Cry", mp: 14, cd: 9, key: "E", color: COL.gold,
    desc: "Damages nearby foes and heals you for 18% max HP.",
    exec(world, p) {
      for (const m of world.monsters()) if (m.alive && dist(p.x, p.y, m.x, m.y) < 96) {
        const { dmg, crit } = computeDamage(p.stats.atk * 1.2, m.def.def, p.stats.crit);
        world.damageMonster(m, dmg, crit, p);
      }
      const heal = Math.round(p.stats.maxHp * 0.18);
      p.stats.hp = Math.min(p.stats.maxHp, p.stats.hp + heal);
      world.spawnDamage(p.x, p.y - 18, `+${heal}`, COL.green);
      world.ring(p.x, p.y, COL.gold); world.camera.addShake(5);
    },
  },
  fireball: {
    id: "fireball", name: "Fireball", mp: 16, cd: 2.6, key: "Q", color: "#ff8a3c",
    desc: "Hurls a fiery orb that explodes for 210% ATK.",
    exec(world, p, dx, dy) {
      const { dmg, crit } = computeDamage(p.stats.atk * 2.1, 0, p.stats.crit);
      const pr = new Projectile(p.x + dx * 14, p.y + dy * 14, dx * 280, dy * 280, dmg, crit, "ally", "fireball", "#ff8a3c", 44, p);
      pr.life = 1.6; world.projectiles.push(pr);
    },
  },
  frostnova: {
    id: "frostnova", name: "Frost Nova", mp: 22, cd: 7, key: "E", color: "#86d4ff",
    desc: "Bursts frost around you for 150% ATK to all nearby foes.",
    exec(world, p) {
      for (const m of world.monsters()) if (m.alive && dist(p.x, p.y, m.x, m.y) < 110) {
        const { dmg, crit } = computeDamage(p.stats.atk * 1.5, m.def.def, p.stats.crit);
        world.damageMonster(m, dmg, crit, p);
        m.attackCd = Math.max(m.attackCd, 1.2); // brief freeze
      }
      world.ring(p.x, p.y, "#86d4ff"); burst(world, p.x, p.y, "#cfeaff", 18, 150); world.camera.addShake(3);
    },
  },
  multishot: {
    id: "multishot", name: "Multishot", mp: 12, cd: 4, key: "Q", color: COL.green,
    desc: "Looses three arrows in a spread, each for 90% ATK.",
    exec(world, p, dx, dy) {
      const base = Math.atan2(dy, dx);
      for (const off of [-0.26, 0, 0.26]) {
        const a = base + off;
        const { dmg, crit } = computeDamage(p.stats.atk * 0.9, 0, p.stats.crit);
        world.projectiles.push(new Projectile(p.x + Math.cos(a) * 14, p.y + Math.sin(a) * 14, Math.cos(a) * 420, Math.sin(a) * 420, dmg, crit, "ally", "arrow", "#cdeecb", 0, p));
      }
    },
  },
  dash: {
    id: "dash", name: "Dash", mp: 10, cd: 5, key: "E", color: "#caa24a",
    desc: "Dart forward, slashing foes along the way. Brief invulnerability.",
    exec(world, p, dx, dy) {
      const steps = 7;
      for (let i = 1; i <= steps; i++) {
        const nx = p.x + dx * 16, ny = p.y + dy * 16;
        if (world.isSolid(nx, ny)) break;
        p.x = nx; p.y = ny;
        world.particles.push(new Particle(p.x, p.y, 0, 0, "#caa24a", 3, 0.25));
      }
      for (const m of world.monsters()) if (m.alive && dist(p.x, p.y, m.x, m.y) < 40) {
        const { dmg, crit } = computeDamage(p.stats.atk * 1.3, m.def.def, p.stats.crit);
        world.damageMonster(m, dmg, crit, p);
      }
      p.invuln = Math.max(p.invuln, 0.5);
      world.camera.addShake(2);
    },
  },
};
