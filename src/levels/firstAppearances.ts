// Erst-Vorkommen (M43): Welches Spielelement taucht in WELCHEM Level zum
// ersten Mal auf? Daraus speist sich das „Aufleuchten": Beim Start eines
// Levels, das ein Element neu einführt, leuchtet dieses Element einige
// Sekunden in seiner Weltfarbe und seine Klang-Signatur spielt einmal – der
// Spieler sieht EINMAL, was er ab dann nur noch hört. Die Reihenfolge der
// übergebenen Level ist die Lehr-Reihenfolge (Tutorial, dann Kampagne).
//
// Rein und DOM-frei; kein Level-Feld nötig – die Liste ist eine Ableitung.

import type { LevelDef } from './schema';

/** Merkmale eines Levels: Element-Typen plus die Wand-Varianten, die kein
 *  Element sind (brüchig, Schallschutz). Helle Ebenen zählen nicht – da gibt
 *  es nichts aufzuleuchten. */
export function levelFeatures(def: LevelDef): Set<string> {
  const f = new Set<string>();
  for (const fl of def.floors) {
    for (const el of fl.elements) f.add(el.type);
    if (fl.maze.brittle.length > 0 || fl.maze.brittleChance > 0) f.add('wallBrittle');
    if (fl.maze.absorb.length > 0) f.add('wallAbsorb');
  }
  return f;
}

/** Merkmal → ID des Levels, in dem es zum ersten Mal vorkommt. */
export function firstAppearances(levels: readonly LevelDef[]): Map<string, string> {
  const first = new Map<string, string>();
  for (const def of levels) {
    for (const f of levelFeatures(def)) if (!first.has(f)) first.set(f, def.id);
  }
  return first;
}

/** Merkmale, die in GENAU diesem Level zum ersten Mal vorkommen (leer, wenn
 *  das Level nichts Neues bringt oder unbekannt ist). Reihenfolge wie im
 *  Level: Elemente vor Wand-Varianten. */
export function newFeaturesIn(levels: readonly LevelDef[], id: string): string[] {
  const first = firstAppearances(levels);
  const def = levels.find((l) => l.id === id);
  if (!def) return [];
  return [...levelFeatures(def)].filter((f) => first.get(f) === id);
}
