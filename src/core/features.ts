// MERKMALS-GATE (M89): Was diese Version kann – und was ein Level braucht.
//
// Neue Felder in einer Netz-Nachricht sind additiv: Eine alte Gegenstelle
// ignoriert sie einfach. Bei einem SPIELMITTEL ist das nicht harmlos – ein
// Level mit Wegmarken, das nur EINE Seite legen kann, ist ungleich, und ein
// Sieg nach halben Regeln ist kein Sieg. Deshalb sagt der Host mit `setup`,
// was das LEVEL braucht, und der Gast mit `ready`, was er KANN; beide Seiten
// prüfen, sodass es auffällt, egal welche die ältere ist.
//
// Das Gate hängt am LEVEL, nicht an der Versionsnummer: Ein Level ohne Bojen
// spielt weiter mit jeder älteren Fassung. Rein – Units in tests/features.test.ts.

/** Merkmale, die DIESE Fassung beherrscht. Neues Spielmittel ⇒ hier eintragen. */
export const FEATURES: readonly string[] = ['marks', 'together', 'duet', 'multiOpens'];

/** Was ein Level verlangt: `marks` > 0 heißt „beide müssen Bojen legen
 *  können", `together` heißt „beide müssen nach der Rendezvous-Regel spielen"
 *  (M90 – eine alte Gegenstelle würde sonst nach der alten Regel gewinnen),
 *  `duet` heißt „das Level hat ein Resonanz-Tor" (M91): Ohne den Ton der
 *  anderen Seite (`state.tn`) geht es NIE auf – ein unlösbares Level.
 *  `multiOpens` heißt „ein Öffner nennt mehrere Türen" (M99): Eine Fassung vor
 *  3.34 liest `opens` nur als EINE ID, das Level lädt bei ihr gar nicht. Hier
 *  geht es also nicht um halbe Regeln, sondern um „geht überhaupt" – und
 *  gemeldet gehört es trotzdem in der Lobby, nicht als roher Ladefehler. */
export function needsFor(marks: number, together = false, duet = false, multiOpens = false): string[] {
  const needs: string[] = [];
  if (marks > 0) needs.push('marks');
  if (together) needs.push('together');
  if (duet) needs.push('duet');
  if (multiOpens) needs.push('multiOpens');
  return needs;
}

/** Kann eine Seite mit diesen Merkmalen das Verlangte? Fehlende Angabe heißt
 *  „kann nichts Neues" – genau das ist der Fall einer alten Gegenstelle, die
 *  das Feld gar nicht mitschickt. */
export function canDo(needs: readonly string[] | undefined, features: readonly string[] | undefined): boolean {
  return (needs ?? []).every((n) => (features ?? []).includes(n));
}
