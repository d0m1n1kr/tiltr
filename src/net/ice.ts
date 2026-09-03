// ICE: Wie die zwei Kugeln zueinander finden – und warum es im Mobilfunk
// scheitert.
//
// Der Nostr-Handshake (transport.ts) bringt die SDP-Angebote zusammen; danach
// muss WebRTC eine STRECKE finden. STUN reicht nur, wenn mindestens eine Seite
// von außen ansprechbar ist. Im Mobilfunk sitzt das Phone hinter Carrier-NAT
// (CGNAT, oft symmetrisch): Beide Seiten kennen dann ihre öffentliche Adresse,
// aber jedes Paket an die des anderen fällt auf den Boden. Genau das war die
// Meldung „Join geht manchmal nicht": Vermittler ✓, SDP ausgetauscht,
// `could not connect to peer … configure TURN servers`.
//
// Dagegen hilft NUR ein TURN-Server (er reicht die Daten weiter). Einen
// verlässlichen kostenlosen gibt es nicht – die alten offenen Relays sind tot
// (nachgemessen: kein Relay-Kandidat mehr). Deshalb ist TURN hier KONFIGURIER-
// BAR: eingetragen wird er im Gerät (localStorage), nicht im Repo, denn
// Zugangsdaten gehören niemandem sonst. Diese Datei ist der reine Teil davon:
// Eingabe lesen, Ausgabe schreiben, Kandidaten deuten.

export interface IceServer {
  urls: string;
  username?: string;
  credential?: string;
}

/** Schlüssel im localStorage – der TURN-Eintrag gehört dem GERÄT. */
export const TURN_KEY = 'tiltr.turn.v1';

const SCHEME = /^(stun|stuns|turn|turns):[^\s|]+$/i;

/**
 * Nimmt beide Schreibweisen, die man in der Hand hat:
 * - eine Zeile je Server: `turn:host:3478|user|pass` (auch mit
 *   `?transport=tcp`; `stun:` braucht keine Zugangsdaten),
 * - oder das JSON aus einer Anbieter-Konsole: ein Array von
 *   `{urls, username, credential}` oder `{ iceServers: [...] }`.
 * Rückgabe `null` = nicht verstanden (der Aufrufer sagt es dem Nutzer);
 * ein leerer String ergibt eine leere Liste (kein TURN, kein Fehler).
 */
export function parseIceServers(text: string): IceServer[] | null {
  const trimmed = text.trim();
  if (trimmed === '') return [];
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return fromJson(trimmed);
  const out: IceServer[] = [];
  for (const line of trimmed.split(/[\n,]+/)) {
    const parts = line.split('|').map((p) => p.trim());
    const urls = parts[0] ?? '';
    if (urls === '') continue;
    if (!SCHEME.test(urls)) return null;
    const server: IceServer = { urls };
    if (parts[1]) server.username = parts[1];
    if (parts[2]) server.credential = parts[2];
    out.push(server);
  }
  return out.length ? out : null;
}

function fromJson(text: string): IceServer[] | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const list = Array.isArray(raw) ? raw : (raw as { iceServers?: unknown }).iceServers;
  if (!Array.isArray(list)) return null;
  const out: IceServer[] = [];
  for (const entry of list) {
    if (typeof entry !== 'object' || entry === null) return null;
    const e = entry as { urls?: unknown; url?: unknown; username?: unknown; credential?: unknown };
    // Eine Konsole liefert `urls` auch als Liste – dann wird jede URL ein
    // eigener Eintrag, mit denselben Zugangsdaten.
    const urls = (Array.isArray(e.urls) ? e.urls : [e.urls ?? e.url]).filter((u): u is string => typeof u === 'string');
    if (urls.length === 0) return null;
    for (const u of urls) {
      if (!SCHEME.test(u)) return null;
      const server: IceServer = { urls: u };
      if (typeof e.username === 'string' && e.username !== '') server.username = e.username;
      if (typeof e.credential === 'string' && e.credential !== '') server.credential = e.credential;
      out.push(server);
    }
  }
  return out.length ? out : null;
}

/** Zurück in die Zeilenform – das Feld zeigt, was gespeichert ist. */
export function formatIceServers(servers: readonly IceServer[]): string {
  return servers.map((s) => [s.urls, s.username ?? '', s.credential ?? ''].join('|').replace(/\|+$/, '')).join('\n');
}

/** Nur der Wirt, für die Diagnose-Zeile (Zugangsdaten bleiben unsichtbar). */
export function iceHosts(servers: readonly IceServer[]): string[] {
  return servers.map((s) => s.urls.replace(/^\w+:/, '').replace(/\?.*$/, ''));
}

/** Hat die Liste überhaupt einen Weiterleiter? STUN allein rettet nichts. */
export function hasTurn(servers: readonly IceServer[]): boolean {
  return servers.some((s) => /^turns?:/i.test(s.urls));
}

export type CandidateKind = 'host' | 'srflx' | 'prflx' | 'relay';

/** `candidate:… typ srflx …` → 'srflx'. Der Typ ist die ganze Auskunft:
 *  'relay' heißt „TURN antwortet", nur 'host'/'srflx' heißt „nichts dahinter". */
export function candidateKind(line: string): CandidateKind | null {
  const m = /\btyp (host|srflx|prflx|relay)\b/.exec(line);
  return m ? (m[1] as CandidateKind) : null;
}

export interface IceReport {
  host: number;
  srflx: number;
  relay: number;
  errors: string[];
  ms: number;
}

/** Was der Selbsttest bedeutet – EINE Stelle, die urteilt:
 *  - 'ok': ein Relay-Kandidat kam, TURN trägt.
 *  - 'noTurn': kein TURN eingetragen (dann ist 'relay' nie zu erwarten).
 *  - 'turnDead': TURN eingetragen, aber kein Relay-Kandidat – falsche Daten,
 *    abgelaufen oder der Server ist weg.
 *  - 'blind': nicht mal die eigene öffentliche Adresse (kein Netz/STUN zu). */
export type IceVerdict = 'unknown' | 'ok' | 'noTurn' | 'turnDead' | 'blind';

export function iceVerdict(report: IceReport | null, turn: boolean): IceVerdict {
  if (report === null) return 'unknown';
  if (report.relay > 0) return 'ok';
  if (report.srflx === 0 && report.host === 0) return 'blind';
  return turn ? 'turnDead' : 'noTurn';
}

/* --- Ablage (nicht rein, deshalb ganz unten und mit try/catch) ------------- */

export function loadTurnText(): string {
  try {
    return localStorage.getItem(TURN_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveTurnText(text: string): void {
  try {
    if (text.trim() === '') localStorage.removeItem(TURN_KEY);
    else localStorage.setItem(TURN_KEY, text.trim());
  } catch {
    /* Privater Modus: dann gilt der Eintrag nur für diese Sitzung. */
  }
}

/** Die Liste, die der Transport an trystero hängt (leer = nur die
 *  eingebauten STUN-Server von trystero). */
export function turnServers(): IceServer[] {
  return parseIceServers(loadTurnText()) ?? [];
}
