// Lösbarkeits-Beweise – EINE Quelle der Wahrheit für Testsuite UND Editor.
// Das Modell: BFS über (Ebene, Zelle). Transporter sind GERICHTETE Kanten,
// ebenso Strömungen (aus einer Strömungszelle geht es nur in Fließrichtung
// hinaus, niemand betritt sie gegen den Strom). Schiebewände zählen als
// offen (sie öffnen sich zyklisch – Warten genügt). Zeitschloss-Schalter
// sind im Öffner-Fixpunkt Tür-Öffner wie Schlüssel/Platten. Glasboden- und
// Sog-Anker-Zellen können als gesperrt modelliert werden (`glassBlocked` /
// `anchorsBlocked`, getrennt und BEWUSST zu wählen) – so wird bewiesen, dass
// sie nie auf einem Pflichtweg
// liegen. Jukebox-Zellen sind dagegen IMMER gesperrt: Der Automat ist ein
// massiver Kasten, keine Gefahr, die man umgehen könnte.

import { generateMaze, mirrorCells, setWall, type Cell } from '../core/maze';
import { MUSIC_IDS } from '../music';
import { mulberry32 } from '../core/rng';
import { loadLevel } from './loader';
import { parseLevel, type DoorDef, type FloorDef, type JukeboxDef, type LevelDef } from './schema';
import { boulderProof } from './boulders';

export interface CellConfig {
  brittleOpen: boolean;
  doorsOpen: boolean;
  /** Nur diese Tür-IDs gelten als offen (wenn doorsOpen false ist). */
  openDoorIds?: Set<string>;
  /** Glasboden-Zellen als gesperrt behandeln. Glas hält EINE Überfahrt aus
   *  (knacken, dann brechen) – ein Weg, der zweimal darüber muss, tötet.
   *  Deshalb die Design-Regel: Glas ist Abkürzung oder Köder, nie Pflichtweg. */
  glassBlocked?: boolean;
  /** Sog-Anker-Zellen als gesperrt behandeln. NUR für Design-Regeln der
   *  eigenen Generatoren – als Lösbarkeits-Aussage ist es FALSCH: Der Sog
   *  bleibt per Schema-Invariante unter der Neigungs-Beschleunigung
   *  (force ≤ 2400 vs. accel 2600), man kommt also immer wieder heraus. Ein
   *  Anker kostet Zeit, er versperrt nichts. */
  anchorsBlocked?: boolean;
  /**
   * Wächter ernst nehmen. In einem Ein-Zellen-Korridor passt man nicht an
   * einem Wächter vorbei (Kollision ab 48 Einheiten, seitlich sind höchstens
   * 23 möglich) und überholen kann man ihn nie. Modell: Patrouillenzellen
   * sind kein Durchgangsgebiet, sondern werden ABSCHNITTSWEISE gequert –
   * von einem Zugang zum nächsten, und nur solange dabei mindestens eine
   * Patrouillenzelle frei bleibt, auf der sich der Wächter aufhalten kann.
   * Damit sind Quer-Passagen und Etappen über Ausweichbuchten erlaubt,
   * eine Ende-zu-Ende-Durchquerung ohne Zuflucht dagegen nicht.
   */
  guardSafe?: boolean;
  /**
   * Jukebox-Zellen, die AUSNAHMSWEISE als passierbar gelten. Normalfall:
   * Ein Automat ist ein massiver Kasten, seine Zelle ist in JEDEM Modell
   * dicht (anders als Glas/Anker, die nur konservativ gesperrt werden) –
   * sonst stempelte der Editor ein Level grün, dessen einziger Weg durch das
   * Möbel führt. Die Ausnahme braucht nur der 'jukebox'-Check selbst, um zu
   * sagen, WELCHER Automat im Weg steht.
   */
  openJukeboxCells?: Set<string>;
}

export interface StartPos {
  floor: number;
  cell: readonly [number, number];
}

const OPPOSITE = { n: 's', s: 'n', e: 'w', w: 'e' } as const;

