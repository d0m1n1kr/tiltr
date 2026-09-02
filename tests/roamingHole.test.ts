import { describe, expect, it } from 'vitest';
import { loadLevel } from '../src/levels/loader';
import { parseLevel } from '../src/levels/schema';
import { mirrorLevel } from '../src/levels/mirror';
import { validateLevel } from '../src/levels/validate';

// Wanderloch (M46): offenes Loch auf Patrouille – bewegt sich wie ein Wächter,
// fällt wie ein Loch, ist im Modell passierbar wie ein atmendes Loch.
const level = () =>
  parseLevel({
    id: 'wander',
    name: 'Wanderloch',
    pingBudget: 3,
    floors: [
      {
        size: [5, 2],
        maze: { seed: 1, carve: [[[0, 0], 'e'], [[1, 0], 'e'], [[2, 0], 'e'], [[3, 0], 'e'], [[0, 0], 's']] },
        elements: [{ type: 'roamingHole', patrol: [[2, 0], [4, 0]], speed: 100 }],
        start: [0, 0],
        goal: [0, 1],
      },
    ],
  });

describe('Wanderloch', () => {
  it('läuft seine Strecke im Ping-Pong ab', () => {
    const { world } = loadLevel(level());
    const h = world.holes[0]!;
    expect(h.roam).toBeDefined();
    expect(h.x).toBe(250);
    world.advanceHoles(1); // 100 px nach rechts
    expect(h.x).toBeCloseTo(350, 3);
    world.advanceHoles(1.5); // bis 450, dann 50 zurück
    expect(h.x).toBeCloseTo(400, 3);
    expect(h.roam!.dir).toBe(-1);
  });

  it('ist ein echtes Loch: liegt der Ball darüber, stürzt er', () => {
    const { world } = loadLevel(level());
    const h = world.holes[0]!;
    world.ball.x = h.x;
    world.ball.y = h.y;
    expect(world.fallenHole()).toBe(h);
  });

  it('gespiegelt läuft die Patrouille mit; der Beweis bleibt grün (passierbar wie ein atmendes Loch)', () => {
    const m = mirrorLevel(level(), 'x');
    const el = m.floors[0]!.elements[0]!;
    expect(el.type === 'roamingHole' && el.patrol).toEqual([[2, 0], [0, 0]]);
    expect(validateLevel(level()).every((c) => c.ok)).toBe(true);
  });
});
