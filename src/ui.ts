// ============================================================================
// UI layer (DOM overlay): HUD, hotbar, chat feed, minimap, and modal panels
// for inventory, character, quests, leaderboard, shops, dialogue, map & help.
// ============================================================================
import { COL, TILE } from "./config";
import { ABILITIES } from "./combat";
import { CLASSES, levelFromXp } from "./progression";
import { addItem, drawItemIcon, equipBonus, ITEMS, RARITY_COL, removeItem, sellValue, SHOPS } from "./items";
import { QUESTS } from "./quests";
import { Npc } from "./entities";
import { GUILDS } from "./simulation";
import { GameUI, npcIdFor, World } from "./world";

const el = (tag: string, cls = "", html = "") => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

type Panel = "inventory" | "character" | "quests" | "leaderboard" | "shop" | "dialogue" | "map" | "help" | null;

export class UI implements GameUI {
  root = el("div", "ui");
  private hud = el("div", "hud");
  private overlay = el("div", "overlay hidden");
  private modal = el("div", "modal");
  private toasts = el("div", "toasts");
  private chatBox = el("div", "chat");
  private minimap = document.createElement("canvas");
  private hpFill = el("div", "bar-fill hp");
  private mpFill = el("div", "bar-fill mp");
  private xpFill = el("div", "bar-fill xp");
  private hpText = el("span", "bar-text");
  private mpText = el("span", "bar-text");
  private xpText = el("span", "bar-text");
  private nameEl = el("div", "p-name");
  private goldEl = el("div", "p-gold");
  private onlineEl = el("div", "p-online");
  private zoneEl = el("div", "p-zone");
  private hotbar = el("div", "hotbar");
  private vignette = el("div", "vignette");
  private levelBanner = el("div", "level-banner hidden");

  private panel: Panel = null;
  private dialogueNpc: Npc | null = null;
  private shopId: string | null = null;
  private toastList: { text: string; t: number; node: HTMLElement }[] = [];
  private chatVer = -1;
  private repaintT = 0;

  constructor(private world: World) {
    this.build();
    document.getElementById("app")!.appendChild(this.root);
    this.bindKeys();
    this.refresh();
  }

  // ---- build static DOM ---------------------------------------------------
  private build() {
    // player frame (top-left)
    const frame = el("div", "player-frame");
    frame.appendChild(this.nameEl);
    const bars = el("div", "bars");
    bars.appendChild(bar("hp-row", this.hpFill, this.hpText));
    bars.appendChild(bar("mp-row", this.mpFill, this.mpText));
    bars.appendChild(bar("xp-row", this.xpFill, this.xpText));
    frame.appendChild(bars);
    const meta = el("div", "p-meta");
    meta.append(this.goldEl, this.onlineEl);
    frame.appendChild(meta);

    // top-right cluster: zone + minimap + buttons
    const right = el("div", "right-cluster");
    this.zoneEl.className = "p-zone";
    this.minimap.width = 168; this.minimap.height = 132; this.minimap.className = "minimap";
    const btns = el("div", "panel-buttons");
    const mk = (label: string, key: string, p: Panel) => {
      const b = el("button", "pbtn", `${label}<kbd>${key}</kbd>`);
      b.onclick = () => this.toggle(p);
      return b;
    };
    btns.append(
      mk("Bag", "I", "inventory"), mk("Hero", "C", "character"), mk("Quests", "J", "quests"),
      mk("Ranks", "L", "leaderboard"), mk("Map", "M", "map"), mk("Help", "H", "help"),
    );
    right.append(this.zoneEl, this.minimap, btns);

    // chat (bottom-left)
    const chatWrap = el("div", "chat-wrap");
    chatWrap.appendChild(el("div", "chat-title", "World Chat"));
    chatWrap.appendChild(this.chatBox);

    this.hud.append(frame, right, chatWrap, this.hotbar);
    this.overlay.appendChild(this.modal);
    this.overlay.onclick = (e) => { if (e.target === this.overlay) this.closePanel(); };
    this.levelBanner.innerHTML = "";
    this.root.append(this.vignette, this.hud, this.toasts, this.levelBanner, this.overlay);
    this.buildHotbar();
  }

