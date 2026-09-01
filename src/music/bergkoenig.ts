// Grieg, „In der Halle des Bergkönigs" (Peer Gynt, 1875) – gemeinfrei.
// 8-Bit-Fassung: die stapfende Achtelkette in h-Moll, ab Takt 5 eine Stufe
// höher – der Automat zieht an, ohne schneller zu werden. Marschierendes
// Schlagwerk auf jedem zweiten Achtel.

import type { Tune } from '../audio/chiptune';

export const tune: Tune = {
  id: 'bergkoenig',
  title: 'In der Halle des Bergkönigs',
  bpm: 116,
  tracks: [
    {
      voice: 'square',
      notes: `
        b3:8 c#4 d4 e4 f#4 d4 f#4 r
        b3:8 c#4 d4 e4 f#4 d4 f#4 r
        b3:8 c#4 d4 e4 f#4 d4 g4 f#4
        e4:8 c#4 e4 d4 b3 d4 b3 r
        d4:8 e4 f#4 g4 a4 f#4 a4 r
        d4:8 e4 f#4 g4 a4 f#4 a4 r
        d4:8 e4 f#4 g4 a4 f#4 b4 a4
        g4:8 f#4 e4 d4 c#4 b3 a3 r
      `,
    },
    { voice: 'triangle', gain: 0.85, notes: 'b2:1 b2 b2 f#2 d3 d3 d3 a2' },
    { voice: 'noise', gain: 0.45, notes: 'x:8 r x r x r x r', repeat: 8 },
  ],
};
