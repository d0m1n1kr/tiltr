// MITSCHNITT EINES LAUFS (M104): Was ein Spieler getan hat, nicht was die
// Welt dabei war. Pro Bild die EINGABE (dt, Neigung, Ping-Taste) plus die
// KUGEL als Wahrheit (Ebene, Ort, Geschwindigkeit) – daraus fährt die echte
// Spielschleife den Lauf unter einer virtuellen Uhr noch einmal, und alles
// Abgeleitete (Türen, Wächter, Aufdeckungen, Klang) entsteht dabei neu.
//
// Warum nicht der Geist (src/ghost.ts)? Der speichert mit 8 Hz und ohne
// Weltzustand: Ein Video daraus ruckelte und wüsste nichts von Türen. Warum
// nicht den Weltzustand je Bild? Vierhundert Wände mal siebentausend Bilder,
// und jedes neue Element müsste nachgeführt werden. Die Eingabe ist klein
// (ein 90-Sekunden-Lauf sind rund 50.000 Zahlen) und altert nicht.
//
// ZWEI ZEITEN JE BILD: `t` ist die Wanduhr seit dem Start (ms), `dt` der
// Physik-Schritt (s) – die Schleife klemmt dt bei 50 ms, die Uhr springt aber
// weiter. Breathing-Löcher, Türtimer und Nachglühen hängen an der UHR,
// Physik und Wächter am SCHRITT; nur mit beiden ist das Replay exakt.
//
// Die KUGEL wird beim Replay je Bild auf den aufgezeichneten Wert gesetzt
// (Lektion aus dem Plan): Math.sin/exp weichen zwischen Engines um ein Ulp ab,
// und Kollisionen sind chaotisch – ein Lauf vom iPhone könnte in Chrome sonst
// anders enden. Die Welt reagiert damit auf die wahre Bahn.
//
// SCHLÜSSELSTELLEN (`marks`) sind das, was die Highlight-Schere später
// schneidet (core/highlights.ts): Zeitpunkt, Art, Ort. Rein und DOM-frei.

export type MarkKind =
  | 'start'
  | 'goal'
  | 'door'
  | 'key'
  | 'crystal'
  | 'hourglass'
  | 'gem'
  | 'checkpoint'
  | 'warp'
  | 'listener'
  | 'guard'
  | 'fall'
  | 'glass'
  | 'brittle'
  | 'boulder'
  | 'bell'
  | 'drain'
  | 'switch'
  | 'resonance'
  | 'jukebox';

export interface RunMark {
  /** Sekunden seit dem Start */
  t: number;
  kind: MarkKind;
  floor: number;
  x: number;
  y: number;
}

/** Zahlen je Bild im flachen Feld `frames`. */
export const FRAME_STRIDE = 10;
/** Zehn Minuten bei 60 Hz – längere Läufe werden nicht mitgeschnitten. */
export const MAX_FRAMES = 36000;

export interface Frame {
  /** ms seit t0 (Wanduhr) */
  t: number;
  /** Physik-Schritt in Sekunden */
  dt: number;
  tx: number;
  ty: number;
  /** Ping-Taste in diesem Bild gedrückt */
  ping: boolean;
  floor: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface Recording {
  v: 1;
  levelId: string;
  /** Wanduhr beim Start (ms) – die virtuelle Uhr des Replays beginnt hier. */
  t0: number;
  /** First Person? Der Startblick wird daraus abgeleitet (M98). */
  fp: boolean;
  /** flach, FRAME_STRIDE Zahlen je Bild: t, dt, tx, ty, ping, floor, x, y, vx, vy */
  frames: number[];
  marks: RunMark[];
  /** Laufzeit in Sekunden, wenn der Lauf im Ziel endete */
  time: number | null;
}

export class RunRecorder {
  private frames: number[] = [];
  private marks: RunMark[] = [];
  private overflow = false;

  constructor(
    private levelId: string,
    private t0: number,
    private fp: boolean,
  ) {}

  /** Einmal je Bild, VOR jeder Änderung dieses Bildes: Die Kugel ist der
   *  Zustand, mit dem das Bild BEGINNT – so trifft auch ein Bild, das die
   *  Schleife früh verlässt (Ebenenwechsel), und der Sprung beim Replay
   *  setzt die Kugel genau dort ab, wo der Schritt ansetzt. */
  frame(
    tMs: number,
    dt: number,
    tilt: { x: number; y: number },
    ping: boolean,
    floor: number,
    ball: { x: number; y: number; vx: number; vy: number },
  ): void {
    if (this.overflow) return;
    if (this.frames.length >= MAX_FRAMES * FRAME_STRIDE) {
      this.overflow = true;
      return;
    }
    this.frames.push(tMs, dt, tilt.x, tilt.y, ping ? 1 : 0, floor, ball.x, ball.y, ball.vx, ball.vy);
  }

  mark(tMs: number, kind: MarkKind, floor: number, x: number, y: number): void {
    if (this.overflow) return;
    this.marks.push({ t: Math.round(tMs) / 1000, kind, floor, x: Math.round(x), y: Math.round(y) });
  }

  get count(): number {
    return this.frames.length / FRAME_STRIDE;
  }

  get markCount(): number {
    return this.marks.length;
  }

  /** null, wenn der Lauf zu lang für einen Mitschnitt war. */
  result(time: number | null): Recording | null {
    if (this.overflow || this.frames.length === 0) return null;
    return { v: 1, levelId: this.levelId, t0: this.t0, fp: this.fp, frames: this.frames, marks: this.marks, time };
  }
}

export function frameCount(rec: Recording): number {
  return Math.floor(rec.frames.length / FRAME_STRIDE);
}

export function frameAt(rec: Recording, i: number): Frame | null {
  const o = i * FRAME_STRIDE;
  if (i < 0 || o + FRAME_STRIDE > rec.frames.length) return null;
  const f = rec.frames;
  return {
    t: f[o]!,
    dt: f[o + 1]!,
    tx: f[o + 2]!,
    ty: f[o + 3]!,
    ping: f[o + 4] === 1,
    floor: f[o + 5]!,
    x: f[o + 6]!,
    y: f[o + 7]!,
    vx: f[o + 8]!,
    vy: f[o + 9]!,
  };
}

/** Dauer des Mitschnitts in Sekunden (Wanduhr des letzten Bildes). */
export function duration(rec: Recording): number {
  const n = frameCount(rec);
  return n === 0 ? 0 : rec.frames[(n - 1) * FRAME_STRIDE]! / 1000;
}
