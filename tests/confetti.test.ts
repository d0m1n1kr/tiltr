// Konfetti-Partikelmodell: rein, geseedet und damit prüfbar, ohne Pixel zu
// lesen. Festgenagelt sind die Dinge, die man sonst erst am Gerät sieht:
// Die Salve kommt aus den unteren ECKEN und fliegt nach OBEN-INNEN, die
// Schwerkraft holt sie zurück, und aufgeräumt wird von selbst.

import { describe, expect, it } from 'vitest';
import { GRAVITY, spawnConfetti, stepConfetti, type Piece } from '../src/ui/confetti';

const W = 400;
const H = 800;
const salvo = (seed = 7, n = 60): Piece[] => spawnConfetti(seed, n, W, H);

/** Salve über eine Dauer fliegen lassen (kleine Schritte wie echte Frames). */
function fly(pieces: Piece[], seconds: number, dt = 1 / 60): Piece[] {
  let live = pieces;
  for (let t = 0; t < seconds - 1e-9; t += dt) live = stepConfetti(live, dt, H);
  return live;
}

describe('spawnConfetti', () => {
  it('erzeugt die gewünschte Zahl Schnipsel', () => {
    expect(salvo(1, 40)).toHaveLength(40);
  });

  it('schießt aus den unteren ECKEN, nicht aus der Mitte', () => {
    for (const p of salvo()) {
      expect(p.y).toBeGreaterThan(H * 0.9);
      const atEdge = p.x < W * 0.1 || p.x > W * 0.9;
      expect(atEdge, `x=${p.x}`).toBe(true);
    }
  });

  it('nutzt beide Kanonen etwa gleich', () => {
    const left = salvo(3, 60).filter((p) => p.x < W / 2).length;
    expect(left).toBe(30);
  });

  it('fliegt nach OBEN und zur Bildmitte hin', () => {
    for (const p of salvo()) {
      expect(p.vy, 'nach oben').toBeLessThan(0);
      // Linke Kanone nach rechts, rechte nach links.
      if (p.x < W / 2) expect(p.vx).toBeGreaterThan(0);
      else expect(p.vx).toBeLessThan(0);
    }
  });

  it('streut Farben aus der Weltpalette, nicht eine einzige', () => {
    const colors = new Set(salvo(5, 80).map((p) => p.color));
    expect(colors.size).toBeGreaterThan(3);
  });

  it('ist deterministisch: gleicher Seed, gleiche Salve', () => {
    expect(salvo(42)).toEqual(salvo(42));
    expect(salvo(42)).not.toEqual(salvo(43));
  });
});

describe('stepConfetti', () => {
  it('holt die Schnipsel mit Schwerkraft zurück', () => {
    const p: Piece = { ...salvo(9, 2)[0]!, vx: 0, vy: -600, x: 200, y: 400, wobble: 0, spin: 0 };
    const up = stepConfetti([{ ...p }], 0.1, H)[0]!;
    expect(up.y).toBeLessThan(400); // steigt noch
    const later = fly([{ ...p }], 1.2)[0];
    expect(later === undefined || later.y > 400).toBe(true); // fällt wieder
  });

  it('bremst die Geschwindigkeit (Luftwiderstand), statt sie zu behalten', () => {
    // Oben ansetzen: Unten am Spawn-Punkt wäre es nach 0,5 s aus dem Bild.
    const p: Piece = { ...salvo(11, 2)[0]!, x: 200, y: 100, vx: 800, vy: 0, spin: 0, wobble: 0, life: 99 };
    const after = stepConfetti([{ ...p }], 0.5, H)[0]!;
    expect(after.vx).toBeLessThan(800);
    expect(after.vx).toBeGreaterThan(0);
  });

  it('dreht die Schnipsel', () => {
    const p: Piece = { ...salvo(13, 2)[0]!, rot: 0, spin: 6, life: 99 };
    expect(stepConfetti([{ ...p }], 0.5, H)[0]!.rot).toBeCloseTo(3, 5);
  });

  it('räumt sich selbst auf: nach ein paar Sekunden ist nichts mehr da', () => {
    expect(fly(salvo(17, 80), 6)).toHaveLength(0);
  });

  it('wirft Schnipsel weg, die unter dem Bild sind', () => {
    const p: Piece = { ...salvo(19, 2)[0]!, x: 100, y: H + 50, vx: 0, vy: 100, life: 99 };
    expect(stepConfetti([p], 0.016, H)).toHaveLength(0);
  });

  it('wirft abgelaufene Schnipsel weg, auch wenn sie noch im Bild sind', () => {
    const p: Piece = { ...salvo(23, 2)[0]!, x: 100, y: 100, vx: 0, vy: 0, life: 0.01 };
    expect(stepConfetti([p], 0.05, H)).toHaveLength(0);
  });

  it('ist dt-unabhängig: 60 Hz und 240 Hz landen fast gleich', () => {
    const a = fly(salvo(29, 1), 0.5, 1 / 60)[0]!;
    const b = fly(salvo(29, 1), 0.5, 1 / 240)[0]!;
    expect(Math.abs(a.y - b.y)).toBeLessThan(12);
    expect(Math.abs(a.x - b.x)).toBeLessThan(12);
  });

  it('hält die Schwerkraft als benannte Konstante (kein Magic Value)', () => {
    const p: Piece = { ...salvo(31, 2)[0]!, vx: 0, vy: 0, x: 200, y: 100, wobble: 0, life: 99 };
    // Ohne Anfangstempo ist der erste Schritt reine Schwerkraft.
    const after = stepConfetti([{ ...p }], 0.01, H)[0]!;
    expect(after.vy).toBeCloseTo(GRAVITY * 0.01, 1);
  });
});
