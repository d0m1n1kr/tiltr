// Der Ordner src/music/ ist Inhalt, nicht Logik – deshalb prüft dieser Lauf
// die INVARIANTEN des Inhalts: Jeder Titel muss übersetzbar sein, im
// Tonumfang der Stimmen liegen und in allen Stimmen GLEICH LANG sein. Das
// letzte ist der wichtige: Eine zu kurze Begleitstimme fällt beim Hören als
// „hinten wird's plötzlich dünn" auf, eine zu kurze Melodie als stummes Loch
// vor dem Loop – beides sieht man in der Datei nicht.

import { describe, expect, it } from 'vitest';
import { compileTune, parseNotes, totalBeats } from '../src/audio/chiptune';
import { MUSIC, MUSIC_IDS, compiledById, tuneById } from '../src/music';

describe('Titelliste', () => {
  it('hat eindeutige IDs', () => {
    expect(new Set(MUSIC_IDS).size).toBe(MUSIC.length);
  });
  it('spiegelt MUSIC_IDS die Liste', () => {
    expect(MUSIC_IDS).toEqual(MUSIC.map((t) => t.id));
  });
  it('gibt jedem Titel einen Anzeigenamen', () => {
    for (const t of MUSIC) expect(t.title.length).toBeGreaterThan(2);
  });
  it('findet jeden Titel über die Registry', () => {
    for (const id of MUSIC_IDS) expect(tuneById(id)?.id).toBe(id);
    expect(tuneById('gibtsnicht')).toBeUndefined();
  });
});

describe.each(MUSIC.map((t) => [t.id, t] as const))('Titel „%s"', (_id, tune) => {
  const compiled = compileTune(tune);

  it('ist übersetzbar und hat Substanz', () => {
    expect(compiled.notes.length).toBeGreaterThanOrEqual(12);
    expect(tune.tracks.length).toBeGreaterThanOrEqual(1);
  });

  it('läuft zwischen 5 und 40 Sekunden (Loop, kein Fragment und kein Werk)', () => {
    expect(compiled.durationS).toBeGreaterThan(5);
    expect(compiled.durationS).toBeLessThan(40);
  });

  it('hat in ALLEN Stimmen dieselbe Länge – kein stummer Schwanz vor dem Loop', () => {
    const lens = tune.tracks.map((tr) => totalBeats(parseNotes(tr.notes)) * Math.max(1, tr.repeat ?? 1));
    for (const l of lens) expect(l).toBeCloseTo(lens[0]!, 6);
  });

  it('bleibt im Tonumfang der 8-Bit-Stimmen (MIDI 24–100)', () => {
    for (const tr of tune.tracks) {
      if (tr.voice === 'noise') continue;
      for (const n of parseNotes(tr.notes)) {
        if (n.midi === null) continue;
        expect(n.midi).toBeGreaterThanOrEqual(24);
        expect(n.midi).toBeLessThanOrEqual(100);
      }
    }
  });

  it('hält ein plausibles Tempo', () => {
    expect(tune.bpm).toBeGreaterThanOrEqual(60);
    expect(tune.bpm).toBeLessThanOrEqual(200);
  });
});

describe('compiledById', () => {
  it('übersetzt höchstens einmal (dieselbe Instanz zurück)', () => {
    const a = compiledById('tiltr');
    const b = compiledById('tiltr');
    expect(a).toBeDefined();
    expect(a).toBe(b);
  });
  it('kennt unbekannte IDs nicht', () => {
    expect(compiledById('nope')).toBeUndefined();
  });
});
