// Schnelles Spiel: erzeugt aus einem Seed deterministisch eine LevelDef –
// derselbe Weg wie Kampagnen-Level, nur generiert statt handgebaut.

import { generateMaze, solveMaze } from '../core/maze';
import { mulberry32, type Rng } from '../core/rng';
import { BALL_R } from '../core/constants';
import type { ElementDef, LevelDef } from './schema';

const COLS = 6;
const ROWS = 8;
const HOLE_COUNT = 4;
const WINDZONE_COUNT = 2;
const HOLE_BREATH = { open: 2.6, closed: 2.2, ramp: 0.6 };
const HOLE_PERIOD = HOLE_BREATH.open + HOLE_BREATH.closed + 2 * HOLE_BREATH.ramp;

function pickCells(
  count: number,
  forbidden: Set<number>,
  rng: Rng,
): Array<[number, number]> {
  const picked: Array<[number, number]> = [];
  while (picked.length < count) {
    const cx = Math.floor(rng() * COLS);
    const cy = Math.floor(rng() * ROWS);
    const key = cy * COLS + cx;
    if (forbidden.has(key)) continue;
    forbidden.add(key);
    picked.push([cx, cy]);
  }
  return picked;
}

export function generateQuickLevel(seed: number): LevelDef {
  const rng = mulberry32(seed);
  const mazeSeed = Math.floor(rng() * 0x7fffffff);

  // Dasselbe Maze wie im Loader erzeugen, um Checkpoints auf den Lösungsweg zu legen.
  const cells = generateMaze(COLS, ROWS, mulberry32(mazeSeed));
  const path = solveMaze(cells, COLS, ROWS);
  const cpCells: Array<[number, number]> = [
    [path[Math.floor(path.length / 3)]!.x, path[Math.floor(path.length / 3)]!.y],
    [path[Math.floor((2 * path.length) / 3)]!.x, path[Math.floor((2 * path.length) / 3)]!.y],
  ];

  const forbidden = new Set<number>([0, (ROWS - 1) * COLS + (COLS - 1)]);
  for (const [x, y] of cpCells) forbidden.add(y * COLS + x);

  const elements: ElementDef[] = cpCells.map((cell) => ({ type: 'checkpoint', cell, r: 30 }));
  for (const cell of pickCells(HOLE_COUNT, forbidden, rng)) {
    elements.push({
      type: 'hole',
      cell,
      r: BALL_R * 0.95,
      jitter: [(rng() - 0.5) * 16, (rng() - 0.5) * 16],
      // offset entzerrt die Atem-Zyklen, damit nie alle Löcher synchron sind
      breathing: { ...HOLE_BREATH, offset: rng() * HOLE_PERIOD },
    });
  }
  const dirs = ['n', 'e', 's', 'w'] as const;
  for (const cell of pickCells(WINDZONE_COUNT, forbidden, rng)) {
    elements.push({ type: 'windZone', cell, dir: dirs[Math.floor(rng() * 4)]!, force: 1150 });
  }

  return {
    id: `quick-${seed}`,
    name: 'Schnelles Spiel',
    pingBudget: 3,
    floors: [
      {
        size: [COLS, ROWS],
        maze: { seed: mazeSeed, carve: [], add: [], brittleChance: 0.16, brittleHits: 3 },
        elements,
        start: [0, 0],
        goal: [COLS - 1, ROWS - 1],
      },
    ],
  };
}
