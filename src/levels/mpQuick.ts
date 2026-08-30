// Zufällige Multiplayer-Level: deterministisch aus Seed + Modus generiert
// (wie das Schnelle Spiel, aber mit Multiplayer-Elementen). Der Host schickt
// nur die Level-ID ("mpq-<modus>-<seed>") – der Gast regeneriert daraus
// dasselbe Level (parseMpQuickId in app.ts).
//
// Coop-Muster mit Beweisbarkeits-Garantie: Das Ziel ist ein BLATT des
// Maze-Baums (Sackgasse mit genau einer offenen Kante). Die Tür sitzt auf
// genau dieser Kante -> einziger Eingang, ohne dass add-Wände den Baum
// zerschneiden könnten. Platte außen nahe dem Start, Platte innen im Ziel
// (Selbstbefreiung). Keine zufällig brüchigen Wände im Coop – sie könnten
// die versiegelte Kammer aufbrechen. tests/multiplayer.test.ts beweist die
// Invarianten über viele Seeds.

import { generateMaze, solveMaze, type Cell } from '../core/maze';
import { mulberry32, seedFromString, type Rng } from '../core/rng';
import { BALL_R } from '../core/constants';
import type { LevelDef } from './schema';
import { parseLevel } from './schema';

export type MpMode = 'coop' | 'race';

const SIZES: Record<MpMode, [number, number]> = { coop: [7, 9], race: [7, 10] };

function pickCell(rng: Rng, cols: number, rows: number, forbidden: Set<number>): [number, number] {
  for (;;) {
    const x = Math.floor(rng() * cols);
    const y = Math.floor(rng() * rows);
    if (forbidden.has(y * cols + x)) continue;
    forbidden.add(y * cols + x);
    return [x, y];
  }
}

// Zelle aus einer gefilterten Kandidatenmenge wählen – terminiert garantiert
// und verschmutzt forbidden nicht mit verworfenen Würfen. Ist die Menge leer,
// wird der Filter fallengelassen.
function pickWhere(
  rng: Rng,
  cols: number,
  rows: number,
  forbidden: Set<number>,
  keep: (x: number, y: number) => boolean,
): [number, number] {
  const candidates: Array<[number, number]> = [];
  const fallback: Array<[number, number]> = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (forbidden.has(y * cols + x)) continue;
      fallback.push([x, y]);
      if (keep(x, y)) candidates.push([x, y]);
    }
  }
  const pool = candidates.length ? candidates : fallback;
  const cell = pool[Math.floor(rng() * pool.length)]!;
  forbidden.add(cell[1] * cols + cell[0]);
  return cell;
}

// BFS-Distanzen von einem Startpunkt über offene Kanten.
function distances(cells: Cell[], cols: number, rows: number, from: [number, number]): Int32Array {
  const dist = new Int32Array(cols * rows).fill(-1);
  const queue: number[] = [from[1] * cols + from[0]];
  dist[queue[0]!] = 0;
  while (queue.length) {
    const c = queue.shift()!;
    const cell = cells[c]!;
    const next: number[] = [];
    if (!cell.n) next.push(c - cols);
    if (!cell.e) next.push(c + 1);
    if (!cell.s) next.push(c + cols);
    if (!cell.w) next.push(c - 1);
    for (const n of next) {
      if (dist[n] === -1) {
        dist[n] = dist[c]! + 1;
        queue.push(n);
      }
    }
  }
  return dist;
}

