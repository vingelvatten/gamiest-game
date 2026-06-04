// ============================================================================
// Procedural low-poly 3D models, built from Three.js primitives and the shared
// COL palette. Characters are rigs (named limb groups for animation); tiles
// return raw geometries so the view layer can merge them per zone.
// ============================================================================
import * as THREE from "three";
import { COL } from "./config";
import { CLASSES, ClassId } from "./progression";
import type { MonsterKind } from "./art";

const colCache = new Map<string, THREE.Color>();
const C = (hex: string) => { let c = colCache.get(hex); if (!c) { c = new THREE.Color(hex); colCache.set(hex, c); } return c; };

// fresh material so each entity can be tinted (hurt flash) independently
const lam = (hex: string, emissive = "#000000") =>
  new THREE.MeshLambertMaterial({ color: C(hex).clone(), emissive: C(emissive).clone() });

function mesh(w: number, h: number, d: number, color: string) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(color));
}

// ---- weapons (attach to the right hand) ------------------------------------
function buildWeapon(kind: "sword" | "staff" | "bow"): THREE.Group {
  const g = new THREE.Group();
  if (kind === "sword") {
    const blade = mesh(0.07, 0.5, 0.02, "#d9dde6"); blade.position.y = 0.22; g.add(blade);
    const guard = mesh(0.22, 0.05, 0.07, COL.goldDark); g.add(guard);
    const grip = mesh(0.05, 0.14, 0.05, COL.trunk); grip.position.y = -0.1; g.add(grip);
  } else if (kind === "staff") {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.66, 6), lam(COL.trunk)); shaft.position.y = 0.18; g.add(shaft);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10), lam(COL.mana, "#26306a")); orb.position.y = 0.55; g.add(orb);
  } else {
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.025, 6, 12, Math.PI * 1.1), lam(COL.trunk));
    bow.position.y = 0.12; bow.rotation.z = Math.PI / 2; g.add(bow);
  }
  return g;
}

export interface CharColors { skin: string; hair: string; body: string; accent: string; }
export interface CharRig extends THREE.Group {
  userData: { legL: THREE.Group; legR: THREE.Group; armL: THREE.Group; armR: THREE.Group; head: THREE.Group; headTopY: number; kind: "char" };
}

export function buildCharacter(c: CharColors, weapon: "sword" | "staff" | "bow" | "none" = "none"): THREE.Group {
  const root = new THREE.Group();

  const legGroup = (x: number) => {
    const grp = new THREE.Group(); grp.position.set(x, 0.42, 0);
    const leg = mesh(0.16, 0.42, 0.17, "#3a2f4a"); leg.position.y = -0.21; grp.add(leg);
    const boot = mesh(0.18, 0.1, 0.22, COL.trunk); boot.position.set(0, -0.4, 0.03); grp.add(boot);
    return grp;
  };
  const legL = legGroup(-0.12), legR = legGroup(0.12);

  const body = mesh(0.46, 0.48, 0.3, c.body); body.position.y = 0.67;
  const belt = mesh(0.48, 0.1, 0.32, c.accent); belt.position.y = 0.5;
  const collar = mesh(0.3, 0.1, 0.3, c.accent); collar.position.y = 0.9;

  const armGroup = (x: number, withWeapon: boolean) => {
    const grp = new THREE.Group(); grp.position.set(x, 0.86, 0);
    const arm = mesh(0.13, 0.4, 0.13, c.body); arm.position.y = -0.17; grp.add(arm);
    const hand = mesh(0.14, 0.12, 0.14, c.skin); hand.position.y = -0.4; grp.add(hand);
    if (withWeapon && weapon !== "none") { const w = buildWeapon(weapon); w.position.set(0, -0.46, 0.06); grp.add(w); }
    return grp;
  };
  const armL = armGroup(-0.32, false), armR = armGroup(0.32, true);

  const head = new THREE.Group(); head.position.y = 0.9;
  const skull = mesh(0.34, 0.34, 0.33, c.skin); skull.position.y = 0.18; head.add(skull);
  const hair = mesh(0.37, 0.17, 0.36, c.hair); hair.position.y = 0.35; head.add(hair);
  const hairBack = mesh(0.37, 0.2, 0.12, c.hair); hairBack.position.set(0, 0.2, -0.14); head.add(hairBack);

  root.add(legL, legR, body, belt, collar, armL, armR, head);
  root.userData = { legL, legR, armL, armR, head, headTopY: 1.32, kind: "char" };
  return root;
}

export function buildClassModel(cls: ClassId): THREE.Group {
  const d = CLASSES[cls];
  return buildCharacter({ skin: "#e7b48a", hair: "#3a2c22", body: d.body, accent: d.accent }, d.weapon);
}

