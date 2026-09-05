// EIN ÖFFNER, MEHRERE TÜREN (M99). Gefragt in einem Satz: „wäre es möglich,
// dass eine Platte mit mehreren Türen verknüpft ist?" – ja, seit `opens` eine
// LISTE ist. Die Proben hier halten die zwei Versprechen fest:
//   1. Das Modell rechnet jede genannte Tür als eigene Bedingung.
//   2. Alles von vor 3.34 lädt UNVERÄNDERT: `opens` als String bleibt gültig,
//      und nach dem Parsen steht überall dieselbe Form.
import { describe, expect, it } from 'vitest';
import { hasMultiOpens, parseLevel } from '../src/levels/schema';
import { validateLevel } from '../src/levels/validate';
import { loadLevel } from '../src/levels/loader';
import { collectOpeners, doorState } from '../src/core/doors';

describe('Ein Öffner, mehrere Türen (M99)', () => {
  // Gang in Reihe 0, Reihe 1 abgemauert: Start links, zwei Türen hintereinander,
  // Ziel rechts. EIN Schlüssel soll beide öffnen.
  const level = (elements: unknown[], cols = 6) =>
    parseLevel({
      id: 'custom-multi',
      name: 'Zwei Türen, ein Schlüssel',
      floors: [
        {
          size: [cols, 2],
          maze: {
            seed: 3,
            carve: [...Array(cols - 1).keys()].map((x) => [[x, 0], 'e']),
            add: [...Array(cols).keys()].map((x) => [[x, 0], 's']),
          },
          elements,
          start: [0, 0],
          goal: [cols - 1, 0],
        },
      ],
    });
  const red = (def: ReturnType<typeof parseLevel>) =>
    validateLevel(def)
      .filter((c) => !c.ok)
      .map((c) => c.key);

  it('`opens` als String bleibt gültig und wird zur Liste – alte Defs laden unverändert', () => {
    const def = level([
      { type: 'door', id: 'a', edge: [[2, 0], 'e'] },
      { type: 'key', cell: [1, 0], opens: 'a' },
    ]);
    expect(def.floors[0]!.elements.find((e) => e.type === 'key')!.opens).toEqual(['a']);
    expect(hasMultiOpens(def)).toBe(false);
    expect(red(def)).toEqual([]);
  });

  it('ein Schlüssel öffnet BEIDE genannten Türen', () => {
    const def = level([
      { type: 'door', id: 'a', edge: [[2, 0], 'e'] },
      { type: 'door', id: 'b', edge: [[4, 0], 'e'] },
      { type: 'key', cell: [1, 0], opens: ['a', 'b'] },
    ]);
    expect(hasMultiOpens(def)).toBe(true);
    expect(red(def)).toEqual([]);
    // … und im Spiel: eingesammelt sind beide Türen offen.
    const world = loadLevel(def).floors[0]!.world;
    for (const k of world.keys) k.collected = true;
    const openers = collectOpeners([world], 0);
    expect(doorState(openers.get('a') ?? []).open).toBe(true);
    expect(doorState(openers.get('b') ?? []).open).toBe(true);
  });

  it('nennt der Schlüssel nur EINE der beiden Türen, bleibt das Ziel unerreichbar', () => {
    // Die Gegenprobe: Ohne die zweite Tür in der Liste sperrt sie weiter.
    const def = level([
      { type: 'door', id: 'a', edge: [[2, 0], 'e'] },
      { type: 'door', id: 'b', edge: [[4, 0], 'e'] },
      { type: 'key', cell: [1, 0], opens: ['a'] },
    ]);
    expect(red(def)).toContain('goal');
  });

  it('eine fehlende Tür in der Liste macht „Verknüpfungen" rot', () => {
    const def = level([
      { type: 'door', id: 'a', edge: [[2, 0], 'e'] },
      { type: 'key', cell: [1, 0], opens: ['a', 'gibtsnicht'] },
    ]);
    expect(red(def)).toContain('links');
  });

  it('eine PLATTE mit zwei latchenden Türen ist im Solo lösbar (M95 gilt je Tür)', () => {
    const def = level([
      { type: 'door', id: 'a', edge: [[2, 0], 'e'], latch: true },
      { type: 'door', id: 'b', edge: [[4, 0], 'e'], latch: true },
      { type: 'plate', cell: [1, 0], opens: ['a', 'b'] },
    ]);
    expect(red(def)).toEqual([]);
  });

  it('… und rastet nur EINE der beiden ein, sperrt die andere (die Regel hängt an der TÜR)', () => {
    const def = level([
      { type: 'door', id: 'a', edge: [[2, 0], 'e'], latch: true },
      { type: 'door', id: 'b', edge: [[4, 0], 'e'] },
      { type: 'plate', cell: [1, 0], opens: ['a', 'b'] },
    ]);
    expect(red(def)).toContain('goal');
  });

  it('der Zeitschalter muss zu JEDER genannten Tür reichen', () => {
    // Tür „a" liegt direkt neben dem Schalter, Tür „b" weit weg: Der Sprint
    // reicht nur zur ersten, also ist das Timer-Badge (weich) rot.
    const def = level(
      [
        { type: 'door', id: 'a', edge: [[2, 0], 'e'] },
        { type: 'door', id: 'b', edge: [[10, 0], 'e'] },
        { type: 'timedSwitch', cell: [1, 0], opens: ['a', 'b'], durationS: 1 },
      ],
      12,
    );
    expect(red(def)).toContain('timer');
  });
});

