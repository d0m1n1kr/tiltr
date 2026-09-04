// Schnelles Spiel: erzeugt aus Seed + Preset deterministisch eine LevelDef –
// derselbe Weg wie Kampagnen-Level, nur generiert statt handgebaut.

import { floodMaze, generateMaze, solveMaze } from '../core/maze';
import { mulberry32, type Rng } from '../core/rng';
import { BALL_R } from '../core/constants';
import type { ElementDef, LevelDef } from './schema';
import { playlistFrom } from '../music';
import { planDoorPuzzle } from './puzzle';

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
    /** M42: Ebenen je Level (Transporter-Kette wie die Tages-Challenge) */
    floors: number;
    /** M42: Chance je Ebene, HELL zu sein (revealAll) – bei mehreren Ebenen
     *  bleibt mindestens eine dunkel */
    brightChance: number;
    /** M42: Tür-Rätsel auf dem Pflichtweg – Schlüssel (+ Zeitschloss), bei
     *  mehr als einem Öffner `require: 'all'`; null = keins. Liegt bevorzugt
     *  auf der hellen Ebene: Sichtbarkeit nimmt die Suche, das Rätsel bleibt. */
    puzzle: { keys: number; switch: boolean } | null;
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
    floors: 1,
    brightChance: 0,
    puzzle: null,
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
    floors: 1,
    brightChance: 0.3,
    puzzle: { keys: 2, switch: false },
  },
  // Größer als der Screen (Multi-Screen): die Kamera folgt dem Ball – und seit
  // M42 ZWEI Ebenen mit Transporter, eine davon hell mit Tür-Rätsel.
  hard: {
    label: 'Schwer',
    cols: 8,
    rows: 11,
    holes: 11,
    wind: 4,
    brittleChance: 0.2,
    pings: 5,
    breath: { open: 3.0, closed: 1.6, ramp: 0.5 },
    crystals: 2,
    anchors: 2,
    glass: 3,
    jukeboxes: 1,
    floors: 2,
    brightChance: 0.5,
    puzzle: { keys: 2, switch: true },
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
  const breathPeriod = p.breath.open + p.breath.closed + 2 * p.breath.ramp;

  // Zutaten deterministisch auf die Ebenen verteilen (wie die Tages-Challenge).
  const deal = (total: number): number[] => {
    const counts = new Array<number>(p.floors).fill(0);
    for (let i = 0; i < total; i++) counts[Math.floor(rng() * p.floors)]!++;
    return counts;
  };
  const holesPer = deal(p.holes);
  const windPer = deal(p.wind);
  const crystalsPer = deal(p.crystals);
  const anchorsPer = deal(p.anchors);
  const glassPer = deal(p.glass);
  const jukeFloor = p.jukeboxes ? Math.floor(rng() * p.floors) : -1;
  // Helle Ebenen: je Ebene gewürfelt, aber nie ALLE (bei mehreren Ebenen
  // bleibt die Welt irgendwo dunkel). Das Rätsel liegt auf der ersten hellen,
  // sonst auf der letzten Ebene.
  const bright = Array.from({ length: p.floors }, () => rng() < p.brightChance);
  if (p.floors > 1 && bright.every(Boolean)) bright[0] = false;
  const puzzleFloor = p.puzzle ? (bright.indexOf(true) !== -1 ? bright.indexOf(true) : p.floors - 1) : -1;

  // Start (E1) und Landepunkte der Transporter-Kette vorab würfeln.
  const randomCell = (): [number, number] => [Math.floor(rng() * cols), Math.floor(rng() * rows)];
  const landings: Array<[number, number]> = Array.from({ length: p.floors }, randomCell);

  const floors: LevelDef['floors'] = [];
  for (let f = 0; f < p.floors; f++) {
    const mazeSeed = Math.floor(rng() * 0x7fffffff);
    const cells = generateMaze(cols, rows, mulberry32(mazeSeed));
    const start = landings[f]!;
    const isLast = f === p.floors - 1;

    // Ausgang (Ziel bzw. Transporter) zufällig, Mindestabstand (Manhattan)
    // hält die Strecke lang; Fallback: gegenüberliegende Ecke.
    const minDist = Math.max(cols, rows);
    let exit: [number, number] = [cols - 1 - (start[0] > cols / 2 ? cols - 1 : 0), rows - 1 - (start[1] > rows / 2 ? rows - 1 : 0)];
    for (let i = 0; i < 80; i++) {
      const g = randomCell();
      if (Math.abs(start[0] - g[0]) + Math.abs(start[1] - g[1]) >= minDist) {
        exit = g;
        break;
      }
    }

    // Dasselbe Maze wie im Loader, um Checkpoints auf den Lösungsweg zu legen.
    const path = solveMaze(cells, cols, rows, { x: start[0], y: start[1] }, { x: exit[0], y: exit[1] });
    const cpCells: Array<[number, number]> = [
      [path[Math.floor(path.length / 3)]!.x, path[Math.floor(path.length / 3)]!.y],
      [path[Math.floor((2 * path.length) / 3)]!.x, path[Math.floor((2 * path.length) / 3)]!.y],
    ];

    const forbidden = new Set<number>([start[1] * cols + start[0], exit[1] * cols + exit[0]]);
    for (const [x, y] of cpCells) forbidden.add(y * cols + x);

    const elements: ElementDef[] = [];
    if (f > 0) elements.push({ type: 'checkpoint', cell: start, r: 30 }); // Ankunft
    for (const cell of cpCells) elements.push({ type: 'checkpoint', cell, r: 30 });
    if (!isLast) elements.push({ type: 'transporter', cell: exit, target: { floor: f + 1, cell: landings[f + 1]! }, r: 32 });

    // Pflichtwege: Lösungsweg + Wege zu Kristallen (+ Öffnern) – im perfekten
    // Maze eindeutig, die Invariante ist damit testbar.
    const protectedCells = new Set<number>(path.map((c) => c.y * cols + c.x));

    // M42: Tür-Rätsel VOR den anderen Zutaten – seine Öffner brauchen freie
    // Zellen, seine Wege werden geschützt.
    if (f === puzzleFloor && p.puzzle) {
      const plan = planDoorPuzzle(cells, cols, rows, rng, path, forbidden, p.puzzle, `tor-e${f + 1}`);
      if (plan) {
        elements.push(...plan.elements);
        for (const k of plan.protectedCells) protectedCells.add(k);
      }
    }

    for (const cell of pickCells(holesPer[f]!, forbidden, rng, cols, rows)) {
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
    for (const cell of pickCells(windPer[f]!, forbidden, rng, cols, rows)) {
      elements.push({ type: 'windZone', cell, dir: dirs[Math.floor(rng() * 4)]!, force: 1150 });
    }

    // M11: Echo-Kristalle frei platzieren; Sog-Anker und Glasboden beweisbar
    // ABSEITS der Pflichtwege.
    const crystalCells = pickCells(crystalsPer[f]!, forbidden, rng, cols, rows);
    for (const cell of crystalCells) elements.push({ type: 'echoCrystal', cell, r: 16 });
    for (const [cx, cy] of crystalCells) {
      for (const c of solveMaze(cells, cols, rows, { x: start[0], y: start[1] }, { x: cx, y: cy })) {
        protectedCells.add(c.y * cols + c.x);
      }
    }
    const offPath = (key: number) => !protectedCells.has(key);
    for (const cell of pickCellsWhere(anchorsPer[f]!, forbidden, rng, cols, rows, offPath)) {
      elements.push({ type: 'anchor', cell, r: 120, force: 2000 });
    }
    for (const cell of pickCellsWhere(glassPer[f]!, forbidden, rng, cols, rows, offPath)) {
      elements.push({ type: 'glass', cell });
    }
    // M27: Der Musikautomat ist eine WAND – er muss noch strenger abseits
    // liegen als Anker und Glas, denn er nimmt die Zelle für immer. Derselbe
    // offPath-Filter (Lösungsweg + Wege zu Kristallen und Öffnern) leistet
    // genau das: Im perfekten Maze schneidet eine Zelle abseits dieser Pfade
    // nur ihren eigenen Ast ab, und dort steht nichts, was man braucht.
    // Zusätzlich muss die Zelle vom Start aus erreichbar sein, sonst könnte
    // man den Automaten nicht anrempeln (`floodMaze`). Nur EINER pro Ebene:
    // Es gibt einen Musik-Bus, es klingt immer nur der nächste.
    if (f === jukeFloor) {
      const open = floodMaze(cells, cols, rows, { x: start[0], y: start[1] });
      const placeable = (key: number) => offPath(key) && open.has(key);
      const [cell] = pickCellsWhere(1, forbidden, rng, cols, rows, placeable);
      if (cell) elements.push({ type: 'jukebox', cell, playlist: playlistFrom(rng), volume: 1, startIndex: 0 });
    }

    floors.push({
      size: [cols, rows],
      maze: { seed: mazeSeed, carve: [], add: [], brittle: [], brittleSide: [], absorb: [], mirrors: [], brittleChance: p.brittleChance, brittleHits: 3 },
      elements,
      start,
      goal: isLast ? exit : null,
      bright: bright[f]!,
      dusk: false,
    });
  }

  return {
    id: `quick-${preset}-${seed}`,
    players: 1,
    mpMode: 'any',
    marks: 3, // Solo ungenutzt (M89): Bojen gibt es nur zu zweit
    name: 'Schnelles Spiel',
    pingBudget: p.pings,
    floors,
  };
}
