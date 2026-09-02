// Neigung → Bildschirm (v3.0.3): Der Sensor (DeviceOrientation) meldet beta
// und gamma IMMER im natürlichen Geräterahmen (Hochformat). Dreht die App ins
// Querformat, muss der Gefällevektor in Bildschirmachsen gedreht werden – und
// zwar richtig: Bis 3.0.2 war das y-Vorzeichen bei 90° und 270° invertiert,
// im Querformat rollte die Kugel bei „Kante runter" nach oben.
//
// Herleitung (kleine Winkel). Geräterahmen D: x_D nach rechts, y_D zur
// OBERKANTE, z aus dem Schirm (W3C). gamma > 0 = rechte Kante unten,
// beta > 0 = Oberkante oben (Unterkante unten). Der Gefällevektor in D ist
// also (gx, −gy). Bildschirmrahmen S: x_S nach rechts, y_S nach UNTEN.
//   0°   (Hochformat):       x_S = x_D,  y_S = −y_D  →  x = gx,  y = gy
//   90°  (Oberkante links):  x_S = −y_D, y_S = x_D   →  x = gy,  y = gx
//   180° (kopfüber):         x_S = −x_D, y_S = y_D   →  x = −gx, y = −gy
//   270° (Oberkante rechts): x_S = y_D,  y_S = −x_D  →  x = −gy, y = −gx
// Probe für 90°: Unterkante liegt am rechten Bildrand – Unterkante unten
// (beta > 0) muss die Kugel nach RECHTS rollen lassen: x = gy > 0 ✓. Rechte
// Kante liegt am unteren Bildrand – rechte Kante unten (gamma > 0) muss sie
// nach UNTEN rollen lassen: y = gx > 0 ✓.
//
// Rein und DOM-frei; tilt.ts liefert den Winkel aus screen.orientation.

import type { Tilt } from './types';

/** Gefälle (gx = gamma-Anteil, gy = beta-Anteil, beide normiert) in
 *  Bildschirmachsen für den Bildschirm-Drehwinkel (0/90/180/270). */
export function screenTilt(gx: number, gy: number, angle: number): Tilt {
  const a = ((Math.round(angle) % 360) + 360) % 360;
  switch (a) {
    case 90:
      return { x: gy, y: gx };
    case 180:
      return { x: -gx, y: -gy };
    case 270:
      return { x: -gy, y: -gx };
    default:
      return { x: gx, y: gy };
  }
}
