// Rossini, Galopp aus der Wilhelm-Tell-Ouvertüre (1829) – gemeinfrei.
// 8-Bit-Fassung: die Galopp-Figur (zwei Achtel, ein Viertel) auf E, dann auf
// H, mit galoppierendem Bass und Schlagwerk. Der Automat rennt.

import type { Tune } from '../audio/chiptune';

export const tune: Tune = {
  id: 'tell',
  title: 'Wilhelm-Tell-Galopp',
  bpm: 152,
  tracks: [
    {
      voice: 'square',
      notes: `
        e4:8 e4 e4:4 e4:8 e4 e4:4 e4:8 e4 e4:4 g4:8 b4 b4:4
        b4:8 b4 b4:4 b4:8 b4 b4:4 b4:8 b4 b4:4 a4:8 g4 f#4:4
        e4:8 e4 e4:4 e4:8 e4 e4:4 g4:8 g4 g4:4 b4:8 b4 b4:4
        e5:4 d5:8 c#5 b4:4 a4 g4:8 f#4 e4:2 r:4
      `,
    },
    { voice: 'triangle', gain: 0.85, notes: 'e2:8 r e2 r', repeat: 16 },
    { voice: 'noise', gain: 0.4, notes: 'x:8 x x:4', repeat: 16 },
  ],
};
