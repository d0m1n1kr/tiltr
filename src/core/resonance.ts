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
// Die Abbildung ist ÜBERALL STETIG: 0 Cent bei Neigung nach Norden, die OKTAVE
// bei Süden, und der Weg dorthin geht über Ost ODER West (600 Cent). Ein Kreis,
// der bei 1200 auf 0 zurückspringt, hätte eine Naht – dort wäre der Ton
// unspielbar sprunghaft. Die Skala reicht bis zur Oktave, nicht bis zur Quinte:
// sonst liegt das Quint-Ziel am RAND und hat nur eine einzige Lösung.
//
// Rein und DOM-frei wie alles in core/ – Units in tests/resonance.test.ts.

/** Grundton eines Resonanzfeldes (A3) – tief genug, dass die Schwebung
 *  zählbar ist, hoch genug, um über dem Rollen zu stehen. */
export const RESONANCE_HZ = 220;

/** Reine Quinte in Cent (3/2 = 701,955…). */
export const FIFTH_CENTS = 702;

/** Wie WEIT die Skala reicht: eine OKTAVE über den halben Kreis (v3.25.3).
 *  Vorher endete sie bei der Quinte – die lag damit genau am Rand (Neigung
 *  exakt nach Süden), ohne Luft nach beiden Seiten, und ein Quint-Tor hatte
 *  deshalb GENAU EINE Lösung: einer ganz oben, einer ganz unten. Mit der
 *  Oktave liegt die Quinte bei 105° von Norden, also mitten im Bereich, und es
 *  gibt eine ganze FAMILIE von Lösungen (jedes Paar 702 Cent auseinander,
 *  Grundton+Quinte genauso wie Sekunde+Sexte). */
export const PITCH_SPAN_CENTS = 1200;

/** Wie genau gestimmt sein muss. 40 Cent klingen noch klar daneben, und in
 *  WINKELN gerechnet ist es dieselbe Feinheit wie früher: Die Skala trägt
 *  jetzt eine Oktave über 180° (6,67 Cent je Grad), also sind 40 Cent rund
 *  6° Neigungsrichtung – genau die 6°, die 25 Cent auf der alten, kürzeren
 *  Skala waren. Ein weiterer Bereich ohne weitere Toleranz wäre eine
 *  VERSCHÄRFUNG gewesen, keine Erleichterung. */
export const TUNE_TOL_CENTS = 40;

/** Wie lange der Ton im Intervall STEHEN muss, damit das Tor aufgeht – sonst
 *  öffnete ein Durchwischen beim Suchen das Tor aus Versehen. Die Zahl hängt
 *  an der Fluchtzeit unten: Sie muss deutlich KÜRZER sein, sonst wäre das Tor
 *  bei voller Neigung nicht zu öffnen. */
export const TUNE_HOLD_MS = 250;

/** STÄRKSTE Rückstellkraft der Schale (px/s²), erreicht an der LIPPE (halber
 *  Schalenradius) – nicht im Zentrum.
 *
 *  DIE ZAHL IST GEMESSEN, und sie musste zweimal fallen (v3.25.2):
 *  1. Die Eingabe RAMPT (input/tilt.ts, 0,15 je Bild). Deshalb folgt die Kugel
 *     dem Gleichgewicht und sammelt keinen Schwung – über die Lippe kommt nur,
 *     wer die Lippenkraft STATISCH übertrifft. Eine Auslegung „mit Schwung
 *     drüber" war im Unit-Test grün (dort lag die Neigung als Ruck an) und im
 *     Spiel eine Falle.
 *  2. Der Ausstieg muss in JEDER Richtung gehen, auch aus einer Sackgassen-
 *     Nische mit einer einzigen offenen Seite. Die stärkste Neigung in EINER
 *     Achse ist auf der Tastatur 0,7 (2600 · 0,7 = 1820), also muss die Lippe
 *     darunter liegen.
 *  1500 heißt: ab Neigung 0,58 rollt man hinaus (gemessen: 0,5 reicht schon),
 *  sanfte Neigungen bis ~0,35 halten (Ruhelage 23–37 px). Gestimmt wird also
 *  mit einem TIPP oder sanft – der Ton bleibt danach stehen (`tuneStep`), man
 *  muss ihn nicht festhalten. Wer entschieden kippt, verlässt das Feld.
 *  Wer an Kraft, Radius oder Dämpfung dreht, misst mit der Rampe nach – die
 *  Units „Die Schale im Lauf der echten Physik" tun genau das. */
export const RESONANCE_FORCE = 1500;

/** Radius der Schale in Welteinheiten (fast eine Zelle – so findet man sie
 *  beim Anrollen). */
export const RESONANCE_R = 90;

/** Ab welchem Abstand die Kugel „auf dem Feld" steht (Ton + Halten). Nicht die
 *  kleine Platten-Toleranz (41 px): Beim Stimmen schwingt die Kugel bis zu
 *  49 px aus, und dabei darf der Ton nicht abreißen. 60 px ist knapp die
 *  eigene Zelle – ein Feld gehört seiner Zelle, nicht der Nachbarschaft. */
export const RESONANCE_HOLD = 60;