  private buildHotbar() {
    this.hotbar.innerHTML = "";
    const p = this.world.player;
    const slots: { id: string; key: string; label: string }[] = [
      { id: "__basic", key: "Space", label: "Attack" },
      { id: CLASSES[p.cls].abilities[0], key: "Q", label: ABILITIES[CLASSES[p.cls].abilities[0]].name },
      { id: CLASSES[p.cls].abilities[1], key: "E", label: ABILITIES[CLASSES[p.cls].abilities[1]].name },
      { id: "__potion", key: "R", label: "Potion" },
    ];
    for (const s of slots) {
      const slot = el("div", "slot");
      slot.dataset.id = s.id;
      const icon = el("div", "slot-icon");
      const color = s.id === "__basic" ? COL.parchment : s.id === "__potion" ? COL.red : ABILITIES[s.id]?.color ?? COL.gold;
      icon.style.background = color;
      icon.textContent = s.label[0];
      const cd = el("div", "slot-cd");
      const key = el("kbd", "slot-key", s.key);
      const name = el("div", "slot-name", s.label);
      slot.append(icon, cd, key, name);
      slot.title = s.id.startsWith("__") ? s.label : ABILITIES[s.id].desc;
      this.hotbar.appendChild(slot);
    }
  }

  // ---- GameUI interface ---------------------------------------------------
  isModalOpen() { return this.panel !== null; }

  toast(text: string) {
    const node = el("div", "toast", text);
    this.toasts.appendChild(node);
    this.toastList.push({ text, t: 4, node });
    requestAnimationFrame(() => node.classList.add("show"));
    if (this.toastList.length > 5) { const old = this.toastList.shift()!; old.node.remove(); }
  }

  onPlayerDamaged() { this.vignette.classList.add("hit"); setTimeout(() => this.vignette.classList.remove("hit"), 120); }

  onLevelUp(level: number) {
    this.levelBanner.textContent = `LEVEL ${level}`;
    this.levelBanner.classList.remove("hidden"); this.levelBanner.classList.add("pop");
    setTimeout(() => { this.levelBanner.classList.add("hidden"); this.levelBanner.classList.remove("pop"); }, 1600);
    this.buildHotbar();
  }

  refresh() {
    const p = this.world.player;
    this.nameEl.innerHTML = `${p.name} <span class="lv">Lv ${p.level} ${CLASSES[p.cls].name}</span>`;
    this.goldEl.innerHTML = `<b>${p.gold}</b> gold`;
    const online = this.world.sim.records.length + 1;
    this.onlineEl.innerHTML = `<span class="dot"></span>${online} online`;
    this.zoneEl.textContent = this.world.zone?.name ?? "";
    if (this.panel) this.renderPanel(); // keep open panel fresh
  }

