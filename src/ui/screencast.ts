// SCREENCAST (M104, Phase 2) – die Browser-Hülle: Das Spielfeld-Canvas und der
// Audio-Master werden als MediaStream aufgezeichnet, während das Replay in der
// echten Schleife läuft. Der Ton entsteht dabei NEU aus demselben Graphen wie
// im Spiel – HRTF inklusive; wer das Video mit Kopfhörern sieht, hört den Ping
// aus derselben Richtung wie der Spieler. Nichts wird nachgebaut, nichts
// „aufgenommen" im Sinne eines Mikrofons.
//
// Was das Video zeigt, ist NUR das Canvas: Die HUD-Chips und die Statuszeile
// sind DOM und fehlen im Bild. Deshalb zeichnet `drawCastOverlay` das, was ein
// Zuschauer braucht, IN das Canvas: Titelkarte (Levelname, Welt), die laufende
// Zeit, und den Abspann mit Zeit und Adresse – die Promo-Lektion (M85): Ein
// geteiltes Video ohne Link ist wertlos. Farben und Schrift kommen aus den
// Design-Tokens (`castTheme` liest sie aus dem Stylesheet), keine Magic Values.
//
// Der reine Teil (Container-Wahl, Zeiten, Dateiname) wohnt in core/cast.ts.

import { tailAlpha, titleAlpha } from '../core/cast';

export interface CastSession {
  readonly mime: string;
  /** Bisher angelieferte Bytes (wächst in Stücken, nicht je Bild). */
  bytes(): number;
  /** Aufnahme beenden – die Datei kommt als Blob. */
  stop(): Promise<Blob>;
  /** Abbrechen: Stream schließen, nichts liefern. */
  cancel(): void;
}

/** Kann dieses Gerät ein Video aus dem Canvas aufzeichnen? */
export function castSupported(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    'captureStream' in HTMLCanvasElement.prototype
  );
}

/** `MediaRecorder.isTypeSupported` als injizierbare Funktion (core/cast.ts wählt damit). */
export const mimeSupported = (mime: string): boolean =>
  typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function'
    ? MediaRecorder.isTypeSupported(mime)
    : false;

/** Bildrate der Aufnahme. 30 reicht für eine rollende Kugel und halbiert die
 *  Datei gegenüber 60; das Spiel selbst läuft weiter mit voller Rate. */
export const CAST_FPS = 30;
/** Zielbitrate: bei Phone-Auflösung (≈ 800×1700) scharf, 90 s ≈ 45 MB. */
export const CAST_BITRATE = 4_000_000;

export function startCast(canvas: HTMLCanvasElement, audio: MediaStream | null, mime: string): CastSession {
  const video = canvas.captureStream(CAST_FPS);
  const tracks = [...video.getVideoTracks(), ...(audio ? audio.getAudioTracks() : [])];
  const stream = new MediaStream(tracks);
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: CAST_BITRATE });
  const chunks: Blob[] = [];
  let total = 0;
  rec.addEventListener('dataavailable', (e) => {
    if (e.data && e.data.size > 0) {
      chunks.push(e.data);
      total += e.data.size;
    }
  });
  // Stückweise anliefern: Bei einem Absturz mitten im Lauf ist nicht alles weg,
  // und `bytes()` kann Fortschritt zeigen.
  rec.start(1000);
  const closeTracks = (): void => {
    for (const tr of stream.getTracks()) tr.stop();
  };
  return {
    mime,
    bytes: () => total,
    stop: () =>
      new Promise<Blob>((resolve) => {
        rec.addEventListener(
          'stop',
          () => {
            closeTracks();
            resolve(new Blob(chunks, { type: mime.split(';')[0] }));
          },
          { once: true },
        );
        if (rec.state !== 'inactive') rec.stop();
        else {
          closeTracks();
          resolve(new Blob(chunks, { type: mime.split(';')[0] }));
        }
      }),
    cancel: () => {
      try {
        if (rec.state !== 'inactive') rec.stop();
      } catch {
        /* schon zu */
      }
      closeTracks();
    },
  };
}

