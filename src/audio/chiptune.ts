// Chiptune-Maschine: Musik als DATEN, nicht als Audiodatei.
//
// Ein Titel ist eine Notenfolge (src/music/<id>.ts), die der bestehende
// WebAudio-Graph mit 8-Bit-Stimmen spielt. Warum keine mp3s: Die PWA cacht
// ALLES vor – ein Dutzend Aufnahmen wären Megabytes im Offline-Install, ein
// Dutzend Notenfolgen sind ein paar Kilobyte. Und es IST 8-Bit-Musik, nicht
// die Aufnahme davon.
//
// Dieses Modul ist REIN und DOM-frei (wie src/core/): Parser, Übersetzung in
// Sekunden und das Zeitfenster für den Scheduler sind Zahl-rein-Zahl-raus und
// deshalb ohne Browser testbar. Den Klang macht audio.ts.
//
// Notenschrift (bewusst winzig, damit ein Titel von Hand schreibbar und im
// Diff lesbar bleibt):
//
//   'e4:8 g4 a4 b4:4 r:2 c5:2.'
//
//   <ton>[:<länge>]   ton   = c d e f g a b + optional # oder b + Oktave
//                            (c4 = eingestrichenes C = MIDI 60), 'r' = Pause,
//                            'x' = Schlag (Rausch-Stimme)
//                     länge = Notenwert-Nenner: 1 ganze, 2 halbe, 4 Viertel,
//                            8 Achtel, 16 Sechzehntel; nachgestellter Punkt
//                            (8.) verlängert um die Hälfte.
//
// Die Länge ist KLEBRIG: Fehlt sie, gilt die zuletzt genannte. „e4:8 g4 a4"
// sind drei Achtel – so schreibt man Musik auf, und die Datenzeilen bleiben
// kurz.

export type Voice = 'square' | 'triangle' | 'noise';

export interface TrackDef {
  voice: Voice;
  /** Relative Lautstärke der Stimme (0..1) */
  gain?: number;
  notes: string;
  /** Wie oft die Zeile hintereinander gespielt wird (Standard 1). Ohne das
   *  müsste jede Begleitstimme ihren Takt so oft ausschreiben, wie der Titel
   *  Takte hat – Schlagwerk wird sonst zur Textwand. */
  repeat?: number;
}

export interface Tune {
  id: string;
  title: string;
  bpm: number;
  /** false = einmal spielen, dann Stille bis zum nächsten Titel */
  loop?: boolean;
  tracks: TrackDef[];
}

/** Eine Note in BEATS – das Ergebnis des Parsers, noch ohne Tempo. */
export interface ParsedNote {
  atBeats: number;
  lenBeats: number;
  /** MIDI-Nummer; null = Pause */
  midi: number | null;
}

const STEP: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

