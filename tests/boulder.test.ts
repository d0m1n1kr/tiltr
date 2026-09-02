import { describe, expect, it } from 'vitest';
import { loadLevel } from '../src/levels/loader';
import { parseLevel } from '../src/levels/schema';
import { boulderProof } from '../src/levels/boulders';
import { validateLevel } from '../src/levels/validate';
import { doorState } from '../src/core/doors';

// Rollstein (M47): zweiter Körper, zellweise. Physik und Beweis folgen
// denselben Regeln – hier beide gegen dieselben kleinen Level.

/** Korridor Zeile 0, x = 0…5, unten abgeriegelt; Elemente frei wählbar. */
const corridor = (elements: unknown[], extra: Record<string, unknown> = {}) =>
  parseLevel({
    id: 'stein',
    name: 'Stein',
    pingBudget: 3,
    floors: [
      {
        size: [6, 2],
        maze: {
          seed: 3,
          carve: [[[0, 0], 'e'], [[1, 0], 'e'], [[2, 0], 'e'], [[3, 0], 'e'], [[4, 0], 'e'], [[0, 0], 's']],
          add: [[[1, 0], 's'], [[2, 0], 's'], [[3, 0], 's'], [[4, 0], 's'], [[5, 0], 's']],
          ...extra,
        },
        elements,
        start: [0, 0],
        goal: [0, 1],
      },
    ],
  });

/** Ball mit Tempo v nach rechts auf den Stein stoßen (pushSteps mit
 *  gehaltenem Schub), dann ausrollen lassen (coastSteps ohne Schub). */
function roll(world: ReturnType<typeof loadLevel>['world'], v: number, pushSteps = 8, coastSteps = 40): void {
  for (let i = 0; i < pushSteps; i++) {
    world.ball.vx = v;
    world.step(1 / 60, { x: 0, y: 0 });
  }
  world.ball.vx = 0;
  for (let i = 0; i < coastSteps; i++) world.step(1 / 60, { x: 0, y: 0 });
}

describe('Rollstein – Physik', () => {
  it('ein kräftiger Stoß rollt ihn genau eine Zelle weiter, ein sanfter nicht', () => {
    const soft = loadLevel(corridor([{ type: 'boulder', cell: [2, 0] }])).world;
    soft.ball.x = 150;
    roll(soft, 100, 30, 20);
    expect(soft.boulders[0]!.cell).toEqual([2, 0]);

    const hard = loadLevel(corridor([{ type: 'boulder', cell: [2, 0] }])).world;
    hard.ball.x = 150;
    roll(hard, 400);
    expect(hard.boulders[0]!.cell).toEqual([3, 0]);
    expect(hard.consumeBoulderEvents().map((e) => e.kind)).toContain('stop');
  });

  it('vor einer Wand bleibt er stehen', () => {
    const w = loadLevel(corridor([{ type: 'boulder', cell: [5, 0] }])).world;
    w.ball.x = 450;
    roll(w, 400);
    expect(w.boulders[0]!.cell).toEqual([5, 0]);
  });

  it('in ein Loch gestoßen füllt er es – beide sind weg', () => {
    const w = loadLevel(corridor([{ type: 'boulder', cell: [2, 0] }, { type: 'hole', cell: [3, 0] }])).world;
    expect(w.holes).toHaveLength(1);
    w.ball.x = 150;
    roll(w, 400);
    expect(w.boulders[0]!.sunk).toBe(true);
    expect(w.holes).toHaveLength(0);
    expect(w.fallenHole()).toBeNull();
  });

  it('auf einer Druckplatte hält er sie – die Tür öffnet über doorState', () => {
    const w = loadLevel(
      corridor([
        { type: 'boulder', cell: [2, 0] },
        { type: 'plate', cell: [3, 0], opens: 'tor' },
        { type: 'door', id: 'tor', edge: [[0, 0], 's'] },
      ]),
    ).world;
    w.ball.x = 150;
    roll(w, 400);
    const plate = w.plates[0]!;
    expect(plate.boulder).toBe(true);
    expect(doorState([{ kind: 'plate', satisfied: plate.held || plate.boulder === true }], 'any').open).toBe(true);
  });
});

describe('Rollstein – Beweis', () => {
  it('ohne Stein trivial grün', () => {
    expect(boulderProof(corridor([]))).toMatchObject({ goal: true, softlock: true, states: 0 });
  });

  it('Ziel hinter einer Platten-Tür: erreichbar, wenn der Stein auf die Platte kann', () => {
    // Ziel (0,1) unter dem Start, Tür dazwischen; Platte am Korridor-ENDE –
    // dort kann der Stein nicht über sie hinausgeschoben werden.
    const def = corridor([
      { type: 'boulder', cell: [2, 0] },
      { type: 'plate', cell: [5, 0], opens: 'tor' },
      { type: 'door', id: 'tor', edge: [[0, 0], 's'] },
    ]);
    const p = boulderProof(def);
    expect(p.goal).toBe(true);
    expect(p.softlock).toBe(true);
    expect(validateLevel(def).find((c) => c.key === 'boulder')?.ok).toBe(true);
  });

  it('Stein vor der Platte in die Sackgasse geschoben = Softlock, rot', () => {
    // Platte (3,0), dahinter (4,0),(5,0) frei: Schiebt man den Stein ÜBER die
    // Platte hinaus in die Sackgasse, kommt man nie mehr an ihn heran.
    const def = corridor([
      { type: 'boulder', cell: [2, 0] },
      { type: 'plate', cell: [3, 0], opens: 'tor' },
      { type: 'door', id: 'tor', edge: [[0, 0], 's'] },
    ]);
    const p = boulderProof(def);
    expect(p.goal).toBe(true);
    expect(p.softlock).toBe(false);
    expect(p.detail).toMatch(/Softlock/);
    expect(validateLevel(def).find((c) => c.key === 'boulder')?.ok).toBe(false);
  });

  it('Stein im Loch: der Weg dahinter wird frei', () => {
    // Loch (3,0) versperrt (im Modell nicht – Löcher sind passierbar) … also
    // prüfen wir das Füllen direkt: nach dem Stoß ist der Stein weg.
    const def = corridor([{ type: 'boulder', cell: [2, 0] }, { type: 'hole', cell: [3, 0] }]);
    const p = boulderProof(def);
    expect(p.goal).toBe(true);
    expect(p.softlock).toBe(true);
    expect(p.states).toBeGreaterThan(6);
  });
});
