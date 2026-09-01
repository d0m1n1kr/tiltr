// Mozart, „Eine kleine Nachtmusik" (KV 525, 1. Satz, 1787) – gemeinfrei.
//
// QUELLE der Töne (siehe tools/score2tiltr.py): Mutopia Project,
// MozartWA/KV525/eine-kleine-nachtmusik-mvt1, Satz „Public Domain".
// Die ersten vier Takte: die aufsteigende Frage über G, die absteigende
// Antwort über D7. Der PUNKTIERTE Auftakt (Viertel plus Achtel) ist das
// Kennzeichen – eine Fassung in geraden Achteln, wie sie hier zuerst stand,
// klingt wie eine Tonleiter-Übung.
//
// Die Bass-Stimme ist die tiefste Stimme der Quelle: dasselbe Thema eine
// Oktave tiefer. Das ist keine Vereinfachung, sondern Mozart – das Quartett
// spielt den Anfang unisono in Oktaven.

import type { Tune } from '../audio/chiptune';

export const tune: Tune = {
  id: 'nachtmusik',
  title: 'Kleine Nachtmusik',
  bpm: 132,
  tracks: [
    {
      voice: 'square',
      notes: `
        g5:4. d5:8 g5:4. d5:8 g5 d5 g5 b5 d6:2
        c6:4. a5:8 c6:4. a5:8 c6 a5 f#5 a5 d5:2
      `,
    },
    {
      voice: 'triangle',
      gain: 0.8,
      notes: `
        g3:4. d3:8 g3:4. d3:8 g3 d3 g3 b3 d4:2
        c4:4. a3:8 c4:4. a3:8 c4 a3 f#3 a3 d3:2
      `,
    },
    { voice: 'noise', gain: 0.3, notes: 'x:4 x x x', repeat: 4 },
  ],
};
