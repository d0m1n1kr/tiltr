// Werkstatt: eigene Level in localStorage, seit M40 in LEVEL-BUNDLES.
// Ein Bundle ist eine geordnete Level-Reihe mit Titel, Beschreibung, ID und
// Version – spielbar wie eine Kampagne, als Ganzes exportier- und
// importierbar (gleiche ID + höhere Version ersetzt). Die Werkstatt zeigt
// immer EIN Bundle (das „aktuelle"); der Editor speichert in das Bundle, das
// das Level bereits enthält, sonst ins aktuelle.
//
// Fehlertolerant wie das Profil – ohne Storage (Private Mode) läuft der
// Editor, nur Speichern schlägt sichtbar fehl. Gespeichert wird die ROHE Def
// (unparsed): Editor und Loader validieren beim Laden über parseLevel.

import { parseLevel, type LevelDef } from './levels/schema';
import { decodeLevel } from './levels/shareCodec';
import { decodeDuel } from './levels/duel';

const KEY_V1 = 'tiltr.workshop.v1';
const KEY = 'tiltr.workshop.v2';
const CURRENT_KEY = 'tiltr.workshop.current';

/** Dateiformate für Export/Import. */
export const FILE_FORMAT = 'tiltr-level';
export const BUNDLE_FORMAT = 'tiltr-bundle';

export interface CustomLevel {
  /** identisch mit def.id ('custom-…' bei eigenen, 'w1-01' bei importierten Kampagnen) */
  id: string;
  /** rohe LevelDef-Daten (parseLevel-kompatibel) */
  def: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Bundle {
  /** 'bundle-<base36>' bei eigenen, 'builtin-w<n>' bei importierten Welten */
  id: string;
  /** zählt bei jedem Export hoch; Import gleicher ID ersetzt nur bei höherer Version ungefragt */
  version: number;
  title: string;
  description: string;
  /** GEORDNET – die Spielreihenfolge */
  levels: CustomLevel[];
  createdAt: string;
  updatedAt: string;
}

interface WorkshopData {
  v: 2;
  bundles: Bundle[];
}

/** Datei-Hülle eines exportierten Bundles. */
export interface BundleFile {
  format: typeof BUNDLE_FORMAT;
  version: 1;
  bundle: { id: string; version: number; title: string; description: string; levels: Record<string, unknown>[] };
}

const nowIso = () => new Date().toISOString();

const isLevel = (l: unknown): l is CustomLevel =>
  typeof l === 'object' && l !== null && typeof (l as CustomLevel).id === 'string' && !!(l as CustomLevel).def;

function sanitizeBundle(b: unknown): Bundle | null {
  if (typeof b !== 'object' || b === null) return null;
  const o = b as Partial<Bundle>;
  if (typeof o.id !== 'string') return null;
  const t = nowIso();
  return {
    id: o.id,
    version: typeof o.version === 'number' && isFinite(o.version) ? o.version : 1,
    title: typeof o.title === 'string' ? o.title : '',
    description: typeof o.description === 'string' ? o.description : '',
    levels: Array.isArray(o.levels) ? o.levels.filter(isLevel) : [],
    createdAt: typeof o.createdAt === 'string' ? o.createdAt : t,
    updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : t,
  };
}

/* ID-Helfer stehen VOR load(): Die Migration ruft newBundleId() beim
   Modulstart, und ein `let` weiter unten wäre dort noch nicht initialisiert
   (TDZ) – der Fehler verschwand still im try/catch von load(). */
/** Laufende Nummer je Sitzung: Zwei IDs in derselben Millisekunde müssen sich
 *  unterscheiden – zwei Zufallszeichen allein taten das nur mit 1295:1296, und
 *  auf einem schnellen CI-Läufer speicherte ein Test zwei Level in EINER
 *  Millisekunde: Kollision, Upsert, ein Level weg (v2.8.0, roter Deploy). */
let idSeq = 0;
function uniqueTail(): string {
  idSeq = (idSeq + 1) % 1296;
  const seq = idSeq.toString(36).padStart(2, '0');
  const rnd = Math.floor(Math.random() * 1296).toString(36).padStart(2, '0');
  return `${Date.now().toString(36)}${seq}${rnd}`;
}

export function newCustomId(): string {
  return `custom-${uniqueTail()}`;
}

export function newBundleId(): string {
  return `bundle-${uniqueTail()}`;
}

/** v1 (flache Level-Liste) → EIN Bundle „Meine Level", älteste zuerst – so
 *  wird aus der Bibliothek eine spielbare Reihe. Der v1-Schlüssel bleibt
 *  stehen (ein Backup einer älteren App-Version liest ihn noch). */
export function migrateV1(raw: string | null, title: string): WorkshopData {
  const empty: WorkshopData = { v: 2, bundles: [] };
  if (!raw) return empty;
  try {
    const parsed = JSON.parse(raw) as { levels?: unknown };
    const levels = Array.isArray(parsed.levels) ? parsed.levels.filter(isLevel) : [];
    if (!levels.length) return empty;
    levels.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
    const t = nowIso();
    return { v: 2, bundles: [{ id: newBundleId(), version: 1, title, description: '', levels, createdAt: t, updatedAt: t }] };
  } catch {
    return empty;
  }
}

function load(): WorkshopData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<WorkshopData>;
      const bundles = Array.isArray(parsed.bundles) ? parsed.bundles.map(sanitizeBundle).filter((b): b is Bundle => !!b) : [];
      return { v: 2, bundles };
    }
    const migrated = migrateV1(localStorage.getItem(KEY_V1), 'Meine Level');
    if (migrated.bundles.length) {
      try {
        localStorage.setItem(KEY, JSON.stringify(migrated));
      } catch {
        /* Storage voll: Migration lebt dann nur im Speicher */
      }
    }
    return migrated;
  } catch {
    return { v: 2, bundles: [] };
  }
}

