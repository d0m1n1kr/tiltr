// Werkstatt: eigene Level in localStorage. Fehlertolerant wie das Profil –
// ohne Storage (Private Mode) läuft der Editor, nur Speichern schlägt
// sichtbar fehl. Gespeichert wird die ROHE Def (unparsed): der Editor und
// der Loader validieren beim Laden über parseLevel/loadLevel.

import { parseLevel } from './levels/schema';

const KEY = 'tiltr.workshop.v1';

/** Dateiformat für Export/Import. */
export const FILE_FORMAT = 'tiltr-level';

export interface CustomLevel {
  /** 'custom-<base36>' – identisch mit def.id */
  id: string;
  /** rohe LevelDef-Daten (parseLevel-kompatibel) */
  def: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface WorkshopData {
  levels: CustomLevel[];
}

function load(): WorkshopData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { levels: [] };
    const parsed = JSON.parse(raw) as Partial<WorkshopData>;
    return { levels: Array.isArray(parsed.levels) ? parsed.levels.filter((l) => typeof l?.id === 'string' && l.def) : [] };
  } catch {
    return { levels: [] };
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

export function newCustomId(): string {
  return `custom-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36).padStart(2, '0')}`;
}

export const workshop = {
  /** Neueste zuerst. */
  list(): CustomLevel[] {
    return [...data.levels].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  },

  get(id: string): CustomLevel | null {
    return data.levels.find((l) => l.id === id) ?? null;
  },

  /** Upsert über def.id; legt Zeitstempel an bzw. frischt sie auf. */
  save(def: Record<string, unknown>): boolean {
    const id = String(def.id ?? '');
    if (!id.startsWith('custom-')) return false;
    const now = new Date().toISOString();
    const existing = data.levels.find((l) => l.id === id);
    if (existing) {
      existing.def = def;
      existing.updatedAt = now;
    } else {
      data.levels.push({ id, def, createdAt: now, updatedAt: now });
    }
    return save();
  },

  remove(id: string): void {
    const i = data.levels.findIndex((l) => l.id === id);
    if (i !== -1) {
      data.levels.splice(i, 1);
      save();
    }
  },

  /** Kopie unter neuer ID (Name bekommt einen Zusatz); null wenn unbekannt. */
  duplicate(id: string, nameSuffix: string): CustomLevel | null {
    const src = data.levels.find((l) => l.id === id);
    if (!src) return null;
    const copy = JSON.parse(JSON.stringify(src.def)) as Record<string, unknown>;
    const newId = newCustomId();
    copy.id = newId;
    copy.name = `${String(copy.name ?? '')} ${nameSuffix}`.trim();
    const now = new Date().toISOString();
    const level: CustomLevel = { id: newId, def: copy, createdAt: now, updatedAt: now };
    data.levels.push(level);
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
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ def, updatedAt: new Date().toISOString() }));
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

export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ohne Storage gibt es auch nichts zu räumen */
  }
}

/** Export-Hülle um eine rohe Def. */
export function exportPayload(def: Record<string, unknown>): string {
  return JSON.stringify({ format: FILE_FORMAT, version: 1, def }, null, 2);
}

/**
 * Import aus Datei/Zwischenablage: akzeptiert die Export-Hülle ODER eine
 * nackte Def, validiert per parseLevel, vergibt bei fremden/kollidierenden
 * IDs eine frische Werkstatt-ID und speichert. null = kein gültiges Level.
 */
export function importLevel(text: string): CustomLevel | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const obj = data as Record<string, unknown>;
  const raw = obj.format === FILE_FORMAT && typeof obj.def === 'object' && obj.def ? (obj.def as Record<string, unknown>) : obj;
  try {
    parseLevel(raw);
  } catch {
    return null;
  }
  if (typeof raw.id !== 'string' || !raw.id.startsWith('custom-') || workshop.get(raw.id)) {
    raw.id = newCustomId();
  }
  return workshop.save(raw) ? workshop.get(String(raw.id)) : null;
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
        maze: { seed: Math.floor(Math.random() * 0x7fffffff), carve: [], add: [], brittle: [] },
        elements: [],
        start: [0, 0],
        goal: [5, 7],
      },
    ],
  };
}
