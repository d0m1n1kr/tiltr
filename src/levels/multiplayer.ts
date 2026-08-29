// Multiplayer-Level (2 Spieler, beide starten in derselben Zelle).
//
// Coop: Druckplatten-Türen erzwingen Zusammenarbeit – eine gehaltene Platte
// öffnet die verknüpfte Tür, Loslassen schließt sie. Gewonnen ist erst,
// wenn BEIDE im Ziel stehen (der Ball im Ziel hält dort liegende Platten!).
// Race: identisches Level für beide, wer zuerst im Ziel ist, gewinnt.

import type { LevelDef } from './schema';
import { parseLevel } from './schema';
import { mirrorLevel, type MirrorAxis } from './mirror';

type Dir = 'n' | 'e' | 's' | 'w';
type Edge = [[number, number], Dir];

const right = (y: number, x0: number, x1: number): Edge[] => {
  const e: Edge[] = [];
  for (let x = x0; x < x1; x++) e.push([[x, y], 'e']);
  return e;
};
const down = (x: number, y0: number, y1: number): Edge[] => {
  const e: Edge[] = [];
  for (let y = y0; y < y1; y++) e.push([[x, y], 's']);
  return e;
};

const coopDefs: unknown[] = [
  // Muster aller Coop-Level: Türen verschließen VERSIEGELTE Kammern (einziger
  // Eingang). Jede Tür hat eine Platte außen und eine innen (Selbstbefreiung,
  // kein Aussperren möglich); die Platte in der Zielkammer hält der Partner,
  // der schon im Ziel liegt. tests/multiplayer.test.ts beweist alle drei
  // Invarianten pro Tür.
  {
    id: 'coop-01',
    name: 'Schleuse',
    intro:
      'Die Zielkammer öffnet sich nur, solange einer von euch die Druckplatte davor hält. Und wer im Ziel liegt, hält die Platte darin – für den Nachzügler. Einer hält, einer rollt!',
    pingBudget: 3,
    floors: [
      {
        size: [6, 6],
        maze: {
          seed: 301,
          carve: [...right(0, 0, 5), ...down(5, 0, 5), [[4, 4], 'e']],
          // Platten-Nische [4,4] ist eine Sackgasse (nur von Osten zugänglich).
          add: [[[4, 5], 'e'], [[4, 4], 'w'], [[4, 4], 'n']],
        },
        elements: [
          { type: 'door', id: 'g1', edge: [[5, 4], 's'] },
          { type: 'plate', cell: [4, 4], opens: 'g1' },
          { type: 'plate', cell: [5, 5], opens: 'g1' },
        ],
        start: [0, 0],
        goal: [5, 5],
      },
    ],
  },
  {
    id: 'coop-02',
    name: 'Wechselspiel',
    intro:
      'Die Platte für die Zieltür liegt in einer eigenen verschlossenen Kammer. Sperrt euch gegenseitig auf: Jede Kammer hat innen eine Platte zur Selbstbefreiung.',
    pingBudget: 4,
    floors: [
      {
        size: [6, 7],
        maze: {
          seed: 302,
          carve: [...down(0, 0, 5), ...right(5, 0, 5), [[4, 5], 's'], [[1, 5], 's'], [[0, 6], 'e'], [[2, 5], 'n']],
          add: [[[5, 5], 's'], [[0, 5], 's'], [[1, 6], 'e']],
        },
        elements: [
          { type: 'door', id: 'gz', edge: [[4, 6], 'e'] },
          { type: 'plate', cell: [5, 6], opens: 'gz' },
          { type: 'plate', cell: [0, 6], opens: 'gz' },
          { type: 'door', id: 'g1', edge: [[1, 5], 's'] },
          { type: 'plate', cell: [2, 4], opens: 'g1' },
          { type: 'plate', cell: [1, 6], opens: 'g1' },
        ],
        start: [0, 0],
        goal: [5, 6],
      },
    ],
  },
  {
    id: 'coop-03',
    name: 'Fernwirkung',
    intro:
      'Die Platte für die Zielkammer liegt ganz oben am Start. Einer bleibt zurück und hält, der andere rollt den langen Weg – gegen Wind und an einem atmenden Loch vorbei. Dann hält der Erste im Ziel die Tür.',
    pingBudget: 4,
    floors: [
      {
        size: [7, 7],
        maze: { seed: 303, carve: [...right(0, 0, 6), ...down(6, 0, 6)], add: [[[5, 6], 'e']] },
        elements: [
          { type: 'door', id: 'g1', edge: [[6, 5], 's'] },
          { type: 'plate', cell: [1, 0], opens: 'g1' },
          { type: 'plate', cell: [6, 6], opens: 'g1' },
          { type: 'hole', cell: [3, 0], breathing: { offset: 0 } },
          { type: 'windZone', cell: [6, 2], dir: 'n' },
          { type: 'checkpoint', cell: [6, 0] },
        ],
        start: [0, 0],
        goal: [6, 6],
      },
    ],
  },
  {
    id: 'coop-04',
    name: 'Doppelschleuse',
    intro:
      'Wie Wechselspiel, nur gemein: Zwischen den Kammern atmet der Boden, und eine Wache patrouilliert den Quergang. Timing ist alles.',
    pingBudget: 4,
    floors: [
      {
        size: [7, 8],
        maze: {
          seed: 304,
          carve: [...down(0, 0, 6), ...right(6, 0, 6), [[6, 6], 's'], [[1, 6], 's'], [[0, 7], 'e'], [[2, 6], 'n']],
          add: [[[5, 7], 'e'], [[0, 6], 's'], [[1, 7], 'e']],
        },
        elements: [
          { type: 'door', id: 'gz', edge: [[6, 6], 's'] },
          { type: 'plate', cell: [6, 7], opens: 'gz' },
          { type: 'plate', cell: [0, 7], opens: 'gz' },
          { type: 'door', id: 'g1', edge: [[1, 6], 's'] },
          { type: 'plate', cell: [2, 5], opens: 'g1' },
          { type: 'plate', cell: [1, 7], opens: 'g1' },
          { type: 'guard', patrol: [[2, 6], [4, 6]], speed: 80 },
          { type: 'hole', cell: [0, 3], breathing: { offset: 0 } },
          { type: 'hole', cell: [5, 6], breathing: { offset: 2.5 } },
          { type: 'checkpoint', cell: [0, 6] },
        ],
        start: [0, 0],
        goal: [6, 7],
      },
    ],
  },
  {
    id: 'coop-05',
    name: 'Vier Hände, zwei Ebenen',
    intro:
      'Das Finale: Die Platte für die Zieltür liegt eine Ebene TIEFER. Einer steigt hinab und hält, der andere rollt ins Ziel – und hält von dort die Tür für den Rückkehrer auf. Wer im Ziel liegt, hält weiter!',
    pingBudget: 4,
    floors: [
      {
        size: [6, 6],
        maze: {
          seed: 305,
          carve: [...right(0, 0, 5), ...down(5, 0, 5)],
          add: [[[4, 5], 'e']],
        },
        elements: [
          { type: 'transporter', cell: [2, 0], target: { floor: 1, cell: [0, 0] } },
          { type: 'door', id: 'g1', edge: [[5, 4], 's'] },
          { type: 'plate', cell: [5, 5], opens: 'g1' },
        ],
        start: [0, 0],
        goal: [5, 5],
      },
      {
        size: [6, 5],
        // Rückweg-Transporter in einer Seitennische, damit man auf dem Weg
        // zur Platte nicht versehentlich hineinrollt.
        maze: { seed: 306, carve: [...right(0, 0, 5), [[2, 0], 's']] },
        elements: [
          { type: 'plate', cell: [5, 0], opens: 'g1' },
          { type: 'hole', cell: [4, 0], breathing: { offset: 1 } },
          { type: 'transporter', cell: [2, 1], target: { floor: 0, cell: [3, 0] } },
        ],
        start: [0, 0],
        goal: null,
      },
    ],
  },
];

