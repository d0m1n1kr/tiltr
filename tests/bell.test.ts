import { describe, expect, it } from 'vitest';
import { loadLevel } from '../src/levels/loader';
import { parseLevel } from '../src/levels/schema';

// Lockglocke (M46): Überrollen schlägt sie an, und solange sie klingt, laufen
// die Horcher zur Glocke statt zum Ball – Ablenken statt Vermeiden.
const level = () =>
  parseLevel({
    id: 'glocke',
    name: 'Glocke',
    pingBudget: 3,
    floors: [
      {
        size: [6, 2],
        maze: {
          seed: 1,
          carve: [[[0, 0], 'e'], [[1, 0], 'e'], [[2, 0], 'e'], [[3, 0], 'e'], [[4, 0], 'e'], [[0, 0], 's']],
        },
        elements: [
          { type: 'bell', cell: [1, 0], ringS: 2 },
          { type: 'listener', cell: [5, 0], speed: 100 },
        ],
        start: [0, 0],
        goal: [0, 1],
      },
    ],
  });

describe('Lockglocke', () => {
  it('klingt erst, wenn der Ball sie überrollt – als Kanten-Trigger, einmal je Überfahrt', () => {
    const { world } = loadLevel(level());
    const bell = world.bells[0]!;
    expect(bell.ringLeft).toBe(0);
    world.step(1 / 60, { x: 0, y: 0 });
    expect(world.consumeRings()).toEqual([]);
    // Ball auf die Glocke setzen
    world.ball.x = bell.x;
    world.ball.y = bell.y;
    world.step(1 / 60, { x: 0, y: 0 });
    expect(world.consumeRings()).toHaveLength(1);
    expect(bell.ringLeft).toBeGreaterThan(1.9);
    // Stehenbleiben schlägt nicht erneut an.
    world.step(1 / 60, { x: 0, y: 0 });
    expect(world.consumeRings()).toEqual([]);
  });

  it('solange sie klingt, läuft der Horcher zur Glocke – nicht zum rollenden Ball', () => {
    const { world } = loadLevel(level());
    const bell = world.bells[0]!;
    const l = world.listeners[0]!;
    // Ball rollt weit rechts neben dem Horcher – ohne Glocke würde er ihn jagen.
    world.ball.x = 450;
    world.ball.y = 50;
    world.ball.vx = 200;
    bell.ringLeft = 2;
    const x0 = l.x;
    for (let i = 0; i < 12; i++) world.step(1 / 60, { x: 0, y: 0 });
    expect(l.x).toBeLessThan(x0 - 10); // nach links, Richtung Glocke (x=150)
  });

  it('verklungen, jagt der Horcher wieder den Ball', () => {
    const { world } = loadLevel(level());
    const l = world.listeners[0]!;
    world.ball.x = 450;
    world.ball.y = 50;
    world.ball.vx = 200;
    const x0 = l.x;
    for (let i = 0; i < 12; i++) world.step(1 / 60, { x: 0, y: 0 });
    // Der Ball ist LINKS vom Horcher (450 < 550) und rollt: Jagd nach links.
    expect(l.x).toBeLessThan(x0);
    // Glocke klingt aus, wenn niemand sie anschlägt.
    const bell = world.bells[0]!;
    bell.ringLeft = 0.1;
    for (let i = 0; i < 12; i++) world.step(1 / 60, { x: 0, y: 0 });
    expect(bell.ringLeft).toBe(0);
  });
});

// M83 – ZU ZWEIT LÄUTET SIE FÜR BEIDE: Im Multiplayer hat jeder Spieler eine
// eigene Welt mit eigenen Horchern. Ohne Übertragung lockt die Glocke nur die
// eigenen, und „ich läute, du schleichst vorbei" gibt es nicht. Die Nachricht
// `bell` schlägt sie in der anderen Welt über `ringBellAt` an.
describe('Glocke über das Netz (M83)', () => {
  it('ringBellAt schlägt an, ohne Kanten-Trigger und ohne consumeRings', () => {
    const { world } = loadLevel(level());
    const bell = world.bells[0]!;
    expect(bell.ringLeft).toBe(0);
    expect(world.ringBellAt(0)).toBe(bell);
    expect(bell.ringLeft).toBe(bell.ringS);
    // Der Klang kommt aus der Nachricht, nicht aus der eigenen Welt: Die
    // Kugel steht hier nicht auf der Glocke.
    expect(world.consumeRings()).toEqual([]);
    expect(bell.inside).toBe(false);
    expect(world.ringBellAt(7)).toBeNull();
  });
  it('so angeschlagen lockt sie die Horcher genauso', () => {
    const { world } = loadLevel(level());
    const l = world.listeners[0]!;
    world.ball.x = 450;
    world.ball.y = 50;
    world.ball.vx = 200;
    world.ringBellAt(0);
    const x0 = l.x;
    for (let i = 0; i < 12; i++) world.step(1 / 60, { x: 0, y: 0 });
    expect(l.x).toBeLessThan(x0 - 10); // zur Glocke bei x=150, nicht zum Ball
  });
  it('advanceBells zählt den Nachklang ohne Ballschritt herunter', () => {
    const { world } = loadLevel(level());
    const bell = world.bells[0]!;
    world.ringBellAt(0);
    world.advanceBells(1);
    expect(bell.ringLeft).toBeCloseTo(bell.ringS - 1);
    world.advanceBells(5);
    expect(bell.ringLeft).toBe(0);
  });
  it('advanceListeners bewegt die Horcher ohne Ballschritt zur Glocke', () => {
    const { world } = loadLevel(level());
    const l = world.listeners[0]!;
    const x0 = l.x;
    world.ringBellAt(0);
    for (let i = 0; i < 12; i++) world.advanceListeners(1 / 60);
    expect(l.x).toBeLessThan(x0 - 10);
  });
});
