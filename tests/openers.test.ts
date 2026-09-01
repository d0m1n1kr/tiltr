// Öffner-Fixpunkt: „Geht diese Tür überhaupt jemals auf?"
//
// Die Frage gehört PRO TÜR gestellt, nicht pro Schlüssel. Der alte Check
// schloss ALLE Türen gleichzeitig und verlangte jeden Schlüssel in dieser
// Welt erreichbar – damit galt die gewöhnlichste Progression überhaupt als
// Fehler: Schlüssel 1 -> Tür 1 -> Schlüssel 2 -> Tür 2. Aufgefallen ist es
// als Widerspruch IM BERICHT: `goal` (Fixpunkt) stempelte grün, `openers`
// rot. Zwei Checks derselben Datei, zwei Meinungen – der falsche war
// `openers`.

import { describe, expect, it } from 'vitest';
import { validateLevel } from '../src/levels/validate';

/** Korridor x = 0…4 in Reihe 0, Reihe 1 abgeriegelt. Start (0,0), Ziel (4,0). */
const corridor = (elements: unknown[]) => ({
  id: 'op', name: 'Öffner', pingBudget: 3,
  floors: [{
    size: [5, 2],
    maze: {
      seed: 3,
      carve: [[[0, 0], 'e'], [[1, 0], 'e'], [[2, 0], 'e'], [[3, 0], 'e']],
      add: [[[0, 0], 's'], [[1, 0], 's'], [[2, 0], 's'], [[3, 0], 's'], [[4, 0], 's']],
    },
    elements,
    start: [0, 0], goal: [4, 0],
  }],
});

const openers = (def: unknown) => validateLevel(def).find((c) => c.key === 'openers')!;
const goal = (def: unknown) => validateLevel(def).find((c) => c.key === 'goal')!;

describe('openers', () => {
  it('verkettete Türen sind KEIN Fehler (Schlüssel 2 liegt hinter Tür 1)', () => {
    const def = corridor([
      { type: 'door', edge: [[1, 0], 'e'], id: 'tor1' },
      { type: 'key', cell: [1, 0], opens: 'tor1' },
      { type: 'door', edge: [[3, 0], 'e'], id: 'tor2' },
      { type: 'key', cell: [3, 0], opens: 'tor2' },
    ]);
    expect(openers(def).ok, openers(def).detail).toBe(true);
    // Der Widerspruch, der den Bug aufgedeckt hat, ist damit aufgelöst:
    expect(goal(def).ok).toBe(true);
  });

  it('ein Riegel bleibt ein Riegel: der einzige Schlüssel liegt hinter seiner Tür', () => {
    const c = openers(corridor([
      { type: 'door', edge: [[1, 0], 'e'], id: 'tor1' },
      { type: 'key', cell: [3, 0], opens: 'tor1' },
    ]));
    expect(c.ok).toBe(false);
    expect(c.detail).toContain('tor1'); // die Meldung nennt die TÜR, nicht nur den Schlüssel
  });

  it('zwei Schlüssel für eine Tür: einer davor genügt', () => {
    const c = openers(corridor([
      { type: 'door', edge: [[2, 0], 'e'], id: 'tor1' },
      { type: 'key', cell: [1, 0], opens: 'tor1' },
      { type: 'key', cell: [3, 0], opens: 'tor1' },
    ]));
    expect(c.ok, c.detail).toBe(true);
  });

  it('zwei Schlüssel, BEIDE dahinter: rot', () => {
    expect(openers(corridor([
      { type: 'door', edge: [[1, 0], 'e'], id: 'tor1' },
      { type: 'key', cell: [2, 0], opens: 'tor1' },
      { type: 'key', cell: [3, 0], opens: 'tor1' },
    ])).ok).toBe(false);
  });

  it('Schlüssel drinnen, Platte draußen: die Platte öffnet die Tür (Coop)', () => {
    const c = openers(corridor([
      { type: 'door', edge: [[2, 0], 'e'], id: 'tor1' },
      { type: 'plate', cell: [1, 0], opens: 'tor1' },
      { type: 'key', cell: [3, 0], opens: 'tor1' },
    ]));
    expect(c.ok, c.detail).toBe(true);
  });

  it('reine Platten-Tür bleibt ungeprüft (Umfang unverändert)', () => {
    const c = openers(corridor([
      { type: 'door', edge: [[1, 0], 'e'], id: 'tor1' },
      { type: 'plate', cell: [3, 0], opens: 'tor1' },
    ]));
    expect(c.ok).toBe(true);
  });

  it('über Ebenen: Schlüssel auf E3 hinter einer Tür auf E1', () => {
    // E1: Start – Tür – Schlüssel1 – Transporter. E3 trägt Schlüssel2 + Tür2.
    const def = {
      id: 'op3', name: 'Drei', pingBudget: 3,
      floors: [
        {
          size: [4, 2],
          maze: { seed: 5, carve: [[[0, 0], 'e'], [[1, 0], 'e'], [[2, 0], 'e']],
            add: [[[0, 0], 's'], [[1, 0], 's'], [[2, 0], 's'], [[3, 0], 's']] },
          elements: [
            { type: 'door', edge: [[0, 0], 'e'], id: 'tor1' },
            { type: 'key', cell: [0, 0], opens: 'tor1' },
            { type: 'transporter', cell: [3, 0], target: { floor: 1, cell: [0, 0] } },
          ],
          start: [0, 0], goal: null,
        },
        {
          size: [4, 2],
          maze: { seed: 6, carve: [[[0, 0], 'e'], [[1, 0], 'e'], [[2, 0], 'e']],
            add: [[[0, 0], 's'], [[1, 0], 's'], [[2, 0], 's'], [[3, 0], 's']] },
          elements: [{ type: 'transporter', cell: [3, 0], target: { floor: 2, cell: [0, 0] } }],
          start: [0, 0], goal: null,
        },
        {
          size: [4, 2],
          maze: { seed: 7, carve: [[[0, 0], 'e'], [[1, 0], 'e'], [[2, 0], 'e']],
            add: [[[0, 0], 's'], [[1, 0], 's'], [[2, 0], 's'], [[3, 0], 's']] },
          elements: [
            { type: 'key', cell: [1, 0], opens: 'tor2' },
            { type: 'door', edge: [[1, 0], 'e'], id: 'tor2' },
          ],
          start: [0, 0], goal: [3, 0],
        },
      ],
    };
    const c = openers(def);
    expect(c.ok, c.detail).toBe(true);
    expect(goal(def).ok).toBe(true);
  });
});