export interface CastTheme {
  font: string;
  text: string;
  accent: string;
  bgDeep: string;
}

/** Design-Tokens aus dem Stylesheet lesen – das Canvas kennt keine CSS-Variablen. */
export function castTheme(): CastTheme {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string): string => cs.getPropertyValue(name).trim() || fallback;
  return {
    font: v('--font', 'system-ui, sans-serif'),
    text: v('--text', '#cfd8ea'),
    accent: v('--accent', '#4be0c8'),
    bgDeep: v('--bg-deep', '#05070f'),
  };
}

export interface CastOverlay {
  /** ms seit Aufnahmestart (Wanduhr) */
  sinceStartMs: number;
  /** ms seit dem Ziel, null = noch unterwegs */
  sinceEndMs: number | null;
  title: string;
  subtitle: string;
  /** laufende Zeit als Text, z. B. „12.3 s" */
  timeText: string;
  /** Abspann: Zeile mit der Endzeit */
  endLine: string;
  /** Abspann: der Credit (dieselbe Zeile wie auf dem Splash) */
  credit: string;
  /** Abspann: Adresse */
  byline: string;
}

/** Mit Alpha eine Karte zeichnen: dunkle Fläche, große Zeile, kleine Zeile. */
function card(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  dpr: number,
  th: CastTheme,
  alpha: number,
  big: string,
  small: string,
  dim: number,
  third?: string,
): void {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = th.bgDeep;
  ctx.globalAlpha = alpha * dim;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const bigPx = Math.round(Math.min(w, h) * 0.075);
  const smallPx = Math.round(bigPx * 0.5);
  ctx.fillStyle = th.text;
  ctx.font = `600 ${bigPx}px ${th.font}`;
  ctx.fillText(big, w / 2, h / 2 - smallPx * 0.9, w * 0.86);
  ctx.fillStyle = th.accent;
  ctx.font = `500 ${smallPx}px ${th.font}`;
  ctx.fillText(small, w / 2, h / 2 + bigPx * 0.75, w * 0.86);
  if (third) {
    // Dritte Zeile (Abspann: die Adresse unter dem Credit) – leiser, in Textfarbe.
    ctx.fillStyle = th.text;
    ctx.globalAlpha = alpha * 0.75;
    ctx.font = `500 ${Math.round(smallPx * 0.85)}px ${th.font}`;
    ctx.fillText(third, w / 2, h / 2 + bigPx * 0.75 + smallPx * 1.6, w * 0.86);
  }
  ctx.restore();
  void dpr;
}

/** Die Zeit als Chip oben rechts – im Video steht sonst keine Uhr. */
function timeChip(ctx: CanvasRenderingContext2D, w: number, dpr: number, th: CastTheme, text: string): void {
  const px = Math.round(14 * dpr);
  ctx.save();
  ctx.font = `600 ${px}px ${th.font}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  const pad = 10 * dpr;
  const tw = ctx.measureText(text).width;
  const x = w - 16 * dpr;
  const y = 22 * dpr;
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = th.bgDeep;
  const rw = tw + pad * 2;
  const rh = px + pad;
  const rx = x - rw + pad;
  const ry = y - rh / 2;
  ctx.beginPath();
  ctx.roundRect(rx, ry, rw, rh, rh / 2);
  ctx.fill();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = th.text;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Über das fertig gezeichnete Spielbild legen – jedes Bild der Aufnahme. */
export function drawCastOverlay(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number, th: CastTheme, o: CastOverlay): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const ta = titleAlpha(o.sinceStartMs);
  if (ta > 0) card(ctx, w, h, dpr, th, ta, o.title, o.subtitle, 0.82);
  if (o.sinceEndMs !== null) {
    const ea = tailAlpha(o.sinceEndMs);
    if (ea > 0) card(ctx, w, h, dpr, th, ea, o.endLine, o.credit, 0.55, o.byline);
  } else if (ta < 1) {
    timeChip(ctx, w, dpr, th, o.timeText);
  }
  ctx.restore();
}
