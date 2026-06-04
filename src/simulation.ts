// ============================================================================
// The "MMO" illusion: dozens of simulated players that roam, hunt, level up,
// chat, join guilds and share a leaderboard with you — none of it networked.
// ============================================================================
import { COL } from "./config";
import { clamp, dist, RNG, TAU } from "./engine";
import { MonsterKind } from "./art";
import { CLASSES, ClassId, levelFromXp, statsForClass } from "./progression";
import { Entity, Facing, facingFrom, Monster } from "./entities";
import { meleeSwing, Projectile } from "./combat";
import { ITEMS } from "./items";
import type { World } from "./world";

export type Personality = "tryhard" | "friendly" | "trader" | "noob" | "edgy" | "lore" | "memer" | "helper";
const PERSONALITIES: Personality[] = ["tryhard", "friendly", "trader", "noob", "edgy", "lore", "memer", "helper"];

export interface Guild { name: string; tag: string; color: string; }
export const GUILDS: Guild[] = [
  { name: "Dawnblades", tag: "DAWN", color: "#f3c969" },
  { name: "Night Owls", tag: "OWL", color: "#9b6bd6" },
  { name: "Iron Wolves", tag: "WOLF", color: "#9aa3b0" },
  { name: "Arcane Order", tag: "ARC", color: "#4a8fd2" },
  { name: "Green Wardens", tag: "WARD", color: "#6bbf59" },
  { name: "Crimson Hand", tag: "CRIM", color: "#d2544a" },
];

// ---- name generation -------------------------------------------------------
const FANT_A = ["Ael", "Bran", "Cor", "Dra", "Elen", "Fae", "Gor", "Hal", "Ily", "Kael", "Lyr", "Mor", "Nyx", "Ori", "Pyr", "Quen", "Ria", "Syl", "Thal", "Vael", "Wyn", "Zar", "Cael", "Mira"];
const FANT_B = ["ar", "en", "ith", "on", "wyn", "dor", "iel", "us", "ara", "eth", "ix", "oth", "ani", "is", "or", "ya"];
const G_ADJ = ["Shadow", "Dragon", "Frost", "Dark", "Epic", "Doom", "Blaze", "Storm", "Night", "Iron", "Silent", "Swift", "Mystic", "Savage", "Void", "Crimson", "Lone", "Grim", "Phantom", "Thunder"];
const G_NOUN = ["Slayer", "Hunter", "Blade", "Mage", "Wolf", "Reaper", "Knight", "Arrow", "Fury", "Bane", "Lord", "Ninja", "Sniper", "Walker", "Fist", "Soul", "Heart", "Fang", "Strike", "Bow"];

function genName(rng: RNG, pers: Personality): string {
  const fantasy = () => rng.pick(FANT_A) + rng.pick(FANT_B) + (rng.chance(0.25) ? " " + rng.pick(FANT_A) + rng.pick(FANT_B) : "");
  const gamer = () => {
    let n = rng.pick(G_ADJ) + rng.pick(G_NOUN);
    if (rng.chance(0.5)) n += rng.int(7, 99);
    return n;
  };
  switch (pers) {
    case "edgy": {
      const core = rng.pick(G_ADJ) + (rng.chance(0.5) ? rng.pick(G_NOUN) : "");
      return rng.chance(0.6) ? `xX${core}Xx` : core + rng.int(0, 99);
    }
    case "noob": return rng.pick(G_NOUN).toLowerCase() + rng.int(100, 999);
    case "memer": return rng.pick(G_ADJ) + rng.pick(["Lord", "Andy", "Chad", "Gamer", "Pog"]) + (rng.chance(0.4) ? rng.int(0, 9) + "9" : "");
    case "lore": case "friendly": return fantasy();
    case "trader": return rng.chance(0.5) ? fantasy() : gamer();
    default: return rng.chance(0.45) ? fantasy() : gamer();
  }
}

// shift a hex colour a little for per-sim variety
function jitter(hex: string, rng: RNG, amt = 26): string {
  const n = parseInt(hex.slice(1), 16);
  const cl = (v: number) => clamp(Math.round(v), 0, 255);
  const r = cl(((n >> 16) & 255) + rng.range(-amt, amt));
  const g = cl(((n >> 8) & 255) + rng.range(-amt, amt));
  const b = cl((n & 255) + rng.range(-amt, amt));
  return "#" + ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0");
}

