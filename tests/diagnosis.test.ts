// DIAGNOSE-BERICHT (M80): Ein Level mit roten Badges ist genau das, was man
// jemandem zeigen will. Der Bericht muss deshalb aus dem Gerät heraus – in der
// Export-Datei, neben der Def, und ohne den Import zu brechen.
//
// Store-Singleton wie in shareImport.test.ts: localStorage-Stub VOR dem Import.

import { beforeAll, describe, expect, it } from 'vitest';
import { findings, findingsSummary } from '../src/levels/diagnosis';
import { validateLevel } from '../src/levels/validate';
import type { CheckResult } from '../src/levels/validate';

const backing = new Map<string, string>();
let exportPayload: typeof import('../src/workshop').exportPayload;
let parseLevelText: typeof import('../src/workshop').parseLevelText;
let blankLevel: typeof import('../src/workshop').blankLevel;

beforeAll(async () => {
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => backing.get(k) ?? null,
    setItem: (k: string, v: string) => void backing.set(k, v),
    removeItem: (k: string) => void backing.delete(k),
  };
  ({ exportPayload, parseLevelText, blankLevel } = await import('../src/workshop'));
});

const checks: CheckResult[] = [
  { key: 'load', ok: true },
  { key: 'goal', ok: true },
  { key: 'softlock', ok: false, detail: '1:3,5 – kein Rückweg', at: { floor: 1, cell: [3, 5] } },
  { key: 'timer', ok: false, detail: '2,1 s für 9 Zellen' },
];

describe('findings', () => {
  it('nur die nicht-grünen Checks, Ebene 1-basiert wie im Editor', () => {
    expect(findings(checks)).toEqual([
      { key: 'softlock', soft: false, detail: '1:3,5 – kein Rückweg', at: { floor: 2, cell: [3, 5] } },
      { key: 'timer', soft: true, detail: '2,1 s für 9 Zellen' },
    ]);
  });
  it('grün ⇒ leer, und die Kurzfassung sagt null', () => {
    const green = checks.filter((c) => c.ok);
    expect(findings(green)).toEqual([]);
    expect(findingsSummary(green)).toBeNull();
  });
  it('Kurzfassung trennt hart und weich (weich blockiert das Teilen nicht)', () => {
    expect(findingsSummary(checks)).toEqual({ hard: 1, soft: 1 });
  });
});

describe('exportPayload mit Bericht', () => {
  it('hängt Befunde und App-Version an – und bleibt importierbar', () => {
    const def = blankLevel('Kaputt') as unknown as Record<string, unknown>;
    const text = exportPayload(def, findings(checks));
    const obj = JSON.parse(text) as Record<string, unknown>;
    expect(obj.report).toHaveLength(2);
    expect(typeof obj.app).toBe('string');
    // Der Import liest NUR `def` – ein Feld mehr in der Hülle stört ihn nicht.
    expect(parseLevelText(text)).not.toBeNull();
  });
  it('ohne Befunde bleibt die Hülle schlank (kein leeres report-Feld)', () => {
    const def = blankLevel('Sauber') as unknown as Record<string, unknown>;
    const obj = JSON.parse(exportPayload(def, findings(validateLevel(def)))) as Record<string, unknown>;
    // blankLevel ist beweisbar lösbar; erst ein echter Befund schreibt das Feld.
    expect(findings(validateLevel(def))).toEqual([]);
    expect('report' in obj).toBe(false);
    expect('app' in obj).toBe(false);
  });
});