const data = load();

/** true = gespeichert; false = Storage nicht verfügbar/voll (UI warnt). */
function save(): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}


/** Bundle-Version aus der App-Version: 2.10.3 → 21003 (vergleichbar). */
export function versionNumber(appVersion: string): number {
  const [a = 0, b = 0, c = 0] = appVersion.split('.').map((x) => Number(x) || 0);
  return a * 10000 + b * 100 + c;
}

function findLevel(id: string): { bundle: Bundle; level: CustomLevel; index: number } | null {
  for (const bundle of data.bundles) {
    const index = bundle.levels.findIndex((l) => l.id === id);
    if (index !== -1) return { bundle, level: bundle.levels[index]!, index };
  }
  return null;
}

function touch(b: Bundle): void {
  b.updatedAt = nowIso();
}

/* --- Bundles ------------------------------------------------------------- */

export const bundles = {
  /** Zuletzt geändert zuerst. */
  list(): Bundle[] {
    return data.bundles
      .map((b, i) => ({ b, i }))
      .sort((x, y) => (x.b.updatedAt === y.b.updatedAt ? y.i - x.i : x.b.updatedAt < y.b.updatedAt ? 1 : -1))
      .map((x) => x.b);
  },

  get(id: string): Bundle | null {
    return data.bundles.find((b) => b.id === id) ?? null;
  },

  create(title: string, description = ''): Bundle {
    const t = nowIso();
    const b: Bundle = { id: newBundleId(), version: 1, title, description, levels: [], createdAt: t, updatedAt: t };
    data.bundles.push(b);
    save();
    bundles.setCurrent(b.id);
    return b;
  },

  update(id: string, patch: { title?: string; description?: string }): boolean {
    const b = bundles.get(id);
    if (!b) return false;
    if (patch.title !== undefined) b.title = patch.title;
    if (patch.description !== undefined) b.description = patch.description;
    touch(b);
    return save();
  },

  remove(id: string): void {
    const i = data.bundles.findIndex((b) => b.id === id);
    if (i === -1) return;
    data.bundles.splice(i, 1);
    save();
    if (bundles.currentId() === id) bundles.setCurrent(data.bundles[0]?.id ?? null);
  },

  /** Das in der Werkstatt gezeigte Bundle (reload-fest). Fällt auf das
   *  zuletzt geänderte zurück, wenn das gemerkte nicht mehr existiert. */
  currentId(): string | null {
    let id: string | null = null;
    try {
      id = localStorage.getItem(CURRENT_KEY);
    } catch {
      /* ohne Storage: kein gemerktes */
    }
    if (id && bundles.get(id)) return id;
    return bundles.list()[0]?.id ?? null;
  },

  current(): Bundle | null {
    const id = bundles.currentId();
    return id ? bundles.get(id) : null;
  },

  setCurrent(id: string | null): void {
    try {
      if (id) localStorage.setItem(CURRENT_KEY, id);
      else localStorage.removeItem(CURRENT_KEY);
    } catch {
      /* ohne Storage merkt sich die Werkstatt nichts */
    }
  },

  /** Aktuelles Bundle – oder ein frisches, wenn es noch keins gibt (der erste
   *  Speicher-/Import-Vorgang braucht ein Zuhause). */
  currentOrCreate(title: string): Bundle {
    return bundles.current() ?? bundles.create(title);
  },

  /** Level innerhalb eines Bundles verschieben (Spielreihenfolge). */
  move(bundleId: string, from: number, to: number): boolean {
    const b = bundles.get(bundleId);
    if (!b || from < 0 || from >= b.levels.length || to < 0 || to >= b.levels.length || from === to) return false;
    const [l] = b.levels.splice(from, 1);
    b.levels.splice(to, 0, l!);
    touch(b);
    return save();
  },

  /** Export als Datei-Text; zählt die Version HOCH und speichert – jede
   *  weitergegebene Datei ist damit eindeutig neuer als ihre Vorgängerin. */
  exportFile(id: string): string | null {
    const b = bundles.get(id);
    if (!b) return null;
    b.version += 1;
    touch(b);
    save();
    const file: BundleFile = {
      format: BUNDLE_FORMAT,
      version: 1,
      bundle: { id: b.id, version: b.version, title: b.title, description: b.description, levels: b.levels.map((l) => l.def) },
    };
    return JSON.stringify(file, null, 2);
  },

  /** Bundle-Datei lesen und prüfen (jedes Level muss parsen), OHNE zu
   *  speichern. `existing` = gleiche ID ist schon da; `newer` = die Datei ist
   *  neuer als der Bestand (dann ersetzt der Import ungefragt). */
  parseFile(text: string): { incoming: BundleFile['bundle']; existing: Bundle | null; newer: boolean } | null {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return null;
    }
    if (typeof parsed !== 'object' || parsed === null) return null;
    const o = parsed as Partial<BundleFile>;
    if (o.format !== BUNDLE_FORMAT || typeof o.bundle !== 'object' || !o.bundle) return null;
    const b = o.bundle as Partial<BundleFile['bundle']>;
    if (typeof b.id !== 'string' || !Array.isArray(b.levels)) return null;
    for (const def of b.levels) {
      try {
        parseLevel(def);
      } catch {
        return null;
      }
    }
    const incoming: BundleFile['bundle'] = {
      id: b.id,
      version: typeof b.version === 'number' && isFinite(b.version) ? b.version : 1,
      title: typeof b.title === 'string' ? b.title : '',
      description: typeof b.description === 'string' ? b.description : '',
      levels: b.levels as Record<string, unknown>[],
    };
    const existing = bundles.get(incoming.id);
    return { incoming, existing, newer: !existing || incoming.version > existing.version };
  },

  /** Geprüftes Bundle übernehmen: gleiche ID ersetzt den Bestand (Fortschritt
   *  hängt an den Level-IDs und bleibt), Level-IDs, die in einem ANDEREN
   *  Bundle stecken, bekommen frische. Liefert das gespeicherte Bundle. */
  applyFile(incoming: BundleFile['bundle']): Bundle {
    const t = nowIso();
    const old = bundles.get(incoming.id);
    const levels: CustomLevel[] = incoming.levels.map((def) => {
      const copy = JSON.parse(JSON.stringify(def)) as Record<string, unknown>;
      let id = typeof copy.id === 'string' ? copy.id : newCustomId();
      const elsewhere = findLevel(id);
      if (elsewhere && elsewhere.bundle.id !== incoming.id) id = newCustomId();
      copy.id = id;
      const prev = old?.levels.find((l) => l.id === id);
      return { id, def: copy, createdAt: prev?.createdAt ?? t, updatedAt: t };
    });
    const b: Bundle = {
      id: incoming.id,
      version: incoming.version,
      title: incoming.title,
      description: incoming.description,
      levels,
      createdAt: old?.createdAt ?? t,
      updatedAt: t,
    };
    const i = data.bundles.findIndex((x) => x.id === incoming.id);
    if (i === -1) data.bundles.push(b);
    else data.bundles[i] = b;
    save();
    bundles.setCurrent(b.id);
    return b;
  },

  /** Eingebaute Welt als Bundle (Debug-Modus): feste ID `builtin-w<n>`, die
   *  App-Version als Bundle-Version – ein erneuter Import ersetzt die Kopie.
   *  Die Defs sind fertig gespiegelt (mirror gesetzt); der Editor rechnet
   *  damit wie der Loader. */
  importBuiltin(n: number, title: string, description: string, levels: LevelDef[], appVersion: string): Bundle {
    return bundles.applyFile({
      id: `builtin-w${n}`,
      version: versionNumber(appVersion),
      title,
      description,
      levels: levels.map((l) => JSON.parse(JSON.stringify(l)) as Record<string, unknown>),
    });
  },
};

