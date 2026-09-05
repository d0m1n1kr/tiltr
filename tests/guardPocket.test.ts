// STRÖMUNGS-NISCHE (M105): Zwei Strömungen, die über eine offene Kante
// aufeinander zeigen, klemmen die Kugel auf die Naht. Dort ist sie 50 von
// beiden Zellmitten entfernt, ein Wächter berührt ab 26 + 22 = 48 – die Naht
// ist ein sicherer Halt mitten in der Patrouille. Gemeldet: „wenn man zwei
// Strömungen auf eine Kante zeigen lässt und rechts und links ein Wächter
// läuft und man genau dazwischen auf der Kante steht, kommt man an den
// Wächtern vorbei."
//
// Erst die PHYSIK-PROBE (der Beweis darf nichts behaupten, was die Simulation
// nicht hält – Lektion M101), dann das Modell.
import { describe, expect, it } from 'vitest';
import { Ball, World } from '../src/core/physics';
import { BALL_R, CELL } from '../src/core/constants';
import { validateLevel, type CheckResult } from '../src/levels/validate';

const by = (checks: CheckResult[], key: string) => checks.find((c) => c.key === key);

describe('Strömungs-Nische – Physik', () => {
  it('klemmt die Kugel auf die Naht, und ein Wächter durch die Nachbarzelle fängt sie nicht', () => {
    // Zellen (1,2) → Ost und (2,2) → West: Naht bei x = 200.
    const w = new World([], new Ball(150, 250, BALL_R), { x: 900, y: 900, r: 30 });
    w.currents.push({ x: 100, y: 200, w: 100, h: 100, fx: 3400, fy: 0, dir: 'e' });
    w.currents.push({ x: 200, y: 200, w: 100, h: 100, fx: -3400, fy: 0, dir: 'w' });
    // Wächter läuft Spalte 1 auf und ab – mitten durch die Nischen-Zelle (1,2).
    w.guards.push({
      x: 150,
      y: 50,
      r: 26,
      speed: 90,
      waypoints: [
        { x: 150, y: 50 },
        { x: 150, y: 350 },
      ],
      target: 1,
      waitLeft: 0,
      dir: 1,
    });
    let caught = 0;
    let maxOff = 0;
    let minDist = Infinity;
    // 8 s: der Wächter kommt mehrmals vorbei; die Kugel liegt ohne Neigung da.
    for (let i = 0; i < 480; i++) {
      w.step(1 / 60, { x: 0, y: 0 });
      if (i > 30) maxOff = Math.max(maxOff, Math.abs(w.ball.x - 200));
      const g = w.guards[0]!;
      minDist = Math.min(minDist, Math.hypot(g.x - w.ball.x, g.y - w.ball.y));
      if (w.guardCaught()) caught++;
    }
    expect(maxOff).toBeLessThan(2); // auf der Naht, pendelt unter einem Pixel
    expect(minDist).toBeGreaterThanOrEqual(CELL / 2 - 2); // er kam bis auf ~50 heran …
    expect(caught).toBe(0); // … und hat sie nie berührt
  });

  it('ein dicker Wächter (r ≥ 28) erreicht die Naht – dann ist die Nische keine', () => {
    const w = new World([], new Ball(150, 250, BALL_R), { x: 900, y: 900, r: 30 });
    w.currents.push({ x: 100, y: 200, w: 100, h: 100, fx: 3400, fy: 0, dir: 'e' });
    w.currents.push({ x: 200, y: 200, w: 100, h: 100, fx: -3400, fy: 0, dir: 'w' });
    w.guards.push({ x: 150, y: 50, r: 30, speed: 90, waypoints: [{ x: 150, y: 50 }, { x: 150, y: 350 }], target: 1, waitLeft: 0, dir: 1 });
    let caught = 0;
    for (let i = 0; i < 480; i++) {
      w.step(1 / 60, { x: 0, y: 0 });
      if (w.guardCaught()) caught++;
    }
    expect(caught).toBeGreaterThan(0);
  });
});

/** Alle inneren Kanten öffnen – die Wände kommen dann über `add`. */
const carveAll = (cols: number, rows: number) => {
  const out: unknown[] = [];
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      if (x < cols - 1) out.push([[x, y], 'e']);
      if (y < rows - 1) out.push([[x, y], 's']);
    }
  return out;
};

