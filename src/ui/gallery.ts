// Element-Galerie: lebende Doku aller Spielelemente mit Visual und Klang.
// Erreichbar über den Link auf dem Startscreen.

import { galleryEntries, type GalleryEntry } from '../elements';
import type { GameAudio } from '../audio/audio';

// Mechaniken, die keine Level-Elemente sind, aber zur Klangsprache gehören.
function extraEntries(): GalleryEntry[] {
  return [
    {
      title: 'Wand & Echo',
      description:
        'Wände sind unsichtbar; Berührung macht sie kurz sichtbar und klingt als dumpfer Thump aus ihrer Richtung. Brüchige Wände (bernstein) knirschen und stürzen nach 3 harten Treffern ein.',
      draw(ctx, w, h) {
        ctx.fillStyle = 'rgba(110, 168, 255, 0.9)';
        ctx.fillRect(w * 0.15, h * 0.42, w * 0.45, 6);
        ctx.fillStyle = 'rgba(255, 176, 96, 0.9)';
        ctx.fillRect(w * 0.62, h * 0.42, w * 0.23, 6);
      },
      demoSound(audio) {
        audio.hit(0.7, -1, 0);
        setTimeout(() => audio.crackle(1, 0), 500);
        setTimeout(() => audio.crumble(1, 0), 1100);
      },
    },
    {
      title: 'Ziel-Beacon',
      description: 'Sonar-Ping des Ziels: je näher, desto schneller, lauter und höher. Richtung über Spatial Audio.',
      draw(ctx, w, h) {
        ctx.fillStyle = 'rgba(75, 224, 140, 0.8)';
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, h * 0.14, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(75, 224, 140, 0.4)';
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, h * 0.3, 0, Math.PI * 2);
        ctx.stroke();
      },
      demoSound(audio) {
        audio.beacon(1, -0.3, 0.25);
      },
    },
    {
      title: 'Echo-Ping',
      description:
        'Aktiver Sonar-Impuls (Tap/Leertaste, begrenzter Vorrat): Wellenfront deckt die Umgebung auf, Reflexionen kommen entfernungs-verzögert zurück – Wände hell, Löcher tief.',
      draw(ctx, w, h) {
        ctx.strokeStyle = 'rgba(75, 224, 200, 0.8)';
        for (const r of [0.12, 0.22, 0.32]) {
          ctx.beginPath();
          ctx.arc(w / 2, h / 2, h * r, 0, Math.PI * 2);
          ctx.stroke();
        }
      },
      demoSound(audio) {
        audio.echoPing([
          { dx: 1, dy: 0, delay: 0.12, gain: 0.25, freq: 950 },
          { dx: -0.5, dy: 0.5, delay: 0.25, gain: 0.18, freq: 950 },
          { dx: 0, dy: -1, delay: 0.38, gain: 0.12, freq: 280 },
        ]);
      },
    },
    {
      title: 'Herzschlag',
      description: 'Wird schneller und lauter, je näher ein offenes Loch ist. Fällt der Puls, ist der Weg frei.',
      draw(ctx, w, h) {
        ctx.strokeStyle = 'rgba(255, 110, 130, 0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(w * 0.1, h / 2);
        ctx.lineTo(w * 0.35, h / 2);
        ctx.lineTo(w * 0.45, h * 0.2);
        ctx.lineTo(w * 0.55, h * 0.8);
        ctx.lineTo(w * 0.65, h / 2);
        ctx.lineTo(w * 0.9, h / 2);
        ctx.stroke();
      },
      demoSound(audio) {
        audio.heartbeat(0.9);
      },
    },
  ];
}

export function setupGallery(audio: GameAudio): void {
  const link = document.getElementById('galleryLink')!;
  const panel = document.getElementById('gallery')!;
  const list = document.getElementById('galleryList')!;
  const close = document.getElementById('galleryClose')!;

  link.addEventListener('click', async (e) => {
    e.preventDefault();
    await audio.start(); // User-Geste: Audio für die Demos freischalten
    if (!list.childElementCount) render();
    panel.classList.remove('hidden');
  });
  close.addEventListener('click', () => panel.classList.add('hidden'));

  function render(): void {
    for (const entry of [...galleryEntries(), ...extraEntries()]) {
      const item = document.createElement('div');
      item.className = 'gallery-item';

      const cv = document.createElement('canvas');
      cv.width = 120;
      cv.height = 72;
      const ctx = cv.getContext('2d')!;
      ctx.fillStyle = '#05070f';
      ctx.fillRect(0, 0, cv.width, cv.height);
      entry.draw(ctx, cv.width, cv.height);

      const body = document.createElement('div');
      const title = document.createElement('h3');
      title.textContent = entry.title;
      const desc = document.createElement('p');
      desc.textContent = entry.description;
      body.append(title, desc);
      if (entry.demoSound) {
        const btn = document.createElement('button');
        btn.textContent = '🔊 Anhören';
        btn.addEventListener('click', () => entry.demoSound!(audio));
        body.append(btn);
      }
      item.append(cv, body);
      list.append(item);
    }
  }
}
