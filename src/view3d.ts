// ============================================================================
// view3d — the 3D third-person view layer. Reads the (unchanged) world/entity
// state each frame and renders it with Three.js: textured terrain + merged
// low-poly props, pooled entity/fx meshes, a follow camera with mouse-look,
// and a 2D overlay canvas for projected name tags, damage numbers and bubbles.
// ============================================================================
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { clamp, TAU } from "./engine";
import { COL, T, TILE } from "./config";
import { buildCharacter, buildClassModel, buildMonster, tileProps } from "./model";
import { Entity, Monster, nameTag, Npc, Player } from "./entities";
import { CLASSES } from "./progression";
import { SimPlayer } from "./simulation";
import { ITEMS, RARITY_COL } from "./items";
import type { World } from "./world";

const S = 1 / TILE; // world pixels -> 3D units (1 tile = 1 unit)
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

const AMBIENT = {
  town:  { bg: "#9fc6e6", fog: "#bcd8ee", fogNear: 14, fogFar: 34, sun: 1.0 },
  green: { bg: "#a6d2e2", fog: "#bfe0d8", fogNear: 14, fogFar: 36, sun: 1.0 },
  dark:  { bg: "#1d2730", fog: "#1d2a30", fogNear: 7, fogFar: 22, sun: 0.55 },
  ruins: { bg: "#3a3630", fog: "#4a4338", fogNear: 12, fogFar: 30, sun: 0.8 },
} as const;

export class View3D {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  octx: CanvasRenderingContext2D;

  private hemi: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  private zoneGroup: THREE.Group | null = null;
  private zoneCache = new Map<string, THREE.Group>();
  private texCache = new Map<string, THREE.Texture>();
  private folTex: Record<string, THREE.Texture> | null = null;
  private curZone = "";

  private fxGroup = new THREE.Group();   // projectiles, loot, rings (rebuilt per frame)
  private entityMeshes = new Map<number, THREE.Object3D>();

  // camera state
  yaw = Math.PI;        // facing -Z initially (looking "south")
  pitch = 0.5;
  dist = 8;
  private camPos = new THREE.Vector3();

  private clock = new THREE.Clock();
  private ray = new THREE.Raycaster();
  locked = false;

  // shared fx geometry
  private gSphere = new THREE.SphereGeometry(0.16, 10, 10);
  private gCoin = new THREE.CylinderGeometry(0.16, 0.16, 0.05, 12);
  private gItem = new THREE.BoxGeometry(0.26, 0.26, 0.26);
  private gRing = new THREE.RingGeometry(0.9, 1.0, 24);