const SKINS = ["#e7b48a", "#d49a6a", "#c8855a", "#f0c8a0", "#a86b46", "#e8b890", "#b97a52"];
const HAIRS = ["#2a2018", "#3a2c22", "#5a3a22", "#8a6a3a", "#caa24a", "#d8d2c2", "#6a4f9a", "#b85a4a", "#2a2a3a", "#c44a6a"];

// zone metadata (kept local to avoid importing the world module's data)
const ZONE_NAMES: Record<string, string> = { town: "Aethermoor", greenfields: "the Greenfields", darkwood: "the Darkwood", ruins: "the Sunken Ruins" };
const ZONE_DIFF: Record<string, number> = { town: 0, greenfields: 1, darkwood: 2, ruins: 3 };
const ZONE_MOBS: Record<string, MonsterKind[]> = {
  town: [], greenfields: ["rat", "slime", "boar"], darkwood: ["bat", "spider", "wolf", "wraith"], ruins: ["skeleton", "imp", "golem"],
};
const ZONES_ORDER = ["town", "greenfields", "darkwood", "ruins"];

// ---- a simulated player's persistent record --------------------------------
export class SimRecord {
  level = 1;
  totalXp = 0;
  kills = 0;
  deaths = 0;
  gold = 0;
  zoneId = "greenfields";
  entity: SimPlayer | null = null; // set when on-screen
  style: { skin: string; hair: string; body: string; accent: string };

  constructor(
    public id: number,
    public name: string,
    public cls: ClassId,
    public pers: Personality,
    public guild: number, // index into GUILDS or -1
    rng: RNG,
  ) {
    this.style = {
      skin: rng.pick(SKINS), hair: rng.pick(HAIRS),
      body: jitter(CLASSES[cls].body, rng, 22),
      accent: jitter(CLASSES[cls].accent, rng, 24),
    };
  }
  get guildTag() { return this.guild >= 0 ? GUILDS[this.guild].tag : ""; }
  get className() { return CLASSES[this.cls].name; }

  addXp(amount: number) {
    this.totalXp += amount;
    const lvl = levelFromXp(this.totalXp).level;
    const dinged = lvl > this.level;
    this.level = lvl;
    return dinged;
  }
}

// ---- on-screen simulated player --------------------------------------------
type SimState = "hunt" | "roam" | "flee" | "social" | "rest";
export class SimPlayer extends Entity {
  kind = "sim" as const;
  override radius = 11;
  hp = 1; maxHp = 1; atk = 1; def = 0; crit = 0; speed = 1;
  state: SimState = "roam";
  stateT = 0;
  attackCd = 0; potCd = 0;
  dead = false; deadT = 0;
  wx = 0; wy = 0;
  bubble: { text: string; t: number } | null = null;

  constructor(x: number, y: number, public rec: SimRecord) {
    super(x, y);
    this.wx = x; this.wy = y;
    this.refresh();
  }
  refresh() {
    const s = statsForClass(this.rec.cls, this.rec.level);
    this.maxHp = Math.round(s.maxHp * 0.9);
    this.hp = this.maxHp;
    this.atk = s.atk * 0.82;
    this.def = s.def;
    this.crit = s.crit;
    this.speed = s.speed;
  }
  say(text: string) { this.bubble = { text, t: 3.4 }; }

