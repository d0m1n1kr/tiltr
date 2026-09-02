// Import aus dem Teilen-Link. Der Grund: Ein geteilter Link öffnet immer den
// BROWSER, nie die installierte PWA – wer das Level dort haben will, fügt den
// Link ins Import-Feld ein. Dasselbe Feld nimmt weiterhin JSON.
//
// Store-Singleton wie in workshop.test.ts: localStorage-Stub VOR dem Import.

import { beforeAll, describe, expect, it } from 'vitest';
import { encodeLevel } from '../src/levels/shareCodec';
import { encodeDuel } from '../src/levels/duel';

const backing = new Map<string, string>();
let workshop: typeof import('../src/workshop').workshop;
let blankLevel: typeof import('../src/workshop').blankLevel;
let parseShareText: typeof import('../src/workshop').parseShareText;
let importAny: typeof import('../src/workshop').importAny;

beforeAll(async () => {
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => backing.get(k) ?? null,
    setItem: (k: string, v: string) => void backing.set(k, v),
    removeItem: (k: string) => void backing.delete(k),
  };
  ({ workshop, blankLevel, parseShareText, importAny } = await import('../src/workshop'));
});

const TOKEN = '1abcdefghijklmnop_-XYZ';

describe('parseShareText', () => {
  it('kompletter Link', () => {
    expect(parseShareText(`https://d0m1n1kr.github.io/tiltr/#level=${TOKEN}`)).toEqual({ kind: 'level', token: TOKEN });
  });
  it('nur der Hash, mit Leerraum drumherum', () => {
    expect(parseShareText(`  #level=${TOKEN}\n`)).toEqual({ kind: 'level', token: TOKEN });
  });
  it('nacktes Token (Codec-Version 0 oder 1)', () => {
    expect(parseShareText(TOKEN)).toEqual({ kind: 'level', token: TOKEN });
    expect(parseShareText('0' + TOKEN.slice(1))).toEqual({ kind: 'level', token: '0' + TOKEN.slice(1) });
  });
  it('Duell-Link wird als Duell erkannt', () => {
    expect(parseShareText(`https://x.test/tiltr/#duel=${TOKEN}`)).toEqual({ kind: 'duel', token: TOKEN });
  });
  it('JSON, Prosa und zu kurze Tokens sind KEIN Teilen-Text', () => {
    expect(parseShareText('{"id":"x"}')).toBeNull();
    expect(parseShareText('hallo welt')).toBeNull();
    expect(parseShareText('#level=abc')).toBeNull();
    expect(parseShareText('2' + TOKEN.slice(1))).toBeNull(); // unbekannte Codec-Version
  });
});

describe('importAny', () => {
  it('Link → Level in der Bibliothek, mit frischer custom-ID', async () => {
    const def = blankLevel('Aus dem Link');
    def.id = 'fremd-123';
    const url = `https://d0m1n1kr.github.io/tiltr/#level=${await encodeLevel(def)}`;
    const level = await importAny(url);
    expect(level).not.toBeNull();
    expect(level!.def.name).toBe('Aus dem Link');
    expect(level!.id.startsWith('custom-')).toBe(true);
    expect(workshop.get(level!.id)).not.toBeNull();
  });

  it('Duell-Link → das enthaltene Level', async () => {
    const def = blankLevel('Aus dem Duell');
    const token = await encodeDuel(def, 12.3, null, 'Rivale');
    const level = await importAny(`#duel=${token}`);
    expect(level?.def.name).toBe('Aus dem Duell');
  });

  it('JSON geht weiterhin über dasselbe Feld', async () => {
    const level = await importAny(JSON.stringify(blankLevel('Als JSON')));
    expect(level?.def.name).toBe('Als JSON');
  });

  it('kaputtes Token und Fremdtext: null, kein Wurf', async () => {
    expect(await importAny('#level=' + 'Q'.repeat(20))).toBeNull(); // Version „Q" gibt es nicht
    expect(await importAny('1' + 'AAAA'.repeat(5))).toBeNull(); // dekodiert nicht zu einem Level
    expect(await importAny('einfach Text')).toBeNull();
  });
});
