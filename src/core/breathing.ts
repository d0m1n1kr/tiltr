// Atem-Zyklus: die Uhr hinter allem, was sich von selbst öffnet und schließt
// (atmende Löcher, Schiebewände). Ein Zyklus läuft
//
//   öffnen (ramp) -> offen (open) -> schließen (ramp) -> zu (closed)
//
// und wiederholt sich; `offset` verschiebt die Phase, damit mehrere Elemente
// gegeneinander taktbar sind ("Taktstraße").
//
// Warum eigenes Modul: Diese Rechnung stand zweimal identisch in app.ts (für
// Löcher und für Schiebewände) – und der EDITOR braucht sie ein drittes Mal
// für seine Play-Vorschau. Eine Quelle der Wahrheit, deterministisch und
// DOM-frei, damit die Testsuite sie festnageln kann.

export interface BreathCycle {
  /** Sekunden vollständig offen */
  open: number;
  /** Sekunden vollständig zu */
  closed: number;
  /** Sekunden für Öffnen bzw. Schließen (je einmal pro Zyklus) */
  ramp: number;
  /** Phasenversatz in Sekunden */
  offset: number;
}

export type BreathState = 'opening' | 'open' | 'closing' | 'closed';

export interface BreathPhase {
  /** 0 = zu, 1 = offen (linear während der Rampen) */
  openness: number;
  state: BreathState;
}

/** Dauer eines vollen Zyklus in Sekunden (zwei Rampen + offen + zu). */
export const breathPeriod = (c: BreathCycle): number => c.ramp * 2 + c.open + c.closed;

/** Zustand des Zyklus zum Zeitpunkt `timeS` (Sekunden, beliebig groß). */
export function breathAt(c: BreathCycle, timeS: number): BreathPhase {
  const period = breathPeriod(c);
  // Modulo auch für negative Zeiten sauber (Editor kann rückwärts scrubben).
  const cyc = ((timeS + c.offset) % period + period) % period;
  if (cyc < c.ramp) return { openness: cyc / c.ramp, state: 'opening' };
  if (cyc < c.ramp + c.open) return { openness: 1, state: 'open' };
  if (cyc < c.ramp * 2 + c.open) {
    return { openness: 1 - (cyc - c.ramp - c.open) / c.ramp, state: 'closing' };
  }
  return { openness: 0, state: 'closed' };
}

/** Restzeit im Zustand 'open' (für den beschleunigten Warn-Takt der
 *  Schiebewand). Außerhalb von 'open' 0. */
export function breathOpenRemaining(c: BreathCycle, timeS: number): number {
  const period = breathPeriod(c);
  const cyc = ((timeS + c.offset) % period + period) % period;
  if (cyc < c.ramp || cyc >= c.ramp + c.open) return 0;
  return c.ramp + c.open - cyc;
}
