// WEGMARKEN / KLANGBOJEN (M89): Das erste Werkzeug, mit dem ein Spieler dem
// anderen etwas ÜBER DIE WELT sagt, ohne zu reden.
//
// Eine abgelegte Boje tickt leise aus ihrer Richtung – bei BEIDEN Spielern.
// Damit kann der Sehende auf einer hellen Ebene dem Blinden den Weg um die
// Löcher markieren, und beide können sich verabreden („warte bei meiner
// zweiten Marke"). Der Vorrat steht im LEVEL (`marks`, Vorgabe 3), ist also
// eine Bau-Entscheidung: 0 heißt „dieses Level kennt keine Bojen".
//
// Eine Boje sitzt in der MITTE ihrer Zelle, nicht dort, wo die Kugel gerade
// rollte: Sie ist ein Wegzeichen, kein Schnappschuss. Daraus folgt auch die
// Regel fürs Aufnehmen – „liegt hier schon eine von mir?" ist ein Vergleich
// von Zellmitten, nicht eine Abstandsprobe mit Toleranz.
//
// Rein und DOM-frei wie alles in core/ – Units in tests/marks.test.ts.

import { CELL } from './constants';

/** Hörweite einer Boje in Welteinheiten – etwas weiter als der Partner
 *  (BUDDY_HEAR = 520): Ein Wegzeichen soll man finden, bevor man draufrollt. */
export const MARK_HEAR = 620;

export interface Mark {
  floor: number;
  /** Zellmitte in Weltkoordinaten */
  x: number;
  y: number;
  /** true = von mir gelegt (nur eigene kann man wieder aufnehmen) */
  mine: boolean;
}

/** Zellmitte zu einer Weltposition. */
export function markSpot(x: number, y: number): { x: number; y: number } {
  return { x: (Math.floor(x / CELL) + 0.5) * CELL, y: (Math.floor(y / CELL) + 0.5) * CELL };
}

const at = (m: Mark, floor: number, spot: { x: number; y: number }) =>
  m.floor === floor && Math.abs(m.x - spot.x) < 1 && Math.abs(m.y - spot.y) < 1;

/** Wie viele Bojen ICH liegen habe (der Vorrat des Partners ist seine Sache). */
export function ownCount(list: readonly Mark[]): number {
  return list.filter((m) => m.mine).length;
}

export type MarkAction = 'placed' | 'took' | 'full';

/**
 * Ein Tap auf den Bojen-Knopf: Liegt in DIESER Zelle schon eine EIGENE Boje,
 * nimmt er sie zurück (der Vorrat steigt wieder) – sonst legt er eine ab,
 * solange der Vorrat reicht. Fremde Bojen bleiben liegen: Wer eine Marke
 * setzt, will sie wiederfinden, nicht vom Partner weggeräumt bekommen.
 *
 * Rein: liefert eine NEUE Liste plus die Tat, die zu melden ist.
 */
export function toggleMark(
  list: readonly Mark[],
  floor: number,
  x: number,
  y: number,
  max: number,
): { list: Mark[]; action: MarkAction; spot: { x: number; y: number } } {
  const spot = markSpot(x, y);
  const own = list.find((m) => m.mine && at(m, floor, spot));
  if (own) return { list: list.filter((m) => m !== own), action: 'took', spot };
  if (ownCount(list) >= max) return { list: [...list], action: 'full', spot };
  return { list: [...list, { floor, ...spot, mine: true }], action: 'placed', spot };
}

/** Boje des PARTNERS setzen oder wegnehmen (Netz-Nachricht `mark`). Sein
 *  Vorrat wird hier nicht geprüft – dafür ist seine Seite zuständig. */
export function applyPartnerMark(
  list: readonly Mark[],
  floor: number,
  x: number,
  y: number,
  on: boolean,
): Mark[] {
  const spot = markSpot(x, y);
  const rest = list.filter((m) => m.mine || !at(m, floor, spot));
  return on ? [...rest, { floor, ...spot, mine: false }] : rest;
}

/** Die NÄCHSTE hörbare Boje auf dieser Ebene – es klingt immer nur eine
 *  (ein Bus, eine Richtung, wie beim Automaten). */
export function nearestMark(
  list: readonly Mark[],
  floor: number,
  x: number,
  y: number,
  hear = MARK_HEAR,
): { mark: Mark; dx: number; dy: number; dist: number } | null {
  let best: { mark: Mark; dx: number; dy: number; dist: number } | null = null;
  for (const m of list) {
    if (m.floor !== floor) continue;
    const dx = m.x - x;
    const dy = m.y - y;
    const dist = Math.hypot(dx, dy);
    if (dist >= hear) continue;
    if (!best || dist < best.dist) best = { mark: m, dx, dy, dist };
  }
  return best;
}
