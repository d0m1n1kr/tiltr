// Horcher: ein Jäger ohne Patrouille – er hört dein Rollen (durch Wände
// hindurch) und bewegt sich NUR, solange du dich bewegst. Stehst du still,
// verliert er die Spur und zieht sich zu seinem Heimatpunkt zurück.
// Berührung = zurück zum Checkpoint. Deterministisch aus der Ballbewegung.

import { registerElement, cellCenter } from './registry';
import type { ListenerDef } from '../levels/schema';
import { WORLD } from '../render/palette';

registerElement<ListenerDef>({
  type: 'listener',

  build(def, ctx) {
    const p = cellCenter(def.cell, ctx.cell);
    ctx.world.listeners.push({ x: p.x, y: p.y, r: def.r, speed: def.speed, home: { x: p.x, y: p.y } });
  },

  gallery: {
    title: 'Horcher',
    description:
      'Jagt dich, solange du rollst – er hört dich sogar durch Wände. Stehst du still, verliert er die Spur und zieht sich zurück. Signatur: Schnüffeln und Knistern, das mit deiner eigenen Rollgeschwindigkeit anschwillt. Stille ist deine Tarnung.',
    draw(ctx, w, h) {
      // orangeroter Jäger mit "Lausch-Wellen"
      const cx = w * 0.42,
        cy = h * 0.5;
      ctx.fillStyle = `rgba(${WORLD.listener}, 0.9)`;
      ctx.beginPath();
      ctx.arc(cx, cy, h * 0.16, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(${WORLD.listener}, 0.55)`;
      ctx.lineWidth = 2;
      for (const r of [0.26, 0.36]) {
        ctx.beginPath();
        ctx.arc(cx, cy, h * r, -0.6, 0.6);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, h * r, Math.PI - 0.6, Math.PI + 0.6);
        ctx.stroke();
      }
    },
    demoSound(audio) {
      // Schnüffeln schwillt an (als würdest du losrollen) und verstummt.
      audio.setListener(0.8, 0.2, 1, 0);
      setTimeout(() => audio.setListener(0.9, 0.9, 1, 0), 700);
      setTimeout(() => audio.setListener(0.9, 0.1, 1, 0), 1600);
      setTimeout(() => audio.setListener(0, 0, 0, 0), 2300);
    },
  },
});
