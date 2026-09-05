// Konfetti beim Levelsieg: zwei Kanonen aus den unteren Bildecken, die
// schräg nach innen-oben schießen. Es fällt über das Spielfeld, während die
// Ergebnis-Karte darüber aufzieht (die Karte liegt höher, bleibt also lesbar).
//
// Zwei Entscheidungen, die es in tiltrs Sprache halten:
//  - Die FARBEN kommen aus der Weltpalette (Ball-Teal, Wand-Blau, Ziel-Grün,
//    Gold, Bernstein, Gem-Eisblau). Kein Regenbogen: Das Spiel hat eine
//    Farbsprache, und Feiern ist kein Grund, sie zu verlassen.
//  - Das Partikelmodell ist REIN und geseedet (mulberry32) – dieselbe
//    Zahl-in-Zahl-raus-Disziplin wie im Kern, damit die Testsuite Flugbahnen
//    festnageln kann, ohne Pixel zu lesen.
//
// `prefers-reduced-motion` schaltet es ganz ab: Es ist Dekoration, kein
// Spielsignal (die Zeit und der Klang sagen dasselbe).

import { mulberry32 } from '../core/rng';
import { WORLD } from '../render/palette';

/** Ein Schnipsel. Position in Gerätepixeln, Winkel in rad. */
export interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Drehwinkel und Drehrate (rad, rad/s) */
  rot: number;
  spin: number;
  /** Kantenlänge in px (Streifen: Höhe = size, Breite = size * 0.45) */
  size: number;
  color: string;
  /** Phase des Flatterns, damit nicht alle synchron wackeln */
  wobble: number;
  /** Verbleibende Lebenszeit in Sekunden */
  life: number;
}

/* Schwerkraft und Luftwiderstand sind aufeinander eingestellt, nicht
   geraten: `GRAVITY / DRAG` ist die Endgeschwindigkeit im freien Fall –
   700/3 ≈ 233 px/s, also das TAUMELN von Papier statt des Sturzes eines
   Steins. Der kräftige Widerstand lässt außerdem die Salve nach ~0,3 s
   abbremsen: erst Knall, dann Flattern – so sehen echte Konfetti-Kanonen
   aus. Wirkung (nachgerechnet für ein 800px-Bild): Gipfel bei 33–58 %
   Bildhöhe, Flugdauer 2,2–3,2 s. Die Ergebnis-Karte kommt nach 1,8 s und
   zieht damit über noch fallendes Papier auf. */
export const GRAVITY = 700;
/** Luftwiderstand pro Sekunde (multiplikativ auf die Geschwindigkeit). */
const DRAG = 3;
/** Seitliches Flattern: Amplitude in px/s, Frequenz in rad/s. */
const WOBBLE_V = 55;
const WOBBLE_HZ = 7;

const COLORS = [
  WORLD.ball,
  `rgb(${WORLD.wall})`,
  `rgb(${WORLD.goal})`,
  `rgb(${WORLD.key})`,
  `rgb(${WORLD.brittle})`,
  `rgb(${WORLD.gem})`,
];

/** Zwei Kanonen: unten links und unten rechts, schräg nach innen-oben. */
export function spawnConfetti(seed: number, count: number, w: number, h: number): Piece[] {
  const rng = mulberry32(seed);
  const pieces: Piece[] = [];
  for (let i = 0; i < count; i++) {
    const left = i % 2 === 0;
    // Streuung: Winkel um 60° von der Waagerechten, Tempo 1400–2200 px/s.
    const spread = (rng() - 0.5) * 0.75;
    const angle = (left ? -Math.PI / 3 : (-Math.PI * 2) / 3) + spread;
    const speed = 1400 + rng() * 800;
    pieces.push({
      x: left ? w * 0.06 : w * 0.94,
      y: h * 0.98,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rot: rng() * Math.PI * 2,
      spin: (rng() - 0.5) * 14,
      size: 7 + rng() * 7,
      color: COLORS[Math.floor(rng() * COLORS.length)]!,
      wobble: rng() * Math.PI * 2,
      life: 3.4 + rng() * 1.2,
    });
  }
  return pieces;
}