/** Fortschritt im Bundle: erster Level ohne Bestzeit (alles geschafft → 0),
 *  und ob Level i freigeschaltet ist (der Vorgänger hat eine Bestzeit).
 *  Rein – `best` kommt vom Profil. Zwei-Spieler-Level (M57, `players: 2`)
 *  zählen als ÜBERSPRUNGEN: Sie sind solo nicht spielbar, blockieren die
 *  Reihe also nicht und werden nie „weiter bei" – gespielt werden sie
 *  einzeln über „Zu zweit". */
export function bundleProgress(
  b: { levels: Array<{ id: string; def?: Record<string, unknown> }> },
  best: (id: string) => number | null,
): { resume: number; done: number; unlocked: (i: number) => boolean; skipped: (i: number) => boolean } {
  const skipped = b.levels.map((l) => l.def?.players === 2);
  const doneFlags = b.levels.map((l, i) => skipped[i] || best(l.id) !== null);
  const firstOpen = doneFlags.indexOf(false);
  return {
    resume: firstOpen === -1 ? 0 : firstOpen,
    done: doneFlags.filter((d, i) => d && !skipped[i]).length,
    unlocked: (i) => i === 0 || doneFlags[i - 1] === true,
    skipped: (i) => skipped[i] === true,
  };
}

