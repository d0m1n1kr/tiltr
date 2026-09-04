// Rollstein-Beweis (M47): Der Stein ist ein zweiter Körper, also braucht das
// Erreichbarkeits-Modell einen ZUSTAND – (Ebene, Ballzelle, Steinzellen,
// gefüllte Löcher). Der Zustandsraum ist klein (Zellen × Steinpositionen,
// bei 200 Zellen und einem Stein 40 000), eine BFS reicht.
//
// Regeln – dieselben wie in core/physics.updateBoulders, nur ohne Zeit:
//  - Der Ball betritt keine Steinzelle.
//  - Steht der Ball in A, der Stein in Nachbar B (Kante offen) und ist
//    C = B + (B − A) frei (Kante B→C offen, keine Wand, kein Automat, kein
//    Stein, kein Transporter, keine Glocke), rollt der Stein nach C und der
//    Ball steht in B. Liegt in C ein stehendes, nicht atmendes Loch, füllt
//    der Stein es: beide verschwinden. Auf Eis rollt der Stein weiter,
//    solange die nächste Zelle frei ist.
//  - Türen: wie im offenen Modell offen – AUSSER Türen, deren Öffner
//    ausschließlich Druckplatten sind. Die öffnen (any/all wie doorState),
//    wenn ein Stein auf der Platte liegt. Schlüssel/Zeitschlösser prüfen die
//    anderen Badges; hier zählt nur, was der Stein bewegt.
//  - Schiebewände gelten für den Stein als Wand (er passt nicht durch).
//
// Zwei Fragen: Ist das Ziel erreichbar (goal)? Und: Kann man sich den Stein
// so verschieben, dass es unerreichbar wird (softlock)? Die zweite Frage
// beantwortet eine Rückwärts-Suche über den Zustandsgraphen: Ein erreichbarer
// Zustand, von dem kein Ziel-Zustand mehr erreichbar ist, ist ein Softlock.

import type { LevelDef } from './schema';
import { buildFloorCells } from './validate';
import { doorState } from '../core/doors';
import type { Cell } from '../core/maze';

type Dir = 'n' | 'e' | 's' | 'w';
const STEP: Record<Dir, [number, number]> = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
const OPP: Record<Dir, Dir> = { n: 's', e: 'w', s: 'n', w: 'e' };

interface FloorModel {
  cols: number;
  rows: number;
  cells: Cell[];
  /** Zellen, die der Stein nie betritt (Automat, Transporter, Glocke) */
  stoneBlocked: Set<number>;
  /** Zellen, die der Ball nie betritt (Automat) */
  ballBlocked: Set<number>;
  ice: Set<number>;
  /** stehende, nicht atmende Löcher (Index → Loch-ID) */
  holes: Map<number, number>;
  /** `tune` = RESONANZFELD (M91): Ein Stein kann es nicht halten – er hat
   *  keine Neigung, und gestimmt wird mit Neigung. */
  plates: Array<{ idx: number; opens: string; tune?: boolean }>;
  slides: Set<string>;
  /** Türkanten je Tür-ID: "x,y,dir" */
  doorEdges: Map<string, Set<string>>;
  jumps: Array<{ from: number; toFloor: number; toIdx: number }>;
}

export interface BoulderProof {
  /** Ziel im Stein-Modell erreichbar */
  goal: boolean;
  /** kein erreichbarer Zustand ohne Weg zum Ziel */
  softlock: boolean;
  /** Anzahl erreichbarer Zustände (Debug/Test) */
  states: number;
  detail?: string;
  /** Ballzelle des Softlock-Zustands – der Editor springt dorthin (M71). */
  at?: { floor: number; cell: readonly [number, number] };
  /** Druckplatten, auf die ein Stein GESCHOBEN werden kann („fl:x,y" wie
   *  cellKey, M74). Das braucht das Zwei-Spieler-Modell: Eine Platte, die ein
   *  Stein hält, öffnet die Tür, ohne dass jemand darauf stehen bleibt. Fällt
   *  hier nebenbei ab – die Zustands-BFS läuft ohnehin. */
  stonePlates: Set<string>;
}

