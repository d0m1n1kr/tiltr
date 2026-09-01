// Labyrinth: Generierung (Recursive Backtracker), Lösungsweg (BFS),
// Umwandlung in Wand-Rechtecke. Deterministisch über den übergebenen Rng.

import type { Rng } from './rng';
import type { Wall } from './types';

export interface Cell {
  n: boolean;
  e: boolean;
  s: boolean;
  w: boolean;
}

export function generateMaze(cols: number, rows: number, rng: Rng): Cell[] {
  const cells: Cell[] = Array.from({ length: cols * rows }, () => ({
    n: true,
    e: true,
    s: true,
    w: true,
  }));
  const idx = (x: number, y: number) => y * cols + x;
  const visited = new Array<boolean>(cols * rows).fill(false);
  const stack: Array<[number, number]> = [[0, 0]];
  visited[0] = true;

  while (stack.length) {
    const [x, y] = stack[stack.length - 1]!;
    const neighbors: Array<[number, number, keyof Cell, keyof Cell]> = [];
    if (y > 0 && !visited[idx(x, y - 1)]) neighbors.push([x, y - 1, 'n', 's']);
    if (x < cols - 1 && !visited[idx(x + 1, y)]) neighbors.push([x + 1, y, 'e', 'w']);
    if (y < rows - 1 && !visited[idx(x, y + 1)]) neighbors.push([x, y + 1, 's', 'n']);
    if (x > 0 && !visited[idx(x - 1, y)]) neighbors.push([x - 1, y, 'w', 'e']);
    if (!neighbors.length) {
      stack.pop();
      continue;
    }
    const [nx, ny, wall, opp] = neighbors[Math.floor(rng() * neighbors.length)]!;
    cells[idx(x, y)]![wall] = false;
    cells[idx(nx, ny)]![opp] = false;
    visited[idx(nx, ny)] = true;
    stack.push([nx, ny]);
  }
  return cells;
}

// Eine Wandkante setzen/öffnen – hält die Nachbarzelle konsistent.
// Für Level-Edits (carve/add) auf generierten Mazes.
export function setWall(
  cells: Cell[],
  cols: number,
  rows: number,
  x: number,
  y: number,
  dir: keyof Cell,
  present: boolean,
): void {
  const idx = (cx: number, cy: number) => cy * cols + cx;
  const cell = cells[idx(x, y)];
  if (!cell) throw new Error(`setWall: Zelle (${x},${y}) außerhalb ${cols}x${rows}`);
  cell[dir] = present;
  const neighbor: Record<keyof Cell, [number, number, keyof Cell]> = {
    n: [x, y - 1, 's'],
    e: [x + 1, y, 'w'],
    s: [x, y + 1, 'n'],
    w: [x - 1, y, 'e'],
  };
  const [nx, ny, opp] = neighbor[dir];
  if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) cells[idx(nx, ny)]![opp] = present;
}

// Spiegelt das Zellgitter (x = horizontal, y = vertikal, xy = beides).
// Zusammen mit gespiegelten Def-Koordinaten (src/levels/mirror.ts) entsteht
// ein exaktes Spiegelbild eines Levels – alle Invarianten bleiben erhalten.
export function mirrorCells(cells: Cell[], cols: number, rows: number, axis: 'x' | 'y' | 'xy'): Cell[] {
  const fx = axis.includes('x');
  const fy = axis.includes('y');
  const out: Cell[] = new Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const src = cells[(fy ? rows - 1 - y : y) * cols + (fx ? cols - 1 - x : x)]!;
      out[y * cols + x] = {
        n: fy ? src.s : src.n,
        s: fy ? src.n : src.s,
        e: fx ? src.w : src.e,
        w: fx ? src.e : src.w,
      };
    }
  }
  return out;
}