  update(world: World, dt: number) {
    if (this.attackCd > 0) this.attackCd -= dt;
    if (this.potCd > 0) this.potCd -= dt;
    if (this.bubble) { this.bubble.t -= dt; if (this.bubble.t <= 0) this.bubble = null; }

    if (this.dead) {
      this.deadT -= dt;
      if (this.deadT <= 0) {
        this.dead = false; this.hp = this.maxHp;
        const p = world.randomWalkablePos();
        this.x = p.x; this.y = p.y; this.wx = p.x; this.wy = p.y;
      }
      this.animate(false, dt);
      return;
    }

    this.hp = Math.min(this.maxHp, this.hp + dt * (1 + this.rec.level * 0.15));
    this.stateT -= dt;

    // sense
    let nearest: Monster | null = null, nd = 1e9;
    for (const m of world.monsters()) {
      if (!m.alive) continue;
      const d = dist(this.x, this.y, m.x, m.y);
      if (d < nd) { nd = d; nearest = m; }
    }

    // pick state
    const lowHp = this.hp < this.maxHp * 0.32;
    if (lowHp && nearest && nd < 220) this.state = "flee";
    else if (this.stateT <= 0) {
      this.chooseState(world, nearest, nd);
      this.stateT = world.rng.range(1.6, 4.5);
    }

    let moving = false;
    const sp = 116 * this.speed * (this.rec.pers === "tryhard" ? 1.08 : 1);

    if (this.state === "flee" && nearest) {
      const a = Math.atan2(this.y - nearest.y, this.x - nearest.x);
      moving = world.moveEntity(this, Math.cos(a) * sp * dt, Math.sin(a) * sp * dt);
      this.facing = facingFrom(Math.cos(a), Math.sin(a), this.facing); this.heading = a;
      if (this.potCd <= 0 && world.rng.chance(0.02)) {
        this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.4); this.potCd = 6;
        world.spawnDamage(this.x, this.y - 16, `+${Math.round(this.maxHp * 0.4)}`, COL.green);
      }
    } else if (this.state === "hunt" && nearest) {
      if (nd > 38) {
        const a = Math.atan2(nearest.y - this.y, nearest.x - this.x);
        moving = world.moveEntity(this, Math.cos(a) * sp * dt, Math.sin(a) * sp * dt);
        this.facing = facingFrom(Math.cos(a), Math.sin(a), this.facing); this.heading = a;
      }
      if (nd < 90 && this.attackCd <= 0) this.attack(world, nearest);
    } else {
      // roam / social / rest — drift toward wander target
      if (dist(this.x, this.y, this.wx, this.wy) < 18 || this.state === "rest") {
        if (this.state !== "rest") { const p = world.randomWalkablePos(this.x, this.y, 220); this.wx = p.x; this.wy = p.y; }
      } else {
        const a = Math.atan2(this.wy - this.y, this.wx - this.x);
        moving = world.moveEntity(this, Math.cos(a) * sp * 0.7 * dt, Math.sin(a) * sp * 0.7 * dt);
        this.facing = facingFrom(Math.cos(a), Math.sin(a), this.facing); this.heading = a;
      }
    }
    this.animate(moving, dt, this.speed);
  }

  private chooseState(world: World, nearest: Monster | null, nd: number) {
    const r = world.rng;
    const aggressive = this.rec.pers === "tryhard" || this.rec.pers === "edgy" ? 0.85 : this.rec.pers === "noob" ? 0.4 : this.rec.pers === "trader" ? 0.3 : 0.62;
    if (nearest && nd < 260 && r.chance(aggressive)) this.state = "hunt";
    else this.state = r.chance(0.2) ? "rest" : r.chance(0.3) ? "social" : "roam";
  }

  private attack(world: World, m: Monster) {
    const dx = m.x - this.x, dy = m.y - this.y, len = Math.hypot(dx, dy) || 1;
    const nx = dx / len, ny = dy / len;
    this.facing = facingFrom(nx, ny, this.facing); this.heading = Math.atan2(ny, nx);
    const w = CLASSES[this.rec.cls].weapon;
    if (w === "sword") {
      meleeSwing(world, this.x, this.y, nx, ny, this.atk, this.crit, 48, Math.PI * 0.8, "#fff4d0", this);
    } else {
      const speed = w === "bow" ? 380 : 280;
      world.projectiles.push(new Projectile(this.x + nx * 12, this.y + ny * 12, nx * speed, ny * speed,
        Math.max(1, Math.round(this.atk * (w === "bow" ? 1 : 0.95))), world.rng.chance(this.crit), "ally",
        w === "bow" ? "arrow" : "bolt", w === "bow" ? "#e8e2cf" : COL.mana, 0, this));
    }
    this.attackCd = 0.62;
  }

}

// ---- chat ------------------------------------------------------------------
export type ChatKind = "say" | "system" | "lfg" | "trade" | "whisper" | "guild";
export interface ChatMsg { author: string; tag: string; color: string; text: string; kind: ChatKind; }
export class ChatSystem {
  messages: ChatMsg[] = [];
  version = 0; // bump so the UI knows to re-render

