// Eisfläche: reibungsarme Zelle. Der Ball gleitet weiter, Lenken und Bremsen
// werden schwammig. Hörbar als kristallines Sirren, das mit der
// Gleitgeschwindigkeit anschwillt. Kein Einfluss auf die Erreichbarkeit.

import { registerElement } from './registry';
import type { IceDef } from '../levels/schema';
import { WORLD } from '../render/palette';

registerElement<IceDef>({
  type: 'ice',

  build(def, ctx) {
    const [x, y] = def.cell;
    ctx.world.ice.push({ x: x * ctx.cell, y: y * ctx.cell, w: ctx.cell, h: ctx.cell });
  },

  gallery: {
    title: 'Eisfläche',
    description:
      'Spiegelglatt: Einmal angerollt, gleitest du weiter – Bremsen wird zäh, Lenken schwammig. Signatur: kristallines Sirren unter dem Ball, das mit dem Tempo anschwillt. Plane den Schwung, bevor du ihn nimmst.',
    draw(ctx, w, h) {
      ctx.fillStyle = `rgba(${WORLD.ice}, 0.18)`;
      ctx.fillRect(w * 0.14, h * 0.22, w * 0.72, h * 0.56);
      ctx.strokeStyle = `rgba(${WORLD.ice}, 0.8)`;
      ctx.lineWidth = 2;
      ctx.strokeRect(w * 0.14, h * 0.22, w * 0.72, h * 0.56);
      // Schlieren
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(w * 0.24, h * 0.66);
      ctx.lineTo(w * 0.44, h * 0.34);
      ctx.moveTo(w * 0.52, h * 0.7);
      ctx.lineTo(w * 0.72, h * 0.38);
      ctx.stroke();
    },
    demoSound(audio) {
      audio.setIce(0.3);
      setTimeout(() => audio.setIce(0.9), 600);
      setTimeout(() => audio.setIce(0.4), 1400);
      setTimeout(() => audio.setIce(0), 2100);
    },
  },
});
