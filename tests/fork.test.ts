import { describe, expect, it } from 'vitest';
import { FORK_BEAT_MAX, FORK_BEAT_MIN, forkTone } from '../src/core/fork';

// Stimmgabel (M45): Ortung über die Schwebung – auf sie zu neigen lässt den
// Ton fast stehen, weg neigen lässt ihn flattern. Keine Richtung im Ohr,
// die Richtung steckt in der Tonhöhe.
describe('Stimmgabel', () => {
  it('genau auf die Gabel zu: minimale Schwebung, aim 1', () => {
    const t = forkTone(1, 0, 300, 0);
    expect(t.aim).toBeCloseTo(1, 6);
    expect(t.beatHz).toBeCloseTo(FORK_BEAT_MIN, 6);
  });
  it('genau weg: maximale Schwebung, aim 0', () => {
    const t = forkTone(-1, 0, 300, 0);
    expect(t.aim).toBeCloseTo(0, 6);
    expect(t.beatHz).toBeCloseTo(FORK_BEAT_MAX, 6);
  });
  it('quer: halbe Schwebung – und sie wächst monoton mit dem Winkel', () => {
    const q = forkTone(0, 1, 300, 0);
    expect(q.aim).toBeCloseTo(0.5, 6);
    let last = -1;
    for (let a = 0; a <= Math.PI; a += Math.PI / 12) {
      const t = forkTone(Math.cos(a), Math.sin(a), 1, 0);
      expect(t.beatHz).toBeGreaterThanOrEqual(last);
      last = t.beatHz;
    }
  });
  it('ohne Neigung gibt es keine Richtung: mittlere Schwebung als „sie ist da, such"', () => {
    const t = forkTone(0.02, 0.01, 300, 0);
    expect(t.aim).toBe(0.5);
    expect(t.beatHz).toBeCloseTo((FORK_BEAT_MIN + FORK_BEAT_MAX) / 2, 6);
  });
  it('Betrag der Neigung ändert die Schwebung nicht, nur die Richtung', () => {
    expect(forkTone(0.3, 0.3, 1, 1).beatHz).toBeCloseTo(forkTone(1, 1, 1, 1).beatHz, 6);
  });
});
