// Beethoven, „Für Elise" (WoO 59, 1810) – gemeinfrei.
// 8-Bit-Fassung des Anfangs: die kreisende Sechzehntel-Figur als Puls-Stimme
// über einem sparsamen Bass. Kein Pedal, kein Rubato – das ist der Reiz.

import type { Tune } from '../audio/chiptune';

export const tune: Tune = {
  id: 'elise',
  title: 'Für Elise',
  bpm: 76,
  tracks: [
    {
      voice: 'square',
      notes: `
        e5:16 d#5 e5 d#5 e5 b4 d5 c5
        a4:8 c4:16 e4 a4
        b4:8 e4:16 g#4 b4
        c5:8 e4:16 e5 d#5
        e5:16 d#5 e5 d#5 e5 b4 d5 c5
        a4:8 c4:16 e4 a4
        b4:8 e4:16 g#4 b4
        c5:8 b4:16 a4 r
        a4:4 r:4
      `,
    },
    { voice: 'triangle', gain: 0.75, notes: 'a2:2 r:2 a2:2 e2:2 a2:2 e2:2 a2:4 r:8' },
  ],
};
