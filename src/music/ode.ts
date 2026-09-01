// Beethoven, „Ode an die Freude" (9. Sinfonie, 4. Satz, 1824) – gemeinfrei.
//
// QUELLE der Töne (siehe tools/score2tiltr.py): Mutopia Project,
// BeethovenLv/ode, Satz „Public Domain" – Beethovens Fassung in G-Dur, beide
// Halbsätze. Hier stand zuerst die vereinfachte Schulbuch-Form in C-Dur mit
// glatt absteigendem vierten Takt; im Original geht die Linie dort d–c–a–h
// und die zweite Kadenz über a–fis–g. Das sind genau die zwei Stellen, an
// denen man das Stück wiedererkennt oder eben nicht.
//
// Der Bass ist die tiefste Stimme der Quelle.

import type { Tune } from '../audio/chiptune';

export const tune: Tune = {
  id: 'ode',
  title: 'Ode an die Freude',
  bpm: 132,
  tracks: [
    {
      voice: 'square',
      notes: `
        b4:4 b4 c5 d5 d5 c5:8 a4 b4:4 a4 g4
        g4 a4 b4 b4:4. a4:8 a4:2
        b4:4 b4 c5 d5 d5 c5:8 a4 b4:4 a4 g4
        g4 a4 b4 a4 f#4:8 g4 g4:2
      `,
    },
    {
      voice: 'triangle',
      gain: 0.8,
      notes: `
        g3:4 g3 g3 g3 e3:4. f#3:8 g3:4 d3 b3 b3
        a3 g3 d3:4. d3:8 d3:2
        g3:4 g3 g3 g3 e3:4. f#3:8 g3:4 d3 b3 b3
        a3 g3 d3 d3 g2:2
      `,
    },
    { voice: 'noise', gain: 0.3, notes: 'x:4 r r r', repeat: 8 },
  ],
};
