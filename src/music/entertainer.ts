// Scott Joplin, „The Entertainer" (1902) – gemeinfrei (Joplin † 1917).
//
// QUELLE der Töne (siehe tools/score2tiltr.py): Mutopia Project,
// JoplinS/entertainer, Satz „Public Domain". Übernommen sind die berühmte
// Einleitung (dieselbe absteigende Figur dreimal, jeweils eine Oktave tiefer)
// und der Anfang des ersten Strains (d–es–e–c…). Der Bass ist eine eigene
// Ragtime-Begleitung: Die linke Hand der Quelle ist vollgriffig, und aus
// Akkorden wird in einer einstimmigen Stimme nur Gestolper – während der
// Einleitung schweigt sie, wie im Original.

import type { Tune } from '../audio/chiptune';

export const tune: Tune = {
  id: 'entertainer',
  title: 'The Entertainer',
  bpm: 88,
  tracks: [
    {
      voice: 'square',
      notes: `
        d6:16 e6 c6 a5:8 b5:16 g5:8
        d5:16 e5 c5 a4:8 b4:16 g4:8
        d4:16 e4 c4:2
        d4:16 d#4 e4 c5:8 e4:16 c5:8 e4:16 c5 c5:4
        c6:16 d6 d#6 e6 c6 d6 e6:8 b5:16 d6:8 c6:4.
        r:4 r:8.
      `,
    },
    {
      voice: 'triangle',
      gain: 0.85,
      notes: 'r:1 r:2 r:8 c3:4 g3 c3 g3 c3 g3 c3 g3 c3 g3:8',
    },
    { voice: 'noise', gain: 0.22, notes: 'r:4 x', repeat: 8 },
  ],
};
