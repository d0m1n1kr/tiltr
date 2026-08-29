// Level-Loader: baut aus einer validierten LevelDef deterministisch die
// Welt(en) – eine World pro Ebene, alle teilen sich denselben Ball.
// Kennt Elemente nur über die Registry.

import { CELL, WALL_T, BALL_R } from '../core/constants';
import { generateMaze, mazeToWalls, mirrorCells, setWall } from '../core/maze';
import { Ball, World } from '../core/physics';
import { mulberry32 } from '../core/rng';
import { buildElements } from '../elements';
import { cellCenter } from '../elements/registry';
import { parseLevel, type LevelDef } from './schema';

export interface LoadedFloor {
  world: World;
  cols: number;
  rows: number;
}

export interface LoadedLevel {
  def: LevelDef;
  floors: LoadedFloor[];
  /** Ebene, auf der das Ziel liegt */
  goalFloor: number;
  /** Zielposition in Weltkoordinaten (für den gedämpften Beacon auf anderen Ebenen) */
  goalPos: { x: number; y: number };
  pingBudget: number;
  /** Bequemlichkeit: Start-Ebene (Floor 0) */
  world: World;
  cols: number;
  rows: number;
}

export function loadLevel(defOrData: LevelDef | unknown): LoadedLevel {
  const def = parseLevel(defOrData);
  const ball = new Ball(0, 0, BALL_R); // Position setzt die Start-Ebene unten
  const floors: LoadedFloor[] = [];
  let goalFloor = -1;
  let goalPos = { x: 0, y: 0 };

  def.floors.forEach((floor, floorIndex) => {
    const [cols, rows] = floor.size;
    const rng = mulberry32(floor.maze.seed);

    // mirror: Def-Koordinaten sind bereits gespiegelt (mirrorLevel), hier
    // wird das Maze-Rauschen nachgezogen -> exaktes Spiegelbild des Designs.
    let cells = generateMaze(cols, rows, rng);
    if (def.mirror) cells = mirrorCells(cells, cols, rows, def.mirror);
    for (const [[x, y], dir] of floor.maze.carve) setWall(cells, cols, rows, x, y, dir, false);
    for (const [[x, y], dir] of floor.maze.add) setWall(cells, cols, rows, x, y, dir, true);
    const walls = mazeToWalls(cells, cols, rows, CELL, WALL_T);

    // Gezielt brüchige Wandkanten – die Wand muss existieren.
    const ht = WALL_T / 2;
    for (const [[x, y], dir] of floor.maze.brittle) {
      const border =
        (dir === 'w' && x === 0) ||
        (dir === 'e' && x === cols - 1) ||
        (dir === 'n' && y === 0) ||
        (dir === 's' && y === rows - 1);
      if (border) throw new Error(`Level ${def.id}: Außenwand (${x},${y},${dir}) darf nicht brüchig sein`);
      const ex = dir === 'e' ? (x + 1) * CELL - ht : x * CELL - ht;
      const ey = dir === 's' ? (y + 1) * CELL - ht : y * CELL - ht;
      const vertical = dir === 'e' || dir === 'w';
      const wall = walls.find(
        (w) => Math.abs(w.x - ex) < 0.5 && Math.abs(w.y - ey) < 0.5 && (w.w === WALL_T) === vertical,
      );
      if (!wall) throw new Error(`Level ${def.id}: brüchige Wandkante (${x},${y},${dir}) existiert nicht`);
      wall.hp = floor.maze.brittleHits;
    }

    // Innenwände zufällig als brüchig markieren (Außenrand nie).
    if (floor.maze.brittleChance > 0) {
      for (const w of walls) {
        const interior = w.x > 0 && w.y > 0 && w.x + w.w < cols * CELL && w.y + w.h < rows * CELL;
        if (interior && w.hp === undefined && rng() < floor.maze.brittleChance) w.hp = floor.maze.brittleHits;
      }
    }

    const inBounds = (c: readonly [number, number]) => c[0] < cols && c[1] < rows;
    if (!inBounds(floor.start)) throw new Error(`Level ${def.id}: start außerhalb des Felds (Ebene ${floorIndex})`);
    let goal = null;
    if (floor.goal) {
      if (!inBounds(floor.goal)) throw new Error(`Level ${def.id}: goal außerhalb des Felds (Ebene ${floorIndex})`);
      if (goalFloor !== -1) throw new Error(`Level ${def.id}: mehr als ein Ziel definiert`);
      goalFloor = floorIndex;
      goalPos = cellCenter(floor.goal, CELL);
      goal = { x: goalPos.x, y: goalPos.y, r: BALL_R * 1.4 };
    }

    const world = new World(walls, ball, goal);
    buildElements(floor.elements, { world, cell: CELL, cols, rows, floorIndex });
    floors.push({ world, cols, rows });
  });

  if (goalFloor === -1) throw new Error(`Level ${def.id}: kein Ziel definiert`);

  // Ball auf die Start-Ebene setzen.
  const startFloor = def.floors[0]!;
  const start = cellCenter(startFloor.start, CELL);
  ball.x = start.x;
  ball.y = start.y;

  // Transporter-Ziele prüfen (Ebene existiert, Zelle im Feld der Ziel-Ebene).
  floors.forEach(({ world }, floorIndex) => {
    for (const t of world.transporters) {
      const target = floors[t.targetFloor];
      if (!target) throw new Error(`Level ${def.id}: Transporter (Ebene ${floorIndex}) zielt auf Ebene ${t.targetFloor}, die es nicht gibt`);
      if (t.tx > target.cols * CELL || t.ty > target.rows * CELL)
        throw new Error(`Level ${def.id}: Transporter-Ziel außerhalb von Ebene ${t.targetFloor}`);
    }
  });

  // Schlüssel und Türen müssen zueinander passen (ebenenübergreifend).
  const doorIds = new Set(floors.flatMap((f) => f.world.walls.filter((w) => w.door).map((w) => w.door!.id)));
  const allKeys = floors.flatMap((f) => f.world.keys);
  for (const key of allKeys) {
    if (!doorIds.has(key.opens)) throw new Error(`Level ${def.id}: Schlüssel öffnet unbekannte Tür "${key.opens}"`);
  }
  const allPlates = floors.flatMap((f) => f.world.plates);
  for (const id of doorIds) {
    if (!allKeys.some((k) => k.opens === id) && !allPlates.some((p) => p.opens === id))
      throw new Error(`Level ${def.id}: Tür "${id}" hat weder Schlüssel noch Druckplatte`);
  }

  const first = floors[0]!;
  return {
    def,
    floors,
    goalFloor,
    goalPos,
    pingBudget: def.pingBudget,
    world: first.world,
    cols: first.cols,
    rows: first.rows,
  };
}
