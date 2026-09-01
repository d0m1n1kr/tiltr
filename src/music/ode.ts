// Beethoven, „Ode an die Freude" (9. Sinfonie, 1824) – gemeinfrei.
// 8-Bit-Fassung: Melodie als Puls-Stimme, Bass in Halben auf den Stufen.

import type { Tune } from '../audio/chiptune';

export const tune: Tune = {
  id: 'ode',
  title: 'Ode an die Freude',
  bpm: 132,
  tracks: [
    {
      voice: 'square',
      notes: `
        e4 e4 f4 g4  g4 f4 e4 d4  c4 c4 d4 e4  e4:4. d4:8 d4:2
        e4:4 e4 f4 g4  g4 f4 e4 d4  c4 c4 d4 e4  d4:4. c4:8 c4:2
      `,
    },
    { voice: 'triangle', gain: 0.8, notes: 'c3:2 c3 g2 c3 c3 g2 c3 g2', repeat: 2 },
    { voice: 'noise', gain: 0.3, notes: 'x:4 r r r', repeat: 8 },
  ],
};
