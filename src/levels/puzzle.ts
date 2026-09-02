// Tür-Rätsel für die Generatoren (Quick, Daily): EINE Tür auf dem Pflichtweg
// einer Ebene, davor mehrere Öffner – Schlüssel und optional ein Zeitschloss –
// mit `require: 'all'`, wenn es mehr als einer ist. Rein und deterministisch
// (nur der übergebene Rng).
//
// Warum das beweisbar bleibt: Der Grundriss ist ein perfektes Maze, also ein
// BAUM. Eine Tür auf dem Weg Ankunft → Ausgang teilt ihn in GENAU zwei Teile:
// den Ankunfts-Teil und den Ausgangs-Teil. Alle Öffner liegen im
// Ankunfts-Teil – damit sind sie ohne die Tür erreichbar (`openers`), die
// Tür öffnet im Fixpunkt (`goal`), und wer schon durch ist, braucht die Öffner
// nicht mehr (`softlock`). Das Zeitschloss steht höchstens SWITCH_MAX_STEPS
// Zellen vor der Tür; 8 s reichen dafür mit dem 2,5×-Sicherheitsfaktor des
// `timer`-Beweises bequem. Die Wege zu den Öffnern werden als Pflichtwege
// zurückgegeben, damit Anker, Glas und Automat sie nicht verstellen.

import type { Cell } from '../core/maze';
import type { Rng } from '../core/rng';
import type { ElementDef } from './schema';

type XY = { x: number; y: number };
type Dir = 'n' | 'e' | 's' | 'w';

export interface PuzzleSpec {
  /** Anzahl Schlüssel vor der Tür */
  keys: number;
  /** zusätzlich ein Zeitschloss-Schalter nahe der Tür */
  switch: boolean;
}

export interface PuzzlePlan {
  elements: ElementDef[];
  /** Index im Pfad: die Tür sitzt zwischen path[doorIndex] und path[doorIndex + 1] */
  doorIndex: number;
  /** Zellen der Wege Ankunft → Öffner (Pflichtwege, zu schützen) */
  protectedCells: Set<number>;
  openerCells: Array<[number, number]>;
}

const DIRS: ReadonlyArray<readonly [Dir, number, number]> = [
  ['n', 0, -1],
  ['e', 1, 0],
  ['s', 0, 1],
  ['w', -1, 0],
];

export const SWITCH_MAX_STEPS = 6;
export const SWITCH_DURATION_S = 8;

function dirBetween(a: XY, b: XY): Dir | null {
  for (const [d, dx, dy] of DIRS) if (a.x + dx === b.x && a.y + dy === b.y) return d;
  return null;
}

/** BFS von `from`, ohne die Kante a↔b zu kreuzen: Distanzen und Vorgänger. */
export function bfsWithout(
  cells: readonly Cell[],
  cols: number,
  rows: number,
  from: XY,
  cut: { a: XY; b: XY } | null,
): { dist: Map<number, number>; parent: Map<number, number> } {
  const key = (c: XY) => c.y * cols + c.x;
  const dist = new Map<number, number>([[key(from), 0]]);
  const parent = new Map<number, number>();
  const queue: XY[] = [from];
  const isCut = (c: XY, n: XY) =>
    !!cut &&
    ((c.x === cut.a.x && c.y === cut.a.y && n.x === cut.b.x && n.y === cut.b.y) ||
      (c.x === cut.b.x && c.y === cut.b.y && n.x === cut.a.x && n.y === cut.a.y));
  while (queue.length) {
    const c = queue.shift()!;
    const d = dist.get(key(c))!;
    const cell = cells[key(c)]!;
    for (const [dir, dx, dy] of DIRS) {
      if (cell[dir]) continue; // Wand
      const n = { x: c.x + dx, y: c.y + dy };
      if (n.x < 0 || n.y < 0 || n.x >= cols || n.y >= rows) continue;
      if (isCut(c, n)) continue;
      const k = key(n);
      if (dist.has(k)) continue;
      dist.set(k, d + 1);
      parent.set(k, key(c));
      queue.push(n);
    }
  }
  return { dist, parent };
}

