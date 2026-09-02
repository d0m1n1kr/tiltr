// M42: Tür-Rätsel und helle Ebenen in den Generatoren (Quick, Daily).
//
// Der Planer (levels/puzzle.ts) setzt EINE Tür auf den Pflichtweg einer Ebene
// und alle Öffner in den Ankunfts-Teil des Baums – deshalb bleiben goal,
// openers, softlock und timer beweisbar grün. Hier: der Planer auf einem
// echten Maze, dann beide Generatoren über viele Seeds/Tage durch den
// kompletten Prüfbericht.

import { describe, expect, it } from 'vitest';
import { generateMaze, solveMaze } from '../src/core/maze';
import { mulberry32 } from '../src/core/rng';
import { bfsWithout, planDoorPuzzle, SWITCH_MAX_STEPS } from '../src/levels/puzzle';
import { generateQuickLevel, PRESETS, type Preset } from '../src/levels/quick';
import { generateDailyLevel } from '../src/levels/daily';
import { validateLevel, coopReachable } from '../src/levels/validate';
import { loadLevel } from '../src/levels/loader';
import { cellKey } from './helpers';

const DATES = Array.from({ length: 21 }, (_, i) => `2026-03-${String(2 + i).padStart(2, '0')}`);
const SEEDS = [1, 7, 42, 99, 555, 1234, 4711, 90210, 31337, 8080, 2, 3];

describe('planDoorPuzzle', () => {
  const cols = 8, rows = 11;
  const cells = generateMaze(cols, rows, mulberry32(77));
  const path = solveMaze(cells, cols, rows, { x: 0, y: 0 }, { x: 7, y: 10 });

  it('Tür sitzt im mittleren Drittel auf einer OFFENEN Kante des Weges', () => {
    const plan = planDoorPuzzle(cells, cols, rows, mulberry32(1), path, new Set(), { keys: 2, switch: true }, 'tor')!;
    expect(plan).not.toBeNull();
    expect(plan.doorIndex).toBeGreaterThanOrEqual(Math.floor(path.length * 0.35));
    expect(plan.doorIndex).toBeLessThanOrEqual(Math.floor(path.length * 0.65));
    const door = plan.elements.find((e) => e.type === 'door')!;
    expect(door.type === 'door' && door.edge[0]).toEqual([path[plan.doorIndex]!.x, path[plan.doorIndex]!.y]);
    // Kante offen: die Zelle hat in dieser Richtung keine Wand
    const a = path[plan.doorIndex]!;
    const dir = door.type === 'door' ? door.edge[1] : 'e';
    expect(cells[a.y * cols + a.x]![dir]).toBe(false);
  });

  it('alle Öffner liegen im Ankunfts-Teil (ohne die Tür erreichbar), Schalter nahe der Tür', () => {
    const plan = planDoorPuzzle(cells, cols, rows, mulberry32(5), path, new Set(), { keys: 2, switch: true }, 'tor')!;
    const a = path[plan.doorIndex]!, b = path[plan.doorIndex + 1]!;
    const before = bfsWithout(cells, cols, rows, path[0]!, { a, b }).dist;
    const toDoor = bfsWithout(cells, cols, rows, a, { a, b }).dist;
    for (const el of plan.elements) {
      if (el.type === 'key' || el.type === 'timedSwitch') {
        expect(before.has(el.cell[1] * cols + el.cell[0]), `${el.type} ${el.cell}`).toBe(true);
        if (el.type === 'timedSwitch') expect(toDoor.get(el.cell[1] * cols + el.cell[0])).toBeLessThanOrEqual(SWITCH_MAX_STEPS);
      }
    }
    // Ausgangs-Teil enthält den Ausgang NICHT im Ankunfts-Teil
    expect(before.has(path.at(-1)!.y * cols + path.at(-1)!.x)).toBe(false);
    // Wege zu den Öffnern sind geschützt und beginnen an der Ankunft
    expect(plan.protectedCells.has(path[0]!.y * cols + path[0]!.x)).toBe(true);
  });

  it("'all' nur bei mehr als einem Öffner; belegte Zellen werden gemieden; kurzer Weg → kein Rätsel", () => {
    const one = planDoorPuzzle(cells, cols, rows, mulberry32(2), path, new Set(), { keys: 1, switch: false }, 'tor')!;
    expect(one.elements.find((e) => e.type === 'door')).toMatchObject({ require: 'any' });
    const two = planDoorPuzzle(cells, cols, rows, mulberry32(2), path, new Set(), { keys: 2, switch: false }, 'tor')!;
    expect(two.elements.find((e) => e.type === 'door')).toMatchObject({ require: 'all' });
    expect(two.elements.filter((e) => e.type === 'key')).toHaveLength(2);
    const forbidden = new Set<number>(two.openerCells.map((c) => c[1] * cols + c[0]));
    const other = planDoorPuzzle(cells, cols, rows, mulberry32(2), path, forbidden, { keys: 2, switch: false }, 'tor')!;
    for (const c of other.openerCells) expect(two.openerCells).not.toContainEqual(c);
    expect(planDoorPuzzle(cells, cols, rows, mulberry32(2), path.slice(0, 4), new Set(), { keys: 2, switch: false }, 'tor')).toBeNull();
    expect(planDoorPuzzle(cells, cols, rows, mulberry32(2), path, new Set(), { keys: 0, switch: false }, 'tor')).toBeNull();
  });
});

