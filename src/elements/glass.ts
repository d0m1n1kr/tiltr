// Glasboden: eine Zelle, die das Überrollen zählt. Das erste Mal knackt sie
// hörbar (Warnung), das zweite Mal zerbricht sie zum offenen Loch – wer
// gerade drüberrollt, fällt. Bewusst in Brüchig-Bernstein (wie brüchige
// Wände): gleiche Bedeutung, nur als Boden. Tests modellieren Glas
// konservativ: Ziel und Checkpoints bleiben MIT gesperrten Glaszellen
// erreichbar (Glas ist Abkürzung oder Köder, nie Pflichtweg).

import { registerElement } from './registry';
import type { GlassDef } from '../levels/schema';
import { WORLD } from '../render/palette';

registerElement<GlassDef>({
  type: 'glass',

  build(def, ctx) {
    const [x, y] = def.cell;
    ctx.world.glass.push({
      x: x * ctx.cell,
      y: y * ctx.cell,
      w: ctx.cell,
      h: ctx.cell,
      state: 0,
      wasOn: false,
    });
  },

  gallery: {
    title: 'Glasboden',
    description:
      'Eine Bodenzelle aus Glas: Beim ersten Überrollen knackt sie warnend, beim zweiten zerbricht sie – und wird zum offenen Loch, in das du stürzt. Einmal ist frei, zweimal ist gefallen. Signatur: helles Knacken, dann Splittern.',
    draw(ctx, w, h) {
      ctx.strokeStyle = `rgba(${WORLD.brittle}, 0.8)`;
      ctx.lineWidth = 2;
      ctx.strokeRect(w * 0.2, h * 0.2, w * 0.6, h * 0.6);
      // Sprunglinien vom Zentrum
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const cx = w / 2,
        cy = h / 2;
      for (const [dx, dy] of [
        [0.22, -0.18],
        [-0.2, 0.12],
        [0.1, 0.22],
        [-0.14, -0.2],
      ] as const) {
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + w * dx, cy + h * dy);
      }
      ctx.stroke();
    },
    demoSound(audio) {
      audio.glassCrack();
      setTimeout(() => audio.glassShatter(), 1000);
    },
  },
});
