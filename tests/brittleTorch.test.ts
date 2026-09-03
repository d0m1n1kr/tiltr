import { describe, expect, it } from 'vitest';
import { parseLevel } from '../src/levels/schema';
import { loadLevel } from '../src/levels/loader';
import { brittleBreakable, brittlePassage, hitSide, sideFitsEdge } from '../src/core/brittle';
import { brittleKey, cellKey, isShareable, reachable, SOFT_CHECKS, validateLevel } from '../src/levels/validate';
import { mirrorLevel } from '../src/levels/mirror';
import { brittleSideOf, setBrittleSide, setEdgeVariant, toggleEdge, type MazeEdits } from '../src/ui/editor';

// Einseitig brüchige Wände (M66): bricht nur von der gewählten Seite; im
// Beweis eine gerichtete Kante von der Bruchseite her. Fackel: Licht ohne
// Klang und ohne Physik.
const carveAll = (cols: number, rows: number) => {
  const out: Array<[[number, number], 'e' | 's']> = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    if (x < cols - 1) out.push([[x, y], 'e']);
    if (y < rows - 1) out.push([[x, y], 's']);
  }
  return out;
};
// 3×2 (Schema: mindestens 2 Zeilen), untere Zeile zugemauert: ein 3er-Korridor,
// brüchige Wand zwischen Zelle 0 und 1, Start links, Ziel rechts.
const level = (side?: 'w' | 'e', extra: Record<string, unknown> = {}) =>
  parseLevel({
    id: 'x',
    name: 'x',
    floors: [
      {
        size: [3, 2],
        maze: {
          seed: 1,
          carve: carveAll(3, 2),
          add: [[[0, 0], 'e'], [[0, 0], 's'], [[1, 0], 's'], [[2, 0], 's']],
          brittle: [[[0, 0], 'e']],
          brittleSide: side ? [[[[0, 0], 'e'], side]] : [],
        },
        elements: [],
        start: [0, 0],
        goal: [2, 0],
        ...extra,
      },
    ],
  });

describe('Seitenlogik (core/brittle)', () => {
  const vWall = { x: 96, y: 0, w: 8, h: 100 };
  const hWall = { x: 0, y: 96, w: 100, h: 8 };
  it('hitSide: Ball links/oben der Wand → w/n, rechts/unten → e/s', () => {
    expect(hitSide(vWall, 60, 50)).toBe('w');
    expect(hitSide(vWall, 140, 50)).toBe('e');
    expect(hitSide(hWall, 50, 60)).toBe('n');
    expect(hitSide(hWall, 50, 140)).toBe('s');
  });
  it('brittleBreakable: ohne Seite immer, mit Seite nur von dort', () => {
    expect(brittleBreakable({ ...vWall }, 60, 50)).toBe(true);
    expect(brittleBreakable({ ...vWall, hpSide: 'w' }, 60, 50)).toBe(true);
    expect(brittleBreakable({ ...vWall, hpSide: 'w' }, 140, 50)).toBe(false);
  });
  it('sideFitsEdge und brittlePassage', () => {
    expect(sideFitsEdge([[0, 0], 'e'], 'w')).toBe(true);
    expect(sideFitsEdge([[0, 0], 'e'], 'n')).toBe(false);
    expect(brittlePassage([[0, 0], 'e'], 'w')).toEqual({ from: [0, 0], to: [1, 0] });
    expect(brittlePassage([[0, 0], 'e'], 'e')).toEqual({ from: [1, 0], to: [0, 0] });
    expect(brittlePassage([[2, 3], 's'], 's')).toEqual({ from: [2, 4], to: [2, 3] });
    expect(brittlePassage([[2, 3], 'n'], 'n')).toEqual({ from: [2, 2], to: [2, 3] });
  });
});