export function buildFloorCells(floor: FloorDef, cfg: CellConfig, mirror?: LevelDef['mirror']): Cell[] {
  const [cols, rows] = floor.size;
  let cells = generateMaze(cols, rows, mulberry32(floor.maze.seed));
  // Wie der Loader: Rauschen spiegeln, Def-Koordinaten sind schon gespiegelt.
  if (mirror) cells = mirrorCells(cells, cols, rows, mirror);
  for (const [[x, y], dir] of floor.maze.carve) setWall(cells, cols, rows, x, y, dir, false);
  for (const [[x, y], dir] of floor.maze.add) setWall(cells, cols, rows, x, y, dir, true);
  if (cfg.brittleOpen) {
    for (const [[x, y], dir] of floor.maze.brittle) setWall(cells, cols, rows, x, y, dir, false);
  }
  if (!cfg.doorsOpen) {
    for (const el of floor.elements) {
      if (el.type === 'door' && !cfg.openDoorIds?.has(el.id))
        setWall(cells, cols, rows, el.edge[0][0], el.edge[0][1], el.edge[1], true);
    }
  }
  return cells;
}

export const cellKey = (fl: number, c: readonly [number, number]) => `${fl}:${c[0]},${c[1]}`;

/** Zellen, die jede Wächter-Patrouille dieser Ebene überstreicht (in der
 *  Reihenfolge des Ablaufens). */
function patrolLines(floor: FloorDef): Array<Array<[number, number]>> {
  const lines: Array<Array<[number, number]>> = [];
  for (const el of floor.elements) {
    if (el.type !== 'guard') continue;
    const line: Array<[number, number]> = [];
    for (let i = 1; i < el.patrol.length; i++) {
      const [ax, ay] = el.patrol[i - 1]!;
      const [bx, by] = el.patrol[i]!;
      const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
      for (let s = 0; s <= steps; s++) {
        const cell: [number, number] = [ax + Math.sign(bx - ax) * s, ay + Math.sign(by - ay) * s];
        if (!line.some((c) => c[0] === cell[0] && c[1] === cell[1])) line.push(cell);
      }
    }
    if (line.length) lines.push(line);
  }
  return lines;
}

const NEIGHBORS = [
  ['n', 0, -1],
  ['e', 1, 0],
  ['s', 0, 1],
  ['w', -1, 0],
] as const;

/**
 * Wächter-Modell für reachable(guardSafe): Patrouillenzellen werden gesperrt
 * und stattdessen durch GERICHTETE Kanten zwischen ihren Zugängen ersetzt –
 * eine Kante existiert, wenn beim Queren dieses Abschnitts mindestens eine
 * Patrouillenzelle frei bleibt (dort steht der Wächter, während man huscht).
 * Zusätzlich darf man eine Patrouillenzelle selbst betreten (Schlüssel!),
 * solange die Patrouille mehr als diese eine Zelle umfasst.
 */
function guardEdges(
  floor: FloorDef,
  cells: Cell[],
): { blocked: number[]; edges: Array<{ from: readonly [number, number]; to: readonly [number, number] }> } {
  const [cols, rows] = floor.size;
  const blocked: number[] = [];
  const edges: Array<{ from: readonly [number, number]; to: readonly [number, number] }> = [];
  for (const line of patrolLines(floor)) {
    for (const [x, y] of line) blocked.push(y * cols + x);
    // Zugänge: offene Nachbarzellen außerhalb dieser Patrouille
    const access: Array<{ at: number; cell: [number, number] }> = [];
    line.forEach(([x, y], at) => {
      const c = cells[y * cols + x]!;
      for (const [dir, dx, dy] of NEIGHBORS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || c[dir]) continue;
        if (line.some((p) => p[0] === nx && p[1] === ny)) continue;
        access.push({ at, cell: [nx, ny] });
      }
    });
    for (const a of access) {
      // Die Patrouillenzelle selbst betreten (und wieder verlassen).
      if (line.length > 1) edges.push({ from: a.cell, to: line[a.at]! });
      for (const b of access) {
        const span = Math.abs(b.at - a.at) + 1;
        if (span < line.length) edges.push({ from: a.cell, to: b.cell });
      }
    }
  }
  return { blocked, edges };
}

