// Neigung → Bildschirm (v3.0.5): Der Sensor (DeviceOrientation) meldet beta
// und gamma IMMER im natürlichen Geräterahmen (Hochformat). Dreht die App ins
// Querformat, muss der Gefällevektor in Bildschirmachsen gedreht werden.
//
// GESCHICHTE: Bis 3.0.2 stand hier (in tilt.ts) das verbreitete Schnipsel –
// 90°: (gy, −gx), 270°: (−gy, gx). 3.0.3 „korrigierte" das y-Vorzeichen, mit
// einer Herleitung, die die Kanten falsch zuordnete: Bei einem gegen den
// Uhrzeigersinn gedrehten Gerät (Oberkante links) liegt die RECHTE
// Gerätekante am OBEREN Bildrand, nicht am unteren. Die Messung auf einem
// iPhone (M53: obere Bildkante gesenkt → γ +22, Kugel muss nach OBEN) hat
// das Schnipsel bestätigt und 3.0.3 widerlegt. Seit 3.0.5 gilt wieder das
// Schnipsel – jetzt mit richtiger Herleitung und Tests, die die Messung
// nachstellen.
//
// Herleitung (kleine Winkel). Geräterahmen D: x_D nach rechts, y_D zur
// OBERKANTE, z aus dem Schirm (W3C). gamma > 0 = rechte Kante unten,
// beta > 0 = Oberkante oben (Unterkante unten). Gefällevektor in D:
// (gx, −gy). Bildschirmrahmen S: x_S nach rechts, y_S nach UNTEN.
//   0°   (Hochformat):        Kanten bleiben.       x_S = x_D,  y_S = −y_D → (gx, gy)
//   90°  (Oberkante LINKS):   oben→links, rechts→oben, unten→rechts, links→unten.
//                             x_S = −y_D, y_S = −x_D → x = gy,  y = −gx
//   180° (kopfüber):          x_S = −x_D, y_S = y_D  → x = −gx, y = −gy
//   270° (Oberkante RECHTS):  oben→rechts, rechts→unten, unten→links, links→oben.
//                             x_S = y_D,  y_S = x_D  → x = −gy, y = gx
// Probe für 90° (gemessen, iPhone standalone, landscape-primary): obere
// BILDkante gesenkt = rechte GERÄTEkante unten → γ > 0 → Kugel nach oben:
// y = −gx < 0 ✓. Rechte Bildkante gesenkt = Geräte-Unterkante unten → β > 0 →
// Kugel nach rechts: x = gy > 0 ✓.
//
// Rein und DOM-frei; tilt.ts liefert den Winkel aus screen.orientation.

import type { Tilt } from './types';

/** Gefälle (gx = gamma-Anteil, gy = beta-Anteil, beide normiert) in
 *  Bildschirmachsen für den Bildschirm-Drehwinkel (0/90/180/270). */
export function screenTilt(gx: number, gy: number, angle: number): Tilt {
  const a = ((Math.round(angle) % 360) + 360) % 360;
  switch (a) {
    case 90:
      return { x: gy, y: -gx };
    case 180:
      return { x: -gx, y: -gy };
    case 270:
      return { x: -gy, y: gx };
    default:
      return { x: gx, y: gy };
  }
}

/** Physischer Drehwinkel aus `screen.orientation.type` für Geräte mit
 *  natürlichem HOCHFORMAT (Spec-Tabelle). Gebraucht auf iPadOS: Dort zählt
 *  `screen.orientation.angle` von der QUERlage (landscape-secondary = 180°),
 *  der Sensor aber vom Hochformat – gemessen (M54): rechte Bildkante gesenkt
 *  → β −30 (Geräte-Oberkante liegt rechts) = physisch 270°, nicht 180°. Der
 *  TYP stimmt physisch auf iPhone (landscape-primary = Oberkante links, 90°)
 *  wie iPad (landscape-secondary = Oberkante rechts, 270°). */
export const TYPE_ANGLE: Readonly<Record<string, number>> = {
  'portrait-primary': 0,
  'landscape-primary': 90,
  'portrait-secondary': 180,
  'landscape-secondary': 270,
};

export function angleFromType(type: string | undefined, fallback: number): number {
  return type !== undefined && type in TYPE_ANGLE ? TYPE_ANGLE[type]! : fallback;
}
