// Bach, Toccata und Fuge d-Moll (BWV 565, um 1710) – gemeinfrei.
//
// Töne gegengeprüft an Mutopia Project, BachJS/BWV565/ToccataFugue (Satz
// „Public Domain"): Mordent auf a, dann der Lauf g–f–e–d–cis–d, Halt auf a,
// das Ganze eine Oktave tiefer, dann die Akkordsäule über dem d-Pedal. Aus
// dem MIDI der Quelle ließ sich der Lauf nicht automatisch übernehmen (die
// Verzierung liegt dort als Akkord auf EINEM Zeitpunkt), die Tonfolge ist
// aber dieselbe. Deshalb: von Hand geschrieben, an der Quelle belegt.
// 8-Bit-Fassung der Eröffnungsgeste: Mordent, absteigender Lauf, Halt – erst
// oben, dann eine Oktave tiefer, dann die Akkordsäule. Der Pedalton läuft
// als Dreiecks-Stimme durch: die Orgel unter dem Automaten.

import type { Tune } from '../audio/chiptune';

export const tune: Tune = {
  id: 'toccata',
  title: 'Toccata d-Moll',
  bpm: 80,
  tracks: [
    {
      voice: 'square',
      notes: `
        a5:16 g5 a5 r:8
        g5:16 f5 e5 d5 c#5 d5 c#5 d5
        a4:2 r:4
        a4:16 g4 a4 r:8
        g4:16 f4 e4 d4 c#4 d4 c#4 d4
        a3:2 r:4
        d4:2 a4:2 d5:2 a5:2 d5:1 r:4 r:8
      `,
    },
    { voice: 'triangle', gain: 0.85, notes: 'd2:1 r:1 d2:1 r:1 a1:1 d2:2 d2:2 r:2' },
  ],
};
