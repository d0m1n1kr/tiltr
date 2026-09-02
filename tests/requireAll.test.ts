// Türen mit mehreren Öffnern (M41): require 'all' im Beweis und helle Ebenen.
//
// Korridor x = 0…5, Reihe 1 abgeriegelt. Tür bei (2,0)/e. Zwei Schlüssel:
// einer davor (1,0), einer dahinter (4,0). Mit 'any' öffnet der vordere die
// Tür (grün); mit 'all' liegt ein Pflicht-Öffner hinter der Tür – Riegel.

import { describe, expect, it } from 'vitest';
import { coopReachable, validateLevel } from '../src/levels/validate';
import { parseLevel } from '../src/levels/schema';
import { loadLevel } from '../src/levels/loader';
import { mirrorLevel } from '../src/levels/mirror';
import { cellKey } from './helpers';

const corridor = (doorExtra: Record<string, unknown>, keys: Array<[number, number]>) => ({
  id: 'ra', name: 'Alle', pingBudget: 3,
  floors: [{
    size: [6, 2],
    maze: {
      seed: 3,
      carve: [[[0, 0], 'e'], [[1, 0], 'e'], [[2, 0], 'e'], [[3, 0], 'e'], [[4, 0], 'e']],
      add: [[[0, 0], 's'], [[1, 0], 's'], [[2, 0], 's'], [[3, 0], 's'], [[4, 0], 's'], [[5, 0], 's']],
    },
    elements: [
      { type: 'door', id: 'tor', edge: [[2, 0], 'e'], ...doorExtra },
      ...keys.map((cell) => ({ type: 'key', cell, opens: 'tor' })),
    ],
    start: [0, 0], goal: [5, 0],
  }],
});
const check = (def: unknown, key: string) => validateLevel(def).find((c) => c.key === key)!;

describe('door.require', () => {
  it('Schema: Default any, all erlaubt', () => {
    const def = parseLevel(corridor({}, [[1, 0]]));
    expect(def.floors[0]!.elements.find((e) => e.type === 'door')).toMatchObject({ require: 'any' });
    expect(parseLevel(corridor({ require: 'all' }, [[1, 0]])).floors[0]!.elements[0]).toMatchObject({ require: 'all' });
    expect(() => parseLevel(corridor({ require: 'some' }, [[1, 0]]))).toThrow();
  });

  it('any: Schlüssel vor der Tür genügt, auch wenn der zweite dahinter liegt', () => {
    const def = corridor({}, [[1, 0], [4, 0]]);
    expect(check(def, 'goal').ok).toBe(true);
    expect(check(def, 'openers').ok).toBe(true);
  });

  it('all: ein Öffner hinter der Tür ist ein Riegel – goal UND openers rot, einig', () => {
    const def = corridor({ require: 'all' }, [[1, 0], [4, 0]]);
    expect(check(def, 'goal').ok).toBe(false);
    const op = check(def, 'openers');
    expect(op.ok).toBe(false);
    expect(op.detail).toContain('4,0');
  });

  it('all: beide Öffner vor der Tür – grün', () => {
    const def = corridor({ require: 'all' }, [[0, 0], [1, 0]]);
    expect(check(def, 'goal').ok).toBe(true);
    expect(check(def, 'openers').ok).toBe(true);
    expect(check(def, 'softlock').ok).toBe(true);
  });

  it('coopReachable öffnet eine all-Tür erst, wenn alle Öffner erreichbar sind', () => {
    const one = parseLevel(corridor({ require: 'all' }, [[1, 0], [4, 0]]));
    expect(coopReachable(one).has(cellKey(0, [5, 0]))).toBe(false);
    const both = parseLevel(corridor({ require: 'all' }, [[0, 0], [1, 0]]));
    expect(coopReachable(both).has(cellKey(0, [5, 0]))).toBe(true);
  });

  it('der Loader trägt require an die Tür-Wand', () => {
    const world = loadLevel(parseLevel(corridor({ require: 'all' }, [[1, 0]]))).floors[0]!.world;
    expect(world.walls.find((w) => w.door)?.door?.require).toBe('all');
  });
});

describe('floor.bright', () => {
  it('Default dunkel; hell kommt bis in die geladene Ebene und überlebt die Spiegelung', () => {
    const raw = corridor({}, [[1, 0]]);
    expect(parseLevel(raw).floors[0]!.bright).toBe(false);
    expect(loadLevel(parseLevel(raw)).floors[0]!.bright).toBe(false);
    (raw.floors[0] as Record<string, unknown>).bright = true;
    const def = parseLevel(raw);
    expect(loadLevel(def).floors[0]!.bright).toBe(true);
    expect(mirrorLevel(def, 'x').floors[0]!.bright).toBe(true);
  });
});
