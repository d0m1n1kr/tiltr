// i18n-Invarianten: identische Schlüsselmengen in allen Sprachen, jedes
// Level und jedes Galerie-Element hat Übersetzungen, Fallbacks greifen.

import { describe, expect, it, afterEach } from 'vitest';
import { de } from '../src/i18n/de';
import { en } from '../src/i18n/en';
import { fr } from '../src/i18n/fr';
import { es } from '../src/i18n/es';
import { t, setLang, currentLang, lvName, lvIntro, formatDate } from '../src/i18n';
import { TUTORIAL_LEVELS } from '../src/levels/tutorial';
import { CAMPAIGN_LEVELS } from '../src/levels/campaign';
import { COOP_LEVELS, RACE_LEVELS } from '../src/levels/multiplayer';
import { generateDailyLevel } from '../src/levels/daily';

const dicts = { de, en, fr, es } as const;

afterEach(() => setLang('de'));

describe('Wörterbücher', () => {
  it('alle Sprachen haben exakt die Schlüssel des deutschen Referenz-Wörterbuchs', () => {
    const ref = Object.keys(de).sort();
    for (const [lang, dict] of Object.entries(dicts)) {
      expect(Object.keys(dict).sort(), lang).toEqual(ref);
    }
  });

  it('kein leerer Wert', () => {
    for (const [lang, dict] of Object.entries(dicts)) {
      for (const [k, v] of Object.entries(dict)) expect(v.length, `${lang}:${k}`).toBeGreaterThan(0);
    }
  });

  it('Platzhalter stimmen zwischen den Sprachen überein', () => {
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(de) as Array<keyof typeof de>) {
      const ref = vars(de[key]);
      for (const [lang, dict] of Object.entries(dicts)) {
        expect(vars(dict[key]), `${lang}:${key}`).toEqual(ref);
      }
    }
  });

  it('Weltnamen behalten den " – "-Trenner (Kurzform im Kampagnen-Titel)', () => {
    for (const [lang, dict] of Object.entries(dicts)) {
      expect(dict['world.w1'], lang).toContain(' – ');
      expect(dict['world.w2'], lang).toContain(' – ');
    }
  });
});

describe('Level-Übersetzungen', () => {
  const all = [...TUTORIAL_LEVELS, ...CAMPAIGN_LEVELS, ...COOP_LEVELS, ...RACE_LEVELS];
  it('jedes Level hat Name + Intro im Wörterbuch', () => {
    for (const def of all) {
      expect(de[`lv.${def.id}.name` as keyof typeof de], def.id).toBeDefined();
      expect(de[`lv.${def.id}.intro` as keyof typeof de], def.id).toBeDefined();
    }
  });

  it('deutsche Übersetzung entspricht der Level-Definition (Quelle der Wahrheit)', () => {
    for (const def of all) {
      expect(lvName(def), def.id).toBe(def.name);
      if (def.intro) expect(lvIntro(def), def.id).toBe(def.intro);
    }
  });

  it('lvName/lvIntro wechseln mit der Sprache', () => {
    const def = CAMPAIGN_LEVELS[0]!;
    setLang('en');
    expect(lvName(def)).toBe('Setting Out');
    setLang('fr');
    expect(lvName(def)).toBe('Le départ');
  });

  it('Daily: Name & Intro kommen aus dem Wörterbuch (Wochentags-Label)', () => {
    const def = generateDailyLevel('2026-01-05'); // ein Montag
    setLang('en');
    expect(lvName(def)).toBe('Daily Challenge');
    expect(lvIntro(def)).toContain('Monday');
  });
});

describe('t() & Helfer', () => {
  it('ersetzt Platzhalter', () => {
    expect(t('res.time', { time: '4.2 s' })).toBe('Zeit: 4.2 s');
  });

  it('setLang wechselt, currentLang meldet', () => {
    setLang('es');
    expect(currentLang()).toBe('es');
    expect(t('common.close')).toBe('Cerrar');
  });

  it('formatDate pro Sprache', () => {
    expect(formatDate('2026-01-05')).toBe('05.01.2026');
    setLang('en');
    expect(formatDate('2026-01-05')).toBe('01/05/2026');
    setLang('fr');
    expect(formatDate('2026-01-05')).toBe('05/01/2026');
  });
});