/** 'c4' -> 60, 'a4' -> 69 (440 Hz), 'd#3', 'eb5' … */
export function parsePitch(token: string): number {
  const m = /^([a-g])(#|b)?(-?\d)$/.exec(token);
  if (!m) throw new Error(`Chiptune: unbekannter Ton „${token}"`);
  const semi = STEP[m[1]!]! + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  // c4 = MIDI 60: Oktave 4 beginnt bei 60, also (okt + 1) * 12.
  return (Number(m[3]) + 1) * 12 + semi;
}

/** MIDI -> Frequenz (gleichstufig, a4 = 440 Hz). */
export const noteFreq = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

/** Notenwert-Nenner (mit optionalem Punkt) in Beats: '8.' -> 0.75 */
function lengthToBeats(spec: string): number {
  const dotted = spec.endsWith('.');
  const den = Number(dotted ? spec.slice(0, -1) : spec);
  if (!Number.isFinite(den) || den <= 0) throw new Error(`Chiptune: unbekannte Länge „${spec}"`);
  const beats = 4 / den;
  return dotted ? beats * 1.5 : beats;
}

/** Notenzeile -> Noten in Beats. Pausen bleiben als midi=null erhalten,
 *  damit `totalBeats` die Zeile vollständig vermisst (Loop-Länge!). */
export function parseNotes(text: string): ParsedNote[] {
  const out: ParsedNote[] = [];
  let at = 0;
  let len = 1; // Viertel
  for (const token of text.trim().split(/\s+/)) {
    if (!token) continue;
    const [pitch, spec] = token.split(':');
    if (spec !== undefined) len = lengthToBeats(spec);
    const p = pitch!.toLowerCase();
    const midi = p === 'r' ? null : p === 'x' ? 0 : parsePitch(p);
    out.push({ atBeats: at, lenBeats: len, midi });
    at += len;
  }
  return out;
}

/** Gesamtlänge einer Notenzeile in Beats (inklusive Schluss-Pausen). */
export const totalBeats = (notes: ParsedNote[]): number =>
  notes.reduce((max, n) => Math.max(max, n.atBeats + n.lenBeats), 0);

export interface CompiledNote {
  /** Startzeit in Sekunden, relativ zum Titelanfang */
  atS: number;
  /** Klingende Dauer in Sekunden (etwas kürzer als der Notenwert: Artikulation) */
  durS: number;
  /** 0 für die Rausch-Stimme (dort zählt nur der Schlag) */
  freq: number;
  voice: Voice;
  gain: number;
}

export interface CompiledTune {
  id: string;
  title: string;
  /** Tempo – der Renderer lässt den Kasten damit im Takt blinken */
  bpm: number;
  /** Länge eines Durchlaufs in Sekunden – auch das Loop-Raster */
  durationS: number;
  loop: boolean;
  /** nach Startzeit sortiert */
  notes: CompiledNote[];
}

/** Anteil des Notenwerts, der klingt – der Rest ist Luft zwischen den Tönen.
 *  Ohne diese Lücke verschmiert eine Achtelkette zu einem Dauerton. */
const ARTICULATION = 0.88;

export function compileTune(tune: Tune): CompiledTune {
  const spb = 60 / tune.bpm;
  const notes: CompiledNote[] = [];
  let beats = 0;
  for (const track of tune.tracks) {
    const parsed = parseNotes(track.notes);
    const line = totalBeats(parsed);
    const reps = Math.max(1, Math.round(track.repeat ?? 1));
    beats = Math.max(beats, line * reps);
    for (let rep = 0; rep < reps; rep++) {
      for (const n of parsed) {
        if (n.midi === null) continue;
        notes.push({
          atS: (rep * line + n.atBeats) * spb,
          durS: n.lenBeats * spb * ARTICULATION,
          freq: track.voice === 'noise' ? 0 : noteFreq(n.midi),
          voice: track.voice,
          gain: track.gain ?? 1,
        });
      }
    }
  }
  notes.sort((a, b) => a.atS - b.atS);
  return {
    id: tune.id,
    title: tune.title,
    bpm: tune.bpm,
    durationS: beats * spb,
    loop: tune.loop !== false,
    notes,
  };
}

/**
 * Die Noten eines Zeitfensters [fromS, toS) auf der UNENDLICHEN Zeitachse –
 * der Loop wohnt HIER, nicht im Scheduler. Der Aufrufer merkt sich nur, bis
 * wohin er geplant hat, und bekommt beim Übergang von Durchlauf n zu n+1
 * automatisch die richtigen Noten mit absoluten Startzeiten.
 */
export function notesAt(tune: CompiledTune, fromS: number, toS: number): CompiledNote[] {
  const out: CompiledNote[] = [];
  if (toS <= fromS || tune.durationS <= 0) return out;
  const firstPass = tune.loop ? Math.floor(fromS / tune.durationS) : 0;
  const lastPass = tune.loop ? Math.floor((toS - 1e-9) / tune.durationS) : 0;
  for (let pass = Math.max(0, firstPass); pass <= lastPass; pass++) {
    const base = pass * tune.durationS;
    for (const n of tune.notes) {
      const at = base + n.atS;
      if (at >= fromS && at < toS) out.push({ ...n, atS: at });
    }
  }
  return out;
}

/** Nächster Titel der Playlist (Umlauf). Leere Liste -> 0. */
export function advance<T>(playlist: readonly T[], index: number): number {
  if (playlist.length === 0) return 0;
  return (index + 1) % playlist.length;
}
