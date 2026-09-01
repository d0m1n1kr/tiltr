// Atem-Zyklus: die Uhr hinter atmenden Löchern, Schiebewänden UND der
// Play-Vorschau des Editors. Weil jetzt drei Aufrufer daran hängen, sind die
// Phasengrenzen hier festgenagelt – ein Vorzeichenfehler wäre sonst erst im
// Level zu sehen.

import { describe, expect, it } from 'vitest';
import { breathAt, breathOpenRemaining, breathPeriod, type BreathCycle } from '../src/core/breathing';

const C: BreathCycle = { open: 2, closed: 3, ramp: 0.5, offset: 0 };

describe('breathPeriod', () => {
  it('summiert beide Rampen, offen und zu', () => {
    expect(breathPeriod(C)).toBeCloseTo(6, 9);
  });
});

describe('breathAt', () => {
  it('durchläuft die vier Phasen in der richtigen Reihenfolge', () => {
    expect(breathAt(C, 0)).toEqual({ openness: 0, state: 'opening' });
    expect(breathAt(C, 0.25).state).toBe('opening');
    expect(breathAt(C, 0.25).openness).toBeCloseTo(0.5, 9);
    expect(breathAt(C, 1)).toEqual({ openness: 1, state: 'open' });
    expect(breathAt(C, 2.75).state).toBe('closing');
    expect(breathAt(C, 2.75).openness).toBeCloseTo(0.5, 9);
    expect(breathAt(C, 3.5)).toEqual({ openness: 0, state: 'closed' });
  });

  it('hält die Rampen linear und die Grenzen exakt', () => {
    expect(breathAt(C, 0.499).openness).toBeCloseTo(0.998, 3);
    expect(breathAt(C, 0.5)).toEqual({ openness: 1, state: 'open' });
    expect(breathAt(C, 2.5).openness).toBeCloseTo(1, 9); // erster Moment des Schließens
    expect(breathAt(C, 2.999).openness).toBeCloseTo(0.002, 3);
    expect(breathAt(C, 3)).toEqual({ openness: 0, state: 'closed' });
  });

  it('wiederholt sich mit der Periode', () => {
    const p = breathPeriod(C);
    for (const tS of [0, 0.3, 1.4, 2.7, 4.9]) {
      const late = breathAt(C, tS + p * 5);
      const early = breathAt(C, tS);
      expect(late.state, `t=${tS}`).toBe(early.state);
      // Nur bis auf Float-Rauschen: fünf Perioden später ist die Summe
      // größer, die Phase aber dieselbe.
      expect(late.openness, `t=${tS}`).toBeCloseTo(early.openness, 9);
    }
  });

  it('verschiebt die Phase über offset', () => {
    const shifted: BreathCycle = { ...C, offset: 0.5 };
    // offset 0,5 bringt den Zyklus dorthin, wo er ohne offset nach 0,5 s ist.
    expect(breathAt(shifted, 0)).toEqual(breathAt(C, 0.5));
    expect(breathAt(shifted, 2)).toEqual(breathAt(C, 2.5));
  });

  it('verträgt negative Zeiten (Editor darf zurückspulen)', () => {
    const p = breathPeriod(C);
    expect(breathAt(C, -1)).toEqual(breathAt(C, p - 1));
    expect(breathAt(C, -p * 3 + 1)).toEqual(breathAt(C, 1));
  });

  it('bleibt bei jedem Zyklus in [0,1]', () => {
    const wild: BreathCycle = { open: 0.4, closed: 0.1, ramp: 1.7, offset: 3.3 };
    for (let tS = 0; tS < 20; tS += 0.017) {
      const { openness } = breathAt(wild, tS);
      expect(openness).toBeGreaterThanOrEqual(0);
      expect(openness).toBeLessThanOrEqual(1);
    }
  });

  it('ist ohne Zu-Zeit dauerhaft in Bewegung, ohne Offen-Zeit nie ganz offen lange', () => {
    const noClosed: BreathCycle = { open: 1, closed: 0.001, ramp: 0.5, offset: 0 };
    // Es gibt einen Moment 'closed', aber er ist kürzer als ein Frame.
    expect(breathAt(noClosed, 2.0005).state).toBe('closed');
    expect(breathAt(noClosed, 0.75).state).toBe('open');
  });
});

describe('breathOpenRemaining (Warn-Takt der Schiebewand)', () => {
  it('zählt die Restzeit im Zustand offen herunter', () => {
    expect(breathOpenRemaining(C, 0.5)).toBeCloseTo(2, 9);
    expect(breathOpenRemaining(C, 1.5)).toBeCloseTo(1, 9);
    expect(breathOpenRemaining(C, 2.4)).toBeCloseTo(0.1, 9);
  });

  it('ist 0 außerhalb der Offen-Phase', () => {
    expect(breathOpenRemaining(C, 0.2)).toBe(0); // öffnet noch
    expect(breathOpenRemaining(C, 2.7)).toBe(0); // schließt
    expect(breathOpenRemaining(C, 4)).toBe(0); // zu
  });

  it('passt zur Phase: solange Rest > 0, ist der Zustand offen', () => {
    for (let tS = 0; tS < 12; tS += 0.05) {
      const rest = breathOpenRemaining(C, tS);
      if (rest > 0) expect(breathAt(C, tS).state).toBe('open');
    }
  });
});