export function reachable(def: LevelDef, cfg: CellConfig, from?: StartPos): Set<string> {
  const floors = def.floors.map((f, fi) => {
    const cells = buildFloorCells(f, cfg, def.mirror);
    const guards = cfg.guardSafe ? guardEdges(f, cells) : null;
    return {
    cells,
    cols: f.size[0],
    rows: f.size[1],
    jumps: [
      ...f.elements
        .filter((e) => e.type === 'transporter')
        .map((t) => ({ from: t.cell as readonly [number, number], toFloor: t.target.floor, toCell: t.target.cell as readonly [number, number] })),
      ...(guards?.edges ?? []).map((e) => ({ from: e.from, toFloor: fi, toCell: e.to, guardEdge: true })),
    ],
    // Strömungszelle -> Fließrichtung (konservativ: nur diese Kante hinaus)
    currents: new Map(
      f.elements.filter((e) => e.type === 'current').map((c) => [c.cell[1] * f.size[0] + c.cell[0], c.dir]),
    ),
    blocked: new Set([
      ...(cfg.glassBlocked
        ? f.elements.filter((e) => e.type === 'glass').map((e) => e.cell[1] * f.size[0] + e.cell[0])
        : []),
      ...(cfg.anchorsBlocked
        ? f.elements.filter((e) => e.type === 'anchor').map((e) => e.cell[1] * f.size[0] + e.cell[0])
        : []),
      // Jukebox: massiver Kasten, immer dicht (siehe CellConfig).
      ...f.elements
        .filter((e): e is JukeboxDef => e.type === 'jukebox')
        .filter((e) => !cfg.openJukeboxCells?.has(cellKey(fi, e.cell)))
        .map((e) => e.cell[1] * f.size[0] + e.cell[0]),
    ]),
    // Wächterzellen: für normale Schritte gesperrt, über die Wächter-Kanten
    // unten aber betretbar (Schlüssel dürfen auf einer Patrouille liegen).
    patrolBlocked: new Set(guards?.blocked ?? []),
    };
  });
  const key = (fl: number, x: number, y: number) => `${fl}:${x},${y}`;
  const start = from ?? { floor: 0, cell: def.floors[0]!.start };
  const seen = new Set<string>([key(start.floor, start.cell[0], start.cell[1])]);
  const stack: Array<[number, number, number]> = [[start.floor, start.cell[0], start.cell[1]]];
  while (stack.length) {
    const [fl, x, y] = stack.pop()!;
    const floor = floors[fl]!;
    const c = floor.cells[y * floor.cols + x]!;
    const push = (nfl: number, nx: number, ny: number, dir?: 'n' | 'e' | 's' | 'w', viaGuardEdge = false) => {
      const target = floors[nfl]!;
      if (target.blocked.has(ny * target.cols + nx)) return;
      if (!viaGuardEdge && target.patrolBlocked.has(ny * target.cols + nx)) return;
      // Gegen den Strom betritt man eine Strömungszelle nicht.
      if (dir) {
        const targetCurrent = floors[nfl]!.currents.get(ny * floors[nfl]!.cols + nx);
        if (targetCurrent && dir === OPPOSITE[targetCurrent]) return;
      }
      const k = key(nfl, nx, ny);
      if (!seen.has(k)) {
        seen.add(k);
        stack.push([nfl, nx, ny]);
      }
    };
    const flow = floor.currents.get(y * floor.cols + x);
    if (flow) {
      // Aus der Strömung nur in Fließrichtung (konservativ: keine Seitenwege,
      // keine Transporter – der Sog reißt den Ball mit).
      if (flow === 'n' && !c.n && y > 0) push(fl, x, y - 1, 'n');
      if (flow === 'e' && !c.e && x < floor.cols - 1) push(fl, x + 1, y, 'e');
      if (flow === 's' && !c.s && y < floor.rows - 1) push(fl, x, y + 1, 's');
      if (flow === 'w' && !c.w && x > 0) push(fl, x - 1, y, 'w');
      continue;
    }
    if (!c.n && y > 0) push(fl, x, y - 1, 'n');
    if (!c.e && x < floor.cols - 1) push(fl, x + 1, y, 'e');
    if (!c.s && y < floor.rows - 1) push(fl, x, y + 1, 's');
    if (!c.w && x > 0) push(fl, x - 1, y, 'w');
    for (const j of floor.jumps) {
      if (j.from[0] === x && j.from[1] === y)
        push(j.toFloor, j.toCell[0], j.toCell[1], undefined, 'guardEdge' in j);
    }
  }
  return seen;
}

/**
 * Wächter-Beweis: Wo kommt man hin, OHNE an einem Wächter vorbeidrängen zu
 * müssen? In einem Ein-Zellen-Korridor passt man nicht an einem Wächter
 * vorbei (Kollision ab 48 Einheiten, seitlich sind höchstens 23 möglich) –
 * und überholen kann man ihn dort nie. Also gilt: Für jeden Wächter muss
 * EINE Zelle seiner Patrouille übrig bleiben, die der Weg nicht braucht;
 * dort hält er sich auf, während man vorbeikommt (er läuft ja, und der Ball
 * ist rund zehnmal schneller). Gibt es eine solche Zelle nicht, versiegelt
 * der Wächter den Korridor dauerhaft.
 *
 * Rückgabe: alle Zellen, die unter mindestens EINER solchen Aufteilung
 * erreichbar sind (mehrere Fahrten sind erlaubt – der Wächter wandert).
 */
