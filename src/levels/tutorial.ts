// Tutorial: 8 Micro-Level, jedes führt genau EIN Element ein und erzwingt
// seine Benutzung. Kurze Wege, klare Situationen, < 60 s pro Level.

import type { LevelDef } from './schema';
import { parseLevel } from './schema';

// Häufige Bausteine: eine offene Zeile von x0..x1 in Zeile y.
const row = (y: number, x0: number, x1: number): Array<[[number, number], 'e']> => {
  const carve: Array<[[number, number], 'e']> = [];
  for (let x = x0; x < x1; x++) carve.push([[x, y], 'e']);
  return carve;
};

const defs: unknown[] = [
  {
    id: 'tut-1',
    name: 'Rollen & Lauschen',
    intro:
      'Neige das Handy sanft – der Ball rollt. Höre auf den Sonar-Ping: Er kommt aus Richtung des Ziels und wird schneller, je näher du bist. Roll nach rechts!',
    pingBudget: 0,
    floors: [
      {
        size: [3, 2],
        maze: { seed: 1, carve: row(0, 0, 2) },
        elements: [],
        start: [0, 0],
        goal: [2, 0],
      },
    ],
  },
  {
    id: 'tut-2',
    name: 'Wände & Echo',
    intro:
      'Die Wände sind unsichtbar. Berührst du eine, hörst du einen dumpfen Schlag aus ihrer Richtung – und sie leuchtet kurz auf. Ertaste dir den Weg.',
    pingBudget: 0,
    floors: [
      {
        size: [4, 3],
        maze: { seed: 7 },
        elements: [],
        start: [0, 0],
        goal: [3, 2],
      },
    ],
  },
  {
    id: 'tut-3',
    name: 'Der Echo-Ping',
    intro:
      'Tippe aufs Display: Ein Echo-Ping deckt die Umgebung kurz auf – nahe Wände antworten zuerst. Dein Vorrat ist knapp, setze ihn klug ein.',
    pingBudget: 3,
    floors: [
      {
        size: [4, 3],
        maze: { seed: 11 },
        elements: [],
        start: [0, 0],
        goal: [3, 2],
      },
    ],
  },
  {
    id: 'tut-4',
    name: 'Das Grollen',
    intro:
      'Hörst du das dunkle Grollen? Dort wartet ein Loch. Je näher du kommst, desto lauter – und dein Herz schlägt schneller. Schleich dich vorbei oder nimm den Umweg unten.',
    pingBudget: 1,
    floors: [
      {
        size: [4, 2],
        maze: {
          seed: 3,
          carve: [...row(0, 0, 3), [[0, 0], 's'], ...row(1, 0, 3), [[3, 1], 'n']],
        },
        elements: [{ type: 'hole', cell: [1, 0] }],
        start: [0, 0],
        goal: [3, 0],
      },
    ],
  },
  {
    id: 'tut-5',
    name: 'Atmende Löcher',
    intro:
      'Dieses Loch atmet: Es öffnet und schließt sich. Geschlossen ist es harmlos und still. Warte, bis das Grollen verstummt – dann roll drüber.',
    pingBudget: 1,
    floors: [
      {
        size: [4, 2],
        maze: { seed: 3, carve: row(0, 0, 3) },
        elements: [{ type: 'hole', cell: [1, 0], breathing: { offset: 0 } }, { type: 'hole', cell: [2, 0], breathing: { offset: 2.7 } }],
        start: [0, 0],
        goal: [3, 0],
      },
    ],
  },
  {
    id: 'tut-6',
    name: 'Gegenwind',
    intro:
      'Das Rauschen vor dir ist Wind – er drückt dich zurück. Neige stärker dagegen und kämpf dich durch.',
    pingBudget: 1,
    floors: [
      {
        size: [4, 2],
        maze: { seed: 5, carve: row(0, 0, 3) },
        elements: [
          { type: 'windZone', cell: [1, 0], dir: 'w' },
          { type: 'windZone', cell: [2, 0], dir: 'w' },
        ],
        start: [0, 0],
        goal: [3, 0],
      },
    ],
  },
  {
    id: 'tut-7',
    name: 'Brüchige Wände',
    intro:
      'Manche Wände knirschen, wenn du sie rammst – sie sind brüchig. Zwei harte Treffer, und sie stürzen ein. Der einzige Weg zum Ziel führt durch diese Wand.',
    pingBudget: 2,
    floors: [
      {
        size: [3, 2],
        maze: {
          seed: 1,
          carve: [[[0, 0], 'e']],
          add: [[[1, 0], 'e'], [[1, 0], 's'], [[2, 0], 's']],
          brittle: [[[1, 0], 'e']],
          brittleHits: 2,
        },
        elements: [],
        start: [0, 0],
        goal: [2, 0],
      },
    ],
  },
  {
    id: 'tut-8',
    name: 'Der Anker',
    intro:
      'Der freundliche Doppelklang ist ein Checkpoint: Nach einem Sturz geht es dort weiter – und er füllt einen Echo-Ping auf. Hinter ihm atmet ein Loch. Keine Angst vorm Fallen.',
    pingBudget: 1,
    floors: [
      {
        size: [4, 2],
        maze: { seed: 3, carve: row(0, 0, 3) },
        elements: [
          { type: 'checkpoint', cell: [1, 0] },
          { type: 'hole', cell: [2, 0], breathing: { offset: 1.5 } },
        ],
        start: [0, 0],
        goal: [3, 0],
      },
    ],
  },
];

export const TUTORIAL_LEVELS: LevelDef[] = defs.map(parseLevel);
