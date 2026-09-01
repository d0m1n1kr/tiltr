// Jukebox: ein Musikautomat, der im Labyrinth STEHT und 8-Bit-Themen spielt.
// Anrempeln schaltet auf den nächsten Titel der Playlist.
//
// Drei Entscheidungen stecken in diesen wenigen Zeilen:
//
// 1. Der Kasten ist eine WAND (mit `jukebox`-Marke). Damit sind Kollision,
//    Echo-Aufleuchten und der Treffer-Klang gratis, und die Spielschleife
//    erkennt den Rempler an `hit.wall.jukebox` – kein neuer Kollisionstyp.
// 2. Die Zelle ist dadurch UNPASSIERBAR, und das ist keine Nebenwirkung
//    sondern Physik: Bei CELL=100 und Ball-Durchmesser 44 müsste neben einem
//    mittigen Kasten ein Kasten schmaler als 12 Einheiten stehen, um einen
//    Durchgang zu lassen – also unsichtbar klein. Ein Möbelstück blockiert
//    seine Zelle, Punkt. Deshalb zählt validate.ts Jukebox-Zellen in JEDEM
//    Modell als gesperrt (nicht nur konservativ wie Glas/Anker) und hat einen
//    eigenen 'jukebox'-Check, der sagt, WELCHER Automat im Weg steht.
// 3. Die Musik kommt räumlich AUS dem Automaten (HRTF wie Wächter und
//    Portal) – sie ist damit ein akustisches Wahrzeichen, an dem man sich
//    orientieren kann, und nicht Hintergrundmusik.

import { registerElement } from './registry';
import type { JukeboxDef } from '../levels/schema';
import { WORLD } from '../render/palette';
import { compiledById } from '../music';
import { previewTune } from '../audio/musicPreview';

/** Abstand des Kastens zur Zellgrenze in Welteinheiten. 12 lässt neben der
 *  Wand (halbe Dicke 5) genau 7 Einheiten Luft – für einen Ball mit
 *  Durchmesser 44 sicher zu wenig. Der Automat SIEHT also aus wie ein Möbel
 *  in der Zelle und ist trotzdem eindeutig dicht. */
export const JUKEBOX_INSET = 12;

registerElement<JukeboxDef>({
  type: 'jukebox',

  build(def, ctx) {
    const [x, y] = def.cell;
    const cell = ctx.cell;
    const bx = x * cell + JUKEBOX_INSET;
    const by = y * cell + JUKEBOX_INSET;
    const size = cell - JUKEBOX_INSET * 2;
    const index = ctx.world.jukeboxes.length;
    ctx.world.jukeboxes.push({
      x: bx + size / 2,
      y: by + size / 2,
      bx,
      by,
      bw: size,
      bh: size,
      playlist: def.playlist,
      // Ein startIndex jenseits der Playlist ist ein Editor-Zwischenstand,
      // kein Ladefehler: einklemmen statt werfen (Loader mild).
      index: Math.min(def.startIndex, def.playlist.length - 1),
      volume: def.volume,
      epoch: null,
      scheduledS: 0,
    });
    ctx.world.walls.push({ x: bx, y: by, w: size, h: size, jukebox: index });
  },

  gallery: {
    title: 'Jukebox',
    description:
      'Ein Musikautomat, der in seiner Zelle steht und 8-Bit-Themen spielt – räumlich ortbar, also ein Wahrzeichen im Dunkeln. Musik verdeckt hier die Hinweise: Der Raum um ihn ist schwer, WEIL man die Wände nicht hört. Anrempeln schaltet auf den nächsten Titel. Der Kasten ist massiv, seine Zelle also dicht.',
    draw(ctx, w, h) {
      const bw = w * 0.38,
        bh = h * 0.62;
      const bx = (w - bw) / 2,
        by = (h - bh) / 2;
      ctx.fillStyle = `rgba(${WORLD.jukebox}, 0.22)`;
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = `rgba(${WORLD.jukebox}, 0.9)`;
      ctx.lineWidth = 2;
      ctx.strokeRect(bx, by, bw, bh);
      // Zwei „Lautsprecher" – die Signatur des Kastens im Bild
      ctx.fillStyle = `rgba(${WORLD.jukebox}, 0.85)`;
      for (const fy of [0.34, 0.66]) {
        ctx.beginPath();
        ctx.arc(bx + bw / 2, by + bh * fy, Math.min(bw, bh) * 0.16, 0, Math.PI * 2);
        ctx.fill();
      }
      // Schallwellen nach beiden Seiten
      ctx.strokeStyle = `rgba(${WORLD.jukebox}, 0.5)`;
      ctx.lineWidth = 1.6;
      for (const r of [0.62, 0.82]) {
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(bx + bw / 2, h / 2, w * r * 0.28, side > 0 ? -0.7 : Math.PI - 0.7, side > 0 ? 0.7 : Math.PI + 0.7);
          ctx.stroke();
        }
      }
    },
    demoSound(audio) {
      // Das Haus-Thema als Signatur – dieselbe Vorschau, die der Editor
      // pro Titel anbietet.
      const tune = compiledById('tiltr');
      if (tune) previewTune(audio, tune);
    },
  },
});
