// Werkstatt-Bibliothek: Liste der eigenen Level aus dem localStorage-Store,
// mit Spielen / Bearbeiten / Duplizieren / Löschen (Löschen als Zwei-Tap-
// Bestätigung statt window.confirm). "Neu" startet leer, "Aus Zufallslevel"
// nimmt den Quick-Generator als Grundgerüst.

import { parseLevel } from '../levels/schema';
import { generateQuickLevel } from '../levels/quick';
import { randomSeed } from '../core/rng';
import { validateLevel, isShareable } from '../levels/validate';
import { encodeLevel } from '../levels/shareCodec';
import { blankLevel, clearDraft, exportPayload, importLevel, loadDraft, newCustomId, workshop, type CustomLevel } from '../workshop';
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
  const resumeBtn = $('wsResumeBtn');

  /* Ein vorhandener Bearbeitungs-Draft (reload-fest im localStorage) ist
     wertvoll: Aktionen, die ihn ersetzen würden (Neu, Zufall, Bearbeiten),
     verlangen eine Zwei-Tap-Bestätigung – wie das Löschen. */
  function confirmDiscard(b: HTMLButtonElement, action: () => void): void {
    if (!loadDraft() || b.dataset.armed === '1') {
      b.dataset.armed = '';
      clearDraft();
      action();
      return;
    }
    const prev = b.textContent;
    b.dataset.armed = '1';
    b.textContent = `⚠ ${t('ws.discardConfirm')}`;
    setTimeout(() => {
      b.dataset.armed = '';
      b.textContent = prev;
    }, 3000);
  }

  resumeBtn.addEventListener('click', () => {
    const draft = loadDraft();
    if (!draft) return;
    panel.classList.add('hidden');
    opts.onEdit(draft as RawLevel);
  });

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
    const edit = btn(`✏️ ${t('ed.edit')}`, 'btn-ghost', () => {
      confirmDiscard(edit, () => {
        panel.classList.add('hidden');
        opts.onEdit(JSON.parse(JSON.stringify(level.def)) as RawLevel);
      });
    });
    btn(`⧉ ${t('ed.duplicate')}`, 'btn-ghost', () => {
      workshop.duplicate(level.id, t('ed.copySuffix'));
      render();
    });
    const share = btn('🔗', 'btn-ghost', () => {
      // Teilen nur mit grünen Pflicht-Badges: geteilte Level sind beweisbar lösbar.
      if (!isShareable(validateLevel(level.def))) {
        share.textContent = `🔗 ${t('ed.shareBlocked')}`;
        setTimeout(() => (share.textContent = '🔗'), 2500);
        return;
      }
      void (async () => {
        const url = `${location.origin}${location.pathname}#level=${await encodeLevel(level.def)}`;
        try {
          if (navigator.share) {
            await navigator.share({ title: String(level.def.name ?? ''), url });
          } else {
            await navigator.clipboard.writeText(url);
            share.textContent = `🔗 ${t('ed.shareCopied')}`;
            setTimeout(() => (share.textContent = '🔗'), 2500);
          }
        } catch {
          /* abgebrochen */
        }
      })();
    });
    share.title = t('ed.share');
    const exp = btn('⇩', 'btn-ghost', () => {
      const blob = new Blob([exportPayload(level.def)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `tiltr-level-${String(level.def.name ?? level.id).replace(/[^\wäöüÄÖÜß-]+/g, '_').toLowerCase()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
    exp.title = t('ed.export');
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
    // Laufende Bearbeitung anbieten: „Weiter an …" führt zurück in den Editor.
    const draft = loadDraft();
    resumeBtn.classList.toggle('hidden', !draft);
    if (draft) resumeBtn.textContent = `✏️ ${t('ws.resume', { name: String(draft.name ?? '') })}`;
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

  $('wsNewBtn').addEventListener('click', (ev) => {
    confirmDiscard(ev.currentTarget as HTMLButtonElement, () => {
      panel.classList.add('hidden');
      opts.onEdit(blankLevel(t('ed.untitled')) as RawLevel);
    });
  });
  /* --- Import: Datei ODER Einfüge-Textfeld (Tablet-freundlich) --- */
  const importBox = $('wsImportBox');
  const importText = $<HTMLTextAreaElement>('wsImportText');
  const importStatus = $('wsImportStatus');
  const finishImport = (level: CustomLevel | null): void => {
    importStatus.textContent = level ? t('ed.importOk', { name: String(level.def.name ?? level.id) }) : t('ed.importBad');
    if (level) {
      importText.value = '';
      render();
    }
  };
  $('wsImportBtn').addEventListener('click', () => {
    importBox.classList.toggle('hidden');
    importStatus.textContent = '';
  });
  $('wsImportGo').addEventListener('click', () => finishImport(importLevel(importText.value)));
  $('wsImportFile').addEventListener('click', () => $('wsImportInput').click());
  $<HTMLInputElement>('wsImportInput').addEventListener('change', (ev) => {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    void file.text().then((text) => finishImport(importLevel(text)));
    (ev.target as HTMLInputElement).value = '';
  });

  $('wsNewRandomBtn').addEventListener('click', (ev) => {
    confirmDiscard(ev.currentTarget as HTMLButtonElement, () => {
      // Quick-Generator als Grundgerüst: neue ID + editierbarer Name.
      const def = JSON.parse(JSON.stringify(generateQuickLevel(randomSeed(), profile.preset))) as RawLevel;
      def.id = newCustomId();
      def.name = t('ed.untitled');
      panel.classList.add('hidden');
      opts.onEdit(def);
    });
  });

  return {
    refresh: render,
    show(): void {
      render();
      panel.classList.remove('hidden');
    },
  };
}