/* --- Level (bundle-übergreifend, für Editor, Menü, Teilen) ---------------- */

export const workshop = {
  /** ALLE Level über alle Bundles, in Bundle- und Spielreihenfolge. */
  list(): CustomLevel[] {
    return bundles.list().flatMap((b) => b.levels);
  },

  get(id: string): CustomLevel | null {
    return findLevel(id)?.level ?? null;
  },

  /** In welchem Bundle steckt das Level? */
  bundleOf(id: string): Bundle | null {
    return findLevel(id)?.bundle ?? null;
  },

  /** Upsert über def.id: liegt das Level schon in einem Bundle, wird es dort
   *  aktualisiert; sonst kommt es ans Ende von `bundleId` (Default: das
   *  aktuelle Bundle, notfalls ein frisches „Meine Level"). */
  save(def: Record<string, unknown>, bundleId?: string, newBundleTitle = 'Meine Level'): boolean {
    const id = String(def.id ?? '');
    if (!id) return false;
    const now = nowIso();
    const hit = findLevel(id);
    if (hit) {
      hit.level.def = def;
      hit.level.updatedAt = now;
      touch(hit.bundle);
      return save();
    }
    const target = (bundleId ? bundles.get(bundleId) : null) ?? bundles.currentOrCreate(newBundleTitle);
    target.levels.push({ id, def, createdAt: now, updatedAt: now });
    touch(target);
    return save();
  },

  remove(id: string): void {
    const hit = findLevel(id);
    if (!hit) return;
    hit.bundle.levels.splice(hit.index, 1);
    touch(hit.bundle);
    save();
  },

  /** Kopie unter neuer ID direkt HINTER dem Original (Name mit Zusatz). */
  duplicate(id: string, nameSuffix: string): CustomLevel | null {
    const hit = findLevel(id);
    if (!hit) return null;
    const copy = JSON.parse(JSON.stringify(hit.level.def)) as Record<string, unknown>;
    const newId = newCustomId();
    copy.id = newId;
    copy.name = `${String(copy.name ?? '')} ${nameSuffix}`.trim();
    const now = nowIso();
    const level: CustomLevel = { id: newId, def: copy, createdAt: now, updatedAt: now };
    hit.bundle.levels.splice(hit.index + 1, 0, level);
    touch(hit.bundle);
    save();
    return level;
  },
};

/* --- Bearbeitungs-Draft: die EINE laufende Bearbeitung, reload-fest.
   Der Editor schreibt bei jeder Änderung; Speichern in die Bibliothek
   räumt den Draft (gesichert ist gesichert). Die Werkstatt bietet einen
   vorhandenen Draft als „Weiter an …" an und verlangt Bestätigung, bevor
   Neu/Zufall/Bearbeiten ihn ersetzen. --- */

const DRAFT_KEY = 'tiltr.workshop.draft.v1';

export function saveDraft(def: Record<string, unknown>): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ def, updatedAt: nowIso() }));
  } catch {
    /* Private Mode / Storage voll: Bearbeiten geht weiter, nur ohne Netz */
  }
}