// Lösungsweg per BFS (Default: (0,0) -> (cols-1, rows-1)).
// Liefert [] wenn das Ziel unerreichbar ist.
export function solveMaze(
  cells: Cell[],
  cols: number,
  rows: number,
  start: { x: number; y: number } = { x: 0, y: 0 },
  goal: { x: number; y: number } = { x: cols - 1, y: rows - 1 },
): Array<{ x: number; y: number }> {
  const idx = (x: number, y: number) => y * cols + x;
  const startIdx = idx(start.x, start.y);
  const goalIdx = idx(goal.x, goal.y);
  const prev = new Array<number>(cols * rows).fill(-1);
  const seen = new Array<boolean>(cols * rows).fill(false);
  const queue = [startIdx];
  seen[startIdx] = true;
  while (queue.length) {
    const c = queue.shift()!;
    const x = c % cols,
      y = (c - x) / cols;
    const cell = cells[c]!;
    const next: number[] = [];
    if (!cell.n) next.push(idx(x, y - 1));
    if (!cell.e) next.push(idx(x + 1, y));
    if (!cell.s) next.push(idx(x, y + 1));
    if (!cell.w) next.push(idx(x - 1, y));
    for (const n of next) {
      if (!seen[n]) {
        seen[n] = true;
        prev[n] = c;
        queue.push(n);
      }
    }
  }
  if (!seen[goalIdx]) return [];
  const path: Array<{ x: number; y: number }> = [];
  let c = goalIdx;
  while (c !== -1) {
    path.push({ x: c % cols, y: Math.floor(c / cols) });
    c = prev[c]!;
  }
  return path.reverse();
}

/**
 * Alle von `from` aus erreichbaren Zellen, wobei `blocked` (Zell-Indizes)
 * als undurchdringlich gilt. Fürs Setzen von MASSIVEN Elementen (Jukebox):
 * Ein Möbelstück nimmt seine Zelle für immer, und was dahinter liegt, liegt
 * für immer dahinter – wer ein zweites setzen will, muss wissen, was das
 * erste schon abgeschnitten hat.
 */
export function floodMaze(
  cells: Cell[],
  cols: number,
  rows: number,
  from: { x: number; y: number },
  blocked: ReadonlySet<number> = new Set(),
): Set<number> {
  const startKey = from.y * cols + from.x;
  const seen = new Set<number>();
  if (blocked.has(startKey)) return seen;
  seen.add(startKey);
  const queue: Array<[number, number]> = [[from.x, from.y]];
  while (queue.length) {
    const [x, y] = queue.shift()!;
    const c = cells[y * cols + x]!;
    const step = (nx: number, ny: number, open: boolean) => {
      if (!open || nx < 0 || ny < 0 || nx >= cols || ny >= rows) return;
      const k = ny * cols + nx;
      if (blocked.has(k) || seen.has(k)) return;
      seen.add(k);
      queue.push([nx, ny]);
    };
    step(x, y - 1, !c.n);
    step(x + 1, y, !c.e);
    step(x, y + 1, !c.s);
    step(x - 1, y, !c.w);
  }
  return seen;
}

// Wände als achsenparallele Rechtecke in Weltkoordinaten. Wände liegen
// zentriert auf den Gitterlinien, Dopplungen werden vermieden
// (Nord-/Westwand nur am Rand, sonst reichen Ost- und Südwände).
export function mazeToWalls(cells: Cell[], cols: number, rows: number, cell: number, t: number): Wall[] {
  const walls: Wall[] = [];
  const idx = (x: number, y: number) => y * cols + x;
  const add = (x: number, y: number, w: number, h: number) => walls.push({ x, y, w, h });
  const ht = t / 2;

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const c = cells[idx(x, y)]!;
      if (y === 0 && c.n) add(x * cell - ht, -ht, cell + t, t);
      if (x === 0 && c.w) add(-ht, y * cell - ht, t, cell + t);
      if (c.e) add((x + 1) * cell - ht, y * cell - ht, t, cell + t);
      if (c.s) add(x * cell - ht, (y + 1) * cell - ht, cell + t, t);
    }
  }
  return walls;
}
