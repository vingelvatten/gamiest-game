// ============================================================================
// Procedural art. Every tile, character and monster is drawn from code so the
// game ships with zero image assets and keeps one cohesive chunky-fantasy look.
// ============================================================================
import { COL, T, TILE } from "./config";
import { hash2, TAU } from "./engine";

type Ctx = CanvasRenderingContext2D;

// ---- tiny draw helpers -----------------------------------------------------
export function roundRect(c: Ctx, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
function circle(c: Ctx, x: number, y: number, r: number) {
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.closePath();
}
function specks(c: Ctx, gx: number, gy: number, x: number, y: number, n: number, color: string, size = 2) {
  c.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const h1 = hash2(gx * 7 + i * 13, gy * 11 + i * 5);
    const h2 = hash2(gx * 3 + i * 17, gy * 19 + i * 23);
    c.fillRect(x + Math.floor(h1 * (TILE - size)), y + Math.floor(h2 * (TILE - size)), size, size);
  }
}

// ============================================================================
// Tiles — draws one 32px tile. gx/gy are grid coords (stable detail).
// ============================================================================
export function drawTile(c: Ctx, t: T, x: number, y: number, gx: number, gy: number) {
  switch (t) {
    case T.Grass:
    case T.GrassAlt: {
      c.fillStyle = t === T.Grass ? COL.grass : COL.grassAlt;
      c.fillRect(x, y, TILE, TILE);
      specks(c, gx, gy, x, y, 5, COL.grassDark, 2);
      specks(c, gx + 99, gy + 99, x, y, 3, "#6fae54", 2);
      break;
    }
    case T.DarkGrass: {
      c.fillStyle = COL.darkGrass;
      c.fillRect(x, y, TILE, TILE);
      specks(c, gx, gy, x, y, 5, COL.darkGrass2, 2);
      specks(c, gx + 5, gy + 7, x, y, 2, "#46585f", 2);
      break;
    }
    case T.Path: {
      c.fillStyle = COL.path;
      c.fillRect(x, y, TILE, TILE);
      specks(c, gx, gy, x, y, 6, COL.pathDark, 2);
      break;
    }
    case T.Dirt: {
      c.fillStyle = COL.dirt;
      c.fillRect(x, y, TILE, TILE);
      specks(c, gx, gy, x, y, 6, "#74592f", 2);
      break;
    }
    case T.Sand: {
      c.fillStyle = COL.sand;
      c.fillRect(x, y, TILE, TILE);
      specks(c, gx, gy, x, y, 5, "#c9af74", 2);
      break;
    }
    case T.Water: {
      c.fillStyle = COL.water;
      c.fillRect(x, y, TILE, TILE);
      c.strokeStyle = "rgba(255,255,255,0.18)";
      c.lineWidth = 2;
      const off = hash2(gx, gy) * 6;
      c.beginPath();
      c.moveTo(x + 4, y + 10 + off);
      c.quadraticCurveTo(x + 16, y + 6 + off, x + 28, y + 12 + off);
      c.stroke();
      c.beginPath();
      c.moveTo(x + 4, y + 22 + off);
      c.quadraticCurveTo(x + 16, y + 18 + off, x + 28, y + 24 + off);
      c.stroke();
      break;
    }
    case T.Bridge: {
      c.fillStyle = COL.trunk;
      c.fillRect(x, y, TILE, TILE);
      c.fillStyle = "#7d5a36";
      for (let i = 0; i < 4; i++) c.fillRect(x + 1, y + i * 8 + 1, TILE - 2, 6);
      break;
    }
    case T.Tree: {
      // grass underlay then bushy canopy + trunk
      c.fillStyle = COL.grass; c.fillRect(x, y, TILE, TILE);
      c.fillStyle = COL.trunk; c.fillRect(x + 14, y + 18, 4, 10);
      c.fillStyle = COL.treeDark; circle(c, x + 16, y + 14, 13); c.fill();
      c.fillStyle = COL.tree; circle(c, x + 16, y + 13, 11); c.fill();
      c.fillStyle = "#3f8a45"; circle(c, x + 12, y + 10, 5); c.fill();
      break;
    }
    case T.DarkTree: {
      c.fillStyle = COL.darkGrass; c.fillRect(x, y, TILE, TILE);
      c.fillStyle = "#3a2c22"; c.fillRect(x + 14, y + 18, 4, 10);
      c.fillStyle = "#1c343a"; circle(c, x + 16, y + 13, 13); c.fill();
      c.fillStyle = COL.darkTree; circle(c, x + 16, y + 12, 11); c.fill();
      break;
    }
    case T.Bush: {
      c.fillStyle = COL.grass; c.fillRect(x, y, TILE, TILE);
      c.fillStyle = "#2f6230"; circle(c, x + 16, y + 18, 11); c.fill();
      c.fillStyle = COL.bush; circle(c, x + 13, y + 16, 7); c.fill();
      circle(c, x + 21, y + 17, 7); c.fill();
      break;
    }
    case T.Flower: {
      c.fillStyle = COL.grass; c.fillRect(x, y, TILE, TILE);
      const fc = hash2(gx, gy) > 0.5 ? COL.flowerA : COL.flowerB;
      for (const [fx, fy] of [[10, 12], [22, 20], [16, 8]] as const) {
        c.fillStyle = "#3f8a45"; c.fillRect(x + fx, y + fy, 2, 6);
        c.fillStyle = fc;
        for (let a = 0; a < 4; a++) {
          const ang = (a / 4) * TAU;
          circle(c, x + fx + 1 + Math.cos(ang) * 3, y + fy + Math.sin(ang) * 3, 2); c.fill();
        }
        c.fillStyle = "#fff6cf"; circle(c, x + fx + 1, y + fy, 1.6); c.fill();
      }
      break;
    }
    case T.Floor: {
      c.fillStyle = COL.floor; c.fillRect(x, y, TILE, TILE);
      c.strokeStyle = "rgba(0,0,0,0.12)"; c.lineWidth = 1;
      c.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
      break;
    }
    case T.RuinFloor: {
      c.fillStyle = COL.ruinFloor; c.fillRect(x, y, TILE, TILE);
      c.strokeStyle = "rgba(0,0,0,0.18)"; c.lineWidth = 1;
      const h = hash2(gx, gy);
      c.beginPath();
      c.moveTo(x + 6 + h * 8, y); c.lineTo(x + 12 + h * 6, y + TILE);
      c.stroke();
      specks(c, gx, gy, x, y, 3, "#857e6f", 2);
      break;
    }
    case T.Wall: {
      c.fillStyle = COL.wall; c.fillRect(x, y, TILE, TILE);
      c.fillStyle = "rgba(0,0,0,0.15)";
      for (let r = 0; r < 4; r++) {
        const yy = y + r * 8;
        const offset = (r % 2) * 8;
        for (let bx = -1; bx < 3; bx++) c.strokeRect(x + bx * 16 + offset + 0.5, yy + 0.5, 16, 8);
      }
      c.strokeStyle = "rgba(0,0,0,0.2)"; c.lineWidth = 1; c.strokeRect(x, y, TILE, TILE);
      break;
    }
    case T.StoneWall: {
      c.fillStyle = COL.stoneDark; c.fillRect(x, y, TILE, TILE);
      c.fillStyle = COL.stone;
      c.fillRect(x + 1, y + 1, 14, 14); c.fillRect(x + 17, y + 1, 14, 14);
      c.fillRect(x + 1, y + 17, 14, 14); c.fillRect(x + 17, y + 17, 14, 14);
      break;
    }
    case T.RuinStone: {
      c.fillStyle = COL.ruinStone; c.fillRect(x, y, TILE, TILE);
      c.strokeStyle = "rgba(0,0,0,0.22)"; c.strokeRect(x + 2.5, y + 2.5, TILE - 5, TILE - 5);
      break;
    }
    case T.RoofRed:
    case T.RoofPurple: {
      const base = t === T.RoofRed ? COL.roof : COL.roof2;
      c.fillStyle = base; c.fillRect(x, y, TILE, TILE);
      c.fillStyle = "rgba(0,0,0,0.18)";
      for (let r = 0; r < 3; r++)
        for (let bx = 0; bx < 3; bx++) {
          const offset = (r % 2) * 6;
          c.beginPath();
          c.arc(x + bx * 12 + offset, y + r * 11 + 11, 7, Math.PI, TAU);
          c.fill();
        }
      break;
    }
    case T.Door: {
      c.fillStyle = COL.wall; c.fillRect(x, y, TILE, TILE);
      c.fillStyle = COL.door; roundRect(c, x + 7, y + 6, 18, 26, 4); c.fill();
      c.fillStyle = COL.gold; circle(c, x + 21, y + 19, 1.6); c.fill();
      break;
    }
    case T.Fence: {
      c.fillStyle = COL.grass; c.fillRect(x, y, TILE, TILE);
      c.fillStyle = "#7a5a34";
      c.fillRect(x + 6, y + 8, 3, 18); c.fillRect(x + 22, y + 8, 3, 18);
      c.fillRect(x, y + 12, TILE, 3); c.fillRect(x, y + 20, TILE, 3);
      break;
    }
    case T.Portal: {
      c.fillStyle = COL.floor; c.fillRect(x, y, TILE, TILE);
      c.fillStyle = "rgba(155,107,214,0.5)"; circle(c, x + 16, y + 16, 13); c.fill();
      c.fillStyle = "rgba(190,150,240,0.7)"; circle(c, x + 16, y + 16, 8); c.fill();
      c.fillStyle = "#e9dcff"; circle(c, x + 16, y + 16, 4); c.fill();
      break;
    }
    default:
      c.fillStyle = COL.grass; c.fillRect(x, y, TILE, TILE);
  }
}

