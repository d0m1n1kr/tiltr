// Spielerprofil in localStorage: Tutorial-Fortschritt, Bestzeiten, Preset-Wahl.
// Alles fehlertolerant – ohne Storage (Private Mode) läuft das Spiel trotzdem.

import type { Preset } from './levels/quick';

const KEY = 'tiltr.profile';

export interface ProfileData {
  tutorialDone: string[];
  /** Bestzeiten in Sekunden, z. B. best['quick-normal'] oder best['w1-01'] */
  best: Record<string, number>;
  /** Beste Sternewertung pro Kampagnen-Level (0–3) */
  stars: Record<string, number>;
  preset: Preset;
}

const DEFAULTS: ProfileData = { tutorialDone: [], best: {}, stars: {}, preset: 'normal' };

const data: ProfileData = load();

function load(): ProfileData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<ProfileData>;
    return {
      tutorialDone: Array.isArray(parsed.tutorialDone) ? parsed.tutorialDone : [],
      best: typeof parsed.best === 'object' && parsed.best ? parsed.best : {},
      stars: typeof parsed.stars === 'object' && parsed.stars ? parsed.stars : {},
      preset: parsed.preset === 'easy' || parsed.preset === 'hard' ? parsed.preset : 'normal',
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* Private Mode o. ä. */
  }
}

export const profile = {
  get preset(): Preset {
    return data.preset;
  },
  set preset(p: Preset) {
    data.preset = p;
    save();
  },

  isTutorialDone(id: string): boolean {
    return data.tutorialDone.includes(id);
  },
  tutorialProgress(total: number): { done: number; total: number } {
    return { done: data.tutorialDone.length, total };
  },
  markTutorialDone(id: string): void {
    if (!data.tutorialDone.includes(id)) {
      data.tutorialDone.push(id);
      save();
    }
  },
  /** Erster noch offener Tutorial-Index. */
  nextTutorialIndex(ids: string[]): number {
    const i = ids.findIndex((id) => !data.tutorialDone.includes(id));
    return i === -1 ? 0 : i;
  },

  starsFor(id: string): number {
    return data.stars[id] ?? 0;
  },
  /** Sterne eintragen (nur Verbesserungen zählen). */
  submitStars(id: string, stars: number): void {
    if (stars > (data.stars[id] ?? 0)) {
      data.stars[id] = stars;
      save();
    }
  },
  totalStars(ids: string[]): number {
    return ids.reduce((sum, id) => sum + (data.stars[id] ?? 0), 0);
  },

  bestFor(key: string): number | null {
    const v = data.best[key];
    return typeof v === 'number' && isFinite(v) ? v : null;
  },
  /** Zeit eintragen; true, wenn es eine neue Bestzeit ist (und vorher eine existierte). */
  submitTime(key: string, seconds: number): boolean {
    const prev = data.best[key];
    if (typeof prev !== 'number' || seconds < prev) {
      data.best[key] = seconds;
      save();
      return typeof prev === 'number';
    }
    return false;
  },
};
