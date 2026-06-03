// ============================================================================
// World: the live game context. Owns the current zone, all entities, combat
// routing, loot, zone transitions, and ticks every subsystem each frame.
// ============================================================================
import { BAL, COL, T, TILE, TILES } from "./config";
import { Camera, clamp, dist, Input, RNG, rng } from "./engine";
import { drawCoin, drawTile, MonsterKind } from "./art";
import { Entity, Monster, MonsterDef, nameTag, Npc, Player } from "./entities";
import { ABILITIES, aimDir, basicAttack, burst, DamageNumber, Particle, Projectile } from "./combat";
import { SimDirector, SimPlayer } from "./simulation";
import { QuestLog, QUESTS } from "./quests";
import { addItem, equipBonus, ITEMS, rollLoot } from "./items";
import { CLASSES, levelFromXp } from "./progression";
import { buildZones, NpcDef, PortalDef, ZoneDef } from "./zones";

// UI surface the world can call into (implemented in ui.ts, wired in main.ts).
export interface GameUI {
  toast(text: string): void;
  openDialogue(npc: Npc): void;
  refresh(): void;
  isModalOpen(): boolean;
  onPlayerDamaged(): void;
  onLevelUp(level: number): void;
}

// ---- monster stat table ----------------------------------------------------
export const MONSTERS: Record<MonsterKind, MonsterDef> = {
  rat:      { kind: "rat", name: "Field Rat", hp: 18, atk: 5, def: 1, xp: 8, gold: [1, 4], speed: 80, lootTable: "rat" },
  slime:    { kind: "slime", name: "Green Slime", hp: 26, atk: 6, def: 2, xp: 11, gold: [2, 6], speed: 52, lootTable: "slime" },
  boar:     { kind: "boar", name: "Wild Boar", hp: 42, atk: 10, def: 3, xp: 18, gold: [3, 8], speed: 88, scale: 1.15, lootTable: "boar" },
  bat:      { kind: "bat", name: "Cave Bat", hp: 24, atk: 8, def: 1, xp: 14, gold: [2, 7], speed: 116, lootTable: "bat" },
  spider:   { kind: "spider", name: "Forest Spider", hp: 34, atk: 11, def: 3, xp: 20, gold: [4, 10], speed: 92, lootTable: "spider" },
  wolf:     { kind: "wolf", name: "Grey Wolf", hp: 48, atk: 13, def: 4, xp: 26, gold: [5, 12], speed: 106, scale: 1.1, lootTable: "wolf" },
  wraith:   { kind: "wraith", name: "Wraith", hp: 54, atk: 16, def: 5, xp: 38, gold: [6, 16], speed: 72, ranged: true, lootTable: "wraith" },
  skeleton: { kind: "skeleton", name: "Skeleton", hp: 60, atk: 15, def: 6, xp: 34, gold: [6, 15], speed: 74, lootTable: "skeleton" },
  imp:      { kind: "imp", name: "Imp", hp: 50, atk: 17, def: 4, xp: 40, gold: [8, 18], speed: 98, ranged: true, scale: 0.9, lootTable: "imp" },
  golem:    { kind: "golem", name: "Ancient Golem", hp: 560, atk: 30, def: 12, xp: 720, gold: [120, 260], speed: 44, scale: 1.7, lootTable: "golem" },
};

interface GroundItem { x: number; y: number; vx: number; vy: number; t: number; gold?: number; itemId?: string; qty?: number; }
interface Ring { x: number; y: number; r: number; max: number; color: string; life: number; }

interface ZoneRuntime extends ZoneDef { bg?: HTMLCanvasElement; }

export class World {
  input = new Input();
  camera: Camera;
  player: Player;
  ui!: GameUI;
  sim: SimDirector;
  quests = new QuestLog();
  rng = new RNG(777);

  zones: Record<string, ZoneRuntime>;
  zone!: ZoneRuntime;
  entities: Entity[] = [];
  projectiles: Projectile[] = [];
  particles: Particle[] = [];
  damageNumbers: DamageNumber[] = [];
  rings: Ring[] = [];
  ground: GroundItem[] = [];