describe('Loader', () => {
  it('setzt hpSide auf der brüchigen Wand; beidseitig bleibt undefined', () => {
    const w1 = loadLevel(level('w')).world.walls.find((w) => w.hp !== undefined)!;
    expect(w1.hpSide).toBe('w');
    const w2 = loadLevel(level()).world.walls.find((w) => w.hp !== undefined)!;
    expect(w2.hpSide).toBeUndefined();
  });
  it('knallt bei Seite quer zur Wandlage und bei nicht-brüchiger Kante', () => {
    expect(() =>
      loadLevel({ ...level(), floors: [{ ...level().floors[0]!, maze: { ...level().floors[0]!.maze, brittleSide: [[[[0, 0], 'e'], 'n']] } }] }),
    ).toThrow(/passt nicht/);
    expect(() =>
      loadLevel({ ...level(), floors: [{ ...level().floors[0]!, maze: { ...level().floors[0]!.maze, brittle: [], brittleSide: [[[[0, 0], 'e'], 'w']] } }] }),
    ).toThrow(/nicht in brittle/);
  });
  it('Fackel landet in world.torches mit Radius, ohne Wand und ohne Klangquelle', () => {
    const def = level(undefined, { elements: [{ type: 'torch', cell: [1, 0], r: 200 }] });
    const l = loadLevel(def);
    expect(l.world.torches).toEqual([{ x: 150, y: 50, r: 200 }]);
    expect(parseLevel({ ...def, floors: [{ ...def.floors[0]!, elements: [{ type: 'torch', cell: [1, 0] }] }] }).floors[0]!.elements[0]).toMatchObject({ r: 160 });
  });
});

describe('Beweis', () => {
  it('beidseitig: die brüchige Wand ist im offenen Modell ein Durchgang', () => {
    expect(reachable(level(), { brittleOpen: true, doorsOpen: true }).has(cellKey(0, [2, 0]))).toBe(true);
  });
  it('einseitig von links: vom Start (links) durch, von rechts nicht zurück', () => {
    const def = level('w');
    expect(reachable(def, { brittleOpen: true, doorsOpen: true }).has(cellKey(0, [2, 0]))).toBe(true);
    // Start rechts: die Wand bricht nur von links – Zelle 0 bleibt unerreichbar.
    expect(reachable(def, { brittleOpen: true, doorsOpen: true }, { floor: 0, cell: [2, 0] }).has(cellKey(0, [0, 0]))).toBe(false);
  });
  it('einseitig von rechts: das Ziel ist vom Start aus NICHT erreichbar – goal rot', () => {
    const checks = validateLevel(level('e'));
    expect(checks.find((c) => c.key === 'goal')?.ok).toBe(false);
    expect(validateLevel(level('w')).find((c) => c.key === 'goal')?.ok).toBe(true);
  });
  it('Timer ist weich (M66): ein zu kurzer Zeitschalter warnt, blockiert das Teilen nicht', () => {
    expect(SOFT_CHECKS.has('timer')).toBe(true);
    const def = parseLevel({
      id: 'x',
      name: 'x',
      floors: [
        {
          size: [6, 2],
          maze: { seed: 1, carve: carveAll(6, 2), add: [0, 1, 2, 3, 4, 5].map((x) => [[x, 0], 's']) },
          elements: [
            { type: 'door', id: 'd', edge: [[4, 0], 'e'] },
            { type: 'timedSwitch', cell: [0, 0], opens: 'd', durationS: 0.5 },
          ],
          start: [0, 0],
          goal: [5, 0],
        },
      ],
    });
    const checks = validateLevel(def);
    expect(checks.find((c) => c.key === 'timer')?.ok).toBe(false);
    expect(isShareable(checks)).toBe(true);
  });
  it('mirrorLevel spiegelt die Bruchseite mit', () => {
    const m = mirrorLevel(level('w'), 'x');
    expect(m.floors[0]!.maze.brittleSide[0]![1]).toBe('e');
  });
});

describe('Editor-Helfer', () => {
  const maze = (): MazeEdits => ({ carve: [], add: [], brittle: [[[0, 0], 'e']], brittleSide: [[[[0, 0], 'e'], 'w']], absorb: [], mirrors: [] });
  it('brittleSideOf/setBrittleSide', () => {
    const m = maze();
    expect(brittleSideOf(m, [[0, 0], 'e'])).toBe('w');
    setBrittleSide(m, [[0, 0], 'e'], undefined);
    expect(brittleSideOf(m, [[0, 0], 'e'])).toBeUndefined();
    setBrittleSide(m, [[0, 0], 'e'], 'e');
    expect(m.brittleSide).toEqual([[[[0, 0], 'e'], 'e']]);
  });
  it('Variante weg oder Wand weg nimmt die Seite mit', () => {
    const m = maze();
    setEdgeVariant(m, [[0, 0], 'e'], 'absorb');
    expect(m.brittleSide).toEqual([]);
    const m2 = maze();
    toggleEdge(m2, [[0, 0], 'e'], false, false);
    expect(m2.brittleSide).toEqual([]);
  });
  it('toleriert Defs ohne brittleSide', () => {
    const m: MazeEdits = { carve: [], add: [], brittle: [[[0, 0], 'e']], absorb: [], mirrors: [] };
    expect(brittleSideOf(m, [[0, 0], 'e'])).toBeUndefined();
    setBrittleSide(m, [[0, 0], 'e'], 'w');
    expect(m.brittleSide).toHaveLength(1);
  });
});

