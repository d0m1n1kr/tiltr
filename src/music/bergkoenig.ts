// Grieg, „In der Halle des Bergkönigs" (Peer Gynt Suite I, op. 46 Nr. 4,
// 1874) – gemeinfrei (Grieg † 1907).
//
// QUELLE der Töne (nicht aus dem Gedächtnis, siehe tools/score2tiltr.py):
// Mutopia Project, GriegE/O46/Dans_l_antre_du_roi_de_la_montagne
// (Grieg' eigene Klavierfassung, Satz „Public Domain", Stich nach The
// University Society 1918). Melodie und Bass sind die Takte 1–4 (h-Moll) und
// 9–12 (die Wiederholung eine Quinte höher, mit der erhöhten Sekunde ais) –
// beide zwei Oktaven hochgesetzt: Die Klavierfassung steht so tief, dass eine
// Puls-Stimme dort nur brummt.
//
// Tempo 138 = „Alla marcia molto marcato" der Quelle. Das Original zieht im
// Verlauf immer weiter an; ein Loop kann das nicht, also bleibt es beim
// Marschtempo.

import type { Tune } from '../audio/chiptune';

export const tune: Tune = {
  id: 'bergkoenig',
  title: 'In der Halle des Bergkönigs',
  bpm: 138,
  tracks: [
    {
      voice: 'square',
      notes: `
        b3:8 c#4 d4 e4 f#4 d4 f#4:4
        f4:8 c#4 f4:4 e4:8 c4 e4:4
        b3:8 c#4 d4 e4 f#4 d4 f#4 b4
        a4 f#4 d4 f#4 a4:2
        f#4:8 g#4 a#4 b4 c#5 a#4 c#5:4
        d5:8 a#4 d5:4 c#5:8 a#4 c#5:4
        f#4:8 g#4 a#4 b4 c#5 a#4 c#5:4
        d5:8 a#4 d5:4 c#5:2
      `,
    },
    {
      voice: 'triangle',
      gain: 0.85,
      notes: `
        b2:4 f#3 b2 f#3 b2 f#3 b2 f#3 b2 f#3 b2 f#3 d3 a3 d3 a3
        f#3 c#4 f#3 c#4 d3 a#3 f#3 c#4 f#3 c#4 f#3 c#4 d3 a#3 f#3 c#4
      `,
    },
    { voice: 'noise', gain: 0.45, notes: 'x:8 r x r x r x r', repeat: 8 },
  ],
};
