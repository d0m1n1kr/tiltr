// Werkstatt-Bibliothek (M40: Level-BUNDLES). Die Werkstatt zeigt immer EIN
// Bundle: oben die Bundle-Leiste (Umschalter, ＋, ✎ Titel/Beschreibung, ⇩
// Export, 🗑, ▶ „Weiter bei …"), darunter die Level des Bundles in
// Spielreihenfolge mit ▲▼ zum Sortieren und den bekannten Aktionen (Spielen /
// Bearbeiten / Duplizieren / Teilen / Export / Löschen als Zwei-Tap).
// Import nimmt Level (JSON, Teilen-Link) mit WÄHLBAREM Ziel-Bundle – und
// ganze Bundle-Dateien, die eine ältere Kopie derselben ID ersetzen.

import { parseLevel } from '../levels/schema';
import { EXPORT_EXT, saveTextFile } from './download';
import { generatedBrittleEdges } from '../levels/loader';
import { generateQuickLevel } from '../levels/quick';
import { randomSeed } from '../core/rng';
import { validateLevel, isShareable } from '../levels/validate';
import { encodeLevel } from '../levels/shareCodec';
import {
  blankLevel,
  bundleProgress,
  bundles,
  clearDraft,
  draftUpdatedAt,
  exportPayload,
  importRaw,
  loadDraft,
  newCustomId,
  parseAny,
  workshop,
  type Bundle,
  type CustomLevel,
} from '../workshop';
import { profile } from '../profile';
import { t, formatDate } from '../i18n';
import type { RawLevel } from './editor';

const fmtTime = (s: number) => `${s.toFixed(1)} s`;
const NEW_TARGET = '__new__';

export interface WorkshopPanelApi {
  refresh(): void;
  show(): void;
  /** Werkstatt mit geöffnetem Import-Feld und vorbelegtem Text zeigen – der
   *  Nutzer wählt das Ziel-Bundle und übernimmt (Teilen-Link aus dem Hash). */
  showImport(text: string): void;
}

