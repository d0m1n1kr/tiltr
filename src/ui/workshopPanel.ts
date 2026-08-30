// Werkstatt-Bibliothek: Liste der eigenen Level aus dem localStorage-Store,
// mit Spielen / Bearbeiten / Duplizieren / Löschen (Löschen als Zwei-Tap-
// Bestätigung statt window.confirm). "Neu" startet leer, "Aus Zufallslevel"
// nimmt den Quick-Generator als Grundgerüst.

import { parseLevel } from '../levels/schema';
import { generateQuickLevel } from '../levels/quick';
import { randomSeed } from '../core/rng';
import { blankLevel, newCustomId, workshop, type CustomLevel } from '../workshop';
import { profile } from '../profile';
import { t, formatDate } from '../i18n';
import type { RawLevel } from './editor';

const fmtTime = (s: number) => `${s.toFixed(1)} s`;

export interface WorkshopPanelApi {
  refresh(): void;
  show(): void;
}

export function setupWorkshopPanel(opts: {
  onPlay: (def: RawLevel) => void;
  onEdit: (def: RawLevel) => void;
}): WorkshopPanelApi {
  const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
  const panel = $('workshop');
  const list = $('workshopList');
  const empty = $('wsEmpty');

  function itemActions(level: CustomLevel): HTMLElement {
    const row = document.createElement('div');
    row.className = 'ws-actions';
    const btn = (label: string, cls: string, onClick: () => void): HTMLButtonElement => {
      const b = document.createElement('button');
      b.className = `btn ${cls}`;
      b.textContent = label;
      b.addEventListener('click', onClick);
      row.append(b);
      return b;
    };
    btn(`▶ ${t('ed.play')}`, 'btn-primary', () => {
      panel.classList.add('hidden');
      opts.onPlay(JSON.parse(JSON.stringify(level.def)) as RawLevel);
    });
    btn(`✏️ ${t('ed.edit')}`, 'btn-ghost', () => {
      panel.classList.add('hidden');
      opts.onEdit(JSON.parse(JSON.stringify(level.def)) as RawLevel);
    });
    btn(`⧉ ${t('ed.duplicate')}`, 'btn-ghost', () => {
      workshop.duplicate(level.id, t('ed.copySuffix'));
      render();
    });
    const del = btn(`🗑 ${t('ed.delete')}`, 'btn-ghost', () => {
      if (del.dataset.armed === '1') {
        workshop.remove(level.id);
        render();
      } else {
        del.dataset.armed = '1';
        del.textContent = `🗑 ${t('ed.deleteConfirm')}`;
        setTimeout(() => {
          del.dataset.armed = '';
          del.textContent = `🗑 ${t('ed.delete')}`;
        }, 3000);
      }
    });
    return row;
  }

  function render(): void {
    list.replaceChildren();
    const levels = workshop.list();
    empty.classList.toggle('hidden', levels.length > 0);
    for (const level of levels) {
      const item = document.createElement('div');
      item.className = 'panel ws-item';
      const head = document.createElement('div');
      head.className = 'ws-head';
      const name = document.createElement('span');
      name.className = 'ws-name';
      // Roh-Check: lädt das Level? (voller Beweis läuft im Editor als Badges)
      let sizeLabel = '';
      let broken = false;
      try {
        const def = parseLevel(level.def);
        const [c, r] = def.floors[0]!.size;
        sizeLabel = `${c}×${r}`;
      } catch {
        broken = true;
      }
      name.textContent = `${broken ? '⚠ ' : ''}${String(level.def.name ?? level.id)}`;
      const meta = document.createElement('span');
      meta.className = 'ws-meta';
      const best = profile.bestFor(level.id);
      meta.textContent = [sizeLabel, formatDate(level.updatedAt.slice(0, 10)), best !== null ? fmtTime(best) : '']
        .filter(Boolean)
        .join(' · ');
      head.append(name, meta);
      item.append(head, itemActions(level));
      list.append(item);
    }
  }

  $('workshopBtn').addEventListener('click', () => {
    render();
    panel.classList.remove('hidden');
  });
  $('workshopClose').addEventListener('click', () => panel.classList.add('hidden'));

  $('wsNewBtn').addEventListener('click', () => {
    panel.classList.add('hidden');
    opts.onEdit(blankLevel(t('ed.untitled')) as RawLevel);
  });
  $('wsNewRandomBtn').addEventListener('click', () => {
    // Quick-Generator als Grundgerüst: neue ID + editierbarer Name.
    const def = JSON.parse(JSON.stringify(generateQuickLevel(randomSeed(), profile.preset))) as RawLevel;
    def.id = newCustomId();
    def.name = t('ed.untitled');
    panel.classList.add('hidden');
    opts.onEdit(def);
  });

  return {
    refresh: render,
    show(): void {
      render();
      panel.classList.remove('hidden');
    },
  };
}
