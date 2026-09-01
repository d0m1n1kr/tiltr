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
