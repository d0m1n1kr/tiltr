// Die Jukebox ist ein MÖBEL: Sie steht als massiver Kasten in ihrer Zelle,
// und das ist der Kern dieser Units. Zwei Dinge werden hier festgenagelt:
//
//  1. GEOMETRIE: Der Kasten lässt keinen Durchgang. Bei CELL=100 und
//     Ball-Durchmesser 44 bleiben neben ihm 12 Einheiten – wer den Einzug
//     größer macht, öffnet unbemerkt einen Schleichweg.
//  2. BEWEISMODELL: Die Zelle gilt in JEDEM Erreichbarkeits-Modell als
//     gesperrt (anders als Glas/Anker, die nur konservativ gesperrt werden).
//     Sonst stempelte der Editor ein Level grün, dessen einziger Weg durch
//     das Möbel führt – und der 'jukebox'-Check sagt zusätzlich, WELCHER
//     Automat schuld ist.

import { describe, expect, it } from 'vitest';
import { BALL_R, CELL } from '../src/core/constants';
import { loadLevel } from '../src/levels/loader';
import { parseLevel } from '../src/levels/schema';
import { validateLevel, type CheckResult } from '../src/levels/validate';
import { JUKEBOX_INSET } from '../src/elements/jukebox';

const by = (checks: CheckResult[], key: string) => checks.find((c) => c.key === key);

/** Ein Korridor in Reihe 0 (x = 0…4), Reihe 1 komplett abgeriegelt. Bewusst
 *  ohne Seed-Zufall im Weg: Jede Aussage über „der einzige Weg" wäre sonst
 *  vom Maze-Rauschen abhängig. */
const corridor = (): Record<string, unknown> => ({
  id: 'jb-test',
  name: 'Jukebox-Test',
  pingBudget: 3,
  floors: [
    {
      size: [5, 2],
      maze: {
        seed: 3,
        carve: [
          [[0, 0], 'e'],
          [[1, 0], 'e'],
          [[2, 0], 'e'],
          [[3, 0], 'e'],
        ],
        add: [
          [[0, 0], 's'],
          [[1, 0], 's'],
          [[2, 0], 's'],
          [[3, 0], 's'],
          [[4, 0], 's'],
        ],
      },
      elements: [] as unknown[],
      start: [0, 0],
      goal: [4, 0],
    },
  ],
});

/** Wie `corridor`, aber (2,1) ist als NISCHE geöffnet – der richtige Platz
 *  für ein Möbelstück: erreichbar, anrempelbar, nicht im Weg. */
const withNiche = (elements: unknown[] = []): Record<string, unknown> => {
  const def = corridor();
  const floor = (def.floors as Array<Record<string, unknown>>)[0]!;
  const add = floor.maze as Record<string, unknown[]>;
  add.add = (add.add as unknown[]).filter((e) => JSON.stringify(e) !== JSON.stringify([[2, 0], 's']));
  floor.elements = elements;
  return def;
};

const jukebox = (cell: [number, number], playlist: unknown[] = ['tiltr']) => ({
  type: 'jukebox',
  cell,
  playlist,
});

describe('Kasten-Geometrie', () => {
  it('lässt neben sich keinen Ball durch', () => {
    // Luft neben dem Kasten: Einzug minus halbe Wanddicke. Muss unter dem
    // Ball-DURCHMESSER liegen, sonst gibt es einen Schleichweg.
    expect(JUKEBOX_INSET).toBeLessThan(BALL_R * 2);
    expect(CELL - JUKEBOX_INSET * 2).toBeGreaterThan(CELL / 2);
  });

  it('baut EINE Wand mit Jukebox-Marke, mittig in der Zelle', () => {
    const loaded = loadLevel(withNiche([jukebox([2, 1])]));
    expect(loaded.world.jukeboxes).toHaveLength(1);
    const j = loaded.world.jukeboxes[0]!;
    expect(j.bx).toBe(2 * CELL + JUKEBOX_INSET);
    expect(j.by).toBe(1 * CELL + JUKEBOX_INSET);
    expect(j.bw).toBe(CELL - JUKEBOX_INSET * 2);
    expect(j.x).toBe(2 * CELL + CELL / 2);
    const marked = loaded.world.walls.filter((w) => w.jukebox !== undefined);
    expect(marked).toHaveLength(1);
    expect(marked[0]!.jukebox).toBe(0);
  });

  it('klemmt einen startIndex jenseits der Playlist ein (Editor-Zwischenstand)', () => {
    const loaded = loadLevel(withNiche([{ ...jukebox([2, 1]), startIndex: 7 }]));
    expect(loaded.world.jukeboxes[0]!.index).toBe(0);
  });
});

