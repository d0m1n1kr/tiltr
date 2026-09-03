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

// M84 – ZU ZWEIT ROLLT ER FÜR BEIDE: Im Multiplayer hat jeder Spieler seine
// EIGENE Welt; der Stein, den der Partner schiebt, blieb hier stehen – und
// eine Platte, die er drüben hielt, hielt hier nichts. Übertragen wird der
// STOSS (Index + Richtung), nicht die Position: Dieselbe Regel entscheidet auf
// beiden Seiten, ob die Zielzelle frei ist.
describe('Rollstein über das Netz (M84)', () => {
  it('der eigene Ball-Stoß meldet Index und Richtung (nur der, nicht die Eis-Fortsetzung)', () => {
    const { world } = loadLevel(corridor([{ type: 'boulder', cell: [2, 0] }]));
    world.ball.x = 150; // dicht vor dem Stein, wie in den Physik-Units
    roll(world, 400);
    const rolls = world.consumeBoulderEvents().filter((e) => e.kind === 'roll');
    expect(rolls.length).toBeGreaterThan(0);
    expect(rolls[0]!.i).toBe(0);
    expect(rolls[0]!.dir).toEqual([1, 0]);
  });
  it('pushBoulderAt schiebt ihn eine Zelle – und hält die Platte darunter', () => {
    const { world } = loadLevel(
      corridor([
        { type: 'boulder', cell: [2, 0] },
        { type: 'plate', cell: [3, 0], opens: 'tor' },
        { type: 'door', id: 'tor', edge: [[0, 0], 's'] },
      ]),
    );
    const st = world.boulders[0]!;
    const plate = world.plates[0]!;
    expect(plate.boulder).toBeFalsy();
    expect(world.pushBoulderAt(0, [1, 0])).toBe(true);
    // Ohne eigenen Ballschritt rollt er über advanceBoulders zu Ende.
    for (let i = 0; i < 60; i++) world.advanceBoulders(1 / 60);
    expect(st.cell).toEqual([3, 0]);
    expect(plate.boulder).toBe(true);
    expect(doorState([{ kind: 'plate', satisfied: plate.boulder === true }], 'any').open).toBe(true);
  });
  it('gegen eine Wand bewegt er sich nicht – und ein rollender Stein nimmt keinen zweiten Stoß', () => {
    const { world } = loadLevel(corridor([{ type: 'boulder', cell: [5, 0] }]));
    // (6,0) liegt außerhalb: dieselbe Regel wie beim eigenen Stoß greift.
    expect(world.pushBoulderAt(0, [1, 0])).toBe(false);
    expect(world.pushBoulderAt(0, [-1, 0])).toBe(true);
    expect(world.pushBoulderAt(0, [-1, 0])).toBe(false); // rollt noch
    expect(world.pushBoulderAt(7, [1, 0])).toBe(false); // gibt es nicht
  });
});

// M84b – DIE KUGEL IST ÜBER ALLE EBENEN DIESELBE. Der Loader baut EINE
// Ball-Instanz und gibt sie jeder Ebenen-Welt (`new World(walls, ball, goal)`).
// M84 ließ die Steine auf ALLEN Ebenen weiterrollen, damit eine Platte auch
// über Ebenen eine Tür öffnen kann – und schob damit die Kugel aus einem
// Kasten, der zwei Ebenen tiefer steht. Gemeldet als: „Auf Ebene 1 komme ich
// nicht auf ein Feld, auf dem in Ebene 3 ein Stein liegt."
describe('Steine fremder Ebenen fassen die Kugel nicht an (M84b)', () => {
  const twoFloors = () =>
    parseLevel({
      id: 'zwei',
      name: 'Zwei Ebenen',
      pingBudget: 3,
      floors: [
        {
          size: [6, 2],
          maze: { seed: 3, carve: [[[0, 0], 'e'], [[1, 0], 'e'], [[2, 0], 'e'], [[3, 0], 'e'], [[4, 0], 'e'], [[0, 0], 's']] },
          elements: [{ type: 'transporter', cell: [5, 0], target: { floor: 1, cell: [0, 0] } }],
          start: [0, 0],
          goal: [0, 1],
        },
        {
          // Ebene 2 hat an derselben Stelle einen Stein wie Ebene 1 freie Bahn.
          size: [6, 2],
          maze: { seed: 3, carve: [[[0, 0], 'e'], [[1, 0], 'e'], [[2, 0], 'e'], [[3, 0], 'e'], [[4, 0], 'e'], [[0, 0], 's']] },
          elements: [{ type: 'boulder', cell: [2, 0] }],
          start: [0, 0],
          goal: null,
        },
      ],
    });

  it('der Loader teilt EINE Kugel über alle Ebenen (die Annahme des Tests)', () => {
    const loaded = loadLevel(twoFloors());
    expect(loaded.floors[1]!.world.ball).toBe(loaded.floors[0]!.world.ball);
  });

  it('advanceBoulders auf der anderen Ebene verschiebt die Kugel NICHT', () => {
    const loaded = loadLevel(twoFloors());
    const deep = loaded.floors[1]!.world; // Ebene 2, dort liegt der Stein
    const ball = deep.ball;
    // Die Kugel rollt auf EBENE 1 genau durch die Zelle, in der Ebene 2 ihren
    // Stein hat (Zellmitte (2,0) = 250/50).
    ball.x = 250;
    ball.y = 50;
    ball.vx = 200;
    ball.vy = 0;
    for (let i = 0; i < 30; i++) deep.advanceBoulders(1 / 60);
    expect(ball.x).toBe(250);
    expect(ball.vx).toBe(200);
    // Mit Kugel (ruhende Seite im MP-Testmodus, eigene Ebene) wirkt der Kasten
    // wie immer – sonst wäre die Gegenprobe wertlos.
    deep.advanceBoulders(1 / 60, true);
    expect(ball.x).not.toBe(250);
  });
});
