import { describe, expect, it } from 'vitest';
import { COOP_LEVELS, RACE_LEVELS } from '../src/levels/multiplayer';
import { generateMpLevel, parseMpQuickId } from '../src/levels/mpQuick';
import { loadLevel } from '../src/levels/loader';
import { Ball, World } from '../src/core/physics';
import { cellKey, coopReachable, expectAllReachable, reachable } from './helpers';

describe('Multiplayer-Level', () => {
  it('11 Coop + 6 Race, IDs eindeutig, Intros vorhanden', () => {
    expect(COOP_LEVELS).toHaveLength(11);
    expect(RACE_LEVELS).toHaveLength(6);
    const ids = [...COOP_LEVELS, ...RACE_LEVELS].map((l) => l.id);
    expect(new Set(ids).size).toBe(17);
    for (const l of [...COOP_LEVELS, ...RACE_LEVELS]) expect(l.intro?.length ?? 0, l.id).toBeGreaterThan(20);
  });

  it('alle Level laden ohne Fehler', () => {
    for (const def of [...COOP_LEVELS, ...RACE_LEVELS]) {
      expect(() => loadLevel(def), def.id).not.toThrow();
    }
  });

  it('Race: Ziel und alle Elemente erreichbar', () => {
    for (const def of RACE_LEVELS) {
      expectAllReachable(def, (cond, msg) => expect(cond, msg).toBe(true));
    }
  });

  it('Coop: mit Platten-Logik (Fixpunkt) ist alles erreichbar', () => {
    for (const def of COOP_LEVELS) {
      const seen = coopReachable(def);
      def.floors.forEach((floor, fl) => {
        if (floor.goal) expect(seen.has(cellKey(fl, floor.goal)), `${def.id}: Ziel`).toBe(true);
        for (const el of floor.elements) {
          if (el.type === 'plate' || el.type === 'checkpoint') {
            expect(seen.has(cellKey(fl, el.cell)), `${def.id}: ${el.type} E${fl} ${el.cell}`).toBe(true);
          }
        }
      });
    }
  });

  it('Coop: JEDE Tür ist notwendig (ohne sie ist das Ziel unerreichbar)', () => {
    for (const def of COOP_LEVELS) {
      const doorIds = def.floors.flatMap((f) => f.elements.filter((e) => e.type === 'door').map((d) => d.id));
      const goalFloor = def.floors.findIndex((f) => f.goal);
      const goal = def.floors[goalFloor]!.goal!;
      for (const id of doorIds) {
        const seen = coopReachable(def, new Set([id]));
        expect(seen.has(cellKey(goalFloor, goal)), `${def.id}: Tür ${id} ist umgehbar`).toBe(false);
      }
    }
  });

  it('Coop: jede Tür, die wieder zufällt, hat eine Platte außen UND eine innen (Selbstbefreiung)', () => {
    for (const def of COOP_LEVELS) {
      // Türen mit „bleibt offen" (M76) brauchen KEINE Innenplatte: Sie fallen
      // nicht mehr zu, also kann sich niemand aussperren. Die Regel schützt
      // gegen das Zufallen – nicht gegen die Bauform (M91 „Duett": beide
      // Resonanzfelder liegen draußen, weil man drinnen nicht mehr stimmt).
      const doorIds = def.floors.flatMap((f) =>
        f.elements
          .filter((e) => e.type === 'door')
          .filter((d) => d.latch !== true)
          .map((d) => d.id),
      );
      for (const id of doorIds) {
        // Alle anderen Türen offen, nur diese zu:
        const others = new Set(doorIds.filter((d) => d !== id));
        const seen = reachable(def, { brittleOpen: true, doorsOpen: false, openDoorIds: others });
        const plates: Array<{ fl: number; cell: readonly [number, number] }> = [];
        def.floors.forEach((floor, fl) => {
          for (const el of floor.elements) {
            if (el.type === 'plate' && el.opens.includes(id)) plates.push({ fl, cell: el.cell });
          }
        });
        const outside = plates.filter((p) => seen.has(cellKey(p.fl, p.cell)));
        const inside = plates.filter((p) => !seen.has(cellKey(p.fl, p.cell)));
        expect(outside.length, `${def.id}: Tür ${id} ohne Außenplatte`).toBeGreaterThan(0);
        expect(inside.length, `${def.id}: Tür ${id} ohne Innenplatte (Aussperr-Gefahr)`).toBeGreaterThan(0);
      }
    }
  });
});

