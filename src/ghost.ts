// Geist-Replay: Die Bestzeit eines Levels rollt als blasser Halo mit.
// Aufzeichnung deterministisch auf ein festes Zeitraster (8 Hz) gelegt und
// als flaches, gerundetes Zahlenfeld in localStorage abgelegt – pro Level-ID
// (Kampagne: stabil; Daily: pro Datum; Quick: pro Preset+Seed, der Geist
// erscheint dort also nur bei identischem Seed). Fehlertolerant wie das
// Profil: ohne Storage läuft alles weiter, nur eben ohne Geist.

const PREFIX = 'tiltr.ghost.';
/** Zeitraster der Aufzeichnung (~8 Hz). Im localStorage ein MINDEST-Abstand,
 *  für Duell-Tokens wird exakt darauf resampelt (src/levels/duel.ts). */
export const GHOST_INTERVAL_S = 0.125;
const INTERVAL_S = GHOST_INTERVAL_S;
const MAX_FRAMES = 4800; // 10 Minuten – längere Läufe speichern keinen Geist

export interface GhostData {
  /** Bestzeit in Sekunden, zu der diese Spur gehört */
  time: number;
  /** flach: [tSek, Ebene, x, y, ...] – monoton steigende Zeiten */
  frames: number[];
}

export class GhostRecorder {
  private frames: number[] = [];
  private nextT = 0;
  private overflow = false;

  /** Pro Frame aufrufen; übernimmt Samples mit mindestens 125 ms Abstand. */
  add(tSec: number, floor: number, x: number, y: number): void {
    if (this.overflow || tSec < this.nextT) return;
    if (this.frames.length >= MAX_FRAMES * 4) {
      this.overflow = true;
      return;
    }
    this.nextT = tSec + INTERVAL_S;
    this.frames.push(Math.round(tSec * 1000) / 1000, floor, Math.round(x), Math.round(y));
  }

  /** null, wenn der Lauf zu lang für eine Aufzeichnung war. */
  result(): number[] | null {
    return this.overflow ? null : this.frames;
  }
}

export function loadGhost(levelId: string): GhostData | null {
  try {
    const raw = localStorage.getItem(PREFIX + levelId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GhostData>;
    if (typeof parsed.time !== 'number' || !Array.isArray(parsed.frames) || parsed.frames.length % 4 !== 0)
      return null;
    return { time: parsed.time, frames: parsed.frames };
  } catch {
    return null;
  }
}

export function saveGhost(levelId: string, time: number, frames: number[]): void {
  if (frames.length === 0) return;
  try {
    localStorage.setItem(PREFIX + levelId, JSON.stringify({ time, frames }));
  } catch {
    /* Private Mode / Quota – dann eben kein Geist */
  }
}

/**
 * Position des Geists zur Zeit tSec: linear interpoliert zwischen den
 * Rasterpunkten; nach dem letzten Frame bleibt er im Ziel liegen.
 * Über Ebenenwechsel hinweg wird nicht interpoliert (Sprung).
 */
export function sampleGhost(ghost: GhostData, tSec: number): { floor: number; x: number; y: number } | null {
  const f = ghost.frames;
  const n = f.length / 4;
  if (n === 0) return null;
  const at = (i: number) => ({ t: f[i * 4]!, floor: f[i * 4 + 1]!, x: f[i * 4 + 2]!, y: f[i * 4 + 3]! });
  if (tSec <= at(0).t) return at(0);
  if (tSec >= at(n - 1).t) return at(n - 1);
  // Samples liegen mindestens INTERVAL_S auseinander: Index nach oben
  // abschätzen, dann lokal korrigieren.
  let i = Math.min(n - 2, Math.max(0, Math.floor(tSec / INTERVAL_S)));
  while (i > 0 && at(i).t > tSec) i--;
  while (i < n - 2 && at(i + 1).t < tSec) i++;
  const a = at(i),
    b = at(i + 1);
  if (a.floor !== b.floor) return tSec < (a.t + b.t) / 2 ? a : b;
  const k = (tSec - a.t) / (b.t - a.t);
  return { floor: a.floor, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}