/** Zellen des Weges von der BFS-Wurzel zu `to` (inklusive beider Enden). */
function pathTo(parent: Map<number, number>, root: number, to: number): number[] {
  const out = [to];
  let k = to;
  while (k !== root) {
    const p = parent.get(k);
    if (p === undefined) return out; // nicht erreichbar – der Aufrufer prüft dist
    out.push(p);
    k = p;
  }
  return out;
}

export function planDoorPuzzle(
  cells: readonly Cell[],
  cols: number,
  rows: number,
  rng: Rng,
  path: readonly XY[],
  forbidden: Set<number>,
  spec: PuzzleSpec,
  id: string,
): PuzzlePlan | null {
  if (path.length < 6 || (spec.keys <= 0 && !spec.switch)) return null;
  const key = (c: XY) => c.y * cols + c.x;
  const from = path[0]!;
  // Tür im mittleren Drittel des Weges – nicht direkt am Start, nicht am Ziel.
  const lo = Math.floor(path.length * 0.35);
  const hi = Math.min(path.length - 2, Math.floor(path.length * 0.65));
  const i = lo + Math.floor(rng() * (hi - lo + 1));
  const a = path[i]!;
  const b = path[i + 1]!;
  const dir = dirBetween(a, b);
  if (!dir) return null;

  const before = bfsWithout(cells, cols, rows, from, { a, b });
  const spine = new Set(path.map(key));
  // Kandidaten: Ankunfts-Teil, frei, bevorzugt ABSEITS des Rückgrats (eine
  // Sackgasse, in die man hineinmuss) – notfalls Rückgrat-Zellen vor der Tür.
  const shuffle = <T>(arr: T[]): T[] => {
    for (let n = arr.length - 1; n > 0; n--) {
      const j = Math.floor(rng() * (n + 1));
      [arr[n], arr[j]] = [arr[j]!, arr[n]!];
    }
    return arr;
  };
  const side = shuffle([...before.dist.keys()].filter((k) => !forbidden.has(k) && !spine.has(k)));
  const onSpine = shuffle(path.slice(1, i).map(key).filter((k) => !forbidden.has(k)));
  const candidates = [...side, ...onSpine];

  const openers: ElementDef[] = [];
  const openerCells: Array<[number, number]> = [];
  const take = (k: number): [number, number] => {
    forbidden.add(k);
    const cell: [number, number] = [k % cols, Math.floor(k / cols)];
    openerCells.push(cell);
    return cell;
  };
  let used = 0;
  for (; used < candidates.length && openers.length < spec.keys; used++) {
    openers.push({ type: 'key', cell: take(candidates[used]!), opens: id, r: 18, voice: 'tinkle' });
  }
  if (spec.switch) {
    // Nahe der Tür: Distanz im Ankunfts-Teil zur Türzelle a.
    const toDoor = bfsWithout(cells, cols, rows, a, { a, b }).dist;
    const near = candidates.slice(used).find((k) => (toDoor.get(k) ?? Infinity) <= SWITCH_MAX_STEPS);
    if (near !== undefined) {
      openers.push({ type: 'timedSwitch', cell: take(near), opens: id, durationS: SWITCH_DURATION_S, r: 30 });
    }
  }
  if (!openers.length) return null;

  const protectedCells = new Set<number>();
  for (const c of openerCells) for (const k of pathTo(before.parent, key(from), c[1] * cols + c[0])) protectedCells.add(k);

  const door: ElementDef = {
    type: 'door',
    id,
    edge: [[a.x, a.y], dir],
    require: openers.length > 1 ? 'all' : 'any',
  };
  return { elements: [door, ...openers], doorIndex: i, protectedCells, openerCells };
}
