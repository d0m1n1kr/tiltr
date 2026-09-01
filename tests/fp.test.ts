// First-Person-Kern (M23): Vorzeichen-Matrix, Lenkkurve, Drehraten-Glättung
// und Heading-Integration. FP ist eine reine Transformation vor der Physik –
// alles hier ist deterministisch und DOM-frei.

import { describe, expect, it } from 'vitest';
import {
  FP_MAX_TURN,
  FP_TURN_SMOOTH_S,
  fpInitial,
  fpStep,
  headingVector,
  normalizeAngle,
  turnCurve,
  type FpState,
} from '../src/core/fp';

/** Manöver fahren: konstante Neigung über eine Dauer in kleinen Schritten. */
function drive(state: FpState, tilt: { x: number; y: number }, seconds: number, dt = 1 / 120): FpState {
  let s: FpState = state;
  for (let t = 0; t < seconds - 1e-9; t += dt) s = fpStep(s, tilt, dt);
  return s;
}

describe('Vorzeichen-Matrix (die Verträge der Draufsicht)', () => {
  it('heading 0: nach vorn gekippt rollt nach Welt-oben', () => {
    const r = fpStep(fpInitial(), { x: 0, y: -1 }, 1 / 60);
    expect(r.worldTilt.x).toBeCloseTo(0, 6);
    expect(r.worldTilt.y).toBeCloseTo(-1, 6);
  });

  it('heading 0: steiler gestellt rollt rückwärts (Welt-unten)', () => {
    const r = fpStep(fpInitial(), { x: 0, y: 1 }, 1 / 60);
    expect(r.worldTilt.y).toBeCloseTo(1, 6);
  });

  it('heading 90° (rechts gedreht): vorwärts = Welt-rechts', () => {
    const r = fpStep({ heading: Math.PI / 2, turnRate: 0 }, { x: 0, y: -1 }, 1e-9);
    expect(r.worldTilt.x).toBeCloseTo(1, 5);
    expect(r.worldTilt.y).toBeCloseTo(0, 5);
  });

  it('heading 180°: vorwärts = Welt-unten; heading -90°: vorwärts = Welt-links', () => {
    const south = fpStep({ heading: Math.PI, turnRate: 0 }, { x: 0, y: -1 }, 1e-9);
    expect(south.worldTilt.y).toBeCloseTo(1, 5);
    const west = fpStep({ heading: -Math.PI / 2, turnRate: 0 }, { x: 0, y: -1 }, 1e-9);
    expect(west.worldTilt.x).toBeCloseTo(-1, 5);
  });

  it('Lenkrad nach rechts dreht rechtsherum (Heading wächst)', () => {
    const s = drive(fpInitial(), { x: 1, y: 0 }, 0.5);
    expect(s.heading).toBeGreaterThan(0.3);
    const l = drive(fpInitial(), { x: -1, y: 0 }, 0.5);
    expect(l.heading).toBeLessThan(-0.3);
  });

  it('kein Strafen: tilt.x erzeugt keinerlei Schub', () => {
    const r = fpStep(fpInitial(), { x: 1, y: 0 }, 1 / 60);
    expect(Math.hypot(r.worldTilt.x, r.worldTilt.y)).toBe(0);
  });

  it('Schubstärke bleibt erhalten und gedeckelt (|worldTilt| = |tilt.y| ≤ 1)', () => {
    const half = fpStep({ heading: 0.7, turnRate: 0 }, { x: 0, y: -0.5 }, 1e-9);
    expect(Math.hypot(half.worldTilt.x, half.worldTilt.y)).toBeCloseTo(0.5, 6);
    const over = fpStep(fpInitial(), { x: 0, y: -3 }, 1e-9);
    expect(Math.hypot(over.worldTilt.x, over.worldTilt.y)).toBeCloseTo(1, 6);
  });
});