export function setupWorkshopPanel(opts: {
  onPlay: (def: RawLevel) => void;
  onPlayBundle: (bundleId: string, index: number) => void;
  onEdit: (def: RawLevel) => void;
  /** Der Bestand hat sich geändert (Löschen, Duplizieren, Import) – das
   *  Menü zeigt die Anzahl, muss also mitziehen. */
  onChanged: () => void;
}): WorkshopPanelApi {
  const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
  const panel = $('workshop');
  const list = $('workshopList');
  const empty = $('wsEmpty');
  const resumeBtn = $('wsResumeBtn');
  const bundleSelect = $<HTMLSelectElement>('wsBundleSelect');
  const bundleForm = $('wsBundleForm');
  const bundleTitle = $<HTMLInputElement>('wsBundleTitle');
  const bundleDescInput = $<HTMLTextAreaElement>('wsBundleDescInput');

  const slug = (s: string) => s.replace(/[^\wäöüÄÖÜß-]+/g, '_').toLowerCase();

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

  /** Zwei-Tap-Bewaffnung eines Buttons: zweiter Tap innerhalb 3 s führt aus. */
  function twoTap(b: HTMLButtonElement, armedText: string, action: () => void): void {
    if (b.dataset.armed === '1') {
      b.dataset.armed = '';
      b.classList.remove('armed');
      action();
      return;
    }
    const prevText = b.textContent;
    const prevTip = b.dataset.tip;
    b.dataset.armed = '1';
    b.classList.add('armed');
    b.textContent = armedText;
    b.dataset.tip = armedText;
    setTimeout(() => {
      if (b.dataset.armed !== '1') return;
      b.dataset.armed = '';
      b.classList.remove('armed');
      b.textContent = prevText;
      if (prevTip !== undefined) b.dataset.tip = prevTip;
    }, 3000);
  }

  resumeBtn.addEventListener('click', () => {
    const draft = loadDraft();
    if (!draft) return;
    panel.classList.add('hidden');
    opts.onEdit(draft as RawLevel);
  });

  /* --- Bundle-Leiste ------------------------------------------------------- */

  function renderBundleBar(current: Bundle | null): void {
    bundleSelect.replaceChildren();
    for (const b of bundles.list()) {
      const o = document.createElement('option');
      o.value = b.id;
      o.textContent = `${b.title || t('ed.untitled')} (${b.levels.length})`;
      o.selected = current?.id === b.id;
      bundleSelect.append(o);
    }
    bundleSelect.disabled = !current;
    $('wsBundleDesc').textContent = current?.description ?? '';
    const play = $<HTMLButtonElement>('wsBundlePlay');
    const meta = $('wsBundleMeta');
    // Formular (Titel/Beschreibung) spiegelt das Bundle – aber nie in ein Feld
    // schreiben, in dem gerade getippt wird (Caret, Leerzeichen am Ende).
    if (!current) bundleForm.classList.add('hidden');
    if (current && !bundleForm.classList.contains('hidden')) {
      if (document.activeElement !== bundleTitle) bundleTitle.value = current.title;
      if (document.activeElement !== bundleDescInput) bundleDescInput.value = current.description;
    }
    if (!current || !current.levels.length) {
      play.textContent = t('ws.bundle.playStart');
      play.disabled = true;
      meta.textContent = current ? t('ws.bundle.version', { n: current.version }) : '';
      return;
    }
    const prog = bundleProgress(current, (id) => profile.bestFor(id));
    // Weiter dort, wo zuletzt aufgehört wurde – aber nie hinter einem noch
    // gesperrten Level (das Profil merkt sich den letzten Index).
    const last = profile.bundlePos(current.id);
    const resume = last !== null && last < current.levels.length && prog.unlocked(last) ? last : prog.resume;
    const lvl = current.levels[resume]!;
    play.textContent = t('ws.bundle.play', { n: resume + 1, name: String(lvl.def.name ?? lvl.id) });
    play.disabled = false;
    play.onclick = () => {
      panel.classList.add('hidden');
      opts.onPlayBundle(current.id, resume);
    };
    meta.textContent = `${t('ws.bundle.progress', { done: prog.done, total: current.levels.length })} · ${t('ws.bundle.version', { n: current.version })}`;
  }

  bundleSelect.addEventListener('change', () => {
    bundles.setCurrent(bundleSelect.value);
    bundleForm.classList.add('hidden');
    render();
  });
  $('wsBundleNew').addEventListener('click', () => {
    bundles.create(t('ws.bundle.newTitle'));
    bundleForm.classList.remove('hidden');
    render();
    bundleTitle.focus();
    bundleTitle.select();
  });
  $('wsBundleEdit').addEventListener('click', () => {
    if (!bundles.current()) return;
    bundleForm.classList.toggle('hidden');
    render();
    if (!bundleForm.classList.contains('hidden')) bundleTitle.focus();
  });
  const commitForm = (): void => {
    const cur = bundles.current();
    if (!cur) return;
    bundles.update(cur.id, { title: bundleTitle.value.trim() || t('ed.untitled'), description: bundleDescInput.value.trim() });
    render();
  };
  bundleTitle.addEventListener('change', commitForm);
  bundleTitle.addEventListener('input', commitForm);
  bundleDescInput.addEventListener('change', commitForm);
  bundleDescInput.addEventListener('input', commitForm);
  $('wsBundleExport').addEventListener('click', () => {
    const cur = bundles.current();
    if (!cur) return;
    const text = bundles.exportFile(cur.id);
    if (!text) return;
    const b = bundles.get(cur.id)!;
    void saveTextFile(`tiltr-bundle-${slug(b.title || b.id)}-v${b.version}${EXPORT_EXT}`, text, 'file');
    render();
  });
  $('wsBundleDelete').addEventListener('click', (ev) => {
    const cur = bundles.current();
    if (!cur) return;
    twoTap(ev.currentTarget as HTMLButtonElement, `🗑 ${t('ws.bundle.deleteConfirm', { n: cur.levels.length })}`, () => {
      bundles.remove(cur.id);
      bundleForm.classList.add('hidden');
      render();
    });
  });

  /* --- Level-Karten -------------------------------------------------------- */

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
      const name = `tiltr-level-${slug(String(level.def.name ?? level.id))}${EXPORT_EXT}`;
      void saveTextFile(name, exportPayload(level.def), 'file');
    });
    // Löschen bleibt Zwei-Tap: der zweite Tap innerhalb von 3 s löscht.
    const del = iconBtn('🗑', t('ed.delete'), (b) => {
      twoTap(b, `🗑 ${t('ed.deleteConfirm')}`, () => {
        workshop.remove(level.id);
        render();
      });
    });
    del.classList.add('ws-danger');

    row.append(icons);
    return row;
  }

  function render(): void {
    // Eine Quelle für „was ist da": Wer die Liste neu zeichnet, meldet auch
    // dem Menü den Stand – sonst hängt der Zähler nach dem Löschen fest.
    opts.onChanged();
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
    const current = bundles.current();
    renderBundleBar(current);
    renderImportTargets();
    const levels = current?.levels ?? [];
    empty.classList.toggle('hidden', levels.length > 0);
    levels.forEach((level, i) => {
      const item = document.createElement('div');
      item.className = 'panel ws-item';
      item.dataset.levelId = level.id;
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
      name.textContent = `${i + 1}. ${broken ? '⚠ ' : ''}${String(level.def.name ?? level.id)}`;
      const meta = document.createElement('span');
      meta.className = 'ws-meta';
      const best = profile.bestFor(level.id);
      meta.textContent = [sizeLabel, formatDate(level.updatedAt.slice(0, 10)), best !== null ? fmtTime(best) : '']
        .filter(Boolean)
        .join(' · ');
      // ▲▼: Spielreihenfolge im Bundle (die Karte selbst bleibt der Ort dafür –
      // Drag & Drop ist auf Touch unzuverlässig und unsichtbar).
      const order = document.createElement('div');
      order.className = 'ws-order';
      const mv = (icon: string, tip: string, to: number, enabled: boolean): void => {
        const b = document.createElement('button');
        b.className = 'btn btn-ghost ws-icon ws-move';
        b.textContent = icon;
        b.dataset.tip = tip;
        b.disabled = !enabled;
        b.addEventListener('click', () => {
          if (current && bundles.move(current.id, i, to)) render();
        });
        order.append(b);
      };
      mv('▲', t('ws.bundle.up'), i - 1, i > 0);
      mv('▼', t('ws.bundle.down'), i + 1, i < levels.length - 1);
      head.append(name, meta);
      const top = document.createElement('div');
      top.className = 'ws-top';
      top.append(head, order);
      item.append(top, itemActions(level));
      list.append(item);
    });
  }

  $('workshopBtn').addEventListener('click', () => {
    render();
    panel.classList.remove('hidden');
  });
  $('workshopClose').addEventListener('click', () => panel.classList.add('hidden'));

  $('wsNewBtn').addEventListener('click', (ev) => {
    confirmDiscard(ev.currentTarget as HTMLButtonElement, () => {
      bundles.currentOrCreate(t('ws.bundle.defaultTitle'));
      panel.classList.add('hidden');
      opts.onEdit(blankLevel(t('ed.untitled')) as RawLevel);
    });
  });

  /* --- Import: Datei ODER Einfüge-Textfeld, Ziel-Bundle wählbar ---------- */
  const importBox = $('wsImportBox');
  const importText = $<HTMLTextAreaElement>('wsImportText');
  const importStatus = $('wsImportStatus');
  const importTarget = $<HTMLSelectElement>('wsImportTarget');
  const importGo = $<HTMLButtonElement>('wsImportGo');

  function renderImportTargets(): void {
    // Eine explizit gewählte Bundle-Option bleibt; „Neues Bundle" bleibt NICHT
    // stehen – nach dem Import folgt die Auswahl dem (neuen) aktuellen Bundle,
    // sonst legte jeder weitere Import wieder ein Bundle an.
    const keep = importTarget.value && importTarget.value !== NEW_TARGET && bundles.get(importTarget.value) ? importTarget.value : null;
    importTarget.replaceChildren();
    const cur = bundles.currentId();
    const all = bundles.list();
    for (const b of all) {
      const o = document.createElement('option');
      o.value = b.id;
      o.textContent = b.title || t('ed.untitled');
      o.selected = keep ? keep === b.id : cur === b.id;
      importTarget.append(o);
    }
    const o = document.createElement('option');
    o.value = NEW_TARGET;
    o.textContent = t('ws.import.newBundle');
    o.selected = !all.length;
    importTarget.append(o);
  }

  /** Ziel-Bundle aus der Auswahl (legt ein neues an, wenn gewünscht; das
   *  allererste heißt „Meine Level", ein bewusst gewähltes „Neues Bundle"). */
  function targetBundleId(): string {
    if (importTarget.value !== NEW_TARGET && bundles.get(importTarget.value)) return importTarget.value;
    const b = bundles.create(bundles.list().length ? t('ws.bundle.newTitle') : t('ws.bundle.defaultTitle'));
    return b.id;
  }

  const finishLevel = (level: CustomLevel | null): void => {
    importStatus.textContent = level ? t('ed.importOk', { name: String(level.def.name ?? level.id) }) : t('ed.importBad');
    if (level) {
      importText.value = '';
      bundles.setCurrent(workshop.bundleOf(level.id)?.id ?? null);
      render();
    }
  };

  /** Text übernehmen: Bundle-Datei (ersetzt ältere Kopie, Zwei-Tap bei
   *  gleicher/älterer Version) oder Einzel-Level ins gewählte Ziel-Bundle. */
  function handleImport(text: string, b: HTMLButtonElement): void {
    const bundleFile = bundles.parseFile(text);
    if (bundleFile) {
      const apply = (): void => {
        const saved = bundles.applyFile(bundleFile.incoming);
        importStatus.textContent = t('ws.import.bundleOk', { title: saved.title, n: saved.version, levels: saved.levels.length });
        importText.value = '';
        render();
      };
      if (bundleFile.newer) return apply();
      if (b.dataset.armed === '1') {
        b.dataset.armed = '';
        b.classList.remove('armed');
        return apply();
      }
      importStatus.textContent = t('ws.import.bundleAsk', {
        title: bundleFile.existing?.title ?? bundleFile.incoming.title,
        old: bundleFile.existing?.version ?? 0,
        new: bundleFile.incoming.version,
      });
      b.dataset.armed = '1';
      b.classList.add('armed');
      setTimeout(() => {
        b.dataset.armed = '';
        b.classList.remove('armed');
      }, 8000);
      return;
    }
    void parseAny(text).then((raw) => finishLevel(raw ? importRaw(raw, targetBundleId()) : null));
  }

  $('wsImportBtn').addEventListener('click', () => {
    importBox.classList.toggle('hidden');
    importStatus.textContent = '';
    renderImportTargets();
  });
  importGo.addEventListener('click', () => handleImport(importText.value, importGo));
  // 📋 Zwischenablage: In der installierten PWA ist „Link einfügen" sonst
  // Langdruck im Textfeld. readText braucht eine Nutzergeste (die haben wir)
  // und kann fehlen (kein HTTPS, alter Browser) oder verweigert werden –
  // beides landet als EIN Hinweis in der Statuszeile, das Textfeld bleibt.
  $('wsImportPaste').addEventListener('click', () => {
    const clip = navigator.clipboard;
    if (!clip || typeof clip.readText !== 'function') {
      importStatus.textContent = t('ed.pasteFail');
      return;
    }
    clip.readText().then(
      (txt) => {
        importText.value = txt;
        handleImport(txt, importGo);
      },
      () => {
        importStatus.textContent = t('ed.pasteFail');
      },
    );
  });
  $('wsImportFile').addEventListener('click', () => $('wsImportInput').click());
  $<HTMLInputElement>('wsImportInput').addEventListener('change', (ev) => {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    void file.text().then((text) => {
      importText.value = text;
      handleImport(text, importGo);
    });
    (ev.target as HTMLInputElement).value = '';
  });

  $('wsNewRandomBtn').addEventListener('click', (ev) => {
    confirmDiscard(ev.currentTarget as HTMLButtonElement, () => {
      bundles.currentOrCreate(t('ws.bundle.defaultTitle'));
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
    showImport(text: string): void {
      render();
      panel.classList.remove('hidden');
      importBox.classList.remove('hidden');
      importText.value = text;
      importStatus.textContent = t('ws.import.pickTarget');
      renderImportTargets();
    },
  };
}
