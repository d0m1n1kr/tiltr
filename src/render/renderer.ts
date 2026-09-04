// Rendering: fast schwarzer Screen. Der Ball glimmt schwach, berührte Wände
// leuchten kurz auf ("Echo") und verblassen wieder – so offenbart sich die Welt.

import type { World } from '../core/physics';
import { BALL_R } from '../core/constants';
import { WORLD } from './palette';

export interface DrawOptions {
  debug?: boolean;
  revealAll?: boolean;
  /** Dämmerung (M43): Faktor 0–1 auf alles, was NUR wegen `revealAll`
   *  sichtbar ist – das Licht der Tutorial-Ebene blendet damit aus. Debug
   *  ignoriert ihn. */
  revealGain?: number;
  /** Aufleuchten neuer Elemente (M43): Diese Element-Typen (bzw. Wand-
   *  Varianten wallBrittle/wallAbsorb) werden unabhängig von Ping und Licht
   *  mit `gain` gezeichnet – der Spieler sieht EINMAL, was er ab jetzt nur
   *  noch hört. */
  spotlight?: { types: ReadonlySet<string>; gain: number } | null;
  now?: number;
  /** Partner im Multiplayer: Position (Weltkoordinaten der EIGENEN Ebene
   *  nur wenn sameFloor), sonst wird der Schein an den Rand geklemmt.
   *  `done` = schon im Ziel (Schein wechselt in die Zielfarbe). */
  buddy?: { x: number; y: number; sameFloor: boolean; floorLabel?: string; done?: boolean; solid?: boolean } | null;
  /** Geist-Replay der Bestzeit: gleicher Schein wie der Partner, nur blasser. */
  ghost?: { x: number; y: number; sameFloor: boolean } | null;
  /** Das eigene Ziel ist geschafft: Es leuchtet ruhig weiter, auch ohne
   *  Reveal – man SIEHT, dass man drin war, und darf trotzdem weiterrollen. */
  goalDone?: boolean;
  /** First Person (M23): Blickrichtung in rad – die WELT dreht sich um den
   *  Ball, sodass die Blickrichtung immer Screen-oben ist. 0/undefined =
   *  klassische Draufsicht. */
  heading?: number;
  /** Wegmarken (M89) auf der AKTIVEN Ebene: eigene durchgezogen, fremde
   *  gestrichelt – dieselbe Sprache wie die Landeplätze im Editor
   *  („gestrichelt heißt: nicht von mir"). Immer sichtbar, auch im Dunkeln:
   *  Eine Boje deckt nichts auf, sie ist selbst der einzige Punkt, den sie
   *  zeigt – und sie gehört den Spielern, nicht der Welt. */
  marks?: ReadonlyArray<{ x: number; y: number; mine: boolean }>;
  /** Kugel weglassen: Es gibt EINE Kugel für alle Ebenen (loader.ts setzt sie
   *  auf den Start von Ebene 1). Auf einer anderen Ebene wäre sie ein
   *  Phantom – im Editor sah sie dort aus wie ein eigener Startpunkt. */
  hideBall?: boolean;
}

/** Alpha des Ball-Glow-Kerns – der hellste ständige Punkt im Bild.
 *  Alles Fremde (Partner, Geist) bleibt darunter. */
export const BALL_CORE_ALPHA = 0.5;

/** Punkt um ein Zentrum drehen (Screen-Space). Rein exportiert, weil die
 *  Halo-Klemmung am Bildrand dieselbe Drehung braucht wie der Canvas-
 *  Transform – zwei Implementierungen wären zwei Meinungen. */
export function rotateAround(x: number, y: number, cx: number, cy: number, angle: number): { x: number; y: number } {
  const c = Math.cos(angle);
  const sn = Math.sin(angle);
  const dx = x - cx;
  const dy = y - cy;
  return { x: cx + dx * c - dy * sn, y: cy + dx * sn + dy * c };
}

export interface HaloLayer {
  /** Radius in Gerätepixeln */
  r: number;
  /** Alpha im Zentrum des Gradienten */
  alpha: number;
}

/** Der Partner ist ein SCHEIN, kein Objekt: nur weiche Lichtschichten, kein
 *  gezeichneter Rand. Ein harter Ring hat ihn vorher wie eine zweite Kugel
 *  aussehen lassen und mit dem eigenen Ball konkurriert – der Ball ist aber
 *  der einzige feste Körper im Bild.
 *
 *  Reine Funktion, damit die Absicht testbar bleibt (tests/render.test.ts):
 *  zwei Schichten, außen weiter und blasser als innen, alles unter
 *  BALL_CORE_ALPHA. Am Rand (andere Ebene / außerhalb) wird der Schein
 *  kompakter und etwas kräftiger, sonst findet man ihn nicht mehr. */
