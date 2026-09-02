import { describe, expect, it } from 'vitest';
import { loadLevel } from '../src/levels/loader';
import { parseLevel } from '../src/levels/schema';
import { World } from '../src/core/physics';

// Schläfer (M45): Wächter-Variante. Schläft auf Wegpunkt 0, ein Ping in
// Weckradius weckt ihn für awakeS Sekunden Patrouille, dann heim und schlafen.
const level = (sleeper: boolean) =>
  parseLevel({
    id: 'sleeper',
    name: 'Schläfer',
    pingBudget: 3,
    floors: [
      {
        size: [6, 2],
        maze: { seed: 1, carve: [[[0, 0], 'e'], [[1, 0], 'e'], [[2, 0], 'e'], [[3, 0], 'e'], [[4, 0], 'e'], [[0, 0], 's']] },
        elements: [
          sleeper
            ? { type: 'guard', patrol: [[2, 0], [5, 0]], speed: 100, sleeper: { wakeRadius: 150, awakeS: 2 } }
            : { type: 'guard', patrol: [[2, 0], [5, 0]], speed: 100 },
        ],
        start: [0, 0],
        goal: [0, 1],
      },
    ],
  });

describe('Schläfer', () => {
  it('ein gewöhnlicher Wächter patrouilliert sofort', () => {
    const { world } = loadLevel(level(false));
    const g = world.guards[0]!;
    const x0 = g.x;
    world.advanceGuards(0.5);
    expect(g.x).not.toBe(x0);
    expect(World.asleep(g)).toBe(false);
  });

  it('der Schläfer steht schlafend auf Wegpunkt 0 – bis ein Ping in Weckweite ihn weckt', () => {
    const { world } = loadLevel(level(true));
    const g = world.guards[0]!;
    expect(World.asleep(g)).toBe(true);
    world.advanceGuards(1);
    expect(g.x).toBe(250); // Wegpunkt 0 = Zelle (2,0)
    // Ping weit weg: bleibt schlafen.
    expect(world.wakeSleepers(550, 50)).toEqual([]);
    expect(World.asleep(g)).toBe(true);
    // Ping in der Nähe: geweckt (einmal gemeldet), patrouilliert.
    const woken = world.wakeSleepers(150, 50);
    expect(woken).toHaveLength(1);
    expect(World.asleep(g)).toBe(false);
    world.advanceGuards(0.5);
    expect(g.x).toBeGreaterThan(250);
    // Ein zweiter Ping während der Wachphase verlängert nur – meldet nichts Neues.
    expect(world.wakeSleepers(150, 50)).toEqual([]);
  });

  it('nach awakeS Sekunden schläft er wieder ein und kehrt heim', () => {
    const { world } = loadLevel(level(true));
    const g = world.guards[0]!;
    world.wakeSleepers(150, 50);
    for (let i = 0; i < 40; i++) world.advanceGuards(0.05); // 2 s wach
    expect(World.asleep(g)).toBe(true);
    for (let i = 0; i < 200; i++) world.advanceGuards(0.05); // Heimweg
    expect(g.x).toBeCloseTo(250, 3);
    expect(g.y).toBeCloseTo(50, 3);
  });
});
