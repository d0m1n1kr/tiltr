// Duett (M91): die Klang-Rechnung des Resonanz-Tors. Rein, also hier prüfbar –
// im Spiel braucht sie zwei Spieler und zwei Ohren.

import { describe, expect, it } from 'vitest';
import {
  FIFTH_CENTS,
  RESONANCE_FORCE,
  RESONANCE_HZ,
  TUNE_HOLD_MS,
  centsToHz,
  holdTuned,
  inTune,
  pitchFromTilt,
  tuneAim,
} from '../src/core/resonance';
import { levelSchema } from '../src/levels/schema';

describe('pitchFromTilt', () => {
  it('Norden ist der Grundton, Süden die Quinte, Ost und West die Mitte', () => {
    expect(pitchFromTilt(0, -1).cents).toBeCloseTo(0, 5);
    expect(pitchFromTilt(0, 1).cents).toBeCloseTo(FIFTH_CENTS, 5);
    expect(pitchFromTilt(1, 0).cents).toBeCloseTo(FIFTH_CENTS / 2, 5);
    expect(pitchFromTilt(-1, 0).cents).toBeCloseTo(FIFTH_CENTS / 2, 5);
  });

  it('nur die RICHTUNG zählt, nicht die Stärke', () => {
    expect(pitchFromTilt(0.2, 0.2).cents).toBeCloseTo(pitchFromTilt(0.9, 0.9).cents, 5);
  });

  it('ist überall stetig – auch dort, wo ein Kreis eine Naht hätte', () => {
    // Kurz vor und kurz hinter „genau nach unten": derselbe Ton, kein Sprung.
    const left = pitchFromTilt(-0.02, 1).cents;
    const right = pitchFromTilt(0.02, 1).cents;
    expect(Math.abs(left - right)).toBeLessThan(10);
    expect(left).toBeGreaterThan(FIFTH_CENTS - 15);
  });

  it('ohne Neigung klingt der Grundton (Deadzone)', () => {
    expect(pitchFromTilt(0, 0)).toEqual({ cents: 0, hz: RESONANCE_HZ });
    expect(pitchFromTilt(0.05, 0.02).cents).toBe(0);
  });

  it('Cent rechnen in Hz: die Quinte ist das 1,5-fache', () => {
    expect(centsToHz(FIFTH_CENTS) / RESONANCE_HZ).toBeCloseTo(1.5, 3);
    expect(centsToHz(1200)).toBeCloseTo(2 * RESONANCE_HZ, 5);
  });
});

describe('inTune', () => {
  it('Einklang: dieselbe Höhe, Toleranz 25 Cent', () => {
    expect(inTune(300, 300, 'unison')).toBe(true);
    expect(inTune(300, 320, 'unison')).toBe(true);
    expect(inTune(300, 340, 'unison')).toBe(false);
  });

  it('Quinte: der Abstand gilt in BEIDE Richtungen (wer oben steht, ist eine Rolle)', () => {
    expect(inTune(0, FIFTH_CENTS, 'fifth')).toBe(true);
    expect(inTune(FIFTH_CENTS, 0, 'fifth')).toBe(true);
    expect(inTune(100, 100 + FIFTH_CENTS, 'fifth')).toBe(true);
    expect(inTune(0, 0, 'fifth')).toBe(false);
    expect(inTune(0, FIFTH_CENTS - 40, 'fifth')).toBe(false);
  });

  it('aus der Neigung heraus: beide nach oben = Einklang, einer runter = Quinte', () => {
    const up = pitchFromTilt(0, -1).cents;
    const down = pitchFromTilt(0, 1).cents;
    expect(inTune(up, up, 'unison')).toBe(true);
    expect(inTune(up, down, 'fifth')).toBe(true);
    expect(inTune(up, down, 'unison')).toBe(false);
  });
});

describe('tuneAim', () => {
  it('1 im Intervall, fällt mit dem Abstand auf 0', () => {
    expect(tuneAim(300, 300, 'unison')).toBe(1);
    expect(tuneAim(0, FIFTH_CENTS, 'fifth')).toBe(1);
    const near = tuneAim(300, 380, 'unison');
    expect(near).toBeGreaterThan(0);
    expect(near).toBeLessThan(1);
    expect(tuneAim(0, 600, 'unison')).toBe(0);
  });
});

describe('holdTuned', () => {
  it('das Tor geht erst auf, wenn der Ton STEHT', () => {
    const a = holdTuned(null, true, 1000);
    expect(a).toEqual({ since: 1000, open: false });
    expect(holdTuned(a.since, true, 1000 + TUNE_HOLD_MS - 1).open).toBe(false);
    expect(holdTuned(a.since, true, 1000 + TUNE_HOLD_MS).open).toBe(true);
  });

  it('Danebenrutschen setzt zurück – ein Durchwischen öffnet nichts', () => {
    const b = holdTuned(1000, false, 1200);
    expect(b).toEqual({ since: null, open: false });
    // Und danach beginnt die Wartezeit von vorn.
    expect(holdTuned(b.since, true, 1300)).toEqual({ since: 1300, open: false });
  });
});

describe('Die Schale ist keine Falle', () => {
  it('der Sog bleibt unter der Neigungs-Beschleunigung (wie beim Anker, M32)', () => {
    // Dieselbe Schranke, die das Schema dem Sog-Anker setzt (force <= 2400).
    const anchor = levelSchema.safeParse({
      id: 'x',
      name: 'x',
      floors: [
        {
          size: [3, 3],
          maze: { seed: 1 },
          start: [0, 0],
          goal: [2, 2],
          elements: [{ type: 'anchor', cell: [1, 1], force: RESONANCE_FORCE }],
        },
      ],
    });
    expect(anchor.success).toBe(true);
    expect(RESONANCE_FORCE).toBeLessThan(2600);
  });
});