// M68: Einseitig brüchige Wände mit ZUSTAND im Softlock-Beweis. Wer eine
// Zelle nur durch die Wand erreicht, hat sie gebrochen – von dort ist sie
// offen. Wer sie auch anders erreicht (Strömung), steht womöglich vor der
// intakten Wand: echter Softlock.
describe('Softlock mit einseitig brüchiger Wand (M68)', () => {
  // 4×2 offen; Wand zwischen (1,0) und (2,0) bricht von links (Zelle 1 aus).
  // Tasche = rechte Hälfte (2,0),(3,0),(2,1),(3,1); Kante (1,1)-e trennt unten.
  const pocket = (second: 'sealed' | 'current', players: 1 | 2 = 1) =>
    parseLevel({
      id: 'p',
      name: 'p',
      ...(players === 2 ? { players: 2, mpMode: 'coop' } : {}),
      floors: [
        {
          size: [4, 2],
          maze: {
            seed: 1,
            carve: carveAll(4, 2).filter(([[x, y], d]) => !(x === 1 && d === 'e' && (y === 0 || second === 'sealed'))),
            add: [[[1, 0], 'e'], ...(second === 'sealed' ? [[[1, 1], 'e'] as [[number, number], 'e']] : [])],
            brittle: [[[1, 0], 'e']],
            brittleSide: [[[[1, 0], 'e'], 'w']],
          },
          elements: second === 'current' ? [{ type: 'current', cell: [1, 1], dir: 'e' }] : [],
          start: [0, 0],
          goal: [1, 0],
          ...(players === 2 ? { start2: [0, 1], goal2: [0, 0] } : {}),
        },
      ],
    });
  const badge = (def: ReturnType<typeof pocket>, key: string) => validateLevel(def).find((c) => c.key === key)!;

  it('Tasche nur durch die Wand erreichbar: die Wand ist dort gebrochen, kein Softlock', () => {
    const def = pocket('sealed');
    expect(reachable(def, { brittleOpen: true, doorsOpen: true }).has(cellKey(0, [3, 1]))).toBe(true);
    expect(badge(def, 'softlock').ok).toBe(true);
    expect(isShareable(validateLevel(def))).toBe(true);
  });
  it('Tasche auch per Strömung erreichbar: dort steht die Wand womöglich noch – Softlock', () => {
    const def = pocket('current');
    const sl = badge(def, 'softlock');
    expect(sl.ok).toBe(false);
    // Gemeldet wird die erste verlorene Zelle: die Strömungszelle selbst oder die Tasche.
    expect(['0:1,1', '0:2,0', '0:3,0', '0:2,1', '0:3,1']).toContain(sl.detail);
  });
  it('brokenBrittle öffnet die Wand in beide Richtungen, sealedBrittle nimmt die Kante', () => {
    const def = pocket('sealed');
    const w = brittleKey(0, [[1, 0], 'e']);
    const back = { floor: 0, cell: [2, 0] as [number, number] };
    expect(reachable(def, { brittleOpen: true, doorsOpen: true }, back).has(cellKey(0, [1, 0]))).toBe(false);
    expect(reachable(def, { brittleOpen: true, doorsOpen: true, brokenBrittle: new Set([w]) }, back).has(cellKey(0, [1, 0]))).toBe(true);
    expect(reachable(def, { brittleOpen: true, doorsOpen: true, sealedBrittle: new Set([w]) }).has(cellKey(0, [2, 0]))).toBe(false);
  });
  it('zwei Spieler: jeder bricht in seiner Welt – Tasche für beide kein Softlock', () => {
    const def = pocket('sealed', 2);
    expect(badge(def, 'softlock').ok).toBe(true);
    expect(badge(def, 'coop').ok).toBe(true);
  });
});