  // ---- per-frame update ---------------------------------------------------
  update(dt: number) {
    const p = this.world.player;
    const s = p.stats;
    this.hpFill.style.width = `${Math.max(0, (s.hp / s.maxHp) * 100)}%`;
    this.mpFill.style.width = `${Math.max(0, (s.mp / s.maxMp) * 100)}%`;
    const lx = levelFromXp(p.xp);
    this.xpFill.style.width = `${(lx.into / lx.need) * 100}%`;
    this.hpText.textContent = `${Math.ceil(s.hp)} / ${s.maxHp}`;
    this.mpText.textContent = `${Math.ceil(s.mp)} / ${s.maxMp}`;
    this.xpText.textContent = `XP ${Math.floor(lx.into)} / ${lx.need}`;

    // hotbar cooldowns
    for (const slot of Array.from(this.hotbar.children) as HTMLElement[]) {
      const id = slot.dataset.id!;
      const cdEl = slot.querySelector(".slot-cd") as HTMLElement;
      if (id === "__basic") { cdEl.style.height = `${Math.max(0, (p.attackCd / 0.42) * 100)}%`; }
      else if (id === "__potion") { cdEl.style.height = "0%"; const has = p.inventory.some((st) => ITEMS[st.id]?.heal); slot.classList.toggle("empty", !has); }
      else { const ab = ABILITIES[id]; const frac = (p.abilityCd[id] ?? 0) / ab.cd; cdEl.style.height = `${Math.max(0, frac * 100)}%`; slot.classList.toggle("nomana", s.mp < ab.mp); }
    }

    // toasts fade
    for (const t of this.toastList) { t.t -= dt; if (t.t <= 0.6) t.node.classList.add("fade"); }
    while (this.toastList.length && this.toastList[0].t <= 0) { this.toastList.shift()!.node.remove(); }

    // chat feed
    if (this.world.sim.chat.version !== this.chatVer) { this.chatVer = this.world.sim.chat.version; this.renderChat(); }

    // minimap + open panels (throttled)
    this.repaintT -= dt;
    this.drawMinimap();
    if (this.repaintT <= 0) { this.repaintT = 0.6; if (this.panel === "leaderboard" || this.panel === "quests") this.renderPanel(); }
  }

  // ---- chat ---------------------------------------------------------------
  private renderChat() {
    const msgs = this.world.sim.chat.messages.slice(-40);
    this.chatBox.innerHTML = "";
    for (const m of msgs) {
      const line = el("div", `cmsg ${m.kind}`);
      if (m.kind === "system") line.innerHTML = `<span class="sys">✦ ${m.text}</span>`;
      else {
        const who = m.tag ? `<span class="gtag" style="color:${m.color}">[${m.tag}]</span> <span class="cauthor" style="color:${m.color}">${m.author}</span>` : `<span class="cauthor" style="color:${m.color}">${m.author}</span>`;
        const pre = m.kind === "lfg" ? `<span class="ck">[LFG]</span> ` : m.kind === "trade" ? `<span class="ck trade">[Trade]</span> ` : m.kind === "guild" ? `<span class="ck guild">[Guild]</span> ` : m.kind === "whisper" ? `<span class="ck wh">[whisper→you]</span> ` : "";
        line.innerHTML = `${pre}${who}: <span class="ctext">${esc(m.text)}</span>`;
      }
      this.chatBox.appendChild(line);
    }
    this.chatBox.scrollTop = this.chatBox.scrollHeight;
  }

  // ---- minimap ------------------------------------------------------------
  private drawMinimap() {
    const z = this.world.zone; if (!z?.bg) return;
    const c = this.minimap.getContext("2d")!;
    const W = this.minimap.width, H = this.minimap.height;
    c.clearRect(0, 0, W, H);
    const scale = Math.min(W / z.bg.width, H / z.bg.height);
    const ox = (W - z.bg.width * scale) / 2, oy = (H - z.bg.height * scale) / 2;
    c.imageSmoothingEnabled = true;
    c.drawImage(z.bg, ox, oy, z.bg.width * scale, z.bg.height * scale);
    c.fillStyle = "rgba(0,0,0,0.15)"; c.fillRect(0, 0, W, H);
    const mx = (wx: number, wy: number) => [ox + wx * scale, oy + wy * scale] as const;
    // portals
    for (const p of z.portals) { const [x, y] = mx((p.x + 0.5) * TILE, (p.y + 0.5) * TILE); dot(c, x, y, 2.5, COL.purple); }
    for (const e of this.world.entities) {
      const [x, y] = mx(e.x, e.y);
      if (e.kind === "monster") dot(c, x, y, 1.6, "#d2544a");
      else if (e.kind === "sim") dot(c, x, y, 1.8, "#5aa0ff");
      else if (e.kind === "npc") dot(c, x, y, 2, COL.gold);
    }
    const [px, py] = mx(this.world.player.x, this.world.player.y);
    dot(c, px, py, 3, "#fff"); dot(c, px, py, 1.6, COL.green);
    c.strokeStyle = "rgba(255,255,255,0.15)"; c.strokeRect(0.5, 0.5, W - 1, H - 1);
  }

