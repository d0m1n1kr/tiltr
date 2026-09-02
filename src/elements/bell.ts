// Lockglocke (M46): Überrollt man sie, schlägt sie an – und alle Horcher
// laufen zum Klang statt zum Ball. Die erste AKTIVE Schleich-Mechanik:
// Ablenken statt Vermeiden. Ein Element, das man absichtlich auslöst.

import { registerElement, cellCenter } from './registry';
import type { BellDef } from '../levels/schema';
import { WORLD } from '../render/palette';

registerElement<BellDef>({
  type: 'bell',

  build(def, ctx) {
    const p = cellCenter(def.cell, ctx.cell);
    ctx.world.bells.push({ x: p.x, y: p.y, r: def.r, ringS: def.ringS, ringLeft: 0, inside: false });
  },

  gallery: {
    title: 'Lockglocke',
    description:
      'Überrollen schlägt sie an: ein heller Glockenschlag, der vier Sekunden nachhallt – und solange laufen alle Horcher zur Glocke statt zu dir. Ablenken statt Vermeiden. Signatur als Ping-Antwort: kurzer Glockenblip.',
    draw(ctx, w, h) {
      const cx = w / 2,
        cy = h / 2,
        r = h * 0.3;
      ctx.fillStyle = `rgba(${WORLD.bell}, 0.95)`;
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.45, cy - r);
      ctx.lineTo(cx + r * 0.45, cy - r);
      ctx.lineTo(cx + r * 0.9, cy + r * 0.6);
      ctx.lineTo(cx - r * 0.9, cy + r * 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy + r * 0.85, r * 0.2, 0, Math.PI * 2);
      ctx.fill();
    },
    demoSound(audio) {
      audio.bellRing(0.7, -0.3);
    },
  },
});
