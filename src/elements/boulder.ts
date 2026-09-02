// Rollstein (M47): ein schwerer Körper, den der Ball vor sich her schiebt –
// ZELLWEISE, auf eine Druckplatte (die er dann hält, auch allein) oder in
// ein Loch, das er verschließt. Bringt die Druckplatte in den Einzelspieler
// und macht aus dem Labyrinth ein Sokoban im Dunkeln.
// Signatur: schweres Mahlen beim Rollen, dumpfer Schlag beim Anhalten.

import { registerElement, cellCenter } from './registry';
import type { BoulderDef } from '../levels/schema';
import { WORLD } from '../render/palette';

/** Kantenlänge des Steins in Zellen – muss zur Zellgröße-Rückrechnung in
 *  physics.updateBoulders passen (size / BOULDER_SIZE = Zelle). */
export const BOULDER_SIZE = 0.72;

registerElement<BoulderDef>({
  type: 'boulder',

  build(def, ctx) {
    const p = cellCenter(def.cell, ctx.cell);
    ctx.world.boulders.push({
      x: p.x,
      y: p.y,
      size: ctx.cell * BOULDER_SIZE,
      cell: [def.cell[0], def.cell[1]],
      move: null,
      sunk: false,
    });
  },

  gallery: {
    title: 'Rollstein',
    description:
      'Ein schwerer Stein, den du mit Schwung um eine Zelle weiterschiebst – auf eine Druckplatte, die er dann hält, oder in ein Loch, das er verschließt. Auf Eis rollt er, bis ihn eine Wand stoppt. Signatur: Mahlen beim Rollen, dumpfer Schlag beim Anhalten.',
    draw(ctx, w, h) {
      const s = h * 0.5;
      ctx.fillStyle = `rgba(${WORLD.boulder}, 0.95)`;
      const x = w / 2 - s / 2,
        y = h / 2 - s / 2,
        r = s * 0.22;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + s, y, x + s, y + s, r);
      ctx.arcTo(x + s, y + s, x, y + s, r);
      ctx.arcTo(x, y + s, x, y, r);
      ctx.arcTo(x, y, x + s, y, r);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = `rgba(${WORLD.boulder}, 0.5)`;
      ctx.beginPath();
      ctx.moveTo(x + s + 6, h / 2);
      ctx.lineTo(x + s + 16, h / 2);
      ctx.moveTo(x + s + 12, h / 2 - 4);
      ctx.lineTo(x + s + 16, h / 2);
      ctx.lineTo(x + s + 12, h / 2 + 4);
      ctx.stroke();
    },
    demoSound(audio) {
      audio.boulderRoll(0.8, 0.2);
      setTimeout(() => audio.boulderStop(1, 0.2), 450);
    },
  },
});
