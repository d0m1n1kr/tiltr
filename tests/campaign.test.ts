import { describe, expect, it } from 'vitest';
import { CAMPAIGN_LEVELS, WORLDS } from '../src/levels/campaign';
import { loadLevel } from '../src/levels/loader';
import { setWall, type Cell } from '../src/core/maze';
import type { DoorDef, FloorDef, LevelDef } from '../src/levels/schema';
import { buildFloorCells, cellKey, coopReachable, reachable } from './helpers';

// BFS-Distanzen in Zellen auf EINER Ebene im offenen, gerichteten Modell
// (Türen offen, Strömungen nur in Fließrichtung) – für den Zeitschloss-Beweis.
function directedDistances(def: LevelDef, floor: FloorDef, from: readonly [number, number]): Map<string, number> {
  const [cols, rows] = floor.size;
  const cells: Cell[] = buildFloorCells(floor, { brittleOpen: true, doorsOpen: true }, def.mirror);
  const currents = new Map(
    floor.elements.filter((e) => e.type === 'current').map((c) => [c.cell[1] * cols + c.cell[0], c.dir]),
  );
  const opposite = { n: 's', s: 'n', e: 'w', w: 'e' } as const;
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
      if (target && dir === opposite[target]) return; // nie gegen den Strom hinein
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

describe('Kampagne', () => {
  it('Welt 1 hat 10, Welt 2–4 haben je 6 Level; IDs eindeutig, Intro + Par überall', () => {
    expect(WORLDS[0]!.levels).toHaveLength(10);
    expect(WORLDS[1]!.levels).toHaveLength(6);
    expect(WORLDS[2]!.levels).toHaveLength(6);
    expect(WORLDS[3]!.levels).toHaveLength(6);
    expect(new Set(CAMPAIGN_LEVELS.map((l) => l.id)).size).toBe(28);
    for (const l of CAMPAIGN_LEVELS) {
      expect(l.intro?.length ?? 0, l.id).toBeGreaterThan(20);
      expect(l.parTimeS, l.id).toBeGreaterThan(0);
    }
  });

  it('alle Level laden ohne Fehler (Türen offen, Schlüssel passend, Transporter-Ziele gültig)', () => {
    for (const def of CAMPAIGN_LEVELS) {
      expect(() => loadLevel(def), def.id).not.toThrow();
    }
  });

  it('jeder Schlüssel und jeder Zeitschloss-Schalter ist VOR seiner Tür erreichbar', () => {
    for (const def of CAMPAIGN_LEVELS) {
      const preDoor = reachable(def, { brittleOpen: true, doorsOpen: false });
      def.floors.forEach((floor, fl) => {
        for (const el of floor.elements) {
          if (el.type === 'key' || el.type === 'timedSwitch') {
            expect(preDoor.has(cellKey(fl, el.cell)), `${def.id}: ${el.type} E${fl} ${el.cell}`).toBe(true);
          }
        }
      });
    }
  });

  it('Zeitschloss-Beweis: Strecke Schalter→Tür ist im Timer machbar (2,5× Sicherheitsfaktor)', () => {
    const MAX_SPEED = 900; // World.maxSpeed in px/s, Zelle = 100 px
    const NEIGHBOR = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] } as const;
    for (const def of CAMPAIGN_LEVELS) {
      def.floors.forEach((floor) => {
        for (const el of floor.elements) {
          if (el.type !== 'timedSwitch') continue;
          const doors = floor.elements.filter((d): d is DoorDef => d.type === 'door' && d.id === el.opens);
          expect(doors.length, `${def.id}: Zeitschloss ohne Tür auf derselben Ebene`).toBeGreaterThan(0);
          const dist = directedDistances(def, floor, el.cell);
          for (const door of doors) {
            const [[dx, dy], ddir] = door.edge;
            const [ox, oy] = NEIGHBOR[ddir];
            // Näherer der beiden Zellen an der Türkante + 1 Schritt hindurch.
            const steps = Math.min(
              dist.get(`${dx},${dy}`) ?? Infinity,
              dist.get(`${dx + ox},${dy + oy}`) ?? Infinity,
            );
            expect(steps, `${def.id}: Tür ${door.id} vom Schalter unerreichbar`).toBeLessThan(Infinity);
            const minSeconds = ((steps + 1) * 100) / MAX_SPEED;
            expect(minSeconds * 2.5, `${def.id}: Timer ${el.durationS}s zu knapp für ${steps + 1} Zellen`).toBeLessThanOrEqual(el.durationS);
          }
        }
      });
    }
  });

  it('kein Softlock: von JEDER erreichbaren Zelle bleibt das Ziel erreichbar (Öffner-Fixpunkt, gerichtete Strömungen)', () => {
    // Strömungen sind Einbahnstraßen und Zeitschloss-Türen fallen wieder zu –
    // dieser Beweis läuft den Öffner-Fixpunkt von jeder erreichbaren Zelle:
    // Wo immer der Ball strandet, lässt sich jede nötige Tür wieder öffnen
    // und das Ziel erreichen.
    for (const def of CAMPAIGN_LEVELS) {
      const goalFl = def.floors.findIndex((f) => f.goal);
      const goalKey = cellKey(goalFl, def.floors[goalFl]!.goal!);
      const states = coopReachable(def);
      expect(states.has(goalKey), `${def.id}: Ziel vom Start unerreichbar`).toBe(true);
      for (const k of states) {
        const [fl, xy] = k.split(':');
        const [x, y] = xy!.split(',').map(Number);
        const seen = coopReachable(def, new Set(), { floor: Number(fl), cell: [x!, y!] });
        expect(seen.has(goalKey), `${def.id}: Softlock bei ${k}`).toBe(true);
      }
    }
  });

  it('mit Schlüsseln sind Ziel, Gems, Checkpoints, Patrouillen und Transporter-Ziele erreichbar', () => {
    for (const def of CAMPAIGN_LEVELS) {
      const open = reachable(def, { brittleOpen: true, doorsOpen: true });
      def.floors.forEach((floor, fl) => {
        if (floor.goal) expect(open.has(cellKey(fl, floor.goal)), `${def.id}: Ziel E${fl}`).toBe(true);
        for (const el of floor.elements) {
          if (el.type === 'gem' || el.type === 'checkpoint' || el.type === 'key' || el.type === 'listener') {
            // Horcher: sein Heimatpunkt muss erreichbar sein (er ist
            // patrouillenfrei – mehr Weg-Beweis braucht er nicht).
            expect(open.has(cellKey(fl, el.cell)), `${def.id}: ${el.type} E${fl} ${el.cell}`).toBe(true);
          }
          if (el.type === 'guard') {
            for (const wp of el.patrol) expect(open.has(cellKey(fl, wp)), `${def.id}: guard E${fl} ${wp}`).toBe(true);
          }
          if (el.type === 'transporter') {
            expect(open.has(cellKey(fl, el.cell)), `${def.id}: transporter E${fl} ${el.cell}`).toBe(true);
            expect(
              open.has(cellKey(el.target.floor, el.target.cell)),
              `${def.id}: transporter-Ziel E${el.target.floor} ${el.target.cell}`,
            ).toBe(true);
          }
        }
      });
    }
  });

  it('Multi-Ebenen-Level sind OHNE Transporter unlösbar (Ebenenwechsel ist Pflicht)', () => {
    // Ohne Sprünge bleibt man auf Ebene 0; Türen öffnen sich nur, wenn ihr
    // Schlüssel dort erreichbar ist (Fixpunkt).
    for (const def of CAMPAIGN_LEVELS) {
      if (def.floors.length === 1) continue; // einstöckige Level (auch Multi-Screen) sind hier nicht gemeint
      const floor0 = def.floors[0]!;
      const [cols, rows] = floor0.size;
      const openDoors = new Set<string>();

      const reachFloor0 = (): Set<string> => {
        const cells = buildFloorCells(floor0, { brittleOpen: true, doorsOpen: false }, def.mirror);
        for (const el of floor0.elements) {
          if (el.type === 'door' && openDoors.has(el.id)) {
            setWall(cells, cols, rows, el.edge[0][0], el.edge[0][1], el.edge[1], false);
          }
        }
        const seen = new Set<string>([floor0.start.join(',')]);
        const stack: Array<[number, number]> = [[floor0.start[0], floor0.start[1]]];
        while (stack.length) {
          const [x, y] = stack.pop()!;
          const c = cells[y * cols + x]!;
          const push = (nx: number, ny: number) => {
            const k = `${nx},${ny}`;
            if (!seen.has(k)) {
              seen.add(k);
              stack.push([nx, ny]);
            }
          };
          if (!c.n && y > 0) push(x, y - 1);
          if (!c.e && x < cols - 1) push(x + 1, y);
          if (!c.s && y < rows - 1) push(x, y + 1);
          if (!c.w && x > 0) push(x - 1, y);
        }
        return seen;
      };

      let seen = reachFloor0();
      let changed = true;
      while (changed) {
        changed = false;
        for (const el of floor0.elements) {
          if (el.type === 'key' && !openDoors.has(el.opens) && seen.has(el.cell.join(','))) {
            openDoors.add(el.opens);
            changed = true;
          }
        }
        if (changed) seen = reachFloor0();
      }

      const goalFloorIndex = def.floors.findIndex((f) => f.goal);
      const goal = def.floors[goalFloorIndex]!.goal!;
      const reachableWithoutJumps = goalFloorIndex === 0 && seen.has(goal.join(','));
      expect(reachableWithoutJumps, `${def.id}: Ziel ohne Transporter erreichbar`).toBe(false);
    }
  });

  it('Wächter-Patrouillen verlaufen achsenparallel durch offene Gänge', () => {
    for (const def of CAMPAIGN_LEVELS) {
      def.floors.forEach((floor, fl) => {
        const cells = buildFloorCells(floor, { brittleOpen: false, doorsOpen: false }, def.mirror);
        const cols = floor.size[0];
        for (const el of floor.elements) {
          if (el.type !== 'guard') continue;
          for (let i = 1; i < el.patrol.length; i++) {
            const [ax, ay] = el.patrol[i - 1]!;
            const [bx, by] = el.patrol[i]!;
            expect(ax === bx || ay === by, `${def.id} E${fl}: Patrouille nicht achsenparallel`).toBe(true);
            let [x, y] = [ax, ay];
            while (x !== bx || y !== by) {
              const dx = Math.sign(bx - x),
                dy = Math.sign(by - y);
              const c = cells[y * cols + x]!;
              const open = dx === 1 ? !c.e : dx === -1 ? !c.w : dy === 1 ? !c.s : !c.n;
              expect(open, `${def.id} E${fl}: Patrouille blockiert bei (${x},${y})`).toBe(true);
              x += dx;
              y += dy;
            }
          }
        }
      });
    }
  });
});