describe('Anrempeln', () => {
  it('kollidiert und meldet den Treffer als Jukebox-Wand', () => {
    const loaded = loadLevel(withNiche([jukebox([2, 1])]));
    const world = loaded.world;
    // Aus der Korridorzelle (2,0) nach unten in die Nische rollen.
    world.ball.x = 2 * CELL + CELL / 2;
    world.ball.y = 0.5 * CELL;
    world.ball.vy = 500;
    const seen: number[] = [];
    for (let i = 0; i < 20; i++) {
      for (const hit of world.step(1 / 60, { x: 0, y: 0 })) {
        if (hit.wall.jukebox !== undefined) seen.push(hit.impact);
      }
      if (seen.length) break;
    }
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[0]).toBeGreaterThan(100); // kräftiger Rempler, kein Streifschuss
  });

  it('kommt an KEINER Stelle an ihr vorbei – auch nicht an der Kante', () => {
    // Über die ganze Zellbreite hinweg: Ein zu großer Einzug ließe einen
    // Schleichweg am Rand, den ein mittiger Anlauf nie fände.
    for (const offset of [-30, -18, -8, 0, 8, 18, 30]) {
      const world = loadLevel(withNiche([jukebox([2, 1])])).world;
      world.ball.x = 2 * CELL + CELL / 2 + offset;
      world.ball.y = 0.5 * CELL;
      for (let i = 0; i < 300; i++) world.step(1 / 60, { x: 0, y: 1 });
      expect(world.ball.y, `Versatz ${offset}`).toBeLessThan(1 * CELL + JUKEBOX_INSET);
    }
  });
});

describe('Beweismodell', () => {
  it('in der Nische: alle Checks grün', () => {
    const checks = validateLevel(withNiche([jukebox([2, 1])]));
    for (const c of checks) expect(c.ok, `${c.key}: ${c.detail ?? ''}`).toBe(true);
  });

  it('im Korridor: Ziel unerreichbar UND der jukebox-Check nennt den Schuldigen', () => {
    const checks = validateLevel(withNiche([jukebox([2, 0])]));
    expect(by(checks, 'goal')!.ok).toBe(false);
    const jb = by(checks, 'jukebox')!;
    expect(jb.ok).toBe(false);
    expect(jb.detail).toContain('im Pflichtweg');
    expect(jb.detail).toContain('2,0');
  });

  it('auf dem Start: rot mit Grund', () => {
    const jb = by(validateLevel(withNiche([jukebox([0, 0])])), 'jukebox')!;
    expect(jb.ok).toBe(false);
    expect(jb.detail).toContain('Start');
  });

  it('auf dem Ziel: rot mit Grund', () => {
    const jb = by(validateLevel(withNiche([jukebox([4, 0])])), 'jukebox')!;
    expect(jb.ok).toBe(false);
    expect(jb.detail).toContain('Ziel');
  });

  it('eingemauert: rot, denn ein Automat, den man nicht anrempeln kann, ist stumme Deko', () => {
    // (2,1) OHNE Nische: Reihe 1 ist abgeriegelt.
    const def = corridor();
    (def.floors as Array<Record<string, unknown>>)[0]!.elements = [jukebox([2, 1])];
    const jb = by(validateLevel(def), 'jukebox')!;
    expect(jb.ok).toBe(false);
    expect(jb.detail).toContain('unerreichbar');
  });

  it('auf einer Wächter-Patrouille: rot (der Wächter liefe durch das Möbel)', () => {
    const jb = by(
      validateLevel(
        withNiche([jukebox([2, 1]), { type: 'guard', patrol: [[2, 0], [2, 1]], speed: 90 }]),
      ),
      'jukebox',
    )!;
    expect(jb.ok).toBe(false);
    expect(jb.detail).toContain('Wächter');
  });

  it('unbekannter Titel: rot mit dem Namen', () => {
    const jb = by(validateLevel(withNiche([jukebox([2, 1], ['gibtsnicht'])])), 'jukebox')!;
    expect(jb.ok).toBe(false);
    expect(jb.detail).toContain('gibtsnicht');
  });

  it('sperrt die Zelle auch für den Zeitschloss-Weg', () => {
    // Schalter und Tür stehen sich im Korridor gegenüber, der Automat dazwischen.
    const checks = validateLevel(
      withNiche([
        { type: 'timedSwitch', cell: [0, 0], opens: 'tor', durationS: 3 },
        { type: 'door', id: 'tor', edge: [[3, 0], 'e'] },
        jukebox([2, 0]),
      ]),
    );
    expect(by(checks, 'timer')!.ok).toBe(false);
  });
});

describe('Eingebettete Titel', () => {
  const embedded = {
    id: 'mein-thema',
    title: 'Mein Thema',
    bpm: 120,
    tracks: [{ voice: 'square', notes: 'c4:8 e4 g4 c5 g4 e4 c4 r' }],
  };

  it('lädt ein Level mit eingebettetem Titel', () => {
    const def = parseLevel(withNiche([jukebox([2, 1], [embedded])]));
    const el = def.floors[0]!.elements[0]!;
    expect(el.type).toBe('jukebox');
    const checks = validateLevel(withNiche([jukebox([2, 1], [embedded])]));
    for (const c of checks) expect(c.ok, c.key).toBe(true);
  });

  it('lehnt eine unlesbare Notenzeile ab – der Parser ist die Wahrheit', () => {
    expect(() =>
      parseLevel(withNiche([jukebox([2, 1], [{ ...embedded, tracks: [{ voice: 'square', notes: 'h4:8 zzz' }] }])])),
    ).toThrow();
  });

  it('mischt IDs und eingebettete Titel in einer Playlist', () => {
    const loaded = loadLevel(withNiche([jukebox([2, 1], ['ode', embedded, 'mars'])]));
    expect(loaded.world.jukeboxes[0]!.playlist).toHaveLength(3);
  });
});
