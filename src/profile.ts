// Spielerprofil in localStorage: Tutorial-Fortschritt, Bestzeiten, Preset-Wahl.
// Alles fehlertolerant – ohne Storage (Private Mode) läuft das Spiel trotzdem.

import type { Preset } from './levels/quick';

const KEY = 'tiltr.profile';

export interface ProfileData {
  tutorialDone: string[];
  /** Bestzeiten in Sekunden, z. B. best['quick-normal'] oder best['tut-3'] */
  best: Record<string, number>;
  preset: Preset;
}

const DEFAULTS: ProfileData = { tutorialDone: [], best: {}, preset: 'normal' };

const data: ProfileData = load();

function load(): ProfileData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<ProfileData>;
    return {
      tutorialDone: Array.isArray(parsed.tutorialDone) ? parsed.tutorialDone : [],
      best: typeof parsed.best === 'object' && parsed.best ? parsed.best : {},
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
