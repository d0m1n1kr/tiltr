import { describe, expect, it } from 'vitest';
import { TUTORIAL_LEVELS } from '../src/levels/tutorial';
import { loadLevel } from '../src/levels/loader';
import { generateQuickLevel, PRESETS, type Preset } from '../src/levels/quick';
import { generateMaze, setWall, solveMaze } from '../src/core/maze';
import { mulberry32 } from '../src/core/rng';
import type { LevelDef } from '../src/levels/schema';

// Lösbarkeit auf Zell-Ebene: brüchige Wände gelten als passierbar (man kann
// sie einstürzen), carve/add werden wie im Loader angewendet.
function isSolvable(def: LevelDef): boolean {
  const floor = def.floors[0]!;
  const [cols, rows] = floor.size;
  const cells = generateMaze(cols, rows, mulberry32(floor.maze.seed));
  for (const [[x, y], dir] of floor.maze.carve) setWall(cells, cols, rows, x, y, dir, false);
  for (const [[x, y], dir] of floor.maze.add) setWall(cells, cols, rows, x, y, dir, true);
  for (const [[x, y], dir] of floor.maze.brittle) setWall(cells, cols, rows, x, y, dir, false);
  const path = solveMaze(
    cells,
    cols,
    rows,
    { x: floor.start[0], y: floor.start[1] },
    { x: floor.goal![0], y: floor.goal![1] },
  );
  return path.length > 0;
}

describe('Tutorial', () => {
  it('hat 8 Level mit Intro-Texten und eindeutigen IDs', () => {
    expect(TUTORIAL_LEVELS).toHaveLength(8);
    const ids = TUTORIAL_LEVELS.map((l) => l.id);
    expect(new Set(ids).size).toBe(8);
    for (const l of TUTORIAL_LEVELS) expect(l.intro?.length ?? 0).toBeGreaterThan(20);
  });

  it('alle Level laden und sind lösbar', () => {
    for (const def of TUTORIAL_LEVELS) {
      expect(() => loadLevel(def), def.id).not.toThrow();
      expect(isSolvable(def), `${def.id} unlösbar`).toBe(true);
    }
  });

  it('tut-7: Ziel NUR durch die brüchige Wand erreichbar', () => {
    const def = TUTORIAL_LEVELS.find((l) => l.id === 'tut-7')!;
    const floor = def.floors[0]!;
    const [cols, rows] = floor.size;
    const cells = generateMaze(cols, rows, mulberry32(floor.maze.seed));
    for (const [[x, y], dir] of floor.maze.carve) setWall(cells, cols, rows, x, y, dir, false);
    for (const [[x, y], dir] of floor.maze.add) setWall(cells, cols, rows, x, y, dir, true);
    // OHNE Einsturz: unlösbar
    const blocked = solveMaze(cells, cols, rows, { x: 0, y: 0 }, { x: 2, y: 0 });
    expect(blocked).toHaveLength(0);
    // Loader markiert die Wand als brüchig
    const { world } = loadLevel(def);
    expect(world.walls.some((w) => w.hp === 2)).toBe(true);
  });

  it('lehnt brüchige Kanten ab, die nicht existieren oder außen liegen', () => {
    const base = TUTORIAL_LEVELS.find((l) => l.id === 'tut-7')!;
    const broken = structuredClone(base);
    broken.floors[0]!.maze.brittle = [[[0, 0], 'n']]; // Außenwand
    expect(() => loadLevel(broken)).toThrow(/Außenwand/);
    const missing = structuredClone(base);
    missing.floors[0]!.maze.brittle = [[[0, 0], 'e']]; // wurde gecarvt -> existiert nicht
    expect(() => loadLevel(missing)).toThrow(/existiert nicht/);
  });
});

describe('Presets', () => {
  it('jedes Preset erzeugt ladbare, lösbare Level mit passenden Mengen', () => {
    for (const preset of Object.keys(PRESETS) as Preset[]) {
      for (const seed of [1, 42]) {
        const def = generateQuickLevel(seed, preset);
        const { world } = loadLevel(def);
        expect(world.holes).toHaveLength(PRESETS[preset].holes);
        expect(world.windZones).toHaveLength(PRESETS[preset].wind);
        expect(world.checkpoints).toHaveLength(2);
        expect(def.pingBudget).toBe(PRESETS[preset].pings);
        expect(isSolvable(def)).toBe(true);
      }
    }
  });

  it('Presets unterscheiden sich in der Feldgröße', () => {
    expect(generateQuickLevel(1, 'easy').floors[0]!.size).toEqual([5, 7]);
    expect(generateQuickLevel(1, 'hard').floors[0]!.size).toEqual([11, 15]);
  });
});

describe('solveMaze', () => {
  it('liefert [] für unerreichbare Ziele', () => {
    const cells = generateMaze(3, 3, mulberry32(1));
    // Ziel komplett einmauern
    setWall(cells, 3, 3, 2, 2, 'n', true);
    setWall(cells, 3, 3, 2, 2, 'w', true);
    expect(solveMaze(cells, 3, 3)).toHaveLength(0);
  });
});