/**
 * DIE SCHALE IST EINE SCHALE, kein Sog (v3.25.2, aus dem Spieltest): Die
 * Rückstellkraft WÄCHST mit dem Abstand bis zur Lippe (halber Radius) und
 * fällt dahinter zum Rand auf null – wie eine Mulde, aus der man über den Rand
 * herauskippen kann.
 *
 * Vorher hing die Schale am Sog-Anker-Profil (`force · (1 − d/r)`, am ZENTRUM
 * am stärksten). Das ist genau umgekehrt, und es war im Spiel zu hören: Eine
 * SANFTE Neigung – also die, mit der man stimmt – hat ihr Gleichgewicht dort,
 * wo der Sog klein ist, nämlich am RAND (bei Neigung 0,3: 61 px, die Platte
 * endet bei 41). Die Kugel rutschte also beim Stimmen von der Platte, der Ton
 * riss ab und sie rasselte an den Wänden. Umgekehrt hielt eine starke Neigung
 * sie in der Mitte fest, und mit Tastatur (höchstens 0,7) kam man nie heraus –
 * eine Falle, genau die Sorte, die M32 verbieten wollte.
 *
 * Mit der Mulde gilt: Ruhelage = Neigung · 2600 / (F/(r/2)), also bei 0,3 rund
 * 17 px und bei 0,7 rund 39 px – immer INNERHALB der Platte (41 px). Der Ton
 * bleibt beim Stimmen stehen.
 */
export function bowlPull(d: number, r = RESONANCE_R, fmax = RESONANCE_FORCE): number {
  if (d <= 0 || d >= r) return 0;
  const lip = r / 2;
  return d < lip ? (fmax * d) / lip : (fmax * (r - d)) / lip;
}

export type Interval = 'unison' | 'fifth';

export interface Pitch {
  /** Abstand zum Grundton in Cent (0 … FIFTH_CENTS) */
  cents: number;
  /** Frequenz in Hz */
  hz: number;
  /** Wurde WIRKLICH geneigt (über der Deadzone)? Nur dann ist der Wert eine
   *  Stimm-Absicht – ein fast flaches Gerät sagt „ich fasse gerade nicht an". */
  active: boolean;
}

/** Cent in Frequenz über dem Grundton. */
export const centsToHz = (cents: number, base = RESONANCE_HZ): number => base * 2 ** (cents / 1200);

/**
 * Neigung → Tonhöhe. Norden (nach oben geneigt) ist der Grundton, Süden die
 * OKTAVE, Ost und West liegen genau in der Mitte (Tritonus) – der Weg von
 * unten nach oben geht also über beide Seiten gleich weit. Die Quinte liegt
 * damit bei 105° von Norden, mitten im Bereich statt am Rand. Ohne Neigung
 * (unter der Deadzone) klingt der Grundton: „Das Feld ist da, neige, um zu
 * stimmen."
 */
export function pitchFromTilt(tx: number, ty: number, deadzone = 0.08): Pitch {
  const len = Math.hypot(tx, ty);
  if (len < deadzone) return { cents: 0, hz: RESONANCE_HZ, active: false };
  // Winkel gegen „oben" (Bildschirm-Norden ist -y), Betrag: links wie rechts.
  const a = Math.abs(Math.atan2(tx, -ty));
  const cents = (PITCH_SPAN_CENTS * a) / Math.PI;
  return { cents, hz: centsToHz(cents), active: true };
}

/**
 * DER TON IST ZUSTAND, kein Abbild der Neigung: Ein Stimmknopf springt nicht
 * zurück, wenn man die Hand wegnimmt. Solange die Kugel im Feld liegt, BLEIBT
 * der Ton stehen – erst eine echte Neigung (über der Deadzone) dreht ihn
 * weiter, und das Feld zu verlassen macht ihn stumm (null).
 *
 * Daraus folgt der Spielerwechsel im MP-Testmodus GRATIS: Wer 👥 antippt, hält
 * das Gerät dabei fast flach; als reine Abbildung der Neigung fiel der Ton in
 * genau diesem Moment auf den Grundton, und die abgegebene Seite hielt den
 * falschen Wert. Und im echten Netz entspannt dieselbe Regel das Stimmen: Man
 * darf das Gerät ruhig legen, ohne den gefundenen Ton zu verlieren.
 *
 * Beim BETRETEN klingt der Grundton (`?? 0`) – irgendwo muss der Knopf stehen.
 */
export function tuneStep(tone: number | null, onField: boolean, tx: number, ty: number): number | null {
  if (!onField) return null;
  const p = pitchFromTilt(tx, ty);
  return p.active ? p.cents : (tone ?? 0);
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
 * DER FÜHRUNGSTON (v3.25.4): Wo müsste MEIN Ton liegen, damit das Intervall
 * steht? Dieser Ton wird leise mitgespielt, und weil er nur wenige Cent neben
 * meinem eigenen liegt, SCHWEBT er gegen ihn – die Schwebung wird langsamer,
 * bis sie steht. Bei einer QUINTE gibt es diese Hilfe sonst nicht: Zwei Töne
 * im Quintabstand schweben nicht, man hört nur Reinheit, und die beurteilt ein
 * ungeübtes Ohr kaum. Beim EINKLANG braucht es ihn nicht – dort schwebt der
 * Ton des Partners schon selbst gegen meinen (deshalb gibt app.ts ihn dort
 * nicht aus).
 *
 * Genommen wird die NÄHERE der beiden Möglichkeiten (über oder unter seinem
 * Ton): Man wird zum nächstgelegenen Ziel geführt, nicht quer über die Skala.
 */
export function guideCents(mine: number, theirs: number, interval: Interval): number {
  const aim = interval === 'fifth' ? FIFTH_CENTS : 0;
  const up = theirs + aim;
  const down = theirs - aim;
  return Math.abs(mine - up) <= Math.abs(mine - down) ? up : down;
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
