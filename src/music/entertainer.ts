// Scott Joplin, „The Entertainer" (1902) – gemeinfrei.
// 8-Bit-Fassung: die Ragtime-Figur als Puls-Stimme über dem klassischen
// Oom-Pah-Bass. Der perfekte Jukebox-Klimperer.

import type { Tune } from '../audio/chiptune';

export const tune: Tune = {
  id: 'entertainer',
  title: 'The Entertainer',
  bpm: 88,
  tracks: [
    {
      voice: 'square',
      notes: `
        d5:8 d#5 e5 c6 e5 c6 e5 c6
        d5:8 d#5 e5 c6 e5 c6 e5 c6
        d5:8 d#5 e5 c6 d5 e5 g5 f5
        e5:8 d5 c5:2 r:4
      `,
    },
    { voice: 'triangle', gain: 0.85, notes: 'c3:4 g3 c3 g3', repeat: 4 },
    { voice: 'noise', gain: 0.25, notes: 'r:2 x:2', repeat: 4 },
  ],
};