  time = 0;
  private portalCd = 0;
  private respawnTimers: { kind: MonsterKind; lvlMin: number; lvlMax: number; t: number }[] = [];
  private bossTimer = 0;
  private saveT = BAL.autosaveInterval;
  onAutosave?: () => void;

  constructor(player: Player, vw: number, vh: number) {
    this.player = player;
    this.camera = new Camera(vw, vh);
    this.zones = buildZones();
    this.sim = new SimDirector(this, BAL.simCount);
    this.input.attach(document.querySelector("canvas")!);
  }

  get uiBlockingInput() { return this.ui?.isModalOpen() ?? false; }

  // ---- tiles / collision --------------------------------------------------
  tileAt(px: number, py: number): T {
    const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
    if (tx < 0 || ty < 0 || tx >= this.zone.w || ty >= this.zone.h) return T.StoneWall;
    return this.zone.tiles[ty * this.zone.w + tx] as T;
  }
  isSolid(px: number, py: number) { return TILES[this.tileAt(px, py)].solid; }

  private blocked(x: number, y: number, r: number) {
    return this.isSolid(x - r, y - r) || this.isSolid(x + r, y - r) || this.isSolid(x - r, y + r) || this.isSolid(x + r, y + r);
  }

  // move with axis-separated tile collision. returns true if it actually moved.
  moveEntity(e: Entity, dx: number, dy: number): boolean {
    const r = e.radius * 0.62;
    let moved = false;
    if (dx !== 0) { const nx = e.x + dx; if (!this.blocked(nx, e.y, r)) { e.x = nx; moved = true; } }
    if (dy !== 0) { const ny = e.y + dy; if (!this.blocked(e.x, ny, r)) { e.y = ny; moved = true; } }
    return moved;
  }

  randomWalkablePos(nearX?: number, nearY?: number, radius = 9999): { x: number; y: number } {
    for (let i = 0; i < 60; i++) {
      let tx: number, ty: number;
      if (nearX != null && nearY != null) {
        tx = clamp(Math.floor((nearX + this.rng.range(-radius, radius)) / TILE), 1, this.zone.w - 2);
        ty = clamp(Math.floor((nearY + this.rng.range(-radius, radius)) / TILE), 1, this.zone.h - 2);
      } else { tx = this.rng.int(1, this.zone.w - 2); ty = this.rng.int(1, this.zone.h - 2); }
      const px = tx * TILE + TILE / 2, py = ty * TILE + TILE / 2;
      if (!this.blocked(px, py, 10)) return { x: px, y: py };
    }
    return { x: this.zone.spawn[0] * TILE + 16, y: this.zone.spawn[1] * TILE + 16 };
  }

  // ---- zone transitions ---------------------------------------------------
  enterZone(id: string, sx?: number, sy?: number) {
    const z = this.zones[id];
    if (!z) return;
    this.zone = z;
    if (!z.bg) z.bg = this.renderZoneBg(z);
    // place player
    const stx = sx ?? z.spawn[0], sty = sy ?? z.spawn[1];
    this.player.x = stx * TILE + TILE / 2;
    this.player.y = sty * TILE + TILE / 2;
    // reset transient collections
    this.entities = [];
    this.projectiles = []; this.particles = []; this.damageNumbers = []; this.rings = []; this.ground = [];
    this.respawnTimers = [];
    this.portalCd = 0.6;
    // npcs
    for (const n of z.npcs) this.spawnNpc(n);
    // monsters
    this.populateMonsters();
    if (z.boss) this.spawnBoss();
    // sims
    this.sim.populate(id);
    this.camera.x = this.player.x - this.camera.vw / 2;
    this.camera.y = this.player.y - this.camera.vh / 2;
    this.ui?.toast(`Entering ${z.name}`);
    this.ui?.refresh();
  }

  private spawnNpc(n: NpcDef) {
    this.entities.push(new Npc(n.x * TILE + TILE / 2, n.y * TILE + TILE / 2, {
      name: n.name, role: n.role, body: n.body, accent: n.accent, hair: n.hair, skin: n.skin,
      weapon: n.weapon, shopId: n.shopId, questIds: n.questIds, lines: n.lines,
    }));
  }

