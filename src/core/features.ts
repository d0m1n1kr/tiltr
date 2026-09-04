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
export const FEATURES: readonly string[] = ['marks'];

/** Was ein Level verlangt. `marks` > 0 heißt: beide müssen Bojen legen können. */
export function needsFor(marks: number): string[] {
  return marks > 0 ? ['marks'] : [];
}

/** Kann eine Seite mit diesen Merkmalen das Verlangte? Fehlende Angabe heißt
 *  „kann nichts Neues" – genau das ist der Fall einer alten Gegenstelle, die
 *  das Feld gar nicht mitschickt. */
export function canDo(needs: readonly string[] | undefined, features: readonly string[] | undefined): boolean {
  return (needs ?? []).every((n) => (features ?? []).includes(n));
}
