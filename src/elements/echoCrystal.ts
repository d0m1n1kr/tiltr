// Echo-Kristall: Pickup, das den Ping-Vorrat um 1 erhöht (auch über das
// Budget hinaus). Trägt bewusst die Ping-Farbe – er ist abgefüllter Ping.

import { registerElement, cellCenter } from './registry';
import type { EchoCrystalDef } from '../levels/schema';
import { WORLD } from '../render/palette';

registerElement<EchoCrystalDef>({
  type: 'echoCrystal',

  build(def, ctx) {
    const p = cellCenter(def.cell, ctx.cell);
    ctx.world.crystals.push({ x: p.x, y: p.y, r: def.r, collected: false });
  },

  gallery: {
    title: 'Echo-Kristall',
    description:
      'Abgefüllter Ping: Einsammeln gibt +1 Echo-Ping – auch über den Rundenvorrat hinaus. Signatur: heller, einzelner Glockenton als Ping-Antwort, ein glasklarer Anschlag beim Einsammeln. Wer blind spielen will, lässt ihn liegen.',
    draw(ctx, w, h) {
      // vierstrahliger Teal-Stern
      const cx = w / 2,
        cy = h / 2,
        r = h * 0.3;
      ctx.fillStyle = `rgba(${WORLD.crystal}, 0.9)`;
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.quadraticCurveTo(cx, cy, cx + r, cy);
      ctx.quadraticCurveTo(cx, cy, cx, cy + r);
      ctx.quadraticCurveTo(cx, cy, cx - r, cy);
      ctx.quadraticCurveTo(cx, cy, cx, cy - r);
      ctx.fill();
    },
    demoSound(audio) {
      audio.collectCrystal();
    },
  },
});