  private populateMonsters() {
    const z = this.zone;
    if (!z.spawns.length) return;
    const totalW = z.spawns.reduce((a, s) => a + s.weight, 0);
    const current = this.monsters().length - (z.boss ? this.monsters().filter((m) => m.def.kind === "golem").length : 0);
    for (let i = current; i < z.target; i++) {
      let r = this.rng.range(0, totalW), pick = z.spawns[0];
      for (const s of z.spawns) { r -= s.weight; if (r <= 0) { pick = s; break; } }
      const lvl = this.rng.int(pick.min, pick.max);
      const p = this.randomWalkablePos();
      // keep a little distance from the player
      if (dist(p.x, p.y, this.player.x, this.player.y) < 140) { i--; continue; }
      this.entities.push(new Monster(p.x, p.y, MONSTERS[pick.kind], lvl));
    }
  }
  private spawnBoss() {
    const b = this.zone.boss!;
    this.entities.push(new Monster(b.x * TILE + TILE / 2, b.y * TILE + TILE / 2, MONSTERS[b.kind], b.lvl));
  }

  private renderZoneBg(z: ZoneDef): HTMLCanvasElement {
    const cv = document.createElement("canvas");
    cv.width = z.w * TILE; cv.height = z.h * TILE;
    const c = cv.getContext("2d")!;
    for (let y = 0; y < z.h; y++) for (let x = 0; x < z.w; x++)
      drawTile(c, z.tiles[y * z.w + x] as T, x * TILE, y * TILE, x, y);
    return cv;
  }

  // ---- entity helpers -----------------------------------------------------
  monsters(): Monster[] { return this.entities.filter((e): e is Monster => e instanceof Monster && e.alive); }
  sims(): SimPlayer[] { return this.entities.filter((e): e is SimPlayer => e instanceof SimPlayer && !e.dead); }
  npcs(): Npc[] { return this.entities.filter((e): e is Npc => e instanceof Npc); }

  // ---- combat routing -----------------------------------------------------
  spawnDamage(x: number, y: number, text: string | number, color: string, big = false) {
    this.damageNumbers.push(new DamageNumber(x, y, String(text), color, big));
  }
  ring(x: number, y: number, color: string) { this.rings.push({ x, y, r: 6, max: 110, color, life: 0.5 }); }

  damageMonster(m: Monster, dmg: number, crit: boolean, source?: Entity) {
    if (!m.alive) return;
    m.takeHit(dmg);
    this.spawnDamage(m.x + this.rng.range(-4, 4), m.y - 12, dmg, crit ? COL.gold : "#ffffff", crit);
    if (source === this.player) this.camera.addShake(crit ? 3 : 1.2);
    if (!m.alive) this.onMonsterDeath(m, source);
  }

  private onMonsterDeath(m: Monster, source?: Entity) {
    burst(this, m.x, m.y, "#caa24a", 10, 110);
    const lvlScale = 1 + (m.level - 1) * 0.22;
    const xp = Math.round(m.def.xp * lvlScale);
    if (source instanceof SimPlayer) {
      source.rec.kills++;
      if (source.rec.addXp(Math.round(xp * 0.7))) this.sim.chat.system(`${source.rec.name} reached level ${source.rec.level}!`);
      return;
    }
    if (source === this.player) {
      this.player.kills[m.def.kind] = (this.player.kills[m.def.kind] ?? 0) + 1;
      this.quests.onKill(m.def.kind, this.zone.id);
      this.grantXp(xp);
      // loot
      const gold = this.rng.int(m.def.gold[0], m.def.gold[1]) * Math.round(lvlScale);
      this.ground.push({ x: m.x, y: m.y, vx: this.rng.range(-30, 30), vy: this.rng.range(-50, -20), t: 0, gold });
      const loot = rollLoot(m.def.lootTable ?? m.def.kind, this.rng);
      for (const it of loot.items) {
        this.ground.push({ x: m.x, y: m.y, vx: this.rng.range(-40, 40), vy: this.rng.range(-60, -20), t: 0, itemId: it.id, qty: it.qty });
        if (ITEMS[it.id] && (ITEMS[it.id].rarity === "rare" || ITEMS[it.id].rarity === "epic")) this.sim.reactPlayerLoot(it.id);
      }
      if (m.def.kind === "golem") { this.ui?.toast("The Ancient Golem crumbles to dust!"); this.sim.chat.system(`${this.player.name} defeated the Ancient Golem!`); }
    }
  }

