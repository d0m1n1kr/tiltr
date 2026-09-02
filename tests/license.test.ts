import { describe, expect, it } from 'vitest';

// Lizenz (v3.0.6): Code unter PolyForm Noncommercial 1.0.0, Inhalte unter
// CC BY-NC-SA 4.0. Ohne LICENSE-Datei gilt „alle Rechte vorbehalten" – der
// Test hält fest, dass beide Dateien da sind, vollständig und verlinkt.
// Gelesen wie in music.test.ts über Vites Raw-Import (die tests-tsconfig kennt
// kein node:fs).
const files = {
  ...import.meta.glob('../LICENSE*', { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob('../README*.md', { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob('../package.json', { query: '?raw', import: 'default', eager: true }),
} as Record<string, string>;
const read = (p: string): string => {
  const text = files[`../${p}`];
  if (text === undefined) throw new Error(`Datei fehlt: ${p}`);
  return text;
};

describe('Lizenz', () => {
  it('LICENSE trägt die PolyForm Noncommercial 1.0.0 samt Required Notice und Kontakt', () => {
    const lic = read('LICENSE');
    expect(lic).toContain('# PolyForm Noncommercial License 1.0.0');
    expect(lic).toContain('Required Notice: Copyright (c) 2026 Dominik Rössler');
    expect(lic).toContain('https://github.com/d0m1n1kr/tiltr');
    // Der Lizenztext endet mit den Definitionen – nicht abgeschnitten.
    expect(lic.trim().endsWith('of your licenses.')).toBe(true);
  });

  it('LICENSE-CONTENT trägt den vollständigen Legal Code von CC BY-NC-SA 4.0', () => {
    const cc = read('LICENSE-CONTENT');
    expect(cc).toContain('Attribution-NonCommercial-ShareAlike 4.0 International');
    expect(cc).toContain('Section 1 -- Definitions.');
    expect(cc).toContain('Section 8 -- Interpretation.');
    expect(cc).toContain('https://creativecommons.org/licenses/by-nc-sa/4.0/');
  });

  it('package.json und beide READMEs verweisen auf die Lizenzen', () => {
    const pkg = JSON.parse(read('package.json')) as { license?: string };
    expect(pkg.license).toBe('SEE LICENSE IN LICENSE');
    for (const f of ['README.md', 'README.de.md']) {
      const md = read(f);
      expect(md, f).toContain('PolyForm Noncommercial License 1.0.0');
      expect(md, f).toContain('CC BY-NC-SA 4.0');
      expect(md, f).toContain('(LICENSE)');
      expect(md, f).toContain('(LICENSE-CONTENT)');
    }
  });
});
