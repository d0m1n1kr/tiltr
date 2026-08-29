import { describe, expect, it } from 'vitest';
import { generateMaze, mazeToWalls, solveMaze } from '../src/core/maze';
import { mulberry32 } from '../src/core/rng';

describe('Maze', () => {
  it('ist deterministisch bei gleichem Seed', () => {
    const a = generateMaze(6, 8, mulberry32(42));
    const b = generateMaze(6, 8, mulberry32(42));
    expect(a).toEqual(b);
    const c = generateMaze(6, 8, mulberry32(43));
    expect(a).not.toEqual(c);
  });

  it('solveMaze findet einen zusammenhängenden Weg von Start zu Ziel', () => {
    for (const seed of [1, 2, 3, 99, 12345]) {
      const cells = generateMaze(6, 8, mulberry32(seed));
      const path = solveMaze(cells, 6, 8);
      expect(path[0]).toEqual({ x: 0, y: 0 });
      expect(path.at(-1)).toEqual({ x: 5, y: 7 });
      for (let i = 1; i < path.length; i++) {
        const d = Math.abs(path[i]!.x - path[i - 1]!.x) + Math.abs(path[i]!.y - path[i - 1]!.y);
        expect(d).toBe(1);
      }
    }
  });

  it('mazeToWalls umschließt das Feld vollständig mit Randwänden', () => {
    const cells = generateMaze(6, 8, mulberry32(7));
    const walls = mazeToWalls(cells, 6, 8, 100, 10);
    // Ränder: links (x=-5), oben (y=-5), rechts (x=595), unten (y=795)
    expect(walls.some((w) => w.x < 0)).toBe(true);
    expect(walls.some((w) => w.y < 0)).toBe(true);
    expect(walls.some((w) => w.x + w.w > 600)).toBe(true);
    expect(walls.some((w) => w.y + w.h > 800)).toBe(true);
  });
});
