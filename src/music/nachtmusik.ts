// Mozart, „Eine kleine Nachtmusik" (KV 525, 1787) – gemeinfrei.
// 8-Bit-Fassung: der aufsteigende Dreiklang des Anfangs, dann die
// absteigende Antwort. Bass in Halben, Schlagwerk auf jedem Viertel.

import type { Tune } from '../audio/chiptune';

export const tune: Tune = {
  id: 'nachtmusik',
  title: 'Kleine Nachtmusik',
  bpm: 132,
  tracks: [
    {
      voice: 'square',
      notes: `
        g4:8 d4 g4 d4 g4 b4 d5:4
        d5:8 a4 d5 a4 d5 f#5 a5:4
        d5:8 d5 d5:16 e5 d5 c5 b4:8 a4 g4:4
        g4:8 b4 d5 b4 g4:2
      `,
    },
    { voice: 'triangle', gain: 0.8, notes: 'g3:2 g3 d3 d3 g3 g3 d3 g3' },
    { voice: 'noise', gain: 0.3, notes: 'x:4 x x x', repeat: 4 },
  ],
};
