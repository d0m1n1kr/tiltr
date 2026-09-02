// Sanduhr (M45): Sammler, der die Par um ein paar Sekunden verlängert. Legt
// eine zweite Routen-Entscheidung neben die Gems: Zeit holen oder Gems holen?
// Für die großen Finale die faire Antwort auf „drei Sterne = zwei Läufe".
// Signatur: leises Rieseln als Ping-Antwort, beim Einsammeln ein Tick.

import { registerElement, cellCenter } from './registry';
import type { HourglassDef } from '../levels/schema';
import { WORLD } from '../render/palette';

registerElement<HourglassDef>({
  type: 'hourglass',

  build(def, ctx) {
    const p = cellCenter(def.cell, ctx.cell);
    ctx.world.hourglasses.push({ x: p.x, y: p.y, r: def.r, collected: false, bonusS: def.bonusS });
  },

  gallery: {
    title: 'Sanduhr',
    description:
      'Verlängert die Par-Zeit um zehn Sekunden – Zeit holen statt Gems holen. Signatur: feines Rieseln als Ping-Antwort, ein heller Tick beim Einsammeln.',
    draw(ctx, w, h) {
      const cx = w / 2,
        cy = h / 2,
        r = h * 0.3;
      ctx.fillStyle = `rgba(${WORLD.hourglass}, 0.95)`;
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.7, cy - r);
      ctx.lineTo(cx + r * 0.7, cy - r);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx + r * 0.7, cy + r);
      ctx.lineTo(cx - r * 0.7, cy + r);
      ctx.lineTo(cx, cy);
      ctx.closePath();
      ctx.fill();
    },
    demoSound(audio) {
      audio.echoPing([{ dx: 0.5, dy: -0.5, delay: 0.15, gain: 0.22, freq: 1480, double: true }]);
      setTimeout(() => audio.collectHourglass(), 900);
    },
  },
});
