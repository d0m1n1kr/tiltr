import { describe, expect, it } from 'vitest';
import { screenTilt } from '../src/core/orientation';

// Sprache der Tests: WELCHE Gerätekante liegt unten, und WOHIN auf dem Schirm
// muss die Kugel dann rollen. gx > 0 = rechte Kante unten, gy > 0 = Unterkante
// unten (Hochformat: rollt nach unten).
const rightEdgeDown = { gx: 0.5, gy: 0 };
const bottomEdgeDown = { gx: 0, gy: 0.5 };

describe('Neigung → Bildschirm (screenTilt)', () => {
  it('Hochformat: Achsen bleiben, rechte Kante unten → rechts, Unterkante unten → unten', () => {
    expect(screenTilt(rightEdgeDown.gx, rightEdgeDown.gy, 0)).toEqual({ x: 0.5, y: 0 });
    expect(screenTilt(bottomEdgeDown.gx, bottomEdgeDown.gy, 0)).toEqual({ x: 0, y: 0.5 });
  });

  it('90° (Oberkante links): Unterkante liegt rechts im Bild → rollt nach rechts; rechte Kante liegt unten → rollt nach unten', () => {
    expect(screenTilt(bottomEdgeDown.gx, bottomEdgeDown.gy, 90)).toEqual({ x: 0.5, y: 0 });
    expect(screenTilt(rightEdgeDown.gx, rightEdgeDown.gy, 90)).toEqual({ x: 0, y: 0.5 });
  });

  it('270° (Oberkante rechts): Unterkante liegt links → rollt nach links; rechte Kante liegt oben → rollt nach oben', () => {
    expect(screenTilt(bottomEdgeDown.gx, bottomEdgeDown.gy, 270)).toEqual({ x: -0.5, y: -0 });
    expect(screenTilt(rightEdgeDown.gx, rightEdgeDown.gy, 270)).toEqual({ x: -0, y: -0.5 });
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

  it('90° und 270° unterscheiden sich in BEIDEN Vorzeichen (bis 3.0.2 nur in x – das war der Fehler)', () => {
    const a = screenTilt(0.3, 0.4, 90);
    const b = screenTilt(0.3, 0.4, 270);
    expect(b).toEqual({ x: -a.x, y: -a.y });
  });

  it('nimmt auch negative und legacy-Winkel (window.orientation −90 = 270)', () => {
    expect(screenTilt(0.5, 0, -90)).toEqual(screenTilt(0.5, 0, 270));
    expect(screenTilt(0.5, 0, 450)).toEqual(screenTilt(0.5, 0, 90));
  });
});
