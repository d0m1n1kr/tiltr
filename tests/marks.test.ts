// Wegmarken (M89): Vorrat, Zellmitte, Aufnehmen – und die Regel, dass fremde
// Bojen liegen bleiben. Reines Modell, deshalb hier prüfbar ohne Browser.

import { describe, expect, it } from 'vitest';
import { CELL } from '../src/core/constants';
import {
  MARK_HEAR,
  applyPartnerMark,
  markSpot,
  nearestMark,
  ownCount,
  toggleMark,
  type Mark,
} from '../src/core/marks';

describe('markSpot', () => {
  it('rastet auf die Zellmitte – eine Boje ist ein Wegzeichen, kein Schnappschuss', () => {
    expect(markSpot(0, 0)).toEqual({ x: CELL / 2, y: CELL / 2 });
    expect(markSpot(CELL - 1, 1)).toEqual({ x: CELL / 2, y: CELL / 2 });
    expect(markSpot(CELL + 5, 2 * CELL + 5)).toEqual({ x: CELL * 1.5, y: CELL * 2.5 });
  });
});

describe('toggleMark', () => {
  it('legt ab, bis der Vorrat leer ist – dann sagt es „full"', () => {
    let list: Mark[] = [];
    for (const [i, x] of [50, 150, 250].entries()) {
      const r = toggleMark(list, 0, x, 50, 3);
      expect(r.action).toBe('placed');
      list = r.list;
      expect(ownCount(list)).toBe(i + 1);
    }
    const full = toggleMark(list, 0, 350, 50, 3);
    expect(full.action).toBe('full');
    expect(ownCount(full.list)).toBe(3);
  });

  it('derselbe Tap auf DERSELBEN Zelle nimmt sie wieder auf (Vorrat zurück)', () => {
    const placed = toggleMark([], 0, 55, 55, 3);
    expect(placed.action).toBe('placed');
    // Woanders in derselben Zelle getippt: trifft dieselbe Boje.
    const took = toggleMark(placed.list, 0, 95, 5, 3);
    expect(took.action).toBe('took');
    expect(took.list).toHaveLength(0);
  });

  it('dieselbe Zelle auf einer ANDEREN Ebene ist eine andere Stelle', () => {
    const first = toggleMark([], 0, 50, 50, 3);
    const second = toggleMark(first.list, 1, 50, 50, 3);
    expect(second.action).toBe('placed');
    expect(ownCount(second.list)).toBe(2);
  });

  it('eine FREMDE Boje bleibt liegen – man legt daneben, statt sie wegzuräumen', () => {
    const theirs: Mark[] = [{ floor: 0, x: 50, y: 50, mine: false }];
    const r = toggleMark(theirs, 0, 50, 50, 3);
    expect(r.action).toBe('placed');
    expect(r.list).toHaveLength(2);
    expect(ownCount(r.list)).toBe(1);
  });

  it('Vorrat 0 heißt: dieses Level kennt keine Bojen', () => {
    expect(toggleMark([], 0, 50, 50, 0).action).toBe('full');
  });

  it('rein: die übergebene Liste bleibt unangetastet', () => {
    const list: Mark[] = [];
    toggleMark(list, 0, 50, 50, 3);
    expect(list).toHaveLength(0);
  });
});

describe('applyPartnerMark', () => {
  it('setzt und entfernt die Boje des Partners, ohne meine anzufassen', () => {
    const mine: Mark[] = [{ floor: 0, x: 50, y: 50, mine: true }];
    const withTheirs = applyPartnerMark(mine, 0, 155, 55, true);
    expect(withTheirs).toHaveLength(2);
    expect(ownCount(withTheirs)).toBe(1);
    const gone = applyPartnerMark(withTheirs, 0, 150, 50, false);
    expect(gone).toHaveLength(1);
    expect(ownCount(gone)).toBe(1);
  });

  it('seine Boje auf MEINER Zelle löscht meine nicht', () => {
    const mine: Mark[] = [{ floor: 0, x: 50, y: 50, mine: true }];
    const both = applyPartnerMark(mine, 0, 50, 50, true);
    expect(both).toHaveLength(2);
    const off = applyPartnerMark(both, 0, 50, 50, false);
    expect(off).toEqual(mine);
  });
});

describe('nearestMark', () => {
  const list: Mark[] = [
    { floor: 0, x: 150, y: 50, mine: true },
    { floor: 0, x: 550, y: 50, mine: false },
    { floor: 1, x: 60, y: 50, mine: true },
  ];

  it('nimmt die nächste auf DIESER Ebene – eine klingt, nicht alle', () => {
    const n = nearestMark(list, 0, 50, 50);
    expect(n?.mark.x).toBe(150);
    expect(n?.dx).toBe(100);
    expect(n?.dist).toBeCloseTo(100, 5);
  });

  it('andere Ebene zählt nicht, auch wenn sie näher wäre', () => {
    const n = nearestMark(list, 0, 55, 50);
    expect(n?.mark.floor).toBe(0);
  });

  it('jenseits der Hörweite ist nichts zu hören', () => {
    expect(nearestMark(list, 0, 50 + MARK_HEAR, 50)?.mark.x).toBe(550);
    expect(nearestMark([], 0, 0, 0)).toBeNull();
    expect(nearestMark(list, 2, 0, 0)).toBeNull();
  });
});