  constructor(private gl: HTMLCanvasElement, private overlay: HTMLCanvasElement, private world: World) {
    this.renderer = new THREE.WebGLRenderer({ canvas: gl, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.camera = new THREE.PerspectiveCamera(58, gl.clientWidth / gl.clientHeight, 0.1, 200);
    this.octx = overlay.getContext("2d")!;

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x4a5560, 1.05);
    this.sun = new THREE.DirectionalLight(0xfff2d6, 0.9);
    this.sun.position.set(8, 16, 6);
    this.scene.add(this.hemi, this.sun, this.fxGroup);

    this.setSize(window.innerWidth, window.innerHeight);
    this.bindLook();
  }

  setSize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    this.overlay.width = w; this.overlay.height = h;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  // ---- mouse-look (pointer lock) -----------------------------------------
  private bindLook() {
    this.overlay.addEventListener("mousedown", () => {
      if (!this.locked && !this.world.uiBlockingInput) this.overlay.requestPointerLock?.();
    });
    document.addEventListener("pointerlockchange", () => { this.locked = document.pointerLockElement === this.overlay; });
    document.addEventListener("mousemove", (e) => {
      if (!this.locked) return;
      // mouse right -> turn right, mouse up -> look up (standard, non-inverted)
      this.yaw += e.movementX * 0.0026;
      this.pitch = clamp(this.pitch + e.movementY * 0.0024, 0.12, 1.32);
    });
    this.overlay.addEventListener("wheel", (e) => { e.preventDefault(); this.dist = clamp(this.dist + Math.sign(e.deltaY) * 0.7, 4.5, 12); }, { passive: false });
  }

  // ---- zone terrain -------------------------------------------------------
  private buildZone(zone: any): THREE.Group {
    const g = new THREE.Group();
    // ground: the prerendered top-down canvas as a texture on one plane
    let tex = this.texCache.get(zone.id);
    if (!tex && zone.bg) {
      tex = new THREE.CanvasTexture(zone.bg);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      this.texCache.set(zone.id, tex);
    }
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(zone.w, zone.h),
      new THREE.MeshLambertMaterial({ map: tex ?? null, color: tex ? 0xffffff : 0x5a9a45 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(zone.w / 2, 0, zone.h / 2);
    g.add(ground);

    // structures merge per colour (few draw calls); foliage uses WoW-style
    // 2D billboard sprites (two crossed alpha-mapped quads — cheap, no 3D mesh)
    const buckets = new Map<string, THREE.BufferGeometry[]>();
    const folBuckets = new Map<string, THREE.BufferGeometry[]>();
    if (!this.folTex) this.folTex = makeFoliageTextures();
    for (let y = 0; y < zone.h; y++) for (let x = 0; x < zone.w; x++) {
      const t = zone.tiles[y * zone.w + x] as number;
      const name = T[t];
      const fol = FOLIAGE[name];
      if (fol) {
        for (const rot of [0, Math.PI / 2]) {
          const geo = new THREE.PlaneGeometry(fol.w, fol.h);
          geo.rotateY(rot); geo.translate(x + 0.5, fol.h / 2, y + 0.5);
          const arr = folBuckets.get(name) ?? []; arr.push(geo); folBuckets.set(name, arr);
        }
        continue;
      }
      for (const p of tileProps(t, name)) {
        const geo = p.geo.clone(); geo.translate(x, 0, y);
        const arr = buckets.get(p.color) ?? []; arr.push(geo); buckets.set(p.color, arr);
      }
    }
    for (const [color, geos] of buckets) {
      const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
      if (!merged) continue;
      g.add(new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ color: new THREE.Color(color) })));
    }
    for (const [name, geos] of folBuckets) {
      const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
      if (!merged) continue;
      g.add(new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ map: this.folTex![name], transparent: true, alphaTest: 0.5, side: THREE.DoubleSide })));
    }

    // portals: glowing pillars
    for (const p of zone.portals) {
      const cx = p.x + p.w / 2, cz = p.y + p.h / 2;
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 2.4, 14, 1, true),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(COL.purple), transparent: true, opacity: 0.4, side: THREE.DoubleSide }));
      pillar.position.set(cx, 1.2, cz); pillar.userData.portal = true; g.add(pillar);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.74, 20),
        new THREE.MeshBasicMaterial({ color: new THREE.Color("#e9dcff"), transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(cx, 0.05, cz); g.add(ring);
    }
    return g;
  }

  private setZone(zone: any) {
    if (this.zoneGroup) this.scene.remove(this.zoneGroup);
    let grp = this.zoneCache.get(zone.id);
    if (!grp) { grp = this.buildZone(zone); this.zoneCache.set(zone.id, grp); }
    this.zoneGroup = grp; this.scene.add(grp);
    const amb = AMBIENT[zone.ambient as keyof typeof AMBIENT] ?? AMBIENT.green;
    this.scene.background = new THREE.Color(amb.bg);
    this.scene.fog = new THREE.Fog(new THREE.Color(amb.fog).getHex(), amb.fogNear, amb.fogFar);
    this.sun.intensity = amb.sun; this.hemi.intensity = 0.5 + amb.sun * 0.55;
    // drop any pooled entity meshes from the old zone
    for (const [, m] of this.entityMeshes) this.scene.remove(m);
    this.entityMeshes.clear();
    this.curZone = zone.id;
  }

  // ---- entity model creation ---------------------------------------------
  private makeModel(e: Entity): THREE.Object3D {
    let m: THREE.Object3D;
    if (e instanceof Player) m = buildClassModel(e.cls);
    else if (e instanceof Monster) m = buildMonster(e.def.kind);
    else if (e instanceof SimPlayer) m = buildCharacter(e.rec.style, CLASSES[e.rec.cls].weapon);
    else if (e instanceof Npc) m = buildCharacter({ skin: e.style.skin, hair: e.style.hair, body: e.style.body, accent: e.style.accent }, e.style.weapon === "none" ? "none" : (e.style.weapon as any));
    else m = buildCharacter({ skin: "#e7b48a", hair: "#333", body: "#888", accent: "#555" });
    // blob shadow
    const shadow = new THREE.Mesh(new THREE.CircleGeometry((e.radius || 11) * S * 1.5, 14),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.26 }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02;
    m.add(shadow);
    m.userData.prevCd = 0; m.userData.swing = 0; m.userData.flash = false;
    return m;
  }

  // ---- main render --------------------------------------------------------
  render(world: World) {
    const dt = Math.min(0.05, this.clock.getDelta());
    if (world.zone && world.zone.id !== this.curZone) this.setZone(world.zone);

    this.syncEntities(world, dt);
    this.syncFx(world);
    this.updateCamera(world, dt);
    this.pulsePortals();

    this.renderer.render(this.scene, this.camera);
    this.drawOverlay(world);
  }

  private syncEntities(world: World, dt: number) {
    const live = new Set<number>();
    const all: Entity[] = [...world.entities, world.player];
    for (const e of all) {
      live.add(e.id);
      let m = this.entityMeshes.get(e.id);
      if (!m) { m = this.makeModel(e); this.entityMeshes.set(e.id, m); this.scene.add(m); }
      const ud: any = m.userData;

      // position + facing
      const dead = (e instanceof Player && e.isDead) || (e instanceof SimPlayer && e.dead);
      m.position.set(e.x * S, 0, e.y * S);
      const h = (e as any).heading ?? 0;
      const targetRot = Math.atan2(Math.cos(h), Math.sin(h));
      let dRot = targetRot - m.rotation.y; dRot = Math.atan2(Math.sin(dRot), Math.cos(dRot));
      m.rotation.y += dRot * Math.min(1, dt * 14);
      m.visible = true;
      m.scale.setScalar(dead ? 0.6 : 1);

      // walk / hover / attack animation
      const phase = (e as any).walk ?? 0;
      this.animateModel(m, e, Math.sin(phase * TAU), dt);

      // hurt flash
      const flash = (e as any).hurt > 0;
      if (flash !== ud.flash) { ud.flash = flash; m.traverse((o: any) => { if (o.material && o.material.emissive) o.material.emissive.setHex(flash ? 0x886655 : 0x000000); }); }
    }
    // remove gone
    for (const [id, m] of this.entityMeshes) {
      if (!live.has(id)) { this.scene.remove(m); disposeObj(m); this.entityMeshes.delete(id); }
    }
  }

  private animateModel(m: THREE.Object3D, e: Entity, swing: number, dt: number) {
    const ud: any = m.userData;
    // attack detection (attackCd jumped up => just attacked)
    const cd = (e as any).attackCd ?? 0;
    if (cd > ud.prevCd + 0.05) ud.swing = 1;
    ud.prevCd = cd;
    ud.swing = Math.max(0, ud.swing - dt * 4);

    const parts = (m.userData as any);
    if (parts.legL) {
      const sp = swing * 0.5;
      parts.legL.rotation.x = sp; parts.legR.rotation.x = -sp;
      parts.armL.rotation.x = -sp * 0.7; parts.armR.rotation.x = sp * 0.7 - ud.swing * 1.7;
      parts.head.rotation.z = swing * 0.04;
    } else if (parts.kind === "monster") {
      const t = performance.now() / 1000;
      m.position.y = (parts.hover || 0) + Math.sin(t * 4 + e.id) * (parts.bobAmp || 0);
      if (parts.wingL) { parts.wingL.rotation.z = Math.sin(t * 16) * 0.7; parts.wingR.rotation.z = -Math.sin(t * 16) * 0.7; }
      if (ud.swing > 0) m.position.y += Math.sin(ud.swing * Math.PI) * 0.12;
    }
  }

  // ---- fx (projectiles / loot / rings), rebuilt each frame ---------------
  private syncFx(world: World) {
    // clear
    for (let i = this.fxGroup.children.length - 1; i >= 0; i--) { const c = this.fxGroup.children[i]; this.fxGroup.remove(c); }
    // projectiles
    for (const p of world.projectiles) {
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(p.color) });
      const mesh = new THREE.Mesh(this.gSphere, mat);
      mesh.scale.setScalar(p.kind === "fireball" ? 1.5 : p.kind === "arrow" ? 0.5 : 1);
      mesh.position.set(p.x * S, 0.55, p.y * S);
      this.fxGroup.add(mesh);
    }
    // ground loot
    for (const g of world.ground) {
      const bob = 0.18 + Math.sin(performance.now() / 200 + g.x) * 0.06;
      if (g.gold) {
        const mesh = new THREE.Mesh(this.gCoin, new THREE.MeshLambertMaterial({ color: new THREE.Color(COL.gold), emissive: new THREE.Color("#3a2c00") }));
        mesh.position.set(g.x * S, bob, g.y * S); mesh.rotation.x = Math.PI / 2; mesh.rotation.z = performance.now() / 400;
        this.fxGroup.add(mesh);
      } else if (g.itemId) {
        const col = RARITY_COL[ITEMS[g.itemId]?.rarity ?? "common"];
        const mesh = new THREE.Mesh(this.gItem, new THREE.MeshLambertMaterial({ color: new THREE.Color(col), emissive: new THREE.Color(col).multiplyScalar(0.25) }));
        mesh.position.set(g.x * S, bob, g.y * S); mesh.rotation.y = performance.now() / 500;
        this.fxGroup.add(mesh);
      }
    }
    // rings
    for (const r of world.rings) {
      const mesh = new THREE.Mesh(this.gRing, new THREE.MeshBasicMaterial({ color: new THREE.Color(r.color), transparent: true, opacity: Math.max(0, r.life * 1.6), side: THREE.DoubleSide }));
      mesh.rotation.x = -Math.PI / 2; mesh.position.set(r.x * S, 0.06, r.y * S); mesh.scale.setScalar((r.r * S) || 0.01);
      this.fxGroup.add(mesh);
    }
  }

  private pulsePortals() {
    if (!this.zoneGroup) return;
    const o = 0.3 + Math.sin(performance.now() / 400) * 0.15;
    this.zoneGroup.traverse((c: any) => { if (c.userData?.portal) c.material.opacity = o; });
  }

  // ---- camera -------------------------------------------------------------
  private updateCamera(world: World, dt: number) {
    const p = world.player;
    const target = v3(p.x * S, 0.9, p.y * S);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const desired = v3(
      target.x + Math.sin(this.yaw) * cp * this.dist,
      target.y + sp * this.dist,
      target.z + Math.cos(this.yaw) * cp * this.dist,
    );
    const k = 1 - Math.pow(0.0009, dt);
    this.camPos.lerp(desired, k);
    const shake = world.camera.shake;
    this.camera.position.copy(this.camPos);
    if (shake > 0) { this.camera.position.x += (Math.random() - 0.5) * shake * 0.04; this.camera.position.y += (Math.random() - 0.5) * shake * 0.04; world.camera.shake = Math.max(0, shake - dt * 60); }
    this.camera.lookAt(target);
    world.viewYaw = this.yaw;
  }

  // ---- overlay (projected labels, damage numbers, bubbles, crosshair) ----
  private project(x: number, y: number, z: number): { sx: number; sy: number; on: boolean } {
    const v = v3(x, y, z).project(this.camera);
    return { sx: (v.x * 0.5 + 0.5) * this.overlay.width, sy: (-v.y * 0.5 + 0.5) * this.overlay.height, on: v.z < 1 };
  }

  private drawOverlay(world: World) {
    const c = this.octx;
    c.clearRect(0, 0, this.overlay.width, this.overlay.height);

    // entity labels
    for (const e of world.entities) {
      const headY = (this.entityMeshes.get(e.id)?.userData as any)?.headTopY ?? 1.3;
      const pr = this.project(e.x * S, headY + 0.25, e.y * S);
      if (!pr.on) continue;
      if (e instanceof Monster) {
        if (e.hp < e.maxHp) bar(c, pr.sx, pr.sy, 30, e.hp / e.maxHp, COL.red);
      } else if (e instanceof Npc) {
        const mk = world.questMarker(e);
        if (mk === "available") mark(c, pr.sx, pr.sy - 14, "!", COL.gold);
        else if (mk === "turnin") mark(c, pr.sx, pr.sy - 14, "?", COL.green);
        else if (e.role === "shop") mark(c, pr.sx, pr.sy - 14, "$", COL.gold);
        nameTag(c, pr.sx, pr.sy + 4, e.name, COL.parchment);
      } else if (e instanceof SimPlayer) {
        if (!e.dead && e.hp < e.maxHp) bar(c, pr.sx, pr.sy - 4, 26, e.hp / e.maxHp, COL.green);
        const tag = e.rec.guildTag ? `[${e.rec.guildTag}] ${e.rec.name}` : e.rec.name;
        nameTag(c, pr.sx, pr.sy + 6, tag, e.dead ? "#b9b3c4" : "#bfe0ff", `Lv ${e.rec.level}`);
        if (e.bubble) bubble(c, pr.sx, pr.sy - 22, e.bubble.text);
      }
    }

    // damage numbers
    for (const d of world.damageNumbers) {
      const pr = this.project(d.x * S, 1.1 + d.age * 1.8, d.y * S);
      if (!pr.on) continue;
      const a = Math.min(1, d.life * 2.2);
      c.globalAlpha = a; c.font = `bold ${d.big ? 22 : 15}px 'Segoe UI', sans-serif`;
      c.textAlign = "center"; c.textBaseline = "middle";
      c.lineWidth = 3; c.strokeStyle = "rgba(20,16,30,0.85)"; c.strokeText(d.text, pr.sx, pr.sy);
      c.fillStyle = d.color; c.fillText(d.text, pr.sx, pr.sy); c.globalAlpha = 1;
    }

    // particles
    for (const p of world.particles) {
      const pr = this.project(p.x * S, 0.4, p.y * S);
      if (!pr.on) continue;
      c.globalAlpha = Math.max(0, p.life / p.maxLife); c.fillStyle = p.color;
      const s = p.size * 1.4; c.fillRect(pr.sx - s / 2, pr.sy - s / 2, s, s); c.globalAlpha = 1;
    }

    // portal labels
    c.font = "bold 12px 'Segoe UI', sans-serif";
    for (const p of world.zone.portals) {
      const pr = this.project((p.x + p.w / 2), 1.6, (p.y + p.h / 2));
      if (pr.on) nameTag(c, pr.sx, pr.sy, p.label, COL.parchment);
    }

    // crosshair
    c.strokeStyle = "rgba(255,255,255,0.55)"; c.lineWidth = 2;
    const cx = this.overlay.width / 2, cy = this.overlay.height / 2;
    c.beginPath(); c.moveTo(cx - 8, cy); c.lineTo(cx - 3, cy); c.moveTo(cx + 3, cy); c.lineTo(cx + 8, cy);
    c.moveTo(cx, cy - 8); c.lineTo(cx, cy - 3); c.moveTo(cx, cy + 3); c.lineTo(cx, cy + 8); c.stroke();
  }

  releaseLook() { if (this.locked) document.exitPointerLock?.(); }
}

