// Aufzugmusik (Original) – absichtlich harmlos: Dreiklänge aufwärts, weiche
// Dreiecks-Stimme, kein Schlagwerk außer einem Wischer. Der Witz ist, dass
// sie in einem Labyrinth läuft, in dem man auf sein Gehör angewiesen ist.

import type { Tune } from '../audio/chiptune';

export const tune: Tune = {
  id: 'aufzug',
  title: 'Aufzugmusik',
  bpm: 96,
  tracks: [
    {
      voice: 'triangle',
      notes: `
        c5:4 e5 g5 e5
        f5 a5 c6:2
        d5:4 f5 a5 f5
        e5:2 c5:2
      `,
    },
    { voice: 'triangle', gain: 0.7, notes: 'c3:2 c3 f2 f2 d3 d3 g2 c3' },
    { voice: 'noise', gain: 0.25, notes: 'r:2 x:2', repeat: 4 },
  ],
};