describe('Zufalls-Multiplayer-Level (mpq)', () => {
  it('deterministisch: gleicher Seed -> identisches Level; ID regeneriert es', () => {
    expect(generateMpLevel(7, 'coop')).toEqual(generateMpLevel(7, 'coop'));
    expect(parseMpQuickId('mpq-race-42')).toEqual(generateMpLevel(42, 'race'));
    expect(parseMpQuickId('coop-01')).toBeNull();
  });

  it('Race: 40 Seeds laden und sind vollständig erreichbar', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const def = generateMpLevel(seed, 'race');
      expect(() => loadLevel(def), def.id).not.toThrow();
      expectAllReachable(def, (cond, msg) => expect(cond, `${def.id}: ${msg}`).toBe(true));
    }
  });

  it('Coop: 40 Seeds – Fixpunkt erreicht Ziel & Platten, Tür notwendig, Platte außen+innen', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const def = generateMpLevel(seed, 'coop');
      expect(() => loadLevel(def), def.id).not.toThrow();
      const floor = def.floors[0]!;
      const goal = floor.goal!;

      const seen = coopReachable(def);
      expect(seen.has(cellKey(0, goal)), `${def.id}: Ziel`).toBe(true);
      for (const el of floor.elements) {
        if (el.type === 'plate' || el.type === 'checkpoint') {
          expect(seen.has(cellKey(0, el.cell)), `${def.id}: ${el.type} ${el.cell}`).toBe(true);
        }
      }

      const banned = coopReachable(def, new Set(['g1']));
      expect(banned.has(cellKey(0, goal)), `${def.id}: Tür g1 ist umgehbar`).toBe(false);

      const preDoor = reachable(def, { brittleOpen: true, doorsOpen: false });
      const plates = floor.elements.filter((e) => e.type === 'plate');
      const outside = plates.filter((p) => preDoor.has(cellKey(0, p.cell)));
      const inside = plates.filter((p) => !preDoor.has(cellKey(0, p.cell)));
      expect(outside.length, `${def.id}: ohne Außenplatte`).toBeGreaterThan(0);
      expect(inside.length, `${def.id}: ohne Innenplatte`).toBeGreaterThan(0);
    }
  });
});

describe('Coop-Physik', () => {
  it('offene Türen sind passierbar, geschlossene nicht', () => {
    const doorWall = { x: 95, y: 0, w: 10, h: 110, door: { id: 'g', open: false } };
    const world = new World([doorWall], new Ball(50, 50, 22), { x: 500, y: 50, r: 30 });
    for (let i = 0; i < 60; i++) world.step(1 / 60, { x: 1, y: 0 });
    expect(world.ball.x).toBeLessThan(95); // blockiert
    doorWall.door.open = true;
    for (let i = 0; i < 120; i++) world.step(1 / 60, { x: 1, y: 0 });
    expect(world.ball.x).toBeGreaterThan(150); // durchgerollt
  });

  it('platesUnderBall erkennt gehaltene Platten', () => {
    const world = new World([], new Ball(50, 50, 22), { x: 500, y: 500, r: 30 });
    world.plates.push({ x: 200, y: 50, r: 30, id: '0:2,0', opens: ['g'], held: false });
    expect(world.platesUnderBall()).toHaveLength(0);
    world.ball.x = 190;
    expect(world.platesUnderBall()).toHaveLength(1);
  });
});
