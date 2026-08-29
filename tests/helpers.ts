// Gemeinsame Test-Helfer: Zellen wie im Loader aufbauen und Erreichbarkeit
// über (Ebene, Zelle) prüfen – Transporter sind GERICHTETE Kanten.

import { generateMaze, setWall, type Cell } from '../src/core/maze';
import { mulberry32 } from '../src/core/rng';
import type { FloorDef, LevelDef } from '../src/levels/schema';

export interface CellConfig {
  brittleOpen: boolean;
  doorsOpen: boolean;
  /** Nur diese Tür-IDs gelten als offen (wenn doorsOpen false ist). */
  openDoorIds?: Set<string>;
}

export function buildFloorCells(floor: FloorDef, cfg: CellConfig): Cell[] {
  const [cols, rows] = floor.size;
  const cells = generateMaze(cols, rows, mulberry32(floor.maze.seed));
  for (const [[x, y], dir] of floor.maze.carve) setWall(cells, cols, rows, x, y, dir, false);
  for (const [[x, y], dir] of floor.maze.add) setWall(cells, cols, rows, x, y, dir, true);
  if (cfg.brittleOpen) {
    for (const [[x, y], dir] of floor.maze.brittle) setWall(cells, cols, rows, x, y, dir, false);
  }
  if (!cfg.doorsOpen) {
    for (const el of floor.elements) {
      if (el.type === 'door' && !cfg.openDoorIds?.has(el.id))
        setWall(cells, cols, rows, el.edge[0][0], el.edge[0][1], el.edge[1], true);
    }
  }
  return cells;
}

export function reachable(def: LevelDef, cfg: CellConfig): Set<string> {
  const floors = def.floors.map((f) => ({
    cells: buildFloorCells(f, cfg),
    cols: f.size[0],
    rows: f.size[1],
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

export const cellKey = (fl: number, c: readonly [number, number]) => `${fl}:${c[0]},${c[1]}`;

/** Prüft alle Element-Positionen + Ziel eines Levels auf Erreichbarkeit. */
export function expectAllReachable(
  def: LevelDef,
  expectFn: (cond: boolean, msg: string) => void,
): void {
  const open = reachable(def, { brittleOpen: true, doorsOpen: true });
  def.floors.forEach((floor, fl) => {
    if (floor.goal) expectFn(open.has(cellKey(fl, floor.goal)), `${def.id}: Ziel E${fl}`);
    for (const el of floor.elements) {
      if (el.type === 'gem' || el.type === 'checkpoint' || el.type === 'key') {
        expectFn(open.has(cellKey(fl, el.cell)), `${def.id}: ${el.type} E${fl} ${el.cell}`);
      }
      if (el.type === 'guard') {
        for (const wp of el.patrol) expectFn(open.has(cellKey(fl, wp)), `${def.id}: guard E${fl} ${wp}`);
      }
      if (el.type === 'transporter') {
        expectFn(open.has(cellKey(fl, el.cell)), `${def.id}: transporter E${fl} ${el.cell}`);
        expectFn(
          open.has(cellKey(el.target.floor, el.target.cell)),
          `${def.id}: transporter-Ziel E${el.target.floor} ${el.target.cell}`,
        );
      }
    }
  });
}

/**
 * Coop-Fixpunkt: Eine Tür gilt als offen, sobald eine ihrer Platten (oder
 * ein Schlüssel) erreichbar ist – gebannte Türen öffnen nie.
 */
export function coopReachable(def: LevelDef, bannedDoors: Set<string> = new Set()): Set<string> {
  const openDoorIds = new Set<string>();
  for (;;) {
    const seen = reachable(def, { brittleOpen: true, doorsOpen: false, openDoorIds });
    let changed = false;
    def.floors.forEach((floor, fl) => {
      for (const el of floor.elements) {
        if ((el.type === 'plate' || el.type === 'key') && !bannedDoors.has(el.opens)) {
          if (!openDoorIds.has(el.opens) && seen.has(cellKey(fl, el.cell))) {
            openDoorIds.add(el.opens);
            changed = true;
          }
        }
      }
    });
    if (!changed) return seen;
  }
}
