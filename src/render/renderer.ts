// Rendering: fast schwarzer Screen. Der Ball glimmt schwach, berührte Wände
// leuchten kurz auf ("Echo") und verblassen wieder – so offenbart sich die Welt.

import type { World } from '../core/physics';
import { WORLD } from './palette';

export interface DrawOptions {
  debug?: boolean;
  revealAll?: boolean;
  now?: number;
  /** Partner im Multiplayer: Position (Weltkoordinaten der EIGENEN Ebene
   *  nur wenn sameFloor), sonst wird der Halo an den Rand geklemmt. */
  buddy?: { x: number; y: number; sameFloor: boolean; floorLabel?: string } | null;
  /** Geist-Replay der Bestzeit: gleicher Halo wie der Partner, nur blasser. */
  ghost?: { x: number; y: number; sameFloor: boolean } | null;
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
  /** Editor-Modus: Transform kommt von außen (Pinch-Zoom/Pan) statt aus
   *  Einpassen/Folge-Kamera. */
  private manualView = false;
  dpr = 1;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.resize();
    // window.resize allein reicht nicht: Bei Rotation (und beim Einrichten des
    // Viewports in der installierten PWA) feuert es teils BEVOR das Layout
    // steht – das Backing behielte die alte Größe und alles wäre verzerrt.
    // Der ResizeObserver meldet das echte Element-Rect nach dem Layout.
    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => this.resize()).observe(this.canvas);
    }
  }

  resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    // Größe aus dem eigenen CSS-Rect (position: fixed; inset: 0): das ist der
    // Layout-Viewport – auch in der installierten PWA der ganze Bildschirm,
    // wo innerHeight/100vh je nach Plattform danebenliegen können.
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (w <= 0 || h <= 0) return;
    if (w === this.canvas.width && h === this.canvas.height && dpr === this.dpr) return;
    this.canvas.width = w;
    this.canvas.height = h;
    this.dpr = dpr;
    // Folge-Kamera zentriert sich über follow() im nächsten Frame neu.
    if (this.worldW) this.computeScale();
  }

  // Kleine Welten werden eingepasst; große bekommen eine feste Zoomstufe,
  // die Kamera folgt dann dem Ball (Multi-Screen-Maps).
  setWorld(worldW: number, worldH: number): void {
    this.worldW = worldW;
    this.worldH = worldH;
    this.computeScale();
  }

  /** Transform direkt setzen (scale = Canvas-Pixel pro Welteinheit). */
  setManualView(scale: number, offsetX: number, offsetY: number): void {
    this.manualView = true;
    this.scale = scale;
    this.offsetX = offsetX;
    this.offsetY = offsetY;
  }

  private computeScale(): void {
    if (this.manualView) return;
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
    if (this.manualView || !this.following) return;
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
    // Aufdeckbare Objekte: sichtbar bei Debug/Reveal oder nach Ping (litFrom/litUntil).
    const revealAlpha = (o: { litFrom?: number; litUntil?: number }, base: number): number => {
      if (debug || revealAll) return base;
      if (o.litFrom && now < o.litFrom) return 0;
      if (o.litUntil && o.litUntil > now) return Math.min(1, (o.litUntil - now) / 1200) * base;
      return 0;
    };
    for (const w of world.walls) {
      if (w.door?.open) continue; // offene Türen unten als Umriss, nicht als Fläche
      // Schiebewand: fährt sichtbar auf – die gezeichnete Länge schrumpft mit
      // dem Öffnungsgrad (verankert am n/w-Ende); voll offen nur als Umriss.
      if (w.slide) {
        const f = 1 - w.slide.openness;
        if (f > 0.02) {
          const rect = w.w > w.h ? { ...w, w: w.w * f } : { ...w, h: w.h * f };
          addRect(rect, wallAlpha(w), WORLD.slider);
        }
        continue;
      }
      const color = w.door ? WORLD.door : w.hp !== undefined || w.cracked ? WORLD.brittle : WORLD.wall;
      addRect(w, wallAlpha(w), color);
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

    // Wind- und Strömungszonen: nur bei Debug/Reveal, Fläche mit Richtungspfeil.
    if (debug || revealAll) {
      const drawZone = (z: { x: number; y: number; w: number; h: number; fx: number; fy: number }, color: string) => {
        ctx.fillStyle = `rgba(${color}, 0.08)`;
        ctx.fillRect(tx(z.x), ty(z.y), z.w * s, z.h * s);
        const cx = tx(z.x + z.w / 2),
          cy = ty(z.y + z.h / 2);
        const f = Math.hypot(z.fx, z.fy) || 1;
        const dx = (z.fx / f) * z.w * s * 0.3,
          dy = (z.fy / f) * z.h * s * 0.3;
        ctx.strokeStyle = `rgba(${color}, 0.6)`;
        ctx.lineWidth = 2 * this.dpr;
        ctx.beginPath();
        ctx.moveTo(cx - dx, cy - dy);
        ctx.lineTo(cx + dx, cy + dy);
        ctx.lineTo(cx + dx - (dx + dy) * 0.35, cy + dy - (dy - dx) * 0.35);
        ctx.moveTo(cx + dx, cy + dy);
        ctx.lineTo(cx + dx - (dx - dy) * 0.35, cy + dy - (dy + dx) * 0.35);
        ctx.stroke();
      };
      for (const z of world.windZones) drawZone(z, WORLD.wind);
      for (const z of world.currents) drawZone(z, WORLD.current);
      // Nebel: weicher Schleier; Eis: kalte Fläche mit Schlieren.
      for (const z of world.fogZones) {
        ctx.fillStyle = `rgba(${WORLD.fog}, 0.16)`;
        ctx.fillRect(tx(z.x), ty(z.y), z.w * s, z.h * s);
      }
      for (const z of world.ice) {
        ctx.fillStyle = `rgba(${WORLD.ice}, 0.12)`;
        ctx.fillRect(tx(z.x), ty(z.y), z.w * s, z.h * s);
        ctx.strokeStyle = `rgba(${WORLD.ice}, 0.4)`;
        ctx.lineWidth = 1.5 * this.dpr;
        ctx.beginPath();
        ctx.moveTo(tx(z.x + z.w * 0.25), ty(z.y + z.h * 0.7));
        ctx.lineTo(tx(z.x + z.w * 0.55), ty(z.y + z.h * 0.3));
        ctx.moveTo(tx(z.x + z.w * 0.55), ty(z.y + z.h * 0.78));
        ctx.lineTo(tx(z.x + z.w * 0.8), ty(z.y + z.h * 0.42));
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

    // Offene Coop-Türen und voll aufgefahrene Schiebewände: nur ein
    // gestrichelter Umriss – der Weg ist frei.
    for (const w of world.walls) {
      const openSlide = w.slide !== undefined && w.slide.openness > 0.98;
      if (!w.door?.open && !openSlide) continue;
      const alpha = debug || revealAll ? 0.5 : w.litUntil && w.litUntil > now ? 0.5 : 0.25;
      ctx.strokeStyle = `rgba(${openSlide ? WORLD.slider : WORLD.door}, ${alpha})`;
      ctx.lineWidth = 1.5 * this.dpr;
      ctx.setLineDash([6 * this.dpr, 6 * this.dpr]);
      ctx.strokeRect(tx(w.x), ty(w.y), w.w * s, w.h * s);
      ctx.setLineDash([]);
    }

    // Druckplatten: goldener Rahmen, gefüllt solange gehalten.
    for (const pl of world.plates) {
      const alpha = debug || revealAll ? 0.9 : revealAlpha(pl, 0.9);
      if (alpha <= 0.01 && !pl.held) continue;
      const a = Math.max(alpha, pl.held ? 0.9 : 0);
      const r = pl.r * s;
      ctx.strokeStyle = `rgba(${WORLD.plate}, ${a})`;
      ctx.lineWidth = 2.5 * this.dpr;
      ctx.strokeRect(tx(pl.x) - r, ty(pl.y) - r, r * 2, r * 2);
      if (pl.held) {
        ctx.fillStyle = `rgba(${WORLD.plate}, 0.35)`;
        ctx.fillRect(tx(pl.x) - r + 3, ty(pl.y) - r + 3, r * 2 - 6, r * 2 - 6);
      }
    }

    // Zeitschloss-Schalter: goldenes Zifferblatt; solange der Timer läuft,
    // leert sich der Bogen im Uhrzeigersinn.
    for (const sw of world.switches) {
      const active = sw.openUntil !== null && sw.openUntil > now;
      const alpha = debug || revealAll ? 0.9 : Math.max(revealAlpha(sw, 0.9), active ? 0.9 : 0);
      if (alpha <= 0.01) continue;
      const cx = tx(sw.x),
        cy = ty(sw.y);
      const r = sw.r * s;
      ctx.strokeStyle = `rgba(${WORLD.plate}, ${alpha})`;
      ctx.lineWidth = 2.5 * this.dpr;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      const frac = active ? Math.max(0, (sw.openUntil! - now) / (sw.durationS * 1000)) : 1;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx, cy - r * 0.75);
      if (active) ctx.arc(cx, cy, r * 0.75, -Math.PI / 2, -Math.PI / 2 + (1 - frac) * Math.PI * 2);
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


    // Glasboden: bernsteinfarbener Rahmen; geknackt kommen Sprunglinien dazu.
    // Zerbrochen (state 2) übernimmt das eingesetzte Loch die Darstellung.
    for (const g of world.glass) {
      if (g.state === 2) continue;
      const alpha = revealAlpha(g, 0.7);
      if (alpha <= 0.01) continue;
      ctx.strokeStyle = `rgba(${WORLD.brittle}, ${alpha})`;
      ctx.lineWidth = 1.5 * this.dpr;
      const pad = 6 * s;
      ctx.strokeRect(tx(g.x) + pad, ty(g.y) + pad, g.w * s - pad * 2, g.h * s - pad * 2);
      if (g.state === 1) {
        const cx = tx(g.x + g.w / 2),
          cy = ty(g.y + g.h / 2);
        ctx.beginPath();
        for (const [dx, dy] of [
          [0.3, -0.24],
          [-0.28, 0.18],
          [0.14, 0.3],
          [-0.2, -0.28],
        ] as const) {
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + g.w * s * dx, cy + g.h * s * dy);
        }
        ctx.stroke();
      }
    }

    // Sog-Anker: violetter Kern mit offenen Spiral-Ringen; im Debug/Reveal
    // zusätzlich der Wirkradius.
    for (const a of world.anchors) {
      const alpha = revealAlpha(a, 0.9);
      if (alpha <= 0.01) continue;
      const cx = tx(a.x),
        cy = ty(a.y);
      if (debug || revealAll) {
        ctx.strokeStyle = `rgba(${WORLD.anchor}, ${alpha * 0.25})`;
        ctx.lineWidth = 1.5 * this.dpr;
        ctx.beginPath();
        ctx.arc(cx, cy, a.r * s, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = `rgba(${WORLD.anchor}, ${alpha})`;
      ctx.beginPath();
      ctx.arc(cx, cy, 8 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(${WORLD.anchor}, ${alpha * 0.6})`;
      ctx.lineWidth = 2 * this.dpr;
      for (const rr of [20, 32, 44]) {
        ctx.beginPath();
        ctx.arc(cx, cy, rr * s, 0.4 + rr / 30, Math.PI * 2 - 0.4 + rr / 30);
        ctx.stroke();
      }
    }

    // Echo-Kristalle: vierstrahliger Teal-Stern.
    for (const c of world.crystals) {
      if (c.collected) continue;
      const alpha = revealAlpha(c, 0.95);
      if (alpha <= 0.01) continue;
      const cx = tx(c.x),
        cy = ty(c.y);
      const r = c.r * s;
      ctx.fillStyle = `rgba(${WORLD.crystal}, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.quadraticCurveTo(cx, cy, cx + r, cy);
      ctx.quadraticCurveTo(cx, cy, cx, cy + r);
      ctx.quadraticCurveTo(cx, cy, cx - r, cy);
      ctx.quadraticCurveTo(cx, cy, cx, cy - r);
      ctx.fill();
    }

    // Schlüssel: goldene Raute.
    for (const key of world.keys) {
      if (key.collected) continue;
      const alpha = revealAlpha(key, 0.95);
      if (alpha <= 0.01) continue;
      ctx.save();
      ctx.translate(tx(key.x), ty(key.y));
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = `rgba(${WORLD.key}, ${alpha})`;
      const s2 = key.r * s * 0.9;
      ctx.fillRect(-s2 / 2, -s2 / 2, s2, s2);
      ctx.restore();
    }

    // Gems: eisblaue Raute mit Ring.
    for (const gem of world.gems) {
      if (gem.collected) continue;
      const alpha = revealAlpha(gem, 0.95);
      if (alpha <= 0.01) continue;
      ctx.save();
      ctx.translate(tx(gem.x), ty(gem.y));
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = `rgba(${WORLD.gem}, ${alpha})`;
      const s2 = gem.r * s;
      ctx.fillRect(-s2 / 2, -s2 / 2, s2, s2);
      ctx.restore();
    }

    // Wächter: rote Scheibe; im Debug zusätzlich der Patrouillen-Pfad.
    for (const g of world.guards) {
      if (debug || revealAll) {
        ctx.strokeStyle = `rgba(${WORLD.guard}, 0.3)`;
        ctx.lineWidth = 2 * this.dpr;
        ctx.beginPath();
        g.waypoints.forEach((p, i) => (i ? ctx.lineTo(tx(p.x), ty(p.y)) : ctx.moveTo(tx(p.x), ty(p.y))));
        ctx.stroke();
      }
      const alpha = revealAlpha(g, 0.9);
      if (alpha <= 0.01) continue;
      const grad = ctx.createRadialGradient(tx(g.x), ty(g.y), 0, tx(g.x), ty(g.y), g.r * s * 2.2);
      grad.addColorStop(0, `rgba(${WORLD.guard}, ${alpha * 0.35})`);
      grad.addColorStop(1, `rgba(${WORLD.guard}, 0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(tx(g.x), ty(g.y), g.r * s * 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(${WORLD.guard}, ${alpha})`;
      ctx.beginPath();
      ctx.arc(tx(g.x), ty(g.y), g.r * s, 0, Math.PI * 2);
      ctx.fill();
    }

    // Horcher: orangerote Scheibe mit Lausch-Bögen (kein Patrouillen-Pfad –
    // er hat keinen).
    for (const l of world.listeners) {
      const alpha = revealAlpha(l, 0.9);
      if (alpha <= 0.01) continue;
      const cx = tx(l.x),
        cy = ty(l.y);
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, l.r * s * 2.2);
      grad.addColorStop(0, `rgba(${WORLD.listener}, ${alpha * 0.35})`);
      grad.addColorStop(1, `rgba(${WORLD.listener}, 0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, l.r * s * 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(${WORLD.listener}, ${alpha})`;
      ctx.beginPath();
      ctx.arc(cx, cy, l.r * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(${WORLD.listener}, ${alpha * 0.6})`;
      ctx.lineWidth = 2 * this.dpr;
      for (const rr of [1.5, 1.9]) {
        ctx.beginPath();
        ctx.arc(cx, cy, l.r * s * rr, -0.6, 0.6);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, l.r * s * rr, Math.PI - 0.6, Math.PI + 0.6);
        ctx.stroke();
      }
    }

    // Transporter: Doppelring mit Richtungs-Glyphe (▼ runter, ▲ hoch, ◆ Portal).
    for (const t of world.transporters) {
      const alpha = revealAlpha(t, 0.9);
      if (alpha <= 0.01) continue;
      const cx = tx(t.x),
        cy = ty(t.y);
      const r = t.r * s;
      ctx.strokeStyle = `rgba(${WORLD.portal}, ${alpha})`;
      ctx.lineWidth = 2.5 * this.dpr;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = `rgba(${WORLD.portal}, ${alpha * 0.5})`;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(${WORLD.portal}, ${alpha})`;
      const g = r * 0.3;
      ctx.beginPath();
      if (t.dir === 'down') {
        ctx.moveTo(cx - g, cy - g * 0.6);
        ctx.lineTo(cx + g, cy - g * 0.6);
        ctx.lineTo(cx, cy + g);
      } else if (t.dir === 'up') {
        ctx.moveTo(cx - g, cy + g * 0.6);
        ctx.lineTo(cx + g, cy + g * 0.6);
        ctx.lineTo(cx, cy - g);
      } else {
        ctx.moveTo(cx, cy - g);
        ctx.lineTo(cx + g, cy);
        ctx.lineTo(cx, cy + g);
        ctx.lineTo(cx - g, cy);
      }
      ctx.closePath();
      ctx.fill();
    }

    // Echo-Ping: expandierender Ring vom Ball aus. Radius geklemmt: der
    // rAF-Timestamp (Frame-Beginn) kann minimal VOR dem performance.now()
    // des auslösenden Inputs liegen – arc() wirft bei negativem Radius.
    for (const p of world.pings) {
      const r = Math.max(0, ((now - p.start) / 1000) * p.speed);
      const alpha = Math.max(0, 1 - r / p.range) * 0.6;
      if (alpha <= 0.01) continue;
      ctx.strokeStyle = `rgba(${WORLD.ping}, ${alpha})`;
      ctx.lineWidth = 2 * this.dpr;
      ctx.beginPath();
      ctx.arc(tx(p.x), ty(p.y), r * s, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Ziel: pulsierender Schein nur bei Debug/Reveal (sonst rein akustisch).
    // Auf Ebenen ohne Ziel (Multi-Floor) gibt es nichts zu zeichnen.
    if ((debug || revealAll) && world.goal) {
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

    // Halos: Geist-Replay (blass) unter dem Partner-Halo (Multiplayer) –
    // auf dem Screen als Ring an der Position, außerhalb (oder auf anderer
    // Ebene) an den Rand geklemmt.
    if (opts.ghost) this.drawHalo(opts.ghost, now, 0.45, 13);
    if (opts.buddy) this.drawHalo(opts.buddy, now, 1, 16, opts.buddy.floorLabel);
  }

  private drawHalo(
    pos: { x: number; y: number; sameFloor: boolean },
    now: number,
    alphaScale: number,
    radiusPx: number,
    floorLabel?: string,
  ): void {
    const ctx = this.ctx;
    const margin = 26 * this.dpr;
    let px = this.offsetX + pos.x * this.scale;
    let py = this.offsetY + pos.y * this.scale;
    const offscreen =
      !pos.sameFloor ||
      px < margin ||
      py < margin ||
      px > this.canvas.width - margin ||
      py > this.canvas.height - margin;
    if (offscreen) {
      px = Math.max(margin, Math.min(this.canvas.width - margin, px));
      py = Math.max(margin, Math.min(this.canvas.height - margin, py));
    }
    const r = radiusPx * this.dpr;
    const pulse = 0.7 + 0.3 * Math.sin(now / 250);
    const glow = ctx.createRadialGradient(px, py, 0, px, py, r * 2.4);
    glow.addColorStop(0, `rgba(${WORLD.buddy}, ${0.35 * pulse * alphaScale})`);
    glow.addColorStop(1, `rgba(${WORLD.buddy}, 0)`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(px, py, r * 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(${WORLD.buddy}, ${(offscreen ? 0.9 : 0.75) * alphaScale})`;
    ctx.lineWidth = 2.5 * this.dpr;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.stroke();
    if (floorLabel) {
      ctx.fillStyle = `rgba(${WORLD.buddy}, 0.9)`;
      ctx.font = `${11 * this.dpr}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(floorLabel, px, py + 4 * this.dpr);
    }
  }
}
