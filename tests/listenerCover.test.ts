import { describe, expect, it } from 'vitest';
import { loadLevel } from '../src/levels/loader';
import { parseLevel } from '../src/levels/schema';

// Horcher-Deckung (M43): Eine Schallschutzwand zwischen Ball und Horcher
// dämpft das Rollen mit ABSORB_GAIN – dieselbe Regel wie für jede andere
// Klangquelle, nur in Gegenrichtung. Hinter der Wand darf man rollen,
// solange man nicht rast.
function level(absorb: boolean) {
  return parseLevel({
    id: absorb ? 'cover-absorb' : 'cover-plain',
    name: 'Deckung',
    pingBudget: 0,
    floors: [
      {
        size: [3, 2],
        maze: {
          seed: 1,
          carve: [
            [[0, 0], 'e'],
            [[1, 0], 'e'],
            [[0, 0], 's'],
          ],
          // Wand zwischen Zelle 1 und 2 der oberen Zeile – zwischen Ball und Horcher.
          add: [[[1, 0], 'e']],
          absorb: absorb ? [[[1, 0], 'e']] : [],
        },
        elements: [{ type: 'listener', cell: [2, 0], speed: 90 }],
        start: [0, 0],
        goal: [0, 1],
      },
    ],
  });
}

function listenerShift(absorb: boolean, speed: number): number {
  const { world } = loadLevel(level(absorb));
  const l = world.listeners[0]!;
  const x0 = l.x;
  world.ball.vx = speed; // rollt nach rechts, auf den Horcher zu
  for (let i = 0; i < 10; i++) world.step(1 / 60, { x: 0, y: 0 });
  return x0 - l.x; // > 0: der Horcher kommt dem Ball entgegen
}

describe('Horcher-Deckung (M43)', () => {
  it('ohne Schallschutz hört der Horcher durch die Wand (wie bisher)', () => {
    expect(listenerShift(false, 100)).toBeGreaterThan(1);
  });
  it('hinter einer Schallschutzwand kommt leises Rollen nicht an', () => {
    expect(listenerShift(true, 100)).toBeCloseTo(0, 3);
  });
  it('… lautes Rollen dringt auch durch die Schallschutzwand', () => {
    expect(listenerShift(true, 300)).toBeGreaterThan(1);
  });
});
