/**
 * DIAGNOSE-BERICHT (M80): Was der Beweis über ein Level sagt, in einer Form,
 * die eine Datei oder ein Link mitnehmen kann.
 *
 * Grund: Ein Level mit roten Badges ist genau das, was man ANSCHAUEN will –
 * der Bauende sieht ein Kreuz, versteht es nicht und braucht jemanden, der
 * mitliest. Bis 3.11.1 kam es aber nicht aus dem Gerät heraus: Teilen war an
 * grüne Pflicht-Badges gebunden, und die Export-Datei trug nur die Def, also
 * ohne den Befund, um den es geht.
 *
 * Rein und DOM-frei: Der Bericht ist abgeleitet, keine zweite Wahrheit.
 */
import { SOFT_CHECKS, type CheckResult } from './validate';

/** Ein Befund in Datei-Form: Schlüssel, hart/weich, Detail und Ort. */
export interface Finding {
  key: string;
  soft: boolean;
  detail?: string;
  /** Ebene (1-basiert, wie im Editor) und Zelle in DEF-Koordinaten. */
  at?: { floor: number; cell: [number, number] };
}

/** Nur die NICHT-grünen Checks, in Berichtsreihenfolge. Grüne Badges sagen
 *  nichts über den Fehler – sie würden die Datei nur länger machen. */
export function findings(checks: CheckResult[]): Finding[] {
  return checks
    .filter((c) => !c.ok)
    .map((c) => ({
      key: c.key,
      soft: SOFT_CHECKS.has(c.key),
      ...(c.detail !== undefined ? { detail: c.detail } : {}),
      ...(c.at ? { at: { floor: c.at.floor + 1, cell: [c.at.cell[0], c.at.cell[1]] as [number, number] } } : {}),
    }));
}

/** Kurzfassung für die Oberfläche: „2 rot, 1 Warnung" – oder null, wenn alles
 *  grün ist. */
export function findingsSummary(checks: CheckResult[]): { hard: number; soft: number } | null {
  const f = findings(checks);
  if (!f.length) return null;
  return { hard: f.filter((x) => !x.soft).length, soft: f.filter((x) => x.soft).length };
}