export function guardSafeReachable(def: LevelDef): Set<string> {
  return reachable(def, { brittleOpen: true, doorsOpen: true, guardSafe: true });
}

/**
 * Öffner-Fixpunkt: Eine Tür gilt als offen, sobald einer ihrer Öffner
 * (Platte, Schlüssel oder Zeitschloss-Schalter) erreichbar ist – gebannte
 * Türen öffnen nie. Optional von einer beliebigen Position aus (Softlock-
 * Beweise: der Schalter ist wieder-erreichbar, die Tür also wieder-öffenbar).
 */
export function coopReachable(def: LevelDef, bannedDoors: Set<string> = new Set(), from?: StartPos): Set<string> {
  const openDoorIds = new Set<string>();
  // Türen mit require 'all' öffnen erst, wenn ALLE Öffner erreichbar sind
  // (core/doors.ts: alle gleichzeitig erfüllt). Reihenfolge und Timing
  // prüft das Modell nicht – es fragt nur nach Erreichbarkeit.
  const requireAll = new Set<string>();
  const openersOf = new Map<string, Array<{ fl: number; cell: readonly [number, number] }>>();
  def.floors.forEach((floor, fl) => {
    for (const el of floor.elements) {
      if (el.type === 'door' && el.require === 'all') requireAll.add(el.id);
      if (el.type === 'plate' || el.type === 'key' || el.type === 'timedSwitch') {
        const list = openersOf.get(el.opens) ?? [];
        list.push({ fl, cell: el.cell });
        openersOf.set(el.opens, list);
      }
    }
  });
  for (;;) {
    const seen = reachable(def, { brittleOpen: true, doorsOpen: false, openDoorIds }, from);
    let changed = false;
    for (const [doorId, openers] of openersOf) {
      if (bannedDoors.has(doorId) || openDoorIds.has(doorId)) continue;
      const reached = openers.filter((o) => seen.has(cellKey(o.fl, o.cell))).length;
      const opens = requireAll.has(doorId) ? reached === openers.length : reached > 0;
      if (opens) {
        openDoorIds.add(doorId);
        changed = true;
      }
    }
    if (!changed) return seen;
  }
}

// BFS-Distanzen in Zellen auf EINER Ebene im offenen, gerichteten Modell
// (Türen offen, Strömungen nur in Fließrichtung) – für den Zeitschloss-Beweis.
export function directedDistances(
  def: LevelDef,
  floor: FloorDef,
  from: readonly [number, number],
): Map<string, number> {
  const [cols, rows] = floor.size;
  const cells = buildFloorCells(floor, { brittleOpen: true, doorsOpen: true }, def.mirror);
  const currents = new Map(
    floor.elements.filter((e) => e.type === 'current').map((c) => [c.cell[1] * cols + c.cell[0], c.dir]),
  );
  // Ein Automat steht auch dem Zeitschloss-Weg im Weg.
  const solid = new Set(
    floor.elements.filter((e) => e.type === 'jukebox').map((e) => `${e.cell[0]},${e.cell[1]}`),
  );
  const dist = new Map<string, number>([[`${from[0]},${from[1]}`, 0]]);
  const queue: Array<[number, number]> = [[from[0], from[1]]];
  while (queue.length) {
    const [x, y] = queue.shift()!;
    const d = dist.get(`${x},${y}`)!;
    const c = cells[y * cols + x]!;
    const flow = currents.get(y * cols + x);
    const tryMove = (dir: 'n' | 'e' | 's' | 'w', nx: number, ny: number, open: boolean) => {
      if (!open || nx < 0 || ny < 0 || nx >= cols || ny >= rows) return;
      if (flow && dir !== flow) return; // aus der Strömung nur in Fließrichtung
      const target = currents.get(ny * cols + nx);
      if (target && dir === OPPOSITE[target]) return; // nie gegen den Strom hinein
      const k = `${nx},${ny}`;
      if (solid.has(k)) return;
      if (!dist.has(k)) {
        dist.set(k, d + 1);
        queue.push([nx, ny]);
      }
    };
    tryMove('n', x, y - 1, !c.n);
    tryMove('e', x + 1, y, !c.e);
    tryMove('s', x, y + 1, !c.s);
    tryMove('w', x - 1, y, !c.w);
  }
  return dist;
}

