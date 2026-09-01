// Der Partner ist ein SCHEIN, kein Objekt. Das ist eine Design-Entscheidung
// mit Zahlen dahinter, deshalb hier festgenagelt: weiche Lichtschichten
// (kein gezeichneter Rand), außen weiter und blasser als innen, und alles
// UNTER dem Ball-Glow – der Ball ist der einzige feste Körper im Bild.

import { describe, expect, it } from 'vitest';
import { BALL_CORE_ALPHA, haloLayers } from '../src/render/renderer';

const layers = (over: Partial<Parameters<typeof haloLayers>[0]> = {}) =>
  haloLayers({ radiusPx: 16, alphaScale: 1, pulse01: 0.5, offscreen: false, ...over });

describe('haloLayers (Partner-Schein)', () => {
  it('liefert zwei Schichten: außen weit und blass, innen kompakt und heller', () => {
    const [outer, inner] = layers();
    expect(outer!.r).toBeGreaterThan(inner!.r);
    expect(inner!.alpha).toBeGreaterThan(outer!.alpha);
    expect(outer!.alpha).toBeGreaterThan(0);
  });

  it('bleibt in jeder Lage schwächer als der Ball-Glow', () => {
    // Der helle Extremfall: am Rand, voller Atem, voller Alpha-Faktor.
    const worst = layers({ offscreen: true, pulse01: 1 });
    for (const l of worst) expect(l.alpha).toBeLessThan(BALL_CORE_ALPHA);
  });

  it('atmet, ohne zu blinken: der Puls ändert das Alpha nur sanft', () => {
    const low = layers({ pulse01: 0 })[1]!.alpha;
    const high = layers({ pulse01: 1 })[1]!.alpha;
    expect(high).toBeGreaterThan(low);
    // Höchstens ein Drittel Unterschied – ein Schein, der lebt, aber nicht ruft.
    expect(high / low).toBeLessThan(1.4);
  });

  it('wird am Rand kompakter UND kräftiger (sonst findet man ihn nicht)', () => {
    const on = layers();
    const off = layers({ offscreen: true });
    expect(off[0]!.r).toBeLessThan(on[0]!.r);
    expect(off[1]!.alpha).toBeGreaterThan(on[1]!.alpha);
    expect(off[1]!.alpha).toBeLessThan(BALL_CORE_ALPHA);
  });

  it('skaliert linear mit alphaScale – der Geist ist derselbe Schein, nur blasser', () => {
    const full = layers();
    const faint = layers({ alphaScale: 0.45 });
    for (let i = 0; i < full.length; i++) {
      expect(faint[i]!.alpha).toBeCloseTo(full[i]!.alpha * 0.45, 6);
      expect(faint[i]!.r).toBe(full[i]!.r);
    }
  });

  it('skaliert die Radien mit der Basisgröße', () => {
    const small = layers({ radiusPx: 8 });
    const big = layers({ radiusPx: 16 });
    expect(big[0]!.r).toBeCloseTo(small[0]!.r * 2, 6);
    expect(big[1]!.alpha).toBeCloseTo(small[1]!.alpha, 6);
  });
});