/** Ein Zeitschritt. Gibt die noch lebenden Schnipsel zurück (unter dem Bild
 *  oder abgelaufen = weg), damit der Aufrufer nichts aufräumen muss. */
export function stepConfetti(pieces: Piece[], dt: number, h: number): Piece[] {
  const alive: Piece[] = [];
  for (const p of pieces) {
    p.life -= dt;
    p.wobble += WOBBLE_HZ * dt;
    // Luftwiderstand als exponentielles Nachlassen: dt-unabhängig.
    const drag = Math.exp(-DRAG * dt);
    p.vx *= drag;
    p.vy = p.vy * drag + GRAVITY * dt;
    p.x += (p.vx + Math.sin(p.wobble) * WOBBLE_V) * dt;
    p.y += p.vy * dt;
    p.rot += p.spin * dt;
    if (p.life > 0 && p.y < h + 40) alive.push(p);
  }
  return alive;
}

export interface ConfettiApi {
  /** Salve zünden (Bildgröße wird vom Canvas genommen). */
  burst(): void;
  /** Pro Frame aus der Spielschleife: bewegen und zeichnen. */
  step(dtSeconds: number): void;
  /** Sofort aufräumen (Menü, neues Level). */
  clear(): void;
  /** Die Schnipsel zusätzlich auf ein ANDERES Canvas zeichnen (Screencast,
   *  M104): Das Video sieht nur das Spielfeld-Canvas, die Konfetti-Ebene
   *  liegt darüber im DOM. `scale` = Zielbreite / Konfetti-Breite. */
  drawOn(target: CanvasRenderingContext2D, scale: number): void;
}

/** Wie viele Schnipsel pro Salve – auf Phones etwas weniger. */
const count = (w: number): number => (w < 500 ? 70 : 110);

export function setupConfetti(canvasId: string): ConfettiApi {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
  const ctx = canvas?.getContext('2d') ?? null;
  let pieces: Piece[] = [];

  const expose = (): void => {
    (window as unknown as { __tiltrConfetti?: unknown }).__tiltrConfetti = {
      count: pieces.length,
      colors: [...new Set(pieces.map((p) => p.color))].length,
      cw: canvas?.width ?? 0,
      ch: canvas?.height ?? 0,
      // Höchster und tiefster Punkt der Salve: zeigt, ob sie IM Bild fliegt.
      minY: pieces.length ? Math.round(Math.min(...pieces.map((p) => p.y))) : -1,
      maxY: pieces.length ? Math.round(Math.max(...pieces.map((p) => p.y))) : -1,
    };
  };
  expose();

  /** Backing an die CSS-Größe angleichen (nur wenn nötig – es kostet ein Clear). */
  const resize = (): void => {
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  };

  return {
    burst(): void {
      if (!canvas || !ctx) return;
      // Dekoration, kein Spielsignal: Wer Bewegung reduziert, bekommt keine.
      // Dekoration, kein Spielsignal: Wer Bewegung reduziert, bekommt keine.
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      resize();
      pieces = spawnConfetti(
        Math.floor(Math.random() * 0x7fffffff),
        count(canvas.width),
        canvas.width,
        canvas.height,
      );
      expose();
    },
    drawOn(target: CanvasRenderingContext2D, scale: number): void {
      if (!pieces.length) return;
      target.save();
      target.setTransform(1, 0, 0, 1, 0, 0);
      for (const p of pieces) {
        target.globalAlpha = Math.max(0, Math.min(1, p.life / 0.5));
        target.save();
        target.translate(p.x * scale, p.y * scale);
        target.rotate(p.rot);
        target.fillStyle = p.color;
        target.fillRect(-p.size * 0.225 * scale, (-p.size / 2) * scale, p.size * 0.45 * scale, p.size * scale);
        target.restore();
      }
      target.restore();
    },
    step(dtSeconds: number): void {
      if (!canvas || !ctx || !pieces.length) return;
      pieces = stepConfetti(pieces, dtSeconds, canvas.height);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of pieces) {
        // Ausblenden in der letzten halben Sekunde, damit nichts hart verschwindet.
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 0.5));
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size * 0.225, -p.size / 2, p.size * 0.45, p.size);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      expose();
    },
    clear(): void {
      pieces = [];
      if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      expose();
    },
  };
}
