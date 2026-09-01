// „Fünfviertel" (Original) – ein Kriegsmarsch-Ostinato: EIN Ton, nur
// Rhythmus (Viertel, Viertel, Viertel, zwei Achtel, Viertel), und ab Takt 5
// chromatisch steigende Akkordstöße darüber.
//
// Hier stand zuerst „Mars" aus Holsts Planeten – der Ur-Vorfahre jeder
// Bedrohungsmusik in Spielen, und die Form, die dieses Stück zitiert. Für
// Mars ließ sich aber keine freie, maschinenlesbare Quelle finden (Mutopia
// hat von Holst nur die Hymnensätze, IMSLP nur Scans), und die Akkordstöße
// waren ohnehin erfunden. Also trägt es den Namen, der ihm zusteht. Holst
// ist trotzdem im Ordner: als „Thaxted", belegt und mit seinen echten Tönen.

import type { Tune } from '../audio/chiptune';

export const tune: Tune = {
  id: 'fuenfviertel',
  title: 'Fünfviertel',
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
