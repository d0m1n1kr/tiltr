// GEMEINSAM ANKOMMEN (M90): Gewonnen wird, wenn BEIDE gleichzeitig in ihren
// Zielzonen liegen – aus „wir sind beide irgendwann durch" wird ein
// Rendezvous, das man verabreden muss.
//
// Die Regel ist Timing, und Timing über ein Netz braucht Nachsicht: Der
// Partner meldet seinen Zielstand alle 80 ms (`state.g`), eine Meldung kann
// ausfallen oder spät kommen. Deshalb gilt seine letzte Meldung noch
// TOGETHER_GRACE_MS weiter. Verlässt er das Ziel, sagt seine nächste Meldung
// das sofort – die Nachsicht deckt Lücken, nicht das Weiterrollen.
//
// Und BEIDE Seiten schließen unabhängig: Jede sieht denselben Augenblick,
// niemand ist Schiedsrichter. Ein Sieg, auf den man erst die Bestätigung des
// anderen abwartet, käme eine Rundenlaufzeit zu spät.
//
// Rein und DOM-frei wie alles in core/ – Units in tests/together.test.ts.

/** Wie lange die letzte Ziel-Meldung des Partners weitergilt (ms). Großzügig
 *  gegen Latenz: 700 ms sind gut acht ausgefallene `state`-Nachrichten. */
export const TOGETHER_GRACE_MS = 700;

/**
 * Liegt der Partner nach seiner letzten Meldung JETZT im Ziel?
 * `at` = 0 heißt „nie gemeldet" oder „gerade verlassen".
 */
export function partnerInGoal(at: number, now: number, grace = TOGETHER_GRACE_MS): boolean {
  return at > 0 && now - at < grace;
}

/** Rendezvous: Ich bin im Ziel UND der Partner ist es auch. */
export function togetherWin(mine: boolean, at: number, now: number, grace = TOGETHER_GRACE_MS): boolean {
  return mine && partnerInGoal(at, now, grace);
}

/**
 * Der Partner steht im Ziel und wartet auf mich. Das ist die Rückmeldung, die
 * den Modus erst spielbar macht: Ohne sie wäre „nichts passiert, obwohl ich
 * im Ziel bin" nicht von einem Fehler zu unterscheiden.
 */
export function partnerWaiting(mine: boolean, at: number, now: number, grace = TOGETHER_GRACE_MS): boolean {
  return !mine && partnerInGoal(at, now, grace);
}
