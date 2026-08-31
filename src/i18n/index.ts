// i18n-Kern: vier Sprachen, flache Schlüssel, {platzhalter}-Ersetzung.
// Node-sicher (Tests importieren Level-Helfer): alle DOM-/Storage-Zugriffe
// sind abgesichert. Sprachwahl: localStorage > navigator.language > 'en'.
//
// Statisches HTML wird über data-Attribute übersetzt:
//   data-i18n="key"        -> textContent
//   data-i18n-html="key"   -> innerHTML (nur für Schlüssel mit Markup!)
//   data-i18n-ph="key"     -> placeholder
//   data-i18n-title="key"  -> title-Attribut
// Dynamische Strings laufen über t(); nach setLang() feuern die
// onLangChange-Listener, damit Screens sich neu rendern.

import { de, type Dict } from './de';

export type { Dict };
import { en } from './en';
import { fr } from './fr';
import { es } from './es';

export type Lang = 'de' | 'en' | 'fr' | 'es';
export const LANGS: Lang[] = ['de', 'en', 'fr', 'es'];

const dicts: Record<Lang, Dict> = { de, en, fr, es };
const STORE_KEY = 'tiltr.lang';

function detectLang(): Lang {
  try {
    const stored = localStorage.getItem(STORE_KEY);
    if (stored && (LANGS as string[]).includes(stored)) return stored as Lang;
  } catch {
    /* Private Mode / Node */
  }
  try {
    for (const tag of navigator.languages ?? [navigator.language]) {
      const short = tag.slice(0, 2).toLowerCase();
      if ((LANGS as string[]).includes(short)) return short as Lang;
    }
  } catch {
    /* Node */
  }
  return 'en';
}

let lang: Lang = detectLang();
const listeners: Array<() => void> = [];

export function currentLang(): Lang {
  return lang;
}

export function setLang(next: Lang): void {
  if (next === lang) return;
  lang = next;
  try {
    localStorage.setItem(STORE_KEY, next);
  } catch {
    /* Private Mode */
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = next;
    applyI18n();
  }
  for (const cb of listeners) cb();
}

export function onLangChange(cb: () => void): void {
  listeners.push(cb);
}

export function t(key: keyof Dict, vars?: Record<string, string | number>): string {
  let s: string = dicts[lang][key] ?? dicts.de[key] ?? (key as string);
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/* --- Level-Anzeige: Übersetzung per ID, deutsche Definition als Fallback --- */

const dyn = (key: string): string | undefined => (dicts[lang] as Record<string, string>)[key];

export function lvName(def: { id: string; name: string }): string {
  if (def.id.startsWith('daily-')) return t('daily.name');
  if (def.id.startsWith('quick-')) return t('menu.quick');
  if (def.id.startsWith('mpq-')) return t('mp.random');
  return dyn(`lv.${def.id}.name`) ?? def.name;
}

export function lvIntro(def: { id: string; intro?: string }): string | undefined {
  const daily = def.id.match(/^daily-(\d{4}-\d{2}-\d{2})/);
  if (daily) {
    const weekday = new Date(`${daily[1]}T00:00:00Z`).getUTCDay();
    return t('daily.intro', { label: t(`daily.day${weekday}` as keyof Dict) });
  }
  return dyn(`lv.${def.id}.intro`) ?? def.intro;
}

/** Anzeige-Datum (z. B. 05.01.2026 / 01/05/2026) passend zur Sprache. */
export function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  switch (lang) {
    case 'de':
      return `${d}.${m}.${y}`;
    case 'en':
      return `${m}/${d}/${y}`;
    default:
      return `${d}/${m}/${y}`; // fr/es
  }
}

/* --- Statisches HTML übersetzen ------------------------------------------- */

export function applyI18n(root: ParentNode = document): void {
  if (typeof document === 'undefined') return;
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n as keyof Dict);
  }
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n-html]')) {
    el.innerHTML = t(el.dataset.i18nHtml as keyof Dict);
  }
  for (const el of root.querySelectorAll<HTMLInputElement>('[data-i18n-ph]')) {
    el.placeholder = t(el.dataset.i18nPh as keyof Dict);
  }
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n-title]')) {
    el.title = t(el.dataset.i18nTitle as keyof Dict);
  }
  // Tooltip-Blase (theme.css [data-tip]): wie title, aber Touch-tauglich.
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n-tip]')) {
    el.dataset.tip = t(el.dataset.i18nTip as keyof Dict);
  }
}
