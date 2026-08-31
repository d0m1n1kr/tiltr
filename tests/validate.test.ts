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

  it('hängende Verknüpfungen: links-Check schlägt an, load bleibt grün', () => {
    // Tür ohne Öffner – ein normaler Editor-Zwischenzustand: lauffähig,
    // aber nicht teilbar.
    const orphanDoor = base();
    orphanDoor.floors[0]!.elements.push({ type: 'door', id: 'tor1', edge: [[1, 4], 'e'] });
    const c1 = validateLevel(orphanDoor);
    expect(by(c1, 'load')!.ok).toBe(true);
    expect(by(c1, 'links')).toMatchObject({ ok: false, detail: 'Tür „tor1" ohne Öffner' });
    expect(isShareable(c1)).toBe(false);

    // Schlüssel auf nicht existierende Tür.
    const orphanKey = base();
    orphanKey.floors[0]!.elements.push({ type: 'key', cell: [1, 1], opens: 'tor9' });
    const c2 = validateLevel(orphanKey);
    expect(by(c2, 'load')!.ok).toBe(true);
    expect(by(c2, 'links')).toMatchObject({ ok: false, detail: 'key → Tür „tor9" fehlt' });
    expect(isShareable(c2)).toBe(false);

    // Vollständiges Paar: links grün.
    const paired = base();
    paired.floors[0]!.elements.push(
      { type: 'door', id: 'tor1', edge: [[1, 4], 'e'] },
      { type: 'key', cell: [1, 1], opens: 'tor1' },
    );
    expect(by(validateLevel(paired), 'links')!.ok).toBe(true);
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

  it('Wächter im Ein-Zellen-Korridor: guards-Check schlägt an', () => {
    // Korridor von links nach rechts, Ziel dahinter, Wächter mittendrin und
    // KEIN Ausweg – an ihm kommt man nie vorbei (er lässt sich nicht
    // überholen, seitlich passen nur 23 der nötigen 48 Einheiten).
    const sealed = {
      id: 'custom-riegel',
      name: 'Riegel',
      pingBudget: 3,
      floors: [
        {
          size: [5, 2],
          maze: {
            seed: 4,
            carve: [[[0, 0], 'e'], [[1, 0], 'e'], [[2, 0], 'e'], [[3, 0], 'e']],
            add: [[[0, 0], 's'], [[1, 0], 's'], [[2, 0], 's'], [[3, 0], 's'], [[4, 0], 's']],
          },
          elements: [{ type: 'guard', patrol: [[1, 0], [3, 0]], speed: 85 }],
          start: [0, 0],
          goal: [4, 0],
        },
      ],
    };
    const checks = validateLevel(sealed);
    expect(by(checks, 'goal')!.ok).toBe(true); // im offenen Modell erreichbar …
    expect(by(checks, 'guards')).toMatchObject({ ok: false }); // … aber verriegelt
    expect(isShareable(checks)).toBe(false);

    // Mit einer Ausweichbucht unter der Patrouillen-Mitte ist es lösbar:
    // dort wartet man, bis der Wächter kehrtmacht.
    const withBay = JSON.parse(JSON.stringify(sealed)) as typeof sealed;
    withBay.floors[0]!.maze.add = withBay.floors[0]!.maze.add.filter((e) => (e as number[][])[0]![0] !== 2);
    (withBay.floors[0]!.maze.carve as unknown[]).push([[2, 0], 's']); // Bucht unter der Mitte
    const c2 = validateLevel(withBay);
    const g2 = by(c2, 'guards')!;
    expect(g2.ok, g2.detail).toBe(true);
  });

  it('alle Kampagnen-Level bestehen den kompletten Prüfbericht', () => {
    for (const def of CAMPAIGN_LEVELS) {
      const checks = validateLevel(def);
      for (const c of checks) expect(c.ok, `${def.id}: ${c.key} ${c.detail ?? ''}`).toBe(true);
      expect(isShareable(checks), def.id).toBe(true);
    }
  });
});
