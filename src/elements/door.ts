// Tür: verschlossene Wandkante, die der passende Schlüssel öffnet.
// Sitzt auf einer im Maze OFFENEN Kante und fügt dort ihre eigene Wand ein.

import { registerElement } from './registry';
import type { DoorDef } from '../levels/schema';
import { WORLD } from '../render/palette';

const WALL_T = 10;

registerElement<DoorDef>({
  type: 'door',

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
    if (blocked) throw new Error(`Tür ${def.id}: Kante (${x},${y},${dir}) ist im Maze nicht offen`);

    ctx.world.walls.push({ ...rect, door: { id: def.id } });
  },

  gallery: {
    title: 'Tür',
    description:
      'Eine verschlossene Wand mit eigener Ping-Signatur: dumpfer, satter als normale Wände. Öffnet sich nur mit dem passenden Schlüssel – dann gleitet sie polternd auf.',
    draw(ctx, w, h) {
      ctx.fillStyle = `rgba(${WORLD.door}, 0.85)`;
      ctx.fillRect(w * 0.46, h * 0.15, 8, h * 0.7);
      ctx.fillStyle = `rgba(${WORLD.wall}, 0.7)`;
      ctx.fillRect(w * 0.1, h * 0.15, w * 0.3, 6);
      ctx.fillRect(w * 0.62, h * 0.15, w * 0.3, 6);
    },
    demoSound(audio) {
      audio.doorOpen(0.5, 0);
    },
  },
});
