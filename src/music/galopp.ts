// „Galopp" (Original) – ein Rennstück in der Art der Operngaloppe des
// 19. Jahrhunderts: zwei Achtel, ein Viertel, immer wieder, erst auf der
// Tonika, dann auf der Dominante, mit galoppierendem Bass darunter.
//
// Warum ein Original und nicht Rossinis Wilhelm-Tell-Galopp, der hier zuerst
// stand: Für den ließ sich keine freie, maschinenlesbare Quelle finden
// (Mutopia hat von Rossini nur „Eduardo e Cristina", IMSLP nur Scans). Eine
// Fassung aus dem Gedächtnis unter dem Namen des Komponisten auszuliefern
// wäre unsauber – also trägt das Stück den Namen, der ihm zusteht. Wer die
// Ouvertüre will, findet vielleicht später einen Satz; die Notenschrift
// dieser Datei ist dieselbe.

import type { Tune } from '../audio/chiptune';

export const tune: Tune = {
  id: 'galopp',
  title: 'Galopp',
  bpm: 152,
  tracks: [
    {
      voice: 'square',
      notes: `
        e4:8 e4 e4:4 e4:8 e4 e4:4 e4:8 e4 e4:4 g4:8 b4 b4:4
        b4:8 b4 b4:4 b4:8 b4 b4:4 b4:8 b4 b4:4 a4:8 g4 f#4:4
        e4:8 e4 e4:4 e4:8 e4 e4:4 g4:8 g4 g4:4 b4:8 b4 b4:4
        e5:4 d5:8 c#5 b4:4 a4 g4:8 f#4 e4:2 r:4
      `,
    },
    { voice: 'triangle', gain: 0.85, notes: 'e2:8 r e2 r', repeat: 16 },
    { voice: 'noise', gain: 0.4, notes: 'x:8 x x:4', repeat: 16 },
  ],
};
