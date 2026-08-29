// Schnelles Spiel: erzeugt aus Seed + Preset deterministisch eine LevelDef –
// derselbe Weg wie Kampagnen-Level, nur generiert statt handgebaut.

import { generateMaze, solveMaze } from '../core/maze';
import { mulberry32, type Rng } from '../core/rng';
import { BALL_R } from '../core/constants';
import type { ElementDef, LevelDef } from './schema';

export type Preset = 'easy' | 'normal' | 'hard';

export const PRESETS: Record<
  Preset,
  {
    label: string;
    cols: number;
    rows: number;
    holes: number;
    wind: number;
    brittleChance: number;
    pings: number;
    breath: { open: number; closed: number; ramp: number };
  }
> = {
  easy: {
    label: 'Leicht',
    cols: 5,
    rows: 7,
    holes: 2,
    wind: 1,
    brittleChance: 0.1,
    pings: 4,
    breath: { open: 2.2, closed: 2.8, ramp: 0.6 },
  },
  normal: {
    label: 'Mittel',
    cols: 6,
    rows: 8,
    holes: 4,
    wind: 2,
    brittleChance: 0.16,
    pings: 3,
    breath: { open: 2.6, closed: 2.2, ramp: 0.6 },
  },
  // Größer als der Screen: hier übernimmt die folgende Kamera (Multi-Screen).
  hard: {
    label: 'Schwer',
    cols: 8,
    rows: 11,
    holes: 7,
    wind: 3,
    brittleChance: 0.2,
    pings: 3,
    breath: { open: 3.0, closed: 1.6, ramp: 0.5 },
  },
};

function pickCells(
  count: number,
  forbidden: Set<number>,
  rng: Rng,
  cols: number,
  rows: number,
): Array<[number, number]> {
  const picked: Array<[number, number]> = [];
  while (picked.length < count) {
    const cx = Math.floor(rng() * cols);
    const cy = Math.floor(rng() * rows);
    const key = cy * cols + cx;
    if (forbidden.has(key)) continue;
    forbidden.add(key);
    picked.push([cx, cy]);
  }
  return picked;
}

export function generateQuickLevel(seed: number, preset: Preset = 'normal'): LevelDef {
  const p = PRESETS[preset];
  const { cols, rows } = p;
  const rng = mulberry32(seed);
  const mazeSeed = Math.floor(rng() * 0x7fffffff);
  const breathPeriod = p.breath.open + p.breath.closed + 2 * p.breath.ramp;

  // Dasselbe Maze wie im Loader erzeugen, um Checkpoints auf den Lösungsweg zu legen.
  const cells = generateMaze(cols, rows, mulberry32(mazeSeed));
  const path = solveMaze(cells, cols, rows);
  const cpCells: Array<[number, number]> = [
    [path[Math.floor(path.length / 3)]!.x, path[Math.floor(path.length / 3)]!.y],
    [path[Math.floor((2 * path.length) / 3)]!.x, path[Math.floor((2 * path.length) / 3)]!.y],
  ];

  const forbidden = new Set<number>([0, (rows - 1) * cols + (cols - 1)]);
  for (const [x, y] of cpCells) forbidden.add(y * cols + x);

  const elements: ElementDef[] = cpCells.map((cell) => ({ type: 'checkpoint', cell, r: 30 }));
  for (const cell of pickCells(p.holes, forbidden, rng, cols, rows)) {
    elements.push({
      type: 'hole',
      cell,
      r: BALL_R * 0.95,
      jitter: [(rng() - 0.5) * 16, (rng() - 0.5) * 16],
      // offset entzerrt die Atem-Zyklen, damit nie alle Löcher synchron sind
      breathing: { ...p.breath, offset: rng() * breathPeriod },
    });
  }
  const dirs = ['n', 'e', 's', 'w'] as const;
  for (const cell of pickCells(p.wind, forbidden, rng, cols, rows)) {
    elements.push({ type: 'windZone', cell, dir: dirs[Math.floor(rng() * 4)]!, force: 1150 });
  }

  return {
    id: `quick-${preset}-${seed}`,
    name: 'Schnelles Spiel',
    pingBudget: p.pings,
    floors: [
      {
        size: [cols, rows],
        maze: { seed: mazeSeed, carve: [], add: [], brittle: [], brittleChance: p.brittleChance, brittleHits: 3 },
        elements,
        start: [0, 0],
        goal: [cols - 1, rows - 1],
      },
    ],
  };
}