  damagePlayer(dmg: number) {
    const p = this.player;
    if (p.isDead || p.invuln > 0) return;
    p.stats.hp = Math.max(0, p.stats.hp - dmg);
    p.hurt = 0.14;
    this.spawnDamage(p.x, p.y - 16, dmg, COL.red);
    this.camera.addShake(2.5);
    this.ui?.onPlayerDamaged();
    if (p.stats.hp <= 0) {
      p.deaths++;
      p.respawnTimer = BAL.respawnTime;
      this.ui?.toast("You have fallen! Respawning in town…");
      this.sim.reactPlayerDeath();
    }
  }

  damageSim(s: SimPlayer, dmg: number) {
    if (s.dead) return;
    s.hp -= dmg; s.hurt = 0.12;
    this.spawnDamage(s.x, s.y - 14, dmg, "#ffd0d0");
    if (s.hp <= 0) { s.dead = true; s.deadT = 4; s.rec.deaths++; }
  }

  grantXp(amount: number) {
    const p = this.player;
    p.xp += amount;
    this.spawnDamage(p.x, p.y - 28, `+${amount} XP`, "#bfe0ff");
    const newLevel = levelFromXp(p.xp).level;
    if (newLevel > p.level) {
      p.level = newLevel;
      this.recomputePlayerStats();
      p.stats.hp = p.stats.maxHp; p.stats.mp = p.stats.maxMp;
      this.ring(p.x, p.y, COL.gold); burst(this, p.x, p.y, COL.gold, 22, 150);
      this.spawnDamage(p.x, p.y - 44, `LEVEL ${newLevel}!`, COL.gold, true);
      this.ui?.toast(`You reached level ${newLevel}!`);
      this.ui?.onLevelUp(newLevel);
      this.sim.reactPlayerLevel(newLevel);
    }
    this.ui?.refresh();
  }
  recomputePlayerStats() { this.player.refreshStats(equipBonus(this.player.equipment)); }

  respawnPlayer() {
    const p = this.player;
    p.respawnTimer = 0;
    this.recomputePlayerStats();
    p.stats.hp = p.stats.maxHp; p.stats.mp = p.stats.maxMp;
    p.invuln = 1.5;
    this.enterZone("town");
    this.ui?.refresh();
  }

  // ---- player actions -----------------------------------------------------
  tryPlayerActions(p: Player, _dt: number) {
    const inp = this.input;
    // basic attack (hold)
    if ((inp.isDown(" ") || inp.mouse.down || inp.isDown("1")) && p.attackCd <= 0) {
      basicAttack(this, p);
      p.attackCd = BAL.attackCooldown;
    }
    // abilities
    const a0 = CLASSES[p.cls].abilities[0], a1 = CLASSES[p.cls].abilities[1];
    if (inp.justPressed("q") || inp.justPressed("2")) this.useAbility(p, a0);
    if (inp.justPressed("e") || inp.justPressed("3")) this.useAbility(p, a1);
    if (inp.justPressed("r") || inp.justPressed("4")) this.quickPotion();
    if (inp.justPressed("f") || inp.justPressed("enter")) this.interact();
  }

  private useAbility(p: Player, id: string) {
    const ab = ABILITIES[id];
    if (!ab) return;
    if ((p.abilityCd[id] ?? 0) > 0) return;
    if (p.stats.mp < ab.mp) { this.ui?.toast("Not enough mana"); return; }
    const { dx, dy } = aimDir(this, p.x, p.y);
    ab.exec(this, p, dx, dy);
    p.stats.mp -= ab.mp;
    p.abilityCd[id] = ab.cd;
  }

