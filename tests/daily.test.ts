import { describe, expect, it } from 'vitest';
import { generateDailyLevel, todayUTC, formatDate } from '../src/levels/daily';
import { loadLevel } from '../src/levels/loader';
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
