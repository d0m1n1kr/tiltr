// Wächter-Tango (Original) – d-Moll, punktierte Tango-Figur, Bass auf eins
// und dem Nachschlag. Passt zu den roten Patrouillen: bedrohlich, aber mit
// Haltung.

import type { Tune } from '../audio/chiptune';

export const tune: Tune = {
  id: 'waechter',
  title: 'Wächter-Tango',
  bpm: 108,
  tracks: [
    {
      voice: 'square',
      notes: `
        d5:8 d5 d5:4 a4:8 a4 a4:4
        f5:8 f5 f5:4 e5:8 e5 e5:4
        bb4:8 bb4 bb4:4 a4:8 a4 a4:4
        g4:8 a4 bb4 a4 d5:2
      `,
    },
    { voice: 'triangle', gain: 0.85, notes: 'd3:4 r:8 d3 a2:4 r:8 a2', repeat: 4 },
    { voice: 'noise', gain: 0.4, notes: 'r:4 x r x', repeat: 4 },
  ],
};