  private push(m: ChatMsg) {
    this.messages.push(m);
    if (this.messages.length > 100) this.messages.shift();
    this.version++;
  }
  say(rec: SimRecord, text: string, kind: ChatKind = "say") {
    this.push({ author: rec.name, tag: rec.guildTag, color: rec.guild >= 0 ? GUILDS[rec.guild].color : "#bcd4ee", text, kind });
    if (rec.entity && kind !== "whisper") rec.entity.say(text);
  }
  system(text: string) { this.push({ author: "", tag: "", color: COL.gold, text, kind: "system" }); }
  whisper(rec: SimRecord, text: string) { this.push({ author: rec.name, tag: rec.guildTag, color: "#ff9fd2", text, kind: "whisper" }); }
}

// ---- the director ----------------------------------------------------------
export class SimDirector {
  records: SimRecord[] = [];
  chat = new ChatSystem();
  rng: RNG;
  private tickT = 0;
  private chatT = 2;
  private _lbCache: LeaderRow[] = [];
  private _lbT = 0;

  constructor(public world: World, count: number, seed = 1234) {
    this.rng = new RNG(seed);
    for (let i = 0; i < count; i++) this.records.push(this.makeRecord(i + 1));
    // seed some progress so the world doesn't start everyone at level 1
    for (const r of this.records) {
      const head = this.rng.int(0, 16);
      r.addXp(head * head * 6);
      r.zoneId = this.desiredZone(r);
      r.gold = this.rng.int(5, 300);
      r.kills = this.rng.int(0, 200);
    }
  }

  private makeRecord(id: number): SimRecord {
    const pers = this.rng.pick(PERSONALITIES);
    const cls = this.rng.pick(["warrior", "mage", "ranger"] as ClassId[]);
    const guild = this.rng.chance(0.72) ? this.rng.int(0, GUILDS.length - 1) : -1;
    return new SimRecord(id, genName(this.rng, pers), cls, pers, guild, this.rng);
  }

  private desiredZone(r: SimRecord): string {
    if (r.pers === "trader" && this.rng.chance(0.5)) return "town";
    if (r.level < 4) return this.rng.chance(0.2) ? "town" : "greenfields";
    if (r.level < 8) return this.rng.pick(["greenfields", "darkwood", "darkwood"]);
    if (r.level < 12) return this.rng.pick(["darkwood", "ruins"]);
    return this.rng.pick(["ruins", "ruins", "darkwood"]);
  }

  // spawn on-screen sims for the player's current zone
  populate(zoneId: string) {
    for (const r of this.records) r.entity = null;
    const here = this.records.filter((r) => r.zoneId === zoneId);
    this.rng.shuffle(here);
    const cap = zoneId === "town" ? 7 : 9;
    let n = 0;
    for (const r of here) {
      if (n >= cap) break;
      const p = this.world.randomWalkablePos();
      const e = new SimPlayer(p.x, p.y, r);
      r.entity = e;
      this.world.entities.push(e);
      n++;
    }
  }

  update(dt: number) {
    this.tickT -= dt; this.chatT -= dt; this._lbT -= dt;

    // award xp / loot when an on-screen sim's record needs syncing is handled in world.onMonsterDeath
    if (this.tickT <= 0) {
      this.tickT = 2.0;
      for (const r of this.records) {
        if (r.entity) continue; // on-screen sims progress through real kills
        const diff = ZONE_DIFF[r.zoneId] ?? 1;
        if (diff > 0) {
          const gain = (6 + r.level * 1.6) * diff * this.rng.range(0.5, 1.4);
          if (this.rng.chance(0.82)) { r.kills++; if (r.addXp(gain)) this.announceDing(r); }
        }
        // occasional death
        if (diff >= 2 && this.rng.chance(0.015 * diff)) { r.deaths++; if (this.rng.chance(0.3)) this.chat.say(r, this.fill(this.rng.pick(DEATH_LINES), r), "say"); }
        // migration
        if (this.rng.chance(0.05)) {
          const want = this.desiredZone(r);
          if (want !== r.zoneId) {
            r.zoneId = want;
            if (this.rng.chance(0.25)) this.chat.say(r, `heading to ${ZONE_NAMES[want]}`, "say");
          }
        }
      }
    }

    // ambient chatter
    if (this.chatT <= 0) {
      this.chatT = this.rng.range(2.2, 4.6);
      const r = this.rng.pick(this.records);
      const line = this.genLine(r);
      if (line) {
        // whisper to the player occasionally
        if (line.kind === "whisper") this.chat.whisper(r, line.text);
        else this.chat.say(r, line.text, line.kind);
      }
    }

    if (this._lbT <= 0) { this._lbT = 1.0; this._lbCache = this.computeLeaderboard(); }
  }