export function haloLayers(opts: {
  radiusPx: number;
  alphaScale: number;
  /** 0..1 Atem-Phase */
  pulse01: number;
  offscreen: boolean;
}): HaloLayer[] {
  const { radiusPx, alphaScale, pulse01, offscreen } = opts;
  const breath = 0.75 + 0.25 * pulse01;
  const edge = offscreen ? 1.6 : 1;
  const spread = offscreen ? 2.2 : 3.2;
  return [
    { r: radiusPx * spread, alpha: 0.13 * breath * alphaScale * edge },
    { r: radiusPx * 1.15, alpha: 0.3 * breath * alphaScale * edge },
  ];
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
  /** Hat der letzte Frame das Ziel-Licht gezeichnet? (Debug/Reveal oder
   *  „geschafft"). Der Renderer sagt selbst, was er gezeichnet hat – so ist
   *  es prüfbar, ohne Pixel zu lesen (siehe e2e/smoke.mjs, Lauf 9). */
  goalLit = false;
  /** Wurde der Partner im letzten Frame als fester Ball gezeichnet (M62)? */
  buddySolid = false;
  /** Hat der letzte Frame die Kugel gezeichnet? (Gegenstück zu `goalLit`:
   *  Der Renderer sagt selbst, was im Bild steht – prüfbar ohne Pixel.) */
  ballDrawn = false;
  /** First Person: feste Zoomstufe, Ball zentriert, Welt dreht sich. */
  private fpView = false;
  /** Aktive Ansichts-Drehung des letzten Frames (rad) + ihr Zentrum. */
  private rot = 0;
  private rotCx = 0;
  private rotCy = 0;
  /** Was der letzte Frame wirklich getan hat (Ansicht) – für den E2E-Haken:
   *  gemessen am echten Transform, kein Echo der Eingabe. */
  lastView: { rot: number; ballX: number; ballY: number; cw: number; ch: number } | null = null;

  setFpView(on: boolean): void {
    if (this.fpView === on) return;
    this.fpView = on;
    if (this.worldW) this.computeScale();
  }

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
    // FP: immer Folge-Kamera mit fester Zoomstufe – der Ball sitzt in der
    // Mitte, auch wenn die Welt klein ist (die Drehung braucht das Zentrum).
    this.following = this.fpView || fitScale < followScale;
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
    // FP: OHNE Weltrand-Klemmung – der Ball muss exakt zentrierbar sein,
    // sonst eiert das Drehzentrum. Jenseits des Randes ist eben Nichts.
    const tx = this.fpView
      ? this.canvas.width / 2 - bx * this.scale
      : clamp(this.canvas.width / 2 - bx * this.scale, this.canvas.width - margin - this.worldW * this.scale, margin);
    const ty = this.fpView
      ? this.canvas.height / 2 - by * this.scale
      : clamp(this.canvas.height / 2 - by * this.scale, this.canvas.height - margin - this.worldH * this.scale, margin);
    const k = snap ? 1 : 0.12;
    this.offsetX += (tx - this.offsetX) * k;
    this.offsetY += (ty - this.offsetY) * k;
  }

  draw(world: World, opts: DrawOptions): void {
    const { debug = false, revealAll = false, now = performance.now() } = opts;
    const gain = debug ? 1 : Math.max(0, Math.min(1, opts.revealGain ?? 1));
    const spot = opts.spotlight ?? null;
    const spotAlpha = (type: string, base: number): number => (spot && spot.types.has(type) ? base * spot.gain : 0);
    // Wand-Variante für das Aufleuchten: Tür, Schiebewand, Automat,
    // Schallschutz oder brüchig – eine schlichte Wand leuchtet nie auf.
    const wallType = (w: World['walls'][number]): string =>
      w.door
        ? 'door'
        : w.slide
          ? 'slidingWall'
          : w.jukebox !== undefined
            ? 'jukebox'
            : w.absorb
              ? 'wallAbsorb'
              : w.mirror
                ? 'wallMirror'
                : w.hp !== undefined
                  ? 'wallBrittle'
                  : 'wall';
    const ctx = this.ctx;
    const s = this.scale,
      ox = this.offsetX,
      oy = this.offsetY;
    const tx = (x: number) => ox + x * s;
    const ty = (y: number) => oy + y * s;
    // Fackeln (M66): Licht 0–1 an einem Weltpunkt – linear zum Rand hin aus.
    const torchGain = (x: number, y: number): number => {
      let g = 0;
      for (const tch of world.torches) {
        const d = Math.hypot(tch.x - x, tch.y - y);
        if (d < tch.r) g = Math.max(g, 1 - d / tch.r);
      }
      return g;
    };

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // First Person: die Welt dreht sich um den Ball (Blickrichtung = oben).
    // Gedreht wird ALLES Weltliche über den Canvas-Transform; Schein/Geist
    // werden danach in Screen-Koordinaten gezeichnet (rotateAround), damit
    // Randklemmung und Ebenen-Label aufrecht bleiben.
    this.rot = opts.heading ?? 0;
    this.rotCx = tx(world.ball.x);
    this.rotCy = ty(world.ball.y);
    ctx.save();
    if (this.rot !== 0) {
      ctx.translate(this.rotCx, this.rotCy);
      ctx.rotate(-this.rot);
      ctx.translate(-this.rotCx, -this.rotCy);
    }

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
    const wallAlpha = (w: World['walls'][number]): number => {
      if (debug || revealAll) return 0.55 * gain;
      let a = 0;
      if (w.litFrom && now < w.litFrom) a = 0;
      else if (w.litUntil && w.litUntil > now) a = Math.min(1, (w.litUntil - now) / 1200) * 0.9;
      return Math.max(a, spotAlpha(wallType(w), 0.55), 0.55 * torchGain(w.x + w.w / 2, w.y + w.h / 2));
    };
    // Aufdeckbare Objekte: sichtbar bei Debug/Reveal oder nach Ping (litFrom/litUntil).
    const revealAlpha = (o: { litFrom?: number; litUntil?: number; x?: number; y?: number }, base: number, type?: string): number => {
      if (debug || revealAll) return base * gain;
      let a = 0;
      if (o.litFrom && now < o.litFrom) a = 0;
      else if (o.litUntil && o.litUntil > now) a = Math.min(1, (o.litUntil - now) / 1200) * base;
      if (o.x !== undefined && o.y !== undefined) a = Math.max(a, base * torchGain(o.x, o.y));
      return type ? Math.max(a, spotAlpha(type, base)) : a;
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
      const color =
        w.jukebox !== undefined
          ? WORLD.jukebox
          : w.door
            ? WORLD.door
            : w.hp !== undefined || w.cracked
              ? WORLD.brittle
              : w.absorb
                ? WORLD.absorb
                : w.mirror
                  ? WORLD.mirror
                  : WORLD.wall;
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

    // Einseitig brüchig (M66): ein kleiner Keil auf der Bruchseite, sichtbar,
    // wann immer die Wand sichtbar ist – im Editor also immer.
    for (const w of world.walls) {
      if (w.hpSide === undefined || w.door?.open) continue;
      const a = wallAlpha(w);
      if (a <= 0.03) continue;
      const cx = w.x + w.w / 2;
      const cy = w.y + w.h / 2;
      const off = 16;
      const dx = w.hpSide === 'w' ? -off : w.hpSide === 'e' ? off : 0;
      const dy = w.hpSide === 'n' ? -off : w.hpSide === 's' ? off : 0;
      const px = tx(cx + dx);
      const py = ty(cy + dy);
      const k = 6 * s;
      ctx.fillStyle = `rgba(${WORLD.brittle}, ${Math.min(1, a * 1.6)})`;
      ctx.beginPath();
      // Spitze zeigt zur Wand (entgegen der Seite).
      ctx.moveTo(px - dx * 0.35 * s, py - dy * 0.35 * s);
      ctx.lineTo(px + (dy !== 0 ? k : 0) + (dx !== 0 ? dx * 0.2 * s : 0), py + (dx !== 0 ? k : 0) + (dy !== 0 ? dy * 0.2 * s : 0));
      ctx.lineTo(px - (dy !== 0 ? k : 0) + (dx !== 0 ? dx * 0.2 * s : 0), py - (dx !== 0 ? k : 0) + (dy !== 0 ? dy * 0.2 * s : 0));
      ctx.closePath();
      ctx.fill();
    }

    // Fackeln (M66): Lichtkreis und Flamme – immer sichtbar, sie SIND Licht.
    for (const tch of world.torches) {
      const px = tx(tch.x);
      const py = ty(tch.y);
      const glow = ctx.createRadialGradient(px, py, 0, px, py, tch.r * s);
      glow.addColorStop(0, `rgba(${WORLD.torch}, 0.16)`);
      glow.addColorStop(1, `rgba(${WORLD.torch}, 0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(px, py, tch.r * s, 0, Math.PI * 2);
      ctx.fill();
      if (debug || revealAll) {
        ctx.strokeStyle = `rgba(${WORLD.torch}, ${0.25 * gain})`;
        ctx.lineWidth = 1 * this.dpr;
        ctx.setLineDash([4 * this.dpr, 6 * this.dpr]);
        ctx.beginPath();
        ctx.arc(px, py, tch.r * s, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      const flick = 0.85 + 0.15 * Math.sin(now / 90 + tch.x);
      const fh = 14 * s * flick;
      ctx.fillStyle = `rgba(${WORLD.torch}, 0.95)`;
      ctx.beginPath();
      ctx.moveTo(px, py - fh);
      ctx.quadraticCurveTo(px + 7 * s, py - fh * 0.15, px, py + 6 * s);
      ctx.quadraticCurveTo(px - 7 * s, py - fh * 0.15, px, py - fh);
      ctx.fill();
    }

    // Wind- und Strömungszonen: nur bei Debug/Reveal (oder im Aufleuchten),
    // Fläche mit Richtungspfeil.
    const zoneGain = (type: string): number => (debug || revealAll ? gain : spot && spot.types.has(type) ? spot.gain : 0);
    if (debug || revealAll || spot) {
      const drawZone = (z: { x: number; y: number; w: number; h: number; fx: number; fy: number }, color: string, g: number) => {
        ctx.fillStyle = `rgba(${color}, ${0.08 * g})`;
        ctx.fillRect(tx(z.x), ty(z.y), z.w * s, z.h * s);
        const cx = tx(z.x + z.w / 2),
          cy = ty(z.y + z.h / 2);
        const f = Math.hypot(z.fx, z.fy) || 1;
        const dx = (z.fx / f) * z.w * s * 0.3,
          dy = (z.fy / f) * z.h * s * 0.3;
        ctx.strokeStyle = `rgba(${color}, ${0.6 * g})`;
        ctx.lineWidth = 2 * this.dpr;
        ctx.beginPath();
        ctx.moveTo(cx - dx, cy - dy);
        ctx.lineTo(cx + dx, cy + dy);
        ctx.lineTo(cx + dx - (dx + dy) * 0.35, cy + dy - (dy - dx) * 0.35);
        ctx.moveTo(cx + dx, cy + dy);
        ctx.lineTo(cx + dx - (dx - dy) * 0.35, cy + dy - (dy + dx) * 0.35);
        ctx.stroke();
      };
      const gWind = zoneGain('windZone'),
        gCur = zoneGain('current'),
        gFog = zoneGain('fogZone'),
        gIce = zoneGain('ice'),
        gRev = zoneGain('reverbZone');
      // Hallraum (M46): luftige Fläche mit Nachhall-Bögen.
      if (gRev > 0)
        for (const z of world.reverbZones) {
          ctx.fillStyle = `rgba(${WORLD.reverb}, ${0.1 * gRev})`;
          ctx.fillRect(tx(z.x), ty(z.y), z.w * s, z.h * s);
          ctx.strokeStyle = `rgba(${WORLD.reverb}, ${0.45 * gRev})`;
          ctx.lineWidth = 1.5 * this.dpr;
          for (const rr of [0.18, 0.3, 0.42]) {
            ctx.beginPath();
            ctx.arc(tx(z.x + z.w * 0.3), ty(z.y + z.h / 2), z.h * s * rr, -Math.PI / 2, Math.PI / 2);
            ctx.stroke();
          }
        }
      if (gWind > 0) for (const z of world.windZones) drawZone(z, WORLD.wind, gWind);
      if (gCur > 0) for (const z of world.currents) drawZone(z, WORLD.current, gCur);
      // Nebel: weicher Schleier; Eis: kalte Fläche mit Schlieren.
      if (gFog > 0)
        for (const z of world.fogZones) {
          ctx.fillStyle = `rgba(${WORLD.fog}, ${0.16 * gFog})`;
          ctx.fillRect(tx(z.x), ty(z.y), z.w * s, z.h * s);
        }
      if (gIce > 0) for (const z of world.ice) {
        ctx.fillStyle = `rgba(${WORLD.ice}, ${0.12 * gIce})`;
        ctx.fillRect(tx(z.x), ty(z.y), z.w * s, z.h * s);
        ctx.strokeStyle = `rgba(${WORLD.ice}, ${0.4 * gIce})`;
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
      if (debug || revealAll) alpha = (cp.reached ? 0.7 : 0.4) * gain;
      else if (cp.litUntil && cp.litUntil > now) alpha = Math.min(1, (cp.litUntil - now) / 2000);
      alpha = Math.max(alpha, spotAlpha('checkpoint', 0.4), 0.4 * torchGain(cp.x, cp.y));
      if (alpha <= 0.01) continue;
      ctx.strokeStyle = `rgba(${WORLD.checkpoint}, ${alpha})`;
      ctx.lineWidth = 3 * this.dpr;
      ctx.beginPath();
      ctx.arc(tx(cp.x), ty(cp.y), cp.r * s, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Wegmarken (M89): kleiner Kreide-Ring. Eigene durchgezogen, fremde
    // gestrichelt; beide blass, denn sie sollen den Weg zeigen, nicht ihn
    // überstrahlen. Der Klang ist ihr Hauptkanal (audio.markTick).
    for (const m of opts.marks ?? []) {
      ctx.strokeStyle = `rgba(${WORLD.mark}, ${m.mine ? 0.75 : 0.55})`;
      ctx.lineWidth = 2 * this.dpr;
      ctx.setLineDash(m.mine ? [] : [4 * this.dpr, 4 * this.dpr]);
      ctx.beginPath();
      ctx.arc(tx(m.x), ty(m.y), 11 * s, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      // Ein Punkt in der Mitte: In der Bewegung erkennt man den Ring sonst
      // schlecht von einem Checkpoint.
      ctx.fillStyle = `rgba(${WORLD.mark}, ${m.mine ? 0.8 : 0.5})`;
      ctx.beginPath();
      ctx.arc(tx(m.x), ty(m.y), 2.5 * this.dpr, 0, Math.PI * 2);
      ctx.fill();
    }

    // Offene Coop-Türen und voll aufgefahrene Schiebewände: nur ein
    // gestrichelter Umriss – der Weg ist frei.
    for (const w of world.walls) {
      const openSlide = w.slide !== undefined && w.slide.openness > 0.98;
      if (!w.door?.open && !openSlide) continue;
      const alpha = debug || revealAll ? 0.5 * gain : w.litUntil && w.litUntil > now ? 0.5 : 0.25;
      ctx.strokeStyle = `rgba(${openSlide ? WORLD.slider : WORLD.door}, ${alpha})`;
      ctx.lineWidth = 1.5 * this.dpr;
      ctx.setLineDash([6 * this.dpr, 6 * this.dpr]);
      ctx.strokeRect(tx(w.x), ty(w.y), w.w * s, w.h * s);
      ctx.setLineDash([]);
    }

    // Druckplatten: goldener Rahmen, gefüllt solange gehalten.
    for (const pl of world.plates) {
      const alpha = debug || revealAll ? 0.9 * gain : revealAlpha(pl, 0.9, 'plate');
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
      const alpha = debug || revealAll ? 0.9 * gain : Math.max(revealAlpha(sw, 0.9, 'timedSwitch'), active ? 0.9 : 0);
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
      if (debug || revealAll) alpha = 0.8 * gain;
      else if (hole.litFrom && now < hole.litFrom) alpha = 0;
      else if (hole.litUntil && hole.litUntil > now) alpha = Math.min(1, (hole.litUntil - now) / 1500);
      alpha = Math.max(alpha, spotAlpha(hole.roam ? 'roamingHole' : 'hole', 0.8), 0.8 * torchGain(hole.x, hole.y));
      if (alpha <= 0.01) continue;
      // Wanderloch (M46): im Debug/Reveal die Strecke wie beim Wächter.
      if (hole.roam && (debug || revealAll)) {
        ctx.strokeStyle = `rgba(${WORLD.holeRim}, ${0.3 * gain})`;
        ctx.lineWidth = 2 * this.dpr;
        ctx.beginPath();
        hole.roam.waypoints.forEach((p, i) => (i ? ctx.lineTo(tx(p.x), ty(p.y)) : ctx.moveTo(tx(p.x), ty(p.y))));
        ctx.stroke();
      }
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
      const alpha = revealAlpha(g, 0.7, 'glass');
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

    // Jukebox: Der Kasten selbst ist eine Wand (oben mitgezeichnet, in
    // Magenta-Rosa). Hier kommen die beiden „Lautsprecher" darauf – und sie
    // ATMEN im Takt des laufenden Titels. Der Takt kommt aus `bpm`, nicht aus
    // der Audio-Uhr: Ein Blinken muss nicht sample-genau sein, und der
    // Renderer soll nichts über den Musik-Bus wissen.
    for (const j of world.jukeboxes) {
      const alpha = revealAlpha(j, 0.95, 'jukebox');
      if (alpha <= 0.01) continue;
      // Ausschlag auf dem Schlag, Abklingen dazwischen (kein Sinus – der
      // wirkt wie Wabern, nicht wie Puls).
      const beat = j.bpm ? 1 - (((now / 1000) * j.bpm) / 60) % 1 : 0;
      const pulse = j.bpm ? 0.75 + beat ** 3 * 0.5 : 1;
      ctx.fillStyle = `rgba(${WORLD.jukebox}, ${alpha})`;
      for (const fy of [0.34, 0.68]) {
        ctx.beginPath();
        ctx.arc(tx(j.bx + j.bw / 2), ty(j.by + j.bh * fy), j.bw * 0.17 * s * pulse, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Sog-Anker: violetter Kern mit offenen Spiral-Ringen; im Debug/Reveal
    // zusätzlich der Wirkradius.
    for (const a of world.anchors) {
      const alpha = revealAlpha(a, 0.9, 'anchor');
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
      const alpha = revealAlpha(c, 0.95, 'echoCrystal');
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

    // Schlüssel: goldene Raute; die Stimmgabel (M45) als goldenes Y.
    for (const key of world.keys) {
      if (key.collected) continue;
      const alpha = revealAlpha(key, 0.95, 'key');
      if (alpha <= 0.01) continue;
      ctx.save();
      ctx.translate(tx(key.x), ty(key.y));
      if (key.voice === 'fork') {
        const r = key.r * s;
        ctx.strokeStyle = `rgba(${WORLD.key}, ${alpha})`;
        ctx.lineWidth = 3 * this.dpr;
        ctx.beginPath();
        ctx.moveTo(0, r);
        ctx.lineTo(0, 0);
        ctx.moveTo(-r * 0.5, -r);
        ctx.lineTo(-r * 0.5, -r * 0.2);
        ctx.quadraticCurveTo(0, r * 0.15, r * 0.5, -r * 0.2);
        ctx.lineTo(r * 0.5, -r);
        ctx.stroke();
      } else {
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = `rgba(${WORLD.key}, ${alpha})`;
        const s2 = key.r * s * 0.9;
        ctx.fillRect(-s2 / 2, -s2 / 2, s2, s2);
      }
      ctx.restore();
    }

    // Rollstein (M47): gerundeter Kasten in Steingrau – ein Körper, der sich
    // schieben lässt; versunkene Steine sind weg.
    for (const st of world.boulders) {
      if (st.sunk) continue;
      const alpha = Math.max(revealAlpha(st, 0.9, 'boulder'), st.move ? 0.6 : 0);
      if (alpha <= 0.01) continue;
      const half = (st.size * s) / 2;
      const x = tx(st.x) - half,
        y = ty(st.y) - half,
        w2 = half * 2,
        r = half * 0.4;
      ctx.fillStyle = `rgba(${WORLD.boulder}, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w2, y, x + w2, y + w2, r);
      ctx.arcTo(x + w2, y + w2, x, y + w2, r);
      ctx.arcTo(x, y + w2, x, y, r);
      ctx.arcTo(x, y, x + w2, y, r);
      ctx.closePath();
      ctx.fill();
    }

    // Lockglocke (M46): Messing-Glocke; klingend mit Ringen.
    for (const bl of world.bells) {
      const ringing = bl.ringLeft > 0;
      const alpha = Math.max(revealAlpha(bl, 0.95, 'bell'), ringing ? 0.9 : 0);
      if (alpha <= 0.01) continue;
      const cx = tx(bl.x),
        cy = ty(bl.y),
        r = bl.r * s;
      ctx.fillStyle = `rgba(${WORLD.bell}, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.45, cy - r);
      ctx.lineTo(cx + r * 0.45, cy - r);
      ctx.lineTo(cx + r * 0.9, cy + r * 0.6);
      ctx.lineTo(cx - r * 0.9, cy + r * 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy + r * 0.85, r * 0.2, 0, Math.PI * 2);
      ctx.fill();
      if (ringing) {
        const k = 1 - bl.ringLeft / bl.ringS;
        ctx.strokeStyle = `rgba(${WORLD.bell}, ${(1 - k) * 0.6})`;
        ctx.lineWidth = 2 * this.dpr;
        ctx.beginPath();
        ctx.arc(cx, cy, r * (1.3 + k * 3), 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Sanduhr (M45): zwei Dreiecke in Sandfarbe.
    for (const hg of world.hourglasses) {
      if (hg.collected) continue;
      const alpha = revealAlpha(hg, 0.95, 'hourglass');
      if (alpha <= 0.01) continue;
      const cx = tx(hg.x),
        cy = ty(hg.y),
        r = hg.r * s;
      ctx.fillStyle = `rgba(${WORLD.hourglass}, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.7, cy - r);
      ctx.lineTo(cx + r * 0.7, cy - r);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx + r * 0.7, cy + r);
      ctx.lineTo(cx - r * 0.7, cy + r);
      ctx.lineTo(cx, cy);
      ctx.closePath();
      ctx.fill();
    }

    // Gems: eisblaue Raute mit Ring.
    for (const gem of world.gems) {
      if (gem.collected) continue;
      const alpha = revealAlpha(gem, 0.95, 'gem');
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
        ctx.strokeStyle = `rgba(${WORLD.guard}, ${0.3 * gain})`;
        ctx.lineWidth = 2 * this.dpr;
        ctx.beginPath();
        g.waypoints.forEach((p, i) => (i ? ctx.lineTo(tx(p.x), ty(p.y)) : ctx.moveTo(tx(p.x), ty(p.y))));
        ctx.stroke();
      }
      const alpha = revealAlpha(g, 0.9, 'guard') * (g.sleeper && g.sleeper.awakeLeft <= 0 ? 0.6 : 1);
      if (alpha <= 0.01) continue;
      // Schläfer (M45): schlafend gedämpft, der Schein atmet langsam.
      const breath = g.sleeper && g.sleeper.awakeLeft <= 0 ? 1.9 + 0.3 * Math.sin(now / 700) : 2.2;
      const grad = ctx.createRadialGradient(tx(g.x), ty(g.y), 0, tx(g.x), ty(g.y), g.r * s * breath);
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
      const alpha = revealAlpha(l, 0.9, 'listener');
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
      const alpha = revealAlpha(t, 0.9, 'transporter');
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
    this.goalLit = (debug || revealAll || opts.goalDone === true) && world.goal !== null && world.goal !== undefined;
    if (this.goalLit && world.goal) {
      const g = world.goal;
      // Geschafft: ruhiges, langsames Leuchten statt des schnellen
      // Reveal-Pulses – eine Bestätigung, kein Wegweiser.
      const calm = opts.goalDone === true && !debug && !revealAll;
      const pulse = calm ? 0.25 + 0.15 * Math.sin(now / 700) : 0.5 + 0.5 * Math.sin(now / 300);
      const r = g.r * s * (1.1 + pulse * 0.3);
      // Dämmerung: auch der Ziel-Schein geht mit dem Licht aus (ein fertiges
      // Ziel leuchtet unabhängig davon ruhig weiter).
      const gg = opts.goalDone === true || debug ? 1 : gain;
      const grad = ctx.createRadialGradient(tx(g.x), ty(g.y), 0, tx(g.x), ty(g.y), r * 2);
      grad.addColorStop(0, `rgba(${WORLD.goal}, ${(0.5 + pulse * 0.3) * gg})`);
      grad.addColorStop(1, `rgba(${WORLD.goal}, 0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(tx(g.x), ty(g.y), r * 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Ball mit sanftem Glow – der einzige ständige Lichtpunkt.
    const b = world.ball;
    this.ballDrawn = opts.hideBall !== true;
    if (this.ballDrawn) {
      const br = b.r * s;
      const glow = ctx.createRadialGradient(tx(b.x), ty(b.y), 0, tx(b.x), ty(b.y), br * 5);
      glow.addColorStop(0, `rgba(${WORLD.ballGlow}, ${BALL_CORE_ALPHA})`);
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

    ctx.restore();
    this.lastView = { rot: this.rot, ballX: this.rotCx, ballY: this.rotCy, cw: this.canvas.width, ch: this.canvas.height };

    // Schein: Geist-Replay (blasser) unter dem Partner (Multiplayer) – an
    // seiner Position, außerhalb (oder auf anderer Ebene) an den Rand
    // geklemmt. Kein Rand, kein Körper: nur Licht. Gezeichnet NACH dem
    // restore: die Klemmung rechnet in Screen-Koordinaten.
    if (opts.ghost) this.drawHalo(opts.ghost, now, 0.45, 13);
    // Partner (M62): Auf einer HELLEN Ebene im Coop sieht man alles – dann
    // auch den Partner als festen roten Ball, nicht als Schein. Die Regel
    // „der eigene Ball ist der einzige Körper" gilt für die dunkle Welt, in
    // der Licht eine Information ist; im Hellen wäre der Schein nur vage.
    this.buddySolid = opts.buddy?.solid === true && opts.buddy.sameFloor;
    if (opts.buddy && this.buddySolid) this.drawPartnerBall(opts.buddy, now, opts.buddy.done === true);
    else if (opts.buddy) this.drawHalo(opts.buddy, now, 1, 16, opts.buddy.floorLabel, opts.buddy.done === true);
  }

  /** Fester Partner-Ball (M62): Kugel in Partner-Rot mit weichem Glow, in
   *  derselben Größe wie der eigene Ball; im Ziel ein ruhiger Ring in der
   *  Zielfarbe – er rollt weiter, man sieht aber, dass er durch ist. */
  private drawPartnerBall(pos: { x: number; y: number }, now: number, done: boolean): void {
    const ctx = this.ctx;
    // Weltpunkt -> Screen wie beim Schein: linear plus FP-Drehung um den Ball.
    const lin = { x: this.offsetX + pos.x * this.scale, y: this.offsetY + pos.y * this.scale };
    const p = this.rot === 0 ? lin : rotateAround(lin.x, lin.y, this.rotCx, this.rotCy, -this.rot);
    const br = BALL_R * this.scale;
    const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, br * 4);
    glow.addColorStop(0, `rgba(${WORLD.partner}, 0.45)`);
    glow.addColorStop(1, `rgba(${WORLD.partner}, 0)`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(p.x, p.y, br * 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgb(${WORLD.partner})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, br, 0, Math.PI * 2);
    ctx.fill();
    if (done) {
      ctx.strokeStyle = `rgba(${WORLD.goal}, ${0.6 + 0.3 * Math.sin(now / 700)})`;
      ctx.lineWidth = 2 * this.dpr;
      ctx.beginPath();
      ctx.arc(p.x, p.y, br * 1.6, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private drawHalo(
    pos: { x: number; y: number; sameFloor: boolean },
    now: number,
    alphaScale: number,
    radiusPx: number,
    floorLabel?: string,
    done = false,
  ): void {
    const ctx = this.ctx;
    const margin = 26 * this.dpr;
    // Weltpunkt -> Screen: linearer Transform plus die FP-Drehung um den Ball.
    const lin = { x: this.offsetX + pos.x * this.scale, y: this.offsetY + pos.y * this.scale };
    const r0 = this.rot === 0 ? lin : rotateAround(lin.x, lin.y, this.rotCx, this.rotCy, -this.rot);
    let px = r0.x;
    let py = r0.y;
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
    // Atem statt Blinken: langsamer als Ping und Ziel-Puls – ein Schein,
    // der lebt, aber nicht um Aufmerksamkeit bittet.
    const pulse01 = 0.5 + 0.5 * Math.sin(now / 420);
    // Im Ziel wechselt der Schein in die Zielfarbe: Der Partner rollt weiter,
    // man sieht aber, dass er durch ist.
    const rgb = done ? WORLD.goal : WORLD.buddy;
    for (const layer of haloLayers({ radiusPx: radiusPx * this.dpr, alphaScale, pulse01, offscreen })) {
      const glow = ctx.createRadialGradient(px, py, 0, px, py, layer.r);
      glow.addColorStop(0, `rgba(${rgb}, ${layer.alpha})`);
      glow.addColorStop(0.55, `rgba(${rgb}, ${layer.alpha * 0.35})`);
      glow.addColorStop(1, `rgba(${rgb}, 0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(px, py, layer.r, 0, Math.PI * 2);
      ctx.fill();
    }
    if (floorLabel) {
      ctx.fillStyle = `rgba(${rgb}, 0.55)`;
      ctx.font = `${11 * this.dpr}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(floorLabel, px, py + 4 * this.dpr);
    }
  }
}
