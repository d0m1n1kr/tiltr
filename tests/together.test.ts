// Gemeinsam ankommen (M90): die Timing-Regel des Rendezvous. Rein, deshalb
// hier prüfbar – im Browser wäre sie nur zu zweit zu sehen.

import { describe, expect, it } from 'vitest';
import { TOGETHER_GRACE_MS, partnerInGoal, partnerWaiting, togetherWin } from '../src/core/together';

describe('partnerInGoal', () => {
  it('die letzte Meldung gilt weiter – eine ausgefallene Nachricht beendet nichts', () => {
    expect(partnerInGoal(1000, 1000)).toBe(true);
    expect(partnerInGoal(1000, 1000 + TOGETHER_GRACE_MS - 1)).toBe(true);
    expect(partnerInGoal(1000, 1000 + TOGETHER_GRACE_MS)).toBe(false);
  });

  it('nie gemeldet (0) ist nicht „im Ziel" – auch nicht bei now = 0', () => {
    expect(partnerInGoal(0, 0)).toBe(false);
    expect(partnerInGoal(0, 500)).toBe(false);
  });
});

describe('togetherWin', () => {
  it('braucht BEIDE – einer allein im Ziel gewinnt nicht', () => {
    expect(togetherWin(true, 1000, 1100)).toBe(true);
    expect(togetherWin(false, 1000, 1100)).toBe(false);
    expect(togetherWin(true, 0, 1100)).toBe(false);
  });

  it('die Nachsicht ist einstellbar (Testmodus, kurze Fenster)', () => {
    expect(togetherWin(true, 1000, 1200, 100)).toBe(false);
    expect(togetherWin(true, 1000, 1050, 100)).toBe(true);
  });
});

describe('partnerWaiting', () => {
  it('gilt genau, solange er drin ist und ich nicht', () => {
    expect(partnerWaiting(false, 1000, 1100)).toBe(true);
    // Bin ich auch drin, ist es kein Warten mehr, sondern der Sieg.
    expect(partnerWaiting(true, 1000, 1100)).toBe(false);
    expect(partnerWaiting(false, 0, 1100)).toBe(false);
    expect(partnerWaiting(false, 1000, 1000 + TOGETHER_GRACE_MS)).toBe(false);
  });
});
