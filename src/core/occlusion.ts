// Schallschutzwand: Klang, dessen gerade Linie zum Ohr eine absorbierende
// Wand kreuzt, kommt abgeschirmt an. Rein und DOM-frei wie der Rest von
// core/ – app.ts fragt pro Frame für jede Klangquelle nach.
//
// Modell bewusst schlicht: EIN Strahl vom Ball zur Quelle, Treffer gegen die
// achsenparallelen Wand-Rechtecke mit `absorb`. Keine Beugung, keine
// Mehrfachwege – die Wand schirmt genau die Richtung ab, in der sie steht.

import type { Wall } from './types';

/** Lautstärkefaktor hinter einer Schallschutzwand (Stetigkeits-Quellen wie
 *  Wächter, Portal, Musik werden mit ihm skaliert). */
export const ABSORB_GAIN = 0.35;

/** Schneidet die Strecke (ax,ay)→(bx,by) das Rechteck? Slab-Test (Liang–Barsky). */
export function segmentHitsRect(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  r: { x: number; y: number; w: number; h: number },
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  let t0 = 0;
  let t1 = 1;
  const clip = (p: number, q: number): boolean => {
    // p·t ≤ q muss gelten; p = 0 heißt parallel zur Kante
    if (p === 0) return q >= 0;
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  return (
    clip(-dx, ax - r.x) && clip(dx, r.x + r.w - ax) && clip(-dy, ay - r.y) && clip(dy, r.y + r.h - ay) && t0 <= t1
  );
}

/** Liegt zwischen Ohr (ax,ay) und Quelle (bx,by) eine Schallschutzwand? */
export function shielded(walls: readonly Wall[], ax: number, ay: number, bx: number, by: number): boolean {
  for (const w of walls) if (w.absorb && segmentHitsRect(ax, ay, bx, by, w)) return true;
  return false;
}