  // ---- panels -------------------------------------------------------------
  private bindKeys() {
    window.addEventListener("keydown", (e) => {
      const k = e.key.toLowerCase();
      if (k === "escape") { if (this.panel) { e.preventDefault(); this.closePanel(); } return; }
      const map: Record<string, Panel> = { i: "inventory", c: "character", j: "quests", l: "leaderboard", m: "map", h: "help" };
      if (map[k] !== undefined && k in map) {
        // don't hijack typing (none here) — toggle panel
        e.preventDefault(); this.toggle(map[k]);
      }
    });
  }

  private toggle(p: Panel) {
    if (this.panel === p) { this.closePanel(); return; }
    this.panel = p; this.dialogueNpc = null;
    this.overlay.classList.remove("hidden");
    this.renderPanel();
  }
  private closePanel() { this.panel = null; this.shopId = null; this.dialogueNpc = null; this.overlay.classList.add("hidden"); }

  openDialogue(npc: Npc) {
    this.dialogueNpc = npc; this.panel = "dialogue";
    this.overlay.classList.remove("hidden"); this.renderPanel();
  }
  private openShop(shopId: string) { this.shopId = shopId; this.panel = "shop"; this.renderPanel(); }

  private renderPanel() {
    this.modal.innerHTML = "";
    switch (this.panel) {
      case "inventory": return this.renderInventory();
      case "character": return this.renderCharacter();
      case "quests": return this.renderQuests();
      case "leaderboard": return this.renderLeaderboard();
      case "shop": return this.renderShop();
      case "dialogue": return this.renderDialogue();
      case "map": return this.renderMap();
      case "help": return this.renderHelp();
    }
  }

  private header(title: string, sub = "") {
    const h = el("div", "modal-head");
    h.innerHTML = `<h2>${title}</h2>${sub ? `<span class="sub">${sub}</span>` : ""}`;
    const x = el("button", "close", "✕"); x.onclick = () => this.closePanel();
    h.appendChild(x);
    this.modal.appendChild(h);
  }

  private itemCell(id: string, qty: number, onClick: () => void, sub = "") {
    const it = ITEMS[id];
    const cell = el("div", "icell");
    cell.style.borderColor = RARITY_COL[it.rarity];
    const cv = document.createElement("canvas"); cv.width = 40; cv.height = 40; cv.className = "icell-canvas";
    drawItemIcon(cv.getContext("2d")!, 4, 4, it, 32);
    cell.appendChild(cv);
    if (qty > 1) cell.appendChild(el("span", "icell-qty", String(qty)));
    if (sub) cell.appendChild(el("span", "icell-sub", sub));
    cell.onclick = onClick;
    cell.onmouseenter = (e) => this.showTip(it, e);
    cell.onmousemove = (e) => this.moveTip(e);
    cell.onmouseleave = () => this.hideTip();
    return cell;
  }

