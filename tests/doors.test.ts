// Türregel (core/doors.ts): einer genügt oder alle gleichzeitig – für
// Schlüssel (dauerhaft), Zeitschloss (läuft) und Platte (gehalten).

import { describe, expect, it } from 'vitest';
import { collectOpeners, doorState, type OpenerSource, type OpenerState } from '../src/core/doors';

const key = (satisfied: boolean): OpenerState => ({ kind: 'key', satisfied });
const sw = (satisfied: boolean): OpenerState => ({ kind: 'timedSwitch', satisfied });
const plate = (satisfied: boolean): OpenerState => ({ kind: 'plate', satisfied });

describe('doorState', () => {
  it('ohne Öffner bleibt die Tür zu', () => {
    expect(doorState([])).toEqual({ open: false, permanent: false });
  });

  it('any: ein Schlüssel öffnet dauerhaft, ein Schalter nur solange er läuft', () => {
    expect(doorState([key(true), key(false)])).toEqual({ open: true, permanent: true });
    expect(doorState([sw(true), key(false)])).toEqual({ open: true, permanent: false });
    expect(doorState([sw(false), key(false)])).toEqual({ open: false, permanent: false });
  });

  it('all: erst wenn ALLE erfüllt sind', () => {
    expect(doorState([key(true), key(false)], 'all')).toEqual({ open: false, permanent: false });
    expect(doorState([key(true), key(true)], 'all')).toEqual({ open: true, permanent: true });
  });

  it('all mit Schalter/Platte: offen nur im Überlapp, nie dauerhaft', () => {
    expect(doorState([key(true), sw(true)], 'all')).toEqual({ open: true, permanent: false });
    expect(doorState([key(true), sw(false)], 'all')).toEqual({ open: false, permanent: false });
    expect(doorState([plate(true), plate(true)], 'all')).toEqual({ open: true, permanent: false });
    expect(doorState([plate(true), plate(false)], 'all')).toEqual({ open: false, permanent: false });
  });

  it('any mit Platte und Schalter: irgendein erfüllter Öffner genügt', () => {
    expect(doorState([plate(false), sw(true)])).toEqual({ open: true, permanent: false });
    expect(doorState([plate(true), sw(false)])).toEqual({ open: true, permanent: false });
  });
});

// M69: collectOpeners ist die EINE Sammelstelle – im Coop (Spiel wie
// Editor-Testmodus) tragen die Welten BEIDER Spieler bei, im Race nur die
// eigene. Nackte Objekte reichen: die Quelle ist strukturell beschrieben.
describe('collectOpeners', () => {
  const src = (o: Partial<OpenerSource>): OpenerSource => ({ keys: [], switches: [], plates: [], ...o });
  const p1 = src({ keys: [{ opens: 'k', collected: false }] });
  const p2 = src({ plates: [{ opens: 'k', held: true }] });

  it('sammelt je Tür-ID über alle Quellen', () => {
    const m = collectOpeners([p1, p2], 1000);
    expect(m.get('k')?.map((o) => `${o.kind}:${String(o.satisfied)}`)).toEqual(['key:false', 'plate:true']);
    expect(m.get('x')).toBeUndefined();
  });
  it('Coop: die Platte des Partners öffnet die Tür, allein bleibt sie zu', () => {
    expect(doorState(collectOpeners([p1, p2], 1000).get('k') ?? []).open).toBe(true);
    expect(doorState(collectOpeners([p1], 1000).get('k') ?? []).open).toBe(false);
  });
  it('Zeitschalter zählt nur, solange sein Timer läuft; Rollstein hält die Platte', () => {
    const sw = src({ switches: [{ opens: 'd', openUntil: 900 }] });
    expect(doorState(collectOpeners([sw], 800).get('d') ?? []).open).toBe(true);
    expect(doorState(collectOpeners([sw], 1000).get('d') ?? []).open).toBe(false);
    const boulder = src({ plates: [{ opens: 'd', held: false, boulder: true }] });
    expect(doorState(collectOpeners([boulder], 0).get('d') ?? []).open).toBe(true);
  });
  it('zwei Platten derselben Tür sind ZWEI Bedingungen (M76)', () => {
    // Der Fehler, den das ausschließt: Der Halte-Zustand lief über die
    // TÜR-ID, also hielt eine Platte ihre Geschwister mit – ein 'all' ging
    // mit einer einzigen Kugel auf. Jede Platte ist ein eigener Eintrag.
    const one = collectOpeners([src({ plates: [{ opens: 'g', held: true }, { opens: 'g', held: false }] })], 0);
    expect(one.get('g')).toHaveLength(2);
    expect(doorState(one.get('g') ?? [], 'all').open).toBe(false);
    expect(doorState(one.get('g') ?? [], 'any').open).toBe(true);
    const both = collectOpeners([src({ plates: [{ opens: 'g', held: true }, { opens: 'g', held: true }] })], 0);
    expect(doorState(both.get('g') ?? [], 'all').open).toBe(true);
  });

  it("'all' verlangt beide Öffner gleichzeitig – auch über zwei Welten", () => {
    const both = collectOpeners([src({ keys: [{ opens: 'g', collected: true }] }), src({ plates: [{ opens: 'g', held: false }] })], 0);
    expect(doorState(both.get('g') ?? [], 'all').open).toBe(false);
    const held = collectOpeners([src({ keys: [{ opens: 'g', collected: true }] }), src({ plates: [{ opens: 'g', held: true }] })], 0);
    expect(doorState(held.get('g') ?? [], 'all').open).toBe(true);
  });
});

// „Bleibt offen" (M76): Die Frage aus dem Levelbau war „bleibt die Tür offen,
// wenn die Schalter sie geöffnet haben?" – nein: Platte und Zeitschalter
// halten sie nur, solange sie erfüllt sind. Seit M76 ist das je Tür
// einstellbar, und die Regel dazu wohnt in doorState.
describe('doorState mit „bleibt offen"', () => {
  const plate = (held: boolean) => [{ kind: 'plate' as const, satisfied: held }];

  it('ohne latch schließt die Tür wieder, sobald die Platte los ist', () => {
    expect(doorState(plate(true)).open).toBe(true);
    expect(doorState(plate(false)).open).toBe(false);
  });

  it('einmal offen und gelatcht: die Öffner sind ab dann egal', () => {
    expect(doorState(plate(false), 'any', true).open).toBe(true);
    expect(doorState(plate(false), 'all', true).open).toBe(true);
    expect(doorState([], 'any', true).open).toBe(true);
  });

  it('gelatcht ist NICHT dauerhaft im Sinne von Schutt – nur Schlüssel sind das', () => {
    // `permanent` entfernt die Wand aus der Welt (Schutt). Eine gelatchte
    // Platten-Tür bleibt eine offene Tür: Sie klingt und leuchtet weiter.
    expect(doorState(plate(false), 'any', true).permanent).toBe(false);
    expect(doorState([{ kind: 'key', satisfied: true }]).permanent).toBe(true);
  });

  it('latch springt nicht von selbst an: ohne Öffner-Erfüllung bleibt zu', () => {
    expect(doorState(plate(false), 'any', false).open).toBe(false);
  });
});