/** Das gemeldete Bild: ein ZWEI Zellen breiter Gang (Spalten 1 und 2, Zeilen
 *  0–3) mit je einem Wächter in jeder Spalte. Hinein bei (0,0) → (1,0), hinaus
 *  bei (2,3) → (3,3). Alles andere ist zugemauert. */
const twoLanes = (opts: { pocket?: boolean; guardR?: number } = {}) => {
  const add: unknown[] = [];
  // Spalte 0 und 3 abtrennen, bis auf Ein- und Ausgang.
  for (let y = 0; y < 4; y++) {
    if (y !== 0) add.push([[0, y], 'e']);
    if (y !== 3) add.push([[2, y], 'e']);
    if (y < 3) add.push([[0, y], 's'], [[3, y], 's']);
  }
  const elements: unknown[] = [
    { type: 'guard', patrol: [[1, 0], [1, 3]], speed: 90, r: opts.guardR ?? 26 },
    { type: 'guard', patrol: [[2, 0], [2, 3]], speed: 90, r: opts.guardR ?? 26 },
  ];
  if (opts.pocket) elements.push({ type: 'current', cell: [1, 2], dir: 'e' }, { type: 'current', cell: [2, 2], dir: 'w' });
  return {
    id: 'custom-nische',
    name: 'Nische',
    pingBudget: 3,
    floors: [{ size: [4, 4], maze: { seed: 3, carve: carveAll(4, 4), add }, elements, start: [0, 0], goal: [3, 3] }],
  };
};

describe('Strömungs-Nische – Wächter-Beweis', () => {
  it('zwei offene Bahnen nebeneinander: ohne Nische schon passierbar (Bucht in der Nachbarbahn)', () => {
    const checks = validateLevel(twoLanes());
    expect(by(checks, 'goal')!.ok).toBe(true);
    expect(by(checks, 'guards')!.ok).toBe(true);
  });

  it('MIT Nische bleibt es passierbar – vor M105 wurde es ROT, weil aus einer Strömungszelle keine Wächter-Kante folgte', () => {
    // Das gemeldete Bild: Die Strömungen machen die Naht zum sicheren Halt, der
    // Beweis sah darin aber eine Sperre – die Strömung ließ nur den Weg in
    // Fließrichtung zu, und der führt in die Gegenströmung.
    const checks = validateLevel(twoLanes({ pocket: true }));
    // Das offene Modell kennt die Naht als Durchgang quer zum Strom …
    expect(by(checks, 'goal')!.ok).toBe(true);
    // … und der Wächter-Beweis als sicheren Halt.
    const g = by(checks, 'guards')!;
    expect(g.ok, g.detail).toBe(true);
  });

  it('eine Nische in einem Wandfenster ohne Ausgang längs der Naht ist eine FALLE – das Ziel bleibt rot', () => {
    // Spalten 1 und 2 durch eine Wand getrennt, offen nur an der Nischen-Kante:
    // Die Kugel klemmt auf der Naht und kommt nie wieder weg (beide Ströme sind
    // stärker als die Neigung, längs der Naht steht die Wand). Das offene Modell
    // darf hier KEINEN Durchgang behaupten.
    const def = twoLanes({ pocket: true });
    const add = def.floors[0]!.maze.add as unknown[];
    for (const y of [0, 1, 3]) add.push([[1, y], 'e']);
    const checks = validateLevel(def);
    expect(by(checks, 'goal')!.ok).toBe(false);
  });

  it('läuft die Patrouille selbst über die Naht, ist sie kein Halt (der Wächter kreuzt sie)', () => {
    // Ein-Zellen-Gang in Zeile 0 von (0,0) nach (3,0); Wächter (1,0)–(2,0),
    // Strömungen (1,0) → Ost und (2,0) → West: Der Wächter läuft mitten durch
    // die Naht. Ohne die Ausnahme sähe das Modell hier einen Halt.
    const def = {
      id: 'custom-kreuz',
      name: 'Kreuz',
      pingBudget: 3,
      floors: [
        {
          size: [4, 2],
          maze: { seed: 3, carve: carveAll(4, 2), add: [0, 1, 2, 3].map((x) => [[x, 0], 's']) },
          elements: [
            { type: 'guard', patrol: [[1, 0], [2, 0]], speed: 90 },
            { type: 'current', cell: [1, 0], dir: 'e' },
            { type: 'current', cell: [2, 0], dir: 'w' },
          ],
          start: [0, 0],
          goal: [3, 0],
        },
      ],
    };
    const checks = validateLevel(def);
    expect(by(checks, 'guards')!.ok).toBe(false);
  });
});
