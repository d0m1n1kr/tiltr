// Stimmgabel (M45): ein Schlüssel, der nicht klimpert, sondern TÖNT – ungepannt.
// Die Ortung läuft über die Tonhöhe statt über die Richtung: Zwei Oszillatoren
// schweben gegeneinander, und die Schwebungsfrequenz hängt vom Winkel zwischen
// Neigungsvektor und Richtung zur Stimmgabel ab. Neigt man genau auf sie zu,
// steht der Ton fast still; neigt man weg, flattert er. Das trainiert die
// zweite Ohr-Fähigkeit (Tonhöhe), die das HRTF-Panning nicht braucht.
//
// Rein und DOM-frei wie core/ – Units in tests/fork.test.ts.

/** Schwebung in Hz bei perfekter Ausrichtung (fast stehender Ton). */
export const FORK_BEAT_MIN = 0.4;
/** Schwebung in Hz, wenn man genau weg neigt (deutliches Flattern). */
export const FORK_BEAT_MAX = 9;
/** Grundton der Stimmgabel. */
export const FORK_HZ = 440;

export interface ForkTone {
  /** Schwebung in Hz (FORK_BEAT_MIN … FORK_BEAT_MAX) */
  beatHz: number;
  /** Ausrichtung 0…1: 1 = genau auf die Gabel zu, 0 = genau weg */
  aim: number;
}

/**
 * Schwebung aus Neigung (tx, ty) und Richtung zur Stimmgabel (dx, dy).
 * Ohne Neigung (|tilt| < deadzone) gibt es keine Richtung – dann schwebt der
 * Ton mittel (aim 0.5), damit man hört: „Sie ist da, neige, um zu suchen."
 */
export function forkTone(tx: number, ty: number, dx: number, dy: number, deadzone = 0.08): ForkTone {
  const tl = Math.hypot(tx, ty);
  const dl = Math.hypot(dx, dy);
  if (tl < deadzone || dl < 1e-6) return { beatHz: (FORK_BEAT_MIN + FORK_BEAT_MAX) / 2, aim: 0.5 };
  const cos = (tx * dx + ty * dy) / (tl * dl); // 1 = auf sie zu, -1 = weg
  const aim = (cos + 1) / 2;
  return { beatHz: FORK_BEAT_MIN + (1 - aim) * (FORK_BEAT_MAX - FORK_BEAT_MIN), aim };
}
