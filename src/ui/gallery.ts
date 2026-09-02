// Element-Galerie: lebende Doku aller Spielelemente mit Visual und Klang.
// Erreichbar über den Link auf dem Startscreen.

import { galleryEntries, type GalleryEntry } from '../elements';
import type { GameAudio } from '../audio/audio';
import { WORLD } from '../render/palette';
import { t, onLangChange, type Dict } from '../i18n';

type TypedEntry = GalleryEntry & { type: string };

// Mechaniken, die keine Level-Elemente sind, aber zur Klangsprache gehören.
// Exportiert: Der Editor zeigt Wand & Echo bzw. Schallschutzwand im Kopf der
// Wand-Eigenschaften mit derselben Miniatur und demselben Klang.
export function extraEntries(): TypedEntry[] {
  return [
    {
      type: 'wallEcho',
      title: 'Wand & Echo',
      description:
        'Wände sind unsichtbar; Berührung macht sie kurz sichtbar und klingt als dumpfer Thump aus ihrer Richtung. Brüchige Wände (bernstein) knirschen und stürzen nach 3 harten Treffern ein.',
      draw(ctx, w, h) {
        ctx.fillStyle = `rgba(${WORLD.wall}, 0.9)`;
        ctx.fillRect(w * 0.15, h * 0.42, w * 0.45, 6);
        ctx.fillStyle = `rgba(${WORLD.brittle}, 0.9)`;
        ctx.fillRect(w * 0.62, h * 0.42, w * 0.23, 6);
      },
      demoSound(audio) {
        audio.hit(0.7, -1, 0);
        setTimeout(() => audio.crackle(1, 0), 500);
        setTimeout(() => audio.crumble(1, 0), 1100);
      },
    },
    {
      type: 'wallAbsorb',
      title: 'Schallschutzwand',
      description:
        'Wand aus Dämmstoff (khaki): Der Echo-Ping kommt von ihr NICHT zurück, und was hinter ihr liegt – Wächter, Portal, Ziel-Beacon, Musik – hört man nur leise und dumpf. Anrempeln klingt weich.',
      draw(ctx, w, h) {
        ctx.fillStyle = `rgba(${WORLD.absorb}, 0.95)`;
        ctx.fillRect(w * 0.47, h * 0.18, 6, h * 0.64);
        // Wellen von links laufen an, rechts bleibt es still.
        ctx.strokeStyle = `rgba(${WORLD.ping}, 0.7)`;
        for (const r of [0.12, 0.2, 0.28]) {
          ctx.beginPath();
          ctx.arc(w * 0.2, h / 2, h * r, -Math.PI / 2, Math.PI / 2);
          ctx.stroke();
        }
        ctx.strokeStyle = `rgba(${WORLD.ping}, 0.18)`;
        ctx.beginPath();
        ctx.arc(w * 0.75, h / 2, h * 0.14, 0, Math.PI * 2);
        ctx.stroke();
      },
      demoSound(audio) {
        // Weicher Rempler, dann der Ziel-Beacon wie durch die Wand.
        audio.hit(0.7, -1, 0, true);
        setTimeout(() => audio.beacon(1, -0.3, 0.3, true), 450);
      },
    },
    {
      type: 'wallMirror',
      title: 'Echo-Spiegel',
      description:
        'Eine Wand aus poliertem Metall (silber): Der Echo-Ping meldet sie doppelt so weit, als sie ist – eine Wand, die nicht da ist. Anrempeln klingt hart wie jede Wand. Trau dem Trugbild nicht.',
      draw(ctx, w, h) {
        ctx.fillStyle = `rgba(${WORLD.mirror}, 0.95)`;
        ctx.fillRect(w * 0.47, h * 0.18, 6, h * 0.64);
        // Der Ping kommt von links, die Antwort scheint weit RECHTS zu stehen.
        ctx.strokeStyle = `rgba(${WORLD.ping}, 0.7)`;
        ctx.beginPath();
        ctx.arc(w * 0.2, h / 2, h * 0.2, -Math.PI / 2, Math.PI / 2);
        ctx.stroke();
        ctx.strokeStyle = `rgba(${WORLD.ping}, 0.35)`;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(w * 0.9, h / 2, h * 0.2, Math.PI / 2, (3 * Math.PI) / 2);
        ctx.stroke();
        ctx.setLineDash([]);
      },
      demoSound(audio) {
        // Antwort aus doppelter Entfernung, metallisch – dann der harte Rempler.
        audio.echoPing([{ dx: 2, dy: 0, delay: 0.42, gain: 0.3, freq: 1800 }]);
        setTimeout(() => audio.hit(0.7, -1, 0), 1200);
      },
    },
    {
      type: 'sleeper',
      title: 'Schläfer',
      description:
        'Ein Wächter, der schläft – tiefes, langsames Schnarchen aus seiner Richtung. Ein Echo-Ping in seiner Nähe weckt ihn mit einem Zischen: fünf Sekunden Patrouille, dann schläft er wieder. Der Ping wird zum Risiko.',
      draw(ctx, w, h) {
        ctx.fillStyle = `rgba(${WORLD.guard}, 0.55)`;
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, h * 0.24, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(${WORLD.guard}, 0.9)`;
        ctx.font = `${Math.round(h * 0.32)}px sans-serif`;
        ctx.fillText('z', w * 0.68, h * 0.34);
        ctx.font = `${Math.round(h * 0.22)}px sans-serif`;
        ctx.fillText('z', w * 0.8, h * 0.22);
      },
      demoSound(audio) {
        audio.setSnore(0.9, 1, 0);
        setTimeout(() => {
          audio.setSnore(0, 0, 0);
          audio.sleeperWake(1, 0);
          audio.setGuard(0.85, 1, 0);
        }, 1600);
        setTimeout(() => audio.setGuard(0, 0, 0), 2800);
      },
    },
    {
      type: 'fork',
      title: 'Stimmgabel',
      description:
        'Ein Schlüssel, der nicht klimpert, sondern tönt – aus keiner Richtung. Die SCHWEBUNG verrät den Weg: Neigst du auf sie zu, steht der Ton fast still; neigst du weg, flattert er. Ortung über die Tonhöhe statt über das Panning.',
      draw(ctx, w, h) {
        const cx = w / 2,
          cy = h / 2,
          r = h * 0.3;
        ctx.strokeStyle = `rgba(${WORLD.key}, 0.95)`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx, cy + r);
        ctx.lineTo(cx, cy);
        ctx.moveTo(cx - r * 0.5, cy - r);
        ctx.lineTo(cx - r * 0.5, cy - r * 0.2);
        ctx.quadraticCurveTo(cx, cy + r * 0.15, cx + r * 0.5, cy - r * 0.2);
        ctx.lineTo(cx + r * 0.5, cy - r);
        ctx.stroke();
      },
      demoSound(audio) {
        // Weg-geneigt (schnelle Schwebung) → auf sie zu (fast stehend).
        audio.setFork(0.9, 8);
        setTimeout(() => audio.setFork(0.9, 3), 900);
        setTimeout(() => audio.setFork(0.9, 0.5), 1800);
        setTimeout(() => audio.setFork(0, 0), 3000);
      },
    },
    {
      type: 'goal',
      title: 'Ziel-Beacon',
      description: 'Sonar-Ping des Ziels: je näher, desto schneller, lauter und höher. Richtung über Spatial Audio.',
      draw(ctx, w, h) {
        ctx.fillStyle = `rgba(${WORLD.goal}, 0.8)`;
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, h * 0.14, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(${WORLD.goal}, 0.4)`;
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, h * 0.3, 0, Math.PI * 2);
        ctx.stroke();
      },
      demoSound(audio) {
        audio.beacon(1, -0.3, 0.25);
      },
    },
    {
      type: 'ping',
      title: 'Echo-Ping',
      description:
        'Aktiver Sonar-Impuls (Tap/Leertaste, begrenzter Vorrat): Wellenfront deckt die Umgebung auf, Reflexionen kommen entfernungs-verzögert zurück – Wände hell, Löcher tief.',
      draw(ctx, w, h) {
        ctx.strokeStyle = `rgba(${WORLD.ping}, 0.8)`;
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
      type: 'heart',
      title: 'Herzschlag',
      description: 'Wird schneller und lauter, je näher ein offenes Loch ist. Fällt der Puls, ist der Weg frei.',
      draw(ctx, w, h) {
        ctx.strokeStyle = `rgba(${WORLD.heart}, 0.9)`;
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
  // Sprachwechsel: Einträge neu aufbauen (offene Galerie sofort, sonst lazy).
  onLangChange(() => {
    list.replaceChildren();
    if (!panel.classList.contains('hidden')) render();
  });

  function render(): void {
    for (const entry of [...galleryEntries(), ...extraEntries()]) {
      const item = document.createElement('div');
      item.className = 'panel gallery-item';

      const cv = document.createElement('canvas');
      cv.width = 120;
      cv.height = 72;
      const ctx = cv.getContext('2d')!;
      ctx.fillStyle = WORLD.bgDeep;
      ctx.fillRect(0, 0, cv.width, cv.height);
      entry.draw(ctx, cv.width, cv.height);

      const body = document.createElement('div');
      const title = document.createElement('h3');
      title.textContent = t(`el.${entry.type}.title` as keyof Dict);
      const desc = document.createElement('p');
      desc.textContent = t(`el.${entry.type}.desc` as keyof Dict);
      body.append(title, desc);
      if (entry.demoSound) {
        const btn = document.createElement('button');
        btn.className = 'btn btn-soft';
        btn.textContent = t('common.listen');
        btn.addEventListener('click', () => entry.demoSound!(audio));
        body.append(btn);
      }
      item.append(cv, body);
      list.append(item);
    }
  }
}
