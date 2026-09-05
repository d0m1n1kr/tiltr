// ZEHRFELD (M102): ein Feld, das Echo-Pings FRISST. Wer darüberrollt, zahlt
// die Zahl, die darauf steht – damit lässt sich eine Abkürzung BEPREISEN
// statt versperren: Der kurze Weg kostet Sicht, der lange kostet Zeit.
//
// Es ist die erste Mechanik, die den Ping-Vorrat KLEINER macht (der Kristall
// macht ihn größer, der Checkpoint füllt auf) – und damit die einzige, die
// das teuerste Gut dieses Spiels einfordert.
//
// DER PREIS STEHT DRAUF: Der Renderer schreibt die Ziffer in die Zelle, sobald
// sie aufgedeckt ist, und man HÖRT das Feld schon vorher (ein saugendes Zehren
// in der Nähe). Eine Falle ohne Ansage wäre in diesem Spiel ein Bruch: Alles
// Gefährliche klingt, bevor es zuschlägt.

import { registerElement, cellCenter } from './registry';
import type { DrainDef } from '../levels/schema';
import { WORLD } from '../render/palette';

registerElement<DrainDef>({
  type: 'drain',

  build(def, ctx) {
    const p = cellCenter(def.cell, ctx.cell);
    ctx.world.drains.push({ x: p.x, y: p.y, r: def.r, cost: def.cost, inside: false });
  },

  gallery: {
    title: 'Zehrfeld',
    description:
      'Ein Feld, das deine Echo-Pings frisst: Jede Überfahrt kostet so viele, wie darauf steht – und wer noch einmal hinüberrollt, zahlt noch einmal. Damit kostet eine Abkürzung nicht Zeit, sondern SICHT. Signatur: ein tiefes, saugendes Zehren in der Nähe, ein schlürfender Abwärtston beim Zahlen.',
    draw(ctx, w, h) {
      const cx = w / 2,
        cy = h / 2,
        r = h * 0.32;
      // Trichter aus drei Ringen, nach innen enger – ein Schlund.
      ctx.strokeStyle = `rgba(${WORLD.drain}, 0.9)`;
      ctx.lineWidth = 2;
      for (const f of [1, 0.66, 0.34]) {
        ctx.beginPath();
        ctx.arc(cx, cy, r * f, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = `rgba(${WORLD.drain}, 0.9)`;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.12, 0, Math.PI * 2);
      ctx.fill();
    },
    demoSound(audio) {
      audio.setDrain(0.9, 0, -1);
      audio.drainPay();
      setTimeout(() => audio.setDrain(0, 0, 0), 1800);
    },
  },
});
