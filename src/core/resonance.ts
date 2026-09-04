// DUETT (M91): Ein Tor, das nur ein Duett öffnet.
//
// Zwei Resonanzfelder, eines je Spieler. Wer auf einem steht, erzeugt einen
// Ton – und seine HÖHE kommt aus der NEIGUNGSRICHTUNG, nicht aus der Stärke.
// Das Tor geht auf, wenn die beiden Töne im Zielintervall stehen (Einklang
// oder Quinte, Toleranz ~25 Cent) und dort einen Augenblick bleiben. Beide
// hören die Schwebung langsamer werden, bis sie steht. Der Klang IST das
// Rätsel, und allein ist er nicht lösbar.
//
// DIE RICHTUNG STIMMT, NICHT DIE STÄRKE: Zum Stimmen muss man neigen, und
// Neigen würde einen vom Feld rollen – deshalb hält das Feld die Kugel wie ein
// Sog-Anker (`RESONANCE_FORCE`, per Schema-Invariante unter `accel` 2600: eine
// Schale, nie eine Falle) und die Neigung wird zum Stimmknopf. Kräftig kippen
// heißt hinausrollen.
//
// Die Abbildung ist ÜBERALL STETIG: 0 Cent bei Neigung nach Norden, die Quinte
// bei Süden, und der Weg dorthin geht über Ost ODER West (351 Cent). Ein Kreis,
// der bei 702 auf 0 zurückspringt, hätte eine Naht – dort wäre der Ton
// unspielbar sprunghaft.
//
// Rein und DOM-frei wie alles in core/ – Units in tests/resonance.test.ts.

/** Grundton eines Resonanzfeldes (A3) – tief genug, dass die Schwebung
 *  zählbar ist, hoch genug, um über dem Rollen zu stehen. */
export const RESONANCE_HZ = 220;

/** Reine Quinte in Cent (3/2 = 701,955…). */
export const FIFTH_CENTS = 702;

/** Wie genau gestimmt sein muss. 25 Cent sind hörbar knapp, aber ohne
 *  Sensor-Zittern erreichbar. */
export const TUNE_TOL_CENTS = 25;

/** Wie lange der Ton im Intervall STEHEN muss, damit das Tor aufgeht – sonst
 *  öffnete ein Durchwischen beim Suchen das Tor aus Versehen. Die Zahl hängt
 *  an der Fluchtzeit unten: Sie muss deutlich KÜRZER sein, sonst wäre das Tor
 *  bei voller Neigung nicht zu öffnen. */
export const TUNE_HOLD_MS = 250;

/** Sog des Feldes (px/s²). MUSS unter der Neigungs-Beschleunigung (2600)
 *  bleiben – dieselbe Regel wie beim Sog-Anker (M32): eine Schale, nie eine
 *  Falle. Der Sog fällt mit dem Abstand (`force · (1 − d/r)`, siehe
 *  World.step), also rechnet sich die FLUCHT bei VOLLER Neigung so:
 *  d'' = 2600 − 2400·(1 − d/90) = 200 + 26,7·d, und bis zum Rand der Platte
 *  (30 + halber Ballradius = 41) sind das ~0,49 s. Wer entschieden kippt,
 *  rollt also hinaus – aber erst NACH der Haltezeit (0,25 s). Wer stimmen
 *  will, neigt sanft: darunter zieht die Schale netto nach innen. */
export const RESONANCE_FORCE = 2400;

/** Radius der Schale in Welteinheiten (fast eine Zelle – so findet man sie
 *  beim Anrollen, und der Sog-Verlauf bleibt flach). Die PLATTE darin ist
 *  kleiner; sie entscheidet, ob der Ton klingt. */
export const RESONANCE_R = 90;

export type Interval = 'unison' | 'fifth';

export interface Pitch {
  /** Abstand zum Grundton in Cent (0 … FIFTH_CENTS) */
  cents: number;
  /** Frequenz in Hz */
  hz: number;
}

/** Cent in Frequenz über dem Grundton. */
export const centsToHz = (cents: number, base = RESONANCE_HZ): number => base * 2 ** (cents / 1200);

/**
 * Neigung → Tonhöhe. Norden (nach oben geneigt) ist der Grundton, Süden die
 * Quinte, Ost und West liegen genau in der Mitte – der Weg von unten nach oben
 * geht also über beide Seiten gleich weit. Ohne Neigung (unter der Deadzone)
 * klingt der Grundton: „Das Feld ist da, neige, um zu stimmen."
 */
export function pitchFromTilt(tx: number, ty: number, deadzone = 0.08): Pitch {
  const len = Math.hypot(tx, ty);
  if (len < deadzone) return { cents: 0, hz: RESONANCE_HZ };
  // Winkel gegen „oben" (Bildschirm-Norden ist -y), Betrag: links wie rechts.
  const a = Math.abs(Math.atan2(tx, -ty));
  const cents = (FIFTH_CENTS * a) / Math.PI;
  return { cents, hz: centsToHz(cents) };
}

/**
 * Stehen die beiden Töne im Zielintervall? Verglichen wird in CENT, und der
 * Abstand gilt in BEIDE Richtungen: Wer oben und wer unten steht, ist eine
 * Frage der Rollen, nicht der Musik.
 */
export function inTune(a: number, b: number, interval: Interval, tol = TUNE_TOL_CENTS): boolean {
  const aim = interval === 'fifth' ? FIFTH_CENTS : 0;
  return Math.abs(Math.abs(a - b) - aim) <= tol;
}

/**
 * Wie nah dran, 0…1 – für den Schimmer im Klang und die Anzeige. 1 heißt
 * „im Intervall", 0 „weiter als `span` Cent daneben".
 */
export function tuneAim(a: number, b: number, interval: Interval, span = 150): number {
  const aim = interval === 'fifth' ? FIFTH_CENTS : 0;
  const off = Math.max(0, Math.abs(Math.abs(a - b) - aim) - TUNE_TOL_CENTS);
  return Math.max(0, 1 - off / span);
}

/**
 * Der Augenblick des Stehenbleibens, als reiner Schritt: `since` ist der
 * Zeitpunkt, seit dem gestimmt ist (null = nicht gestimmt). Offen ist das Tor
 * erst, wenn es lange genug so steht.
 */
export function holdTuned(
  since: number | null,
  tuned: boolean,
  now: number,
  hold = TUNE_HOLD_MS,
): { since: number | null; open: boolean } {
  if (!tuned) return { since: null, open: false };
  const start = since ?? now;
  return { since: start, open: now - start >= hold };
}
