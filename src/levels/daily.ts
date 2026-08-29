// Tages-Challenge: Seed = UTC-Datum -> deterministisch dasselbe Level für
// alle, komplett serverlos. Mehrstöckig: das Ziel liegt auf der untersten
// Ebene, eine Transporter-Kette führt hinab (jede Ebene ist als perfektes
// Maze voll zusammenhängend – die Kette ist damit beweisbar lösbar).
// Schwierigkeit steigt über die Woche: Montag sanft, Sonntag das volle Programm.

import { generateMaze, type Cell } from '../core/maze';
import { mulberry32, seedFromString, type Rng } from '../core/rng';
import { BALL_R } from '../core/constants';
import type { ElementDef, LevelDef } from './schema';

export function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formatDate(date: string): string {
  const [y, m, d] = date.split('-');
  return `${d}.${m}.${y}`;
}

interface DayParams {
  label: string;
  floors: number;
  cols: number;
  rows: number;
  holes: number;
  wind: number;
  guards: number;
  brittleChance: number;
  pings: number;
  gems: number;
}

// Index = getUTCDay(): 0 = Sonntag.
const WEEKDAYS: DayParams[] = [
  { label: 'Sonntag – das volle Programm', floors: 3, cols: 7, rows: 8, holes: 6, wind: 2, guards: 2, brittleChance: 0.18, pings: 3, gems: 4 },
  { label: 'Montag – sanfter Einstieg', floors: 2, cols: 5, rows: 6, holes: 2, wind: 0, guards: 0, brittleChance: 0, pings: 4, gems: 2 },
  { label: 'Dienstag – erster Gegenwind', floors: 2, cols: 5, rows: 7, holes: 3, wind: 1, guards: 0, brittleChance: 0, pings: 4, gems: 2 },
  { label: 'Mittwoch – die Wache erwacht', floors: 2, cols: 6, rows: 7, holes: 3, wind: 1, guards: 1, brittleChance: 0.1, pings: 3, gems: 3 },
  { label: 'Donnerstag – drei Ebenen tief', floors: 3, cols: 5, rows: 6, holes: 3, wind: 1, guards: 1, brittleChance: 0.1, pings: 4, gems: 3 },
  { label: 'Freitag – es wird eng', floors: 3, cols: 6, rows: 7, holes: 4, wind: 2, guards: 1, brittleChance: 0.12, pings: 3, gems: 3 },
  { label: 'Samstag – tief und wachsam', floors: 3, cols: 6, rows: 8, holes: 5, wind: 2, guards: 2, brittleChance: 0.15, pings: 3, gems: 4 },
];

function pickCell(rng: Rng, cols: number, rows: number, forbidden: Set<number>): [number, number] {
  for (;;) {
    const x = Math.floor(rng() * cols);
    const y = Math.floor(rng() * rows);
    const key = y * cols + x;
    if (forbidden.has(key)) continue;
    forbidden.add(key);
    return [x, y];
  }
}

// Gerade, offene Patrouille im Maze suchen (2–3 Zellen); null wenn keine passt.
function findPatrol(
  cells: Cell[],
  cols: number,
  rows: number,
  rng: Rng,
  forbidden: Set<number>,
): Array<[number, number]> | null {
  const dirs = [
    { dx: 1, dy: 0, edge: 'e' as const },
    { dx: 0, dy: 1, edge: 's' as const },
  ];
  for (let attempt = 0; attempt < 60; attempt++) {
    const x0 = Math.floor(rng() * cols);
    const y0 = Math.floor(rng() * rows);
    const d = dirs[Math.floor(rng() * 2)]!;
    const run: Array<[number, number]> = [[x0, y0]];
    let [x, y] = [x0, y0];
    while (run.length < 3) {
      const c = cells[y * cols + x]!;
      const open = d.edge === 'e' ? !c.e && x + 1 < cols : !c.s && y + 1 < rows;
      if (!open) break;
      x += d.dx;
      y += d.dy;
      run.push([x, y]);
    }
    if (run.length < 2) continue;
    if (run.some(([cx, cy]) => forbidden.has(cy * cols + cx))) continue;
    for (const [cx, cy] of run) forbidden.add(cy * cols + cx);
    return [run[0]!, run[run.length - 1]!];
  }
  return null;
}

