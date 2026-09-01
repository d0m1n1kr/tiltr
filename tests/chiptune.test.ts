// Die Chiptune-Maschine ist REIN – Noten rein, Sekunden raus. Deshalb nageln
// diese Units die Notenschrift und das Zeitfenster des Schedulers fest: Ein
// Fehler in der klebrigen Länge oder am Loop-Übergang wäre im Spiel nur als
// „klingt irgendwie schief" zu hören.

import { describe, expect, it } from 'vitest';
import {
  advance,
  compileTune,
  noteFreq,
  notesAt,
  parseNotes,
  parsePitch,
  totalBeats,
  type Tune,
} from '../src/audio/chiptune';

describe('parsePitch', () => {
  it('legt c4 auf MIDI 60 und a4 auf 69 (440 Hz)', () => {
    expect(parsePitch('c4')).toBe(60);
    expect(parsePitch('a4')).toBe(69);
    expect(parsePitch('b3')).toBe(59);
  });
  it('versteht Kreuz und b', () => {
    expect(parsePitch('c#4')).toBe(61);
    expect(parsePitch('eb4')).toBe(63);
    expect(parsePitch('db5')).toBe(73);
  });
  it('wirft bei Unsinn – ein Tippfehler soll im Test knallen, nicht im Ohr', () => {
    expect(() => parsePitch('h4')).toThrow();
    expect(() => parsePitch('c')).toThrow();
  });
});

describe('noteFreq', () => {
  it('trifft die Kammertöne', () => {
    expect(noteFreq(69)).toBeCloseTo(440, 6);
    expect(noteFreq(57)).toBeCloseTo(220, 6);
    expect(noteFreq(81)).toBeCloseTo(880, 6);
  });
});

describe('parseNotes', () => {
  it('hält die Länge KLEBRIG: „e4:8 g4 a4" sind drei Achtel', () => {
    const n = parseNotes('e4:8 g4 a4');
    expect(n.map((x) => x.lenBeats)).toEqual([0.5, 0.5, 0.5]);
    expect(n.map((x) => x.atBeats)).toEqual([0, 0.5, 1]);
  });
  it('startet mit Vierteln, wenn keine Länge steht', () => {
    expect(parseNotes('c4 d4')[1]!.atBeats).toBe(1);
  });
  it('verlängert punktierte Werte um die Hälfte', () => {
    expect(parseNotes('c4:8.')[0]!.lenBeats).toBeCloseTo(0.75, 9);
    expect(parseNotes('c4:4.')[0]!.lenBeats).toBeCloseTo(1.5, 9);
  });
  it('lässt Pausen Zeit verbrauchen', () => {
    const n = parseNotes('c4:4 r:2 c4:4');
    expect(n[1]!.midi).toBeNull();
    expect(n[2]!.atBeats).toBe(3);
  });
  it('nimmt „x" als Schlag der Rausch-Stimme', () => {
    expect(parseNotes('x:8')[0]!.midi).toBe(0);
  });
  it('wirft bei unbekannter Länge', () => {
    expect(() => parseNotes('c4:7x')).toThrow();
  });
});

describe('totalBeats', () => {
  it('zählt Schluss-Pausen mit – sie sind Teil der Loop-Länge', () => {
    expect(totalBeats(parseNotes('c4:4 r:2'))).toBe(3);
  });
});

const TUNE: Tune = {
  id: 't',
  title: 'T',
  bpm: 120, // 0,5 s pro Beat
  tracks: [{ voice: 'square', notes: 'c4:4 r:4 e4:2' }],
};

describe('compileTune', () => {
  it('rechnet Beats in Sekunden um', () => {
    const c = compileTune(TUNE);
    expect(c.durationS).toBeCloseTo(2, 9); // 4 Beats à 0,5 s
    expect(c.notes.map((n) => n.atS)).toEqual([0, 1]);
  });
  it('lässt Pausen aus den Noten heraus (sie klingen nicht)', () => {
    expect(compileTune(TUNE).notes).toHaveLength(2);
  });
  it('artikuliert: die klingende Dauer ist kürzer als der Notenwert', () => {
    const n = compileTune(TUNE).notes[0]!;
    expect(n.durS).toBeLessThan(0.5);
    expect(n.durS).toBeGreaterThan(0.35);
  });
  it('gibt der Rausch-Stimme keine Frequenz', () => {
    const c = compileTune({ ...TUNE, tracks: [{ voice: 'noise', notes: 'x:4' }] });
    expect(c.notes[0]!.freq).toBe(0);
  });
  it('wiederholt eine Stimme mit `repeat` – Schlagwerk schreibt EINEN Takt', () => {
    const c = compileTune({
      ...TUNE,
      tracks: [{ voice: 'noise', notes: 'x:4 r:4', repeat: 4 }],
    });
    expect(c.notes).toHaveLength(4);
    expect(c.notes.map((n) => n.atS)).toEqual([0, 1, 2, 3]);
    expect(c.durationS).toBeCloseTo(4, 9);
  });
  it('nimmt die LÄNGSTE Stimme als Titellänge', () => {
    const c = compileTune({
      ...TUNE,
      tracks: [
        { voice: 'square', notes: 'c4:4' },
        { voice: 'triangle', notes: 'c3:1' },
      ],
    });
    expect(c.durationS).toBeCloseTo(2, 9);
  });
});

describe('notesAt', () => {
  const c = compileTune(TUNE); // Noten bei 0 s und 1 s, Länge 2 s

  it('nimmt den linken Rand mit und den rechten nicht', () => {
    expect(notesAt(c, 0, 1).map((n) => n.atS)).toEqual([0]);
    expect(notesAt(c, 1, 2).map((n) => n.atS)).toEqual([1]);
  });
  it('gibt bei leerem Fenster nichts', () => {
    expect(notesAt(c, 0.5, 0.5)).toEqual([]);
  });
  it('trägt den Loop: Fenster über die Titelgrenze liefert BEIDE Durchläufe', () => {
    const w = notesAt(c, 0.5, 2.5);
    expect(w.map((n) => n.atS)).toEqual([1, 2]);
  });
  it('zählt beim Loop absolut weiter (der Scheduler plant in Audio-Zeit)', () => {
    expect(notesAt(c, 10, 12).map((n) => n.atS)).toEqual([10, 11]);
  });
  it('spielt loop:false nur einmal', () => {
    const once = compileTune({ ...TUNE, loop: false });
    expect(notesAt(once, 0, 2)).toHaveLength(2);
    expect(notesAt(once, 2, 20)).toEqual([]);
  });
});

describe('advance', () => {
  it('läuft im Kreis', () => {
    expect(advance(['a', 'b', 'c'], 0)).toBe(1);
    expect(advance(['a', 'b', 'c'], 2)).toBe(0);
  });
  it('bleibt bei leerer Playlist bei 0', () => {
    expect(advance([], 0)).toBe(0);
  });
});
