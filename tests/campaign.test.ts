import { describe, expect, it } from 'vitest';
import { CAMPAIGN_LEVELS, WORLDS } from '../src/levels/campaign';
import { loadLevel } from '../src/levels/loader';
import { generateMaze, setWall, type Cell } from '../src/core/maze';
import { mulberry32 } from '../src/core/rng';
import type { FloorDef, LevelDef } from '../src/levels/schema';

interface CellConfig {
  brittleOpen: boolean;
  doorsOpen: boolean;
}

// Zellen einer Ebene wie im Loader aufbauen.
function buildFloorCells(floor: FloorDef, cfg: CellConfig): Cell[] {
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
  return cells;
}

// Erreichbarkeit über (Ebene, Zelle) – Transporter sind GERICHTETE Kanten.
function reachable(def: LevelDef, cfg: CellConfig): Set<string> {
  const floors = def.floors.map((f) => ({
    cells: buildFloorCells(f, cfg),
    cols: f.size[0],
    rows: f.size[1],
    // Transporter der Ebene: Pad-Zelle -> (Ziel-Ebene, Ziel-Zelle)
    jumps: f.elements
      .filter((e) => e.type === 'transporter')
      .map((t) => ({ from: t.cell, toFloor: t.target.floor, toCell: t.target.cell })),
  }));
  const key = (fl: number, x: number, y: number) => `${fl}:${x},${y}`;
  const start = def.floors[0]!.start;
  const seen = new Set<string>([key(0, start[0], start[1])]);
  const stack: Array<[number, number, number]> = [[0, start[0], start[1]]];
  while (stack.length) {
    const [fl, x, y] = stack.pop()!;
    const floor = floors[fl]!;
    const c = floor.cells[y * floor.cols + x]!;
    const push = (nfl: number, nx: number, ny: number) => {
      const k = key(nfl, nx, ny);
      if (!seen.has(k)) {
        seen.add(k);
        stack.push([nfl, nx, ny]);
      }
    };
    if (!c.n && y > 0) push(fl, x, y - 1);
    if (!c.e && x < floor.cols - 1) push(fl, x + 1, y);
    if (!c.s && y < floor.rows - 1) push(fl, x, y + 1);
    if (!c.w && x > 0) push(fl, x - 1, y);
    for (const j of floor.jumps) {
      if (j.from[0] === x && j.from[1] === y) push(j.toFloor, j.toCell[0], j.toCell[1]);
    }
  }
  return seen;
}

const cellKey = (fl: number, c: readonly [number, number]) => `${fl}:${c[0]},${c[1]}`;

