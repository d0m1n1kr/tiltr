// Die Titelliste des Automaten. Registry: id -> Titel, damit Editor, Galerie
// und Schema mit demselben Satz arbeiten.
//
// Was hier hereindarf, steht in README.md dieses Ordners – kurz: gemeinfrei
// (Komponist vor 1956 gestorben) oder eigene Komposition. Geschützte Werke
// gehören NICHT ins Repo; sie können als eingebetteter Titel im Level eines
// Dritten reisen (siehe jukeboxDef in src/levels/schema.ts).

import { compileTune, type CompiledTune, type Tune } from '../audio/chiptune';
import { tune as tiltr } from './tiltr';
import { tune as aufzug } from './aufzug';
import { tune as waechter } from './waechter';
import { tune as ode } from './ode';
import { tune as elise } from './elise';
import { tune as nachtmusik } from './nachtmusik';
import { tune as toccata } from './toccata';
import { tune as bergkoenig } from './bergkoenig';
import { tune as tell } from './tell';
import { tune as entertainer } from './entertainer';
import { tune as mars } from './mars';

/** Reihenfolge = Anzeigereihenfolge im Editor (Eigenes zuerst, dann Klassik
 *  chronologisch). */
export const MUSIC: readonly Tune[] = [
  tiltr,
  aufzug,
  waechter,
  toccata,
  nachtmusik,
  elise,
  ode,
  tell,
  bergkoenig,
  entertainer,
  mars,
];

export const MUSIC_IDS: readonly string[] = MUSIC.map((t) => t.id);

const byId = new Map(MUSIC.map((t) => [t.id, t]));

export const tuneById = (id: string): Tune | undefined => byId.get(id);

/** Übersetzt und gecacht: Ein Titel wird höchstens einmal übersetzt, egal wie
 *  oft er in Playlists auftaucht. */
const compiled = new Map<string, CompiledTune>();

export function compiledById(id: string): CompiledTune | undefined {
  const hit = compiled.get(id);
  if (hit) return hit;
  const tune = byId.get(id);
  if (!tune) return undefined;
  const c = compileTune(tune);
  compiled.set(id, c);
  return c;
}
