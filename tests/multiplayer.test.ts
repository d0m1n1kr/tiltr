import { describe, expect, it } from 'vitest';
import { COOP_LEVELS, RACE_LEVELS } from '../src/levels/multiplayer';
import { loadLevel } from '../src/levels/loader';
import { Ball, World } from '../src/core/physics';
import { cellKey, coopReachable, expectAllReachable, reachable } from './helpers';

describe('Multiplayer-Level', () => {
  it('6 Coop + 6 Race, IDs eindeutig, Intros vorhanden', () => {
    expect(COOP_LEVELS).toHaveLength(6);
    expect(RACE_LEVELS).toHaveLength(6);
    const ids = [...COOP_LEVELS, ...RACE_LEVELS].map((l) => l.id);
    expect(new Set(ids).size).toBe(12);
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

  it('Coop: jede Tür hat eine Platte außen UND eine innen (Selbstbefreiung)', () => {
    for (const def of COOP_LEVELS) {
      const doorIds = def.floors.flatMap((f) => f.elements.filter((e) => e.type === 'door').map((d) => d.id));
      for (const id of doorIds) {
        // Alle anderen Türen offen, nur diese zu:
        const others = new Set(doorIds.filter((d) => d !== id));
        const seen = reachable(def, { brittleOpen: true, doorsOpen: false, openDoorIds: others });
        const plates: Array<{ fl: number; cell: readonly [number, number] }> = [];
        def.floors.forEach((floor, fl) => {
          for (const el of floor.elements) {
            if (el.type === 'plate' && el.opens === id) plates.push({ fl, cell: el.cell });
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
    world.plates.push({ x: 200, y: 50, r: 30, opens: 'g', held: false });
    expect(world.platesUnderBall()).toHaveLength(0);
    world.ball.x = 190;
    expect(world.platesUnderBall()).toHaveLength(1);
  });
});
