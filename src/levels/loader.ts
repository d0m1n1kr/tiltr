// Level-Loader: baut aus einer validierten LevelDef deterministisch eine World.
// Kennt Elemente nur über die Registry.

import { CELL, WALL_T, BALL_R } from '../core/constants';
import { generateMaze, mazeToWalls, setWall } from '../core/maze';
import { Ball, World } from '../core/physics';
import { mulberry32 } from '../core/rng';
import { buildElements } from '../elements';
import { cellCenter } from '../elements/registry';
import { parseLevel, type LevelDef } from './schema';

export interface LoadedLevel {
  def: LevelDef;
  world: World;
  cols: number;
  rows: number;
  pingBudget: number;
}

export function loadLevel(defOrData: LevelDef | unknown): LoadedLevel {
  const def = parseLevel(defOrData);
  const floor = def.floors[0]!;
  const [cols, rows] = floor.size;
  const rng = mulberry32(floor.maze.seed);

  const cells = generateMaze(cols, rows, rng);
  for (const [[x, y], dir] of floor.maze.carve) setWall(cells, cols, rows, x, y, dir, false);
  for (const [[x, y], dir] of floor.maze.add) setWall(cells, cols, rows, x, y, dir, true);
  const walls = mazeToWalls(cells, cols, rows, CELL, WALL_T);

  // Innenwände zufällig als brüchig markieren (Außenrand nie).
  if (floor.maze.brittleChance > 0) {
    for (const w of walls) {
      const interior = w.x > 0 && w.y > 0 && w.x + w.w < cols * CELL && w.y + w.h < rows * CELL;
      if (interior && rng() < floor.maze.brittleChance) w.hp = floor.maze.brittleHits;
    }
  }

  const start = cellCenter(floor.start, CELL);
  if (!floor.goal) throw new Error(`Level ${def.id}: Ziel auf anderer Ebene wird erst ab M5 unterstützt`);
  const goalC = cellCenter(floor.goal, CELL);

  const world = new World(walls, new Ball(start.x, start.y, BALL_R), {
    x: goalC.x,
    y: goalC.y,
    r: BALL_R * 1.4,
  });
  buildElements(floor.elements, { world, cell: CELL, cols, rows });

  return { def, world, cols, rows, pingBudget: def.pingBudget };
}
