// Lösbarkeits-Beweise – EINE Quelle der Wahrheit für Testsuite UND Editor.
// Das Modell: BFS über (Ebene, Zelle). Transporter sind GERICHTETE Kanten,
// ebenso Strömungen (aus einer Strömungszelle geht es nur in Fließrichtung
// hinaus, niemand betritt sie gegen den Strom). Schiebewände zählen als
// offen (sie öffnen sich zyklisch – Warten genügt). Zeitschloss-Schalter
// sind im Öffner-Fixpunkt Tür-Öffner wie Schlüssel/Platten. Glasboden und
// Sog-Anker können konservativ als gesperrte Zellen modelliert werden
// (hazardsBlocked) – so wird bewiesen, dass sie nie auf einem Pflichtweg
// liegen.

import { generateMaze, mirrorCells, setWall, type Cell } from '../core/maze';
import { mulberry32 } from '../core/rng';
import { loadLevel } from './loader';
import { parseLevel, type DoorDef, type FloorDef, type LevelDef } from './schema';

export interface CellConfig {
  brittleOpen: boolean;
  doorsOpen: boolean;
  /** Nur diese Tür-IDs gelten als offen (wenn doorsOpen false ist). */
  openDoorIds?: Set<string>;
  /** Konservativ: Glasboden- und Sog-Anker-Zellen als gesperrt behandeln. */
  hazardsBlocked?: boolean;
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

export function reachable(def: LevelDef, cfg: CellConfig, from?: StartPos): Set<string> {
  const floors = def.floors.map((f) => ({
    cells: buildFloorCells(f, cfg, def.mirror),
    cols: f.size[0],
    rows: f.size[1],
    jumps: f.elements
      .filter((e) => e.type === 'transporter')
      .map((t) => ({ from: t.cell, toFloor: t.target.floor, toCell: t.target.cell })),
    // Strömungszelle -> Fließrichtung (konservativ: nur diese Kante hinaus)
    currents: new Map(
      f.elements.filter((e) => e.type === 'current').map((c) => [c.cell[1] * f.size[0] + c.cell[0], c.dir]),
    ),
    blocked: new Set(
      cfg.hazardsBlocked
        ? f.elements
            .filter((e) => e.type === 'glass' || e.type === 'anchor')
            .map((e) => e.cell[1] * f.size[0] + e.cell[0])
        : [],
    ),
  }));
  const key = (fl: number, x: number, y: number) => `${fl}:${x},${y}`;
  const start = from ?? { floor: 0, cell: def.floors[0]!.start };
  const seen = new Set<string>([key(start.floor, start.cell[0], start.cell[1])]);
  const stack: Array<[number, number, number]> = [[start.floor, start.cell[0], start.cell[1]]];
  while (stack.length) {
    const [fl, x, y] = stack.pop()!;
    const floor = floors[fl]!;
    const c = floor.cells[y * floor.cols + x]!;
    const push = (nfl: number, nx: number, ny: number, dir?: 'n' | 'e' | 's' | 'w') => {
      if (floors[nfl]!.blocked.has(ny * floors[nfl]!.cols + nx)) return;
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
      if (j.from[0] === x && j.from[1] === y) push(j.toFloor, j.toCell[0], j.toCell[1]);
    }
  }
  return seen;
}

/**
 * Öffner-Fixpunkt: Eine Tür gilt als offen, sobald einer ihrer Öffner
 * (Platte, Schlüssel oder Zeitschloss-Schalter) erreichbar ist – gebannte
 * Türen öffnen nie. Optional von einer beliebigen Position aus (Softlock-
 * Beweise: der Schalter ist wieder-erreichbar, die Tür also wieder-öffenbar).
 */
export function coopReachable(def: LevelDef, bannedDoors: Set<string> = new Set(), from?: StartPos): Set<string> {
  const openDoorIds = new Set<string>();
  for (;;) {
    const seen = reachable(def, { brittleOpen: true, doorsOpen: false, openDoorIds }, from);
    let changed = false;
    def.floors.forEach((floor, fl) => {
      for (const el of floor.elements) {
        if ((el.type === 'plate' || el.type === 'key' || el.type === 'timedSwitch') && !bannedDoors.has(el.opens)) {
          if (!openDoorIds.has(el.opens) && seen.has(cellKey(fl, el.cell))) {
            openDoorIds.add(el.opens);
            changed = true;
          }
        }
      }
    });
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

/* --- Level-Prüfbericht (Editor-Badges; die Testsuite nutzt die Bausteine
       oben direkt für schärfere, gezielte Assertions) ---------------------- */

export type CheckKey = 'load' | 'links' | 'goal' | 'openers' | 'timer' | 'softlock' | 'hazards' | 'items';

export interface CheckResult {
  key: CheckKey;
  ok: boolean;
  /** technisches Detail (Zelle, Fehlermeldung) – die UI übersetzt den key */
  detail?: string;
}

const MAX_SPEED = 900; // World.maxSpeed; Zelle = 100 px
const NEIGHBOR = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] } as const;

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