// ============================================================================
// Characters — shared humanoid used by player, NPCs and simulated players.
// ============================================================================
export interface CharStyle {
  skin: string;
  hair: string;
  body: string;   // tunic / armor
  accent: string; // trim / cape
  facing: "down" | "up" | "left" | "right";
  walk: number;   // animation phase 0..1
  bob: number;    // idle/walk vertical bob
  attack: number; // 0..1 swing progress (0 = idle)
  weapon?: "sword" | "staff" | "bow" | "none";
}

export function drawCharacter(c: Ctx, cx: number, cy: number, s: CharStyle, scale = 1) {
  c.save();
  c.translate(cx, cy);
  c.scale(scale, scale);
  // shadow
  c.fillStyle = COL.shadow;
  c.beginPath(); c.ellipse(0, 9, 10, 4, 0, 0, TAU); c.fill();

  const bob = s.bob;
  const legSwing = Math.sin(s.walk * TAU) * 3;
  c.translate(0, -bob);

  // legs
  c.fillStyle = "#3a2f4a";
  c.fillRect(-5, 2 + (legSwing > 0 ? -legSwing : 0), 4, 8);
  c.fillRect(1, 2 + (legSwing < 0 ? legSwing : 0), 4, 8);

  const flip = s.facing === "left" ? -1 : 1;

  // body
  c.save();
  if (s.facing === "left") c.scale(-1, 1);
  // cape/accent behind when facing up
  if (s.facing === "up") { c.fillStyle = s.accent; roundRect(c, -7, -6, 14, 14, 4); c.fill(); }
  c.fillStyle = s.body;
  roundRect(c, -7, -6, 14, 13, 5); c.fill();
  c.fillStyle = s.accent;
  c.fillRect(-7, -1, 14, 3); // belt/trim
  c.restore();

  // head
  c.fillStyle = s.skin;
  circle(c, 0, -11, 6.5); c.fill();
  // hair
  c.fillStyle = s.hair;
  c.beginPath();
  c.arc(0, -11, 6.5, Math.PI, TAU);
  c.fill();
  if (s.facing === "down") {
    c.fillRect(-6.5, -12, 13, 2);
    // eyes
    c.fillStyle = COL.ink;
    c.fillRect(-3.2, -11, 1.6, 2); c.fillRect(1.6, -11, 1.6, 2);
  } else if (s.facing === "up") {
    c.fillStyle = s.hair; circle(c, 0, -11, 6.2); c.fill();
  } else {
    // side: eye on the facing side
    c.fillStyle = COL.ink;
    c.fillRect(flip * 1.5 - 0.8, -11, 1.8, 2);
  }

  // weapon (held to the side / swung)
  if (s.weapon && s.weapon !== "none") {
    const sw = s.attack > 0 ? Math.sin(s.attack * Math.PI) : 0;
    c.save();
    c.translate(flip * 8, -2);
    c.rotate(flip * (-0.5 - sw * 1.7));
    if (s.weapon === "sword") {
      c.fillStyle = "#d9dde6"; c.fillRect(-1.5, -14, 3, 14);
      c.fillStyle = COL.goldDark; c.fillRect(-4, -1, 8, 3);
      c.fillStyle = COL.trunk; c.fillRect(-1.5, 1, 3, 4);
    } else if (s.weapon === "staff") {
      c.fillStyle = COL.trunk; c.fillRect(-1.5, -14, 3, 18);
      c.fillStyle = COL.mana; circle(c, 0, -15, 3.5); c.fill();
      c.fillStyle = "#cdd6ff"; circle(c, 0, -15, 1.6); c.fill();
    } else if (s.weapon === "bow") {
      c.strokeStyle = COL.trunk; c.lineWidth = 2;
      c.beginPath(); c.arc(0, -4, 10, -1.1, 1.1); c.stroke();
      c.strokeStyle = "#e8e2cf"; c.lineWidth = 1;
      c.beginPath(); c.moveTo(Math.cos(-1.1) * 10, -4 + Math.sin(-1.1) * 10);
      c.lineTo(Math.cos(1.1) * 10, -4 + Math.sin(1.1) * 10); c.stroke();
    }
    c.restore();
  }
  c.restore();
}

