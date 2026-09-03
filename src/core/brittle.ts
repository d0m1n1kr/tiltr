// Einseitig brüchige Wände (M66): Von welcher Seite trifft der Ball die Wand?
// Rein und DOM-frei – app.ts fragt beim Treffer, der Beweis (validate.ts)
// baut aus derselben Seitenlogik eine GERICHTETE Kante.

import type { Wall } from './types';

export type WallSide = 'n' | 'e' | 's' | 'w';

/** Seite, auf der der Ball steht: senkrechte Wand → 'w'/'e', waagerechte → 'n'/'s'. */
export function hitSide(wall: Pick<Wall, 'x' | 'y' | 'w' | 'h'>, bx: number, by: number): WallSide {
  const vertical = wall.h >= wall.w;
  if (vertical) return bx < wall.x + wall.w / 2 ? 'w' : 'e';
  return by < wall.y + wall.h / 2 ? 'n' : 's';
}

/** Darf dieser Treffer die brüchige Wand beschädigen? Ohne `hpSide` immer. */
export function brittleBreakable(wall: Pick<Wall, 'x' | 'y' | 'w' | 'h' | 'hpSide'>, bx: number, by: number): boolean {
  return wall.hpSide === undefined || hitSide(wall, bx, by) === wall.hpSide;
}

/** Die beiden Zellen einer Kante, in kanonischer Reihenfolge: A liegt auf der
 *  n/w-Seite der Wand, B auf der s/e-Seite. */
export function edgeCells(edge: readonly [readonly [number, number], WallSide]): {
  a: [number, number];
  b: [number, number];
  vertical: boolean;
} {
  const [[x, y], dir] = edge;
  switch (dir) {
    case 'e':
      return { a: [x, y], b: [x + 1, y], vertical: true };
    case 'w':
      return { a: [x - 1, y], b: [x, y], vertical: true };
    case 's':
      return { a: [x, y], b: [x, y + 1], vertical: false };
    default:
      return { a: [x, y - 1], b: [x, y], vertical: false };
  }
}

/** Passt die Seite zur Wandlage? Senkrechte Wände brechen von w/e,
 *  waagerechte von n/s. */
export function sideFitsEdge(edge: readonly [readonly [number, number], WallSide], side: WallSide): boolean {
  const { vertical } = edgeCells(edge);
  return vertical ? side === 'w' || side === 'e' : side === 'n' || side === 's';
}

/** Gerichtete Passage einer einseitig brüchigen Wand: von der Zelle auf der
 *  Bruchseite zur Zelle dahinter. */
export function brittlePassage(
  edge: readonly [readonly [number, number], WallSide],
  side: WallSide,
): { from: [number, number]; to: [number, number] } {
  const { a, b } = edgeCells(edge);
  return side === 'w' || side === 'n' ? { from: a, to: b } : { from: b, to: a };
}
