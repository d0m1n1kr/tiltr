// HIGHLIGHT-SCHERE (M104): Fenster um Schlüsselstellen, verschmolzen,
// budgetiert, Start und Ziel immer dabei. Reine Funktion – hier steht, was ein
// Highlight-Video zeigt, bevor irgendjemand ein Bild rendert.
import { describe, expect, it } from 'vitest';
import { MARK_WEIGHT, selectHighlights, type Segment } from '../src/core/highlights';
import type { MarkKind, RunMark } from '../src/core/recording';

const m = (t: number, kind: MarkKind): RunMark => ({ t, kind, floor: 0, x: 0, y: 0 });
const len = (segs: readonly Segment[]): number => segs.reduce((s, x) => s + (x.to - x.from), 0);

describe('Highlight-Schere (M104)', () => {
  it('legt um jede Stelle ein Fenster mit Vor- und Nachlauf, geklemmt an den Rändern', () => {
    const segs = selectHighlights([m(0, 'start'), m(20, 'door'), m(40, 'goal')], 40, { pre: 2, post: 1.5, budget: 60 });
    expect(segs).toHaveLength(3);
    expect(segs[0]).toMatchObject({ from: 0, to: 1.5, fadeIn: 0, kinds: ['start'] });
    expect(segs[1]).toMatchObject({ from: 18, to: 21.5, fadeIn: 0.4, kinds: ['door'] });
    expect(segs[2]).toMatchObject({ from: 38, to: 40, fadeIn: 0.4, kinds: ['goal'] });
  });

  it('überlappende Fenster verschmelzen zu einem – und wiegen zusammen', () => {
    const segs = selectHighlights([m(10, 'key'), m(11, 'door'), m(12.5, 'gem')], 30, { budget: 60 });
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ from: 8, to: 14 });
    expect(segs[0]!.weight).toBe(MARK_WEIGHT.key + MARK_WEIGHT.door + MARK_WEIGHT.gem);
    expect(segs[0]!.kinds).toEqual(['key', 'door', 'gem']);
  });

  it('über dem Budget fallen die leichtesten Fenster zuerst – Start und Ziel nie', () => {
    const marks = [m(0, 'start'), m(10, 'gem'), m(20, 'fall'), m(30, 'checkpoint'), m(40, 'door'), m(60, 'goal')];
    // Sechs Fenster à 3,5 s (Start 1,5, Ziel 2) = 17,5 s; Budget 10 s zwingt
    // zum Schneiden: Gem (2) und Checkpoint (3) gehen zuerst.
    const segs = selectHighlights(marks, 60, { budget: 10 });
    const kinds = segs.flatMap((s) => s.kinds);
    expect(kinds).toContain('start');
    expect(kinds).toContain('goal');
    expect(kinds).toContain('fall');
    expect(kinds).not.toContain('gem');
    expect(kinds).not.toContain('checkpoint');
    expect(len(segs)).toBeLessThanOrEqual(10);
  });

  it('bleibt in Zeitordnung, und nur das erste Fenster beginnt ohne Überblendung', () => {
    const segs = selectHighlights([m(50, 'goal'), m(0, 'start'), m(25, 'door')], 50, { budget: 60, fade: 0.3 });
    expect(segs.map((s) => s.from)).toEqual([...segs.map((s) => s.from)].sort((a, b) => a - b));
    expect(segs.map((s) => s.fadeIn)).toEqual([0, 0.3, 0.3]);
  });

  it('ohne Stellen: Anfang und Ende – ein kurzer Lauf ganz', () => {
    expect(selectHighlights([], 12, { budget: 25 })).toEqual([{ from: 0, to: 12, fadeIn: 0, weight: 0, kinds: [] }]);
    const long = selectHighlights([], 100, { budget: 20 });
    expect(long).toHaveLength(2);
    expect(long[0]).toMatchObject({ from: 0, to: 10 });
    expect(long[1]).toMatchObject({ from: 90, to: 100, fadeIn: 0.4 });
  });

  it('nur Start und Ziel, aber über dem Budget: beide werden gekürzt, nicht gestrichen', () => {
    const segs = selectHighlights([m(0, 'start'), m(100, 'goal')], 100, { pre: 10, post: 10, budget: 8 });
    expect(segs).toHaveLength(2);
    expect(len(segs)).toBeCloseTo(8, 6);
    expect(segs[0]!.from).toBe(0);
    expect(segs[1]!.to).toBe(100);
  });

  it('ein leerer Mitschnitt hat keine Fenster', () => {
    expect(selectHighlights([m(0, 'start')], 0)).toEqual([]);
  });
});
