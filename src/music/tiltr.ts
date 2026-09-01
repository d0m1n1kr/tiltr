// tiltr-Theme (Original) – die Hausmarke des Automaten: hoffnungsvoll,
// absteigende Bassstufen unter einer kreisenden Melodie. Frei komponiert,
// gehört uns, darf überall mit.

import type { Tune } from '../audio/chiptune';

export const tune: Tune = {
  id: 'tiltr',
  title: 'tiltr-Theme',
  bpm: 128,
  tracks: [
    {
      voice: 'square',
      notes: `
        a4:8 c5 e5 c5 d5 c5 a4 r
        g4:8 b4 d5 b4 c5 b4 g4 r
        f4:8 a4 c5 a4 b4 a4 f4 r
        e4:8 g4 b4 d5 c5:4 r:4
      `,
    },
    { voice: 'triangle', gain: 0.8, notes: 'a2:2 a2 g2 g2 f2 f2 e2 e2' },
    { voice: 'noise', gain: 0.5, notes: 'x:8 r r r x r r r', repeat: 4 },
  ],
};