/**
 * Wächter sind keine Riegel: Ziel, Öffner und Transporter müssen auch dann
 * erreichbar bleiben, wenn man an keinem Wächter vorbeidrängt. Fängt die
 * Klasse „Wächter versiegelt den einzigen Ein-Zellen-Korridor", die im
 * offenen Modell unsichtbar ist.
 *
 * Eigene Funktion, weil auch der GENERATOR sie braucht: Die Tages-Challenge
 * setzt Wächter zufällig und muss danach prüfen, ob sie einen Gang versiegelt
 * haben (siehe src/levels/daily.ts). Ein Beweis, zwei Aufrufer.
 */
export function guardsProof(def: LevelDef): { ok: boolean; detail?: string } {
  const goalFl = def.floors.findIndex((f) => f.goal);
  if (goalFl < 0) return { ok: false, detail: 'kein Ziel' };
  const goalKey = cellKey(goalFl, def.floors[goalFl]!.goal!);
  const past = guardSafeReachable(def);
  let ok = past.has(goalKey);
  let detail = ok ? undefined : 'Ziel';
  def.floors.forEach((floor, fl) => {
    for (const el of floor.elements) {
      if (
        (el.type === 'key' || el.type === 'plate' || el.type === 'timedSwitch' || el.type === 'transporter') &&
        !past.has(cellKey(fl, el.cell))
      ) {
        ok = false;
        detail = `${el.type} E${fl + 1} (${el.cell})`;
      }
    }
  });
  return { ok, detail };
}

/* --- Level-Prüfbericht (Editor-Badges; die Testsuite nutzt die Bausteine
       oben direkt für schärfere, gezielte Assertions) ---------------------- */

export type CheckKey =
  | 'load'
  | 'links'
  | 'goal'
  | 'openers'
  | 'timer'
  | 'softlock'
  | 'guards'
  | 'jukebox'
  | 'boulder'
  | 'items';

export interface CheckResult {
  key: CheckKey;
  ok: boolean;
  /** technisches Detail (Zelle, Fehlermeldung) – die UI übersetzt den key */
  detail?: string;
}

const MAX_SPEED = 900; // World.maxSpeed; Zelle = 100 px
const NEIGHBOR = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] } as const;
/** Warp-Pause eines Transporters (app.ts startWarp: 700 ms) – kostet Timer-Zeit. */
const WARP_S = 0.7;

/** Zellen-Schritte vom Zeitschalter zur Tür (Ideallinie im offenen,
 *  gerichteten Modell): auf derselben Ebene direkt, sonst über GENAU EINEN
 *  Transporter auf die Ebene der Tür – der Maschinenraum (M44): Schalter
 *  unten, Tür oben, der Sprint führt durch den Schacht. Infinity = kein Weg. */
export function switchDoorSteps(
  def: LevelDef,
  swFl: number,
  sw: readonly [number, number],
  door: DoorDef,
  doorFl: number,
): { steps: number; hops: number } {
  const toDoor = (floor: FloorDef, from: readonly [number, number]): number => {
    const dist = directedDistances(def, floor, from);
    const [[dx, dy], ddir] = door.edge;
    const [ox, oy] = NEIGHBOR[ddir];
    return Math.min(dist.get(`${dx},${dy}`) ?? Infinity, dist.get(`${dx + ox},${dy + oy}`) ?? Infinity);
  };
  const swFloor = def.floors[swFl]!;
  if (swFl === doorFl) return { steps: toDoor(swFloor, sw), hops: 0 };
  const distSw = directedDistances(def, swFloor, sw);
  let best = Infinity;
  for (const el of swFloor.elements) {
    if (el.type !== 'transporter' || el.target.floor !== doorFl) continue;
    const d1 = distSw.get(`${el.cell[0]},${el.cell[1]}`) ?? Infinity;
    if (d1 === Infinity) continue;
    best = Math.min(best, d1 + toDoor(def.floors[doorFl]!, el.target.cell));
  }
  return { steps: best, hops: 1 };
}

/** Mindestzeit für `steps` Zellen plus den Schritt durch die Tür, mit dem
 *  2,5×-Sicherheitsfaktor auf die Ideallinie und der Warp-Pause je Sprung. */
export function timerSeconds(steps: number, hops: number): number {
  return (((steps + 1) * 100) / MAX_SPEED) * 2.5 + hops * WARP_S;
}

