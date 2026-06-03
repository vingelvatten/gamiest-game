// ============================================================================
// Engine core: math helpers, seeded RNG, input, camera, and the game loop.
// No game logic here — just the reusable machinery.
// ============================================================================

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const dist = (ax: number, ay: number, bx: number, by: number) =>
  Math.hypot(ax - bx, ay - by);
export const dist2 = (ax: number, ay: number, bx: number, by: number) => {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
};
export const TAU = Math.PI * 2;

// ---- Seeded RNG (mulberry32) ----------------------------------------------
export class RNG {
  private s: number;
  constructor(seed = (Math.random() * 2 ** 32) >>> 0) {
    this.s = seed >>> 0;
  }
  next(): number {
    this.s |= 0;
    this.s = (this.s + 0x6d2b79f5) | 0;
    let t = Math.imul(this.s ^ (this.s >>> 15), 1 | this.s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number) { return a + this.next() * (b - a); }
  int(a: number, b: number) { return Math.floor(this.range(a, b + 1)); }
  pick<U>(arr: readonly U[]): U { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p: number) { return this.next() < p; }
  shuffle<U>(arr: U[]): U[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}
// A handy shared rng for cosmetic randomness.
export const rng = new RNG();

// Deterministic 2D hash -> [0,1), used for stable per-tile texture detail.
export function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ---- Input -----------------------------------------------------------------
export class Input {
  down = new Set<string>();
  pressed = new Set<string>(); // edge: cleared each frame after consume
  mouse = { x: 0, y: 0, down: false, clicked: false };
  private bound = false;

  attach(canvas: HTMLCanvasElement) {
    if (this.bound) return;
    this.bound = true;
    window.addEventListener("keydown", (e) => {
      const k = e.key.toLowerCase();
      if (!this.down.has(k)) this.pressed.add(k);
      this.down.add(k);
      // Prevent page scroll on arrows/space while playing.
      if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k))
        e.preventDefault();
    });
    window.addEventListener("keyup", (e) => this.down.delete(e.key.toLowerCase()));
    window.addEventListener("blur", () => this.down.clear());
    canvas.addEventListener("mousemove", (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouse.x = (e.clientX - r.left) * (canvas.width / r.width);
      this.mouse.y = (e.clientY - r.top) * (canvas.height / r.height);
    });
    canvas.addEventListener("mousedown", () => { this.mouse.down = true; this.mouse.clicked = true; });
    window.addEventListener("mouseup", () => (this.mouse.down = false));
  }
  // call at end of frame
  endFrame() { this.pressed.clear(); this.mouse.clicked = false; }
  justPressed(k: string) { return this.pressed.has(k); }
  isDown(...keys: string[]) { return keys.some((k) => this.down.has(k)); }
}

// ---- Camera ----------------------------------------------------------------
export class Camera {
  x = 0; y = 0;
  shake = 0;
  constructor(public vw: number, public vh: number) {}

  follow(tx: number, ty: number, worldW: number, worldH: number, dt: number) {
    // Smooth follow, then clamp to world bounds.
    const targetX = tx - this.vw / 2;
    const targetY = ty - this.vh / 2;
    const k = 1 - Math.pow(0.0008, dt);
    this.x = lerp(this.x, targetX, k);
    this.y = lerp(this.y, targetY, k);
    this.x = clamp(this.x, 0, Math.max(0, worldW - this.vw));
    this.y = clamp(this.y, 0, Math.max(0, worldH - this.vh));
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 60);
  }
  addShake(amount: number) { this.shake = Math.min(14, this.shake + amount); }
  get ox() { return Math.round(this.x - (this.shake ? (Math.random() - 0.5) * this.shake : 0)); }
  get oy() { return Math.round(this.y - (this.shake ? (Math.random() - 0.5) * this.shake : 0)); }
}

// ---- Game loop -------------------------------------------------------------
export interface Scene {
  update(dt: number): void;
  render(ctx: CanvasRenderingContext2D): void;
}

export class GameLoop {
  private raf = 0;
  private last = 0;
  private acc = 0;
  readonly step = 1 / 60;
  running = false;

  constructor(private tick: (dt: number) => void) {}

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const frame = (now: number) => {
      if (!this.running) return;
      let frameTime = (now - this.last) / 1000;
      this.last = now;
      if (frameTime > 0.25) frameTime = 0.25; // avoid spiral after tab-out
      this.acc += frameTime;
      while (this.acc >= this.step) {
        this.tick(this.step);
        this.acc -= this.step;
      }
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }
  stop() { this.running = false; cancelAnimationFrame(this.raf); }
}