  private renderInventory() {
    this.header("Backpack", `${this.world.player.gold} gold`);
    const p = this.world.player;
    const body = el("div", "inv-body");
    // equipment column
    const eqCol = el("div", "equip-col");
    eqCol.appendChild(el("div", "col-title", "Equipped"));
    for (const slot of ["weapon", "armor", "trinket"] as const) {
      const id = p.equipment[slot];
      const row = el("div", "equip-slot");
      row.appendChild(el("div", "slot-label", slot[0].toUpperCase() + slot.slice(1)));
      if (id) row.appendChild(this.itemCell(id, 1, () => { this.unequip(slot); }, "unequip"));
      else { const empty = el("div", "icell empty"); empty.textContent = "—"; row.appendChild(empty); }
      eqCol.appendChild(row);
    }
    // bag grid
    const grid = el("div", "inv-grid");
    if (!p.inventory.length) grid.appendChild(el("div", "empty-note", "Your bag is empty. Go slay something!"));
    for (const st of p.inventory) {
      const it = ITEMS[st.id];
      const action = it.type === "potion" ? "use" : (it.type === "weapon" || it.type === "armor" || it.type === "trinket") ? "equip" : "";
      grid.appendChild(this.itemCell(st.id, st.qty, () => {
        if (it.type === "potion") this.usePotion(st.id);
        else if (action === "equip") this.equip(st.id);
      }, action));
    }
    body.append(eqCol, grid);
    this.modal.appendChild(body);
    this.modal.appendChild(el("div", "hint", "Click an item to equip/use. Items also auto-loot when you walk over them."));
  }

  private renderCharacter() {
    this.header("Hero", `${this.world.player.name}`);
    const p = this.world.player, s = p.stats;
    const eb = equipBonus(p.equipment);
    const grid = el("div", "char-grid");
    const row = (label: string, val: string, bonus?: number) =>
      `<div class="crow"><span>${label}</span><b>${val}${bonus ? ` <i>(+${Math.round(bonus * 10) / 10})</i>` : ""}</b></div>`;
    grid.innerHTML =
      row("Class", CLASSES[p.cls].name) +
      row("Level", String(p.level)) +
      row("Max HP", String(s.maxHp), eb.maxHp) +
      row("Max MP", String(s.maxMp), eb.maxMp) +
      row("Attack", String(s.atk), eb.atk) +
      row("Defense", String(s.def), eb.def) +
      row("Crit", `${Math.round(s.crit * 100)}%`, eb.crit ? eb.crit * 100 : 0) +
      row("Speed", `${Math.round(s.speed * 100)}%`) +
      row("Monsters slain", String(Object.values(p.kills).reduce((a, b) => a + b, 0))) +
      row("Deaths", String(p.deaths));
    this.modal.appendChild(grid);
  }

  private renderQuests() {
    this.header("Quest Log");
    const q = this.world.quests, p = this.world.player;
    const list = el("div", "quest-list");
    const active = Object.keys(q.active);
    if (!active.length) list.appendChild(el("div", "empty-note", "No active quests. Visit the townsfolk (look for ! markers)."));
    for (const id of active) {
      const def = QUESTS[id];
      const prog = q.progress(id, this.world);
      const ready = prog >= def.obj.count;
      const card = el("div", `quest-card${ready ? " ready" : ""}`);
      card.innerHTML = `<div class="q-name">${def.name} ${ready ? '<span class="q-ready">READY</span>' : ""}</div>
        <div class="q-desc">${def.desc}</div>
        <div class="q-obj">${def.obj.label}: <b>${prog}/${def.obj.count}</b></div>
        <div class="q-rew">Reward: ${def.reward.xp} XP · ${def.reward.gold}g${(def.reward.items ?? []).map((i) => ` · ${i.qty}× ${ITEMS[i.id].name}`).join("")}</div>`;
      list.appendChild(card);
    }
    const done = [...q.completed];
    if (done.length) {
      list.appendChild(el("div", "col-title", "Completed"));
      for (const id of done) list.appendChild(el("div", "quest-done", `✓ ${QUESTS[id]?.name ?? id}`));
    }
    this.modal.appendChild(list);
  }