  quickPotion() {
    const p = this.player;
    const stack = p.inventory.find((s) => ITEMS[s.id]?.heal);
    if (!stack) { this.ui?.toast("No potions!"); return; }
    const it = ITEMS[stack.id];
    if (p.stats.hp >= p.stats.maxHp) { this.ui?.toast("Already at full health"); return; }
    p.stats.hp = Math.min(p.stats.maxHp, p.stats.hp + (it.heal ?? 0));
    if (it.mana) p.stats.mp = Math.min(p.stats.maxMp, p.stats.mp + it.mana);
    stack.qty--; if (stack.qty <= 0) p.inventory.splice(p.inventory.indexOf(stack), 1);
    this.spawnDamage(p.x, p.y - 18, `+${it.heal}`, COL.green);
    this.ui?.refresh();
  }

  interact() {
    let best: Npc | null = null, bd = 56;
    for (const n of this.npcs()) { const d = dist(n.x, n.y, this.player.x, this.player.y); if (d < bd) { bd = d; best = n; } }
    if (best) { this.quests.onTalk(npcIdFor(best)); this.ui?.openDialogue(best); }
  }

  questMarker(npc: Npc): "available" | "turnin" | "none" {
    return this.quests.marker(npcIdFor(npc), this);
  }

  notify(text: string) { this.ui?.toast(text); }

  // ---- monster AI ---------------------------------------------------------
  monsterAI(m: Monster, dt: number) {
    if (this.zone.safe) { m.alive = false; return; }
    // find nearest hostile (player or sim)
    let target: Entity | null = null, td = BAL.aggroRange;
    const p = this.player;
    if (!p.isDead) { const d = dist(m.x, m.y, p.x, p.y); if (d < td) { td = d; target = p; } }
    for (const s of this.sims()) { const d = dist(m.x, m.y, s.x, s.y); if (d < td) { td = d; target = s; } }

    if (target) {
      m.targetId = target.id;
      const d = dist(m.x, m.y, target.x, target.y);
      const meleeRange = 30 + m.radius;
      if (m.def.ranged ? d > 150 : d > meleeRange) {
        m.state = "chase";
        const a = Math.atan2(target.y - m.y, target.x - m.x);
        this.moveEntity(m, Math.cos(a) * m.def.speed * dt, Math.sin(a) * m.def.speed * dt);
        m.facing = Math.abs(Math.cos(a)) > Math.abs(Math.sin(a)) ? (Math.cos(a) < 0 ? "left" : "right") : (Math.sin(a) < 0 ? "up" : "down");
      } else {
        m.state = "attack";
        if (m.attackCd <= 0) { this.monsterAttack(m, target); m.attackCd = 1.1; }
      }
      // leash
      if (dist(m.x, m.y, m.homeX, m.homeY) > BAL.leashRange) { m.tx = m.homeX; m.ty = m.homeY; m.state = "wander"; }
    } else {
      m.state = "wander";
      m.wanderT -= dt;
      if (m.wanderT <= 0) {
        m.wanderT = this.rng.range(1.5, 4);
        const pp = this.randomWalkablePos(m.homeX, m.homeY, 120);
        m.tx = pp.x; m.ty = pp.y;
      }
      if (dist(m.x, m.y, m.tx, m.ty) > 6) {
        const a = Math.atan2(m.ty - m.y, m.tx - m.x);
        this.moveEntity(m, Math.cos(a) * m.def.speed * 0.5 * dt, Math.sin(a) * m.def.speed * 0.5 * dt);
        m.facing = Math.abs(Math.cos(a)) > Math.abs(Math.sin(a)) ? (Math.cos(a) < 0 ? "left" : "right") : (Math.sin(a) < 0 ? "up" : "down");
      }
    }
  }

  private monsterAttack(m: Monster, target: Entity) {
    const lvlScale = 1 + (m.level - 1) * 0.18;
    const dmg = Math.max(1, Math.round(m.def.atk * lvlScale * this.rng.range(0.85, 1.15)));
    const dx = target.x - m.x, dy = target.y - m.y, len = Math.hypot(dx, dy) || 1;
    if (m.def.ranged) {
      this.projectiles.push(new Projectile(m.x + (dx / len) * 12, m.y + (dy / len) * 12, (dx / len) * 220, (dy / len) * 220, dmg, false, "enemy", "frost", "#b27ad8", 0, m));
    } else {
      if (target === this.player) this.damagePlayer(dmg);
      else if (target instanceof SimPlayer) this.damageSim(target, dmg);
      burst(this, target.x, target.y, "#d2544a", 5, 70);
    }
  }

