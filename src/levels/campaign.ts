// Kampagne Welt 1: 10 handgebaute Level mit steigender Schwierigkeit.
// Jedes Level carvt sich einen garantierten "Spine"-Korridor durch das
// Seed-Maze (L-Form o. ä.) und platziert seine Elemente daran – die
// Lösbarkeit aller Level sichert tests/campaign.test.ts ab.
//
// Sterne: 1 = geschafft, 2 = unter Par-Zeit, 3 = alle Gems gesammelt
// (bzw. sturzfrei in Leveln ohne Gems).

import type { LevelDef } from './schema';
import { parseLevel } from './schema';

type Dir = 'n' | 'e' | 's' | 'w';
type Edge = [[number, number], Dir];

// Zeile y von x0 bis x1 öffnen.
const right = (y: number, x0: number, x1: number): Edge[] => {
  const e: Edge[] = [];
  for (let x = x0; x < x1; x++) e.push([[x, y], 'e']);
  return e;
};
// Spalte x von y0 bis y1 öffnen.
const down = (x: number, y0: number, y1: number): Edge[] => {
  const e: Edge[] = [];
  for (let y = y0; y < y1; y++) e.push([[x, y], 's']);
  return e;
};

const defs: unknown[] = [
  {
    id: 'w1-01',
    name: 'Aufbruch',
    intro:
      'Willkommen in der Dunkelheit. Folge dem Ping des Ziels – die linke Wand führt dich hinab, unten geht es nach rechts.',
    parTimeS: 40,
    pingBudget: 3,
    floors: [
      {
        size: [5, 6],
        maze: { seed: 21, carve: [...down(0, 0, 5), ...right(5, 0, 4)] },
        elements: [],
        start: [0, 0],
        goal: [4, 5],
      },
    ],
  },
  {
    id: 'w1-02',
    name: 'Hohlweg',
    intro: 'Der Weg hinab atmet: Zwei Löcher öffnen und schließen sich. Lausche dem Grollen – und warte auf die Stille.',
    parTimeS: 55,
    pingBudget: 3,
    floors: [
      {
        size: [5, 7],
        maze: { seed: 33, carve: [...down(0, 0, 6), ...right(6, 0, 4)] },
        elements: [
          { type: 'hole', cell: [0, 3], breathing: { offset: 0 } },
          { type: 'hole', cell: [2, 6], breathing: { offset: 2.8 } },
          { type: 'checkpoint', cell: [0, 6] },
        ],
        start: [0, 0],
        goal: [4, 6],
      },
    ],
  },
  {
    id: 'w1-03',
    name: 'Erste Wache',
    intro:
      'Da brummt etwas. Ein Wächter patrouilliert den oberen Gang – berührt er dich, wirst du zurückgeworfen. Hör genau hin, wo er ist.',
    parTimeS: 65,
    pingBudget: 3,
    floors: [
      {
        size: [6, 7],
        maze: { seed: 8, carve: [...right(0, 0, 5), ...down(5, 0, 6)] },
        elements: [
          { type: 'guard', patrol: [[1, 0], [4, 0]], speed: 80 },
          { type: 'checkpoint', cell: [5, 0] },
          { type: 'hole', cell: [5, 3], breathing: { offset: 1.5 } },
        ],
        start: [0, 0],
        goal: [5, 6],
      },
    ],
  },
  {
    id: 'w1-04',
    name: 'Schlüsseldienst',
    intro:
      'Kurz vor dem Ziel versperrt eine Tür den Weg – sie antwortet dumpf auf deinen Ping. Irgendwo klimpert ihr Schlüssel.',
    parTimeS: 75,
    pingBudget: 3,
    floors: [
      {
        size: [6, 7],
        maze: { seed: 44, carve: [...down(0, 0, 6), ...right(6, 0, 5)] },
        elements: [
          { type: 'door', id: 'tor', edge: [[3, 6], 'e'] },
          { type: 'key', cell: [3, 3], opens: 'tor' },
          { type: 'checkpoint', cell: [0, 6] },
        ],
        start: [0, 0],
        goal: [5, 6],
      },
    ],
  },
  {
    id: 'w1-05',
    name: 'Funkeln',
    intro:
      'Hörst du das helle Doppel-Echo auf deinen Ping? Gems! Sie liegen abseits des Weges. Wer alle drei sammelt, verdient sich den dritten Stern.',
    parTimeS: 80,
    pingBudget: 4,
    floors: [
      {
        size: [6, 8],
        maze: { seed: 55, carve: [...down(0, 0, 7), ...right(7, 0, 5)] },
        elements: [
          { type: 'gem', cell: [2, 1] },
          { type: 'gem', cell: [4, 3] },
          { type: 'gem', cell: [1, 5] },
          { type: 'hole', cell: [0, 4], breathing: { offset: 0 } },
          { type: 'hole', cell: [3, 7], breathing: { offset: 2.5 } },
          { type: 'checkpoint', cell: [0, 7] },
        ],
        start: [0, 0],
        goal: [5, 7],
      },
    ],
  },
  {
    id: 'w1-06',
    name: 'Zugluft',
    intro: 'Im oberen Gang steht dir der Wind entgegen. Halte dagegen – und lass dich nicht in das Loch dahinter treiben.',
    parTimeS: 80,
    pingBudget: 3,
    floors: [
      {
        size: [6, 8],
        maze: { seed: 66, carve: [...right(0, 0, 5), ...down(5, 0, 7)] },
        elements: [
          { type: 'windZone', cell: [2, 0], dir: 'w' },
          { type: 'windZone', cell: [3, 0], dir: 'w' },
          { type: 'hole', cell: [5, 4], breathing: { offset: 1 } },
          { type: 'gem', cell: [1, 3] },
          { type: 'checkpoint', cell: [5, 0] },
        ],
        start: [0, 0],
        goal: [5, 7],
      },
    ],
  },
  {
    id: 'w1-07',
    name: 'Brecher',
    intro:
      'Hier ist der Weg vermauert – aber es knirscht verdächtig. Ramm die brüchigen Wände, weich dem Wächter unten aus und sammle, was funkelt.',
    parTimeS: 90,
    pingBudget: 4,
    floors: [
      {
        size: [6, 8],
        maze: {
          seed: 77,
          carve: [...down(0, 0, 7), ...right(7, 0, 5)],
          add: [[[0, 3], 's'], [[2, 7], 'e']],
          brittle: [[[0, 3], 's'], [[2, 7], 'e']],
          brittleHits: 3,
        },
        elements: [
          { type: 'guard', patrol: [[1, 7], [2, 7]], speed: 70 },
          { type: 'gem', cell: [3, 2] },
          { type: 'gem', cell: [5, 0] },
          { type: 'checkpoint', cell: [0, 7] },
        ],
        start: [0, 0],
        goal: [5, 7],
      },
    ],
  },
  {
    id: 'w1-08',
    name: 'Doppelwache',
    intro:
      'Zwei Wächter, eine Tür. Der Schlüssel liegt mitten im bewachten Gang rechts – schnapp ihn dir, wenn die Wache vorbeigezogen ist.',
    parTimeS: 110,
    pingBudget: 4,
    floors: [
      {
        size: [7, 9],
        maze: { seed: 88, carve: [...right(0, 0, 6), ...down(6, 0, 8)] },
        elements: [
          { type: 'guard', patrol: [[1, 0], [5, 0]], speed: 95 },
          { type: 'guard', patrol: [[6, 2], [6, 6]], speed: 85 },
          { type: 'door', id: 'tor', edge: [[6, 7], 's'] },
          { type: 'key', cell: [6, 4], opens: 'tor' },
          { type: 'checkpoint', cell: [6, 0] },
          { type: 'checkpoint', cell: [6, 5] },
          { type: 'hole', cell: [2, 2], breathing: { offset: 0 } },
          { type: 'hole', cell: [4, 6], breathing: { offset: 3 } },
        ],
        start: [0, 0],
        goal: [6, 8],
      },
    ],
  },
  {
    id: 'w1-09',
    name: 'Atemnot',
    intro:
      'Der lange Abstieg: Fünf Löcher atmen im Takt gegeneinander, und unten schiebt dich der Wind genau dorthin, wo du nicht hinwillst. Geduld gewinnt.',
    parTimeS: 120,
    pingBudget: 4,
    floors: [
      {
        size: [7, 10],
        maze: { seed: 99, carve: [...down(0, 0, 9), ...right(9, 0, 6)] },
        elements: [
          { type: 'hole', cell: [0, 2], breathing: { offset: 0 } },
          { type: 'hole', cell: [0, 5], breathing: { offset: 2 } },
          { type: 'hole', cell: [0, 7], breathing: { offset: 4 } },
          { type: 'hole', cell: [2, 9], breathing: { offset: 1 } },
          { type: 'hole', cell: [4, 9], breathing: { offset: 3 } },
          { type: 'windZone', cell: [1, 9], dir: 'e' },
          { type: 'checkpoint', cell: [0, 4] },
          { type: 'checkpoint', cell: [0, 9] },
          { type: 'gem', cell: [3, 3] },
          { type: 'gem', cell: [6, 0] },
        ],
        start: [0, 0],
        goal: [6, 9],
      },
    ],
  },
  {
    id: 'w1-10',
    name: 'Schlussstein',
    intro:
      'Alles, was du gelernt hast: Zwei Wachen, eine Tür, brüchige Abkürzungen, atmende Löcher und Wind. Zwei Wege führen ans Ziel – wähle weise.',
    parTimeS: 170,
    pingBudget: 4,
    floors: [
      {
        size: [8, 11],
        maze: {
          seed: 110,
          carve: [...right(0, 0, 7), ...down(7, 0, 10), ...down(0, 0, 10), ...right(10, 0, 7)],
          add: [[[0, 5], 's']],
          brittle: [[[0, 5], 's']],
          brittleHits: 3,
        },
        elements: [
          { type: 'guard', patrol: [[2, 0], [6, 0]], speed: 100 },
          { type: 'guard', patrol: [[1, 10], [6, 10]], speed: 80 },
          { type: 'door', id: 'tor', edge: [[7, 9], 's'] },
          { type: 'key', cell: [3, 5], opens: 'tor' },
          { type: 'hole', cell: [0, 8], breathing: { offset: 0 } },
          { type: 'hole', cell: [7, 4], breathing: { offset: 2 } },
          { type: 'hole', cell: [4, 10], breathing: { offset: 4 } },
          { type: 'windZone', cell: [3, 10], dir: 'w' },
          { type: 'gem', cell: [2, 2] },
          { type: 'gem', cell: [5, 7] },
          { type: 'gem', cell: [7, 0] },
          { type: 'checkpoint', cell: [0, 10] },
          { type: 'checkpoint', cell: [7, 0] },
        ],
        start: [0, 0],
        goal: [7, 10],
      },
    ],
  },
];

export const CAMPAIGN_LEVELS: LevelDef[] = defs.map(parseLevel);
export const CAMPAIGN_IDS = CAMPAIGN_LEVELS.map((l) => l.id);