  // Schlüssel/Schalter VOR ihrer Tür erreichbar.
  const preDoor = reachable(def, { brittleOpen: true, doorsOpen: false });
  let openersOk = true;
  let openersDetail: string | undefined;
  def.floors.forEach((floor, fl) => {
    for (const el of floor.elements) {
      if ((el.type === 'key' || el.type === 'timedSwitch') && !preDoor.has(cellKey(fl, el.cell))) {
        openersOk = false;
        openersDetail = `${el.type} E${fl + 1} (${el.cell})`;
      }
    }
  });
  push('openers', openersOk, openersDetail);

  // Zeitschloss-Timer reicht (2,5×-Sicherheitsfaktor auf die Ideallinie).
  let timerOk = true;
  let timerDetail: string | undefined;
  def.floors.forEach((floor) => {
    for (const el of floor.elements) {
      if (el.type !== 'timedSwitch') continue;
      const doors = floor.elements.filter((d): d is DoorDef => d.type === 'door' && d.id === el.opens);
      if (!doors.length) {
        timerOk = false;
        timerDetail = `${el.opens}: Tür fehlt auf der Ebene`;
        continue;
      }
      const dist = directedDistances(def, floor, el.cell);
      for (const door of doors) {
        const [[dx, dy], ddir] = door.edge;
        const [ox, oy] = NEIGHBOR[ddir];
        const steps = Math.min(dist.get(`${dx},${dy}`) ?? Infinity, dist.get(`${dx + ox},${dy + oy}`) ?? Infinity);
        if (steps === Infinity || (((steps + 1) * 100) / MAX_SPEED) * 2.5 > el.durationS) {
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

  // Anker/Glas abseits des Pflichtwegs: Ziel + Checkpoints bleiben mit
  // gesperrten Gefahren-Zellen erreichbar (brüchige Wände sind brechbar
  // und zählen als offen – w1-07 & Co. führen bewusst hindurch).
  const safe = reachable(def, { brittleOpen: true, doorsOpen: true, hazardsBlocked: true });
  let hazardsOk = safe.has(goalKey);
  let hazardsDetail = hazardsOk ? undefined : 'Ziel';
  def.floors.forEach((floor, fl) => {
    for (const el of floor.elements) {
      if ((el.type === 'checkpoint' || el.type === 'transporter') && !safe.has(cellKey(fl, el.cell))) {
        hazardsOk = false;
        hazardsDetail = `${el.type} E${fl + 1} (${el.cell})`;
      }
    }
  });
  push('hazards', hazardsOk, hazardsDetail);

  // Optionale Sammelziele (Gems/Kristalle) im offenen Modell erreichbar.
  const open = reachable(def, { brittleOpen: true, doorsOpen: true });
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