// ---- overlay drawing helpers ----------------------------------------------
function bar(c: CanvasRenderingContext2D, x: number, y: number, w: number, frac: number, color: string) {
  c.fillStyle = "rgba(0,0,0,0.5)"; c.fillRect(x - w / 2 - 1, y - 1, w + 2, 5);
  c.fillStyle = color; c.fillRect(x - w / 2, y, w * clamp(frac, 0, 1), 3);
}
function mark(c: CanvasRenderingContext2D, x: number, y: number, ch: string, color: string) {
  const b = Math.sin(performance.now() / 240) * 2;
  c.fillStyle = "rgba(20,16,30,0.65)"; c.beginPath(); c.arc(x, y - b, 9, 0, TAU); c.fill();
  c.fillStyle = color; c.font = "bold 14px 'Segoe UI', sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
  c.fillText(ch, x, y - b + 0.5);
}
function bubble(c: CanvasRenderingContext2D, x: number, y: number, text: string) {
  c.font = "11px 'Segoe UI', sans-serif";
  const w = Math.min(170, c.measureText(text).width + 16);
  const bx = x - w / 2, by = y - 22, h = 20;
  c.fillStyle = "rgba(244,233,208,0.96)";
  rr(c, bx, by, w, h, 6); c.fill();
  c.beginPath(); c.moveTo(x - 5, by + h); c.lineTo(x + 5, by + h); c.lineTo(x, by + h + 6); c.fill();
  c.fillStyle = COL.ink; c.textAlign = "center"; c.textBaseline = "middle";
  c.fillText(text.length > 30 ? text.slice(0, 29) + "…" : text, x, by + h / 2);
}
function rr(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function disposeObj(o: THREE.Object3D) {
  o.traverse((c: any) => { if (c.geometry) c.geometry.dispose?.(); if (c.material) { const m = c.material; Array.isArray(m) ? m.forEach((x) => x.dispose?.()) : m.dispose?.(); } });
}

// ---- foliage billboard sprites (side-on, transparent) ----------------------
const FOLIAGE: Record<string, { w: number; h: number }> = {
  Tree: { w: 1.8, h: 2.3 }, DarkTree: { w: 1.7, h: 2.5 }, Bush: { w: 1.05, h: 0.85 }, Flower: { w: 0.5, h: 0.55 },
};
function cv(w: number, h: number) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
function blob(x: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  for (const [dx, dy] of [[0, 0], [-r * 0.55, r * 0.15], [r * 0.55, r * 0.15], [0, -r * 0.45], [-r * 0.35, -r * 0.2], [r * 0.35, -r * 0.2]] as const) {
    x.beginPath(); x.arc(cx + dx, cy + dy, r * 0.62, 0, Math.PI * 2); x.fill();
  }
}
function makeTree(dark: boolean): HTMLCanvasElement {
  const c = cv(64, 84), x = c.getContext("2d")!;
  x.fillStyle = dark ? "#3a2c22" : COL.trunk; x.fillRect(28, 50, 9, 32);
  x.fillStyle = dark ? "#16303a" : COL.treeDark; blob(x, 32, 34, 27);
  x.fillStyle = dark ? COL.darkTree : COL.tree; blob(x, 32, 31, 22);
  x.fillStyle = dark ? "#2f5a62" : "#74b85a"; blob(x, 25, 25, 12);
  return c;
}
function makeBush(): HTMLCanvasElement {
  const c = cv(52, 40), x = c.getContext("2d")!;
  x.fillStyle = "#2f6230"; blob(x, 26, 26, 17);
  x.fillStyle = COL.bush; blob(x, 20, 22, 11); blob(x, 32, 24, 11);
  x.fillStyle = "#4f9a4a"; blob(x, 24, 19, 6);
  return c;
}
function makeFlower(): HTMLCanvasElement {
  const c = cv(28, 34), x = c.getContext("2d")!;
  x.strokeStyle = "#3f8a45"; x.lineWidth = 2.5; x.beginPath(); x.moveTo(14, 33); x.lineTo(14, 15); x.stroke();
  x.fillStyle = "#3f8a45"; x.beginPath(); x.ellipse(9, 22, 4, 6, -0.6, 0, Math.PI * 2); x.fill();
  x.fillStyle = COL.flowerB;
  for (let a = 0; a < 5; a++) { const ang = (a / 5) * Math.PI * 2; x.beginPath(); x.arc(14 + Math.cos(ang) * 5, 10 + Math.sin(ang) * 5, 4, 0, Math.PI * 2); x.fill(); }
  x.fillStyle = "#fff6cf"; x.beginPath(); x.arc(14, 10, 3, 0, Math.PI * 2); x.fill();
  return c;
}
function makeFoliageTextures(): Record<string, THREE.Texture> {
  const mk = (canvas: HTMLCanvasElement) => { const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.LinearFilter; return t; };
  return { Tree: mk(makeTree(false)), DarkTree: mk(makeTree(true)), Bush: mk(makeBush()), Flower: mk(makeFlower()) };
}
