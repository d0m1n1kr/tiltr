import { describe, expect, it } from 'vitest';
import { mirrorReflection } from '../src/core/occlusion';
import { loadLevel } from '../src/levels/loader';
import { parseLevel } from '../src/levels/schema';
import { mirrorLevel } from '../src/levels/mirror';
import { edgeState, setEdgeVariant, toggleEdge, type Edge, type MazeEdits } from '../src/ui/editor';

// Echo-Spiegel (M45): Wand-Variante wie Schallschutz – Kollision und Beweis
// wie jede Wand, nur die Ping-Antwort kommt vom gespiegelten Punkt.
const level = (mirrors: unknown[]) =>
  parseLevel({
    id: 'spiegel',
    name: 'Spiegel',
    pingBudget: 3,
    floors: [
      {
        size: [3, 2],
        maze: { seed: 1, carve: [[[0, 0], 'e']], add: [[[1, 0], 'e']], mirrors },
        elements: [],
        start: [0, 0],
        goal: [2, 1],
      },
    ],
  });

describe('Echo-Spiegel', () => {
  it('die Reflexion liegt doppelt so weit in derselben Richtung', () => {
    expect(mirrorReflection(30, -40, 50)).toEqual({ dx: 60, dy: -80, dist: 100 });
  });

  it('der Loader markiert die Wand, verlangt aber ihre Existenz', () => {
    const { world } = loadLevel(level([[[1, 0], 'e']]));
    expect(world.walls.filter((w) => w.mirror)).toHaveLength(1);
    expect(() => loadLevel(level([[[0, 0], 'e']]))).toThrow(/spiegelnd/);
  });

  it('die Spiegelung des Levels spiegelt auch die Spiegel-Kanten', () => {
    const m = mirrorLevel(level([[[1, 0], 'e']]), 'x');
    expect(m.floors[0]!.maze.mirrors).toEqual([[[1, 0], 'w']]);
    expect(loadLevel(m).world.walls.filter((w) => w.mirror)).toHaveLength(1);
  });

  it('Editor: Variante „Spiegel" setzen, lesen, Wand entfernen nimmt sie mit', () => {
    const E: Edge = [[1, 1], 'e'];
    const maze: MazeEdits = { carve: [], add: [], brittle: [], absorb: [], mirrors: [] };
    setEdgeVariant(maze, E, 'mirror');
    expect(maze.mirrors).toEqual([E]);
    expect(edgeState(maze, E, false)).toBe('mirror');
    setEdgeVariant(maze, E, 'absorb');
    expect(maze.mirrors).toEqual([]);
    expect(edgeState(maze, E, false)).toBe('absorb');
    setEdgeVariant(maze, E, 'mirror');
    expect(toggleEdge(maze, E, false, false)).toBe('open');
    expect(maze.mirrors).toEqual([]);
  });
});
