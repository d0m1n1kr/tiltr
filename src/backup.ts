// Backup & Restore: ALLES, was tiltr im localStorage hält – Profil (Sterne,
// Bestzeiten, Streak, Steuerung, Name), Werkstatt (Level + Draft), Geister,
// Sprache – als EINE komprimierte Datei. Grund: Eine Neuinstallation der PWA
// (oder „Website-Daten löschen") wischt den Speicher; ohne Datei ist alles
// weg. Der Codec ist DERSELBE wie bei Teilen-Links (deflate-raw + base64url,
// shareCodec.encodePayload) – ein Kompressionspfad, eine Versionskonvention.
//
// Rein und DOM-frei: der Speicher wird injiziert (Units mit einem Stub).
// Restore ERSETZT den Stand (alle tiltr.*-Schlüssel raus, dann die aus der
// Datei rein) – Mischen wäre bei Bestzeiten/Streak nicht definierbar. Danach
// muss die App NEU LADEN: profile.ts und workshop.ts halten ihre Daten im
// Speicher, der nächste Save würde das Backup sonst wieder überschreiben.

import { decodePayload, encodePayload } from "./levels/shareCodec";

export const BACKUP_FORMAT = "tiltr-backup";
export const BACKUP_V = 1;
const PREFIX = "tiltr.";

/** Das Stück von Storage, das wir brauchen – localStorage erfüllt es. */
export interface StorageLike {
  readonly length: number;
  key(i: number): string | null;
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export interface BackupPayload {
  format: typeof BACKUP_FORMAT;
  v: number;
  /** ISO-Zeitpunkt der Sicherung */
  at: string;
  /** App-Version, die gesichert hat (Diagnose; Restore prüft sie NICHT) */
  app: string;
  /** Rohe Schlüssel/Werte – jeder Schlüssel beginnt mit „tiltr.“ */
  data: Record<string, string>;
}

/** Alle tiltr.*-Schlüssel einsammeln – DURCHZÄHLEN, keine feste Liste:
 *  Geister liegen unter tiltr.ghost.<levelId>, das sind beliebig viele. */
export function collectBackup(
  storage: StorageLike,
  app: string,
  at: string,
): BackupPayload {
  const data: Record<string, string> = {};
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (!k || !k.startsWith(PREFIX)) continue;
    const v = storage.getItem(k);
    if (v !== null) data[k] = v;
  }
  return { format: BACKUP_FORMAT, v: BACKUP_V, at, app, data };
}

/** Datei-Inhalt: das Codec-Token (beginnt mit der Codec-Version 0/1). */
export const encodeBackup = (p: BackupPayload): Promise<string> =>
  encodePayload(p as unknown as Record<string, unknown>);

/** Datei-Inhalt lesen; wirft bei fremden/kaputten Dateien – mit Grund. */
export async function decodeBackup(text: string): Promise<BackupPayload> {
  // Codec-Fehler (kaputtes base64, ungültiges deflate) kommen aus dem Browser
  // mit Innereien wie „Failed to fetch" – das klingt nach Netz und ist keins.
  // EIN klarer Grund für alles, was schon vor dem JSON scheitert.
  let raw: Record<string, unknown>;
  try {
    raw = await decodePayload(text.trim());
  } catch {
    throw new Error("Datei nicht lesbar");
  }
  if (raw.format !== BACKUP_FORMAT) throw new Error("kein tiltr-Backup");
  if (raw.v !== BACKUP_V)
    throw new Error(`Backup-Version ${String(raw.v)} unbekannt`);
  const data = raw.data;
  if (typeof data !== "object" || data === null || Array.isArray(data))
    throw new Error("keine Daten");
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    if (!k.startsWith(PREFIX)) throw new Error(`fremder Schlüssel „${k}"`);
    if (typeof v !== "string") throw new Error(`Wert von „${k}" ist kein Text`);
  }
  return {
    format: BACKUP_FORMAT,
    v: BACKUP_V,
    at: typeof raw.at === "string" ? raw.at : "",
    app: typeof raw.app === "string" ? raw.app : "",
    data: data as Record<string, string>,
  };
}

/** Stand ERSETZEN: erst alle tiltr.*-Schlüssel entfernen, dann die aus dem
 *  Backup setzen. Liefert, was passiert ist. */
export function applyBackup(
  storage: StorageLike,
  p: BackupPayload,
): { removed: number; restored: number } {
  const stale: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k && k.startsWith(PREFIX)) stale.push(k);
  }
  for (const k of stale) storage.removeItem(k);
  for (const [k, v] of Object.entries(p.data)) storage.setItem(k, v);
  return { removed: stale.length, restored: Object.keys(p.data).length };
}

/** Was steckt drin? Für die Bestätigung vor dem Ersetzen. Zählt aus den
 *  ROHEN Werten – fehlertolerant, ein kaputter Eintrag macht nur seine Zahl 0. */
export function summarizeBackup(p: BackupPayload): {
  levels: number;
  best: number;
  ghosts: number;
  entries: number;
} {
  const num = (
    s: string | undefined,
    pick: (o: Record<string, unknown>) => unknown,
  ): number => {
    if (!s) return 0;
    try {
      const v = pick(JSON.parse(s) as Record<string, unknown>);
      return Array.isArray(v)
        ? v.length
        : typeof v === "object" && v !== null
          ? Object.keys(v).length
          : 0;
    } catch {
      return 0;
    }
  };
  return {
    // M40: Level liegen in Bundles (v2); v1 nur noch als Fallback alter Backups.
    levels: p.data["tiltr.workshop.v2"]
      ? num(p.data["tiltr.workshop.v2"], (o) =>
          Array.isArray(o.bundles)
            ? (o.bundles as Array<{ levels?: unknown[] }>).flatMap((x) => (Array.isArray(x.levels) ? x.levels : []))
            : [],
        )
      : num(p.data["tiltr.workshop.v1"], (o) => o.levels),
    best: num(p.data["tiltr.profile"], (o) => o.best),
    ghosts: Object.keys(p.data).filter((k) => k.startsWith("tiltr.ghost."))
      .length,
    entries: Object.keys(p.data).length,
  };
}

/** Dateiname mit Datum – mehrere Sicherungen sollen nebeneinander liegen können. */
export const backupFileName = (at: string): string =>
  `tiltr-backup-${at.slice(0, 10)}.tiltr`;