  private renderLeaderboard() {
    this.header("Leaderboard", "Ranked by total experience");
    const rows = this.world.sim.leaderboard();
    const table = el("div", "lb");
    table.appendChild(el("div", "lb-row lb-head", `<span>#</span><span>Player</span><span>Class</span><span>Lvl</span><span>Kills</span>`));
    rows.slice(0, 50).forEach((r, i) => {
      const guild = r.tag ? `<span class="gtag2">[${r.tag}]</span> ` : "";
      const dotc = r.online ? COL.green : "#555";
      const row = el("div", `lb-row${r.isPlayer ? " me" : ""}`,
        `<span class="rank">${i + 1}</span>
         <span class="lbname"><i class="odot" style="background:${dotc}"></i>${guild}${esc(r.name)}${r.isPlayer ? " <em>(you)</em>" : ""}</span>
         <span>${r.cls}</span><span>${r.level}</span><span>${r.kills}</span>`);
      table.appendChild(row);
    });
    this.modal.appendChild(table);
  }

  private renderShop() {
    const shop = SHOPS[this.shopId!];
    this.header(shop.name, `${this.world.player.gold} gold`);
    const p = this.world.player;
    const cols = el("div", "shop-cols");
    // buy
    const buy = el("div", "shop-col"); buy.appendChild(el("div", "col-title", "Buy"));
    for (const id of shop.stock) {
      const it = ITEMS[id];
      const r = el("div", "shop-item");
      const cv = document.createElement("canvas"); cv.width = 34; cv.height = 34; drawItemIcon(cv.getContext("2d")!, 1, 1, it, 32);
      const info = el("div", "si-info", `<b style="color:${RARITY_COL[it.rarity]}">${it.name}</b><span>${it.desc}</span>`);
      const btn = el("button", "buybtn", `${it.value}g`);
      btn.onclick = () => { if (p.gold >= it.value) { p.gold -= it.value; addItem(p.inventory, id, 1); this.toast(`Bought ${it.name}`); this.refresh(); } else this.toast("Not enough gold"); };
      r.append(cv, info, btn); r.onmouseenter = (e) => this.showTip(it, e); r.onmousemove = (e) => this.moveTip(e); r.onmouseleave = () => this.hideTip();
      buy.appendChild(r);
    }
    // sell
    const sell = el("div", "shop-col"); sell.appendChild(el("div", "col-title", "Sell"));
    if (!p.inventory.length) sell.appendChild(el("div", "empty-note", "Nothing to sell."));
    for (const st of [...p.inventory]) {
      const it = ITEMS[st.id];
      const r = el("div", "shop-item");
      const cv = document.createElement("canvas"); cv.width = 34; cv.height = 34; drawItemIcon(cv.getContext("2d")!, 1, 1, it, 32);
      const info = el("div", "si-info", `<b style="color:${RARITY_COL[it.rarity]}">${it.name}</b><span>${st.qty > 1 ? st.qty + " in bag" : it.desc}</span>`);
      const btn = el("button", "sellbtn", `${sellValue(st.id)}g`);
      btn.onclick = () => { removeItem(p.inventory, st.id, 1); p.gold += sellValue(st.id); this.toast(`Sold ${it.name}`); this.refresh(); };
      r.append(cv, info, btn);
      sell.appendChild(r);
    }
    cols.append(buy, sell);
    this.modal.appendChild(cols);
  }

