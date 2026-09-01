// Holst, „Mars, der Kriegsbringer" (Die Planeten, 1914–16) – gemeinfrei.
// 8-Bit-Fassung des Fünfviertel-Ostinatos: EIN Ton, nur Rhythmus – und ab
// Takt 5 chromatisch steigende Akkordstöße darüber. Der Ur-Vorfahre jeder
// Bedrohungsmusik in Spielen; genau der Klang, den man meint, wenn man an
// Weltraum-Fanfaren denkt.

import type { Tune } from '../audio/chiptune';

export const tune: Tune = {
  id: 'mars',
  title: 'Mars',
  bpm: 76,
  tracks: [
    {
      voice: 'square',
      gain: 0.9,
      notes: `
        r:1 r:4 r:1 r:4 r:1 r:4 r:1 r:4
        g4:2 c5:2 db5:4
        ab4:2 db5:2 d5:4
        a4:2 d5:2 eb5:4
        bb4:2 eb5:2 e5:4
      `,
    },
    { voice: 'triangle', gain: 0.9, notes: 'g2:4 g2 g2 g2:8 g2 g2:4', repeat: 8 },
    { voice: 'noise', gain: 0.5, notes: 'x:4 x x x:8 x x:4', repeat: 8 },
  ],
};
