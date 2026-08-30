// Sog-Anker: zieht den Ball in seinem Radius an. Die Kraft bleibt per
// Schema-Invariante UNTER der Neigungs-Beschleunigung – man kommt immer
// wieder heraus, verliert aber Zeit. Violett = Gefahr-Familie.
// Tests beweisen: Anker sitzen abseits des Pflichtwegs.

import { registerElement, cellCenter } from './registry';
import type { AnchorDef } from '../levels/schema';
import { WORLD } from '../render/palette';

registerElement<AnchorDef>({
  type: 'anchor',

  build(def, ctx) {
    const p = cellCenter(def.cell, ctx.cell);
    ctx.world.anchors.push({ x: p.x, y: p.y, r: def.r, force: def.force });
  },

  gallery: {
    title: 'Sog-Anker',
    description:
      'Zieht dich in seinem Radius an – je näher, desto zäher. Er verschluckt dich nicht, aber er kostet Kraft und Zeit; wer hindurchhält, kommt immer wieder frei. Signatur: elektrisches Brummen, das mit der Nähe anschwillt.',
    draw(ctx, w, h) {
      const cx = w / 2,
        cy = h / 2;
      ctx.fillStyle = `rgba(${WORLD.anchor}, 0.9)`;
      ctx.beginPath();
      ctx.arc(cx, cy, h * 0.09, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(${WORLD.anchor}, 0.6)`;
      ctx.lineWidth = 2;
      for (const r of [0.2, 0.3, 0.4]) {
        ctx.beginPath();
        ctx.arc(cx, cy, h * r, 0.4, Math.PI * 2 - 0.4);
        ctx.stroke();
      }
    },
    demoSound(audio) {
      audio.setAnchor(0.4, 1, 0);
      setTimeout(() => audio.setAnchor(0.95, 1, 0), 800);
      setTimeout(() => audio.setAnchor(0.3, 1, 0), 1600);
      setTimeout(() => audio.setAnchor(0, 0, 0), 2300);
    },
  },
});
