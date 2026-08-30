// Zeitschloss-Schalter: die Singleplayer-Druckplatte. Betreten öffnet die
// verknüpfte Tür für durationS Sekunden – ein tickender Countdown läuft mit
// und wird zum Ende hin hektischer. tests/campaign.test.ts beweist, dass die
// Strecke Schalter→Tür in der Zeit machbar ist (Pfadlänge/Maxspeed-Schranke).

import { registerElement, cellCenter } from './registry';
import type { TimedSwitchDef } from '../levels/schema';
import { WORLD } from '../render/palette';

registerElement<TimedSwitchDef>({
  type: 'timedSwitch',

  build(def, ctx) {
    const p = cellCenter(def.cell, ctx.cell);
    ctx.world.switches.push({
      x: p.x,
      y: p.y,
      r: def.r,
      opens: def.opens,
      durationS: def.durationS,
      openUntil: null,
      held: false,
    });
  },

  gallery: {
    title: 'Zeitschloss-Schalter',
    description:
      'Betreten öffnet die verknüpfte Tür – aber nur für ein paar Sekunden. Ein Ticken zählt die Zeit herunter und wird hektischer, je knapper sie wird; dann fällt die Tür hörbar wieder zu. Erneutes Betreten spannt das Uhrwerk neu.',
    draw(ctx, w, h) {
      // Zifferblatt-Kreis mit Zeiger …
      const cx = w * 0.3,
        cy = h * 0.5,
        r = h * 0.26;
      ctx.strokeStyle = `rgba(${WORLD.plate}, 0.9)`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx, cy - r * 0.7);
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + r * 0.55, cy + r * 0.25);
      ctx.stroke();
      // … verbunden mit einer Tür
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(cx + r, cy);
      ctx.lineTo(w * 0.66, cy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = `rgba(${WORLD.door}, 0.9)`;
      ctx.strokeRect(w * 0.68, h * 0.18, 7, h * 0.26);
      ctx.strokeRect(w * 0.68, h * 0.56, 7, h * 0.26);
    },
    demoSound(audio) {
      audio.switchPress();
      setTimeout(() => audio.doorOpen(0.6, 0), 200);
      const t0 = Date.now();
      const tick = () => {
        const elapsed = (Date.now() - t0) / 1000;
        if (elapsed > 2.6) {
          audio.doorClose(0.6, 0);
          return;
        }
        audio.switchTick(elapsed / 2.6);
        setTimeout(tick, 560 - (elapsed / 2.6) * 400);
      };
      setTimeout(tick, 800);
    },
  },
});