export function generateMpLevel(seed: number, mode: MpMode): LevelDef {
  const [cols, rows] = SIZES[mode];
  const rng = mulberry32(seedFromString(`tiltr-mpq-${mode}-${seed}`));
  const mazeSeed = Math.floor(rng() * 0x7fffffff);
  const cells = generateMaze(cols, rows, mulberry32(mazeSeed));

  const start = pickCell(rng, cols, rows, new Set());
  const dist = distances(cells, cols, rows, start);
  const idx = (c: readonly [number, number]) => c[1] * cols + c[0];

  // Rohdaten – parseLevel validiert und füllt Defaults (z. B. Platten-Radius).
  const elements: unknown[] = [];
  const forbidden = new Set<number>([idx(start)]);
  let goal: [number, number];

  if (mode === 'coop') {
    // Ziel = am weitesten entferntes Blatt (genau eine offene Kante).
    let best: { cell: [number, number]; dir: 'n' | 'e' | 's' | 'w' } | null = null;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const c = cells[y * cols + x]!;
        const open = (['n', 'e', 's', 'w'] as const).filter((d) => !c[d]);
        if (open.length !== 1 || (x === start[0] && y === start[1])) continue;
        if (!best || dist[y * cols + x]! > dist[idx(best.cell)]!) best = { cell: [x, y], dir: open[0]! };
      }
    }
    if (!best) throw new Error('mpQuick: kein Blatt gefunden'); // im perfekten Maze unmöglich
    goal = best.cell;
    forbidden.add(idx(goal));
    elements.push({ type: 'door', id: 'g1', edge: [goal, best.dir] });
    elements.push({ type: 'plate', cell: goal, opens: 'g1' });
    // Außenplatte nahe dem Start (Halter bleibt zurück, Läufer reist).
    const outside = pickWhere(rng, cols, rows, forbidden, (x, y) => dist[y * cols + x]! >= 1 && dist[y * cols + x]! <= 2);
    elements.push({ type: 'plate', cell: outside, opens: 'g1' });
  } else {
    const minDist = Math.max(cols, rows);
    goal = pickWhere(rng, cols, rows, forbidden, (x, y) => Math.abs(x - start[0]) + Math.abs(y - start[1]) >= minDist);
  }

  // Checkpoints auf dem Lösungsweg (bei Coop: bis vor die Zieltür).
  const path = solveMaze(cells, cols, rows, { x: start[0], y: start[1] }, { x: goal[0], y: goal[1] });
  for (const f of [1 / 3, 2 / 3]) {
    const p = path[Math.floor(path.length * f)];
    if (p && !forbidden.has(p.y * cols + p.x)) {
      forbidden.add(p.y * cols + p.x);
      elements.push({ type: 'checkpoint', cell: [p.x, p.y], r: 30 });
    }
  }

  const holes = mode === 'coop' ? 3 : 5;
  for (let i = 0; i < holes; i++) {
    elements.push({
      type: 'hole',
      cell: pickCell(rng, cols, rows, forbidden),
      r: BALL_R * 0.95,
      jitter: [(rng() - 0.5) * 16, (rng() - 0.5) * 16],
      breathing: { open: 2.6, closed: 2.2, ramp: 0.6, offset: rng() * 6 },
    });
  }
  const dirs = ['n', 'e', 's', 'w'] as const;
  for (let i = 0; i < (mode === 'coop' ? 1 : 2); i++) {
    elements.push({ type: 'windZone', cell: pickCell(rng, cols, rows, forbidden), dir: dirs[Math.floor(rng() * 4)]!, force: 1150 });
  }
  // M11: ein Echo-Kristall als Bonus – reiner Pickup, berührt die
  // Coop-Siegel-Invarianten nicht (Ziel/Start sind ohnehin verboten).
  elements.push({ type: 'echoCrystal', cell: pickCell(rng, cols, rows, forbidden) });

  return parseLevel({
    id: `mpq-${mode}-${seed}`,
    name: 'Zufallslevel',
    pingBudget: 4,
    floors: [
      {
        size: [cols, rows],
        maze: {
          seed: mazeSeed,
          carve: [],
          add: [],
          brittle: [],
          // Coop: keine zufällig brüchigen Wände – sie könnten die
          // versiegelte Zielkammer aufbrechen (Tür wäre umgehbar).
          brittleChance: mode === 'coop' ? 0 : 0.15,
          brittleHits: 3,
        },
        elements,
        start,
        goal,
      },
    ],
  });
}

/** "mpq-<modus>-<seed>" -> regeneriertes Level (für den Gast im Setup). */
export function parseMpQuickId(id: string): LevelDef | null {
  const m = id.match(/^mpq-(coop|race)-(\d+)$/);
  return m ? generateMpLevel(Number(m[2]), m[1] as MpMode) : null;
}
