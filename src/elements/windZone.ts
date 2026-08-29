// Windzone: konstante Kraft in einer Zelle, gegen die man anhalten muss.
// Hörbar als Böen-Rauschen aus Richtung der Zone.

import { registerElement } from './registry';
import type { WindZoneDef } from '../levels/schema';

const DIRS = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] } as const;

registerElement<WindZoneDef>({
  type: 'windZone',

  build(def, ctx) {
    const [dx, dy] = DIRS[def.dir];
    ctx.world.windZones.push({
      x: def.cell[0] * ctx.cell,
      y: def.cell[1] * ctx.cell,
      w: ctx.cell,
      h: ctx.cell,
      fx: dx * def.force,
      fy: dy * def.force,
    });
  },

  gallery: {
    title: 'Windzone',
    description:
      'Unsichtbare Zelle mit konstanter Windkraft – man muss dagegen neigen. Signatur: böiges Rauschen, das aus Richtung der Zone anschwillt.',
    draw(ctx, w, h) {
      ctx.strokeStyle = 'rgba(120, 200, 255, 0.7)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const y = h * (0.3 + i * 0.2);
        ctx.beginPath();
        ctx.moveTo(w * 0.2, y);
        ctx.bezierCurveTo(w * 0.45, y - 6, w * 0.6, y + 6, w * 0.82, y);
        ctx.stroke();
      }
    },
    demoSound(audio) {
      audio.setWind(0.9, 1, 0);
      setTimeout(() => audio.setWind(0, 0, 0), 1800);
    },
  },
});
