// Loch: verschluckt den Ball (offen), atmet optional. Hörbar als dunkles
// Grollen + Herzschlag, sichtbar nur nach Ping/Absturz.

import { registerElement, cellCenter } from './registry';
import type { HoleDef } from '../levels/schema';
import { WORLD } from '../render/palette';

registerElement<HoleDef>({
  type: 'hole',

  build(def, ctx) {
    const p = cellCenter(def.cell, ctx.cell);
    ctx.world.holes.push({
      x: p.x + def.jitter[0],
      y: p.y + def.jitter[1],
      r: def.r,
      breathing: def.breathing,
      // atmende Löcher starten geschlossen, statische sind offen
      openness: def.breathing ? 0 : 1,
    });
  },

  gallery: {
    title: 'Loch',
    description:
      'Verschluckt den Ball und zieht ihn an, sobald er über den Rand rollt. Atmende Löcher öffnen und schließen sich zyklisch – geschlossen sind sie harmlos. Signatur: dunkles Grollen, Herzschlag, Warnvibration.',
    draw(ctx, w, h) {
      ctx.fillStyle = WORLD.holeFill;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, h * 0.32, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(${WORLD.holeRim}, 0.8)`;
      ctx.lineWidth = 2;
      ctx.stroke();
    },
    demoSound(audio) {
      audio.setHoleRumble(0.85, 1, 0.3);
      setTimeout(() => audio.setHoleRumble(0, 0, 0), 1800);
      audio.heartbeat(0.8);
    },
  },
});
