// Release-Schrittfolge (tools/release.mjs): Die Versionsnummer entsteht ZULETZT,
// erst wenn die Suite grün ist. Geprüft werden hier die reinen Teile – die
// Schranken, an denen ein falscher Aufruf scheitern MUSS, und der Eingriff in
// package.json (der die Datei sonst umformatiert hätte).

import { describe, expect, it } from 'vitest';
// @ts-expect-error – reines Node-Werkzeug ohne Typen (wie tools/promo.mjs)
import { bumpJson, isHigher, parseVersion } from '../tools/release.mjs';

describe('parseVersion', () => {
  it('nimmt x.y.z und sonst nichts', () => {
    expect(parseVersion('3.22.0')).toEqual([3, 22, 0]);
    expect(parseVersion(' 3.22.0 ')).toEqual([3, 22, 0]);
    expect(parseVersion('3.22')).toBeNull();
    expect(parseVersion('v3.22.0')).toBeNull();
    expect(parseVersion('3.22.0-beta')).toBeNull();
    expect(parseVersion('')).toBeNull();
  });
});

describe('isHigher', () => {
  it('die Zahl muss STEIGEN – Gleichstand ist nein (kein Update-Toast)', () => {
    expect(isHigher('3.22.0', '3.22.1')).toBe(true);
    expect(isHigher('3.22.0', '3.23.0')).toBe(true);
    expect(isHigher('3.22.0', '4.0.0')).toBe(true);
    expect(isHigher('3.22.0', '3.22.0')).toBe(false);
    expect(isHigher('3.22.0', '3.21.9')).toBe(false);
    expect(isHigher('3.22.0', '2.99.99')).toBe(false);
  });

  it('vergleicht je Stelle als ZAHL, nicht als Text (3.9 < 3.22)', () => {
    expect(isHigher('3.9.0', '3.22.0')).toBe(true);
    expect(isHigher('3.22.0', '3.9.0')).toBe(false);
  });

  it('Unfug ist nie höher', () => {
    expect(isHigher('3.22.0', 'morgen')).toBe(false);
    expect(isHigher('kaputt', '3.23.0')).toBe(false);
  });
});

describe('bumpJson', () => {
  const pkg = `{
  "name": "tiltr",
  "version": "3.22.0",
  "private": true,
  "dependencies": { "zod": "3.22.0" }
}
`;

  it('ersetzt NUR das Versionsfeld – Formatierung und Reihenfolge bleiben', () => {
    const out = bumpJson(pkg, '3.23.0');
    expect(out).toContain('"version": "3.23.0"');
    // Die Abhängigkeit trägt zufällig dieselbe Zahl und bleibt unangetastet.
    expect(out).toContain('"zod": "3.22.0"');
    expect(out.split('\n')).toHaveLength(pkg.split('\n').length);
    expect(out.startsWith('{\n  "name": "tiltr",')).toBe(true);
  });

  it('ohne Versionsfeld wirft es statt still nichts zu tun', () => {
    expect(() => bumpJson('{ "name": "x" }', '1.0.0')).toThrow(/version/);
  });
});
