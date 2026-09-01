// „Glas abseits": WAS gehört in dieses Badge und was nicht.
//
// Der Sog-Anker gehört zur Gefahren-FAMILIE, aber nicht in diesen Beweis:
// Sein Sog bleibt per Schema-Invariante unter der Neigungs-Beschleunigung
// (anchorDef.force ≤ 2400 vs. World.accel 2600) – „ein Anker ist zäh, nie
// eine Falle". Ihn als Wand zu modellieren machte ein beweisbar lösbares
// Level UNTEILBAR (isShareable verlangt dieses Badge) und widersprach `goal`
// und `softlock`, die dasselbe Level grün stempelten.
//
// Glas bleibt gesperrt, und zwar mit Grund: Es hält EINE Überfahrt aus (erst
// knacken, dann brechen) – ein Pflichtweg, der zweimal darüber muss, tötet.
// Das prüft dieses Modell nicht, also bleibt Glas ganz draußen.

import { describe, expect, it } from 'vitest';
import { reachable, validateLevel } from '../src/levels/validate';
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
const check = (def: unknown, key: string) => validateLevel(def).find((c) => c.key === key)!;

describe('hazards („Glas abseits")', () => {
  it('der Sog kann die Neigung nie überbieten – das ist die Invariante dahinter', () => {
    const maxForce = anchorDef.shape.force.parse(undefined) as number;
    // Der Schema-Default UND die Obergrenze liegen unter der Beschleunigung.
    expect(maxForce).toBeLessThan(new World([], { x: 0, y: 0, r: 1, vx: 0, vy: 0 } as never, null).accel);
    expect(() => anchorDef.parse({ type: 'anchor', cell: [0, 0], force: 2600 })).toThrow();
  });

  it('Anker im Korridor: grün (war rot und blockierte das Teilen)', () => {
    const def = corridor({ type: 'anchor', cell: [2, 0] });
    expect(check(def, 'hazards').ok, check(def, 'hazards').detail).toBe(true);
    // Die drei Checks sind sich jetzt einig – der Widerspruch war der Bug.
    expect(check(def, 'goal').ok).toBe(true);
    expect(check(def, 'softlock').ok).toBe(true);
  });

  it('Glas im Korridor: bleibt rot (eine Überfahrt hält es, zwei nicht)', () => {
    const def = corridor({ type: 'glass', cell: [2, 0] });
    expect(check(def, 'hazards').ok).toBe(false);
  });

  it('Glas in einer Nische: grün – Abkürzung oder Köder, nicht Pflichtweg', () => {
    const def = corridor({ type: 'glass', cell: [2, 0] });
    // (2,1) öffnen und das Glas dorthin verlegen: es liegt jetzt abseits.
    const f = (def.floors as Array<Record<string, unknown>>)[0]!;
    const maze = f.maze as { carve: unknown[]; add: unknown[] };
    maze.carve.push([[2, 0], 's']);
    maze.add = maze.add.filter((e) => {
      if (!Array.isArray(e)) return true;
      const cell = e[0] as number[];
      return !(cell[0] === 2 && e[1] === 's');
    });
    f.elements = [{ type: 'glass', cell: [2, 1] }];
    expect(check(def, 'hazards').ok, check(def, 'hazards').detail).toBe(true);
  });

  it('die Flags sind getrennt: anchorsBlocked sperrt weiter (Generator-Regel)', () => {
    const def = parseLevel(corridor({ type: 'anchor', cell: [2, 0] }));
    const withAnchors = reachable(def, { brittleOpen: true, doorsOpen: true, anchorsBlocked: true });
    const without = reachable(def, { brittleOpen: true, doorsOpen: true });
    expect(withAnchors.has(cellKey(0, [4, 0]))).toBe(false);
    expect(without.has(cellKey(0, [4, 0]))).toBe(true);
  });
});
