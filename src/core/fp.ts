// First-Person-Steuerung (Lenkrad-Modell, M23): Die Kugel bekommt eine
// Blickrichtung (Heading), die auf dem Screen immer nach oben zeigt – es
// dreht sich die WELT, nicht die Kugel. FP ist eine reine Transformation VOR
// der Physik: Der Neigungsvektor des Geräts wird hier ins Weltsystem gedreht,
// `world.step` und alles dahinter bleiben unangetastet. Deshalb bleiben
// Geister, Duell-Tokens, Daily und MP kompatibel – FP ist Steuerung, Kamera
// und Hörer, kein anderes Spiel.
//
// Konventionen (von den Units festgenagelt):
// - Heading 0 = Norden = Welt-oben (0,-1); positiv = rechtsherum (im
//   Uhrzeigersinn), also heading π/2 = Welt-rechts (1,0).
// - tilt.y ist das Gerätesignal wie bisher: +y = steiler gestellt (zu dir
//   gekippt) = RÜCKWÄRTS, -y = nach vorn gekippt = VORWÄRTS.
// - tilt.x (Lenkrad-Neigung) dreht NUR – kein Strafen. Seitliche Bewegung
//   entsteht ausschließlich aus Impuls (Drift um Kurven, gewollt).
//
// Geglättet wird die DREHRATE (exponentiell, dt-unabhängig über exp):
// Heading ist damit C¹-stetig, und weil Kamera, Schub und Hörer alle
// DASSELBE Heading benutzen, ist die Kameradrehung automatisch ruckelfrei,
// ohne dass Sicht und Steuerung je auseinanderlaufen.

import { CELL } from './constants';
import type { Tilt } from './types';

/** Volle Drehrate bei vollem Lenkeinschlag (rad/s). */
export const FP_MAX_TURN = 2.4;
/** Zeitkonstante der Drehraten-Glättung (s) – glättet damit auch die Kamera. */
export const FP_TURN_SMOOTH_S = 0.09;

export interface FpState {
  /** Blickrichtung in rad, normalisiert auf (-π, π]. 0 = Welt-oben. */
  heading: number;
  /** Aktuelle (geglättete) Drehrate in rad/s. */
  turnRate: number;
}

export const fpInitial = (): FpState => ({ heading: 0, turnRate: 0 });

/** Lenkkurve: quadratisch mit Vorzeichen – präzise um die Mitte,
 *  zügig am Anschlag. Eingang wie Ausgang in [-1, 1]. */
export function turnCurve(x: number): number {
  const c = Math.max(-1, Math.min(1, x));
  return c * Math.abs(c);
}

/** Winkel auf (-π, π] normalisieren (hält Heading float-stabil). */
export function normalizeAngle(a: number): number {
  const twoPi = Math.PI * 2;
  let r = a % twoPi;
  if (r > Math.PI) r -= twoPi;
  else if (r <= -Math.PI) r += twoPi;
  return r;
}

/** Blickrichtung als Welt-Einheitsvektor: heading 0 -> (0,-1) = oben. */
export function headingVector(heading: number): { x: number; y: number } {
  return { x: Math.sin(heading), y: -Math.cos(heading) };
}

/* --- START-BLICK (M98) -------------------------------------------------------
   Bis 3.32 startete First Person stur nach NORDEN – und wer mit dem Rücken zur
   einzigen Öffnung aufwachte, fuhr als Erstes gegen eine Wand. Gemeldet als
   „es ist nicht so schön, wenn man direkt gegen eine Wand fährt".

   Gewählt wird unter den VIER Himmelsrichtungen die mit der meisten Luft, und
   der Blick reicht dabei nur ZWEI ZELLEN weit (`FP_LOOK`). Das ist Absicht:
   Zwei Zellen unterscheiden „Wand im Gesicht" von „hier kann ich rollen", aber
   sie verraten nichts über das Labyrinth – so weit trägt der erste Ping
   ohnehin. Eine Wahl „Richtung Ziel" wäre in diesem Spiel ein Verrat.

   Gleichstand behält NORDEN (strikt größer gewinnt), dann Ost, Süd, West: Wo
   die alte Regel schon gut war, ändert sich nichts. */

/** Wie weit die Startblick-Wahl schaut (Welteinheiten = zwei Zellen). */
export const FP_LOOK = CELL * 2;

/** Alles, was den Blick versperrt – eine Wand ist ein Rechteck, mehr braucht
 *  die Wahl nicht zu wissen (`Wall` passt strukturell). */
export interface Blocker {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Freie Strecke von (x, y) in Blickrichtung, höchstens `max`. Abgetastet
 *  statt analytisch geschnitten: Der Aufruf passiert EINMAL je Levelstart,
 *  und ein Raster von 10 Einheiten ist feiner als jede Wandstärke. */
export function freeAhead(
  boxes: readonly Blocker[],
  x: number,
  y: number,
  heading: number,
  max = FP_LOOK,
  step = 10,
): number {
  const d = headingVector(heading);
  for (let t = step; t <= max; t += step) {
    const px = x + d.x * t;
    const py = y + d.y * t;
    for (const b of boxes) {
      if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return t - step;
    }
  }
  return max;
}

/** Startblick in eine ÖFFNUNG statt stur nach Norden (M98). Rein. */
export function startHeading(boxes: readonly Blocker[], x: number, y: number, max = FP_LOOK): number {
  let best = 0;
  let bestFree = -1;
  for (const h of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const free = freeAhead(boxes, x, y, h, max);
    if (free > bestFree) {
      bestFree = free;
      best = h;
    }
  }
  return best;
}

export interface FpStepResult extends FpState {
  /** Der ins Weltsystem gedrehte Neigungsvektor für `world.step`. */
  worldTilt: Tilt;
}

/** Ein Steuerungs-Frame: Lenkkurve -> geglättete Drehrate -> Heading
 *  integrieren -> Schub (nur tilt.y) entlang der Blickrichtung drehen.
 *  Rein und deterministisch – die Testsuite fährt hiermit ganze Manöver. */
export function fpStep(state: FpState, tilt: Tilt, dt: number): FpStepResult {
  const target = turnCurve(tilt.x) * FP_MAX_TURN;
  // Exponentielles Nachziehen: dt-unabhängig, kein Überschwingen.
  const k = 1 - Math.exp(-Math.max(0, dt) / FP_TURN_SMOOTH_S);
  const turnRate = state.turnRate + (target - state.turnRate) * k;
  const heading = normalizeAngle(state.heading + turnRate * dt);
  // Schub entlang der Blickrichtung: nach vorn gekippt (tilt.y < 0) rollt
  // vorwärts, also in Richtung headingVector.
  const f = headingVector(heading);
  const thrust = -Math.max(-1, Math.min(1, tilt.y));
  return {
    heading,
    turnRate,
    worldTilt: { x: f.x * thrust, y: f.y * thrust },
  };
}
