// Ebenen im Editor: Was passiert, wenn eine Ebene verschwindet?
//
// Der Kern ist eine Falle des Levelformats: `start` ist PRO EBENE Pflicht
// (schema.ts), aber nur `floors[0].start` setzt die Kugel (loader.ts). Auf
// tieferen Ebenen ist der Wert damit tot – bis Ebene 1 gelöscht wird und die
// nachrückende Ebene ihren toten Start plötzlich ernst nehmen muss.

import { describe, expect, it } from 'vitest';
import { freeCellFor, removeFloor, type RawLevel } from '../src/ui/editor';
import { parseLevel } from '../src/levels/schema';
import { loadLevel } from '../src/levels/loader';
import { CELL } from '../src/core/constants';

type RawFloor = RawLevel['floors'][number];

const fl = (over: Partial<RawFloor> = {}): RawFloor => ({
  size: [4, 4],
  maze: { seed: 1, carve: [], add: [], brittle: [] },
  elements: [],
  start: [0, 0],
  goal: null,
  ...over,
});

const lv = (floors: RawFloor[]): RawLevel => ({ id: 'test', name: 'Test', floors });

describe('freeCellFor', () => {
  it('behält die Wunschzelle, wenn sie frei ist', () => {
    expect(freeCellFor(fl(), [2, 3])).toEqual([2, 3]);
  });

  it('weicht einem Element aus', () => {
    const f = fl({ elements: [{ type: 'hole', cell: [0, 0] }] });
    expect(freeCellFor(f, [0, 0])).toEqual([1, 0]);
  });

  it('weicht auch einem Wächter-Wegpunkt aus (nicht nur seiner Zelle)', () => {
    const f = fl({ elements: [{ type: 'guard', patrol: [[0, 0], [2, 0]] as Array<[number, number]> }] });
    // (0,0) und (2,0) sind Wegpunkte; die Zeile dazwischen ist noch frei.
    expect(freeCellFor(f, [0, 0])).toEqual([1, 0]);
    expect(freeCellFor(f, [2, 0])).toEqual([1, 0]);
  });

  it('respektiert zusätzlich gesperrte Zellen (Start vs. Ziel)', () => {
    expect(freeCellFor(fl(), [1, 1], [[1, 1]])).toEqual([0, 0]);
  });

  it('Kanten-Elemente belegen keine Zelle', () => {
    const f = fl({ elements: [{ type: 'door', edge: [[0, 0], 'e'], id: 'tor1' } as never] });
    expect(freeCellFor(f, [0, 0])).toEqual([0, 0]);
  });

  it('gibt die Wunschzelle zurück, wenn nichts frei ist', () => {
    const elements = [];
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) elements.push({ type: 'hole', cell: [x, y] as [number, number] });
    expect(freeCellFor(fl({ elements }), [3, 3])).toEqual([3, 3]);
  });
});

describe('removeFloor', () => {
  it('räumt Transporter auf: Ziele auf die Ebene fallen weg, höhere rutschen nach', () => {
    const level = lv([
      fl({
        elements: [
          { type: 'transporter', cell: [1, 0], target: { floor: 1, cell: [0, 0] } },
          { type: 'transporter', cell: [2, 0], target: { floor: 2, cell: [0, 0] } },
        ],
      }),
      fl(),
      fl({ goal: [3, 3] }),
    ]);
    removeFloor(level, 1);
    expect(level.floors).toHaveLength(2);
    const types = level.floors[0]!.elements.map((e) => (e as { target?: { floor: number } }).target?.floor);
    expect(types).toEqual([1]); // das Ziel auf Ebene 2 ist weg, Ebene 3 -> Ebene 2
  });

  it('rettet das Ziel auf Ebene 1, wenn die Ziel-Ebene verschwindet', () => {
    const level = lv([fl(), fl({ goal: [3, 3] })]);
    removeFloor(level, 1);
    expect(level.floors[0]!.goal).toEqual([3, 3]);
  });

  it('setzt das gerettete Ziel in eine FREIE Zelle', () => {
    // Die Ecke, in die das Ziel sonst wandert, ist von einem Loch besetzt.
    const level = lv([fl({ elements: [{ type: 'hole', cell: [3, 3] }] }), fl({ goal: [1, 1] })]);
    removeFloor(level, 1);
    expect(level.floors[0]!.goal).not.toEqual([3, 3]);
    expect(level.floors[0]!.goal).not.toEqual(level.floors[0]!.start);
  });

  it('Ebene 1 löschen: der tote Start der nachrückenden Ebene bleibt, wenn er frei ist', () => {
    const level = lv([fl({ goal: [3, 3] }), fl({ start: [2, 1] })]);
    removeFloor(level, 0);
    expect(level.floors[0]!.start).toEqual([2, 1]);
  });

  it('Ebene 1 löschen: ein Start IM Element wird auf eine freie Zelle gerückt', () => {
    // Genau die Falle: E2 durfte (0,0) mit einem Loch belegen, weil ihr Start
    // tot war. Nach dem Löschen von E1 würde die Kugel im Loch aufwachen.
    const level = lv([
      fl({ goal: [3, 3] }),
      fl({ start: [0, 0], elements: [{ type: 'hole', cell: [0, 0] }] }),
    ]);
    removeFloor(level, 0);
    const s = level.floors[0]!.start;
    expect(s).not.toEqual([0, 0]);
    // Und die Kugel steht danach wirklich woanders als im Loch.
    const loaded = loadLevel(parseLevel(level));
    expect(loaded.floors[0]!.world.ball.x).toBeCloseTo(s[0] * CELL + CELL / 2, 5);
    expect(loaded.floors[0]!.world.holes.some((h) => Math.hypot(h.x - loaded.floors[0]!.world.ball.x, h.y - loaded.floors[0]!.world.ball.y) < 1)).toBe(false);
  });

  it('Start und gerettetes Ziel landen nie auf derselben Zelle', () => {
    const level = lv([
      fl({ goal: [1, 1] }),
      fl({ start: [3, 3], elements: [] }),
    ]);
    removeFloor(level, 0);
    expect(level.floors[0]!.start).not.toEqual(level.floors[0]!.goal);
  });

  it('die letzte Ebene lässt sich nicht löschen', () => {
    const level = lv([fl({ goal: [3, 3] })]);
    removeFloor(level, 0);
    expect(level.floors).toHaveLength(1);
  });
});
