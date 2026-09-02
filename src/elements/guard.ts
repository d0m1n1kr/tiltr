// Wächter: patrouilliert brummend durchs Labyrinth. Berührung wirft den Ball
// zum letzten Checkpoint zurück. Dank Spatial Audio hört man genau, wo er ist.

import { registerElement, cellCenter } from './registry';
import type { GuardDef } from '../levels/schema';
import { WORLD } from '../render/palette';

registerElement<GuardDef>({
  type: 'guard',

  build(def, ctx) {
    const waypoints = def.patrol.map((c) => cellCenter(c, ctx.cell));
    ctx.world.guards.push({
      x: waypoints[0]!.x,
      y: waypoints[0]!.y,
      r: def.r,
      speed: def.speed,
      waypoints,
      target: waypoints.length > 1 ? 1 : 0,
      dir: 1,
      // Schläfer (M45): beginnt schlafend (awakeLeft 0) auf Wegpunkt 0.
      sleeper: def.sleeper ? { wakeRadius: def.sleeper.wakeRadius, awakeS: def.sleeper.awakeS, awakeLeft: 0 } : undefined,
    });
  },

  gallery: {
    title: 'Wächter',
    description:
      'Patrouilliert durch die Gänge und wirft dich beim Berühren zum letzten Checkpoint zurück. Signatur: bedrohliches, pulsierendes Brummen aus seiner Richtung – und dein Herz schlägt schneller.',
    draw(ctx, w, h) {
      ctx.fillStyle = `rgba(${WORLD.guard}, 0.9)`;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, h * 0.24, 0, Math.PI * 2);
      ctx.fill();
      // Blickkegel
      ctx.fillStyle = `rgba(${WORLD.guard}, 0.25)`;
      ctx.beginPath();
      ctx.moveTo(w / 2, h / 2);
      ctx.lineTo(w * 0.85, h * 0.25);
      ctx.lineTo(w * 0.85, h * 0.75);
      ctx.closePath();
      ctx.fill();
    },
    demoSound(audio) {
      audio.setGuard(0.85, 1, 0);
      setTimeout(() => audio.setGuard(0, 0, 0), 1800);
      audio.heartbeat(0.8);
    },
  },
});
