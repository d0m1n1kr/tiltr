// Hallraum (M46): das Gegenstück zum Nebel – nicht leiser, sondern LÄNGER.
// Solange der Ball in der Zone ist, läuft der Ping-Bus durch ein Feedback-
// Delay: Wände weit entfernt hörbar, die Richtung verschmiert. Ein Raumklang-
// Element, das die Größe eines Raumes erzählt, wie eine echte Kathedrale.
// Kein Physik-Einfluss.

import { registerElement } from './registry';
import type { ReverbZoneDef } from '../levels/schema';
import { WORLD } from '../render/palette';

registerElement<ReverbZoneDef>({
  type: 'reverbZone',

  build(def, ctx) {
    const [x, y] = def.cell;
    ctx.world.reverbZones.push({ x: x * ctx.cell, y: y * ctx.cell, w: ctx.cell, h: ctx.cell });
  },

  gallery: {
    title: 'Hallraum',
    description:
      'Hier hallt alles nach: Der Echo-Ping bekommt lange Fahnen, Wände sind weit zu hören, aber ihre Richtung verschmiert. Nicht leiser wie im Nebel, sondern länger – der Raum erzählt seine Größe. Kein Physik-Einfluss.',
    draw(ctx, w, h) {
      ctx.strokeStyle = `rgba(${WORLD.reverb}, 0.8)`;
      ctx.lineWidth = 1.5;
      for (const [r, a] of [
        [0.14, 0.9],
        [0.24, 0.6],
        [0.34, 0.35],
        [0.44, 0.18],
      ] as const) {
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.arc(w * 0.35, h / 2, h * r, -Math.PI / 2, Math.PI / 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
    demoSound(audio) {
      audio.setReverb(1);
      audio.echoPing([
        { dx: 1, dy: 0, delay: 0.12, gain: 0.25, freq: 950 },
        { dx: -0.6, dy: 0.6, delay: 0.3, gain: 0.16, freq: 950 },
      ]);
      setTimeout(() => audio.setReverb(0), 2500);
    },
  },
});
