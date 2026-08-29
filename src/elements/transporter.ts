// Transporter: trägt den Ball auf eine andere Ebene (oder als Portal quer
// über dieselbe). Man hört die Richtung: abwärts klingt absteigend,
// aufwärts aufsteigend. In der Nähe schwebt ein schwebender Doppelton.

import { registerElement, cellCenter } from './registry';
import type { TransporterDef } from '../levels/schema';
import { WORLD } from '../render/palette';

registerElement<TransporterDef>({
  type: 'transporter',

  build(def, ctx) {
    const p = cellCenter(def.cell, ctx.cell);
    const t = cellCenter(def.target.cell, ctx.cell);
    ctx.world.transporters.push({
      x: p.x,
      y: p.y,
      r: def.r,
      targetFloor: def.target.floor,
      tx: t.x,
      ty: t.y,
      dir: def.target.floor > ctx.floorIndex ? 'down' : def.target.floor < ctx.floorIndex ? 'up' : 'same',
    });
  },

  gallery: {
    title: 'Transporter',
    description:
      'Trägt dich auf eine andere Ebene – oder als Portal quer über die Map. Signatur: schwebender Doppelton in der Nähe; beim Sprung ein Schimmern, das abwärts fällt oder aufwärts steigt. Antwortet auf den Ping mit aufsteigendem Doppel-Echo.',
    draw(ctx, w, h) {
      ctx.strokeStyle = `rgba(${WORLD.portal}, 0.9)`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, h * 0.3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = `rgba(${WORLD.portal}, 0.45)`;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, h * 0.18, 0, Math.PI * 2);
      ctx.stroke();
      // Abwärts-Glyphe
      ctx.fillStyle = `rgba(${WORLD.portal}, 0.9)`;
      ctx.beginPath();
      ctx.moveTo(w / 2 - 6, h / 2 - 3);
      ctx.lineTo(w / 2 + 6, h / 2 - 3);
      ctx.lineTo(w / 2, h / 2 + 6);
      ctx.closePath();
      ctx.fill();
    },
    demoSound(audio) {
      audio.setPortal(0.8, 1, 0);
      setTimeout(() => {
        audio.setPortal(0, 0, 0);
        audio.warp('down');
      }, 900);
      setTimeout(() => audio.warp('up'), 2100);
    },
  },
});
