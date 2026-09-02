// Wanderloch (M46): ein offenes Loch auf Patrouille – die Verbindung von
// Wächter und Loch. Das Grollen zieht durch den Raum, der Spieler wartet,
// bis es vorbei ist. Rhythmus ohne Uhr. Läuft über `World.advanceHoles`
// (wie die Wächter), deterministisch und ohne Ball.

import { registerElement, cellCenter } from './registry';
import type { RoamingHoleDef } from '../levels/schema';
import { WORLD } from '../render/palette';

registerElement<RoamingHoleDef>({
  type: 'roamingHole',

  build(def, ctx) {
    const waypoints = def.patrol.map((c) => cellCenter(c, ctx.cell));
    ctx.world.holes.push({
      x: waypoints[0]!.x,
      y: waypoints[0]!.y,
      r: def.r,
      openness: 1,
      roam: { waypoints, target: 1, dir: 1, speed: def.speed },
    });
  },

  gallery: {
    title: 'Wanderloch',
    description:
      'Ein Loch, das wandert: Es läuft seine Strecke ab wie ein Wächter, und sein Grollen zieht durch den Raum. Wer es kommen hört, wartet, bis es vorbei ist – Rhythmus ohne Uhr. Signatur: das dunkle Grollen, nur unterwegs.',
    draw(ctx, w, h) {
      ctx.fillStyle = WORLD.holeFill;
      ctx.beginPath();
      ctx.arc(w * 0.4, h / 2, h * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(${WORLD.holeRim}, 0.8)`;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.strokeStyle = `rgba(${WORLD.holeRim}, 0.5)`;
      ctx.beginPath();
      ctx.moveTo(w * 0.62, h / 2);
      ctx.lineTo(w * 0.85, h / 2);
      ctx.moveTo(w * 0.78, h * 0.38);
      ctx.lineTo(w * 0.85, h / 2);
      ctx.lineTo(w * 0.78, h * 0.62);
      ctx.stroke();
    },
    demoSound(audio) {
      // Grollen, das von links nach rechts zieht.
      const steps = [-1, -0.5, 0, 0.5, 1];
      steps.forEach((x, i) => setTimeout(() => audio.setHoleRumble(0.8, x, 0.2), i * 350));
      setTimeout(() => audio.setHoleRumble(0, 0, 0), steps.length * 350 + 300);
    },
  },
});
