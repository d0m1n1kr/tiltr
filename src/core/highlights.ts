// HIGHLIGHT-SCHERE (M104): Aus den Schlüsselstellen eines Mitschnitts die
// Fenster wählen, die ein kurzes Video zeigt. Rein und deterministisch – die
// Schere weiß nichts von Bildern oder Ton, sie liefert Zeitfenster; was damit
// geschieht (Standbild überblenden, Gain-Rampe), entscheidet der Renderer.
//
// Regeln:
// - Um jede Stelle ein Fenster: `pre` Sekunden davor, `post` danach – man
//   will sehen, wie es dazu kam, und kurz, was daraus wurde.
// - Überlappende Fenster verschmelzen zu einem (ein Schnitt mitten in einer
//   Türöffnung wäre kein Highlight, sondern ein Schluckauf).
// - START UND ZIEL SIND IMMER DRIN. Ein Lauf ohne Anfang und Ende ist kein
//   Lauf.
// - Über dem Budget fallen die LEICHTESTEN Fenster zuerst (Gewicht = Summe
//   der Stellen darin, nicht Maximum: drei Sammelstellen in einem Fenster
//   sind mehr erzählt als eine).
// - Ausgabe in Zeitordnung, jedes Fenster mit der Überblenddauer zum
//   Vorgänger; die erste hat keine (das Video beginnt hart).

import type { MarkKind, RunMark } from './recording';

/** Wie sehr eine Stelle ein Highlight ist. Gefahr und Wendepunkte oben,
 *  Sammeln unten – ein Schlüssel ist Fortschritt, ein Sturz ist Drama. */
export const MARK_WEIGHT: Record<MarkKind, number> = {
  goal: 10,
  start: 9,
  fall: 8,
  listener: 8,
  guard: 8,
  door: 6,
  resonance: 6,
  glass: 5,
  brittle: 5,
  boulder: 5,
  warp: 5,
  key: 4,
  switch: 4,
  jukebox: 4,
  bell: 3,
  checkpoint: 3,
  crystal: 3,
  hourglass: 3,
  drain: 3,
  gem: 2,
};

export interface Segment {
  /** Sekunden im Mitschnitt */
  from: number;
  to: number;
  /** Überblendung aus dem Vorgänger, Sekunden (0 beim ersten Fenster) */
  fadeIn: number;
  /** Summe der Gewichte der Stellen darin */
  weight: number;
  kinds: MarkKind[];
}

export interface HighlightOptions {
  /** Sekunden vor einer Stelle */
  pre: number;
  /** Sekunden nach einer Stelle */
  post: number;
  /** Zielgesamtlänge in Sekunden (ohne Überblendungen) */
  budget: number;
  /** Überblenddauer zwischen zwei Fenstern */
  fade: number;
}

export const DEFAULT_HIGHLIGHTS: HighlightOptions = { pre: 2, post: 1.5, budget: 25, fade: 0.4 };

/** Fenster um jede Stelle, auf [0, duration] geklemmt, verschmolzen. */
function windows(marks: readonly RunMark[], duration: number, o: HighlightOptions): Segment[] {
  const sorted = [...marks].sort((a, b) => a.t - b.t);
  const out: Segment[] = [];
  for (const m of sorted) {
    const from = Math.max(0, m.t - o.pre);
    const to = Math.min(duration, m.t + o.post);
    if (to <= from) continue;
    const last = out[out.length - 1];
    if (last && from <= last.to) {
      last.to = Math.max(last.to, to);
      last.weight += MARK_WEIGHT[m.kind];
      last.kinds.push(m.kind);
    } else {
      out.push({ from, to, fadeIn: 0, weight: MARK_WEIGHT[m.kind], kinds: [m.kind] });
    }
  }
  return out;
}

const total = (segs: readonly Segment[]): number => segs.reduce((s, x) => s + (x.to - x.from), 0);

/** Die Fenster eines Mitschnitts, die ein Video von höchstens `budget`
 *  Sekunden zeigt. `duration` ist die Länge des Mitschnitts. */
export function selectHighlights(
  marks: readonly RunMark[],
  duration: number,
  opts: Partial<HighlightOptions> = {},
): Segment[] {
  const o = { ...DEFAULT_HIGHLIGHTS, ...opts };
  if (duration <= 0) return [];
  let segs = windows(marks, duration, o);
  if (segs.length === 0) {
    // Ohne eine einzige Stelle: der Anfang und das Ende, mehr ist nicht bekannt.
    return duration <= o.budget
      ? [{ from: 0, to: duration, fadeIn: 0, weight: 0, kinds: [] }]
      : [
          { from: 0, to: o.budget / 2, fadeIn: 0, weight: 0, kinds: [] },
          { from: duration - o.budget / 2, to: duration, fadeIn: o.fade, weight: 0, kinds: [] },
        ];
  }
  // Über dem Budget: die leichtesten Fenster fallen, Start und Ziel nie.
  const pinned = (s: Segment): boolean => s.kinds.includes('start') || s.kinds.includes('goal');
  while (total(segs) > o.budget) {
    let victim = -1;
    for (let i = 0; i < segs.length; i++) {
      if (pinned(segs[i]!)) continue;
      if (victim === -1 || segs[i]!.weight < segs[victim]!.weight) victim = i;
    }
    if (victim === -1) break;
    segs = segs.filter((_, i) => i !== victim);
  }
  // Immer noch drüber (nur Start und Ziel, aber der Lauf ist lang): die
  // beiden auf das Budget kürzen – vom Start das Ende, vom Ziel den Anfang.
  const over = total(segs) - o.budget;
  if (over > 0 && segs.length >= 2) {
    const first = segs[0]!;
    const last = segs[segs.length - 1]!;
    const cut = over / 2;
    first.to = Math.max(first.from + 0.5, first.to - cut);
    last.from = Math.min(last.to - 0.5, last.from + cut);
  }
  return segs.map((s, i) => ({ ...s, fadeIn: i === 0 ? 0 : o.fade }));
}
