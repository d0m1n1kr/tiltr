// Level-Spiegelung: Involution, Konsistenz von Def- und Zell-Spiegelung,
// und die eigentliche Motivation – Starts/Ziele verteilen sich auf die Ecken.

import { describe, expect, it } from 'vitest';
import { generateMaze, mirrorCells } from '../src/core/maze';
import { mulberry32 } from '../src/core/rng';
import { mirrorLevel, type MirrorAxis } from '../src/levels/mirror';
import { parseLevel, type LevelDef } from '../src/levels/schema';
import { CAMPAIGN_LEVELS } from '../src/levels/campaign';
import { COOP_LEVELS, RACE_LEVELS } from '../src/levels/multiplayer';

const sample = (): LevelDef =>
  parseLevel({
    id: 'probe',
    name: 'Probe',
    floors: [
      {
        size: [5, 4],
        maze: { seed: 1, carve: [[[1, 2], 'e']], add: [[[0, 1], 's']], brittle: [[[2, 2], 'n']] },
        elements: [
          { type: 'door', id: 'd', edge: [[3, 1], 'w'] },
          { type: 'key', cell: [4, 0], opens: 'd' },
          { type: 'windZone', cell: [2, 3], dir: 'e' },
          { type: 'guard', patrol: [[0, 3], [3, 3]] },
          { type: 'hole', cell: [1, 1], jitter: [4, -6] },
          { type: 'transporter', cell: [0, 0], target: { floor: 1, cell: [2, 1] } },
        ],
        start: [0, 0],
        goal: null,
      },
      { size: [3, 2], maze: { seed: 2 }, elements: [], start: [0, 0], goal: [2, 1] },
    ],
  });

describe('mirrorLevel', () => {
  it('zweimal dieselbe Achse = Original (Involution, Koordinaten & Richtungen)', () => {
    for (const axis of ['x', 'y', 'xy'] as MirrorAxis[]) {
      const once = mirrorLevel(sample(), axis);
      const twice = mirrorLevel({ ...once, mirror: undefined }, axis);
      expect({ ...twice, mirror: undefined }).toEqual({ ...sample(), mirror: undefined });
    }
  });

  it('spiegelt Start, Ziel, Richtungen und Transporter-Ziele korrekt (x)', () => {
    const m = mirrorLevel(sample(), 'x');
    expect(m.floors[0]!.start).toEqual([4, 0]);
    expect(m.floors[1]!.goal).toEqual([0, 1]);
    const wind = m.floors[0]!.elements.find((e) => e.type === 'windZone')!;
    expect(wind).toMatchObject({ cell: [2, 3], dir: 'w' });
    const door = m.floors[0]!.elements.find((e) => e.type === 'door')!;
    expect(door).toMatchObject({ edge: [[1, 1], 'e'] });
    const tp = m.floors[0]!.elements.find((e) => e.type === 'transporter')!;
    expect(tp).toMatchObject({ cell: [4, 0], target: { floor: 1, cell: [0, 1] } });
    const hole = m.floors[0]!.elements.find((e) => e.type === 'hole')!;
    expect(hole).toMatchObject({ jitter: [-4, -6] });
  });

  it('doppelte Spiegelung eines Levels ist verboten', () => {
    expect(() => mirrorLevel(mirrorLevel(sample(), 'x'), 'x')).toThrow();
  });
});

describe('mirrorCells', () => {
  it('Involution und konsistente Nachbarn', () => {
    const cells = generateMaze(6, 5, mulberry32(42));
    for (const axis of ['x', 'y', 'xy'] as const) {
      expect(mirrorCells(mirrorCells(cells, 6, 5, axis), 6, 5, axis)).toEqual(cells);
    }
    const m = mirrorCells(cells, 6, 5, 'x');
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        expect(m[y * 6 + x]!.e, `(${x},${y})`).toBe(m[y * 6 + x + 1]!.w);
      }
    }
  });
});

describe('Start-Verteilung der handgebauten Level', () => {
  it('Starts liegen nicht mehr (fast) alle oben links', () => {
    const corner = (def: LevelDef): string => {
      const [cols, rows] = def.floors[0]!.size;
      const [x, y] = def.floors[0]!.start;
      return `${x < cols / 2 ? 'L' : 'R'}${y < rows / 2 ? 'O' : 'U'}`;
    };
    const corners = [...CAMPAIGN_LEVELS, ...COOP_LEVELS, ...RACE_LEVELS].map(corner);
    const counts = new Map<string, number>();
    for (const c of corners) counts.set(c, (counts.get(c) ?? 0) + 1);
    expect(counts.size, `Ecken: ${[...counts.entries()].join(' ')}`).toBe(4);
    expect(counts.get('LO')!, 'zu viele Starts oben links').toBeLessThanOrEqual(4);
  });
});
