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

// DIE REIHENFOLGE IST DIE LEHRREIHE, DIE ID IST EIN SCHLÜSSEL (M93): Das
// MP-Panel listet die Level in ARRAY-Ordnung und nummeriert sie dabei; die ID
// steht nirgends im Bild, sie identifiziert nur (der Gast holt das Level daraus
// aus seinem Pool). Deshalb stehen die drei Level aus M93 dort, wo sie
// unterrichten – „Wegzeichen" vor „Gleichschritt" –, und nicht dort, wo ihre
// Nummer hinwiese. Die Reihe: sechs Platten-Level (das Handwerk), dann
// markieren (M89), gemeinsam ankommen (M90), Einklang (M91), Quinte, und
// zuletzt die Ansage auf der halbhellen Ebene (M92).
const coopDefs: unknown[] = [
  // Muster aller Coop-Level: Türen verschließen VERSIEGELTE Kammern (einziger
  // Eingang). Jede Tür hat eine Platte außen und eine innen (Selbstbefreiung,
  // kein Aussperren möglich); die Platte in der Zielkammer hält der Partner,
  // der schon im Ziel liegt. tests/multiplayer.test.ts beweist alle drei
  // Invarianten pro Tür. Zwei Ausnahmen bestätigen die Regel: „Gleichschritt"
  // (M90) hat gar keine Tür – die Aufgabe ist die Gleichzeitigkeit –, und die
  // Duett-Tore rasten ein („bleibt offen"), weshalb dort keine Innenplatte
  // nötig ist (eine Tür, die nicht zufällt, sperrt niemanden aus).
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
  {
    id: 'coop-06',
    name: 'Expedition',
    intro:
      'Die große Expedition: ein Marsch über mehr als einen Bildschirm. Einer hält am Start die Platte der fernen Zieltür – der andere wagt die weite Reise. Und wer im Ziel liegt, hält die Tür für den Zweiten.',
    pingBudget: 5,
    floors: [
      {
        // Multi-Screen-Coop (10x12): Muster von "Fernwirkung", nur weit –
        // Zielkammer versiegelt (Tür = einziger Eingang, add-Wand im Westen).
        size: [10, 12],
        maze: {
          seed: 307,
          carve: [...right(0, 0, 9), ...down(9, 0, 11)],
          add: [[[8, 11], 'e']],
        },
        elements: [
          { type: 'door', id: 'g1', edge: [[9, 10], 's'] },
          { type: 'plate', cell: [1, 0], opens: 'g1' },
          { type: 'plate', cell: [9, 11], opens: 'g1' },
          { type: 'guard', patrol: [[3, 0], [6, 0]], speed: 75 },
          { type: 'hole', cell: [4, 0], breathing: { offset: 0 } },
          { type: 'hole', cell: [9, 4], breathing: { offset: 2 } },
          { type: 'windZone', cell: [9, 7], dir: 'n' },
          { type: 'checkpoint', cell: [9, 0] },
          { type: 'checkpoint', cell: [9, 8] },
        ],
        start: [0, 0],
        goal: [9, 11],
      },
    ],
  },
  {
    // WEGZEICHEN (M93): Das Kapitel-Level für die Klangbojen (M89). Zwischen
    // Halle und Ziel liegt ein OFFENES Feld – acht Löcher, kein Echo, das
    // einem die Lücke verrät (ein Ping zeigt Wände, und hier sind keine).
    // Beide müssen hindurch, und zwar NACHEINANDER: einer hält die Platte in
    // der Nische, der andere rollt ins Ziel und hält von dort. Wer den Weg
    // zuerst findet, legt Marken – sie ticken für BEIDE, und der Zweite muss
    // nicht suchen, sondern nur hören.
    id: 'coop-09',
    name: 'Wegzeichen',
    intro:
      'Zwischen euch und dem Ziel liegt ein offenes Feld voller Löcher. Ein Ping hilft kaum – er zeigt Wände, und hier sind keine. Wer eine Lücke findet, legt eine Wegmarke (📍 im HUD): Die ticken für BEIDE, schneller je näher. Markiert die Lücken, dann muss der Zweite den Weg nicht suchen, sondern nur hören.',
    players: 2,
    mpMode: 'coop',
    marks: 4,
    pingBudget: 4,
    floors: [
      {
        size: [8, 7],
        maze: {
          seed: 331,
          carve: [
            ...right(0, 0, 7),
            [[0, 0], 's'],
            // Das Feld: Reihen 1–4 in beide Richtungen offen.
            ...right(1, 0, 7),
            ...right(2, 0, 7),
            ...right(3, 0, 7),
            ...right(4, 0, 7),
            ...down(0, 1, 4),
            ...down(1, 1, 4),
            ...down(2, 1, 4),
            ...down(3, 1, 4),
            ...down(4, 1, 4),
            ...down(5, 1, 4),
            ...down(6, 1, 4),
            ...down(7, 1, 4),
            [[0, 4], 's'],
            ...right(5, 0, 7),
            [[2, 5], 's'],
          ],
          // Platten-Nische [2,6] ist eine Sackgasse, die Zielkammer [7,6]
          // versiegelt: die Tür ist ihr einziger Eingang.
          add: [[[1, 6], 'e'], [[2, 6], 'e'], [[6, 6], 'e']],
        },
        elements: [
          { type: 'door', id: 'gz', edge: [[7, 5], 's'] },
          { type: 'plate', cell: [2, 6], opens: 'gz' },
          { type: 'plate', cell: [7, 6], opens: 'gz' },
          // Zwei versetzte Reihen: die Lücke der einen liegt über der anderen,
          // also führt der Weg quer durch das Feld – nicht gerade hindurch.
          { type: 'hole', cell: [0, 2] },
          { type: 'hole', cell: [1, 2] },
          { type: 'hole', cell: [2, 2] },
          { type: 'hole', cell: [3, 2] },
          { type: 'hole', cell: [4, 4] },
          { type: 'hole', cell: [5, 4] },
          { type: 'hole', cell: [6, 4] },
          { type: 'hole', cell: [7, 4] },
          { type: 'checkpoint', cell: [0, 1] },
          { type: 'checkpoint', cell: [0, 5] },
        ],
        start: [0, 0],
        goal: [7, 6],
      },
    ],
  },
  {
    // GEMEINSAM ANKOMMEN (M90): Das erste Coop-Level, das keine Tür hat – die
    // Aufgabe ist die Gleichzeitigkeit. Ein Ring mit zwei Zielen in den oberen
    // Ecken: Beide starten unten in der Mitte, trennen sich, und gewonnen ist
    // erst, wenn BEIDE in ihrer Zielzone liegen. Wer zuerst da ist, wartet –
    // und der Nachzügler hört das (Ruf + Chip „◎ Partner wartet").
    // Symmetrisch gebaut, damit niemand die längere Strecke bekommt.
    id: 'coop-07',
    name: 'Gleichschritt',
    intro:
      'Zwei Ziele, ein Ring: Einer rollt links herum, einer rechts. Gewonnen habt ihr erst, wenn ihr GLEICHZEITIG in euren Zielzonen liegt – wer zuerst ankommt, wartet, und der Nachzügler hört das Rufen. Verabredet euch!',
    players: 2,
    mpMode: 'coop',
    together: true,
    pingBudget: 4,
    floors: [
      {
        size: [9, 9],
        maze: {
          seed: 308,
          // Der Ring: unten quer, beide Seitenspalten hoch, oben quer zurück.
          carve: [...right(8, 0, 8), ...down(0, 0, 8), ...down(8, 0, 8), ...right(0, 0, 8)],
        },
        elements: [
          // Je Arm ein atmendes Loch an derselben Höhe und mit derselben Phase –
          // beide warten auf denselben Takt, das ist der halbe Gleichschritt.
          { type: 'hole', cell: [0, 4], breathing: { offset: 0 } },
          { type: 'hole', cell: [8, 4], breathing: { offset: 0 } },
          { type: 'checkpoint', cell: [0, 8] },
          { type: 'checkpoint', cell: [8, 8] },
        ],
        start: [4, 8],
        goal: [0, 0],
        goal2: [8, 0],
      },
    ],
  },
  {
    // DUETT (M91): das Flaggschiff des Coop-Ausbaus – ein Tor, das nur ein
    // DUETT öffnet. Zwei Resonanzfelder in Sackgassen-Nischen (beide AUSSEN,
    // denn gestimmt wird vor dem Tor, nicht dahinter), die Zieltür mit
    // „alle Öffner" + „bleibt offen": Beide dürfen beim Öffnen stehen, danach
    // rollen sie los – ohne `latch` hätte niemand mehr einen Fuß frei
    // (M76/M77, das meldet der Beweis von selbst).
    // EINKLANG, NICHT QUINTE (M93, aus dem Spieltest): Das ERSTE Duett lehrt
    // sich selbst nur im Einklang – zwei fast gleiche Töne SCHWEBEN, und die
    // Schwebung wird hörbar langsamer, bis sie steht. Eine Quinte schwebt
    // nicht; sie klingt bloß rein, und das beurteilt ein ungeübtes Ohr kaum
    // (deshalb gibt es den Führungston, v3.25.4). Die Quinte bekommt ihr
    // eigenes Level danach (coop-10).
    id: 'coop-08',
    name: 'Duett',
    intro:
      'Zwei Nischen, zwei Resonanzfelder – und ein Tor, das nur ein DUETT öffnet. Rollt je auf ein Feld: Die Schale hält euch, und die Neigungsrichtung stimmt euren Ton – kurz antippen genügt, er bleibt dann stehen. Gesucht ist DERSELBE Ton: Je näher ihr kommt, desto langsamer schwebt es zwischen euren Tönen, bis es still steht. Dann schwingt das Tor auf und bleibt offen – danach zählt nur, dass ihr BEIDE ins Ziel kommt.',
    players: 2,
    mpMode: 'coop',
    pingBudget: 4,
    floors: [
      {
        size: [7, 7],
        maze: {
          seed: 321,
          carve: [...right(0, 0, 6), ...down(6, 0, 6), [[2, 0], 's'], [[4, 0], 's']],
          // Die Nischen sind Sackgassen (nur von oben), die Zielkammer ist
          // versiegelt: die Tür ist ihr einziger Eingang.
          add: [
            [[1, 1], 'e'],
            [[2, 1], 'e'],
            [[2, 1], 's'],
            [[3, 1], 'e'],
            [[4, 1], 'e'],
            [[4, 1], 's'],
            [[5, 6], 'e'],
          ],
        },
        elements: [
          { type: 'door', id: 'gz', edge: [[6, 5], 's'], require: 'all', latch: true },
          { type: 'plate', cell: [2, 1], opens: 'gz', tune: 'unison' },
          { type: 'plate', cell: [4, 1], opens: 'gz', tune: 'unison' },
          { type: 'checkpoint', cell: [6, 0] },
        ],
        start: [0, 0],
        goal: [6, 6],
      },
    ],
  },
  {
    // REINE QUINTE (M93): das zweite Duett – und das erste mit einem
    // INTERVALL. Beim Einklang hört man die Schwebung selbst langsamer werden;
    // eine Quinte SCHWEBT NICHT, sie klingt nur rein. Deshalb spielt das Spiel
    // hier den Führungston mit (v3.25.4): den Ton, den ICH treffen müsste –
    // der schwebt gegen meinen eigenen, bis er steht. Die Nischen liegen
    // weiter auseinander als im „Duett", damit sein Ton hörbar von SEINEM Feld
    // kommt und nicht aus derselben Ecke.
    id: 'coop-10',
    name: 'Reine Quinte',
    intro:
      'Wieder zwei Felder – diesmal ist die QUINTE gesucht, ein Abstand statt eines Gleichklangs. Achtung: Eine Quinte schwebt nicht, sie klingt nur rein. Hört auf den leisen Führungston: Das ist der Ton, den DU treffen musst, und er schwebt gegen deinen, bis er still steht. Der Grundton liegt am einen Ende der Neigung, die Oktave am anderen – die Quinte dazwischen.',
    players: 2,
    mpMode: 'coop',
    pingBudget: 4,
    floors: [
      {
        size: [8, 8],
        maze: {
          seed: 341,
          carve: [...right(0, 0, 7), ...down(7, 0, 7), [[1, 0], 's'], [[6, 0], 's']],
          // Zwei Sackgassen-Nischen (nur von oben) und eine versiegelte
          // Zielkammer: die Tür ist ihr einziger Eingang.
          add: [
            [[0, 1], 'e'],
            [[1, 1], 'e'],
            [[1, 1], 's'],
            [[5, 1], 'e'],
            [[6, 1], 'e'],
            [[6, 1], 's'],
            [[6, 7], 'e'],
          ],
        },
        elements: [
          { type: 'door', id: 'gz', edge: [[7, 6], 's'], require: 'all', latch: true },
          { type: 'plate', cell: [1, 1], opens: 'gz', tune: 'fifth' },
          { type: 'plate', cell: [6, 1], opens: 'gz', tune: 'fifth' },
          { type: 'checkpoint', cell: [7, 0] },
        ],
        start: [0, 0],
        goal: [7, 7],
      },
    ],
  },
  {
    // ANSAGE (M93): das Kapitel-Finale und das Level, für das es die
    // Licht-je-Spieler-Ebene gibt (M92). Für Spieler 1 ist die Ebene HELL – er
    // sieht das Labyrinth, die atmenden Löcher und (im Coop auf heller Ebene,
    // M62) die Kugel des Partners. Spieler 2 sieht nichts und muss durch einen
    // GESCHLOSSENEN Gang, dessen Boden atmet, zur Platte. Der Sehende sagt an –
    // mit Worten oder mit Wegmarken; er hängt dabei selbst an der Platte, denn
    // ohne sie geht seine Zieltür nicht auf. Das ist die Umkehrung des
    // Gewohnten: Der Blinde tut die Arbeit, der Sehende trägt die Verantwortung.
    id: 'coop-11',
    name: 'Ansage',
    intro:
      'Für einen von euch ist diese Ebene HELL: Er sieht das Labyrinth, den atmenden Boden und die Kugel des anderen. Der andere sieht nichts – und muss genau da hindurch. Sagt an! Mit Worten oder mit Wegmarken (📍). Erst wenn die Platte am Ende des Gangs gehalten wird, öffnet sich die Zielkammer.',
    players: 2,
    mpMode: 'coop',
    marks: 4,
    pingBudget: 4,
    floors: [
      {
        size: [8, 6],
        bright: true,
        brightPlayer: 1,
        maze: {
          seed: 351,
          carve: [...right(0, 0, 7), ...down(7, 0, 5), ...right(5, 0, 7), [[4, 0], 's']],
          add: [
            // Der untere Gang ist GESCHLOSSEN: nur über [7,5] hinein, also
            // führt jeder Weg zur Platte über die atmenden Löcher.
            [[0, 4], 's'],
            [[1, 4], 's'],
            [[2, 4], 's'],
            [[3, 4], 's'],
            [[4, 4], 's'],
            [[5, 4], 's'],
            [[6, 4], 's'],
            // Zielkammer [4,1]: versiegelt, die Tür ist der einzige Eingang.
            [[3, 1], 'e'],
            [[4, 1], 'e'],
            [[4, 1], 's'],
          ],
        },
        elements: [
          { type: 'door', id: 'gz', edge: [[4, 0], 's'] },
          { type: 'plate', cell: [0, 5], opens: 'gz' },
          { type: 'plate', cell: [4, 1], opens: 'gz' },
          { type: 'hole', cell: [5, 5], breathing: { offset: 0 } },
          { type: 'hole', cell: [2, 5], breathing: { offset: 2.2 } },
          { type: 'checkpoint', cell: [7, 5] },
        ],
        start: [0, 0],
        start2: [7, 0],
        goal: [4, 1],
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
  {
    id: 'race-06',
    name: 'Marathon',
    intro:
      'Der Marathon: die längste Strecke im Spiel – mehrere Bildschirme weit. Teile dir die Pings ein und lass dich von den Wachen nicht zurückwerfen.',
    pingBudget: 4,
    floors: [
      {
        size: [12, 16],
        maze: { seed: 316, carve: [...down(0, 0, 15), ...right(15, 0, 11)], brittleChance: 0.15 },
        elements: [
          { type: 'guard', patrol: [[0, 6], [0, 10]], speed: 80 },
          { type: 'guard', patrol: [[2, 15], [6, 15]], speed: 95 },
          { type: 'hole', cell: [0, 3], breathing: { offset: 0 } },
          { type: 'hole', cell: [0, 8], breathing: { offset: 1.5 } },
          { type: 'hole', cell: [0, 12], breathing: { offset: 3 } },
          { type: 'hole', cell: [4, 15], breathing: { offset: 4.5 } },
          { type: 'hole', cell: [8, 15], breathing: { offset: 2 } },
          { type: 'windZone', cell: [0, 5], dir: 'n' },
          { type: 'windZone', cell: [9, 15], dir: 'w' },
          { type: 'checkpoint', cell: [0, 5] },
          { type: 'checkpoint', cell: [0, 11] },
          { type: 'checkpoint', cell: [5, 15] },
        ],
        start: [0, 0],
        goal: [11, 15],
      },
    ],
  },
];

// Spiegelachsen: Startecken variieren (coop-01 bleibt ungespiegelt – das
// Einstiegslevel, auf dessen Choreografie auch der Multiplayer-E2E fußt).
// 'x' erhält oben/unten in den Intro-Texten ("ganz oben am Start").
const MIRRORS: Record<string, MirrorAxis> = {
  // Die drei Kapitel-Level (M93) spiegeln in drei verschiedene Ecken; ihre
  // Intros nennen keine Richtungen im Labyrinth.
  'coop-09': 'y',
  'coop-10': 'x',
  'coop-11': 'xy',
  // 'xy': Der Start wandert nach unten rechts – der Intro-Text von „Duett"
  // nennt keine Richtungen, also darf gespiegelt werden.
  'coop-08': 'xy',
  'coop-02': 'y',
  'coop-03': 'x',
  'coop-04': 'xy',
  'coop-05': 'x',
  'race-01': 'y',
  'race-02': 'xy',
  'race-03': 'y',
  'race-04': 'x',
  'race-05': 'xy',
  'race-06': 'x',
  'coop-06': 'xy',
};

const build = (d: unknown): LevelDef => {
  const def = parseLevel(d);
  const axis = MIRRORS[def.id];
  return axis ? mirrorLevel(def, axis) : def;
};

export const COOP_LEVELS: LevelDef[] = coopDefs.map(build);
export const RACE_LEVELS: LevelDef[] = raceDefs.map(build);
