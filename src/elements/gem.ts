// Gem: optionales Sammelobjekt abseits des Weges – Risiko gegen Punkte.
// Antwortet auf den Echo-Ping mit einem eigenen, kristallklaren Doppelklang.

import { registerElement, cellCenter } from './registry';
import type { GemDef } from '../levels/schema';
import { WORLD } from '../render/palette';

registerElement<GemDef>({
  type: 'gem',

  build(def, ctx) {
    const p = cellCenter(def.cell, ctx.cell);
    ctx.world.gems.push({ x: p.x, y: p.y, r: def.r, collected: false });
  },

  gallery: {
    title: 'Gem',
    description:
      'Funkelnder Kristall abseits des Weges. Antwortet auf den Echo-Ping mit einem hellen Doppelklang – wer alle sammelt, verdient sich den dritten Stern.',
    draw(ctx, w, h) {
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = `rgba(${WORLD.gem}, 0.95)`;
      ctx.fillRect(-9, -9, 18, 18);
      ctx.restore();
      ctx.strokeStyle = `rgba(${WORLD.gem}, 0.4)`;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, h * 0.34, 0, Math.PI * 2);
      ctx.stroke();
    },
    demoSound(audio) {
      audio.echoPing([{ dx: 0.6, dy: -0.4, delay: 0.15, gain: 0.25, freq: 2093, double: true }]);
      setTimeout(() => audio.collectGem(), 900);
    },
  },
});