// ============================================================================
// Monsters — distinct silhouette per type.
// ============================================================================
export type MonsterKind =
  | "slime" | "rat" | "bat" | "wolf" | "boar"
  | "spider" | "skeleton" | "wraith" | "golem" | "imp";

export function drawMonster(c: Ctx, cx: number, cy: number, kind: MonsterKind, t: number, hurt = 0, scale = 1) {
  c.save();
  c.translate(cx, cy);
  c.scale(scale, scale);
  c.fillStyle = COL.shadow;
  c.beginPath(); c.ellipse(0, 9, 11, 4, 0, 0, TAU); c.fill();
  const bob = Math.sin(t * 4) * 1.5;
  c.translate(0, -bob);
  const tint = hurt > 0;

  const body = (col: string) => (tint ? "#ffffff" : col);

  switch (kind) {
    case "slime": {
      c.fillStyle = body("#5fb86a");
      c.beginPath();
      c.moveTo(-11, 8);
      c.quadraticCurveTo(-12, -8, 0, -8);
      c.quadraticCurveTo(12, -8, 11, 8);
      c.closePath(); c.fill();
      c.fillStyle = "rgba(255,255,255,0.35)"; circle(c, -4, -2, 3); c.fill();
      c.fillStyle = COL.ink; c.fillRect(-5, 0, 2, 3); c.fillRect(3, 0, 2, 3);
      break;
    }
    case "rat": {
      c.fillStyle = body("#8a7a66"); c.beginPath(); c.ellipse(0, 2, 10, 7, 0, 0, TAU); c.fill();
      c.fillStyle = body("#9a8a76"); circle(c, 9, -1, 5); c.fill();
      c.fillStyle = "#5a4a3a"; circle(c, 8, -5, 2.4); c.fill(); circle(c, 12, -4, 2.4); c.fill();
      c.strokeStyle = "#c9b59a"; c.lineWidth = 1.5; c.beginPath(); c.moveTo(-9, 3); c.quadraticCurveTo(-16, 0, -15, 6); c.stroke();
      c.fillStyle = COL.ink; circle(c, 12, -1, 1); c.fill();
      break;
    }
    case "bat": {
      const flap = Math.sin(t * 14) * 6;
      c.fillStyle = body("#5a4670");
      c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(-12, -6 - flap, -16, 2); c.quadraticCurveTo(-9, 0, 0, 4); c.fill();
      c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(12, -6 - flap, 16, 2); c.quadraticCurveTo(9, 0, 0, 4); c.fill();
      c.fillStyle = body("#6a5680"); circle(c, 0, 0, 5); c.fill();
      c.fillStyle = COL.red; circle(c, -2, -1, 1.2); c.fill(); circle(c, 2, -1, 1.2); c.fill();
      break;
    }
    case "wolf": {
      c.fillStyle = body("#7d8590"); c.beginPath(); c.ellipse(-1, 1, 12, 7, 0, 0, TAU); c.fill();
      c.fillStyle = body("#8d95a0"); circle(c, 10, -2, 5.5); c.fill();
      c.beginPath(); c.moveTo(7, -6); c.lineTo(9, -11); c.lineTo(11, -6); c.fill();
      c.beginPath(); c.moveTo(11, -6); c.lineTo(13, -11); c.lineTo(15, -6); c.fill();
      c.fillStyle = "#5a626c"; c.fillRect(-13, 4, 3, 6); c.fillRect(8, 4, 3, 6);
      c.fillStyle = COL.gold; circle(c, 12, -3, 1.3); c.fill();
      break;
    }
    case "boar": {
      c.fillStyle = body("#6b5240"); c.beginPath(); c.ellipse(0, 1, 13, 8, 0, 0, TAU); c.fill();
      c.fillStyle = body("#7b6250"); circle(c, 11, 1, 6); c.fill();
      c.fillStyle = "#e8e2cf"; c.beginPath(); c.moveTo(14, 2); c.lineTo(18, -2); c.lineTo(16, 3); c.fill();
      c.fillStyle = "#3a2c22"; c.fillRect(-12, 5, 3, 6); c.fillRect(9, 5, 3, 6);
      c.fillStyle = COL.ink; circle(c, 12, -2, 1.3); c.fill();
      break;
    }
    case "spider": {
      c.strokeStyle = body("#2a2233"); c.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const yy = -3 + i * 3;
        c.beginPath(); c.moveTo(-2, yy); c.lineTo(-12, yy - 3 + Math.sin(t * 8 + i) * 1.5); c.stroke();
        c.beginPath(); c.moveTo(2, yy); c.lineTo(12, yy - 3 + Math.cos(t * 8 + i) * 1.5); c.stroke();
      }
      c.fillStyle = body("#3a2f4a"); circle(c, 0, 2, 7); c.fill();
      c.fillStyle = body("#4a3f5a"); circle(c, 0, -4, 4); c.fill();
      c.fillStyle = COL.red; circle(c, -2, -4, 1); c.fill(); circle(c, 2, -4, 1); c.fill();
      break;
    }
    case "skeleton": {
      c.fillStyle = body("#e6e2d3");
      roundRect(c, -5, -4, 10, 11, 3); c.fill();
      c.fillStyle = "rgba(0,0,0,0.12)"; for (let i = 0; i < 3; i++) c.fillRect(-5, -2 + i * 4, 10, 1);
      c.fillStyle = body("#f0ecdd"); circle(c, 0, -10, 6); c.fill();
      c.fillStyle = COL.ink; circle(c, -2.3, -10, 1.6); c.fill(); circle(c, 2.3, -10, 1.6); c.fill();
      c.fillStyle = "#bdb7a6"; c.fillRect(6, -8, 2, 12); // bone arm
      break;
    }
    case "wraith": {
      c.fillStyle = "rgba(120,90,170,0.25)"; circle(c, 0, -2, 13); c.fill();
      c.fillStyle = body("#6a4f9a");
      c.beginPath(); c.moveTo(-9, 10);
      c.quadraticCurveTo(-11, -10, 0, -11);
      c.quadraticCurveTo(11, -10, 9, 10);
      c.quadraticCurveTo(4, 5, 0, 10);
      c.quadraticCurveTo(-4, 5, -9, 10); c.fill();
      c.fillStyle = "#d8c6ff"; circle(c, -3, -8, 1.6); c.fill(); circle(c, 3, -8, 1.6); c.fill();
      break;
    }
    case "golem": {
      c.fillStyle = body("#7a7468"); roundRect(c, -10, -8, 20, 18, 4); c.fill();
      c.fillStyle = body("#8a8478"); roundRect(c, -7, -12, 14, 9, 3); c.fill();
      c.fillStyle = "#5a5448"; c.fillRect(-10, 2, 20, 2);
      c.fillStyle = COL.flowerA; circle(c, -3, -8, 1.6); c.fill(); circle(c, 3, -8, 1.6); c.fill();
      c.fillStyle = COL.gold; circle(c, 0, 4, 2.2); c.fill();
      break;
    }
    case "imp": {
      c.fillStyle = body("#c2543f"); circle(c, 0, 0, 8); c.fill();
      c.fillStyle = body("#d2644f");
      c.beginPath(); c.moveTo(-6, -6); c.lineTo(-9, -12); c.lineTo(-3, -7); c.fill();
      c.beginPath(); c.moveTo(6, -6); c.lineTo(9, -12); c.lineTo(3, -7); c.fill();
      c.fillStyle = COL.gold; circle(c, -3, -1, 1.6); c.fill(); circle(c, 3, -1, 1.6); c.fill();
      c.strokeStyle = body("#c2543f"); c.lineWidth = 2;
      c.beginPath(); c.moveTo(0, 7); c.quadraticCurveTo(8, 9, 7, 3); c.stroke();
      break;
    }
  }
  c.restore();
}

// ---- a small coin / loot sparkle ------------------------------------------
export function drawCoin(c: Ctx, x: number, y: number, t: number) {
  const b = Math.sin(t * 5) * 2;
  c.fillStyle = COL.shadow; c.beginPath(); c.ellipse(x, y + 6, 5, 2, 0, 0, TAU); c.fill();
  c.fillStyle = COL.gold; circle(c, x, y - b, 5); c.fill();
  c.fillStyle = COL.goldDark; c.lineWidth = 1; c.strokeStyle = COL.goldDark; circle(c, x, y - b, 5); c.stroke();
  c.fillStyle = "#fff3c4"; c.fillRect(x - 1, y - b - 3, 2, 6);
}
