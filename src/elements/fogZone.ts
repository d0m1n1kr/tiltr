// Nebelzone: dämpft ALLE Klänge über einen globalen Lowpass – auch den
// Ziel-Beacon. Kein Physik-Einfluss; das Element IST die Klangveränderung.

import { registerElement } from './registry';
import type { FogZoneDef } from '../levels/schema';
import { WORLD } from '../render/palette';

registerElement<FogZoneDef>({
  type: 'fogZone',

  build(def, ctx) {
    const [x, y] = def.cell;
    ctx.world.fogZones.push({ x: x * ctx.cell, y: y * ctx.cell, w: ctx.cell, h: ctx.cell });
  },

  gallery: {
    title: 'Nebelzone',
    description:
      'Im Nebel klingt ALLES wie durch Watte – Wände, Gefahren, sogar der Sonar des Ziels. Er schiebt nicht und verschluckt nicht, aber er nimmt dir die Ohren – und den Horchern: Wer im Nebel rollt, wird nicht gehört. Präg dir den Kurs ein, bevor du eintauchst.',
    draw(ctx, w, h) {
      for (const [dx, dy, r, a] of [
        [0.32, 0.5, 0.24, 0.5],
        [0.5, 0.42, 0.28, 0.4],
        [0.66, 0.55, 0.22, 0.5],
      ] as const) {
        ctx.fillStyle = `rgba(${WORLD.fog}, ${a})`;
        ctx.beginPath();
        ctx.arc(w * dx, h * dy, h * r, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    demoSound(audio) {
      // Beacon klar, dann derselbe Beacon im Nebel – der Unterschied IST die Signatur.
      audio.beacon(1, 0, 0.3);
      setTimeout(() => {
        audio.setFog(1);
        audio.beacon(1, 0, 0.3);
      }, 900);
      setTimeout(() => audio.setFog(0), 2000);
    },
  },
});