interface State {
  fl: number;
  ball: number; // Zellindex
  stones: number[]; // je Stein: fl*100000 + idx, -1 = versunken
  filled: number[]; // gefüllte Loch-IDs (sortiert)
}

const stateKey = (s: State): string => `${s.fl}:${s.ball}|${s.stones.join(',')}|${s.filled.join(',')}`;

/** Türen, die NUR Druckplatten als Öffner haben – die einzigen, die der Stein bewegt. */
function plateOnlyDoors(def: LevelDef): Map<string, { require: 'any' | 'all'; plates: number }> {
  const openers = new Map<string, { plates: number; other: number }>();
  const doors = new Map<string, 'any' | 'all'>();
  for (const f of def.floors) {
    for (const el of f.elements) {
      if (el.type === 'door') doors.set(el.id, el.require ?? 'any');
      if (el.type === 'plate' || el.type === 'key' || el.type === 'timedSwitch') {
        const o = openers.get(el.opens) ?? { plates: 0, other: 0 };
        if (el.type === 'plate') o.plates++;
        else o.other++;
        openers.set(el.opens, o);
      }
    }
  }
  const out = new Map<string, { require: 'any' | 'all'; plates: number }>();
  for (const [id, req] of doors) {
    const o = openers.get(id);
    if (o && o.plates > 0 && o.other === 0) out.set(id, { require: req, plates: o.plates });
  }
  return out;
}

/**
 * `start` überschreibt die Startzelle auf Ebene 1 – für Zwei-Spieler-Level,
 * in denen auch der Gast Steine schiebt (M74).
 * `heldPlates` („fl:x,y") sind Platten, die JEMAND ANDERS halten kann (im
 * Coop der Partner). Ohne sie wäre der Stein-Beweis in einem Zwei-Spieler-
 * Level blind: Eine Tür über zwei Platten – eine mit Stein, eine mit dem
 * Partner – ginge in seinem Modell nie auf, und das Level wäre rot, obwohl
 * es zu zweit sauber aufgeht. Im Solo-Level ist die Menge leer, dort ändert
 * sich nichts.
 */
