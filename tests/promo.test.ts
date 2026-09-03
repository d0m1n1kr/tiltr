// WEITERSAGEN (M85): Der Werbetext kommt aus dem Wörterbuch der aktuellen
// Sprache, die Adresse aus EINER Konstante – nicht aus `location`, sonst teilt
// wer vom Dev-Server aus teilt einen Link, den niemand öffnen kann.

import { describe, expect, it } from 'vitest';
import { APP_URL, PROMO_GIF_URL, promoCaption, promoShare } from '../src/promo';
import { de } from '../src/i18n/de';
import { en } from '../src/i18n/en';
import { fr } from '../src/i18n/fr';
import { es } from '../src/i18n/es';

describe('promoShare', () => {
  it('nimmt Titel und Text wie übergeben und hängt die eine Adresse an', () => {
    const s = promoShare('Titel', 'Text');
    expect(s).toEqual({ title: 'Titel', text: 'Text', url: APP_URL });
  });
  it('EINE Nachricht: Text, dann der Link in der letzten Zeile', () => {
    // Dieselbe Zeichenkette dient als Bildunterschrift zum GIF UND als Inhalt
    // für die Zwischenablage – der Link kann so nicht einzeln verloren gehen.
    expect(promoCaption(promoShare('T', 'Zwei Zeilen'))).toBe(`Zwei Zeilen\n${APP_URL}`);
    expect(promoCaption(promoShare('T', 'x')).split('\n')).toHaveLength(2);
  });
  it('das GIF liegt neben der App (og:image, absolute Adresse)', () => {
    expect(PROMO_GIF_URL).toBe(`${APP_URL}promo.gif`);
    expect(PROMO_GIF_URL.startsWith('https://')).toBe(true);
  });
});

// Gelesen wie in license.test.ts über Vites Raw-Import (die tests-tsconfig
// kennt kein node:fs).
const files = {
  ...import.meta.glob('../index.html', { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob('../README*.md', { query: '?raw', import: 'default', eager: true }),
} as Record<string, string>;

describe('Promo-Texte und Adresse hängen zusammen', () => {
  const html = files['../index.html']!;
  it('index.html teilt dieselbe Adresse und dasselbe GIF (og:url/og:image)', () => {
    expect(html).toContain(`<meta property="og:url" content="${APP_URL}">`);
    expect(html).toContain(`<meta property="og:image" content="${PROMO_GIF_URL}">`);
  });
  it('README nennt die Live-Adresse (der Link im Teilen-Text muss stimmen)', () => {
    for (const f of ['../README.md', '../README.de.md']) expect(files[f]).toContain(APP_URL);
  });
  it('jede Sprache hat einen eigenen Werbetext (kein Deutsch im Englischen)', () => {
    const texts = [de, en, fr, es].map((d) => d['promo.text']);
    expect(new Set(texts).size).toBe(4);
    // Lang genug, um zu erklären, worum es geht – und kurz genug für einen
    // Messenger (Web Share `text`).
    for (const s of texts) expect(s.length).toBeGreaterThan(80);
    for (const s of texts) expect(s.length).toBeLessThan(320);
  });
});