const raceDefs: unknown[] = [
  {
    id: 'race-01',
    name: 'Sprint',
    intro: 'Gleiche Strecke, gleiche Chancen: Wer zuerst im Ziel ist, gewinnt. Der Halo verrät, wo dein Gegner steckt.',
    pingBudget: 3,
    floors: [
      {
        size: [6, 8],
        maze: { seed: 311, carve: [...down(0, 0, 7), ...right(7, 0, 5)] },
        elements: [
          { type: 'hole', cell: [0, 3], breathing: { offset: 0 } },
          { type: 'hole', cell: [3, 7], breathing: { offset: 2.7 } },
          { type: 'checkpoint', cell: [0, 7] },
        ],
        start: [0, 0],
        goal: [5, 7],
      },
    ],
  },
  {
    id: 'race-02',
    name: 'Gegenwind',
    intro: 'Zwei Windzonen stehen zwischen dir und dem Ziel. Wer besser dagegenhält, gewinnt das Rennen.',
    pingBudget: 3,
    floors: [
      {
        size: [7, 8],
        maze: { seed: 312, carve: [...right(0, 0, 6), ...down(6, 0, 7)] },
        elements: [
          { type: 'windZone', cell: [2, 0], dir: 'w' },
          { type: 'windZone', cell: [6, 3], dir: 'n' },
          { type: 'hole', cell: [4, 0], breathing: { offset: 1 } },
          { type: 'hole', cell: [6, 5], breathing: { offset: 3 } },
          { type: 'checkpoint', cell: [6, 0] },
        ],
        start: [0, 0],
        goal: [6, 7],
      },
    ],
  },
  {
    id: 'race-03',
    name: 'Spießrutenlauf',
    intro: 'Eine Wache patrouilliert die Zielgerade. Wer erwischt wird, fliegt zurück zum Checkpoint – und verliert wertvolle Sekunden.',
    pingBudget: 3,
    floors: [
      {
        size: [7, 9],
        maze: { seed: 313, carve: [...down(0, 0, 8), ...right(8, 0, 6)] },
        elements: [
          { type: 'guard', patrol: [[2, 8], [5, 8]], speed: 90 },
          { type: 'hole', cell: [0, 3], breathing: { offset: 0 } },
          { type: 'hole', cell: [0, 6], breathing: { offset: 2 } },
          { type: 'hole', cell: [1, 8], breathing: { offset: 4 } },
          { type: 'checkpoint', cell: [0, 8] },
        ],
        start: [0, 0],
        goal: [6, 8],
      },
    ],
  },
  {
    id: 'race-04',
    name: 'Brecherbahn',
    intro: 'Viele Wände hier sind brüchig – wer mutig rammt, findet Abkürzungen. Wer zu mutig ist, verliert Tempo an der falschen Wand.',
    pingBudget: 3,
    floors: [
      {
        size: [8, 10],
        maze: { seed: 314, carve: [...right(0, 0, 7), ...down(7, 0, 9)], brittleChance: 0.22 },
        elements: [
          { type: 'hole', cell: [3, 0], breathing: { offset: 0 } },
          { type: 'hole', cell: [7, 4], breathing: { offset: 2.5 } },
          { type: 'windZone', cell: [7, 7], dir: 'n' },
          { type: 'checkpoint', cell: [7, 0] },
        ],
        start: [0, 0],
        goal: [7, 9],
      },
    ],
  },
  {
    id: 'race-05',
    name: 'Königsdisziplin',
    intro: 'Das große Rennen: lang, tief, bewacht und brüchig. Alles, was du gelernt hast – schneller als dein Gegner.',
    pingBudget: 4,
    floors: [
      {
        size: [8, 11],
        maze: { seed: 315, carve: [...down(0, 0, 10), ...right(10, 0, 7)], brittleChance: 0.15 },
        elements: [
          { type: 'guard', patrol: [[2, 10], [5, 10]], speed: 95 },
          { type: 'hole', cell: [0, 3], breathing: { offset: 0 } },
          { type: 'hole', cell: [0, 6], breathing: { offset: 1.5 } },
          { type: 'hole', cell: [0, 8], breathing: { offset: 3 } },
          { type: 'hole', cell: [6, 10], breathing: { offset: 4.5 } },
          { type: 'hole', cell: [3, 10], breathing: { offset: 2 } },
          { type: 'windZone', cell: [1, 10], dir: 'e' },
          { type: 'windZone', cell: [0, 5], dir: 's' },
          { type: 'checkpoint', cell: [0, 5] },
          { type: 'checkpoint', cell: [0, 10] },
        ],
        start: [0, 0],
        goal: [7, 10],
      },
    ],
  },
];

// Spiegelachsen: Startecken variieren (coop-01 bleibt ungespiegelt – das
// Einstiegslevel, auf dessen Choreografie auch der Multiplayer-E2E fußt).
// 'x' erhält oben/unten in den Intro-Texten ("ganz oben am Start").
const MIRRORS: Record<string, MirrorAxis> = {
  'coop-02': 'y',
  'coop-03': 'x',
  'coop-04': 'xy',
  'coop-05': 'x',
  'race-01': 'y',
  'race-02': 'xy',
  'race-03': 'y',
  'race-04': 'x',
  'race-05': 'xy',
};

const build = (d: unknown): LevelDef => {
  const def = parseLevel(d);
  const axis = MIRRORS[def.id];
  return axis ? mirrorLevel(def, axis) : def;
};

export const COOP_LEVELS: LevelDef[] = coopDefs.map(build);
export const RACE_LEVELS: LevelDef[] = raceDefs.map(build);
