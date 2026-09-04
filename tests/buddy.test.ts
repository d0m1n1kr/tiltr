// Partner-Klang (M88): die Kurve, die „wo bist du?" beantwortet.
//
// Zwei Anteile mit Absicht: NÄHE trägt den Grundton (ruhend findet man ihn),
// BEWEGUNG den Rollanteil (rollend verrät er sich). Stillstand ist damit
// Tarnung, ohne dass der Partner je ganz verschwindet.

import { describe, expect, it } from 'vitest';
import { BUDDY_HEAR, BUDDY_ROLL_FULL, buddySound, smoothSpeed } from '../src/core/buddy';

const MAX = 900; // World.maxSpeed

describe('buddySound', () => {
  it('Nähe: daneben 1, auf halber Hörweite 0,5, jenseits 0', () => {
    expect(buddySound(0, 0, MAX).closeness).toBe(1);
    expect(buddySound(BUDDY_HEAR / 2, 0, MAX).closeness).toBeCloseTo(0.5, 5);
    expect(buddySound(BUDDY_HEAR, 0, MAX).closeness).toBe(0);
    expect(buddySound(BUDDY_HEAR * 3, 0, MAX).closeness).toBe(0);
  });

  it('ein ruhender Partner ist HÖRBAR, aber ohne Rollanteil', () => {
    const s = buddySound(100, 0, MAX);
    expect(s.closeness).toBeGreaterThan(0.7);
    expect(s.moving).toBe(0);
  });

  it('Rollanteil wächst mit der Geschwindigkeit und sättigt', () => {
    const slow = buddySound(0, MAX * 0.15, MAX).moving;
    const mid = buddySound(0, MAX * 0.3, MAX).moving;
    expect(slow).toBeGreaterThan(0);
    expect(mid).toBeGreaterThan(slow);
    expect(buddySound(0, MAX * BUDDY_ROLL_FULL, MAX).moving).toBe(1);
    expect(buddySound(0, MAX * 2, MAX).moving).toBe(1); // nie über 1
  });

  it('maxSpeed 0 wirft nicht und teilt nicht durch null', () => {
    const s = buddySound(0, 5, 0);
    expect(Number.isFinite(s.moving)).toBe(true);
    expect(s.moving).toBe(1);
  });

  it('eigene Hörweite überschreibbar (Level-Stimmung später)', () => {
    expect(buddySound(200, 0, MAX, 400).closeness).toBeCloseTo(0.5, 5);
  });
});

describe('smoothSpeed', () => {
  it('zieht zum Messwert, ohne ihn zu überschießen', () => {
    let v = 0;
    for (let i = 0; i < 40; i++) v = smoothSpeed(v, 300, 0.08);
    expect(v).toBeGreaterThan(295);
    expect(v).toBeLessThanOrEqual(300);
  });

  it('ein einzelner Ausschlag hebt den Wert nur zum Teil (Glättung)', () => {
    // 80 ms bei tau = 150 ms ⇒ etwa 41 % des Wegs.
    const v = smoothSpeed(0, 900, 0.08);
    expect(v).toBeGreaterThan(300);
    expect(v).toBeLessThan(500);
  });

  it('dt ≤ 0 lässt den Wert stehen – zwei Meldungen im selben Fenster sind keine Messung', () => {
    expect(smoothSpeed(120, 900, 0)).toBe(120);
    expect(smoothSpeed(120, 900, -0.05)).toBe(120);
  });

  it('fällt auch wieder ab, wenn der Partner anhält', () => {
    let v = 400;
    for (let i = 0; i < 20; i++) v = smoothSpeed(v, 0, 0.08);
    expect(v).toBeLessThan(5);
  });
});
