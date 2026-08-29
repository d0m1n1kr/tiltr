// Checkpoint: Respawn-Punkt, füllt einen Echo-Ping auf.

import { registerElement, cellCenter } from './registry';
import type { CheckpointDef } from '../levels/schema';

registerElement<CheckpointDef>({
  type: 'checkpoint',

  build(def, ctx) {
    const p = cellCenter(def.cell, ctx.cell);
    ctx.world.checkpoints.push({ x: p.x, y: p.y, r: def.r, reached: false });
  },

  gallery: {
    title: 'Checkpoint',
    description:
      'Unsichtbarer Ring auf dem Weg. Einmal berührt: Respawn-Punkt nach einem Sturz und +1 Echo-Ping. Signatur: freundlicher Doppelklang, doppelte Vibration.',
    draw(ctx, w, h) {
      ctx.strokeStyle = 'rgba(75, 224, 200, 0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, h * 0.3, 0, Math.PI * 2);
      ctx.stroke();
    },
    demoSound(audio) {
      audio.checkpoint();
    },
  },
});