describe('Kampagne', () => {
  it('Welt 1 hat 10, Welt 2 hat 5 Level; IDs eindeutig, Intro + Par überall', () => {
    expect(WORLDS[0]!.levels).toHaveLength(10);
    expect(WORLDS[1]!.levels).toHaveLength(5);
    expect(new Set(CAMPAIGN_LEVELS.map((l) => l.id)).size).toBe(15);
    for (const l of CAMPAIGN_LEVELS) {
      expect(l.intro?.length ?? 0, l.id).toBeGreaterThan(20);
      expect(l.parTimeS, l.id).toBeGreaterThan(0);
    }
  });

  it('alle Level laden ohne Fehler (Türen offen, Schlüssel passend, Transporter-Ziele gültig)', () => {
    for (const def of CAMPAIGN_LEVELS) {
      expect(() => loadLevel(def), def.id).not.toThrow();
    }
  });

  it('jeder Schlüssel ist VOR seiner Tür erreichbar (über Ebenen hinweg)', () => {
    for (const def of CAMPAIGN_LEVELS) {
      const preDoor = reachable(def, { brittleOpen: true, doorsOpen: false });
      def.floors.forEach((floor, fl) => {
        for (const el of floor.elements) {
          if (el.type === 'key') {
            expect(preDoor.has(cellKey(fl, el.cell)), `${def.id}: Schlüssel E${fl} ${el.cell}`).toBe(true);
          }
        }
      });
    }
  });

  it('mit Schlüsseln sind Ziel, Gems, Checkpoints, Patrouillen und Transporter-Ziele erreichbar', () => {
    for (const def of CAMPAIGN_LEVELS) {
      const open = reachable(def, { brittleOpen: true, doorsOpen: true });
      def.floors.forEach((floor, fl) => {
        if (floor.goal) expect(open.has(cellKey(fl, floor.goal)), `${def.id}: Ziel E${fl}`).toBe(true);
        for (const el of floor.elements) {
          if (el.type === 'gem' || el.type === 'checkpoint' || el.type === 'key') {
            expect(open.has(cellKey(fl, el.cell)), `${def.id}: ${el.type} E${fl} ${el.cell}`).toBe(true);
          }
          if (el.type === 'guard') {
            for (const wp of el.patrol) expect(open.has(cellKey(fl, wp)), `${def.id}: guard E${fl} ${wp}`).toBe(true);
          }
          if (el.type === 'transporter') {
            expect(open.has(cellKey(fl, el.cell)), `${def.id}: transporter E${fl} ${el.cell}`).toBe(true);
            expect(
              open.has(cellKey(el.target.floor, el.target.cell)),
              `${def.id}: transporter-Ziel E${el.target.floor} ${el.target.cell}`,
            ).toBe(true);
          }
        }
      });
    }
  });

  it('Multi-Ebenen-Level sind OHNE Transporter unlösbar (Ebenenwechsel ist Pflicht)', () => {
    // Ohne Sprünge bleibt man auf Ebene 0; Türen öffnen sich nur, wenn ihr
    // Schlüssel dort erreichbar ist (Fixpunkt).
    for (const def of WORLDS[1]!.levels) {
      const floor0 = def.floors[0]!;
      const [cols, rows] = floor0.size;
      const openDoors = new Set<string>();

      const reachFloor0 = (): Set<string> => {
        const cells = buildFloorCells(floor0, { brittleOpen: true, doorsOpen: false });
        for (const el of floor0.elements) {
          if (el.type === 'door' && openDoors.has(el.id)) {
            setWall(cells, cols, rows, el.edge[0][0], el.edge[0][1], el.edge[1], false);
          }
        }
        const seen = new Set<string>([floor0.start.join(',')]);
        const stack: Array<[number, number]> = [[floor0.start[0], floor0.start[1]]];
        while (stack.length) {
          const [x, y] = stack.pop()!;
          const c = cells[y * cols + x]!;
          const push = (nx: number, ny: number) => {
            const k = `${nx},${ny}`;
            if (!seen.has(k)) {
              seen.add(k);
              stack.push([nx, ny]);
            }
          };
          if (!c.n && y > 0) push(x, y - 1);
          if (!c.e && x < cols - 1) push(x + 1, y);
          if (!c.s && y < rows - 1) push(x, y + 1);
          if (!c.w && x > 0) push(x - 1, y);
        }
        return seen;
      };

      let seen = reachFloor0();
      let changed = true;
      while (changed) {
        changed = false;
        for (const el of floor0.elements) {
          if (el.type === 'key' && !openDoors.has(el.opens) && seen.has(el.cell.join(','))) {
            openDoors.add(el.opens);
            changed = true;
          }
        }
        if (changed) seen = reachFloor0();
      }

      const goalFloorIndex = def.floors.findIndex((f) => f.goal);
      const goal = def.floors[goalFloorIndex]!.goal!;
      const reachableWithoutJumps = goalFloorIndex === 0 && seen.has(goal.join(','));
      expect(reachableWithoutJumps, `${def.id}: Ziel ohne Transporter erreichbar`).toBe(false);
    }
  });

  it('Wächter-Patrouillen verlaufen achsenparallel durch offene Gänge', () => {
    for (const def of CAMPAIGN_LEVELS) {
      def.floors.forEach((floor, fl) => {
        const cells = buildFloorCells(floor, { brittleOpen: false, doorsOpen: false });
        const cols = floor.size[0];
        for (const el of floor.elements) {
          if (el.type !== 'guard') continue;
          for (let i = 1; i < el.patrol.length; i++) {
            const [ax, ay] = el.patrol[i - 1]!;
            const [bx, by] = el.patrol[i]!;
            expect(ax === bx || ay === by, `${def.id} E${fl}: Patrouille nicht achsenparallel`).toBe(true);
            let [x, y] = [ax, ay];
            while (x !== bx || y !== by) {
              const dx = Math.sign(bx - x),
                dy = Math.sign(by - y);
              const c = cells[y * cols + x]!;
              const open = dx === 1 ? !c.e : dx === -1 ? !c.w : dy === 1 ? !c.s : !c.n;
              expect(open, `${def.id} E${fl}: Patrouille blockiert bei (${x},${y})`).toBe(true);
              x += dx;
              y += dy;
            }
          }
        }
      });
    }
  });
});