// ---- monsters --------------------------------------------------------------
export interface MonsterRig extends THREE.Group {
  userData: { kind: "monster"; mk: MonsterKind; hover: number; headTopY: number; wingL?: THREE.Object3D; wingR?: THREE.Object3D; bobAmp: number };
}

export function buildMonster(mk: MonsterKind): THREE.Group {
  const g = new THREE.Group();
  const ud: any = { kind: "monster", mk, hover: 0, headTopY: 0.9, bobAmp: 0.04 };
  const box = (w: number, h: number, d: number, color: string, x = 0, y = 0, z = 0) => { const m = mesh(w, h, d, color); m.position.set(x, y, z); g.add(m); return m; };
  const ball = (r: number, color: string, x = 0, y = 0, z = 0, em = "#000000") => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 10), lam(color, em)); m.position.set(x, y, z); g.add(m); return m; };

  switch (mk) {
    case "slime": {
      const b = ball(0.42, "#5fb86a", 0, 0.34); b.scale.y = 0.78;
      ball(0.05, "#101018", -0.14, 0.36, 0.36); ball(0.05, "#101018", 0.14, 0.36, 0.36);
      ud.headTopY = 0.8; ud.bobAmp = 0.08; break;
    }
    case "rat": {
      box(0.5, 0.3, 0.34, "#8a7a66", 0, 0.24); ball(0.2, "#9a8a76", 0, 0.3, 0.3);
      box(0.06, 0.18, 0.02, "#6a5a48", -0.1, 0.46, 0.28); box(0.06, 0.18, 0.02, "#6a5a48", 0.1, 0.46, 0.28);
      const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.04, 0.5, 5), lam("#c9b59a")); tail.rotation.z = Math.PI / 2; tail.position.set(-0.4, 0.22, 0); g.add(tail);
      ud.headTopY = 0.55; break;
    }
    case "bat": {
      ball(0.18, "#6a5680", 0, 0.6); ball(0.04, COL.red, -0.07, 0.62, 0.15); ball(0.04, COL.red, 0.07, 0.62, 0.15);
      const wingL = box(0.34, 0.02, 0.26, "#5a4670", -0.28, 0.6); const wingR = box(0.34, 0.02, 0.26, "#5a4670", 0.28, 0.6);
      ud.wingL = wingL; ud.wingR = wingR; ud.hover = 0.6; ud.headTopY = 0.85; ud.bobAmp = 0.12; break;
    }
    case "wolf": {
      box(0.7, 0.34, 0.34, "#7d8590", 0, 0.42); ball(0.22, "#8d95a0", 0.34, 0.5);
      box(0.07, 0.16, 0.04, "#5a626c", 0.28, 0.66, 0.08); box(0.07, 0.16, 0.04, "#5a626c", 0.4, 0.66, 0.08);
      for (const x of [-0.25, 0.25]) for (const z of [-0.12, 0.12]) box(0.1, 0.34, 0.1, "#5a626c", x, 0.17, z);
      ud.headTopY = 0.78; break;
    }
    case "boar": {
      box(0.74, 0.46, 0.46, "#6b5240", 0, 0.4); ball(0.26, "#7b6250", 0.36, 0.42);
      box(0.16, 0.12, 0.12, "#e8e2cf", 0.52, 0.4); // snout
      for (const x of [-0.26, 0.28]) for (const z of [-0.16, 0.16]) box(0.11, 0.32, 0.11, "#3a2c22", x, 0.16, z);
      ud.headTopY = 0.82; break;
    }
    case "spider": {
      ball(0.3, "#3a2f4a", 0, 0.3); ball(0.18, "#4a3f5a", 0.26, 0.32);
      ball(0.035, COL.red, 0.34, 0.36, 0.08); ball(0.035, COL.red, 0.34, 0.36, -0.08);
      for (let i = 0; i < 4; i++) { const zz = -0.18 + i * 0.12; box(0.5, 0.04, 0.04, "#2a2233", -0.12, 0.28, zz); box(0.5, 0.04, 0.04, "#2a2233", 0.12, 0.28, zz); }
      ud.headTopY = 0.66; break;
    }
    case "skeleton": {
      const r = buildCharacter({ skin: "#e6e2d3", hair: "#cfcabb", body: "#d8d3c4", accent: "#b9b3a2" }, "none");
      r.scale.set(0.92, 0.96, 0.86); return r;
    }
    case "wraith": {
      const cloak = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.1, 8), lam("#6a4f9a", "#241636")); cloak.position.y = 0.62; g.add(cloak);
      ball(0.18, "#7a5faa", 0, 1.05); ball(0.04, "#d8c6ff", -0.07, 1.08, 0.15, "#6a4f9a"); ball(0.04, "#d8c6ff", 0.07, 1.08, 0.15, "#6a4f9a");
      ud.hover = 0.25; ud.headTopY = 1.3; ud.bobAmp = 0.1; break;
    }
    case "imp": {
      ball(0.3, "#c2543f", 0, 0.42, 0, "#3a1008");
      box(0.08, 0.18, 0.06, "#d2644f", -0.14, 0.66); box(0.08, 0.18, 0.06, "#d2644f", 0.14, 0.66); // horns
      ball(0.04, COL.gold, -0.1, 0.44, 0.24, "#5a4a00"); ball(0.04, COL.gold, 0.1, 0.44, 0.24, "#5a4a00");
      box(0.28, 0.02, 0.2, "#a23a2a", -0.26, 0.46); box(0.28, 0.02, 0.2, "#a23a2a", 0.26, 0.46);
      ud.hover = 0.3; ud.headTopY = 0.95; ud.bobAmp = 0.1; break;
    }
    case "golem": {
      box(1.1, 1.2, 0.9, "#7a7468", 0, 0.75); box(0.8, 0.6, 0.7, "#8a8478", 0, 1.55);
      ball(0.07, COL.flowerA, -0.18, 1.62, 0.36, "#6a6000"); ball(0.07, COL.flowerA, 0.18, 1.62, 0.36, "#6a6000");
      for (const x of [-0.42, 0.42]) box(0.34, 0.8, 0.34, "#6e685c", x, 1.0);
      for (const x of [-0.3, 0.3]) box(0.4, 0.5, 0.4, "#6e685c", x, 0.25);
      ud.headTopY = 2.0; ud.bobAmp = 0.02; break;
    }
  }
  g.userData = ud;
  return g;
}

