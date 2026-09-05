// ZEHRFELD (M102): ein Feld, das Echo-Pings frisst. Gewünscht als Mittel, eine
// ABKÜRZUNG zu bestrafen – der kurze Weg kostet dann nicht Zeit, sondern Sicht.
//
// Die Physik BUCHT nichts: Der Ping-Vorrat gehört der Runde (app.ts), nicht
// der Welt. Sie meldet nur, was fällig ist – geprüft wird hier genau diese
// Meldung, plus dass der Preis die Def überlebt.
import { describe, expect, it } from 'vitest';
import { Ball, World } from '../src/core/physics';
import { parseLevel } from '../src/levels/schema';
import { loadLevel } from '../src/levels/loader';
import { validateLevel } from '../src/levels/validate';
import { levelFeatures } from '../src/levels/firstAppearances';

const world = (): World => {
  const w = new World([], new Ball(50, 50, 22), { x: 900, y: 900, r: 30 });
  w.drains.push({ x: 300, y: 50, r: 38, cost: 2, inside: false });
  return w;
};

describe('Zehrfeld (M102)', () => {
  it('meldet beim BETRETEN genau einmal – nicht in jedem Bild', () => {
    const w = world();
    expect(w.consumeDrains()).toHaveLength(0);
    w.ball.x = 300;
    w.step(1 / 60, { x: 0, y: 0 });
    const hit = w.consumeDrains();
    expect(hit).toHaveLength(1);
    expect(hit[0]!.cost).toBe(2);
    // Zweites Bild, immer noch drauf: keine zweite Rechnung.
    w.step(1 / 60, { x: 0, y: 0 });
    expect(w.consumeDrains()).toHaveLength(0);
  });

  it('wer wieder hinüberrollt, zahlt wieder – es ist ein Zoll, keine Falle', () => {
    const w = world();
    w.ball.x = 300;
    w.step(1 / 60, { x: 0, y: 0 });
    expect(w.consumeDrains()).toHaveLength(1);
    w.ball.x = 50; // hinaus …
    w.step(1 / 60, { x: 0, y: 0 });
    expect(w.consumeDrains()).toHaveLength(0);
    w.ball.x = 300; // … und wieder hinein
    w.step(1 / 60, { x: 0, y: 0 });
    expect(w.consumeDrains()).toHaveLength(1);
  });

  it('daneben passiert nichts', () => {
    const w = world();
    w.ball.x = 200;
    w.step(1 / 60, { x: 0, y: 0 });
    expect(w.consumeDrains()).toHaveLength(0);
  });

  const def = (extra: Record<string, unknown> = {}) =>
    parseLevel({
      id: 'custom-drain',
      name: 'Zehrfeld',
      floors: [
        {
          size: [4, 2],
          maze: {
            seed: 3,
            carve: [0, 1, 2].map((x) => [[x, 0], 'e']),
            add: [0, 1, 2, 3].map((x) => [[x, 0], 's']),
          },
          elements: [{ type: 'drain', cell: [2, 0], ...extra }],
          start: [0, 0],
          goal: [3, 0],
        },
      ],
    });

  it('Def → Welt: der Preis kommt an, Vorgabe ist 1', () => {
    expect(loadLevel(def()).floors[0]!.world.drains[0]!.cost).toBe(1);
    expect(loadLevel(def({ cost: 4 })).floors[0]!.world.drains[0]!.cost).toBe(4);
  });

  it('ein Preis unter 1 oder über 9 lädt nicht – die Ziffer muss auf das Feld passen', () => {
    expect(() => def({ cost: 0 })).toThrow();
    expect(() => def({ cost: 10 })).toThrow();
    expect(() => def({ cost: 1.5 })).toThrow();
  });

  it('die Lösbarkeit hängt NICHT daran: ein Zehrfeld sperrt nichts', () => {
    // Pings sind nie Pflicht (es gibt den Blind-Stern) – ein Feld, das sie
    // kostet, ist Schwierigkeit, kein Riegel. Kein Beweis ändert sich.
    expect(validateLevel(def({ cost: 9 })).filter((c) => !c.ok)).toEqual([]);
  });

  it('zählt als eigenes Merkmal fürs Aufleuchten', () => {
    expect(levelFeatures(def()).has('drain')).toBe(true);
  });
});