// Nebenbefund von M99, und ein eigener Fund: Eine reine SCHLÜSSEL-Tür fällt
// NICHT hinter einem zu – sie wird zu Schutt (`doorState(...).permanent`).
// Der Softlock-Beweis rechnete trotzdem so, als stünde sie wieder zu; das fiel
// erst auf, als ein Schlüssel eine SPÄTERE Tür mit aufschloss (dann sperrte
// die zweite Tür den Weg, und den Schlüssel dafür hatte man längst). Dieselbe
// Regel wie „eingerastet bleibt eingerastet" (M78), nur für Schutt.
describe('Eine Schlüssel-Tür fällt nicht hinter dir zu (M99)', () => {
  const pocket = (opener: 'key' | 'timedSwitch') =>
    parseLevel({
      id: `custom-pocket-${opener}`,
      name: 'Tasche hinter einer Tür',
      floors: [
        {
          size: [3, 2],
          // Alles offen bis auf die Kante (1,1)→(2,1): Die Tasche in Spalte 2
          // ist NUR durch die Tür bei (1,0) erreichbar.
          maze: {
            seed: 1,
            carve: [
              [[0, 0], 'e'], [[1, 0], 'e'], [[0, 1], 'e'], [[0, 0], 's'], [[1, 0], 's'], [[2, 0], 's'],
            ],
            add: [[[1, 1], 'e']],
          },
          elements: [
            { type: 'door', id: 'tor', edge: [[1, 0], 'e'] },
            opener === 'key'
              ? { type: 'key', cell: [1, 0], opens: 'tor' }
              : { type: 'timedSwitch', cell: [1, 0], opens: 'tor', durationS: 6 },
          ],
          start: [0, 0],
          goal: [0, 1],
        },
      ],
    });
  const softlock = (def: ReturnType<typeof parseLevel>) => validateLevel(def).find((c) => c.key === 'softlock')!;

  it('Schlüssel: kein Softlock – wer in der Tasche steht, hat sie zu Schutt gemacht', () => {
    expect(softlock(pocket('key')).ok).toBe(true);
  });

  it('Zeitschalter: sehr wohl ein Softlock – der läuft ab, die Tür fällt zu', () => {
    const sl = softlock(pocket('timedSwitch'));
    expect(sl.ok).toBe(false);
    expect(sl.detail).toContain('Tür tor fällt hinter dir zu');
  });
});
