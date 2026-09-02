import { describe, expect, it } from 'vitest';
import { loadLevel } from '../src/levels/loader';
import { parseLevel } from '../src/levels/schema';
import { validateLevel } from '../src/levels/validate';

// Hallraum (M46): Zone wie Nebel – der Ball meldet, ob er drin ist; die
// Klangänderung (Feedback-Delay) wohnt im Audio-Graph, der Beweis kennt sie nicht.
const level = parseLevel({
  id: 'hall',
  name: 'Hallraum',
  pingBudget: 3,
  floors: [
    {
      size: [3, 2],
      maze: { seed: 1, carve: [[[0, 0], 'e'], [[1, 0], 'e'], [[0, 0], 's']] },
      elements: [{ type: 'reverbZone', cell: [1, 0] }],
      start: [0, 0],
      goal: [0, 1],
    },
  ],
});

describe('Hallraum', () => {
  it('der Loader baut die Zone, der Ball weiß, ob er drin ist', () => {
    const { world } = loadLevel(level);
    expect(world.reverbZones).toHaveLength(1);
    expect(world.inReverb()).toBe(false);
    world.ball.x = 150;
    world.ball.y = 50;
    expect(world.inReverb()).toBe(true);
  });
  it('die Zone ist frei begehbar – alle Badges grün', () => {
    expect(validateLevel(level).every((c) => c.ok)).toBe(true);
  });
});