export function boulderProof(
  def: LevelDef,
  start?: readonly [number, number],
  heldPlates: ReadonlySet<string> = new Set(),
): BoulderProof {
  const hasBoulder = def.floors.some((f) => f.elements.some((e) => e.type === 'boulder'));
  if (!hasBoulder) return { goal: true, softlock: true, states: 0, stonePlates: new Set() };

  const plateDoors = plateOnlyDoors(def);
  const idxOf = (cols: number, c: readonly [number, number]) => c[1] * cols + c[0];
  let holeId = 0;
  const floors: FloorModel[] = def.floors.map((f) => {
    const [cols, rows] = f.size;
    // Alle Türen offen; die Platten-Türen werden pro Zustand geprüft.
    const cells = buildFloorCells(f, { brittleOpen: true, doorsOpen: true }, def.mirror);
    const m: FloorModel = {
      cols,
      rows,
      cells,
      stoneBlocked: new Set(),
      ballBlocked: new Set(),
      ice: new Set(),
      holes: new Map(),
      plates: [],
      slides: new Set(),
      doorEdges: new Map(),
      jumps: [],
    };
    for (const el of f.elements) {
      switch (el.type) {
        case 'jukebox':
          m.stoneBlocked.add(idxOf(cols, el.cell));
          m.ballBlocked.add(idxOf(cols, el.cell));
          break;
        case 'transporter':
          m.stoneBlocked.add(idxOf(cols, el.cell));
          m.jumps.push({ from: idxOf(cols, el.cell), toFloor: el.target.floor, toIdx: idxOf(def.floors[el.target.floor]!.size[0], el.target.cell) });
          break;
        case 'bell':
          m.stoneBlocked.add(idxOf(cols, el.cell));
          break;
        case 'ice':
          m.ice.add(idxOf(cols, el.cell));
          break;
        case 'hole':
          if (!el.breathing) m.holes.set(idxOf(cols, el.cell), holeId++);
          break;
        case 'plate':
          m.plates.push({ idx: idxOf(cols, el.cell), opens: el.opens, tune: el.tune !== undefined });
          break;
        case 'slidingWall':
          m.slides.add(`${el.edge[0][0]},${el.edge[0][1]},${el.edge[1]}`);
          break;
        case 'door':
          if (plateDoors.has(el.id)) {
            const set = m.doorEdges.get(el.id) ?? new Set();
            set.add(`${el.edge[0][0]},${el.edge[0][1]},${el.edge[1]}`);
            const [[x, y], d] = el.edge;
            const [ox, oy] = STEP[d];
            set.add(`${x + ox},${y + oy},${OPP[d]}`);
            m.doorEdges.set(el.id, set);
          }
          break;
      }
    }
    return m;
  });

  const stones: number[] = [];
  def.floors.forEach((f, fl) => {
    for (const el of f.elements) if (el.type === 'boulder') stones.push(fl * 100000 + idxOf(f.size[0], el.cell));
  });
  const goalFl = def.floors.findIndex((f) => f.goal);
  if (goalFl < 0) return { goal: false, softlock: false, states: 0, detail: 'kein Ziel', stonePlates: new Set() };
  const goalIdx = idxOf(def.floors[goalFl]!.size[0], def.floors[goalFl]!.goal!);

  /** Kante offen für den Ball im Zustand s (Wände, Schiebewände offen wie im
   *  offenen Modell; Platten-Türen nur, wenn ihre Platten von Steinen gehalten). */
  const edgeOpenForBall = (s: State, fl: number, x: number, y: number, d: Dir): boolean => {
    const m = floors[fl]!;
    if (m.cells[y * m.cols + x]![d]) return false;
    for (const [doorId, edges] of m.doorEdges) {
      if (!edges.has(`${x},${y},${d}`)) continue;
      const pd = plateDoors.get(doorId)!;
      let held = 0;
      let total = 0;
      floors.forEach((fm, ffl) => {
        for (const pl of fm.plates) {
          if (pl.opens !== doorId) continue;
          total++;
          const key = `${ffl}:${pl.idx % fm.cols},${Math.floor(pl.idx / fm.cols)}`;
          // Ein STEIN hält kein Resonanzfeld (M91) – der PARTNER schon, wenn
          // `heldPlates` es sagt (das rechnet pairReachable samt Halte-Regel).
          if ((!pl.tune && s.stones.includes(ffl * 100000 + pl.idx)) || heldPlates.has(key)) held++;
        }
      });
      const st = doorState(
        Array.from({ length: total }, (_, i) => ({ kind: 'plate' as const, satisfied: i < held })),
        pd.require,
      );
      if (!st.open) return false;
    }
    return true;
  };
  /** Kante offen für den Stein: Wand oder Schiebewand sperrt; Türkanten
   *  gelten wie für den Ball. */
  const edgeOpenForStone = (s: State, fl: number, x: number, y: number, d: Dir): boolean => {
    const m = floors[fl]!;
    if (m.slides.has(`${x},${y},${d}`)) return false;
    const [ox, oy] = STEP[d];
    if (m.slides.has(`${x + ox},${y + oy},${OPP[d]}`)) return false;
    return edgeOpenForBall(s, fl, x, y, d);
  };

  const inBounds = (m: FloorModel, x: number, y: number) => x >= 0 && y >= 0 && x < m.cols && y < m.rows;

  const start0: State = { fl: 0, ball: idxOf(def.floors[0]!.size[0], start ?? def.floors[0]!.start), stones, filled: [] };
  const seen = new Map<string, State>();
  const edges = new Map<string, string[]>(); // Vorwärtskanten für die Rückwärtssuche
  const goalStates: string[] = [];
  const queue: State[] = [start0];
  seen.set(stateKey(start0), start0);
  const MAX_STATES = 60000;

  // Platten, auf denen in irgendeinem erreichbaren Zustand ein Stein liegt.
  const stonePlates = new Set<string>();
  const plateAt = new Map<string, string>(); // "fl*100000+idx" -> "fl:x,y"
  floors.forEach((fm, ffl) => {
    for (const pl of fm.plates) {
      // Resonanzfelder gehören NICHT in `stonePlates`: Was ein Stein nicht
      // halten kann, darf der Paar-Beweis auch nicht als gehalten annehmen (M74).
      if (pl.tune) continue;
      const px = pl.idx % fm.cols;
      const py = Math.floor(pl.idx / fm.cols);
      plateAt.set(String(ffl * 100000 + pl.idx), `${ffl}:${px},${py}`);
    }
  });

  while (queue.length) {
    const s = queue.shift()!;
    const k = stateKey(s);
    if (s.fl === goalFl && s.ball === goalIdx) goalStates.push(k);
    for (const st of s.stones) {
      const key = plateAt.get(String(st));
      if (key) stonePlates.add(key);
    }
    const m = floors[s.fl]!;
    const x = s.ball % m.cols,
      y = Math.floor(s.ball / m.cols);
    const next: State[] = [];
    for (const d of ['n', 'e', 's', 'w'] as Dir[]) {
      const [ox, oy] = STEP[d];
      const nx = x + ox,
        ny = y + oy;
      if (!inBounds(m, nx, ny) || !edgeOpenForBall(s, s.fl, x, y, d)) continue;
      const nIdx = ny * m.cols + nx;
      if (m.ballBlocked.has(nIdx)) continue;
      const stoneAt = s.stones.indexOf(s.fl * 100000 + nIdx);
      if (stoneAt < 0) {
        next.push({ ...s, ball: nIdx });
        continue;
      }
      // Stein anstoßen: er rollt in Richtung d weiter (auf Eis, bis er hängt).
      let sx = nx,
        sy = ny;
      const stones2 = s.stones.slice();
      let filled2 = s.filled;
      let moved = false;
      for (;;) {
        const tx = sx + ox,
          ty = sy + oy;
        if (!inBounds(m, tx, ty) || !edgeOpenForStone(s, s.fl, sx, sy, d)) break;
        const tIdx = ty * m.cols + tx;
        if (m.stoneBlocked.has(tIdx) || stones2.includes(s.fl * 100000 + tIdx)) break;
        moved = true;
        sx = tx;
        sy = ty;
        const hid = m.holes.get(tIdx);
        if (hid !== undefined && !filled2.includes(hid)) {
          stones2[stoneAt] = -1;
          filled2 = [...filled2, hid].sort((a, b) => a - b);
          break;
        }
        stones2[stoneAt] = s.fl * 100000 + tIdx;
        if (!m.ice.has(tIdx)) break;
      }
      if (!moved) continue;
      next.push({ fl: s.fl, ball: nIdx, stones: stones2, filled: filled2 });
    }
    for (const j of m.jumps) if (j.from === s.ball) next.push({ ...s, fl: j.toFloor, ball: j.toIdx });

    const outKeys: string[] = [];
    for (const n of next) {
      const nk = stateKey(n);
      outKeys.push(nk);
      if (!seen.has(nk)) {
        seen.set(nk, n);
        queue.push(n);
        if (seen.size > MAX_STATES) return { goal: false, softlock: false, states: seen.size, detail: 'Zustandsraum zu groß', stonePlates };
      }
    }
    edges.set(k, outKeys);
  }

  if (goalStates.length === 0) return { goal: false, softlock: false, states: seen.size, detail: 'Ziel', stonePlates };

  // Rückwärts: Von welchen Zuständen aus ist ein Ziel-Zustand erreichbar?
  const rev = new Map<string, string[]>();
  for (const [from, outs] of edges) for (const to of outs) (rev.get(to) ?? rev.set(to, []).get(to)!).push(from);
  const canReach = new Set<string>(goalStates);
  const stack = [...goalStates];
  while (stack.length) {
    const k = stack.pop()!;
    for (const p of rev.get(k) ?? []) {
      if (!canReach.has(p)) {
        canReach.add(p);
        stack.push(p);
      }
    }
  }
  for (const [k, s] of seen) {
    if (!canReach.has(k)) {
      const m = floors[s.fl]!;
      return {
        goal: true,
        softlock: false,
        states: seen.size,
        detail: `Softlock E${s.fl + 1} (${s.ball % m.cols},${Math.floor(s.ball / m.cols)})`,
        at: { floor: s.fl, cell: [s.ball % m.cols, Math.floor(s.ball / m.cols)] },
        stonePlates,
      };
    }
  }
  return { goal: true, softlock: true, states: seen.size, stonePlates };
}

