// Schnelles Spiel: erzeugt aus Seed + Preset deterministisch eine LevelDef –
// derselbe Weg wie Kampagnen-Level, nur generiert statt handgebaut.

import { floodMaze, generateMaze, solveMaze } from '../core/maze';
import { mulberry32, type Rng } from '../core/rng';
import { BALL_R } from '../core/constants';
import type { ElementDef, LevelDef } from './schema';
import { playlistFrom } from '../music';

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
    /** M11: neue Elemente stufenweise – leicht bleibt pur */
    crystals: number;
    anchors: number;
    glass: number;
    /** M27: Musikautomat – 0 oder 1. Mehr als EINER pro Ebene wäre sinnlos:
     *  Es gibt einen Musik-Bus, es klingt immer nur der nächste. */
    jukeboxes: 0 | 1;
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
    crystals: 1,
    anchors: 0,
    glass: 0,
    jukeboxes: 0,
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
    crystals: 1,
    anchors: 1,
    glass: 1,
    jukeboxes: 1,
  },
  // Deutlich größer als der Screen (Multi-Screen): die Kamera folgt dem Ball.
  hard: {
    label: 'Schwer',
    cols: 11,
    rows: 15,
    holes: 11,
    wind: 4,
    brittleChance: 0.2,
    pings: 5,
    breath: { open: 3.0, closed: 1.6, ramp: 0.5 },
    crystals: 2,
    anchors: 2,
    glass: 3,
    jukeboxes: 1,
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

// Zellen mit Zusatzfilter wählen: Kandidaten werden aufgezählt (terminiert
// garantiert – Lektion aus M9). Gibt es keine passende Zelle mehr, werden
// schlicht WENIGER platziert – der Filter ist eine Invariante (Anker/Glas
// nie auf dem Pflichtweg) und wird nie aufgeweicht.
function pickCellsWhere(
  count: number,
  forbidden: Set<number>,
  rng: Rng,
  cols: number,
  rows: number,
  keep: (key: number) => boolean,
): Array<[number, number]> {
  const picked: Array<[number, number]> = [];
  for (let i = 0; i < count; i++) {
    const candidates: number[] = [];
    for (let key = 0; key < cols * rows; key++) {
      if (!forbidden.has(key) && keep(key)) candidates.push(key);
    }
    if (!candidates.length) break;
    const key = candidates[Math.floor(rng() * candidates.length)]!;
    forbidden.add(key);
    picked.push([key % cols, Math.floor(key / cols)]);
  }
  return picked;
}

export function generateQuickLevel(seed: number, preset: Preset = 'normal'): LevelDef {
  const p = PRESETS[preset];
  const { cols, rows } = p;
  const rng = mulberry32(seed);
  const mazeSeed = Math.floor(rng() * 0x7fffffff);
  const breathPeriod = p.breath.open + p.breath.closed + 2 * p.breath.ramp;

  // Start & Ziel zufällig (seeded) statt immer oben links -> unten rechts;
  // Mindestabstand (Manhattan) hält die Strecke lang, Fallback: Ecken.
  const minDist = Math.max(cols, rows);
  let start: [number, number] = [0, 0];
  let goal: [number, number] = [cols - 1, rows - 1];
  for (let i = 0; i < 80; i++) {
    const s: [number, number] = [Math.floor(rng() * cols), Math.floor(rng() * rows)];
    const g: [number, number] = [Math.floor(rng() * cols), Math.floor(rng() * rows)];
    if (Math.abs(s[0] - g[0]) + Math.abs(s[1] - g[1]) >= minDist) {
      start = s;
      goal = g;
      break;
    }
  }

  // Dasselbe Maze wie im Loader erzeugen, um Checkpoints auf den Lösungsweg zu legen.
  const cells = generateMaze(cols, rows, mulberry32(mazeSeed));
  const path = solveMaze(cells, cols, rows, { x: start[0], y: start[1] }, { x: goal[0], y: goal[1] });
  const cpCells: Array<[number, number]> = [
    [path[Math.floor(path.length / 3)]!.x, path[Math.floor(path.length / 3)]!.y],
    [path[Math.floor((2 * path.length) / 3)]!.x, path[Math.floor((2 * path.length) / 3)]!.y],
  ];

  const forbidden = new Set<number>([start[1] * cols + start[0], goal[1] * cols + goal[0]]);
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

  // M11: Echo-Kristalle frei platzieren; Sog-Anker und Glasboden beweisbar
  // ABSEITS der Pflichtwege (Lösungsweg + Wege zu den Kristallen) – im
  // perfekten Maze sind diese Pfade eindeutig, die Invariante ist damit
  // testbar (tests/levels.test.ts prüft sie über viele Seeds).
  const crystalCells = pickCells(p.crystals, forbidden, rng, cols, rows);
  for (const cell of crystalCells) elements.push({ type: 'echoCrystal', cell, r: 16 });
  const protectedCells = new Set<number>(path.map((c) => c.y * cols + c.x));
  for (const [cx, cy] of crystalCells) {
    for (const c of solveMaze(cells, cols, rows, { x: start[0], y: start[1] }, { x: cx, y: cy })) {
      protectedCells.add(c.y * cols + c.x);
    }
  }
  const offPath = (key: number) => !protectedCells.has(key);
  for (const cell of pickCellsWhere(p.anchors, forbidden, rng, cols, rows, offPath)) {
    elements.push({ type: 'anchor', cell, r: 120, force: 2000 });
  }
  for (const cell of pickCellsWhere(p.glass, forbidden, rng, cols, rows, offPath)) {
    elements.push({ type: 'glass', cell });
  }
  // M27: Der Musikautomat ist eine WAND – er muss noch strenger abseits
  // liegen als Anker und Glas, denn er nimmt die Zelle für immer. Derselbe
  // offPath-Filter (Lösungsweg + Wege zu den Kristallen) leistet genau das:
  // Im perfekten Maze schneidet eine Zelle abseits dieser Pfade nur ihren
  // eigenen Ast ab, und dort steht nichts, was man braucht.
  // Der Automat ist eine WAND und muss noch strenger abseits liegen als
  // Anker und Glas: Er nimmt die Zelle für immer. Derselbe offPath-Filter
  // (Lösungsweg + Wege zu den Kristallen) leistet das – im perfekten Maze
  // schneidet eine Zelle abseits dieser Pfade nur ihren eigenen Ast ab, und
  // dort steht nichts, was man braucht. Zusätzlich muss die Zelle vom Start
  // aus erreichbar sein, sonst könnte man den Automaten nicht anrempeln
  // (deshalb `floodMaze` – ein eingemauerter Automat ist stumme Deko).
  //
  // Nur EINER pro Ebene, und das ist keine Sparsamkeit: Es gibt einen
  // Musik-Bus, es klingt immer nur der nächste Automat. Zwei nebeneinander
  // wären außerdem eine Fehlerquelle für sich – der erste kann dem zweiten
  // den Zuweg nehmen (genau das fand die Testsuite in zwei Anläufen).
  if (p.jukeboxes) {
    const open = floodMaze(cells, cols, rows, { x: start[0], y: start[1] });
    const placeable = (key: number) => offPath(key) && open.has(key);
    const [cell] = pickCellsWhere(1, forbidden, rng, cols, rows, placeable);
    if (cell) elements.push({ type: 'jukebox', cell, playlist: playlistFrom(rng), volume: 1, startIndex: 0 });
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
        start,
        goal,
      },
    ],
  };
}
