// Werkstatt-Bibliothek: Liste der eigenen Level aus dem localStorage-Store,
// mit Spielen / Bearbeiten / Duplizieren / Löschen (Löschen als Zwei-Tap-
// Bestätigung statt window.confirm). "Neu" startet leer, "Aus Zufallslevel"
// nimmt den Quick-Generator als Grundgerüst.

import { parseLevel } from '../levels/schema';
import { generatedBrittleEdges } from '../levels/loader';
import { generateQuickLevel } from '../levels/quick';
import { randomSeed } from '../core/rng';
import { validateLevel, isShareable } from '../levels/validate';
import { encodeLevel } from '../levels/shareCodec';
import {
  blankLevel,
  clearDraft,
  draftUpdatedAt,
  exportPayload,
  importLevel,
  loadDraft,
  newCustomId,
  workshop,
  type CustomLevel,
} from '../workshop';
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
    b.dataset.armed = '1';
    // Modus-Karten warnen im Untertitel (Bernstein), schlichte Buttons im Text.
    const sub = b.querySelector<HTMLElement>('.mode-sub');
    const target = sub ?? b;
    const prev = target.textContent;
    target.textContent = `⚠ ${t('ws.discardConfirm')}`;
    sub?.classList.add('warn');
    setTimeout(() => {
      b.dataset.armed = '';
      target.textContent = prev;
      sub?.classList.remove('warn');
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
    const icons = document.createElement('div');
    icons.className = 'ws-icons';

    const btn = (label: string, cls: string, parent: HTMLElement, onClick: () => void): HTMLButtonElement => {
      const b = document.createElement('button');
      b.className = `btn ${cls}`;
      b.textContent = label;
      b.addEventListener('click', onClick);
      parent.append(b);
      return b;
    };
    /** Sekundäraktion: nur Icon, Beschriftung über die Tooltip-Blase
     *  ([data-tip] – auch auf Touch, siehe theme.css). */
    const iconBtn = (icon: string, tip: string, onClick: (b: HTMLButtonElement) => void): HTMLButtonElement => {
      const b = btn(icon, 'btn-ghost ws-icon', icons, () => onClick(b));
      b.dataset.tip = tip;
      return b;
    };

    btn(`▶ ${t('ed.play')}`, 'btn-primary', row, () => {
      panel.classList.add('hidden');
      opts.onPlay(JSON.parse(JSON.stringify(level.def)) as RawLevel);
    });
    const edit = btn(`✏️ ${t('ed.edit')}`, 'btn-ghost', row, () => {
      confirmDiscard(edit, () => {
        panel.classList.add('hidden');
        opts.onEdit(JSON.parse(JSON.stringify(level.def)) as RawLevel);
      });
    });

    iconBtn('⧉', t('ed.duplicate'), () => {
      workshop.duplicate(level.id, t('ed.copySuffix'));
      render();
    });
    iconBtn('🔗', t('ed.share'), (b) => {
      // Teilen nur mit grünen Pflicht-Badges: geteilte Level sind beweisbar lösbar.
      const flash = (text: string): void => {
        b.dataset.tip = text;
        setTimeout(() => (b.dataset.tip = t('ed.share')), 2500);
      };
      if (!isShareable(validateLevel(level.def))) return flash(t('ed.shareBlocked'));
      void (async () => {
        const url = `${location.origin}${location.pathname}#level=${await encodeLevel(level.def)}`;
        try {
          if (navigator.share) await navigator.share({ title: String(level.def.name ?? ''), url });
          else {
            await navigator.clipboard.writeText(url);
            flash(t('ed.shareCopied'));
          }
        } catch {
          /* abgebrochen */
        }
      })();
    });
    iconBtn('⇩', t('ed.export'), () => {
      const blob = new Blob([exportPayload(level.def)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `tiltr-level-${String(level.def.name ?? level.id).replace(/[^\wäöüÄÖÜß-]+/g, '_').toLowerCase()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
    // Löschen bleibt Zwei-Tap: der zweite Tap innerhalb von 3 s löscht.
    const del = iconBtn('🗑', t('ed.delete'), (b) => {
      if (b.dataset.armed === '1') {
        workshop.remove(level.id);
        render();
        return;
      }
      b.dataset.armed = '1';
      b.classList.add('armed');
      b.textContent = `🗑 ${t('ed.deleteConfirm')}`;
      b.dataset.tip = t('ed.deleteConfirm');
      setTimeout(() => {
        b.dataset.armed = '';
        b.classList.remove('armed');
        b.textContent = '🗑';
        b.dataset.tip = t('ed.delete');
      }, 3000);
    });
    del.classList.add('ws-danger');

    row.append(icons);
    return row;
  }

  function render(): void {
    list.replaceChildren();
    // Laufende Bearbeitung als Empfehlungs-Karte: „Weiter an …" mit
    // Größe + Datum führt zurück in den Editor.
    const draft = loadDraft();
    resumeBtn.classList.toggle('hidden', !draft);
    if (draft) {
      $('wsResumeTitle').textContent = t('ws.resume', { name: String(draft.name ?? '') });
      let size = '';
      try {
        const def = parseLevel(draft);
        size = def.floors.map((f) => `${f.size[0]}×${f.size[1]}`)[0]! + (def.floors.length > 1 ? ` · ${def.floors.length} ⧉` : '');
      } catch {
        size = '⚠';
      }
      const when = draftUpdatedAt();
      $('wsResumeMeta').textContent = [size, when ? formatDate(when.slice(0, 10)) : ''].filter(Boolean).join(' · ');
    }
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
      const generated = generateQuickLevel(randomSeed(), profile.preset);
      const def = JSON.parse(JSON.stringify(generated)) as RawLevel;
      def.id = newCustomId();
      def.name = t('ed.untitled');
      // Brüchige Wände EXPLIZIT einbacken: Im Editor sind sie damit
      // bearbeitbar wie jede andere Wand, und ein geteilter Link hängt
      // nicht mehr an der Zufalls-Formel des Generators.
      generated.floors.forEach((floor, i) => {
        const maze = (def.floors[i] as unknown as { maze: Record<string, unknown> }).maze;
        maze.brittle = [...(maze.brittle as unknown[]), ...generatedBrittleEdges(floor, generated.mirror)];
        maze.brittleChance = 0;
      });
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
