import { describe, expect, it } from 'vitest';
import { generateDailyLevel, patrolCrossable, todayUTC, formatDate } from '../src/levels/daily';
import { loadLevel } from '../src/levels/loader';
import { generateMaze, setWall } from '../src/core/maze';
import { mulberry32 } from '../src/core/rng';
import { buildFloorCells, cellKey, expectAllReachable, reachable, validateLevel } from './helpers';

// Drei Wochen ab Montag, 5.1.2026 – deckt jeden Wochentag dreimal ab.
const DATES = Array.from({ length: 21 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 0, 5 + i));
  return d.toISOString().slice(0, 10);
});

describe('Tages-Challenge', () => {
  it('ist reproduzierbar: gleiches Datum -> identisches Level', () => {
    expect(generateDailyLevel('2026-01-05')).toEqual(generateDailyLevel('2026-01-05'));
    expect(generateDailyLevel('2026-01-05')).not.toEqual(generateDailyLevel('2026-01-06'));
  });

  it('Wochentag bestimmt die Struktur (Mo: 2 Ebenen, So: 3 Ebenen, 8x11)', () => {
    const monday = generateDailyLevel('2026-01-05');
    expect(monday.floors).toHaveLength(2);
    expect(monday.floors[0]!.size).toEqual([5, 6]);
    const sunday = generateDailyLevel('2026-01-11');
    expect(sunday.floors).toHaveLength(3);
    expect(sunday.floors[0]!.size).toEqual([8, 11]);
  });

  it('das Ziel liegt immer auf der untersten Ebene (Ebenenwechsel ist Pflicht)', () => {
    for (const date of DATES) {
      const def = generateDailyLevel(date);
      def.floors.forEach((f, i) => {
        expect(f.goal !== null, `${date}: Ebene ${i}`).toBe(i === def.floors.length - 1);
      });
    }
  });

  it('21 aufeinanderfolgende Tage laden und sind vollständig erreichbar', () => {
    for (const date of DATES) {
      const def = generateDailyLevel(date);
      expect(() => loadLevel(def), date).not.toThrow();
      expectAllReachable(def, (cond, msg) => expect(cond, `${date} ${msg}`).toBe(true));
    }
  });

  it('Wächter-Patrouillen verlaufen durch offene Gänge', () => {
    for (const date of DATES) {
      const def = generateDailyLevel(date);
      def.floors.forEach((floor) => {
        const cells = buildFloorCells(floor, { brittleOpen: false, doorsOpen: false });
        const cols = floor.size[0];
        for (const el of floor.elements) {
          if (el.type !== 'guard') continue;
          for (let i = 1; i < el.patrol.length; i++) {
            const [ax, ay] = el.patrol[i - 1]!;
            const [bx, by] = el.patrol[i]!;
            let [x, y] = [ax, ay];
            while (x !== bx || y !== by) {
              const dx = Math.sign(bx - x),
                dy = Math.sign(by - y);
              const c = cells[y * cols + x]!;
              const open = dx === 1 ? !c.e : dx === -1 ? !c.w : dy === 1 ? !c.s : !c.n;
              expect(open, `${date}: Patrouille blockiert bei (${x},${y})`).toBe(true);
              x += dx;
              y += dy;
            }
          }
        }
      });
    }
  });

  it('M11: Ziel und Checkpoints bleiben MIT gesperrten Glas-/Anker-Zellen erreichbar', () => {
    // Glasboden zerbricht dauerhaft zum Loch, der Anker zieht – beide dürfen
    // deshalb nie auf einem Pflichtweg liegen. Konservatives Modell: ihre
    // Zellen sind komplett gesperrt.
    for (const date of DATES) {
      const def = generateDailyLevel(date);
      const safe = reachable(def, { brittleOpen: false, doorsOpen: true, hazardsBlocked: true });
      def.floors.forEach((floor, fl) => {
        if (floor.goal) expect(safe.has(cellKey(fl, floor.goal)), `${date}: Ziel E${fl}`).toBe(true);
        for (const el of floor.elements) {
          if (el.type === 'checkpoint' || el.type === 'transporter') {
            expect(safe.has(cellKey(fl, el.cell)), `${date}: ${el.type} E${fl} ${el.cell}`).toBe(true);
          }
        }
      });
    }
  });

  it('M27: höchstens EIN Musikautomat je Ebene, und nie ein Riegel', () => {
    // Ein Automat ist eine WAND: Er darf weder das Ziel noch ein Sammelziel
    // noch eine Wächter-Patrouille wegmauern, und man muss ihn anrempeln
    // können. Genau das prüft der 'jukebox'-Beweis in validate.ts.
    // (Der Tag ist für ALLE derselbe – ein eingemauertes Gem wäre an diesem
    // Tag für niemanden erreichbar.)
    for (const date of DATES) {
      const def = generateDailyLevel(date);
      for (const floor of def.floors) {
        expect(floor.elements.filter((e) => e.type === 'jukebox').length, date).toBeLessThanOrEqual(1);
      }
      const jb = validateLevel(def).find((c) => c.key === 'jukebox')!;
      expect(jb.ok, `${date}: ${jb.detail ?? ''}`).toBe(true);
    }
  });

  it('M28: Wächter versiegeln keinen Gang – der Beweis ist an jedem Tag grün', () => {
    // DER Fehler der Tages-Challenge: Der Generator würfelte regelmäßig eine
    // Zwei-Zellen-Patrouille in einen ein Zelle breiten Gang auf dem einzigen
    // Weg zum Ziel. An einem Wächter kommt man dort nicht vorbei (Kollision ab
    // 48 Einheiten, seitlich sind höchstens 23 möglich) – der Tag war für ALLE
    // unlösbar. Die Kampagne hat den Beweis seit M18, der Generator jetzt auch.
    for (const date of DATES) {
      const def = generateDailyLevel(date);
      const g = validateLevel(def).find((c) => c.key === 'guards')!;
      expect(g.ok, `${date}: ${g.detail ?? ''}`).toBe(true);
    }
  });

  it('M28: die Ausweichbucht-Regel (patrolCrossable) im Detail', () => {
    // 3x3-Gitter, alles offen, dann gezielt zumauern.
    const build = (walls: Array<[number, number, 'n' | 'e' | 's' | 'w']>) => {
      const cells = generateMaze(3, 3, mulberry32(1));
      for (let y = 0; y < 3; y++) {
        for (let x = 0; x < 3; x++) {
          if (x < 2) setWall(cells, 3, 3, x, y, 'e', false);
          if (y < 2) setWall(cells, 3, 3, x, y, 's', false);
        }
      }
      for (const [x, y, d] of walls) setWall(cells, 3, 3, x, y, d, true);
      return cells;
    };
    // Zwei-Zellen-Patrouille in einem ein Zelle breiten Gang: dicht – es gibt
    // gar keinen Zugang von der Seite.
    const corridor2 = build([
      [0, 0, 's'],
      [1, 0, 's'],
    ]);
    expect(patrolCrossable(corridor2, 3, 3, [[0, 0], [1, 0]])).toBe(false);
    // Dieselbe Patrouille, aber (1,0) hat ZWEI Zugänge (nach unten und nach
    // Osten): Man kommt an derselben Zelle herein und woanders heraus,
    // während der Wächter auf der anderen Zelle steht. Passierbar.
    const withBay = build([[0, 0, 's']]);
    expect(patrolCrossable(withBay, 3, 3, [[0, 0], [1, 0]])).toBe(true);
    // Drei Zellen, Zugänge NUR an den beiden Enden: Spanne 3 = Länge 3, also
    // bleibt beim Queren keine Zelle für den Wächter – dicht.
    const endsOnly = build([[1, 0, 's']]);
    expect(patrolCrossable(endsOnly, 3, 3, [[0, 0], [1, 0], [2, 0]])).toBe(false);
    // Drei Zellen mit zusätzlichem Zugang in der MITTE: Spanne 2 < 3 – der
    // Wächter kann auf der dritten Zelle warten. Passierbar.
    const midBay = build([]);
    expect(patrolCrossable(midBay, 3, 3, [[0, 0], [1, 0], [2, 0]])).toBe(true);
  });

  it('Ankunft auf tieferen Ebenen ist ein Checkpoint', () => {
    const def = generateDailyLevel('2026-01-11'); // Sonntag, 3 Ebenen
    for (let f = 1; f < def.floors.length; f++) {
      const floor = def.floors[f]!;
      const cp = floor.elements.find((e) => e.type === 'checkpoint');
      expect(cp, `Ebene ${f}`).toBeDefined();
      expect(cp!.cell).toEqual(floor.start);
    }
  });

  it('Hilfsfunktionen: heutiges UTC-Datum und deutsche Formatierung', () => {
    expect(todayUTC()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(formatDate('2026-01-05')).toBe('05.01.2026');
  });
});