describe('Lenkkurve & Drehrate', () => {
  it('turnCurve: quadratisch, vorzeichenerhaltend, geklemmt', () => {
    expect(turnCurve(0.5)).toBeCloseTo(0.25, 6);
    expect(turnCurve(-0.5)).toBeCloseTo(-0.25, 6);
    expect(turnCurve(2)).toBe(1);
    expect(turnCurve(0)).toBe(0);
  });

  it('die Drehrate überschreitet FP_MAX_TURN nie', () => {
    let s: FpState = fpInitial();
    for (let i = 0; i < 600; i++) {
      s = fpStep(s, { x: 1, y: 0 }, 1 / 60);
      expect(Math.abs(s.turnRate)).toBeLessThanOrEqual(FP_MAX_TURN + 1e-9);
    }
    expect(s.turnRate).toBeCloseTo(FP_MAX_TURN, 2);
  });

  it('volle Fahrt: nach 1 s Volleinschlag ist das Heading nahe FP_MAX_TURN·1s', () => {
    const s = drive(fpInitial(), { x: 1, y: 0 }, 1);
    // Anlaufverlust durch die Glättung ≈ FP_TURN_SMOOTH_S · MAX_TURN
    expect(s.heading).toBeGreaterThan(FP_MAX_TURN * (1 - 2 * FP_TURN_SMOOTH_S));
    expect(s.heading).toBeLessThan(FP_MAX_TURN);
  });
});

describe('Glättung (die Kamera hängt am selben Heading)', () => {
  it('die Drehrate springt nicht: ein Frame Volleinschlag hebt sie nur anteilig', () => {
    const r = fpStep(fpInitial(), { x: 1, y: 0 }, 1 / 60);
    const expected = FP_MAX_TURN * (1 - Math.exp(-(1 / 60) / FP_TURN_SMOOTH_S));
    expect(r.turnRate).toBeCloseTo(expected, 6);
    expect(r.turnRate).toBeLessThan(FP_MAX_TURN * 0.25);
  });

  it('Loslassen klingt aus statt abzureißen', () => {
    let s = drive(fpInitial(), { x: 1, y: 0 }, 1);
    const atRelease = s.turnRate;
    s = fpStep(s, { x: 0, y: 0 }, 1 / 60);
    expect(s.turnRate).toBeGreaterThan(0);
    expect(s.turnRate).toBeLessThan(atRelease);
    // Nach ~5 Zeitkonstanten ist Ruhe.
    s = drive(s, { x: 0, y: 0 }, FP_TURN_SMOOTH_S * 5);
    expect(Math.abs(s.turnRate)).toBeLessThan(0.03);
  });

  it('dt-unabhängig: 60 Hz und 120 Hz landen (nahezu) beim selben Heading', () => {
    const a = drive(fpInitial(), { x: 0.8, y: 0 }, 1, 1 / 60);
    const b = drive(fpInitial(), { x: 0.8, y: 0 }, 1, 1 / 120);
    expect(Math.abs(a.heading - b.heading)).toBeLessThan(0.02);
  });
});

describe('Winkel-Haushalt', () => {
  it('normalizeAngle hält (-π, π] und lässt kleine Winkel unangetastet', () => {
    expect(normalizeAngle(0.5)).toBeCloseTo(0.5, 9);
    expect(normalizeAngle(Math.PI * 3)).toBeCloseTo(Math.PI, 9);
    expect(normalizeAngle(-Math.PI)).toBeCloseTo(Math.PI, 9);
    expect(normalizeAngle(Math.PI * 2.5)).toBeCloseTo(Math.PI / 2, 9);
    expect(normalizeAngle(-Math.PI * 2.5)).toBeCloseTo(-Math.PI / 2, 9);
  });

  it('Heading bleibt beim Dauerdrehen normalisiert (kein Float-Weglaufen)', () => {
    const s = drive(fpInitial(), { x: 1, y: 0 }, 10);
    expect(Math.abs(s.heading)).toBeLessThanOrEqual(Math.PI);
  });

  it('headingVector: Norden ist oben, Osten rechts, Länge 1', () => {
    expect(headingVector(0)).toEqual({ x: 0, y: -1 });
    const east = headingVector(Math.PI / 2);
    expect(east.x).toBeCloseTo(1, 9);
    expect(east.y).toBeCloseTo(0, 9);
    for (const h of [0.3, 1.1, 2.8, -2.2]) {
      const v = headingVector(h);
      expect(Math.hypot(v.x, v.y)).toBeCloseTo(1, 9);
    }
  });
});
