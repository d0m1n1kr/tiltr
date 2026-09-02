// Schlüssel: klimpert leise irgendwo im Labyrinth. Einsammeln öffnet die
// zugehörige Tür – hörbar als Entriegeln aus Richtung der Tür.

import { registerElement, cellCenter } from './registry';
import type { KeyDef } from '../levels/schema';
import { WORLD } from '../render/palette';

registerElement<KeyDef>({
  type: 'key',

  build(def, ctx) {
    const p = cellCenter(def.cell, ctx.cell);
    ctx.world.keys.push({ x: p.x, y: p.y, r: def.r, collected: false, opens: def.opens, voice: def.voice });
  },

  gallery: {
    title: 'Schlüssel & Tür',
    description:
      'Der Schlüssel klimpert metallisch in der Ferne, die verschlossene Tür antwortet dumpf auf den Echo-Ping. Schlüssel einsammeln – und die Tür gleitet hörbar auf.',
    draw(ctx, w, h) {
      // Schlüssel als Raute …
      ctx.save();
      ctx.translate(w * 0.32, h / 2);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = `rgba(${WORLD.key}, 0.95)`;
      ctx.fillRect(-7, -7, 14, 14);
      ctx.restore();
      // … Tür als goldener Balken
      ctx.fillStyle = `rgba(${WORLD.door}, 0.8)`;
      ctx.fillRect(w * 0.62, h * 0.2, 6, h * 0.6);
    },
    demoSound(audio) {
      audio.keyTinkle(1, 0, 0.2);
      setTimeout(() => audio.collectKey(), 700);
      setTimeout(() => audio.doorOpen(-1, 0), 1400);
    },
  },
});
