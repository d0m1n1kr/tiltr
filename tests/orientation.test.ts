import { describe, expect, it } from 'vitest';
import { angleFromType, screenTilt } from '../src/core/orientation';

// Sprache der Tests: WELCHE Gerätekante liegt unten, und WOHIN auf dem Schirm
// muss die Kugel dann rollen. gx > 0 = rechte Gerätekante unten, gy > 0 =
// Geräte-Unterkante unten (Hochformat: rollt nach unten).
//
// Kantenlage bei 90° (Gerät gegen den Uhrzeigersinn gedreht, Oberkante links):
// Geräte-Unterkante → rechter Bildrand, rechte Gerätekante → OBERER Bildrand.
// Genau diese Zuordnung war in 3.0.3 falsch (rechts → unten) – gemessen auf
// einem iPhone: obere Bildkante gesenkt ⇒ γ +22 ⇒ Kugel muss nach oben.
const rightEdgeDown = { gx: 0.5, gy: 0 };
const bottomEdgeDown = { gx: 0, gy: 0.5 };

describe('Neigung → Bildschirm (screenTilt)', () => {
  it('Hochformat: Achsen bleiben, rechte Kante unten → rechts, Unterkante unten → unten', () => {
    expect(screenTilt(rightEdgeDown.gx, rightEdgeDown.gy, 0)).toEqual({ x: 0.5, y: 0 });
    expect(screenTilt(bottomEdgeDown.gx, bottomEdgeDown.gy, 0)).toEqual({ x: 0, y: 0.5 });
  });

  it('90° (Oberkante links): Unterkante liegt rechts im Bild → rollt nach rechts; rechte Kante liegt OBEN → rollt nach oben', () => {
    expect(screenTilt(bottomEdgeDown.gx, bottomEdgeDown.gy, 90)).toEqual({ x: 0.5, y: -0 });
    expect(screenTilt(rightEdgeDown.gx, rightEdgeDown.gy, 90)).toEqual({ x: 0, y: -0.5 });
  });

  it('Messung iPhone (M53): obere Bildkante gesenkt ⇒ γ > 0 ⇒ tilt.y < 0; rechte Bildkante gesenkt ⇒ β > 0 ⇒ tilt.x > 0', () => {
    const topDown = screenTilt(22 / 22, 0, 90); // γ +22, β 0
    const rightDown = screenTilt(0, 26 / 22, 90); // β +26, γ 0
    expect(topDown.y).toBeLessThan(0);
    expect(rightDown.x).toBeGreaterThan(0);
  });

  it('270° (Oberkante rechts): Unterkante liegt links → rollt nach links; rechte Kante liegt unten → rollt nach unten', () => {
    expect(screenTilt(bottomEdgeDown.gx, bottomEdgeDown.gy, 270)).toEqual({ x: -0.5, y: 0 });
    expect(screenTilt(rightEdgeDown.gx, rightEdgeDown.gy, 270)).toEqual({ x: -0, y: 0.5 });
  });

  it('180° (kopfüber): beide Achsen gespiegelt', () => {
    expect(screenTilt(0.3, 0.2, 180)).toEqual({ x: -0.3, y: -0.2 });
  });

  it('der Betrag des Gefälles bleibt in jeder Ausrichtung erhalten', () => {
    for (const angle of [0, 90, 180, 270]) {
      const t = screenTilt(0.3, 0.4, angle);
      expect(Math.hypot(t.x, t.y)).toBeCloseTo(0.5);
    }
  });

  it('90° und 270° unterscheiden sich in BEIDEN Vorzeichen', () => {
    const a = screenTilt(0.3, 0.4, 90);
    const b = screenTilt(0.3, 0.4, 270);
    expect(b).toEqual({ x: -a.x, y: -a.y });
  });

  it('nimmt auch negative und legacy-Winkel (window.orientation −90 = 270)', () => {
    expect(screenTilt(0.5, 0, -90)).toEqual(screenTilt(0.5, 0, 270));
    expect(screenTilt(0.5, 0, 450)).toEqual(screenTilt(0.5, 0, 90));
  });

  it('iPadOS (M54): landscape-secondary meldet angle 180, physisch ist es 270 – der Typ entscheidet', () => {
    expect(angleFromType('landscape-secondary', 180)).toBe(270);
    expect(angleFromType('landscape-primary', 0)).toBe(90);
    expect(angleFromType('portrait-primary', 90)).toBe(0);
    expect(angleFromType('portrait-secondary', 270)).toBe(180);
    expect(angleFromType(undefined, 90)).toBe(90);
    expect(angleFromType('natural', 45)).toBe(45);
  });

  it('iPad-Messung: rechte Bildkante gesenkt ⇒ β −30 ⇒ bei 270° rollt es nach RECHTS; obere Bildkante gesenkt ⇒ γ −24 ⇒ nach OBEN', () => {
    const a = angleFromType('landscape-secondary', 180);
    expect(screenTilt(0, -30 / 22, a).x).toBeGreaterThan(0);
    expect(screenTilt(-24 / 22, 0, a).y).toBeLessThan(0);
  });

  it('iPad Hochformat (M54): portrait-primary meldet angle 90, physisch 0 – obere Kante gesenkt ⇒ β −24 ⇒ nach OBEN, rechte gesenkt ⇒ γ +24 ⇒ nach RECHTS', () => {
    const a = angleFromType('portrait-primary', 90);
    expect(a).toBe(0);
    expect(screenTilt(0, -24 / 22, a).y).toBeLessThan(0);
    expect(screenTilt(24 / 22, 0, a).x).toBeGreaterThan(0);
  });
});
