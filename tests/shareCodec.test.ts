// Share-Codec: Roundtrip über den nativen CompressionStream (Node ≥ 18),
// Fallback-Variante '0' (unkomprimiert), deterministische Tokens, und dass
// Deflate sich für echte Level tatsächlich lohnt.

import { describe, expect, it } from 'vitest';
import { decodeLevel, encodeLevel } from '../src/levels/shareCodec';
import { CAMPAIGN_LEVELS } from '../src/levels/campaign';

const rawToken = (def: unknown): string => {
  const json = new TextEncoder().encode(JSON.stringify(def));
  let bin = '';
  for (const b of json) bin += String.fromCharCode(b);
  return '0' + btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
};

describe('Share-Codec', () => {
  it('Roundtrip: encode -> decode liefert die identische Def (deflate, Version 1)', async () => {
    const def = JSON.parse(JSON.stringify(CAMPAIGN_LEVELS[0])) as Record<string, unknown>;
    const token = await encodeLevel(def);
    expect(token[0]).toBe('1');
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/); // URL-tauglich, kein Padding
    expect(await decodeLevel(token)).toEqual(def);
  });

  it('ist deterministisch: gleiche Def -> gleiches Token', async () => {
    const def = JSON.parse(JSON.stringify(CAMPAIGN_LEVELS[3])) as Record<string, unknown>;
    expect(await encodeLevel(def)).toBe(await encodeLevel(def));
  });

  it('liest auch die unkomprimierte Fallback-Variante (Version 0)', async () => {
    const def = { id: 'custom-x', name: 'Ünïcodé ✓', floors: [] };
    expect(await decodeLevel(rawToken(def))).toEqual(def);
  });

  it('Deflate lohnt sich: großes Level deutlich kleiner als unkomprimiert', async () => {
    const big = CAMPAIGN_LEVELS.find((l) => l.id === 'w3-06')!;
    const def = JSON.parse(JSON.stringify(big)) as Record<string, unknown>;
    const token = await encodeLevel(def);
    expect(token.length).toBeLessThan(rawToken(def).length * 0.55);
  });

  it('weist kaputte Tokens ab', async () => {
    await expect(decodeLevel('zabc')).rejects.toThrow(/Codec-Version/); // unbekannte Version
    await expect(decodeLevel('1AAAA')).rejects.toThrow(); // kein gültiges Deflate
    await expect(decodeLevel(rawToken([1, 2, 3]))).rejects.toThrow(/Level-Objekt/);
  });
});