  private announceDing(r: SimRecord) {
    if (this.rng.chance(0.5)) this.chat.say(r, this.fill(this.rng.pick(DING_LINES), r), "say");
  }

  // ---- chat content -------------------------------------------------------
  private fill(t: string, r: SimRecord): string {
    const zone = ZONE_NAMES[r.zoneId] ?? "the wilds";
    const mobs = ZONE_MOBS[r.zoneId] ?? ["slime"];
    const mob = mobs.length ? this.rng.pick(mobs) : "slime";
    const mats = ["potions", "iron swords", "wolf pelts", "rune shards", "gems", "mana potions"];
    const player = this.world.player.name;
    return t
      .replaceAll("{zone}", zone)
      .replaceAll("{mob}", mob + "s")
      .replaceAll("{lvl}", String(r.level))
      .replaceAll("{item}", this.rng.pick(mats))
      .replaceAll("{class}", r.className)
      .replaceAll("{player}", player);
  }
  private genLine(r: SimRecord): { text: string; kind: ChatKind } | null {
    const inTown = r.zoneId === "town";
    const roll = this.rng.next();
    // personality-flavoured lines fire ~45% of the time
    if (roll < 0.45) return { text: this.fill(this.rng.pick(PERS_LINES[r.pers]), r), kind: "say" };
    if (roll < 0.6 && !inTown) return { text: this.fill(this.rng.pick(LFG_LINES), r), kind: "lfg" };
    if (roll < 0.72) return { text: this.fill(this.rng.pick(TRADE_LINES), r), kind: "trade" };
    if (roll < 0.8 && !inTown) return { text: this.fill(this.rng.pick(HUNT_LINES), r), kind: "say" };
    if (roll < 0.86) return { text: this.fill(this.rng.pick(WHISPER_LINES), r), kind: "whisper" };
    if (roll < 0.93 && r.guild >= 0) return { text: this.fill(this.rng.pick(GUILD_LINES), r), kind: "guild" };
    return { text: this.fill(this.rng.pick(GENERIC_LINES), r), kind: "say" };
  }

  // react to the player's deeds
  reactPlayerLevel(level: number) {
    const r = this.randomChatter();
    if (!r) return;
    const lines = [`grats {player}! welcome to ${level} :)`, `gz {player}`, `{player} hit ${level}, nice`, `ding {player}! ez`];
    this.chat.say(r, this.fill(this.rng.pick(lines), r), "say");
  }
  reactPlayerLoot(itemId: string) {
    const r = this.randomChatter(); if (!r) return;
    const name = ITEMS[itemId]?.name ?? "loot";
    this.chat.say(r, this.fill(this.rng.pick([`POG {player} just got ${name}!`, `gz on the ${name} {player}`, `${name}?? lucky`, `nice drop {player}`]), r), "say");
  }
  reactPlayerDeath() {
    for (let i = 0; i < this.rng.int(1, 2); i++) {
      const r = this.randomChatter(); if (!r) continue;
      this.chat.say(r, this.fill(this.rng.pick(["F", "rip {player}", "press F", "oof {player}", "gg {player}"]), r), "say");
    }
  }
  private randomChatter(): SimRecord | null {
    return this.records.length ? this.rng.pick(this.records) : null;
  }

