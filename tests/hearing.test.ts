// Hörtest-Auswertung: Die Achsen-Trennung ist der Kern des Modus – sie zeigt,
// dass links/rechts (HRTF-Ohrdifferenzen) sicher trägt und vorn/hinten nicht.
// Deshalb wird sie hier festgenagelt, nicht nur die Trefferzahl.

import { describe, expect, it } from 'vitest';
import { HEAR_DIRS, dirVector, scoreRounds, type HearDir, type HearRound } from '../src/ui/hearing';

const round = (asked: HearDir, answered: HearDir): HearRound => ({ asked, answered });

describe('dirVector', () => {
  it('legt Norden nach vorn (-y) und Osten nach rechts (+x)', () => {
    expect(dirVector('n')).toEqual({ dx: 0, dy: -1 });
    expect(dirVector('s')).toEqual({ dx: 0, dy: 1 });
    expect(dirVector('e')).toEqual({ dx: 1, dy: 0 });
    expect(dirVector('w')).toEqual({ dx: -1, dy: 0 });
  });

  it('liefert für alle acht Richtungen Einheitsvektoren', () => {
    for (const dir of HEAR_DIRS) {
      const { dx, dy } = dirVector(dir);
      expect(Math.hypot(dx, dy)).toBeCloseTo(1, 6);
    }
  });

  it('vergibt jede Richtung genau einmal', () => {
    const seen = new Set(HEAR_DIRS.map((d) => `${dirVector(d).dx.toFixed(3)}/${dirVector(d).dy.toFixed(3)}`));
    expect(seen.size).toBe(HEAR_DIRS.length);
  });
});

describe('scoreRounds', () => {
  it('zählt einen perfekten Durchgang in allen Spalten voll', () => {
    const rounds = HEAR_DIRS.map((d) => round(d, d));
    expect(scoreRounds(rounds)).toEqual({ total: 8, exact: 8, close: 8, lateral: 8, depth: 8 });
  });

  it('wertet den Nachbarn als „nah dran", aber nicht als exakt', () => {
    const s = scoreRounds([round('n', 'ne')]);
    expect(s.exact).toBe(0);
    expect(s.close).toBe(1);
  });

  it('zählt zwei Schritte daneben nicht mehr als „nah dran"', () => {
    expect(scoreRounds([round('n', 'e')]).close).toBe(0);
  });

  it('schließt den Kreis: nw und n sind Nachbarn', () => {
    expect(scoreRounds([round('nw', 'n')]).close).toBe(1);
    expect(scoreRounds([round('n', 'nw')]).close).toBe(1);
  });

  it('trennt die Achsen: Front-Back-Konfusion behält die Seite', () => {
    // Klassischer Fehler: rechts erkannt, vorn/hinten gespiegelt.
    const s = scoreRounds([round('ne', 'se'), round('nw', 'sw')]);
    expect(s.exact).toBe(0);
    expect(s.lateral).toBe(2);
    expect(s.depth).toBe(0);
  });

  it('trennt die Achsen auch umgekehrt: Seite verwechselt, Tiefe richtig', () => {
    const s = scoreRounds([round('ne', 'nw')]);
    expect(s.lateral).toBe(0);
    expect(s.depth).toBe(1);
  });

  it('behandelt die Mittelachsen als eigene Klasse (dx bzw. dy = 0)', () => {
    // n und s liegen beide seitlich mittig – die Seiten-Achse ist damit „richtig",
    // die Tiefe klar falsch. Sonst würde eine 180°-Verwechslung fälschlich als
    // Seitenfehler gezählt.
    const s = scoreRounds([round('n', 's')]);
    expect(s.lateral).toBe(1);
    expect(s.depth).toBe(0);
    const t = scoreRounds([round('e', 'w')]);
    expect(t.lateral).toBe(0);
    expect(t.depth).toBe(1);
  });

  it('bleibt bei leerer Eingabe bei Null', () => {
    expect(scoreRounds([])).toEqual({ total: 0, exact: 0, close: 0, lateral: 0, depth: 0 });
  });
});
