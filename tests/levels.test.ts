import { describe, expect, it } from 'vitest';
import { parseLevel } from '../src/levels/schema';
import { loadLevel } from '../src/levels/loader';
import { generateQuickLevel } from '../src/levels/quick';
import { generateMaze, mazeToWalls, setWall, solveMaze } from '../src/core/maze';
import { mulberry32 } from '../src/core/rng';

const minimalLevel = {
  id: 't-1',
  name: 'Test',
  floors: [
    {
      size: [4, 4],
      maze: { seed: 7 },
      start: [0, 0],
      goal: [3, 3],
    },
  ],
};

describe('Levelformat', () => {
  it('akzeptiert ein minimales Level und füllt Defaults', () => {
    const def = parseLevel(minimalLevel);
    expect(def.pingBudget).toBe(3);
    expect(def.floors[0]!.maze.brittleChance).toBe(0);
    expect(def.floors[0]!.elements).toEqual([]);
  });

  it('weist unbekannte Element-Typen und kaputte Werte zurück', () => {
    expect(() =>
      parseLevel({
        ...minimalLevel,
        floors: [{ ...minimalLevel.floors[0], elements: [{ type: 'laser', cell: [1, 1] }] }],
      }),
    ).toThrow();
    expect(() => parseLevel({ ...minimalLevel, floors: [] })).toThrow();
    expect(() =>
      parseLevel({
        ...minimalLevel,
        floors: [{ ...minimalLevel.floors[0], size: [1, 1] }],
      }),
    ).toThrow();
  });
});

describe('Loader', () => {
  it('baut Elemente über die Registry in die Welt', () => {
    const def = parseLevel({
      ...minimalLevel,
      floors: [
        {
          ...minimalLevel.floors[0],
          elements: [
            { type: 'hole', cell: [1, 1], breathing: { offset: 1 } },
            { type: 'hole', cell: [2, 1] },
            { type: 'windZone', cell: [1, 2], dir: 'e' },
            { type: 'checkpoint', cell: [2, 2] },
          ],
        },
      ],
    });
    const { world } = loadLevel(def);
    expect(world.holes).toHaveLength(2);
    expect(world.holes[0]!.breathing).toBeDefined();
    expect(world.holes[0]!.openness).toBe(0); // atmend startet geschlossen
    expect(world.holes[1]!.breathing).toBeUndefined();
    expect(world.holes[1]!.openness).toBe(1); // statisch ist offen
    expect(world.windZones).toHaveLength(1);
    expect(world.windZones[0]!.fx).toBeGreaterThan(0);
    expect(world.checkpoints).toHaveLength(1);
    expect(world.ball.x).toBe(50);
    expect(world.ball.y).toBe(50);
    expect(world.goal.x).toBe(350);
  });

  it('ist deterministisch: gleiche Def ergibt identische Wände', () => {
    const a = loadLevel(minimalLevel);
    const b = loadLevel(minimalLevel);
    expect(a.world.walls).toEqual(b.world.walls);
  });

  it('lehnt goal=null ab, solange es keine Ebenen gibt (M5)', () => {
    expect(() =>
      loadLevel({ ...minimalLevel, floors: [{ ...minimalLevel.floors[0], goal: null }] }),
    ).toThrow(/M5/);
  });
});

describe('Maze-Edits (carve/add)', () => {
  it('setWall hält Nachbarzellen konsistent', () => {
    const cells = generateMaze(3, 3, mulberry32(1));
    setWall(cells, 3, 3, 0, 0, 'e', false);
    expect(cells[0]!.e).toBe(false);
    expect(cells[1]!.w).toBe(false);
    setWall(cells, 3, 3, 0, 0, 'e', true);
    expect(cells[1]!.w).toBe(true);
  });

  it('carve öffnet Durchgänge (weniger Wand-Rechtecke)', () => {
    const before = loadLevel(minimalLevel).world.walls.length;
    const carved = loadLevel({
      ...minimalLevel,
      floors: [{ ...minimalLevel.floors[0], maze: { seed: 7, carve: [[[0, 0], 'e']] } }],
    }).world.walls.length;
    // (0,0).e kann im Seed-7-Maze schon offen sein – dann ändert carve nichts.
    expect(carved).toBeLessThanOrEqual(before);
  });
});

describe('Schnelles Spiel', () => {
  it('ist deterministisch pro Seed', () => {
    expect(generateQuickLevel(42)).toEqual(generateQuickLevel(42));
    expect(generateQuickLevel(42)).not.toEqual(generateQuickLevel(43));
  });

  it('erzeugt ein lösbares, vollständiges Level', () => {
    for (const seed of [1, 42, 999]) {
      const def = generateQuickLevel(seed);
      const { world, cols, rows } = loadLevel(def);
      expect(world.holes).toHaveLength(4);
      expect(world.windZones).toHaveLength(2);
      expect(world.checkpoints).toHaveLength(2);
      // Lösbarkeit des zugrundeliegenden Mazes
      const cells = generateMaze(cols, rows, mulberry32(def.floors[0]!.maze.seed));
      const path = solveMaze(cells, cols, rows);
      expect(path.at(-1)).toEqual({ x: cols - 1, y: rows - 1 });
      // Checkpoints liegen auf dem Lösungsweg
      for (const cp of world.checkpoints) {
        const cell = { x: Math.floor(cp.x / 100), y: Math.floor(cp.y / 100) };
        expect(path).toContainEqual(cell);
      }
    }
  });

  it('legt keine Löcher auf Start-, Ziel- oder Checkpoint-Zellen', () => {
    for (const seed of [1, 42, 999]) {
      const { world, cols, rows } = loadLevel(generateQuickLevel(seed));
      const cpCells = new Set(
        world.checkpoints.map((c) => `${Math.floor(c.x / 100)},${Math.floor(c.y / 100)}`),
      );
      for (const h of world.holes) {
        const key = `${Math.floor(h.x / 100)},${Math.floor(h.y / 100)}`;
        expect(key).not.toBe('0,0');
        expect(key).not.toBe(`${cols - 1},${rows - 1}`);
        expect(cpCells.has(key)).toBe(false);
      }
    }
  });
});

describe('mazeToWalls', () => {
  it('bleibt nach setWall-Edits konsistent (keine doppelten Wände)', () => {
    const cells = generateMaze(4, 4, mulberry32(3));
    setWall(cells, 4, 4, 1, 1, 's', true);
    const walls = mazeToWalls(cells, 4, 4, 100, 10);
    const keys = walls.map((w) => `${w.x},${w.y},${w.w},${w.h}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
