// Holst, „Thaxted" (1921) – gemeinfrei (Holst † 1934). Die Hymnenfassung, die
// Holst selbst aus dem Mittelteil von „Jupiter" (Die Planeten) gemacht hat;
// in Großbritannien als „I Vow to Thee, My Country" bekannt.
//
// QUELLE der Töne (siehe tools/score2tiltr.py): Mutopia Project,
// HolstGT/Thaxted, Satz „Public Domain" (nach Methodist Hymnbook 1933,
// Nr. 900). Melodie und Bass-Stimme des vierstimmigen Satzes, der Bass eine
// Oktave tiefer. Tempo 100 wie in der Quelle, Dreivierteltakt.
//
// Der ruhige Titel der Jukebox: Wo alles andere treibt, atmet dieser breit –
// und weil die Musik in tiltr die Hinweise verdeckt, ist ein langsames Stück
// im Automaten nicht weniger fies als ein schnelles.

import type { Tune } from '../audio/chiptune';

export const tune: Tune = {
  id: 'thaxted',
  title: 'Thaxted',
  bpm: 100,
  tracks: [
    {
      voice: 'square',
      notes: `
        d4:8 f4 g4:4. a#4:8 a4:8. f4:16 a#4:8 c5 a#4:4 a4
        g4:8 a4 g4:4 f4 d4:2
        d4:8 f4 g4:4. a#4:8 a4:8. f4:16 a#4:8 c5 d5:4 d5
        d5:8 c5 a#4:4 c5 a#4:2
      `,
    },
    {
      voice: 'triangle',
      gain: 0.85,
      notes: `
        a#2:4 d#3 d#3 c3 a#2 a#2 a#2 d#3 d#3 f3 g3 g3
        f3 d#3 d#3 c3 a#2 a#2 a#2 d#3 d#3 d#3 a#2 a#2
      `,
    },
  ],
};
