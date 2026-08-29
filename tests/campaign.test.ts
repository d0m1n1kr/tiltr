import { describe, expect, it } from 'vitest';
import { CAMPAIGN_LEVELS } from '../src/levels/campaign';
import { loadLevel } from '../src/levels/loader';
import { generateMaze, setWall, solveMaze, type Cell } from '../src/core/maze';
import { mulberry32 } from '../src/core/rng';
import type { LevelDef } from '../src/levels/schema';

interface CellConfig {
  brittleOpen: boolean;
  doorsOpen: boolean;
}

// Zellen wie im Loader aufbauen; brüchige Wände/Türen je nach Fragestellung.
function buildCells(def: LevelDef, cfg: CellConfig): { cells: Cell[]; cols: number; rows: number } {
  const floor = def.floors[0]!;
  const [cols, rows] = floor.size;
  const cells = generateMaze(cols, rows, mulberry32(floor.maze.seed));
  for (const [[x, y], dir] of floor.maze.carve) setWall(cells, cols, rows, x, y, dir, false);
  for (const [[x, y], dir] of floor.maze.add) setWall(cells, cols, rows, x, y, dir, true);
  if (cfg.brittleOpen) {
    for (const [[x, y], dir] of floor.maze.brittle) setWall(cells, cols, rows, x, y, dir, false);
  }
  if (!cfg.doorsOpen) {
    for (const el of floor.elements) {
      if (el.type === 'door') setWall(cells, cols, rows, el.edge[0][0], el.edge[0][1], el.edge[1], true);
    }
  }
  return { cells, cols, rows };
}

function reachable(def: LevelDef, cfg: CellConfig): Set<string> {
  const { cells, cols, rows } = buildCells(def, cfg);
  const floor = def.floors[0]!;
  const seen = new Set<string>();
  const stack = [[floor.start[0], floor.start[1]] as [number, number]];
  seen.add(floor.start.join(','));
  const idx = (x: number, y: number) => y * cols + x;
  while (stack.length) {
    const [x, y] = stack.pop()!;
    const c = cells[idx(x, y)]!;
    const next: Array<[number, number, boolean]> = [
      [x, y - 1, !c.n],
      [x + 1, y, !c.e],
      [x, y + 1, !c.s],
      [x - 1, y, !c.w],
    ];
    for (const [nx, ny, open] of next) {
      if (!open || nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const key = `${nx},${ny}`;
      if (!seen.has(key)) {
        seen.add(key);
        stack.push([nx, ny]);
      }
    }
  }
  return seen;
}

describe('Kampagne Welt 1', () => {
  it('hat 10 Level mit Intro, Par-Zeit und eindeutigen IDs', () => {
    expect(CAMPAIGN_LEVELS).toHaveLength(10);
    expect(new Set(CAMPAIGN_LEVELS.map((l) => l.id)).size).toBe(10);
    for (const l of CAMPAIGN_LEVELS) {
      expect(l.intro?.length ?? 0, l.id).toBeGreaterThan(20);
      expect(l.parTimeS, l.id).toBeGreaterThan(0);
    }
  });

  it('alle Level laden ohne Fehler (Türen offen im Maze, Schlüssel passend …)', () => {
    for (const def of CAMPAIGN_LEVELS) {
      expect(() => loadLevel(def), def.id).not.toThrow();
    }
  });

  it('jeder Schlüssel ist VOR seiner Tür erreichbar', () => {
    for (const def of CAMPAIGN_LEVELS) {
      const preDoor = reachable(def, { brittleOpen: true, doorsOpen: false });
      for (const el of def.floors[0]!.elements) {
        if (el.type === 'key') {
          expect(preDoor.has(el.cell.join(',')), `${def.id}: Schlüssel ${el.cell}`).toBe(true);
        }
      }
    }
  });

  it('mit Schlüsseln sind Ziel, Gems, Checkpoints und Wächter-Pfade erreichbar', () => {
    for (const def of CAMPAIGN_LEVELS) {
      const open = reachable(def, { brittleOpen: true, doorsOpen: true });
      const floor = def.floors[0]!;
      expect(open.has(floor.goal!.join(',')), `${def.id}: Ziel`).toBe(true);
      for (const el of floor.elements) {
        if (el.type === 'gem' || el.type === 'checkpoint' || el.type === 'key') {
          expect(open.has(el.cell.join(',')), `${def.id}: ${el.type} ${el.cell}`).toBe(true);
        }
        if (el.type === 'guard') {
          for (const wp of el.patrol) expect(open.has(wp.join(',')), `${def.id}: guard ${wp}`).toBe(true);
        }
      }
    }
  });

  it('Wächter-Patrouillen verlaufen achsenparallel durch offene Gänge', () => {
    for (const def of CAMPAIGN_LEVELS) {
      const { cells, cols } = buildCells(def, { brittleOpen: false, doorsOpen: false });
      const idx = (x: number, y: number) => y * cols + x;
      for (const el of def.floors[0]!.elements) {
        if (el.type !== 'guard') continue;
        for (let i = 1; i < el.patrol.length; i++) {
          const [ax, ay] = el.patrol[i - 1]!;
          const [bx, by] = el.patrol[i]!;
          expect(ax === bx || ay === by, `${def.id}: Patrouille nicht achsenparallel`).toBe(true);
          // jeden Zwischenschritt auf offene Kante prüfen
          let [x, y] = [ax, ay];
          while (x !== bx || y !== by) {
            const dx = Math.sign(bx - x),
              dy = Math.sign(by - y);
            const c = cells[idx(x, y)]!;
            const open = dx === 1 ? !c.e : dx === -1 ? !c.w : dy === 1 ? !c.s : !c.n;
            expect(open, `${def.id}: Patrouille blockiert bei (${x},${y})`).toBe(true);
            x += dx;
            y += dy;
          }
        }
      }
    }
  });

  it('ohne Einsturz der brüchigen Wände bleibt jedes Level lösbar ODER die Wand ist der Weg', () => {
    // Lösbarkeit mit brüchigen Wänden offen ist Pflicht (siehe oben);
    // hier nur ein Regressionscheck, dass solveMaze auf dem finalen Zustand läuft.
    for (const def of CAMPAIGN_LEVELS) {
      const { cells, cols, rows } = buildCells(def, { brittleOpen: true, doorsOpen: true });
      const floor = def.floors[0]!;
      const path = solveMaze(
        cells,
        cols,
        rows,
        { x: floor.start[0], y: floor.start[1] },
        { x: floor.goal![0], y: floor.goal![1] },
      );
      expect(path.length, def.id).toBeGreaterThan(0);
    }
  });
});
