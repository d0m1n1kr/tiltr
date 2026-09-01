// Beethoven, „Für Elise" (WoO 59, 1810) – gemeinfrei.
//
// QUELLE der Töne (siehe tools/score2tiltr.py): Mutopia Project,
// BeethovenLv/WoO59/fur-elise-guitar-duo, Satz „Public Domain". Übernommen
// sind die ersten beiden Durchgänge des Hauptthemas samt der PUNKTIERTEN
// Achtel auf a4/b4/c5 – dort atmet die Melodie, und ohne die Punktierung
// klingt die Sechzehntel-Figur wie ein Uhrwerk.
//
// Die Begleitung ist die tiefste Stimme der Quelle (die gebrochenen
// a-Moll-/E-Dur-Dreiklänge); sie endet zwei Beats vor der Melodie, deshalb
// die Pausen am Schluss – alle Stimmen eines Titels müssen gleich lang sein.

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
        a4:8. c4:16 e4 a4
        b4:8. e4:16 g#4 b4
        c5:8. e4:16 e5 d#5
        e5 d#5 e5 b4 d5 c5
        a4:8. c4:16 e4 a4
        b4:8. e4:16 c5 b4
        a4:4 a4:8. b4:16 c5 d5
      `,
    },
    {
      voice: 'triangle',
      gain: 0.75,
      notes: `
        a2:16 e3 a3:4 e2:16 e3 g#3:4 a2:16 e3 a3:2
        a2:16 e3 a3:4 e2:16 e3 g#3:4 a2:16 e3 a3:8 a2:16 e3 a3:4
        r:2 r:8
      `,
    },
  ],
};
