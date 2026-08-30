// Strömung: Zelle mit gerichtetem Schub, der stärker ist als die maximale
// Neigungs-Beschleunigung – eine Einbahnstraße. Gegen den Strom geht nichts,
// mit ihm wird man mitgerissen. Im Erreichbarkeits-Modell der Tests eine
// GERICHTETE Kante (wie Transporter). Die Kante in Fließrichtung muss offen
// sein, sonst würde der Ball für immer angepinnt (der Loader wirft dann).

import { registerElement } from './registry';
import type { CurrentDef } from '../levels/schema';
import { WORLD } from '../render/palette';

const DIRS = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] } as const;
const WALL_T = 10;

registerElement<CurrentDef>({
  type: 'current',

  build(def, ctx) {
    const [x, y] = def.cell;
    const [dx, dy] = DIRS[def.dir];
    // Die Kante in Fließrichtung muss offen sein (massive Wände zählen;
    // Türen/Schiebewände dürfen dort sitzen – Warten im Strom ist erlaubt).
    const cell = ctx.cell;
    const ht = WALL_T / 2;
    const vertical = def.dir === 'e' || def.dir === 'w';
    const ex = def.dir === 'e' ? (x + 1) * cell - ht : x * cell - ht;
    const ey = def.dir === 's' ? (y + 1) * cell - ht : y * cell - ht;
    const blocked = ctx.world.walls.some(
      (w) =>
        !w.door &&
        !w.slide &&
        Math.abs(w.x - ex) < 0.5 &&
        Math.abs(w.y - ey) < 0.5 &&
        (w.w === WALL_T) === vertical,
    );
    if (blocked) throw new Error(`Strömung: Kante (${x},${y},${def.dir}) ist zugemauert – Dauer-Pin`);

    ctx.world.currents.push({
      x: x * cell,
      y: y * cell,
      w: cell,
      h: cell,
      fx: dx * def.force,
      fy: dy * def.force,
      dir: def.dir,
    });
  },

  gallery: {
    title: 'Strömung',
    description:
      'Ein Sog, der stärker schiebt, als du neigen kannst – eine Einbahnstraße. Was hinter der Strömung liegt, bleibt hinter dir. Signatur: pulsierendes, gerichtetes Rauschen, tiefer und drängender als Wind.',
    draw(ctx, w, h) {
      ctx.strokeStyle = `rgba(${WORLD.current}, 0.85)`;
      ctx.lineWidth = 2.5;
      for (let i = 0; i < 3; i++) {
        const y = h * (0.3 + i * 0.2);
        ctx.beginPath();
        ctx.moveTo(w * 0.16, y);
        ctx.lineTo(w * 0.7, y);
        ctx.lineTo(w * 0.62, y - 5);
        ctx.moveTo(w * 0.7, y);
        ctx.lineTo(w * 0.62, y + 5);
        ctx.stroke();
      }
    },
    demoSound(audio) {
      audio.setCurrent(0.9, 1, 0);
      setTimeout(() => audio.setCurrent(0, 0, 0), 2000);
    },
  },
});
