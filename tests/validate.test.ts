// validateLevel: der Prüfbericht, den der Editor als Badges zeigt – gebaut
// aus denselben Beweisen wie die Testsuite. Hier: ein rundum gesundes Level,
// gezielt kaputte Varianten, und isShareable.

import { describe, expect, it } from 'vitest';
import { validateLevel, isShareable, type CheckResult } from '../src/levels/validate';
import { CAMPAIGN_LEVELS } from '../src/levels/campaign';

const by = (checks: CheckResult[], key: string) => checks.find((c) => c.key === key);

const carveDown = (x: number, y0: number, y1: number) =>
  Array.from({ length: y1 - y0 }, (_, i) => [[x, y0 + i], 's']);

const base = () => ({
  id: 'custom-test',
  name: 'Test',
  pingBudget: 3,
  floors: [
    {
      size: [4, 5],
      maze: {
        seed: 7,
        carve: [...carveDown(0, 0, 4), [[0, 4], 'e'], [[1, 4], 'e'], [[2, 4], 'e']],
        add: [] as unknown[],
      },
      elements: [] as unknown[],
      start: [0, 0],
      goal: [3, 4],
    },
  ],
});

describe('validateLevel', () => {
  it('gesundes Level: alle Checks grün, teilbar', () => {
    const checks = validateLevel(base());
    expect(checks.length).toBeGreaterThan(1);
    for (const c of checks) expect(c.ok, c.key).toBe(true);
    expect(isShareable(checks)).toBe(true);
  });

  it('kaputte Def: nur der load-Check, nicht teilbar', () => {
    const raw = base();
    raw.floors[0]!.elements.push({ type: 'laser', cell: [1, 1] });
    const checks = validateLevel(raw);
    expect(checks).toHaveLength(1);
    expect(checks[0]).toMatchObject({ key: 'load', ok: false });
    expect(isShareable(checks)).toBe(false);
  });

  it('Schalter HINTER seiner Tür: openers-Check schlägt an', () => {
    const raw = base();
    // Tür auf dem Pflichtweg, Schalter dahinter in der Zielecke
    raw.floors[0]!.elements.push(
      { type: 'door', id: 'tor', edge: [[1, 4], 'e'] },
      { type: 'timedSwitch', cell: [3, 4], opens: 'tor', durationS: 9 },
    );
    // Restmaze abriegeln, damit es keinen Umweg gibt: alle anderen Wege zu
    raw.floors[0]!.maze.carve = [...carveDown(0, 0, 4), [[0, 4], 'e'], [[1, 4], 'e'], [[2, 4], 'e']];
    const checks = validateLevel(raw);
    // je nach Seed-Maze kann ein Umweg existieren – dann greift der Beweis
    // nicht; das Level unten erzwingt die Abriegelung über add-Wände.
    if (by(checks, 'openers')!.ok) {
      const sealed = base();
      sealed.floors[0]!.maze.add = [
        [[1, 3], 'e'], [[0, 3], 'e'],
        [[1, 4], 's'], [[2, 3], 's'], [[3, 3], 's'], [[2, 4], 'e'],
      ] as never;
      sealed.floors[0]!.elements.push(
        { type: 'door', id: 'tor', edge: [[1, 4], 'e'] },
        { type: 'timedSwitch', cell: [3, 4], opens: 'tor', durationS: 9 },
      );
      const c2 = validateLevel(sealed);
      expect(by(c2, 'load')!.ok).toBe(true);
      expect(by(c2, 'openers')!.ok).toBe(false);
      expect(isShareable(c2)).toBe(false);
    } else {
      expect(isShareable(checks)).toBe(false);
    }
  });

  it('zu knapper Zeitschloss-Timer: timer-Check schlägt an', () => {
    const raw = base();
    raw.floors[0]!.elements.push(
      { type: 'door', id: 'tor', edge: [[2, 4], 'e'] },
      { type: 'timedSwitch', cell: [0, 0], opens: 'tor', durationS: 1 },
    );
    const checks = validateLevel(raw);
    expect(by(checks, 'timer')!.ok).toBe(false);
  });

  it('alle Kampagnen-Level bestehen den kompletten Prüfbericht', () => {
    for (const def of CAMPAIGN_LEVELS) {
      const checks = validateLevel(def);
      for (const c of checks) expect(c.ok, `${def.id}: ${c.key} ${c.detail ?? ''}`).toBe(true);
      expect(isShareable(checks), def.id).toBe(true);
    }
  });
});
