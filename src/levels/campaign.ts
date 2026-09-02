// Kampagne: Welt 1 (10 Level, eine Ebene), Welt 2 (6 Level, mehrere Ebenen
// mit Transportern und Portalen), Welt 3 „Das Räderwerk" (6 Level:
// Schiebewände, Zeitschlösser, Strömungen – die Rhythmus-Welt) und Welt 4
// „Die Stille" (6 Level: Horcher, Nebel, Eis – die Schleich-Welt).
// Jedes Level carvt sich einen garantierten "Spine"-Korridor durch das
// Seed-Maze (L-Form o. ä.) und platziert seine Elemente daran – die
// Lösbarkeit aller Level sichert tests/campaign.test.ts ab.
//
// Sterne: 1 = geschafft, 2 = unter Par-Zeit, 3 = alle Gems gesammelt
// (bzw. sturzfrei in Leveln ohne Gems).

import type { LevelDef } from './schema';
import { parseLevel } from './schema';
import { mirrorLevel, type MirrorAxis } from './mirror';

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
      'Willkommen in der Dunkelheit. Folge dem Ping des Ziels – die linke Wand führt dich hinab, unten geht es nach rechts. Und oben rechts funkelt etwas abseits des Wegs.',
    parTimeS: 45,
    pingBudget: 3,
    floors: [
      {
        size: [5, 6],
        maze: { seed: 21, carve: [...down(0, 0, 5), ...right(5, 0, 4)] },
        // M44: ein Gem im Umweg über die obere Zeile – der dritte Stern ist
        // eine Leistung, kein Geschenk (vorher: keine Gefahr, „sturzfrei" gratis).
        elements: [{ type: 'gem', cell: [3, 1] }],
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
        maze: {
          seed: 44,
          carve: [...down(0, 0, 6), ...right(6, 0, 5)],
          // M44: Das Seed-Maze bot einen Umweg um die Tür (über [5,5]→[5,6]) –
          // „Schlüsseldienst" ging ohne Schlüssel. Zugemauert; der Test
          // „Schlüssel-Türen sind Pflicht" hält es fest.
          add: [[[5, 5], 's']],
        },
        elements: [
          { type: 'door', id: 'tor', edge: [[3, 6], 'e'] },
          { type: 'key', cell: [3, 3], opens: 'tor' },
          // M44: Loch in der Sackgasse neben dem Schlüsselgang – Sturzgefahr,
          // damit „sturzfrei" etwas bedeutet.
          { type: 'hole', cell: [2, 3] },
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
    pingBudget: 3,
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
    parTimeS: 85,
    pingBudget: 3,
    floors: [
      {
        // M44: 5×10 statt 6×8 – ein langer Schacht statt des dritten 6×8-Felds
        // in Folge; Wind wirkt in einem Korridor stärker.
        size: [5, 10],
        maze: { seed: 66, carve: [...right(0, 0, 4), ...down(4, 0, 9)] },
        elements: [
          { type: 'windZone', cell: [2, 0], dir: 'w' },
          { type: 'windZone', cell: [3, 0], dir: 'w' },
          { type: 'hole', cell: [4, 5], breathing: { offset: 1 } },
          { type: 'gem', cell: [1, 4] },
          { type: 'checkpoint', cell: [4, 0] },
        ],
        start: [0, 0],
        goal: [4, 9],
      },
    ],
  },
  {
    id: 'w1-07',
    name: 'Brecher',
    intro:
      'Hier ist der Weg vermauert – aber es knirscht verdächtig. Ramm die brüchigen Wände, weich dem Wächter unten aus und sammle, was funkelt.',
    parTimeS: 90,
    pingBudget: 3,
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
    pingBudget: 3,
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
    pingBudget: 3,
    floors: [
      {
        size: [7, 10],
        maze: { seed: 99, carve: [...down(0, 0, 9), ...right(9, 0, 6)] },
        elements: [
          { type: 'hole', cell: [0, 2], breathing: { offset: 0 } },
          // M46: Das mittlere Loch WANDERT – Wächter und Loch in einem; man
          // hört das Grollen kommen und wartet, bis es vorbei ist.
          { type: 'roamingHole', patrol: [[0, 5], [0, 6]], speed: 50 },
          { type: 'hole', cell: [0, 7], breathing: { offset: 4 } },
          { type: 'hole', cell: [2, 9], breathing: { offset: 1 } },
          { type: 'hole', cell: [4, 9], breathing: { offset: 3 } },
          { type: 'windZone', cell: [1, 9], dir: 'e' },
          { type: 'checkpoint', cell: [0, 4] },
          { type: 'checkpoint', cell: [0, 9] },
          { type: 'gem', cell: [3, 3] },
          { type: 'gem', cell: [6, 0] },
          // M44: Glasboden als Einmal-Brücke auf dem Nebenweg zum oberen Gem –
          // trägt hin, knackt, und der Rückweg kostet Gefühl (erstes Glas der Kampagne).
          { type: 'glass', cell: [2, 1] },
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
    pingBudget: 3,
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

const defs2: unknown[] = [
  {
    id: 'w2-01',
    name: 'Unterführung',
    intro:
      'Eine Mauer versiegelt den Weg – aber hörst du das Schweben? Ein Transporter führt hinab. Unten quer durch die Dunkelheit, an anderer Stelle wieder hinauf.',
    parTimeS: 75,
    pingBudget: 4,
    floors: [
      {
        size: [5, 6],
        maze: {
          seed: 201,
          carve: [...right(0, 0, 4), ...right(5, 0, 4)],
          add: [[[0, 2], 's'], [[1, 2], 's'], [[2, 2], 's'], [[3, 2], 's'], [[4, 2], 's']],
        },
        elements: [{ type: 'transporter', cell: [4, 0], target: { floor: 1, cell: [4, 0] } }],
        start: [0, 0],
        goal: [4, 5],
      },
      {
        size: [5, 6],
        maze: { seed: 202, carve: [...down(4, 0, 5), ...right(5, 0, 4)] },
        elements: [
          { type: 'hole', cell: [4, 2], breathing: { offset: 0 } },
          { type: 'hole', cell: [2, 5], breathing: { offset: 2.7 } },
          { type: 'checkpoint', cell: [4, 5] },
          { type: 'transporter', cell: [0, 5], target: { floor: 0, cell: [0, 5] } },
        ],
        start: [4, 0],
        goal: null,
      },
    ],
  },
  {
    id: 'w2-04',
    name: 'Zwillingstore',
    intro:
      'Zwei Portale auf einer Ebene, ein versiegeltes Ziel. Spring – und lerne, wo du landest. Der aufsteigende Doppelklang deines Pings verrät die Tore.',
    parTimeS: 90,
    pingBudget: 4,
    floors: [
      {
        size: [6, 8],
        maze: {
          seed: 230,
          carve: [...right(0, 0, 3), ...right(7, 0, 3), [[5, 6], 's']],
          add: [[[5, 5], 's'], [[4, 6], 'e'], [[4, 7], 'e']],
        },
        elements: [
          { type: 'transporter', cell: [3, 0], target: { floor: 0, cell: [0, 7] } },
          { type: 'transporter', cell: [3, 7], target: { floor: 0, cell: [5, 6] } },
          { type: 'hole', cell: [1, 7], breathing: { offset: 0.5 } },
          { type: 'gem', cell: [5, 0] },
          { type: 'gem', cell: [0, 4] },
          { type: 'checkpoint', cell: [0, 7] },
        ],
        start: [0, 0],
        goal: [5, 7],
      },
    ],
  },
  {
    id: 'w2-02',
    name: 'Doppelter Boden',
    intro:
      'Die Tür oben schweigt – ihr Schlüssel klimpert unter deinen Füßen. Hinab, an der Wache vorbei, den Schlüssel holen und woanders wieder ans Licht.',
    parTimeS: 100,
    pingBudget: 4,
    floors: [
      {
        size: [5, 7],
        maze: { seed: 210, carve: [...down(0, 0, 6), ...right(6, 0, 4)] },
        elements: [
          { type: 'door', id: 'tor', edge: [[2, 6], 'e'] },
          { type: 'transporter', cell: [0, 3], target: { floor: 1, cell: [0, 0] } },
          { type: 'checkpoint', cell: [0, 6] },
        ],
        start: [0, 0],
        goal: [4, 6],
      },
      {
        size: [5, 4],
        // Die Süd-Kante bei [1,0] ist PFLICHT: Sie ist der Fluchtweg aus dem
        // Wächter-Korridor. Ohne sie wäre die obere Zeile der einzige Ab-
        // stieg – und ein Wächter versiegelt einen Ein-Zellen-Korridor
        // dauerhaft (Kollision ab 48 Einheiten, seitlich passen nur 23).
        // Der 'guards'-Beweis in validate.ts hält das jetzt fest.
        maze: { seed: 211, carve: [...right(0, 0, 4), ...down(4, 0, 3), ...right(3, 0, 4), [[1, 0], 's']] },
        elements: [
          { type: 'guard', patrol: [[1, 0], [3, 0]], speed: 85 },
          { type: 'key', cell: [4, 3], opens: 'tor' },
          { type: 'hole', cell: [2, 3], breathing: { offset: 1 } },
          { type: 'transporter', cell: [0, 3], target: { floor: 0, cell: [1, 6] } },
        ],
        start: [0, 0],
        goal: null,
      },
    ],
  },
  {
    id: 'w2-03',
    name: 'Fahrstuhl',
    intro:
      'Immer tiefer: zwei Schächte hinab, unten wartet das Funkeln – und ein Aufzug, der dich direkt in die versiegelte Zielkammer hebt.',
    parTimeS: 110,
    pingBudget: 4,
    floors: [
      {
        size: [4, 4],
        maze: {
          seed: 220,
          carve: [...right(0, 0, 3), [[2, 3], 'e']],
          add: [[[3, 2], 's'], [[1, 3], 'e'], [[2, 2], 's']],
        },
        elements: [{ type: 'transporter', cell: [3, 0], target: { floor: 1, cell: [0, 0] } }],
        start: [0, 0],
        goal: [3, 3],
      },
      {
        size: [4, 4],
        maze: { seed: 221, carve: right(0, 0, 3) },
        elements: [
          { type: 'hole', cell: [1, 0], breathing: { offset: 0 } },
          { type: 'hole', cell: [2, 0], breathing: { offset: 2.7 } },
          { type: 'transporter', cell: [3, 0], target: { floor: 2, cell: [0, 0] } },
        ],
        start: [0, 0],
        goal: null,
      },
      {
        size: [4, 4],
        maze: { seed: 222, carve: [...down(0, 0, 3), ...right(3, 0, 3)] },
        elements: [
          { type: 'gem', cell: [2, 3] },
          { type: 'gem', cell: [3, 0] },
          { type: 'windZone', cell: [1, 3], dir: 'w' },
          { type: 'checkpoint', cell: [0, 3] },
          { type: 'transporter', cell: [3, 3], target: { floor: 0, cell: [2, 3] } },
        ],
        start: [0, 0],
        goal: null,
      },
    ],
  },
  {
    id: 'w2-06',
    name: 'Die Weite',
    intro:
      'Die Weite: größer als dein Bildschirm. Folge dem Rand durch die Dunkelheit – Checkpoints sichern die lange Reise, abseits des Weges funkelt es, und unter dem Feld führen zwei Schächte quer hindurch: Abkürzungen für die, die hinhören.',
    parTimeS: 255,
    pingBudget: 4,
    floors: [
      {
        // Multi-Screen-Level: 13x15 Zellen (~2 Screens breit auf dem Handy),
        // Spine als L (Spalte 0 hinab, unten nach rechts), Rest liefert das
        // Seed-Maze – Gems & Checkpoints abseits, Wachen auf dem Spine.
        size: [13, 15],
        maze: {
          seed: 260,
          carve: [...down(0, 0, 14), ...right(14, 0, 12)],
          add: [],
          brittle: [],
          brittleChance: 0.12,
          brittleHits: 3,
        },
        elements: [
          { type: 'checkpoint', cell: [0, 7] },
          { type: 'checkpoint', cell: [6, 14] },
          { type: 'checkpoint', cell: [12, 7] },
          { type: 'guard', patrol: [[0, 4], [0, 8]], speed: 80 },
          { type: 'guard', patrol: [[3, 14], [7, 14]], speed: 95 },
          { type: 'hole', cell: [0, 3], breathing: { offset: 0 } },
          { type: 'hole', cell: [0, 10], breathing: { offset: 2 } },
          { type: 'hole', cell: [3, 14], breathing: { offset: 4 } },
          { type: 'hole', cell: [9, 14], breathing: { offset: 1 } },
          { type: 'hole', cell: [5, 5], breathing: { offset: 3 } },
          { type: 'hole', cell: [10, 4], breathing: { offset: 5 } },
          { type: 'windZone', cell: [0, 12], dir: 'n' },
          { type: 'windZone', cell: [8, 14], dir: 'w' },
          { type: 'gem', cell: [2, 2] },
          { type: 'gem', cell: [6, 7] },
          { type: 'gem', cell: [11, 2] },
          { type: 'gem', cell: [4, 10] },
          { type: 'gem', cell: [9, 9] },
          // M27: In der Weite ist ein Musikautomat vor allem ein WAHRZEICHEN –
          // mitten im Feld, hörbar ortbar, gleich weit von Start und Ziel.
          { type: 'jukebox', cell: [6, 5], playlist: ['thaxted', 'nachtmusik'] },
          // M44: Zwei Schächte in die Unterwelt – Abkürzungen quer durchs Feld.
          // Damit trägt das Level das Welt-Thema (vorher: kein Transporter in
          // „Zwischen den Ebenen"). Landeplatz = Respawn (M43) macht die
          // Rückwege sicher.
          { type: 'transporter', cell: [3, 4], target: { floor: 1, cell: [0, 0] } },
          { type: 'transporter', cell: [10, 9], target: { floor: 1, cell: [3, 3] } },
          // M46: Sanduhren – Zeit holen statt Gems holen; die faire Antwort
          // auf „drei Sterne = zwei Läufe" im großen Feld.
          { type: 'hourglass', cell: [8, 3] },
          { type: 'hourglass', cell: [2, 12] },
        ],
        start: [0, 0],
        goal: [12, 0],
      },
      {
        // Die Unterwelt: ein kurzer Gang, zwei Ausgänge in andere Ecken des Feldes.
        size: [4, 4],
        maze: { seed: 261, carve: [...right(0, 0, 3), ...down(3, 0, 3)] },
        elements: [
          { type: 'transporter', cell: [1, 0], target: { floor: 0, cell: [9, 10] } },
          { type: 'transporter', cell: [3, 2], target: { floor: 0, cell: [4, 5] } },
        ],
        start: [0, 0],
        goal: null,
      },
    ],
  },
  {
    id: 'w2-05',
    name: 'Kathedrale',
    intro:
      'Zwei Schlüssel zur Krypta: einer im Zwischengeschoss, einer drei Ebenen tief. Oben fällt Licht durch die Fenster – unten hörst du nur noch. Brich durch, was knirscht, trotze Wind und Wache, und steig mit beiden zurück.',
    parTimeS: 270,
    pingBudget: 4,
    floors: [
      {
        size: [7, 9],
        maze: {
          seed: 240,
          carve: [...down(0, 0, 8), ...right(8, 0, 6), ...right(0, 0, 5)],
          // Zielkammer {[5,8],[6,8]} versiegeln – die Krypta-Tür ist der einzige Eingang
          add: [[[5, 7], 's'], [[6, 7], 's']],
        },
        elements: [
          { type: 'guard', patrol: [[1, 0], [4, 0]], speed: 95 },
          // M44: Die Krypta braucht BEIDE Schlüssel (require 'all') – der eine
          // im Zwischengeschoss, der andere drei Ebenen tief.
          { type: 'door', id: 'krypta', edge: [[4, 8], 'e'], require: 'all' },
          { type: 'transporter', cell: [0, 4], target: { floor: 1, cell: [0, 0] } },
          { type: 'gem', cell: [5, 0] },
          { type: 'checkpoint', cell: [0, 8] },
          // M27: In der Kathedrale spielt eine Jukebox – Orgel und Hymne,
          // in einer Nische abseits des Wegs (validate.ts beweist es).
          { type: 'jukebox', cell: [1, 5], playlist: ['toccata', 'thaxted'] },
          // M46: Das Kirchenschiff HALLT – der Raum erzählt seine Größe.
          { type: 'reverbZone', cell: [0, 2] },
          { type: 'reverbZone', cell: [0, 3] },
          { type: 'reverbZone', cell: [0, 5] },
          { type: 'reverbZone', cell: [0, 6] },
        ],
        start: [0, 0],
        goal: [6, 8],
        // M44: Das Kirchenschiff ist HELL („Fenster") – Atempause vor dem
        // Abstieg; unten hört man nur noch.
        bright: true,
      },
      {
        size: [6, 6],
        maze: { seed: 241, carve: [...right(0, 0, 5), ...down(5, 0, 5)] },
        elements: [
          { type: 'windZone', cell: [2, 0], dir: 'w' },
          { type: 'windZone', cell: [3, 0], dir: 'w' },
          { type: 'hole', cell: [5, 2], breathing: { offset: 1 } },
          { type: 'gem', cell: [0, 5] },
          { type: 'key', cell: [2, 3], opens: 'krypta' },
          { type: 'transporter', cell: [5, 5], target: { floor: 2, cell: [0, 0] } },
        ],
        start: [0, 0],
        goal: null,
      },
      {
        size: [5, 5],
        maze: {
          seed: 242,
          carve: [...down(0, 0, 4), ...right(4, 0, 4), ...down(4, 0, 4)],
          add: [[[0, 2], 's']],
          brittle: [[[0, 2], 's']],
          brittleHits: 2,
        },
        elements: [
          { type: 'guard', patrol: [[1, 4], [3, 4]], speed: 75 },
          { type: 'key', cell: [4, 4], opens: 'krypta' },
          { type: 'hole', cell: [4, 2], breathing: { offset: 2 } },
          { type: 'checkpoint', cell: [0, 4] },
          { type: 'transporter', cell: [4, 0], target: { floor: 0, cell: [1, 8] } },
        ],
        start: [0, 0],
        goal: null,
      },
    ],
  },
];

// Welt 3 „Das Räderwerk": Timing-Gameplay. Schiebewände sitzen auf gecarvten
// Spine-Kanten (offen = passierbar, Lösbarkeit unberührt), Strömungen sind
// gerichtete Einbahn-Kanten (tests beweisen: kein Softlock, Ziel bleibt von
// überall erreichbar), Zeitschloss-Türen kommen mit Timer-Beweis
// (Pfadlänge Schalter→Tür ÷ Maxspeed « Timer).
const defs3: unknown[] = [
  {
    id: 'w3-01',
    name: 'Taktgefühl',
    intro:
      'Hörst du das Steinschleifen? Hier schieben sich Wände im Takt auf und zu – nur voll geöffnet kommst du durch. Wenn der Takt schneller klackt, schließt sie gleich. Warte. Lausche. Roll.',
    parTimeS: 65,
    pingBudget: 4,
    floors: [
      {
        size: [5, 7],
        maze: { seed: 310, carve: [...down(0, 0, 6), ...right(6, 0, 4)] },
        elements: [
          { type: 'slidingWall', edge: [[0, 2], 's'], cycle: { open: 3.4, closed: 2.2, ramp: 0.5, offset: 0 } },
          { type: 'slidingWall', edge: [[1, 6], 'e'], cycle: { open: 3.4, closed: 2.2, ramp: 0.5, offset: 3 } },
          { type: 'checkpoint', cell: [0, 6] },
          { type: 'gem', cell: [2, 3] },
        ],
        start: [0, 0],
        goal: [4, 6],
      },
    ],
  },
  {
    id: 'w3-02',
    name: 'Zeitschloss',
    intro:
      'Der Schalter auf dem Weg spannt ein Uhrwerk: Die Tür vor dem Ziel springt auf – aber nur für neun Takte. Das Ticken zählt mit und wird hektisch, wenn die Zeit knapp wird. Dann roll, was das Zeug hält!',
    parTimeS: 75,
    pingBudget: 4,
    floors: [
      {
        size: [6, 7],
        maze: { seed: 320, carve: [...down(0, 0, 6), ...right(6, 0, 5)] },
        elements: [
          { type: 'door', id: 'takt', edge: [[3, 6], 'e'] },
          { type: 'timedSwitch', cell: [0, 3], opens: 'takt', durationS: 9 },
          { type: 'checkpoint', cell: [0, 6] },
          { type: 'hole', cell: [3, 2], breathing: { offset: 1 } },
          { type: 'gem', cell: [5, 0] },
        ],
        start: [0, 0],
        goal: [5, 6],
      },
    ],
  },
  {
    id: 'w3-03',
    name: 'Stromschnellen',
    intro:
      'Ein Rauschen, das pulst: Strömungen. Sie schieben stärker, als du neigen kannst – Einbahnstraßen. Was hinter einer Strömung liegt, bleibt hinter dir. Sammle zuerst, spring dann.',
    parTimeS: 80,
    pingBudget: 4,
    floors: [
      {
        size: [6, 8],
        maze: { seed: 330, carve: [...down(0, 0, 7), ...right(7, 0, 5)] },
        elements: [
          { type: 'current', cell: [0, 2], dir: 's' },
          { type: 'current', cell: [1, 7], dir: 'e' },
          { type: 'current', cell: [3, 7], dir: 'e' },
          { type: 'checkpoint', cell: [0, 7] },
          { type: 'hole', cell: [5, 4], breathing: { offset: 0 } },
          { type: 'hole', cell: [2, 5], breathing: { offset: 2.5 } },
          { type: 'gem', cell: [4, 1] },
          { type: 'gem', cell: [3, 4] },
        ],
        start: [0, 0],
        goal: [5, 7],
      },
    ],
  },
  {
    id: 'w3-04',
    name: 'Schleusenwerk',
    intro:
      'Erst der Takt, dann der Schlüssel, dann die Uhr: Zwei Schiebewände wollen im Rhythmus passiert werden, dahinter klimpert der Schlüssel – und die Schleuse vor dem Ziel braucht ihn UND das Zeitschloss, das nur acht Takte lang offen hält.',
    parTimeS: 105,
    pingBudget: 4,
    floors: [
      {
        size: [7, 9],
        maze: {
          seed: 340,
          carve: [...right(0, 0, 6), ...down(6, 0, 8)],
          // M44: Zielkammer [6,8] versiegeln – die Schleuse war über die
          // unterste Zeile umgehbar, das Rätsel damit freiwillig.
          add: [[[5, 8], 'e']],
        },
        elements: [
          { type: 'slidingWall', edge: [[1, 0], 'e'], cycle: { open: 3.2, closed: 2.4, ramp: 0.5, offset: 0 } },
          { type: 'slidingWall', edge: [[3, 0], 'e'], cycle: { open: 3.2, closed: 2.4, ramp: 0.5, offset: 2.7 } },
          // M44: Die Schleuse braucht Schlüssel UND Zeitschloss (require 'all') –
          // das Rhythmus-Rätsel der Welt: erst der Takt, dann der Schlüssel, dann der Sprint.
          { type: 'door', id: 'schleuse', edge: [[6, 7], 's'], require: 'all' },
          { type: 'key', cell: [2, 4], opens: 'schleuse' },
          { type: 'timedSwitch', cell: [6, 2], opens: 'schleuse', durationS: 8 },
          { type: 'checkpoint', cell: [6, 0] },
          { type: 'checkpoint', cell: [6, 5] },
          { type: 'hole', cell: [2, 2], breathing: { offset: 0.5 } },
          { type: 'hole', cell: [4, 6], breathing: { offset: 2 } },
          { type: 'gem', cell: [0, 4] },
          { type: 'gem', cell: [3, 8] },
        ],
        start: [0, 0],
        goal: [6, 8],
      },
    ],
  },
  {
    id: 'w3-05',
    name: 'Uhrwerk',
    intro:
      'Das ganze Räderwerk greift ineinander: Schiebewände takten den Abstieg, eine Strömung reißt dich zum Schacht in den Maschinenraum – dort tickt das Zeitschloss, und die Zielkammer oben bleibt nur sechs Takte offen. Eine Wache dreht ihre Runden.',
    parTimeS: 150,
    pingBudget: 4,
    floors: [
      {
        size: [7, 10],
        maze: {
          seed: 350,
          carve: [...down(0, 0, 9), ...right(9, 0, 6), ...right(0, 2, 5)],
          // Zielkammer [6,9] versiegeln – die Zeitschloss-Tür ist der einzige Eingang
          add: [[[6, 8], 's']],
        },
        elements: [
          { type: 'slidingWall', edge: [[0, 3], 's'], cycle: { open: 3.2, closed: 2.4, ramp: 0.5, offset: 0 } },
          { type: 'slidingWall', edge: [[0, 6], 's'], cycle: { open: 3.2, closed: 2.4, ramp: 0.5, offset: 2.8 } },
          { type: 'door', id: 'kammer', edge: [[5, 9], 'e'] },
          // M44: Der Schalter liegt UNTEN im Maschinenraum – der Schacht steht,
          // wo vorher der Schalter war; der 6-s-Sprint führt durch den Transporter
          // zurück nach oben (timer-Beweis mit einem Sprung).
          { type: 'transporter', cell: [3, 9], target: { floor: 1, cell: [0, 0] } },
          { type: 'current', cell: [1, 9], dir: 'e' },
          { type: 'guard', patrol: [[2, 0], [5, 0]], speed: 85 },
          // M27: Ein Musikautomat im Uhrwerk – mechanischer geht Musik nicht.
          { type: 'jukebox', cell: [3, 6], playlist: ['entertainer', 'galopp'] },
          { type: 'checkpoint', cell: [0, 5] },
          { type: 'checkpoint', cell: [0, 9] },
          { type: 'hole', cell: [4, 5], breathing: { offset: 0 } },
          { type: 'hole', cell: [2, 7], breathing: { offset: 2 } },
          { type: 'gem', cell: [3, 3] },
          { type: 'gem', cell: [6, 0] },
        ],
        start: [0, 0],
        goal: [6, 9],
      },
      {
        // Der Maschinenraum: Zeitschloss unten, Rückweg durch den Schacht nach oben.
        size: [4, 5],
        maze: { seed: 351, carve: [...down(0, 0, 4), ...right(4, 0, 3)] },
        elements: [
          { type: 'timedSwitch', cell: [3, 4], opens: 'kammer', durationS: 6 },
          { type: 'transporter', cell: [3, 2], target: { floor: 0, cell: [4, 9] } },
        ],
        start: [0, 0],
        goal: null,
      },
    ],
  },
  {
    id: 'w3-06',
    name: 'Taktstraße',
    intro:
      'Das Finale des Räderwerks, weiter als dein Bildschirm: Strömungen reißen dich von Schleuse zu Schleuse, Schiebewände geben den Takt vor, und ganz am Ende tickt das Zeitschloss vor der Zielkammer. Hör den Rhythmus – und tanz mit.',
    parTimeS: 240,
    pingBudget: 4,
    floors: [
      {
        // Multi-Screen-Finale: 13x15 Zellen. Spine als U: oberste Zeile quer
        // (Rundweg zu den fernen Gems), Spalte 0 hinab, dann die „Taktstraße"
        // – die unterste Zeile mit Strömungen und Schiebewänden im Wechsel.
        // Der obere Korridor hält auch die vom Kammer-Siegel ([12,13],'s')
        // abgetrennte Ost-Seite deterministisch am Start angebunden.
        size: [13, 15],
        maze: {
          seed: 360,
          carve: [...right(0, 0, 12), ...down(0, 0, 14), ...right(14, 0, 12)],
          add: [[[12, 13], 's']],
        },
        elements: [
          { type: 'slidingWall', edge: [[0, 4], 's'], cycle: { open: 3.4, closed: 2.2, ramp: 0.5, offset: 0 } },
          { type: 'slidingWall', edge: [[0, 9], 's'], cycle: { open: 3.4, closed: 2.2, ramp: 0.5, offset: 2.4 } },
          { type: 'slidingWall', edge: [[4, 14], 'e'], cycle: { open: 3, closed: 2.4, ramp: 0.5, offset: 1.2 } },
          { type: 'slidingWall', edge: [[7, 14], 'e'], cycle: { open: 3, closed: 2.4, ramp: 0.5, offset: 3.6 } },
          { type: 'current', cell: [2, 14], dir: 'e' },
          { type: 'current', cell: [6, 14], dir: 'e' },
          { type: 'current', cell: [9, 14], dir: 'e' },
          { type: 'door', id: 'endtor', edge: [[11, 14], 'e'] },
          { type: 'timedSwitch', cell: [10, 14], opens: 'endtor', durationS: 6 },
          // Wache auf dem Spine zwischen den Schiebewänden – wer den Takt
          // verpasst, wartet mit ihr im selben Gang.
          { type: 'guard', patrol: [[0, 10], [0, 13]], speed: 80 },
          { type: 'checkpoint', cell: [0, 7] },
          { type: 'checkpoint', cell: [5, 14] },
          { type: 'checkpoint', cell: [11, 14] },
          { type: 'checkpoint', cell: [12, 7] },
          // M44: Sog-Anker in den Nischen neben der Taktstraße – ein Kraftfeld
          // ist eine stationäre Strömung (erstes Vorkommen in der Kampagne).
          { type: 'anchor', cell: [3, 13] },
          { type: 'anchor', cell: [8, 13] },
          { type: 'hourglass', cell: [6, 3] },
          { type: 'hourglass', cell: [10, 11] },
          { type: 'hole', cell: [2, 5], breathing: { offset: 0 } },
          { type: 'hole', cell: [7, 3], breathing: { offset: 2 } },
          { type: 'hole', cell: [11, 9], breathing: { offset: 4 } },
          { type: 'hole', cell: [4, 12], breathing: { offset: 1 } },
          { type: 'gem', cell: [3, 2] },
          { type: 'gem', cell: [7, 9] },
          { type: 'gem', cell: [12, 0] },
          { type: 'gem', cell: [5, 11] },
          { type: 'gem', cell: [9, 6] },
          // M27: Ein Musikautomat in der Taktstraße – das Finale der
          // Rhythmus-Welt bekommt einen, der selbst den Takt hält.
          { type: 'jukebox', cell: [8, 7], playlist: ['fuenfviertel', 'bergkoenig'] },
        ],
        start: [0, 0],
        goal: [12, 14],
      },
    ],
  },
];

// Welt 4 „Die Stille": Schleich-Gameplay. Horcher jagen nur, solange der
// Ball rollt (patrouillenfrei – nur ihr Heimatpunkt braucht einen
// Erreichbarkeits-Beweis), Nebel dämpft alle Klänge (kein Physik-Einfluss),
// Eis ändert nur Reibung/Grip – die Lösbarkeits-Modelle bleiben unberührt.
const defs4: unknown[] = [
  {
    id: 'w4-01',
    name: 'Horchposten',
    intro:
      'Da schnüffelt etwas. Der Horcher hört dein Rollen – sogar durch Wände – und jagt dich, solange du dich bewegst. Stehst du still, verliert er die Spur und zieht sich zurück. Roll in Etappen. Und wer ganz ohne Ping ankommt, trägt den Blind-Stern 🌑.',
    parTimeS: 75,
    pingBudget: 3,
    floors: [
      {
        size: [5, 7],
        maze: { seed: 410, carve: [...down(0, 0, 6), ...right(6, 0, 4)] },
        elements: [
          { type: 'listener', cell: [2, 3], speed: 90 },
          { type: 'checkpoint', cell: [0, 6] },
          { type: 'gem', cell: [4, 0] },
        ],
        start: [0, 0],
        goal: [4, 6],
      },
    ],
  },
  {
    id: 'w4-02',
    name: 'Nebelbank',
    intro:
      'Im Nebel klingt alles wie durch Watte – sogar der Sonar des Ziels. Und am Nebelrand stehen Wände aus Dämmstoff: Der Ping trifft sie, aber sie antworten nicht, und was dahinter liegt, hörst du nur dumpf. Präg dir den Kurs ein, bevor du eintauchst.',
    parTimeS: 75,
    pingBudget: 3,
    floors: [
      {
        size: [6, 7],
        maze: {
          seed: 420,
          carve: [...down(0, 0, 6), ...right(6, 0, 5)],
          // M44: Schallschutzwände am Nebelrand – Zone und Wand dämpfen
          // beide, hier lernt man den Unterschied (erstes Vorkommen).
          absorb: [
            [[1, 3], 'e'],
            [[3, 5], 's'],
          ],
        },
        elements: [
          { type: 'fogZone', cell: [0, 3] },
          { type: 'fogZone', cell: [1, 3] },
          { type: 'fogZone', cell: [0, 4] },
          { type: 'fogZone', cell: [1, 4] },
          { type: 'fogZone', cell: [2, 6] },
          { type: 'fogZone', cell: [3, 6] },
          { type: 'hole', cell: [2, 5], breathing: { offset: 1 } },
          { type: 'checkpoint', cell: [0, 6] },
          { type: 'gem', cell: [4, 1] },
        ],
        start: [0, 0],
        goal: [5, 6],
      },
    ],
  },
  {
    id: 'w4-03',
    name: 'Spiegeleis',
    intro:
      'Spiegelglattes Eis: Einmal angerollt, gleitest du weiter – Bremsen wird zäh, Lenken schwammig. Hör auf das Sirren unter dir und plane den Schwung, bevor du ihn nimmst.',
    parTimeS: 85,
    pingBudget: 3,
    floors: [
      {
        size: [6, 8],
        maze: { seed: 430, carve: [...down(0, 0, 7), ...right(7, 0, 5)] },
        elements: [
          { type: 'ice', cell: [0, 3] },
          { type: 'ice', cell: [0, 4] },
          { type: 'ice', cell: [1, 7] },
          { type: 'ice', cell: [2, 7] },
          { type: 'ice', cell: [3, 7] },
          { type: 'ice', cell: [4, 7] },
          { type: 'hole', cell: [0, 5], breathing: { offset: 0 } },
          { type: 'checkpoint', cell: [0, 7] },
          { type: 'gem', cell: [5, 2] },
        ],
        start: [0, 0],
        goal: [5, 7],
      },
    ],
  },
  {
    // M44: Kristallgang – der Echo-Kristall hatte kein Kampagnen-Level, obwohl
    // die Generatoren ihn längst setzen. Hier lernt man ihn, bevor „Das Ohr"
    // ihn am Nebelkern braucht.
    id: 'w4-03k',
    name: 'Kristallgang',
    intro:
      'Drei Echo-Kristalle säumen den Weg: Jeder wirft deinen Ping als helles Klirren zurück – und schenkt dir einen neuen. Ein Horcher lauert am Rand. Roll leise, ping klug.',
    parTimeS: 85,
    pingBudget: 3,
    floors: [
      {
        size: [6, 8],
        maze: { seed: 435, carve: [...down(0, 0, 7), ...right(7, 0, 5)] },
        elements: [
          { type: 'echoCrystal', cell: [0, 2] },
          { type: 'echoCrystal', cell: [0, 5] },
          { type: 'echoCrystal', cell: [3, 7] },
          { type: 'listener', cell: [4, 3], speed: 85 },
          { type: 'checkpoint', cell: [0, 7] },
          { type: 'gem', cell: [5, 1] },
        ],
        start: [0, 0],
        goal: [5, 7],
      },
    ],
  },
  {
    id: 'w4-04',
    name: 'Schleichfahrt',
    intro:
      'Schleichfahrt: Ein Horcher streift durchs Revier, und Nebelbänke schlucken deine Orientierung. Die Dämmwände neben seinem Posten sind Deckung – dahinter hört er dein Rollen nur leise. Beweg dich in kurzen Stößen, und lausche in den Pausen, wo das Schnüffeln steht.',
    parTimeS: 120,
    pingBudget: 3,
    floors: [
      {
        size: [7, 9],
        maze: {
          seed: 440,
          carve: [...right(0, 0, 6), ...down(6, 0, 8)],
          // M44: Deckung – der Horcher hört durch Schallschutz gedämpft
          // (physics.updateListeners, ABSORB_GAIN).
          absorb: [
            [[4, 4], 'e'],
            [[5, 4], 's'],
          ],
        },
        elements: [
          { type: 'listener', cell: [3, 4], speed: 95 },
          { type: 'fogZone', cell: [6, 3] },
          { type: 'fogZone', cell: [6, 4] },
          { type: 'fogZone', cell: [5, 3] },
          { type: 'fogZone', cell: [5, 4] },
          { type: 'hole', cell: [2, 2], breathing: { offset: 0.5 } },
          { type: 'hole', cell: [4, 7], breathing: { offset: 2 } },
          { type: 'checkpoint', cell: [6, 0] },
          { type: 'checkpoint', cell: [6, 5] },
          { type: 'gem', cell: [0, 4] },
          { type: 'gem', cell: [3, 8] },
        ],
        start: [0, 0],
        goal: [6, 8],
      },
    ],
  },
  {
    id: 'w4-05',
    name: 'Glatteisjagd',
    intro:
      'Die Jagd auf Glatteis: Auf dem Eis gleitest du – und der Horcher hört jedes Gleiten. Wer schlittert, kann nicht stillstehen. Nimm Schwung mit Bedacht und bremse, bevor er zubeißt.',
    parTimeS: 150,
    pingBudget: 3,
    floors: [
      {
        size: [7, 10],
        maze: { seed: 450, carve: [...down(0, 0, 9), ...right(9, 0, 6)] },
        elements: [
          { type: 'listener', cell: [4, 5], speed: 100 },
          { type: 'ice', cell: [1, 9] },
          { type: 'ice', cell: [2, 9] },
          { type: 'ice', cell: [3, 9] },
          { type: 'ice', cell: [4, 9] },
          { type: 'hole', cell: [2, 4], breathing: { offset: 0 } },
          { type: 'hole', cell: [6, 6], breathing: { offset: 2 } },
          { type: 'checkpoint', cell: [0, 5] },
          { type: 'checkpoint', cell: [0, 9] },
          { type: 'gem', cell: [3, 2] },
          { type: 'gem', cell: [6, 0] },
        ],
        start: [0, 0],
        goal: [6, 9],
      },
    ],
  },
  {
    id: 'w4-06',
    name: 'Das Ohr',
    intro:
      'Das Ohr: drei Ebenen hinab in den Nebelkern, wo alles wie durch Watte klingt und zwei Horcher lauschen. Ganz unten, mitten im Nebel, pulst das Ziel – ein Echo-Kristall am Rand des Kerns gibt dir den Ping noch einmal klar zurück. Beweg dich wie ein Flüstern. Wer hier ohne einen einzigen Ping ankommt, trägt den Blind-Stern zu Recht.',
    parTimeS: 240,
    pingBudget: 3,
    floors: [
      {
        size: [7, 8],
        maze: { seed: 460, carve: right(0, 0, 6) },
        elements: [
          { type: 'fogZone', cell: [2, 0] },
          { type: 'fogZone', cell: [3, 0] },
          { type: 'hole', cell: [4, 4], breathing: { offset: 1 } },
          { type: 'gem', cell: [0, 7] },
          { type: 'hourglass', cell: [3, 5] },
          { type: 'transporter', cell: [6, 0], target: { floor: 1, cell: [0, 0] } },
        ],
        start: [0, 0],
        goal: null,
      },
      {
        size: [6, 6],
        maze: { seed: 461, carve: [...right(0, 0, 5), ...down(5, 0, 5)] },
        elements: [
          { type: 'listener', cell: [2, 4], speed: 95 },
          { type: 'ice', cell: [2, 2] },
          { type: 'ice', cell: [3, 2] },
          { type: 'ice', cell: [2, 3] },
          { type: 'ice', cell: [3, 3] },
          { type: 'gem', cell: [0, 5] },
          // M44: Checkpoint hinter dem Horcher-Revier – ein Fang auf Ebene 2 ist
          // ein Rückschlag, keine Wiederholung von Ebene 1.
          { type: 'checkpoint', cell: [5, 2] },
          { type: 'transporter', cell: [5, 5], target: { floor: 2, cell: [0, 0] } },
        ],
        start: [0, 0],
        goal: null,
      },
      {
        // Der Nebelkern: 3x3 Watte um die Zielkammer, zwei Horcher lauschen.
        size: [7, 7],
        maze: { seed: 462, carve: [...down(0, 0, 6), ...right(6, 0, 6)] },
        elements: [
          { type: 'fogZone', cell: [2, 2] },
          { type: 'fogZone', cell: [3, 2] },
          { type: 'fogZone', cell: [4, 2] },
          { type: 'fogZone', cell: [2, 3] },
          { type: 'fogZone', cell: [3, 3] },
          { type: 'fogZone', cell: [4, 3] },
          { type: 'fogZone', cell: [2, 4] },
          { type: 'fogZone', cell: [3, 4] },
          { type: 'fogZone', cell: [4, 4] },
          { type: 'listener', cell: [1, 5], speed: 90 },
          { type: 'listener', cell: [5, 1], speed: 90 },
          { type: 'checkpoint', cell: [0, 6] },
          { type: 'gem', cell: [6, 0] },
          // M44: Echo-Kristall am Nebelrand – das Ziel im Kern ist sonst nur Watte.
          { type: 'echoCrystal', cell: [3, 1] },
          { type: 'hourglass', cell: [5, 5] },
        ],
        start: [0, 0],
        goal: [3, 3],
      },
    ],
  },
];

// Welt 5 „Trugbild" (M48): Das Ohr wird getäuscht, das Auge hilft – und
// trügt auch. Helle Ebenen zeigen das Labyrinth, Echo-Spiegel und
// Schallschutz machen den Ping unzuverlässig, Kristalle sind die verlässlichen
// Anker. Jedes bisher ungenutzte oder neue Element hat hier sein Lehr-Level;
// gebaut wie Welt 1: ein Element pro Level, dann Kombination, dann Finale.
const defs5: unknown[] = [
  {
    id: 'w5-01',
    name: 'Lichtung',
    intro:
      'Zum ersten Mal in der Kampagne: Licht. Du siehst das Labyrinth, die Wache, das Loch. Aber Sehen ersetzt nicht Hören – der Wächter läuft, ob du hinschaust oder nicht. Hör auf sein Brummen, bevor du dich auf deine Augen verlässt.',
    parTimeS: 70,
    pingBudget: 4,
    floors: [
      {
        size: [5, 7],
        maze: { seed: 510, carve: [...down(0, 0, 6), ...right(6, 0, 4), ...right(3, 0, 4)] },
        elements: [
          { type: 'guard', patrol: [[2, 3], [4, 3]], speed: 80 },
          { type: 'hole', cell: [4, 1], breathing: { offset: 1 } },
          { type: 'gem', cell: [2, 1] },
          { type: 'checkpoint', cell: [0, 6] },
        ],
        start: [0, 0],
        goal: [4, 6],
        bright: true,
      },
    ],
  },
  {
    id: 'w5-02',
    name: 'Spiegelsaal',
    intro:
      'Jede zweite Wand hier ist aus poliertem Metall: Dein Ping meldet sie doppelt so weit, als sie steht. Du hörst sechs Wände, und es gibt drei. Präg dir ein, wo der Rempler kam – nicht, wo das Echo war.',
    parTimeS: 90,
    pingBudget: 4,
    floors: [
      {
        size: [6, 7],
        maze: {
          seed: 520,
          carve: [...down(0, 0, 6), ...right(6, 0, 5)],
          // Fünf bestehende Wände spiegeln – entlang der Spine-Spalte und über der
          // unteren Zeile: Der Ping meldet sie doppelt so weit.
          mirrors: [
            [[0, 5], 'e'],
            [[0, 2], 'e'],
            [[3, 5], 's'],
            [[5, 5], 's'],
            [[1, 3], 'e'],
          ],
        },
        elements: [
          { type: 'hole', cell: [3, 3], breathing: { offset: 1 } },
          { type: 'gem', cell: [5, 0] },
          { type: 'gem', cell: [2, 5] },
          { type: 'checkpoint', cell: [0, 6] },
        ],
        start: [0, 0],
        goal: [5, 6],
      },
    ],
  },
  {
    id: 'w5-03',
    name: 'Taubes Ohr',
    intro:
      'Um das Ziel stehen Wände aus Dämmstoff: Sein Sonar ist tot, aus fast jeder Richtung. Vorn hallt ein Saal, der jede Wand doppelt so weit klingen lässt. Nur der Echo-Kristall am Eingang gibt dir den Ping klar zurück – finde ihn zuerst.',
    parTimeS: 100,
    pingBudget: 4,
    floors: [
      {
        size: [6, 8],
        maze: {
          seed: 530,
          carve: [...down(0, 0, 7), ...right(7, 0, 5)],
          // Die Zielkammer bekommt ihren zweiten Eingang zugemauert (Nachbar
          // bleibt über [5,5] angebunden) – und Dämmstoff rundum.
          add: [[[5, 6], 's']],
          absorb: [
            [[5, 6], 's'],
            [[3, 6], 's'],
            [[2, 6], 'e'],
          ],
        },
        elements: [
          { type: 'reverbZone', cell: [0, 3] },
          { type: 'reverbZone', cell: [0, 4] },
          { type: 'echoCrystal', cell: [1, 7] },
          { type: 'hourglass', cell: [3, 2] },
          { type: 'gem', cell: [5, 1] },
          { type: 'checkpoint', cell: [0, 7] },
        ],
        start: [0, 0],
        goal: [5, 7],
      },
    ],
  },
  {
    id: 'w5-04',
    name: 'Lockruf',
    intro:
      'Zwei Horcher, zwei Glocken. Überrollst du eine Glocke, laufen beide zu ihr – vier Sekunden lang gehört der Weg dir. Ablenken statt Vermeiden; und hinter den Dämmwänden hören sie dein Rollen nur leise.',
    parTimeS: 130,
    pingBudget: 4,
    floors: [
      {
        size: [7, 9],
        maze: {
          seed: 540,
          carve: [...right(0, 0, 6), ...down(6, 0, 8)],
          // Deckung: Dämmwände zwischen Spine und den beiden Horcher-Posten.
          absorb: [
            [[5, 2], 'e'],
            [[3, 4], 'e'],
          ],
        },
        elements: [
          { type: 'listener', cell: [3, 4], speed: 95 },
          { type: 'listener', cell: [5, 2], speed: 90 },
          { type: 'bell', cell: [1, 3] },
          { type: 'bell', cell: [4, 6] },
          { type: 'hole', cell: [2, 7], breathing: { offset: 2 } },
          { type: 'gem', cell: [0, 5] },
          { type: 'gem', cell: [3, 8] },
          { type: 'checkpoint', cell: [6, 0] },
          { type: 'checkpoint', cell: [6, 5] },
        ],
        start: [0, 0],
        goal: [6, 8],
      },
    ],
  },
  {
    id: 'w5-05',
    name: 'Zwei Uhren',
    intro:
      'Die Tür vor dem Ziel braucht alles auf einmal: die Stimmgabel – ein Schlüssel, der tönt statt klimpert –, das Zeitschloss oben und das Zeitschloss unten in der hellen Ebene. Unten trägt Glas nur einmal. Zieh beide Uhren auf, dann lauf.',
    parTimeS: 170,
    pingBudget: 4,
    floors: [
      {
        size: [6, 8],
        maze: { seed: 550, carve: [...down(0, 0, 7), ...right(7, 0, 5)] },
        elements: [
          { type: 'door', id: 'uhren', edge: [[4, 7], 'e'], require: 'all' },
          { type: 'timedSwitch', cell: [3, 7], opens: 'uhren', durationS: 8 },
          { type: 'key', cell: [2, 3], opens: 'uhren', voice: 'fork' },
          { type: 'transporter', cell: [0, 4], target: { floor: 1, cell: [0, 0] } },
          { type: 'hole', cell: [4, 2], breathing: { offset: 1 } },
          { type: 'gem', cell: [5, 0] },
          { type: 'checkpoint', cell: [0, 7] },
        ],
        start: [0, 0],
        goal: [5, 7],
      },
      {
        // Die helle Uhr: man SIEHT das Glas – und es trägt trotzdem nur einmal.
        size: [5, 5],
        maze: { seed: 551, carve: [...right(0, 0, 4), ...down(4, 0, 4)] },
        elements: [
          { type: 'timedSwitch', cell: [4, 4], opens: 'uhren', durationS: 12 },
          { type: 'transporter', cell: [4, 2], target: { floor: 0, cell: [1, 7] } },
          { type: 'glass', cell: [2, 0] },
          { type: 'glass', cell: [3, 0] },
          { type: 'gem', cell: [0, 4] },
        ],
        start: [0, 0],
        goal: null,
        bright: true,
      },
    ],
  },
  {
    id: 'w5-06',
    name: 'Mühlstein',
    intro:
      'Zwei Steine, die du vor dir herschiebst – mit Schwung, eine Zelle weit. Einer gehört auf die Druckplatte, die die Tür vor dem Ziel hält. Der andere in das Loch, das dir den Weg versperrt. Hör das Mahlen, hör den Schlag: Der Stein sagt dir, wo er steht.',
    parTimeS: 160,
    pingBudget: 4,
    floors: [
      {
        size: [7, 9],
        maze: {
          seed: 560,
          // [1,2] hängt nach dem Zumauern an [1,3] statt am Steinkanal.
          carve: [...right(0, 0, 6), ...down(6, 0, 8), ...down(0, 0, 4), [[1, 2], 's']],
          // Sackgasse unter dem Start: der Steinkanal endet auf der Platte und
          // hat KEINEN Seiteneingang ([0,2] zu) – sonst schiebt man den Stein
          // von der Seite zurück in die Startecke, wo er für immer liegt.
          // Zielkammer [6,8] hat nur den Eingang von oben (Tür auf der Spine).
          add: [[[0, 4], 's'], [[5, 8], 'e'], [[0, 2], 'e']],
        },
        elements: [
          { type: 'boulder', cell: [0, 1] },
          { type: 'plate', cell: [0, 4], opens: 'muehle' },
          { type: 'door', id: 'muehle', edge: [[6, 7], 's'] },
          { type: 'boulder', cell: [6, 3] },
          { type: 'hole', cell: [6, 5] },
          { type: 'gem', cell: [3, 4] },
          { type: 'checkpoint', cell: [6, 0] },
          { type: 'checkpoint', cell: [6, 7] },
        ],
        start: [0, 0],
        goal: [6, 8],
      },
    ],
  },
  {
    id: 'w5-07',
    name: 'Dämmerung',
    intro:
      'Drei Ebenen: hell, dunkel, hell. In der Mitte schläft ein Wächter – dein Ping würde ihn wecken, genau dort, wo du ihn bräuchtest. Sanduhren schenken Zeit, fünf Gems liegen abseits, und ganz unten spielt ein Automat. Die Kampagne endet mit Musik. Beweg dich wie ein Flüstern.',
    parTimeS: 280,
    pingBudget: 4,
    floors: [
      {
        size: [6, 7],
        maze: { seed: 570, carve: [...right(0, 0, 5), ...down(5, 0, 6)] },
        elements: [
          { type: 'hole', cell: [2, 3], breathing: { offset: 0 } },
          { type: 'gem', cell: [0, 5] },
          { type: 'hourglass', cell: [3, 3] },
          { type: 'checkpoint', cell: [5, 3] },
          { type: 'transporter', cell: [5, 6], target: { floor: 1, cell: [0, 0] } },
        ],
        start: [0, 0],
        goal: null,
        bright: true,
      },
      {
        // Die dunkle Mitte: der Schläfer bewacht den Gang zum Gem.
        size: [6, 6],
        maze: { seed: 571, carve: [...right(0, 0, 5), ...down(5, 0, 5), ...right(3, 1, 5)] },
        elements: [
          { type: 'guard', patrol: [[1, 3], [4, 3]], speed: 90, sleeper: { wakeRadius: 260, awakeS: 6 } },
          { type: 'gem', cell: [4, 3] },
          { type: 'gem', cell: [0, 5] },
          { type: 'checkpoint', cell: [5, 2] },
          { type: 'transporter', cell: [5, 5], target: { floor: 2, cell: [0, 0] } },
        ],
        start: [0, 0],
        goal: null,
      },
      {
        size: [6, 7],
        maze: { seed: 572, carve: [...down(0, 0, 6), ...right(6, 0, 5)] },
        elements: [
          { type: 'hole', cell: [3, 2], breathing: { offset: 2 } },
          { type: 'gem', cell: [4, 3] },
          { type: 'gem', cell: [5, 0] },
          { type: 'hourglass', cell: [2, 4] },
          { type: 'checkpoint', cell: [0, 6] },
          { type: 'jukebox', cell: [1, 2], playlist: ['tiltr'] },
        ],
        start: [0, 0],
        goal: [5, 6],
        bright: true,
      },
    ],
  },
];

// Spiegelachsen pro Level, damit Start/Ziel nicht immer oben links/unten
// rechts liegen. Achse passend zum Intro-Text gewählt: 'x' erhält oben/unten,
// 'y' erhält links/rechts ("im oberen Gang" bleibt bei 'x' oben). w1-01
// bleibt ungespiegelt (Text beschreibt links/unten/rechts wörtlich).
const MIRRORS: Record<string, MirrorAxis> = {
  'w1-02': 'x',
  'w1-03': 'x',
  'w1-04': 'xy',
  'w1-05': 'y',
  'w1-06': 'x',
  'w1-07': 'x',
  'w1-08': 'y',
  'w1-09': 'x',
  'w1-10': 'y',
  'w2-01': 'y',
  'w2-02': 'x',
  'w2-03': 'xy',
  'w2-04': 'xy',
  'w2-05': 'x',
  'w2-06': 'y',
  // Welt 3: Intros ohne Richtungsbezug – Achsen frei für die Ecken-Streuung.
  'w3-01': 'x',
  'w3-02': 'y',
  'w3-03': 'xy',
  'w3-04': 'x',
  'w3-05': 'y',
  'w3-06': 'xy',
  // Welt 4: Intros ohne Richtungsbezug – Achsen frei für die Ecken-Streuung.
  'w4-01': 'y',
  'w4-02': 'x',
  'w4-03': 'xy',
  'w4-03k': 'y',
  'w4-04': 'y',
  'w4-05': 'x',
  'w4-06': 'xy',
  // Welt 5: Intros ohne Richtungsbezug – Achsen frei für die Ecken-Streuung.
  'w5-01': 'x',
  'w5-02': 'y',
  'w5-03': 'xy',
  'w5-04': 'x',
  'w5-05': 'y',
  'w5-06': 'xy',
  'w5-07': 'x',
};

const build = (d: unknown): LevelDef => {
  const def = parseLevel(d);
  const axis = MIRRORS[def.id];
  return axis ? mirrorLevel(def, axis) : def;
};

export const WORLDS: Array<{ name: string; levels: LevelDef[] }> = [
  { name: 'Welt 1 – Die Tiefe erwacht', levels: defs.map(build) },
  { name: 'Welt 2 – Zwischen den Ebenen', levels: defs2.map(build) },
  { name: 'Welt 3 – Das Räderwerk', levels: defs3.map(build) },
  { name: 'Welt 4 – Die Stille', levels: defs4.map(build) },
  { name: 'Welt 5 – Trugbild', levels: defs5.map(build) },
];

export const CAMPAIGN_LEVELS: LevelDef[] = WORLDS.flatMap((w) => w.levels);
export const CAMPAIGN_IDS = CAMPAIGN_LEVELS.map((l) => l.id);