// ---- tile props (raw geometries, centred in a 1x1 tile, base at y=0) --------
export interface TilePiece { geo: THREE.BufferGeometry; color: string; }
const gbox = (w: number, h: number, d: number, yBase: number, color: string): TilePiece => { const g = new THREE.BoxGeometry(w, h, d); g.translate(0.5, yBase + h / 2, 0.5); return { geo: g, color }; };
const gcyl = (rt: number, rb: number, h: number, yBase: number, color: string, seg = 7): TilePiece => { const g = new THREE.CylinderGeometry(rt, rb, h, seg); g.translate(0.5, yBase + h / 2, 0.5); return { geo: g, color }; };
const gcone = (r: number, h: number, yBase: number, color: string, seg = 8): TilePiece => { const g = new THREE.ConeGeometry(r, h, seg); g.translate(0.5, yBase + h / 2, 0.5); return { geo: g, color }; };
const gsph = (r: number, yBase: number, color: string, seg = 8): TilePiece => { const g = new THREE.SphereGeometry(r, seg, seg); g.translate(0.5, yBase + r, 0.5); return { geo: g, color }; };

// returns extra 3D geometry sitting on a tile (empty for flat tiles)
export function tileProps(t: number, name: string): TilePiece[] {
  switch (name) {
    case "Tree": return [gcyl(0.1, 0.13, 0.7, 0, COL.trunk), gcone(0.55, 1.0, 0.55, COL.treeDark), gsph(0.34, 1.0, COL.tree)];
    case "DarkTree": return [gcyl(0.1, 0.13, 0.8, 0, "#3a2c22"), gcone(0.5, 1.1, 0.6, COL.darkTree), gsph(0.3, 1.05, "#1c343a")];
    case "Bush": return [gsph(0.4, 0.12, COL.bush), gsph(0.26, 0.34, "#3f8a45")];
    case "Wall": return [gbox(1, 1.15, 1, 0, COL.wall)];
    case "StoneWall": return [gbox(1, 1.25, 1, 0, COL.stoneDark), gbox(0.9, 1.3, 0.9, 0, COL.stone)];
    case "RuinStone": return [gbox(0.9, 0.85, 0.9, 0, COL.ruinStone)];
    case "RoofRed": return [gbox(1, 0.55, 1, 1.1, COL.roof), gbox(1, 1.1, 1, 0, COL.wall)];
    case "RoofPurple": return [gbox(1, 0.55, 1, 1.1, COL.roof2), gbox(1, 1.1, 1, 0, COL.wall)];
    case "Fence": return [gbox(1, 0.1, 0.1, 0.42, "#7a5a34"), gbox(0.12, 0.5, 0.12, 0, "#7a5a34")];
    case "Bridge": return [gbox(1, 0.08, 1, 0, COL.trunk)];
    default: return [];
  }
}
