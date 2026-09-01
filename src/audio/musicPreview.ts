// Vorhören eines Titels – EINE Stelle für die Galerie und den Editor.
//
// Der Editor lässt einzelne Titel einer Playlist antesten, die Galerie spielt
// die Klang-Signatur des Elements; beides ist dasselbe: ein Stück Musik
// aus dem Automaten, ein paar Sekunden lang, dann Schluss. Deshalb hier und
// nicht zweimal.

import type { GameAudio } from './audio';
import { notesAt, type CompiledTune } from './chiptune';

/** Vorhör-Länge in Sekunden – lang genug, um den Titel zu erkennen, kurz
 *  genug, um beim Bauen nicht zu stören. */
export const PREVIEW_S = 4.5;

/**
 * Die ersten `seconds` eines Titels in EINEM Zug einplanen (kein Scheduler:
 * eine Vorschau ist kurz, da lohnt kein Lookahead-Fenster). Läuft über den
 * Musik-Bus – also mit derselben Stimme und demselben Ducking wie im Spiel.
 * Von vorn, nicht von der Stelle: `stopMusic()` würgt Laufendes ab.
 */
export function previewTune(audio: GameAudio, tune: CompiledTune, seconds = PREVIEW_S): void {
  audio.stopMusic();
  // Mittig vorn (dx=0, dy=-1): Eine Vorschau ist keine Ortungsaufgabe.
  audio.setMusic(1, 0, -1, true);
  const start = audio.now() + 0.08;
  for (const n of notesAt(tune, 0, seconds)) {
    audio.musicNote(n.voice, n.freq, start + n.atS, Math.min(n.durS, seconds - n.atS), n.gain);
  }
}
