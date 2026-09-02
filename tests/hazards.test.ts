// Glas und Anker: WAS ist ein Riegel, was nur Schwierigkeit?
//
// Es gab ein Badge „Glas abseits" (hazards). Es ist weg (M39): Glas hält EINE
// Überfahrt aus und wird dann zum Loch – an dessen Rand kommt man mit Gefühl
// vorbei. Ein Pflichtweg über Glas ist Schwierigkeit, kein Riegel; ein Badge,
// das ein spielbares Level unteilbar macht, ist falsch. Der Sog-Anker war nie
// ein Riegel: Sein Sog bleibt per Schema-Invariante unter der Neigungs-
// Beschleunigung (anchorDef.force ≤ 2400 vs. World.accel 2600).
//
// Die Flags `glassBlocked`/`anchorsBlocked` bleiben – als QUALITÄTS-Regel
// unserer Generatoren (tests/levels.test.ts, tests/daily.test.ts), nicht als
// Beweis.

import { describe, expect, it } from 'vitest';
import { isShareable, reachable, validateLevel } from '../src/levels/validate';
import { parseLevel } from '../src/levels/schema';
import { anchorDef } from '../src/levels/schema';
import { World } from '../src/core/physics';
import { cellKey } from './helpers';

/** Korridor x = 0…4 in Reihe 0, Reihe 1 abgeriegelt. Ein Element in (2,0). */
const corridor = (el: unknown) => ({
  id: 'hz', name: 'Gefahr', pingBudget: 3,
  floors: [{
    size: [5, 2],
    maze: {
      seed: 3,
      carve: [[[0, 0], 'e'], [[1, 0], 'e'], [[2, 0], 'e'], [[3, 0], 'e']],
      add: [[[0, 0], 's'], [[1, 0], 's'], [[2, 0], 's'], [[3, 0], 's'], [[4, 0], 's']],
    },
    elements: [el], start: [0, 0], goal: [4, 0],
  }],
});
const check = (def: unknown, key: string) => validateLevel(def).find((c) => c.key === key);

describe('Glas und Anker im Pflichtweg', () => {
  it('der Sog kann die Neigung nie überbieten – das ist die Invariante dahinter', () => {
    const maxForce = anchorDef.shape.force.parse(undefined) as number;
    expect(maxForce).toBeLessThan(new World([], { x: 0, y: 0, r: 1, vx: 0, vy: 0 } as never, null).accel);
    expect(() => anchorDef.parse({ type: 'anchor', cell: [0, 0], force: 2600 })).toThrow();
  });

  it('es gibt kein hazards-Badge mehr', () => {
    expect(check(corridor({ type: 'glass', cell: [2, 0] }), 'hazards')).toBeUndefined();
  });

  it('Glas im Korridor: teilbar – goal und softlock grün, nichts blockiert', () => {
    const checks = validateLevel(corridor({ type: 'glass', cell: [2, 0] }));
    expect(checks.find((c) => c.key === 'goal')?.ok).toBe(true);
    expect(checks.find((c) => c.key === 'softlock')?.ok).toBe(true);
    expect(isShareable(checks)).toBe(true);
  });

  it('Anker im Korridor: teilbar', () => {
    expect(isShareable(validateLevel(corridor({ type: 'anchor', cell: [2, 0] })))).toBe(true);
  });

  it('die Flags bleiben getrennt und wirken (Generator-Regel, kein Beweis)', () => {
    const anchor = parseLevel(corridor({ type: 'anchor', cell: [2, 0] }));
    expect(reachable(anchor, { brittleOpen: true, doorsOpen: true, anchorsBlocked: true }).has(cellKey(0, [4, 0]))).toBe(false);
    expect(reachable(anchor, { brittleOpen: true, doorsOpen: true }).has(cellKey(0, [4, 0]))).toBe(true);
    const glass = parseLevel(corridor({ type: 'glass', cell: [2, 0] }));
    expect(reachable(glass, { brittleOpen: true, doorsOpen: true, glassBlocked: true }).has(cellKey(0, [4, 0]))).toBe(false);
    expect(reachable(glass, { brittleOpen: true, doorsOpen: true }).has(cellKey(0, [4, 0]))).toBe(true);
  });
});