  private renderDialogue() {
    const npc = this.dialogueNpc!;
    const id = npcIdFor(npc);
    const q = this.world.quests;
    this.header(npc.name);
    this.modal.appendChild(el("div", "npc-line", `“${npc.lines[Math.floor(Math.random() * npc.lines.length)]}”`));
    const box = el("div", "dlg-quests");
    // turn-ins
    for (const aid of Object.keys(q.active)) {
      if (QUESTS[aid].giver !== id) continue;
      const def = QUESTS[aid]; const ready = q.canTurnIn(aid, this.world);
      const card = el("div", `quest-card${ready ? " ready" : ""}`);
      card.innerHTML = `<div class="q-name">${def.name}</div><div class="q-obj">${def.obj.label}: <b>${q.progress(aid, this.world)}/${def.obj.count}</b></div>`;
      if (ready) { const b = el("button", "accept", "Complete ✓"); b.onclick = () => { q.turnIn(aid, this.world); this.renderPanel(); this.refresh(); }; card.appendChild(b); }
      box.appendChild(card);
    }
    // offers
    for (const oid of q.available(id, this.world)) {
      const def = QUESTS[oid];
      const card = el("div", "quest-card offer");
      card.innerHTML = `<div class="q-name">${def.name} <span class="q-new">NEW</span></div><div class="q-desc">${def.desc}</div>
        <div class="q-obj">${def.obj.label}: 0/${def.obj.count}</div>
        <div class="q-rew">Reward: ${def.reward.xp} XP · ${def.reward.gold}g${(def.reward.items ?? []).map((i) => ` · ${i.qty}× ${ITEMS[i.id].name}`).join("")}</div>`;
      const b = el("button", "accept", "Accept"); b.onclick = () => { q.accept(oid); this.toast(`Quest accepted: ${def.name}`); this.renderPanel(); };
      card.appendChild(b); box.appendChild(card);
    }
    this.modal.appendChild(box);
    if (npc.shopId) { const b = el("button", "shop-open", `Browse ${SHOPS[npc.shopId].name}`); b.onclick = () => this.openShop(npc.shopId!); this.modal.appendChild(b); }
  }

  private renderMap() {
    const z = this.world.zone;
    this.header("Map", z.name);
    const cv = document.createElement("canvas"); cv.width = 520; cv.height = 380; cv.className = "bigmap";
    const c = cv.getContext("2d")!;
    if (z.bg) {
      const scale = Math.min(cv.width / z.bg.width, cv.height / z.bg.height);
      const ox = (cv.width - z.bg.width * scale) / 2, oy = (cv.height - z.bg.height * scale) / 2;
      c.drawImage(z.bg, ox, oy, z.bg.width * scale, z.bg.height * scale);
      const mx = (wx: number, wy: number) => [ox + wx * scale, oy + wy * scale] as const;
      for (const p of z.portals) { const [x, y] = mx((p.x + 0.5) * TILE, (p.y + 0.5) * TILE); dot(c, x, y, 4, COL.purple); c.fillStyle = "#fff"; c.font = "10px sans-serif"; c.fillText(p.label, x + 6, y + 3); }
      for (const e of this.world.entities) { const [x, y] = mx(e.x, e.y); dot(c, x, y, e.kind === "npc" ? 3 : 2, e.kind === "monster" ? "#d2544a" : e.kind === "sim" ? "#5aa0ff" : COL.gold); }
      const [px, py] = mx(this.world.player.x, this.world.player.y); dot(c, px, py, 5, "#fff"); dot(c, px, py, 2.5, COL.green);
    }
    this.modal.appendChild(cv);
    this.modal.appendChild(el("div", "legend", `<i style="background:${COL.green}"></i>You &nbsp; <i style="background:#5aa0ff"></i>Players &nbsp; <i style="background:#d2544a"></i>Monsters &nbsp; <i style="background:${COL.gold}"></i>NPCs &nbsp; <i style="background:${COL.purple}"></i>Exits`));
  }

  private renderHelp() {
    this.header("How to Play", "Aethermoor — a Massively Singleplayer RPG");
    this.modal.appendChild(el("div", "help",
      `<div class="help-grid">
        <div><kbd>W A S D</kbd> / Arrows<span>Move</span></div>
        <div><kbd>Space</kbd> / Click<span>Basic attack (aims at cursor)</span></div>
        <div><kbd>Q</kbd> <kbd>E</kbd><span>Class abilities</span></div>
        <div><kbd>R</kbd><span>Quaff a potion</span></div>
        <div><kbd>F</kbd> / Enter<span>Talk to NPCs (! = quest)</span></div>
        <div><kbd>I C J L M H</kbd><span>Bag · Hero · Quests · Ranks · Map · Help</span></div>
        <div><kbd>Esc</kbd><span>Close panels</span></div>
      </div>
      <p>Hunt monsters in the <b>Greenfields</b>, <b>Darkwood</b> and <b>Sunken Ruins</b> to level up and gear out.
      The other adventurers you see are simulated — they hunt, level, chat and climb the leaderboard right alongside you.
      Beat them to the top, and slay the <b>Ancient Golem</b> deep in the Ruins.</p>
      <p class="dim">Your progress autosaves. Walk into an exit (purple) to travel between zones.</p>`));
  }

