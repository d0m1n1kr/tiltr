// Fackel (M66): macht in ihrem Radius HELL. Das einzige Element OHNE Klang –
// mit Absicht: Licht ist hier die Information, ein Ton würde eine zweite
// Bedeutung stiften. Kein Physik-Einfluss; der Renderer liest world.torches.

import { registerElement } from './registry';
import type { TorchDef } from '../levels/schema';
import { WORLD } from '../render/palette';

registerElement<TorchDef>({
  type: 'torch',

  build(def, ctx) {
    const [x, y] = def.cell;
    ctx.world.torches.push({ x: (x + 0.5) * ctx.cell, y: (y + 0.5) * ctx.cell, r: def.r });
  },

  gallery: {
    title: 'Fackel',
    description:
      'Ein Lichtkreis im Dunkeln: Wände, Löcher und Elemente in ihrer Reichweite sind zu sehen, ohne Ping. Sie hat keinen Klang – Licht ist ihre ganze Botschaft. Kein Einfluss auf den Ball.',
    draw(ctx, w, h) {
      const cx = w / 2;
      const cy = h * 0.52;
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, h * 0.55);
      glow.addColorStop(0, `rgba(${WORLD.torch}, 0.45)`);
      glow.addColorStop(1, `rgba(${WORLD.torch}, 0)`);
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);
      // Flamme: Tropfen
      ctx.fillStyle = `rgba(${WORLD.torch}, 0.95)`;
      ctx.beginPath();
      ctx.moveTo(cx, cy - h * 0.3);
      ctx.quadraticCurveTo(cx + h * 0.18, cy - h * 0.02, cx, cy + h * 0.16);
      ctx.quadraticCurveTo(cx - h * 0.18, cy - h * 0.02, cx, cy - h * 0.3);
      ctx.fill();
      ctx.fillStyle = `rgba(${WORLD.wall}, 0.8)`;
      ctx.fillRect(cx - 2, cy + h * 0.14, 4, h * 0.2);
    },
  },
});
