import { describe, expect, it } from 'vitest';
import {
  GLOW_BASE_MS,
  GLOW_CHARGE_MS,
  GLOW_FADE_MS,
  GLOW_GAP_MS,
  GLOW_MAX_MS,
  afterglowMs,
  glowCharge,
  glowNow,
  glowTouch,
  pruneGlow,
  touchCell,
  type GlowCell,
  type GlowState,
} from '../src/core/afterglow';

// NACHGLÜHEN LÄDT SICH AUF (M94): Kurve, Kontaktlücke und die Regel, dass ein
// Glühen nie kürzer wird. Alles rein – die Zeit kommt als Zahl herein.
describe('Nachglühen (M94)', () => {
  it('ein Streifschuss glüht wie bisher, volle Ladung mehr als dreimal so lang', () => {
    expect(afterglowMs(0)).toBe(GLOW_BASE_MS);
    expect(afterglowMs(GLOW_CHARGE_MS)).toBe(GLOW_MAX_MS);
    // Über der Sättigung wird es nicht länger – sonst hinge das Bild endlos.
    expect(afterglowMs(GLOW_CHARGE_MS * 10)).toBe(GLOW_MAX_MS);
    expect(afterglowMs(-5)).toBe(GLOW_BASE_MS);
  });

  it('die Kurve ist eine WURZEL: der erste Augenblick zählt am meisten', () => {
    // Bei einem Viertel der Ladezeit ist schon die HALBE Ladung erreicht.
    expect(glowCharge(GLOW_CHARGE_MS / 4)).toBeCloseTo(0.5, 6);
    const first = afterglowMs(GLOW_CHARGE_MS / 4) - afterglowMs(0);
    const last = afterglowMs(GLOW_CHARGE_MS) - afterglowMs((GLOW_CHARGE_MS * 3) / 4);
    expect(first).toBeGreaterThan(last);
    // Monoton bleibt sie trotzdem.
    for (let ms = 0; ms < GLOW_CHARGE_MS; ms += 100) {
      expect(afterglowMs(ms + 100)).toBeGreaterThan(afterglowMs(ms));
    }
  });

  it('anhaltender Kontakt lädt: gleiche Berührung, längere Frist', () => {
    let o: GlowState = {};
    o = glowTouch(o, 1000);
    const short = o.glowUntil! - 1000;
    expect(short).toBe(GLOW_BASE_MS);
    // 16 Bilder à 16 ms bleiben eine Berührung …
    for (let i = 1; i <= 60; i++) o = glowTouch(o, 1000 + i * 16);
    const long = o.glowUntil! - (1000 + 60 * 16);
    expect(long).toBeGreaterThan(short * 2);
    expect(o.glowFrom).toBe(1000);
  });

  it('eine kurze Lücke hält die Berührung zusammen, eine lange beginnt neu', () => {
    const a = glowTouch(glowTouch({}, 0), GLOW_GAP_MS);
    expect(a.glowFrom).toBe(0);
    const b = glowTouch(glowTouch({}, 0), GLOW_GAP_MS + 1);
    expect(b.glowFrom).toBe(GLOW_GAP_MS + 1);
  });

  it('ein Glühen wird NIE kürzer – die neue Berührung löscht die alte Ladung nicht', () => {
    // Lange anlehnen …
    let o: GlowState = {};
    for (let i = 0; i <= 100; i++) o = glowTouch(o, i * 20);
    const charged = o.glowUntil!;
    // … dann viel später kurz antippen: die Frist bleibt die längere.
    const later = glowTouch(o, 2500);
    expect(later.glowFrom).toBe(2500); // neue Berührung
    expect(later.glowUntil).toBe(charged); // aber nichts abgeschnitten
  });

  it('glowNow: voll hell, bis die letzte Spanne anbricht, dann linear aus', () => {
    const o = { glowUntil: 10_000 };
    expect(glowNow(o, 10_001)).toBe(0);
    expect(glowNow(o, 10_000 - GLOW_FADE_MS / 2)).toBeCloseTo(0.5, 6);
    expect(glowNow(o, 10_000 - GLOW_FADE_MS)).toBe(1);
    expect(glowNow(o, 0)).toBe(1);
    expect(glowNow({}, 0)).toBe(0);
  });
});

// DIE SPUR AUF DEM BODEN (M94b): dieselbe Ladung, nur je ZELLE. Der Boden hat
// keine Objekte, also hält eine Karte den Zustand – und die muss sich selbst
// wieder aufräumen.
describe('Bodenspur (M94b)', () => {
  const CELL = 100;

  it('merkt sich die Zellmitte in Weltkoordinaten – der Renderer rechnet nichts zurück', () => {
    const map = new Map<string, GlowCell>();
    const c = touchCell(map, 2, 3, CELL, 1000);
    expect([c.x, c.y]).toEqual([250, 350]);
    expect(map.size).toBe(1);
  });

  it('dieselbe Zelle lädt weiter, eine andere beginnt bei null', () => {
    const map = new Map<string, GlowCell>();
    touchCell(map, 1, 1, CELL, 0);
    for (let t = 16; t <= 1600; t += 16) touchCell(map, 1, 1, CELL, t);
    const lang = map.get('1,1')!.glowUntil! - 1600;
    const kurz = touchCell(map, 5, 1, CELL, 1600).glowUntil! - 1600;
    expect(lang).toBeGreaterThan(kurz * 2);
    expect(map.size).toBe(2);
  });

  it('verglühte Zellen werden weggeräumt – sonst wächst die Karte den ganzen Lauf', () => {
    const map = new Map<string, GlowCell>();
    for (let i = 0; i < 20; i++) touchCell(map, i, 0, CELL, i * 50);
    expect(map.size).toBe(20);
    pruneGlow(map, 1000);
    expect(map.size).toBe(20); // noch glüht alles nach
    pruneGlow(map, 20 * 50 + 5000);
    expect(map.size).toBe(0);
  });
});
