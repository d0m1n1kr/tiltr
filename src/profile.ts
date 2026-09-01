// Spielerprofil in localStorage: Tutorial-Fortschritt, Bestzeiten, Preset-Wahl.
// Alles fehlertolerant – ohne Storage (Private Mode) läuft das Spiel trotzdem.

import type { Preset } from './levels/quick';

/** Steuerungsmodus: klassische Draufsicht (Tablett) oder First Person
 *  (Lenkrad, M23). Gilt global für alle Spielvarianten. */
export type Controls = 'top' | 'fp';

const KEY = 'tiltr.profile';

export interface ProfileData {
  tutorialDone: string[];
  /** Bestzeiten in Sekunden, z. B. best['quick-normal'] oder best['w1-01'] */
  best: Record<string, number>;
  /** Beste Sternewertung pro Kampagnen-Level (0–3) */
  stars: Record<string, number>;
  /** Blind-Stern 🌑: Kampagnen-Level ohne einen einzigen Echo-Ping geschafft */
  blind: string[];
  preset: Preset;
  /** Steuerungsmodus (M23) – 'top' = Draufsicht, 'fp' = First Person */
  controls: Controls;
  /** Anzeigename für Duell-Links (leer = anonymer „Rivale"), rein kosmetisch */
  name: string;
  /** Tages-Challenge: erster Zieleinlauf zählt, Rest ist Training */
  daily: { date: string; first: number | null; best: number | null; attempts: number } | null;
  /** Serie: an aufeinanderfolgenden Tagen die Tages-Challenge beendet */
  streak: { count: number; last: string } | null;
}

const DEFAULTS: ProfileData = {
  tutorialDone: [],
  best: {},
  stars: {},
  blind: [],
  preset: 'normal',
  controls: 'top',
  name: '',
  daily: null,
  streak: null,
};

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
      blind: Array.isArray(parsed.blind) ? parsed.blind : [],
      preset: parsed.preset === 'easy' || parsed.preset === 'hard' ? parsed.preset : 'normal',
      controls: parsed.controls === 'fp' ? 'fp' : 'top',
      name: typeof parsed.name === 'string' ? parsed.name.slice(0, 24) : '',
      daily: parsed.daily && typeof parsed.daily.date === 'string' ? parsed.daily : null,
      streak: parsed.streak && typeof parsed.streak.last === 'string' ? parsed.streak : null,
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

  get controls(): Controls {
    return data.controls;
  },
  set controls(c: Controls) {
    data.controls = c;
    save();
  },

  get name(): string {
    return data.name;
  },
  set name(v: string) {
    data.name = v.trim().slice(0, 24);
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

  /* --- Blind-Stern 🌑: ohne einen einzigen Ping geschafft --- */
  isBlind(id: string): boolean {
    return data.blind.includes(id);
  },
  markBlind(id: string): void {
    if (!data.blind.includes(id)) {
      data.blind.push(id);
      save();
    }
  },
  blindCount(ids: string[]): number {
    return ids.filter((id) => data.blind.includes(id)).length;
  },

  /** Gespeicherter Stand für die Challenge dieses Datums (sonst null). */
  dailyInfo(date: string): { first: number | null; best: number | null; attempts: number } | null {
    return data.daily?.date === date ? data.daily : null;
  },

  /**
   * Zieleinlauf einer Tages-Challenge eintragen. isFirst = erster Einlauf
   * für dieses Datum (zählt als Tageswert). Serie wächst nur, wenn die
   * Challenge an ihrem eigenen Tag gespielt wird.
   */
  submitDaily(date: string, seconds: number, today: string): { isFirst: boolean; first: number } {
    if (data.daily?.date !== date) data.daily = { date, first: null, best: null, attempts: 0 };
    const d = data.daily;
    d.attempts++;
    const isFirst = d.first === null;
    if (isFirst) d.first = seconds;
    if (d.best === null || seconds < d.best) d.best = seconds;
    if (isFirst && date === today) {
      const yesterday = new Date(new Date(`${today}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10);
      data.streak =
        data.streak && data.streak.last === yesterday
          ? { count: data.streak.count + 1, last: today }
          : data.streak?.last === today
            ? data.streak
            : { count: 1, last: today };
    }
    save();
    return { isFirst, first: d.first! };
  },

  streakInfo(): { count: number; last: string } | null {
    return data.streak;
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
