// Schiebewand: das Wand-Gegenstück zu atmenden Löchern. Sitzt auf einer im
// Maze OFFENEN Kante und öffnet/schließt zyklisch – nur im voll geöffneten
// Plateau ist sie passierbar. Hörbar als rhythmisches Steinschleifen, mit
// beschleunigendem Takt kurz bevor sie sich schließt.

import { registerElement } from './registry';
import type { SlidingWallDef } from '../levels/schema';
import { WORLD } from '../render/palette';

const WALL_T = 10;

registerElement<SlidingWallDef>({
  type: 'slidingWall',

  build(def, ctx) {
    const [[x, y], dir] = def.edge;
    const cell = ctx.cell;
    const ht = WALL_T / 2;
    const vertical = dir === 'e' || dir === 'w';
    const ex = dir === 'e' ? (x + 1) * cell - ht : x * cell - ht;
    const ey = dir === 's' ? (y + 1) * cell - ht : y * cell - ht;
    const rect = vertical
      ? { x: ex, y: y * cell - ht, w: WALL_T, h: cell + WALL_T }
      : { x: x * cell - ht, y: ey, w: cell + WALL_T, h: WALL_T };

    const blocked = ctx.world.walls.some(
      (w) => Math.abs(w.x - rect.x) < 0.5 && Math.abs(w.y - rect.y) < 0.5 && (w.w === WALL_T) === vertical,
    );
    if (blocked) throw new Error(`Schiebewand: Kante (${x},${y},${dir}) ist im Maze nicht offen`);

    // startet geschlossen; die Phase (offset) steuert den echten Zustand pro Frame
    ctx.world.walls.push({ ...rect, slide: { cycle: def.cycle, openness: 0 } });
  },

  gallery: {
    title: 'Schiebewand',
    description:
      'Eine Wand, die sich im Takt auf- und zuschiebt – nur voll geöffnet ist der Weg frei. Signatur: rhythmisches Steinschleifen beim Öffnen und Schließen, dazu ein beschleunigender Takt als Warnung, kurz bevor sie zufährt.',
    draw(ctx, w, h) {
      // halb aufgeschobene Wand mit Bewegungspfeilen
      ctx.fillStyle = `rgba(${WORLD.slider}, 0.9)`;
      ctx.fillRect(w * 0.46, h * 0.12, 8, h * 0.42);
      ctx.strokeStyle = `rgba(${WORLD.slider}, 0.45)`;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(w * 0.46, h * 0.58, 8, h * 0.3);
      ctx.setLineDash([]);
      ctx.strokeStyle = `rgba(${WORLD.wall}, 0.7)`;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(w * 0.12, h * 0.08);
      ctx.lineTo(w * 0.12, h * 0.92);
      ctx.moveTo(w * 0.88, h * 0.08);
      ctx.lineTo(w * 0.88, h * 0.92);
      ctx.stroke();
    },
    demoSound(audio) {
      audio.slideGrind(0.6, 0, true);
      setTimeout(() => audio.slideTick(0.6, 0), 1100);
      setTimeout(() => audio.slideTick(0.6, 0), 1450);
      setTimeout(() => audio.slideTick(0.6, 0), 1680);
      setTimeout(() => audio.slideGrind(0.6, 0, false), 1900);
    },
  },
});
