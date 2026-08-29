// Rendering: fast schwarzer Screen. Der Ball glimmt schwach, berührte Wände
// leuchten kurz auf ("Echo") und verblassen wieder – so offenbart sich die Welt.

import type { World } from '../core/physics';
import { WORLD } from './palette';

export interface DrawOptions {
  debug?: boolean;
  revealAll?: boolean;
  now?: number;
}

interface Bucket {
  q: number;
  color: string;
  path: Path2D;
}

// Ab dieser Zoomstufe folgt die Kamera dem Ball statt die Welt einzupassen:
// mindestens so viele Zellen (à 100 Welteinheiten) passen auf die kurze Screenseite.
const VIEW_CELLS = 6.5;

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private scale = 1;
  private offsetX = 0;
  private offsetY = 0;
  private worldW = 0;
  private worldH = 0;
  private following = false;
  dpr = 1;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(innerWidth * dpr);
    this.canvas.height = Math.round(innerHeight * dpr);
    this.canvas.style.width = innerWidth + 'px';
    this.canvas.style.height = innerHeight + 'px';
    this.dpr = dpr;
    if (this.worldW) this.computeScale();
  }

  // Kleine Welten werden eingepasst; große bekommen eine feste Zoomstufe,
  // die Kamera folgt dann dem Ball (Multi-Screen-Maps).
  setWorld(worldW: number, worldH: number): void {
    this.worldW = worldW;
    this.worldH = worldH;
    this.computeScale();
  }

  private computeScale(): void {
    const margin = 24 * this.dpr;
    const fitScale = Math.min(
      (this.canvas.width - margin * 2) / this.worldW,
      (this.canvas.height - margin * 2) / this.worldH,
    );
    const followScale = Math.min(this.canvas.width, this.canvas.height) / (100 * VIEW_CELLS);
    this.following = fitScale < followScale;
    this.scale = this.following ? followScale : fitScale;
    if (!this.following) {
      this.offsetX = (this.canvas.width - this.worldW * this.scale) / 2;
      this.offsetY = (this.canvas.height - this.worldH * this.scale) / 2;
    }
  }

  // Pro Frame aufrufen: hält den Ball im Blick (weich, an den Weltgrenzen geklemmt).
  follow(bx: number, by: number, snap = false): void {
    if (!this.following) return;
    const margin = 24 * this.dpr;
    const clamp = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, v)));
    const tx = clamp(this.canvas.width / 2 - bx * this.scale, this.canvas.width - margin - this.worldW * this.scale, margin);
    const ty = clamp(this.canvas.height / 2 - by * this.scale, this.canvas.height - margin - this.worldH * this.scale, margin);
    const k = snap ? 1 : 0.12;
    this.offsetX += (tx - this.offsetX) * k;
    this.offsetY += (ty - this.offsetY) * k;
  }

  draw(world: World, opts: DrawOptions): void {
    const { debug = false, revealAll = false, now = performance.now() } = opts;
    const ctx = this.ctx;
    const s = this.scale,
      ox = this.offsetX,
      oy = this.offsetY;
    const tx = (x: number) => ox + x * s;
    const ty = (y: number) => oy + y * s;

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Wände & Trümmer zuerst, gruppiert nach quantisierter Alpha-Stufe und Farbe.
    // Eine Stufe wird als EIN Pfad gefüllt (Überlappungen innerhalb der Stufe
    // bleiben gleich hell), und 'destination-over' von hell nach dunkel sorgt
    // dafür, dass Kreuzungen zweier Stufen nicht aufaddieren.
    const buckets = new Map<string, Bucket>();
    const addRect = (r: { x: number; y: number; w: number; h: number }, alpha: number, color: string) => {
      const q = Math.min(1, Math.ceil(alpha * 20) / 20);
      if (q <= 0) return;
      const key = color + '|' + q;
      let b = buckets.get(key);
      if (!b) {
        b = { q, color, path: new Path2D() };
        buckets.set(key, b);
      }
      b.path.rect(tx(r.x), ty(r.y), r.w * s, r.h * s);
    };
    // litFrom verzögert das Aufleuchten: so breitet sich der Echo-Ping als Welle aus.
    const wallAlpha = (w: { litFrom?: number; litUntil?: number }): number => {
      if (debug || revealAll) return 0.55;
      if (w.litFrom && now < w.litFrom) return 0;
      if (w.litUntil && w.litUntil > now) return Math.min(1, (w.litUntil - now) / 1200) * 0.9;
      return 0;
    };
    for (const w of world.walls) {
      addRect(w, wallAlpha(w), w.hp !== undefined || w.cracked ? WORLD.brittle : WORLD.wall);
    }
    for (const d of world.debris) {
      if (d.litUntil && d.litUntil > now) {
        addRect(d, Math.min(1, (d.litUntil - now) / 1500) * 0.6, WORLD.brittle);
      }
    }
    ctx.globalCompositeOperation = 'destination-over';
    for (const b of [...buckets.values()].sort((a, c) => c.q - a.q)) {
      ctx.fillStyle = `rgba(${b.color}, ${b.q})`;
      ctx.fill(b.path);
    }

    // Hintergrund hinter alles, dann wieder normal zeichnen.
    ctx.fillStyle = WORLD.bgDeep;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.globalCompositeOperation = 'source-over';

    // Windzonen: nur bei Debug/Reveal als Fläche mit Richtungspfeil.
    if (debug || revealAll) {
      for (const z of world.windZones) {
        ctx.fillStyle = `rgba(${WORLD.wind}, 0.08)`;
        ctx.fillRect(tx(z.x), ty(z.y), z.w * s, z.h * s);
        const cx = tx(z.x + z.w / 2),
          cy = ty(z.y + z.h / 2);
        const f = Math.hypot(z.fx, z.fy) || 1;
        const dx = (z.fx / f) * z.w * s * 0.3,
          dy = (z.fy / f) * z.h * s * 0.3;
        ctx.strokeStyle = `rgba(${WORLD.wind}, 0.6)`;
        ctx.lineWidth = 2 * this.dpr;
        ctx.beginPath();
        ctx.moveTo(cx - dx, cy - dy);
        ctx.lineTo(cx + dx, cy + dy);
        ctx.lineTo(cx + dx - (dx + dy) * 0.35, cy + dy - (dy - dx) * 0.35);
        ctx.moveTo(cx + dx, cy + dy);
        ctx.lineTo(cx + dx - (dx - dy) * 0.35, cy + dy - (dy + dx) * 0.35);
        ctx.stroke();
      }
    }

    // Checkpoints: Ring – sichtbar bei Debug/Reveal oder kurz nach Aktivierung.
    for (const cp of world.checkpoints) {
      let alpha = 0;
      if (debug || revealAll) alpha = cp.reached ? 0.7 : 0.4;
      else if (cp.litUntil && cp.litUntil > now) alpha = Math.min(1, (cp.litUntil - now) / 2000);
      if (alpha <= 0.01) continue;
      ctx.strokeStyle = `rgba(${WORLD.checkpoint}, ${alpha})`;
      ctx.lineWidth = 3 * this.dpr;
      ctx.beginPath();
      ctx.arc(tx(cp.x), ty(cp.y), cp.r * s, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Löcher: tiefschwarz mit schwachem Rand – sichtbar bei Debug/Reveal, nach
    // einem Absturz oder Echo-Ping. Der Radius atmet mit dem Öffnungsgrad.
    for (const hole of world.holes) {
      let alpha = 0;
      if (debug || revealAll) alpha = 0.8;
      else if (hole.litFrom && now < hole.litFrom) alpha = 0;
      else if (hole.litUntil && hole.litUntil > now) alpha = Math.min(1, (hole.litUntil - now) / 1500);
      if (alpha <= 0.01) continue;
      const r = hole.r * s * (0.25 + 0.75 * (hole.openness ?? 1));
      ctx.fillStyle = WORLD.holeFill;
      ctx.beginPath();
      ctx.arc(tx(hole.x), ty(hole.y), r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(${WORLD.holeRim}, ${alpha * 0.7})`;
      ctx.lineWidth = 2 * this.dpr;
      ctx.stroke();
    }

    // Echo-Ping: expandierender Ring vom Ball aus.
    for (const p of world.pings) {
      const r = ((now - p.start) / 1000) * p.speed;
      const alpha = Math.max(0, 1 - r / p.range) * 0.6;
      if (alpha <= 0.01) continue;
      ctx.strokeStyle = `rgba(${WORLD.ping}, ${alpha})`;
      ctx.lineWidth = 2 * this.dpr;
      ctx.beginPath();
      ctx.arc(tx(p.x), ty(p.y), r * s, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Ziel: pulsierender Schein nur bei Debug/Reveal (sonst rein akustisch).
    if (debug || revealAll) {
      const g = world.goal;
      const pulse = 0.5 + 0.5 * Math.sin(now / 300);
      const r = g.r * s * (1.1 + pulse * 0.3);
      const grad = ctx.createRadialGradient(tx(g.x), ty(g.y), 0, tx(g.x), ty(g.y), r * 2);
      grad.addColorStop(0, `rgba(${WORLD.goal}, ${0.5 + pulse * 0.3})`);
      grad.addColorStop(1, `rgba(${WORLD.goal}, 0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(tx(g.x), ty(g.y), r * 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Ball mit sanftem Glow – der einzige ständige Lichtpunkt.
    const b = world.ball;
    const br = b.r * s;
    const glow = ctx.createRadialGradient(tx(b.x), ty(b.y), 0, tx(b.x), ty(b.y), br * 5);
    glow.addColorStop(0, `rgba(${WORLD.ballGlow}, 0.5)`);
    glow.addColorStop(1, `rgba(${WORLD.ballGlow}, 0)`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(tx(b.x), ty(b.y), br * 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = WORLD.ball;
    ctx.beginPath();
    ctx.arc(tx(b.x), ty(b.y), br, 0, Math.PI * 2);
    ctx.fill();
  }
}