export function generateDailyLevel(date: string): LevelDef {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const p = WEEKDAYS[weekday]!;
  const rng = mulberry32(seedFromString(`tiltr-daily-${date}`));
  const { cols, rows } = p;

  // Zutaten deterministisch auf die Ebenen verteilen.
  const deal = (total: number): number[] => {
    const counts = new Array<number>(p.floors).fill(0);
    for (let i = 0; i < total; i++) counts[Math.floor(rng() * p.floors)]!++;
    return counts;
  };
  const holesPer = deal(p.holes);
  const windPer = deal(p.wind);
  const gemsPer = deal(p.gems);
  const guardsPer = deal(p.guards);

  // Landepunkte der Transporter-Kette vorab würfeln (Ebene k -> k+1);
  // auch der Start auf Ebene 1 ist zufällig, nicht immer oben links.
  const landings: Array<[number, number]> = [pickCell(rng, cols, rows, new Set())];
  for (let f = 1; f < p.floors; f++) {
    const forbidden = new Set<number>();
    landings.push(pickCell(rng, cols, rows, forbidden));
  }

  const floors = [];
  for (let f = 0; f < p.floors; f++) {
    const mazeSeed = Math.floor(rng() * 0x7fffffff);
    const cells = generateMaze(cols, rows, mulberry32(mazeSeed));
    const landing = landings[f]!;
    const forbidden = new Set<number>([landing[1] * cols + landing[0]]);
    const elements: ElementDef[] = [];
    const isLast = f === p.floors - 1;

    // Ankunft auf einer tieferen Ebene ist automatisch ein Checkpoint.
    if (f > 0) elements.push({ type: 'checkpoint', cell: landing, r: 30 });

    // Ausgang: Transporter hinab bzw. Ziel auf der letzten Ebene – mit
    // Mindestabstand zur Ankunft, damit die Ebene wirklich bespielt wird.
    let exit = pickCell(rng, cols, rows, forbidden);
    for (let i = 0; i < 40; i++) {
      if (Math.abs(exit[0] - landing[0]) + Math.abs(exit[1] - landing[1]) >= Math.max(cols, rows) - 1) break;
      exit = pickCell(rng, cols, rows, forbidden);
    }
    if (!isLast) {
      elements.push({ type: 'transporter', cell: exit, target: { floor: f + 1, cell: landings[f + 1]! }, r: 32 });
    }

    for (let i = 0; i < guardsPer[f]!; i++) {
      const patrol = findPatrol(cells, cols, rows, rng, forbidden);
      if (patrol) elements.push({ type: 'guard', patrol, speed: 70 + Math.floor(rng() * 40), r: 26 });
    }
    for (let i = 0; i < gemsPer[f]!; i++) {
      elements.push({ type: 'gem', cell: pickCell(rng, cols, rows, forbidden), r: 14 });
    }
    for (let i = 0; i < holesPer[f]!; i++) {
      elements.push({
        type: 'hole',
        cell: pickCell(rng, cols, rows, forbidden),
        r: BALL_R * 0.95,
        jitter: [(rng() - 0.5) * 16, (rng() - 0.5) * 16],
        breathing: { open: 2.6, closed: 2.2, ramp: 0.6, offset: rng() * 6 },
      });
    }
    const windDirs = ['n', 'e', 's', 'w'] as const;
    for (let i = 0; i < windPer[f]!; i++) {
      elements.push({
        type: 'windZone',
        cell: pickCell(rng, cols, rows, forbidden),
        dir: windDirs[Math.floor(rng() * 4)]!,
        force: 1150,
      });
    }

    floors.push({
      size: [cols, rows] as [number, number],
      maze: { seed: mazeSeed, carve: [], add: [], brittle: [], brittleChance: p.brittleChance, brittleHits: 3 },
      elements,
      start: landing,
      goal: isLast ? exit : null,
    });
  }

  return {
    id: `daily-${date}`,
    name: 'Tages-Challenge',
    intro: `${p.label}. Ein Level für alle, jeden Tag ein neues – dein erster Zieleinlauf zählt als Tageswert.`,
    pingBudget: p.pings,
    floors,
  };
}