/**
 * Kompletter Prüfbericht eines (rohen) Levels. 'load' false ⇒ die übrigen
 * Checks entfallen. Pflicht-Badges fürs Teilen: alle außer 'items'
 * (optionale Sammelziele dürfen bewusst hinter Glas liegen – im Editor
 * wird 'items' trotzdem angezeigt).
 */
export function validateLevel(raw: unknown): CheckResult[] {
  let def: LevelDef;
  try {
    def = parseLevel(raw);
    loadLevel(def);
  } catch (e) {
    return [{ key: 'load', ok: false, detail: e instanceof Error ? e.message : String(e) }];
  }
  const checks: CheckResult[] = [{ key: 'load', ok: true }];
  const push = (key: CheckKey, ok: boolean, detail?: string) => checks.push({ key, ok, detail });

  // Verknüpfungen vollständig: Jeder Öffner zeigt auf eine existierende Tür
  // (ebenenübergreifend), jede Tür hat mindestens einen Öffner. Der Loader
  // lässt hängende Verknüpfungen bewusst durch (Editor-Zwischenzustand) –
  // DIESER Check ist die Pflicht-Schranke fürs Teilen.
  const doorIds = new Set<string>();
  const opensUsed = new Set<string>();
  let linksOk = true;
  let linksDetail: string | undefined;
  for (const floor of def.floors) {
    for (const el of floor.elements) if (el.type === 'door') doorIds.add(el.id);
  }
  for (const floor of def.floors) {
    for (const el of floor.elements) {
      if (el.type !== 'key' && el.type !== 'plate' && el.type !== 'timedSwitch') continue;
      opensUsed.add(el.opens);
      if (!doorIds.has(el.opens)) {
        linksOk = false;
        linksDetail = `${el.type} → Tür „${el.opens}" fehlt`;
      }
    }
  }
  for (const id of doorIds) {
    if (!opensUsed.has(id)) {
      linksOk = false;
      linksDetail = `Tür „${id}" ohne Öffner`;
    }
  }
  push('links', linksOk, linksDetail);

  const goalFl = def.floors.findIndex((f) => f.goal);
  const goalKey = cellKey(goalFl, def.floors[goalFl]!.goal!);

  // Ziel erreichbar (Öffner-Fixpunkt vom Start).
  const fromStart = coopReachable(def);
  push('goal', fromStart.has(goalKey));

  // Öffner VOR ihrer Tür erreichbar – und zwar PRO TÜR, nicht pro Öffner.
  //
  // Die Frage ist „öffnet sich diese Tür überhaupt jemals?", also: Ist
  // mindestens EINER ihrer Öffner erreichbar, wenn GENAU DIESE Tür nie
  // aufgeht? Alle anderen Türen dürfen dabei normal öffnen – sonst meldet der
  // Beweis verkettete Türen falsch rot (Schlüssel 1 → Tür 1 → Schlüssel 2 →
  // Tür 2 ist eine völlig gewöhnliche Progression, und `goal` stempelt sie
  // grün: zwei Checks, die sich widersprachen).
  //
  // Pro TÜR statt pro Öffner, weil zwei Schlüssel dieselbe Tür öffnen dürfen:
  // Liegt einer davon hinter ihr, ist das kein Fehler, solange der andere
  // davor liegt. Nur eine Tür, deren SÄMTLICHE Öffner hinter ihr liegen, ist
  // ein Riegel.
  let openersOk = true;
  let openersDetail: string | undefined;
  // GEPRÜFT werden nur Türen mit Schlüssel/Zeitschloss – genau der Umfang von
  // vorher. ERFÜLLEN darf sie jeder Öffner, Platte eingeschlossen: Eine Tür
  // mit Schlüssel drinnen und Platte draußen geht im Coop auf. Beides
  // zusammen macht diese Änderung zu einer reinen LOCKERUNG – kein Level, das
  // heute grün ist, kann dadurch rot werden.
  type Opener = { fl: number; cell: readonly [number, number]; type: string };
  const openersByDoor = new Map<string, Opener[]>();
  def.floors.forEach((floor, fl) => {
    for (const el of floor.elements) {
      if (el.type !== 'key' && el.type !== 'timedSwitch' && el.type !== 'plate') continue;
      const list = openersByDoor.get(el.opens) ?? [];
      list.push({ fl, cell: el.cell, type: el.type });
      openersByDoor.set(el.opens, list);
    }
  });
  const requireAllDoors = new Set(
    def.floors.flatMap((f) => f.elements.filter((e): e is DoorDef => e.type === 'door' && e.require === 'all').map((d) => d.id)),
  );
  for (const [doorId, openers] of openersByDoor) {
    if (!doorIds.has(doorId)) continue; // hängende Verknüpfung: das sagt `links`
    const keyed = openers.filter((o) => o.type !== 'plate');
    if (!keyed.length) continue; // reine Platten-Tür: Umfang wie vorher, ungeprüft
    const withoutThisDoor = coopReachable(def, new Set([doorId]));
    // 'all': JEDER Öffner muss ohne diese Tür erreichbar sein; 'any': einer.
    const reachableOpeners = openers.filter((o) => withoutThisDoor.has(cellKey(o.fl, o.cell)));
    if (requireAllDoors.has(doorId) ? reachableOpeners.length === openers.length : reachableOpeners.length > 0) continue;
    openersOk = false;
    const o = openers.find((x) => !withoutThisDoor.has(cellKey(x.fl, x.cell))) ?? keyed[0]!;
    openersDetail ??= `${doorId}: ${o.type} E${o.fl + 1} (${o.cell})`;
  }
  push('openers', openersOk, openersDetail);

  // Zeitschloss-Timer reicht (2,5×-Sicherheitsfaktor auf die Ideallinie).
  let timerOk = true;
  let timerDetail: string | undefined;
  def.floors.forEach((floor, swFl) => {
    for (const el of floor.elements) {
      if (el.type !== 'timedSwitch') continue;
      const doors = def.floors.flatMap((f, fl) =>
        f.elements.filter((d): d is DoorDef => d.type === 'door' && d.id === el.opens).map((door) => ({ door, fl })),
      );
      if (!doors.length) {
        timerOk = false;
        timerDetail = `${el.opens}: Tür fehlt`;
        continue;
      }
      for (const { door, fl } of doors) {
        const { steps, hops } = switchDoorSteps(def, swFl, el.cell, door, fl);
        if (steps === Infinity || timerSeconds(steps, hops) > el.durationS) {
          timerOk = false;
          timerDetail = `${el.opens}: ${el.durationS}s`;
        }
      }
    }
  });
  push('timer', timerOk, timerDetail);

  // Kein Softlock: von JEDER erreichbaren Zelle bleibt das Ziel erreichbar.
  let softlockOk = true;
  let softlockDetail: string | undefined;
  for (const k of fromStart) {
    const [fl, xy] = k.split(':');
    const [x, y] = xy!.split(',').map(Number);
    if (!coopReachable(def, new Set(), { floor: Number(fl), cell: [x!, y!] }).has(goalKey)) {
      softlockOk = false;
      softlockDetail = k;
      break;
    }
  }
  push('softlock', softlockOk, softlockDetail);
  // Kein „Glas abseits"-Badge mehr (M39): Glas hält EINE Überfahrt aus und
  // wird dann zum Loch – an dessen Rand kommt man mit Gefühl vorbei. Ein
  // Pflichtweg über Glas ist also Schwierigkeit, kein Riegel. Das Flag
  // `glassBlocked` bleibt (wie `anchorsBlocked`) eine QUALITÄTS-Regel unserer
  // Generatoren (tests/levels.test.ts, tests/daily.test.ts), kein Beweis.

  // Wächter sind keine Riegel (Beweis siehe guardsProof).
  const guards = guardsProof(def);
  push('guards', guards.ok, guards.detail);

  // Beide letzten Checks arbeiten im offenen Modell (Türen offen, brüchige
  // Wände zählen als Durchgang) – EIN BFS für beide.
  const open = reachable(def, { brittleOpen: true, doorsOpen: true });

  // Jukebox: Der Automat ist ein MÖBEL, kein Riegel – und er muss anrempelbar
  // sein, sonst ist er stumme Deko. Vier Klassen von Fehlern, die der
  // 'goal'-Check nicht benennen könnte (er wird zwar auch rot, sagt aber
  // nicht, WARUM):
  //   1. steht auf Start oder Ziel,
  //   2. versiegelt den Pflichtweg (Ziel ohne ihn erreichbar, mit ihm nicht),
  //   3. ist von keiner erreichbaren Zelle aus erreichbar (nicht anrempelbar),
  //   4. liegt auf einer Wächter-Patrouille (der Wächter liefe durch das Möbel),
  //   5. nennt einen Titel, den es nicht gibt.
  const jukes: Array<{ fl: number; el: JukeboxDef }> = [];
  def.floors.forEach((floor, fl) => {
    for (const el of floor.elements) if (el.type === 'jukebox') jukes.push({ fl, el });
  });
  let jbOk = true;
  let jbDetail: string | undefined;
  // Der ERSTE Grund bleibt stehen, nicht der letzte: Ein Automat auf dem Ziel
  // versiegelt zwangsläufig auch den Pflichtweg – dann ist „Ziel" die
  // Ursache und „im Pflichtweg" nur die Folge.
  const jbFail = (detail: string) => {
    jbOk = false;
    jbDetail ??= detail;
  };
  if (jukes.length) {
    const at = (fl: number, el: JukeboxDef) => `E${fl + 1} (${el.cell})`;
    for (const { fl, el } of jukes) {
      const floor = def.floors[fl]!;
      // Start zählt nur auf EBENE 1: Auf tieferen Ebenen ist `start` ein toter
      // Pflichtwert des Formats (die Kugel kommt aus floors[0], loader.ts) –
      // ein Automat dort wäre grundlos rot gemeldet worden.
      if (fl === 0 && floor.start[0] === el.cell[0] && floor.start[1] === el.cell[1]) jbFail(`Start ${at(fl, el)}`);
      if (floor.goal && floor.goal[0] === el.cell[0] && floor.goal[1] === el.cell[1]) jbFail(`Ziel ${at(fl, el)}`);
      for (const line of patrolLines(floor)) {
        if (line.some((c) => c[0] === el.cell[0] && c[1] === el.cell[1])) jbFail(`Wächter ${at(fl, el)}`);
      }
      for (const entry of el.playlist) {
        if (typeof entry === 'string' && !MUSIC_IDS.includes(entry)) jbFail(`Titel „${entry}" unbekannt`);
      }
      // Anrempelbar: mindestens eine Nachbarzelle ist erreichbar UND die Kante
      // dorthin ist offen (hinter einer Wand rempelt man die Wand, nicht den
      // Automaten).
      const cells = buildFloorCells(floor, { brittleOpen: true, doorsOpen: true }, def.mirror);
      const [cols, rows] = floor.size;
      const c = cells[el.cell[1] * cols + el.cell[0]]!;
      const reachableNeighbour = NEIGHBORS.some(([dir, dx, dy]) => {
        const nx = el.cell[0] + dx;
        const ny = el.cell[1] + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || c[dir]) return false;
        return open.has(cellKey(fl, [nx, ny]));
      });
      if (!reachableNeighbour) jbFail(`unerreichbar ${at(fl, el)}`);
    }
    // Versiegelt einer den Pflichtweg? Erst global prüfen (ein BFS), dann den
    // Schuldigen einzeln suchen – so kostet der Normalfall nichts.
    const allOpen = new Set(jukes.map(({ fl, el }) => cellKey(fl, el.cell)));
    if (!open.has(goalKey) && reachable(def, { brittleOpen: true, doorsOpen: true, openJukeboxCells: allOpen }).has(goalKey)) {
      for (const { fl, el } of jukes) {
        const one = new Set([cellKey(fl, el.cell)]);
        if (reachable(def, { brittleOpen: true, doorsOpen: true, openJukeboxCells: one }).has(goalKey))
          jbFail(`im Pflichtweg ${at(fl, el)}`);
      }
      if (jbOk) jbFail('im Pflichtweg');
    }
  }
  push('jukebox', jbOk, jbDetail);

  // Rollstein (M47): Zustands-Beweis – Ziel mit schiebbaren Steinen
  // erreichbar UND kein erreichbarer Zustand, aus dem es das nicht mehr ist.
  const bp = boulderProof(def);
  push('boulder', bp.goal && bp.softlock, bp.detail);

  // Optionale Sammelziele (Gems/Kristalle) im offenen Modell erreichbar.
  let itemsOk = true;
  let itemsDetail: string | undefined;
  def.floors.forEach((floor, fl) => {
    for (const el of floor.elements) {
      if ((el.type === 'gem' || el.type === 'echoCrystal') && !open.has(cellKey(fl, el.cell))) {
        itemsOk = false;
        itemsDetail = `${el.type} E${fl + 1} (${el.cell})`;
      }
    }
  });
  push('items', itemsOk, itemsDetail);

  return checks;
}

/** Pflicht-Badges fürs Teilen/Speichern-als-fertig: alles außer 'items'. */
export function isShareable(checks: CheckResult[]): boolean {
  return checks.every((c) => c.ok || c.key === 'items');
}
