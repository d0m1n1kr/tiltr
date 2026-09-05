// SCREENCAST (M104, Phase 2) – der reine Teil: Welcher Container, wie heißt
// die Datei, wann steht die Titelkarte und wann der Abspann. Der Mitschnitt
// wird in Echtzeit abgespielt (das Replay in der echten Schleife) und dabei
// vom Canvas plus Audio-Master aufgezeichnet; was davon Zahl und Regel ist,
// steht hier, DOM-frei und mit Units.

/** Container-Kandidaten, beste zuerst. mp4 vor webm: webm spielt in
 *  iPhone-Nachrichten nicht, und geteilt wird an Leute, nicht an Browser.
 *  Safari liefert mp4 (H.264 + AAC), Chrome webm (VP9/VP8 + Opus). */
export const CAST_MIMES: readonly string[] = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

/** Den ersten Kandidaten wählen, den das Gerät kann – null, wenn keinen.
 *  `supported` ist `MediaRecorder.isTypeSupported`, hier injiziert, damit die
 *  Wahl ohne Browser prüfbar ist. */
export function pickCastMime(supported: (mime: string) => boolean): string | null {
  for (const m of CAST_MIMES) {
    try {
      if (supported(m)) return m;
    } catch {
      /* ein Browser, der beim Fragen wirft, kann es nicht */
    }
  }
  return null;
}

export function castExtension(mime: string): 'mp4' | 'webm' {
  return mime.startsWith('video/mp4') ? 'mp4' : 'webm';
}

/** Dateiname: tiltr-<level>-<zeit>.<ext>, die Zeit mit Komma als Unterstrich
 *  („12_3s"), damit nichts als Endung missverstanden wird. */
export function castFileName(levelId: string, seconds: number, mime: string): string {
  const safe =
    levelId
      .replace(/[^a-z0-9-]+/gi, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'lauf';
  return `tiltr-${safe}-${seconds.toFixed(1).replace('.', '_')}s.${castExtension(mime)}`;
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Titelkarte: so lange steht sie über dem Bild (ms Wanduhr ab Aufnahmestart). */
export const TITLE_MS = 2000;
/** … davon die letzten so viele ms als Ausblenden. */
export const TITLE_FADE_MS = 600;
/** Abspann: so lange läuft die Aufnahme nach dem Ziel weiter (Konfetti + Karte). */
export const TAIL_MS = 3000;
/** Abspann-Karte blendet so ein. */
export const TAIL_FADE_MS = 500;

/** Deckkraft der Titelkarte zur Wanduhr-Zeit seit Aufnahmestart. */
export function titleAlpha(sinceStartMs: number): number {
  if (sinceStartMs <= 0) return 1;
  if (sinceStartMs >= TITLE_MS) return 0;
  const left = TITLE_MS - sinceStartMs;
  return left >= TITLE_FADE_MS ? 1 : left / TITLE_FADE_MS;
}

/** Deckkraft der Abspann-Karte zur Zeit seit dem Ziel. */
export function tailAlpha(sinceEndMs: number): number {
  if (sinceEndMs <= 0) return 0;
  return Math.min(1, sinceEndMs / TAIL_FADE_MS);
}

/** Hat die fertige Datei eine TONSPUR? Byte-Blick in den Kopf: mp4 führt je
 *  Spur einen `hdlr` mit 'soun' bzw. 'vide'; webm nennt den Codec im Klartext
 *  (A_OPUS, A_AAC, A_VORBIS). null = Container unbekannt, keine Aussage.
 *  Gebaut, weil ein Gerät ein Video OHNE Ton lieferte, während man beim
 *  Aufnehmen Ton hörte (v3.44.0) – Bytes zählen sagt darüber nichts. */
export function fileHasAudioTrack(head: Uint8Array): boolean | null {
  let txt = '';
  const n = Math.min(head.length, 2_000_000);
  for (let i = 0; i < n; i++) {
    const c = head[i]!;
    txt += c >= 32 && c < 127 ? String.fromCharCode(c) : '.';
  }
  const isMp4 = txt.includes('ftyp') || txt.includes('moov');
  const isWebm = txt.includes('webm') || txt.includes('matroska');
  if (isMp4) return txt.includes('soun');
  if (isWebm) return /A_(OPUS|AAC|VORBIS|PCM)/.test(txt);
  return null;
}

export type CastFormat = 'mp4' | 'webm';

/** Welche Container das Gerät kann – für den Format-Regler (nur gezeigt,
 *  wenn es mehr als einen gibt) und als Ausweg, wenn eine Datei ohne Tonspur
 *  herauskam. */
export function castFormats(supported: (mime: string) => boolean): CastFormat[] {
  const out: CastFormat[] = [];
  for (const f of ['mp4', 'webm'] as const) {
    if (CAST_MIMES.some((m) => castExtension(m) === f && safeSupported(supported, m))) out.push(f);
  }
  return out;
}

function safeSupported(supported: (mime: string) => boolean, m: string): boolean {
  try {
    return supported(m);
  } catch {
    return false;
  }
}

/** Den besten Kandidaten EINES Formats wählen. */
export function pickCastMimeFor(format: CastFormat, supported: (mime: string) => boolean): string | null {
  for (const m of CAST_MIMES) if (castExtension(m) === format && safeSupported(supported, m)) return m;
  return null;
}

export interface CastOptions {
  /** Zeitraffer: so viele Mitschnitt-Bilder je gezeichnetem Bild */
  speed: 1 | 2;
  /** Labyrinth aufgedeckt zeigen (der Zuschauer sieht, was der Spieler hörte) */
  bright: boolean;
  /** Ganz oder nur die Fenster der Highlight-Schere (Phase 3) */
  mode: 'full' | 'highlights';
  /** Container: 'auto' = bester Kandidat (mp4 vor webm), sonst erzwungen */
  format: 'auto' | CastFormat;
}

export const DEFAULT_CAST: CastOptions = { speed: 1, bright: true, mode: 'full', format: 'auto' };

/** Summe der Fensterlängen in Sekunden – das, was ein Highlight-Video zeigt. */
export function highlightSeconds(segments: readonly { from: number; to: number }[]): number {
  return segments.reduce((s, x) => s + Math.max(0, x.to - x.from), 0);
}

/** So lange steht die Kugel unter der Titelkarte, bevor der Lauf beginnt –
 *  der Lauf startet, wenn die Karte zu verblassen beginnt. Ohne diese Pause
 *  lag die Karte ÜBER dem Anfang des Laufs, und ein kurzer Lauf war ganz
 *  darunter verschwunden (E2E: 1,1 s Lauf, 3,6 s Video). */
export const TITLE_HOLD_MS = TITLE_MS - TITLE_FADE_MS;

/** Erwartete Videolänge in ms: Titel-Pause + gezeigte Sekunden (ganz: der
 *  Lauf; Highlights: die Fenstersumme), im Zeitraffer kürzer, + Abspann. */
export function expectedCastMs(shownSeconds: number, speed: number): number {
  return TITLE_HOLD_MS + (shownSeconds * 1000) / speed + TAIL_MS;
}