  // ---- main tick ----------------------------------------------------------
  update(dt: number) {
    this.time += dt;
    if (this.portalCd > 0) this.portalCd -= dt;

    this.player.update(this, dt);
    for (const e of this.entities) e.update(this, dt);

    for (const pr of this.projectiles) pr.update(this, dt);
    this.projectiles = this.projectiles.filter((p) => !p.dead);
    for (const pa of this.particles) pa.update(dt);
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const d of this.damageNumbers) d.update(dt);
    this.damageNumbers = this.damageNumbers.filter((d) => d.life > 0);
    for (const r of this.rings) { r.r += (r.max - r.r) * dt * 6; r.life -= dt; }
    this.rings = this.rings.filter((r) => r.life > 0);

    // ground loot drift + auto pickup
    for (const g of this.ground) {
      g.t += dt;
      g.x += g.vx * dt; g.y += g.vy * dt; g.vy += 120 * dt;
      if (g.vy > 0 && g.t > 0.35) { g.vx *= 0.86; g.vy = 0; }
      if (dist(g.x, g.y, this.player.x, this.player.y) < 24 && !this.player.isDead) this.pickup(g);
    }
    this.ground = this.ground.filter((g) => !(g as any)._dead);

    // remove dead monsters; refill population on a timer
    const before = this.entities.length;
    this.entities = this.entities.filter((e) => !(e instanceof Monster && !e.alive));
    if (this.entities.length < before && !this.zone.safe) this.scheduleRefill();
    this.tickRefill(dt);

    this.sim.update(dt);

    this.camera.follow(this.player.x, this.player.y, this.zone.w * TILE, this.zone.h * TILE, dt);
    this.checkPortals();

    // autosave
    this.saveT -= dt;
    if (this.saveT <= 0) { this.saveT = BAL.autosaveInterval; this.onAutosave?.(); }

