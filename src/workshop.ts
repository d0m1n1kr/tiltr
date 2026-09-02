// Werkstatt: eigene Level in localStorage. Fehlertolerant wie das Profil –
// ohne Storage (Private Mode) läuft der Editor, nur Speichern schlägt
// sichtbar fehl. Gespeichert wird die ROHE Def (unparsed): der Editor und
// der Loader validieren beim Laden über parseLevel/loadLevel.

import { parseLevel } from './levels/schema';
import { decodeLevel } from './levels/shareCodec';
import { decodeDuel } from './levels/duel';

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

/** Laufende Nummer je Sitzung: Zwei IDs in derselben Millisekunde müssen sich
 *  unterscheiden – zwei Zufallszeichen allein taten das nur mit 1295:1296, und
 *  auf einem schnellen CI-Läufer speicherte ein Test zwei Level in EINER
 *  Millisekunde: Kollision, Upsert, ein Level weg (v2.8.0, roter Deploy). */
let idSeq = 0;

export function newCustomId(): string {
  idSeq = (idSeq + 1) % 1296;
  const seq = idSeq.toString(36).padStart(2, '0');
  const rnd = Math.floor(Math.random() * 1296).toString(36).padStart(2, '0');
  return `custom-${Date.now().toString(36)}${seq}${rnd}`;
}

export const workshop = {
  /** Neueste zuerst; bei gleichem Zeitstempel (dieselbe Millisekunde) gewinnt
   *  der später gespeicherte – sonst wäre die Reihenfolge Zufall. */
  list(): CustomLevel[] {
    return data.levels
      .map((l, i) => ({ l, i }))
      .sort((a, b) => (a.l.updatedAt === b.l.updatedAt ? b.i - a.i : a.l.updatedAt < b.l.updatedAt ? 1 : -1))
      .map((x) => x.l);
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
  return importRaw(raw);
}

/** Rohe Def in die Bibliothek: validieren, fremde/kollidierende IDs frisch
 *  vergeben, speichern. Gemeinsamer Endpunkt für JSON UND Teilen-Link. */
export function importRaw(raw: Record<string, unknown>): CustomLevel | null {
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

/** Import aus JSON ODER Teilen-Link. Der Grund für die zweite Quelle: Ein
 *  geteilter Link öffnet immer den BROWSER, nie die installierte PWA – wer
 *  das Level dort haben will, muss den Link einfügen können. JSON zuerst
 *  (synchron, kein Codec), dann der Link. */
export async function importAny(text: string): Promise<CustomLevel | null> {
  const viaJson = importLevel(text);
  if (viaJson) return viaJson;
  const share = parseShareText(text);
  if (!share) return null;
  try {
    const raw = share.kind === 'duel' ? (await decodeDuel(share.token)).def : await decodeLevel(share.token);
    return importRaw(raw);
  } catch {
    return null;
  }
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