  // ---- item actions -------------------------------------------------------
  private equip(id: string) {
    const p = this.world.player; const it = ITEMS[id];
    const slot = it.type === "weapon" ? "weapon" : it.type === "armor" ? "armor" : "trinket";
    if (it.type !== "weapon" && it.type !== "armor" && it.type !== "trinket") return;
    const prev = p.equipment[slot];
    removeItem(p.inventory, id, 1);
    if (prev) addItem(p.inventory, prev, 1);
    p.equipment[slot] = id;
    this.world.recomputePlayerStats();
    this.toast(`Equipped ${it.name}`); this.refresh(); this.renderPanel();
  }
  private unequip(slot: "weapon" | "armor" | "trinket") {
    const p = this.world.player; const id = p.equipment[slot]; if (!id) return;
    addItem(p.inventory, id, 1); p.equipment[slot] = null;
    this.world.recomputePlayerStats(); this.refresh(); this.renderPanel();
  }
  private usePotion(id: string) {
    const p = this.world.player; const it = ITEMS[id];
    if (it.heal && p.stats.hp >= p.stats.maxHp && !it.mana) { this.toast("Already at full health"); return; }
    if (it.heal) p.stats.hp = Math.min(p.stats.maxHp, p.stats.hp + it.heal);
    if (it.mana) p.stats.mp = Math.min(p.stats.maxMp, p.stats.mp + it.mana);
    removeItem(p.inventory, id, 1);
    this.toast(`Used ${it.name}`); this.refresh(); this.renderPanel();
  }

  // ---- tooltip ------------------------------------------------------------
  private tip = el("div", "tooltip hidden");
  private showTip(it: typeof ITEMS[string], e: MouseEvent) {
    if (!this.tip.parentElement) this.root.appendChild(this.tip);
    const bonus = it.bonus ? Object.entries(it.bonus).map(([k, v]) => `<span class="tb">${k} ${v! > 0 ? "+" : ""}${k === "crit" || k === "speed" ? Math.round((v as number) * 100) + "%" : v}</span>`).join("") : "";
    const eff = it.heal ? `<div class="tb">Restores ${it.heal} HP</div>` : "";
    const mana = it.mana ? `<div class="tb">Restores ${it.mana} MP</div>` : "";
    this.tip.innerHTML = `<b style="color:${RARITY_COL[it.rarity]}">${it.name}</b><div class="ttype">${it.rarity} ${it.type}</div>${bonus}${eff}${mana}<div class="tdesc">${it.desc}</div><div class="tval">Value: ${it.value}g</div>`;
    this.tip.classList.remove("hidden"); this.moveTip(e);
  }
  private moveTip(e: MouseEvent) {
    this.tip.style.left = Math.min(e.clientX + 14, window.innerWidth - 220) + "px";
    this.tip.style.top = Math.min(e.clientY + 14, window.innerHeight - 160) + "px";
  }
  private hideTip() { this.tip.classList.add("hidden"); }
}

// ---- small helpers ---------------------------------------------------------
function bar(cls: string, fill: HTMLElement, text: HTMLElement) {
  const row = el("div", `bar ${cls}`);
  const track = el("div", "bar-track");
  track.append(fill, text);
  row.appendChild(track);
  return row;
}
function dot(c: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  c.fillStyle = color; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
}
function esc(s: string) { return s.replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m]!)); }

// keep GUILDS imported for potential future guild panel; reference to avoid unused warning
void GUILDS;