export function loadDraft(): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { def?: unknown };
    return typeof parsed.def === 'object' && parsed.def !== null ? (parsed.def as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Zeitstempel der letzten Draft-Änderung (für die „Weiter an …"-Karte). */
export function draftUpdatedAt(): string | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { updatedAt?: unknown };
    return typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null;
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ohne Storage gibt es auch nichts zu räumen */
  }
}

/* --- Einzel-Level: Export/Import (JSON, Teilen-Link) ---------------------- */

/** Export-Hülle um eine rohe Def. */
export function exportPayload(def: Record<string, unknown>): string {
  return JSON.stringify({ format: FILE_FORMAT, version: 1, def }, null, 2);
}

/** Rohe Def aus JSON-Text: Export-Hülle ODER nackte Def, per parseLevel
 *  geprüft. null = kein Level (auch: eine Bundle-Datei ist KEIN Level). */
export function parseLevelText(text: string): Record<string, unknown> | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const obj = data as Record<string, unknown>;
  if (obj.format === BUNDLE_FORMAT) return null;
  const raw = obj.format === FILE_FORMAT && typeof obj.def === 'object' && obj.def ? (obj.def as Record<string, unknown>) : obj;
  try {
    parseLevel(raw);
  } catch {
    return null;
  }
  return raw;
}

/**
 * Import aus Datei/Zwischenablage: akzeptiert die Export-Hülle ODER eine
 * nackte Def, validiert per parseLevel, vergibt bei fremden/kollidierenden
 * IDs eine frische Werkstatt-ID und speichert ins Ziel-Bundle. null = kein
 * gültiges Level.
 */
export function importLevel(text: string, bundleId?: string): CustomLevel | null {
  const raw = parseLevelText(text);
  return raw ? importRaw(raw, bundleId) : null;
}

/** Rohe Def in ein Bundle: validieren, fremde/kollidierende IDs frisch
 *  vergeben, speichern. Gemeinsamer Endpunkt für JSON UND Teilen-Link. */
export function importRaw(raw: Record<string, unknown>, bundleId?: string): CustomLevel | null {
  try {
    parseLevel(raw);
  } catch {
    return null;
  }
  if (typeof raw.id !== 'string' || !raw.id.startsWith('custom-') || workshop.get(raw.id)) {
    raw.id = newCustomId();
  }
  return workshop.save(raw, bundleId) ? workshop.get(String(raw.id)) : null;
}

/** Teilen-Token aus freiem Text: kompletter Link, nackter Hash („#level=…")
 *  oder das Token allein (beginnt mit der Codec-Version 0/1). Duell-Links
 *  tragen das Level mit – auch das lässt sich in die Werkstatt holen. Rein,
 *  für Tests; null = das ist kein Teilen-Text. */
export function parseShareText(text: string): { kind: 'level' | 'duel'; token: string } | null {
  const s = text.trim();
  const m = s.match(/#(level|duel)=([A-Za-z0-9_-]{8,})/);
  if (m) return { kind: m[1] as 'level' | 'duel', token: m[2]! };
  if (/^[01][A-Za-z0-9_-]{8,}$/.test(s)) return { kind: 'level', token: s };
  return null;
}

/** Rohe Def aus JSON ODER Teilen-Link, OHNE zu speichern (das Panel fragt
 *  erst nach dem Ziel-Bundle). Ein geteilter Link öffnet immer den BROWSER,
 *  nie die installierte PWA – deshalb die zweite Quelle. */
export async function parseAny(text: string): Promise<Record<string, unknown> | null> {
  const viaJson = parseLevelText(text);
  if (viaJson) return viaJson;
  const share = parseShareText(text);
  if (!share) return null;
  try {
    const raw = share.kind === 'duel' ? (await decodeDuel(share.token)).def : await decodeLevel(share.token);
    parseLevel(raw);
    return raw as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Import aus JSON ODER Teilen-Link ins Ziel-Bundle (Default: aktuelles). */
export async function importAny(text: string, bundleId?: string): Promise<CustomLevel | null> {
  const raw = await parseAny(text);
  return raw ? importRaw(raw, bundleId) : null;
}

/** Leeres Startgerüst für ein neues Level (6x8, zufälliger Maze-Seed). */
export function blankLevel(name: string): Record<string, unknown> {
  return {
    id: newCustomId(),
    name,
    pingBudget: 3,
    floors: [
      {
        size: [6, 8],
        maze: { seed: Math.floor(Math.random() * 0x7fffffff), carve: [], add: [], brittle: [], absorb: [] },
        elements: [],
        start: [0, 0],
        goal: [5, 7],
      },
    ],
  };
}