describe('Schnelles Spiel (M42): Ebenen, helle Ebenen, Tür-Rätsel', () => {
  it('Presets: leicht 1 Ebene ohne Rätsel, mittel 1 Ebene, schwer 2 Ebenen – Ziel immer auf der letzten', () => {
    for (const seed of SEEDS) {
      for (const preset of ['easy', 'normal', 'hard'] as Preset[]) {
        const def = generateQuickLevel(seed, preset);
        expect(def.floors, `${preset}/${seed}`).toHaveLength(PRESETS[preset].floors);
        def.floors.forEach((f, i) => expect(f.goal !== null, `${preset}/${seed} E${i}`).toBe(i === def.floors.length - 1));
        expect(() => loadLevel(def), `${preset}/${seed}`).not.toThrow();
      }
    }
  });

  it('der komplette Prüfbericht ist grün (goal, openers, timer, softlock, links, guards, jukebox)', () => {
    for (const seed of SEEDS) {
      for (const preset of ['easy', 'normal', 'hard'] as Preset[]) {
        const def = generateQuickLevel(seed, preset);
        for (const c of validateLevel(def)) {
          if (c.key === 'items') continue;
          expect(c.ok, `${preset}/${seed}: ${c.key} (${c.detail ?? ''})`).toBe(true);
        }
      }
    }
  });

  it('schwer: genau eine Tür mit mehreren Öffnern (require all), auf der hellen Ebene, wenn es eine gibt', () => {
    let withBright = 0;
    for (const seed of SEEDS) {
      const def = generateQuickLevel(seed, 'hard');
      const doors = def.floors.flatMap((f, i) => f.elements.filter((e) => e.type === 'door').map(() => i));
      expect(doors, `hard/${seed}`).toHaveLength(1);
      const fl = def.floors[doors[0]!]!;
      const door = fl.elements.find((e) => e.type === 'door')!;
      const openers = fl.elements.filter((e) => e.type === 'key' || e.type === 'timedSwitch');
      expect(openers.length, `hard/${seed}`).toBeGreaterThanOrEqual(2);
      expect(door.type === 'door' && door.require).toBe('all');
      const brightIdx = def.floors.findIndex((f) => f.bright);
      if (brightIdx !== -1) {
        withBright++;
        expect(doors[0], `hard/${seed}: Rätsel auf der hellen Ebene`).toBe(brightIdx);
      }
      expect(def.floors.every((f) => f.bright), `hard/${seed}: nie alle hell`).toBe(false);
    }
    expect(withBright).toBeGreaterThan(0);
  });

  it('leicht ist nie hell und hat keine Tür; mittel ist manchmal hell', () => {
    let brightNormal = 0;
    for (const seed of SEEDS) {
      const easy = generateQuickLevel(seed, 'easy');
      expect(easy.floors[0]!.bright).toBe(false);
      expect(easy.floors[0]!.elements.some((e) => e.type === 'door')).toBe(false);
      if (generateQuickLevel(seed, 'normal').floors[0]!.bright) brightNormal++;
    }
    expect(brightNormal).toBeGreaterThan(0);
    expect(brightNormal).toBeLessThan(SEEDS.length);
  });
});

describe('Tages-Challenge (M42): helle Ebenen und Tür-Rätsel', () => {
  it('der komplette Prüfbericht ist an jedem Tag grün', () => {
    for (const date of DATES) {
      const def = generateDailyLevel(date);
      for (const c of validateLevel(def)) {
        if (c.key === 'items') continue;
        expect(c.ok, `${date}: ${c.key} (${c.detail ?? ''})`).toBe(true);
      }
    }
  });

  it('Montag/Dienstag: dunkel und ohne Tür; Mittwoch–Sonntag: genau eine helle Ebene mit dem Rätsel darauf', () => {
    for (const date of DATES) {
      const def = generateDailyLevel(date);
      const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
      const brightIdx = def.floors.map((f, i) => (f.bright ? i : -1)).filter((i) => i !== -1);
      const doorFloors = def.floors.map((f, i) => (f.elements.some((e) => e.type === 'door') ? i : -1)).filter((i) => i !== -1);
      if (weekday === 1 || weekday === 2) {
        expect(brightIdx, date).toEqual([]);
        expect(doorFloors, date).toEqual([]);
      } else {
        expect(brightIdx, date).toHaveLength(1);
        expect(doorFloors, `${date}: eine Tür`).toHaveLength(1);
        expect(doorFloors[0], `${date}: Rätsel auf der hellen Ebene`).toBe(brightIdx[0]);
        // Das Ziel bleibt ohne die Tür unerreichbar – die Tür ist ein echtes Rätsel
        const doorFloor = def.floors[doorFloors[0]!]!;
        const door = doorFloor.elements.find((e) => e.type === 'door')!;
        const goalFloor = def.floors.length - 1;
        const banned = coopReachable(def, new Set([door.type === 'door' ? door.id : '']));
        expect(banned.has(cellKey(goalFloor, def.floors[goalFloor]!.goal!)), `${date}: Tür ist Pflicht`).toBe(false);
      }
      expect(def.floors.every((f) => f.bright), `${date}: nie alle hell`).toBe(false);
    }
  });

  it('Freitag: Schlüssel UND Zeitschloss mit require all; Sonntag: zwei Schlüssel + Zeitschloss', () => {
    const friday = generateDailyLevel('2026-03-06');
    const fri = friday.floors.find((f) => f.elements.some((e) => e.type === 'door'))!;
    expect(fri.elements.filter((e) => e.type === 'key')).toHaveLength(1);
    expect(fri.elements.filter((e) => e.type === 'timedSwitch')).toHaveLength(1);
    expect(fri.elements.find((e) => e.type === 'door')).toMatchObject({ require: 'all' });
    const sunday = generateDailyLevel('2026-03-08');
    const sun = sunday.floors.find((f) => f.elements.some((e) => e.type === 'door'))!;
    expect(sun.elements.filter((e) => e.type === 'key')).toHaveLength(2);
  });
});