  // ---- leaderboard --------------------------------------------------------
  leaderboard(): LeaderRow[] { return this._lbCache.length ? this._lbCache : this.computeLeaderboard(); }
  private computeLeaderboard(): LeaderRow[] {
    const p = this.world.player;
    const rows: LeaderRow[] = this.records.map((r) => ({
      name: r.name, tag: r.guildTag, level: r.level, xp: r.totalXp, cls: r.className, kills: r.kills, isPlayer: false, online: !!r.entity,
    }));
    rows.push({ name: p.name, tag: "", level: p.level, xp: p.xp, cls: CLASSES[p.cls].name, kills: Object.values(p.kills).reduce((a, b) => a + b, 0), isPlayer: true, online: true });
    rows.sort((a, b) => b.xp - a.xp);
    return rows;
  }

  // ---- save ---------------------------------------------------------------
  serialize() {
    return this.records.map((r) => ({ id: r.id, name: r.name, cls: r.cls, pers: r.pers, guild: r.guild, level: r.level, totalXp: r.totalXp, kills: r.kills, deaths: r.deaths, gold: r.gold, zoneId: r.zoneId, style: r.style }));
  }
  load(data: any[]) {
    if (!Array.isArray(data) || !data.length) return;
    this.records = data.map((d) => {
      const r = new SimRecord(d.id, d.name, d.cls, d.pers, d.guild, this.rng);
      r.level = d.level; r.totalXp = d.totalXp; r.kills = d.kills ?? 0; r.deaths = d.deaths ?? 0;
      r.gold = d.gold ?? 0; r.zoneId = d.zoneId ?? "greenfields";
      if (d.style) r.style = d.style;
      return r;
    });
  }
}

export interface LeaderRow { name: string; tag: string; level: number; xp: number; cls: string; kills: number; isPlayer: boolean; online: boolean; }

// ---- chat line banks -------------------------------------------------------
const DING_LINES = ["DING! level {lvl} :)", "ez level {lvl}", "finally {lvl}", "level {lvl} lets goooo", "ding {lvl}"];
const DEATH_LINES = ["ugh died to a {mob}", "lag killed me i swear", "rip my pots", "ganked by {mob} smh", "who pulled that {mob}??"];
const LFG_LINES = ["LFG {zone}, dps here", "LFM {zone} run need 1 more", "any1 grouping for {zone}?", "{zone} group? inv me", "forming party for {zone}"];
const TRADE_LINES = ["WTS {item}, pst", "WTB {item} cheap", "anyone selling {item}?", "flipping {item} on the AH lol", "free {item} for new players in town"];
const HUNT_LINES = ["grinding {zone}", "{mob} give decent xp", "{zone} is packed today", "farming {mob} for mats", "these {mob} hit hard ngl"];
const WHISPER_LINES = ["hey wanna group up?", "nice {class}, wanna run {zone}?", "you new? i can show you {zone}", "got any spare pots?", "add me, we should party"];
const GUILD_LINES = ["guild raid on {zone} tonight!", "anyone on for a {zone} run?", "g/g grats", "repping the guild in {zone}", "guild bank needs {item}"];
const GENERIC_LINES = ["this game is so good", "anyone know a good {class} build?", "brb afk", "back", "gg", "the {zone} music slaps", "wish i rolled {class}"];
const PERS_LINES: Record<Personality, string[]> = {
  tryhard: ["get on my level", "world first {zone} clear, ez", "if ur under {lvl} dont bother", "no lifing {zone} today", "parse or leave"],
  friendly: ["gl everyone! <3", "grats!! :)", "have a great day adventurers", "love this community", "wholesome run ty all"],
  trader: ["WTS rares, pst", "buying {item} 5g each", "AH prices are wild rn", "flipping {item} ez profit", "investing in {item} trust"],
  noob: ["how do i equip a sword??", "where is {zone}?", "why am i so weak lol", "anyone help me pls", "whats a good {class} do"],
  edgy: ["darkness consumes all", "i hunt alone", "...", "pain is temporary", "the {zone} suits me"],
  lore: ["the {zone} was once a kingdom...", "beware what sleeps in the ruins", "the golem remembers", "old magic lingers here", "read the lore, it's deep"],
  memer: ["POGGERS", "number go up", "i touch {zone} grass", "ratio + L + no pots", "{mob} said skill issue"],
  helper: ["need a hand? im in {zone}", "free buffs in town", "lmk if anyone needs help", "new players dm me", "happy to carry {zone}"],
};