    this.input.endFrame();
  }

  private scheduleRefill() {
    const z = this.zone;
    if (!z.spawns.length) return;
    const totalW = z.spawns.reduce((a, s) => a + s.weight, 0);
    let r = this.rng.range(0, totalW), pick = z.spawns[0];
    for (const s of z.spawns) { r -= s.weight; if (r <= 0) { pick = s; break; } }
    this.respawnTimers.push({ kind: pick.kind, lvlMin: pick.min, lvlMax: pick.max, t: BAL.monsterRespawnTime });
  }
  private tickRefill(dt: number) {
    for (const rt of this.respawnTimers) rt.t -= dt;
    const ready = this.respawnTimers.filter((rt) => rt.t <= 0);
    for (const rt of ready) {
      const p = this.randomWalkablePos();
      if (dist(p.x, p.y, this.player.x, this.player.y) > 220)
        this.entities.push(new Monster(p.x, p.y, MONSTERS[rt.kind], this.rng.int(rt.lvlMin, rt.lvlMax)));
    }
    this.respawnTimers = this.respawnTimers.filter((rt) => rt.t > 0);
    // boss respawn
    if (this.zone.boss) {
      const hasBoss = this.monsters().some((m) => m.def.kind === this.zone.boss!.kind);
      if (!hasBoss) { this.bossTimer -= dt; if (this.bossTimer <= 0) { this.spawnBoss(); this.bossTimer = 30; } }
      else this.bossTimer = 30;
    }
  }

  private pickup(g: GroundItem) {
    if (g.gold) { this.player.gold += g.gold; this.spawnDamage(this.player.x, this.player.y - 22, `+${g.gold}g`, COL.gold); }
    if (g.itemId) {
      addItem(this.player.inventory, g.itemId, g.qty ?? 1);
      const it = ITEMS[g.itemId];
      this.ui?.toast(`Looted ${g.qty && g.qty > 1 ? g.qty + "× " : ""}${it.name}`);
    }
    (g as any)._dead = true;
    this.ui?.refresh();
  }

  private checkPortals() {
    if (this.portalCd > 0) return;
    const ptx = Math.floor(this.player.x / TILE), pty = Math.floor(this.player.y / TILE);
    for (const p of this.zone.portals) {
      if (ptx >= p.x && ptx < p.x + p.w && pty >= p.y && pty < p.y + p.h) { this.enterZone(p.to, p.sx, p.sy); return; }
    }
  }

  // ---- render -------------------------------------------------------------
  render(c: CanvasRenderingContext2D) {
    const cam = this.camera;
    c.imageSmoothingEnabled = false;
    // sky/letterbox fill
    c.fillStyle = this.zone.ambient === "dark" ? "#1d2730" : this.zone.ambient === "ruins" ? "#2a2622" : "#23303a";
    c.fillRect(0, 0, cam.vw, cam.vh);

    c.save();
    c.translate(-cam.ox, -cam.oy);

    // ground (blit visible region of the prerendered zone)
    if (this.zone.bg) {
      const sx = Math.max(0, cam.ox), sy = Math.max(0, cam.oy);
      const sw = Math.min(this.zone.bg.width - sx, cam.vw + 2), sh = Math.min(this.zone.bg.height - sy, cam.vh + 2);
      if (sw > 0 && sh > 0) c.drawImage(this.zone.bg, sx, sy, sw, sh, sx, sy, sw, sh);
    }

    // ground items
    for (const g of this.ground) {
      if (g.gold) drawCoin(c, g.x, g.y, g.t * 6 + this.time);
      else if (g.itemId) {
        const r = ITEMS[g.itemId];
        c.fillStyle = "rgba(20,16,30,0.3)"; c.beginPath(); c.ellipse(g.x, g.y + 5, 6, 2, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = r ? rarityGlow(r.rarity) : "#fff";
        const b = Math.sin(this.time * 4 + g.x) * 2;
        c.fillRect(g.x - 5, g.y - 5 - b, 10, 10);
        c.strokeStyle = "rgba(255,255,255,0.5)"; c.strokeRect(g.x - 5, g.y - 5 - b, 10, 10);
      }
    }

    // rings (under entities)
    for (const r of this.rings) {
      c.globalAlpha = Math.max(0, r.life * 1.6); c.strokeStyle = r.color; c.lineWidth = 3;
      c.beginPath(); c.arc(r.x, r.y, r.r, 0, Math.PI * 2); c.stroke(); c.globalAlpha = 1;
    }

    // entities sorted by feet
    const drawList: Entity[] = [...this.entities, this.player];
    drawList.sort((a, b) => a.sortY - b.sortY);
    for (const e of drawList) e.render(c, this);

    // projectiles + particles + numbers (above)
    for (const pr of this.projectiles) pr.render(c);
    for (const pa of this.particles) pa.render(c);
    for (const d of this.damageNumbers) d.render(c);

    // portal labels
    c.font = "bold 11px 'Segoe UI', sans-serif";
    for (const p of this.zone.portals) {
      const lx = (p.x + p.w / 2) * TILE, ly = (p.y + p.h / 2) * TILE;
      nameTag(c, clamp(lx, cam.ox + 40, cam.ox + cam.vw - 40), ly, p.label, COL.parchment);
    }

    c.restore();
  }
}

// Map an NPC back to its quest-giver id (by name → stable id).
const NPC_IDS: Record<string, string> = {
  "Elder Maeve": "elder", "Tilda": "tilda", "Sage Orin": "arcanist", "Brom the Smith": "smith",
  "Ranger Kael": "hunter", "Captain Roe": "captain", "Old Pim": "pim",
};
export function npcIdFor(n: Npc): string { return NPC_IDS[n.name] ?? n.name.toLowerCase(); }

function rarityGlow(r: string) {
  return r === "epic" ? "#b76bd6" : r === "rare" ? "#4a8fd2" : r === "uncommon" ? "#6bbf59" : "#cfc6b4";
}
