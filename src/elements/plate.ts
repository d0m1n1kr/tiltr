// Druckplatte (Coop): Solange EIN Spieler sie hält, steht die verknüpfte
// Partnertür offen. Loslassen schließt sie wieder – Choreografie zu zweit.

import { registerElement, cellCenter } from './registry';
import type { PlateDef } from '../levels/schema';
import { WORLD } from '../render/palette';

registerElement<PlateDef>({
  type: 'plate',

  build(def, ctx) {
    const p = cellCenter(def.cell, ctx.cell);
    ctx.world.plates.push({ x: p.x, y: p.y, r: def.r, opens: def.opens, held: false });
  },

  gallery: {
    title: 'Druckplatte & Partnertür',
    description:
      'Coop: Solange dein Partner die Platte hält, gleitet deine Tür auf – lässt er los, schließt sie wieder. Gleiche goldene Ping-Signatur wie die Tür, die sie öffnet. Nur im Multiplayer.',
    draw(ctx, w, h) {
      // Platte als goldener Rahmen mit Punkt …
      ctx.strokeStyle = `rgba(${WORLD.plate}, 0.9)`;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(w * 0.16, h * 0.3, h * 0.4, h * 0.4);
      ctx.fillStyle = `rgba(${WORLD.plate}, 0.5)`;
      ctx.fillRect(w * 0.16 + 5, h * 0.3 + 5, h * 0.4 - 10, h * 0.4 - 10);
      // … verbunden mit einer offenen Tür
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(w * 0.16 + h * 0.4, h * 0.5);
      ctx.lineTo(w * 0.68, h * 0.5);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = `rgba(${WORLD.plate}, 0.9)`;
      ctx.strokeRect(w * 0.7, h * 0.18, 7, h * 0.26);
      ctx.strokeRect(w * 0.7, h * 0.56, 7, h * 0.26);
    },
    demoSound(audio) {
      audio.plate(true);
      setTimeout(() => audio.doorOpen(0.6, 0), 250);
      setTimeout(() => audio.plate(false), 1600);
      setTimeout(() => audio.doorClose(0.6, 0), 1750);
    },
  },
});
