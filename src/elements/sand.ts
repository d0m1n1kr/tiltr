// Sandfeld: das Gegenstück zur Eisfläche. Der Boden zehrt am Schwung – die
// Kugel wird auf gut die Hälfte gedeckelt, gelenkt wird weiter voll (im Sand
// fehlt der Schwung, nicht der Grip). Hörbar am ROLLGERÄUSCH selbst: statt
// des dunklen Grollens auf Stein ein trockenes Rieseln. Kein Einfluss auf die
// Erreichbarkeit – wie Eis ist Sand Spielgefühl, kein Riegel.

import { registerElement } from './registry';
import type { SandDef } from '../levels/schema';
import { WORLD } from '../render/palette';

registerElement<SandDef>({
  type: 'sand',

  build(def, ctx) {
    const [x, y] = def.cell;
    ctx.world.sand.push({ x: x * ctx.cell, y: y * ctx.cell, w: ctx.cell, h: ctx.cell });
  },

  gallery: {
    title: 'Sandfeld',
    description:
      'Zäher Grund: Der Schwung versickert, die Kugel kommt über ein halbes Tempo nicht hinaus – gelenkt wird weiter voll. Signatur: Das Rollgeräusch wechselt vom dunklen Grollen zu einem trockenen Rieseln. Eine Abkürzung durch Sand kostet Zeit, keine Sicherheit.',
    draw(ctx, w, h) {
      ctx.fillStyle = `rgba(${WORLD.sand}, 0.2)`;
      ctx.fillRect(w * 0.14, h * 0.22, w * 0.72, h * 0.56);
      ctx.strokeStyle = `rgba(${WORLD.sand}, 0.8)`;
      ctx.lineWidth = 2;
      ctx.strokeRect(w * 0.14, h * 0.22, w * 0.72, h * 0.56);
      // Körnung: gestreute Punkte, fest gesetzt (kein Zufall im Bild)
      ctx.fillStyle = `rgba(${WORLD.sand}, 0.9)`;
      const grains: ReadonlyArray<readonly [number, number]> = [
        [0.26, 0.36], [0.42, 0.3], [0.6, 0.4], [0.74, 0.32],
        [0.3, 0.56], [0.5, 0.62], [0.68, 0.55], [0.8, 0.66],
        [0.36, 0.72], [0.56, 0.44],
      ];
      for (const [fx, fy] of grains) {
        ctx.beginPath();
        ctx.arc(w * fx, h * fy, Math.max(1, w * 0.022), 0, Math.PI * 2);
        ctx.fill();
      }
    },
    demoSound(audio) {
      // Dasselbe Rollen wie im Spiel, nur mit Sand-Anteil 1: erst Stein, dann
      // Sand – der Unterschied ist die ganze Signatur.
      audio.setRolling(0.55, 0);
      setTimeout(() => audio.setRolling(0.55, 1), 900);
      setTimeout(() => audio.setRolling(0.3, 1), 1700);
      setTimeout(() => audio.setRolling(0, 0), 2300);
    },
  },
});
