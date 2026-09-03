import { describe, expect, it } from 'vitest';
import { parseLevel } from '../src/levels/schema';
import { boulderProof } from '../src/levels/boulders';
import { cellKey, isShareable, pairReachable, validateLevel } from '../src/levels/validate';

// M74 – „Softlock, der keiner ist": Die Tür zum Schlüssel wird von ZWEI
// Platten gehalten, einer unter dem Rollstein und einer unter Spieler 2.
// Zwei Lücken im Modell haben das als Softlock gemeldet:
//   1. `pairReachable` zählte im Coop JEDE erreichbare Platte als Öffner –
//      auch die, auf der der Spieler SELBST stehen müsste. Damit spazierte
//      das Modell durch die Tür und meldete danach einen Softlock in einem
//      Raum, den man nie betreten kann.
//   2. Ein Stein auf einer Platte war für Paar- und Rollstein-Beweis
//      unsichtbar: Der Rollstein-Beweis verlangte Steine auf ALLEN Platten
//      einer reinen Platten-Tür, obwohl der Partner eine davon hält.

const carveAll = (cols: number, rows: number) => {
  const out: Array<[[number, number], 'e' | 's']> = [];
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      if (x < cols - 1) out.push([[x, y], 'e']);
      if (y < rows - 1) out.push([[x, y], 's']);
    }
  return out;
};
// Reihe 0 gehört Spieler 1, die Reihen darunter Spieler 2 – die Kante
// dazwischen ist zu, also kommt keiner in den Gang des anderen.
const sealRow0 = (cols: number) => [...Array(cols).keys()].map((x) => [[x, 0], 's'] as [[number, number], 's']);

function level(elements: unknown[], size: [number, number] = [5, 3]) {
  return parseLevel({
    id: 'custom-plates',
    name: 'Zwei Platten',
    players: 2,
    mpMode: 'coop',
    floors: [
      {
        size,
        maze: { seed: 11, carve: carveAll(size[0], size[1]), add: sealRow0(size[0]) },
        elements,
        start: [0, 0],
        goal: [size[0] - 1, 0],
        start2: [0, 1],
        goal2: [size[0] - 1, 1],
      },
    ],
  });
}

// Die gemeldete Anordnung: Tür 'tor1' braucht BEIDE Platten ('all'),
// (3,2) hält der Stein, (1,2) hält Spieler 2. Dahinter liegt der Schlüssel
// für 'tor2' – Spieler 1s eigene Tür.
const reported = level([
  { type: 'door', id: 'tor1', edge: [[1, 0], 'e'], require: 'all' },
  { type: 'plate', cell: [3, 2], opens: 'tor1' },
  { type: 'plate', cell: [1, 2], opens: 'tor1' },
  { type: 'boulder', cell: [2, 2] },
  { type: 'key', cell: [2, 0], opens: 'tor2' },
  { type: 'door', id: 'tor2', edge: [[3, 0], 'e'] },
]);

describe('Coop: Platten von Partner und Rollstein (M74)', () => {
  it('das gemeldete Level ist grün und teilbar', () => {
    const rep = validateLevel(reported);
    const red = rep.filter((c) => !c.ok).map((c) => `${c.key}: ${c.detail ?? ''}`);
    expect(red).toEqual([]);
    expect(isShareable(rep)).toBe(true);
  });

  it('der Rollstein-Beweis meldet, welche Platten ein Stein halten kann', () => {
    // Die Steinkenntnis kommt aus dem Lauf von SPIELER 2 – nur er erreicht den
    // Stein; vom Start des ersten Spielers aus ist der Gang unten unerreichbar.
    const fromP2 = boulderProof(reported, reported.floors[0]!.start2);
    expect(fromP2.stonePlates.has(cellKey(0, [3, 2]))).toBe(true);
    expect(boulderProof(reported).stonePlates.size).toBe(0);
  });

  it('zwei Platten an einer all-Tür brauchen zwei Halter (M76)', () => {
    // Der Partner ist EIN Körper: Zwei Platten, die gleichzeitig gehalten
    // werden müssen, kann er nicht besetzen – ohne Stein ist das Level
    // unspielbar, und der Bericht sagt es beim Namen.
    const twoPlates = level([
      { type: 'door', id: 'tor1', edge: [[1, 0], 'e'], require: 'all' },
      { type: 'plate', cell: [1, 2], opens: 'tor1' },
      { type: 'plate', cell: [3, 2], opens: 'tor1' },
    ]);
    const rep = validateLevel(twoPlates);
    expect(rep.find((c) => c.key === 'coop')?.ok).toBe(false);
    const openers = rep.find((c) => c.key === 'openers');
    expect(openers?.ok).toBe(false);
    // Der Bericht sagt, WAS fehlt – und nennt den Ausweg (M77).
    expect(openers?.detail).toContain('2 Platten nur für Füße, 1 Spieler frei');
    expect(openers?.detail).toContain('bleibt offen');
    // Mit einem Rollstein sind es zwei Halter – dann geht die Tür auf.
    const withStone = level([
      { type: 'door', id: 'tor1', edge: [[1, 0], 'e'], require: 'all' },
      { type: 'plate', cell: [1, 2], opens: 'tor1' },
      { type: 'plate', cell: [3, 2], opens: 'tor1' },
      { type: 'boulder', cell: [2, 2] },
    ]);
    expect(validateLevel(withStone).find((c) => c.key === 'coop')?.ok).toBe(true);
  });

  it('eine Platte, auf der man selbst stehen müsste, öffnet die Tür NICHT', () => {
    // Einziger Öffner der Tür ist die Platte im Gang von Spieler 1: Er müsste
    // darauf stehen bleiben und gleichzeitig durch die Tür rollen.
    const own = level([
      { type: 'door', id: 'tor1', edge: [[1, 0], 'e'] },
      { type: 'plate', cell: [0, 0], opens: 'tor1' },
    ]);
    const pair = pairReachable(own, true);
    expect(pair.p1.has(cellKey(0, [4, 0]))).toBe(false);
    expect(validateLevel(own).find((c) => c.key === 'coop')?.ok).toBe(false);
  });

  it('hält der Partner dieselbe Platte, geht die Tür auf', () => {
    const shared = level([
      { type: 'door', id: 'tor1', edge: [[1, 0], 'e'] },
      { type: 'plate', cell: [0, 1], opens: 'tor1' },
    ]);
    const pair = pairReachable(shared, true);
    expect(pair.p1.has(cellKey(0, [4, 0]))).toBe(true);
    expect(validateLevel(shared).find((c) => c.key === 'coop')?.ok).toBe(true);
  });

  it('im Race zählt eine Platte gar nicht – jeder ist allein', () => {
    const shared = level([
      { type: 'door', id: 'tor1', edge: [[1, 0], 'e'] },
      { type: 'plate', cell: [0, 1], opens: 'tor1' },
    ]);
    expect(pairReachable(shared, false).p1.has(cellKey(0, [4, 0]))).toBe(false);
  });
});

// M77 – SEITENWECHSEL: Die Meldung aus dem Levelbau war „hier müssen P1 und P2
// die Seite wechseln, die Schalter liegen daher auf BEIDEN Seiten der Tür" –
// und der Bericht sagte „Öffner vor Tür" rot. Zu Recht, solange die Tür wieder
// zufällt: Wer durchrollt, kann keine Platte halten, also bleibt nur ein
// Halter für zwei Platten. Mit „bleibt offen" ist es lösbar – dann tritt jeder
// auf seine Platte, die Tür rastet ein, und danach tauschen beide die Seite.
// Ein Gang in Reihe 0: alles aufgeschnitten, dann Reihe 0 von Reihe 1
// getrennt – so hängt das Ergebnis nicht am Seed.
const oneRow = (cols: number) => ({
  seed: 3,
  carve: carveAll(cols, 2),
  add: [...Array(cols).keys()].map((x) => [[x, 0], 's'] as [[number, number], 's']),
});

function sideSwap(latch: boolean) {
  return parseLevel({
    id: 'custom-swap',
    name: 'Seitenwechsel',
    players: 2,
    mpMode: 'coop',
    floors: [
      {
        size: [6, 2],
        maze: oneRow(6),
        elements: [
          { type: 'door', id: 'tor', edge: [[2, 0], 'e'], require: 'all', latch },
          { type: 'plate', cell: [1, 0], opens: 'tor' }, // Seite von Spieler 1
          { type: 'plate', cell: [3, 0], opens: 'tor' }, // Seite von Spieler 2
        ],
        start: [0, 0],
        goal: [4, 0],
        start2: [5, 0],
        goal2: [0, 0],
      },
    ],
  });
}

describe('Seitenwechsel an einer Tür mit Platten auf beiden Seiten (M77)', () => {
  it('„bleibt offen": jeder tritt auf seine Platte, danach ist der Weg frei', () => {
    const rep = validateLevel(sideSwap(true));
    const red = rep.filter((c) => !c.ok).map((c) => `${c.key}: ${c.detail ?? ''}`);
    expect(red).toEqual([]);
    expect(isShareable(rep)).toBe(true);
    const pair = pairReachable(sideSwap(true), true);
    expect(pair.p1.has(cellKey(0, [4, 0]))).toBe(true); // Spieler 1 kommt hinüber
    expect(pair.p2.has(cellKey(0, [0, 0]))).toBe(true); // Spieler 2 auch
  });

  it('ohne „bleibt offen" ist dieselbe Anordnung unlösbar – und der Bericht nennt den Ausweg', () => {
    const rep = validateLevel(sideSwap(false));
    expect(rep.find((c) => c.key === 'coop')?.ok).toBe(false);
    const openers = rep.find((c) => c.key === 'openers');
    expect(openers?.ok).toBe(false);
    expect(openers?.detail).toContain('bleibt offen');
    expect(pairReachable(sideSwap(false), true).p1.has(cellKey(0, [4, 0]))).toBe(false);
  });

  it('„bleibt offen" macht auch die EIGENE Platte zum Öffner (M74 gilt nur für Türen, die zufallen)', () => {
    const own = (latch: boolean) =>
      parseLevel({
        id: 'custom-own',
        name: 'Eigene Platte',
        players: 2,
        mpMode: 'coop',
        floors: [
          {
            size: [5, 2],
            maze: oneRow(5),
            elements: [
              { type: 'door', id: 'tor', edge: [[2, 0], 'e'], latch },
              { type: 'plate', cell: [1, 0], opens: 'tor' },
            ],
            start: [0, 0],
            goal: [4, 0],
            start2: [0, 0],
            goal2: [1, 0],
          },
        ],
      });
    // Drauftreten, die Tür rastet ein, wieder runter und durch.
    expect(pairReachable(own(true), true).p1.has(cellKey(0, [4, 0]))).toBe(true);
    // Ohne Latch müsste er gleichzeitig stehen und rollen – der Partner steht
    // hier auf demselben Start, erreicht die Platte also auch: das zählt (M74).
    expect(pairReachable(own(false), true).p1.has(cellKey(0, [4, 0]))).toBe(true);
  });
});

// M78 – EINGERASTET BLEIBT EINGERASTET: Meldung aus dem Levelbau, direkt nach
// M77: „Jetzt ist nur noch ein Softlock da, der nicht stimmt. Die Tür bleibt
// offen." Genau daran lag es – der Softlock-Beweis setzte für JEDE Zelle neu
// an und fragte, ob die Tür von DORT aus zu öffnen ist. Bei einer Tür mit
// „bleibt offen" ist das die falsche Frage: Wer hinter ihr steht, hat sie
// eingerastet, und sie kann nicht wieder zufallen (dieselbe Regel wie
// „gebrochen bleibt gebrochen", M68).
function returnTrip(latch: boolean) {
  return parseLevel({
    id: 'custom-return',
    name: 'Rückweg',
    players: 2,
    mpMode: 'coop',
    floors: [
      {
        size: [7, 2],
        maze: oneRow(7),
        elements: [
          { type: 'door', id: 'tor', edge: [[2, 0], 'e'], require: 'all', latch },
          { type: 'plate', cell: [1, 0], opens: 'tor' }, // Seite von Spieler 1
          { type: 'plate', cell: [3, 0], opens: 'tor' }, // Seite von Spieler 2
        ],
        start: [0, 0],
        goal: [2, 0], // Spieler 1 muss NICHT hinüber – kann aber
        start2: [6, 0],
        goal2: [4, 0],
      },
    ],
  });
}

describe('Softlock hinter einer Tür, die offen bleibt (M78)', () => {
  it('kein Softlock: von jenseits der Tür führt der Rückweg durch dieselbe (eingerastete) Tür', () => {
    const rep = validateLevel(returnTrip(true));
    expect(rep.find((c) => c.key === 'softlock')?.ok).toBe(true);
    expect(rep.filter((c) => !c.ok).map((c) => c.key)).toEqual([]);
    // Der Beweis rechnet die Tür ab der Zelle als offen: Spieler 1 steht
    // hinter ihr und erreicht sein Ziel davor trotzdem.
    const far = cellKey(0, [5, 0]);
    expect(pairReachable(returnTrip(true), true).p1.has(far)).toBe(true);
    expect(pairReachable(returnTrip(true), true, new Set(), { p1: { floor: 0, cell: [5, 0] } }, {}, new Set(), new Set(['tor'])).p1.has(cellKey(0, [2, 0]))).toBe(true);
  });

  it('ohne „bleibt offen" geht dieselbe Tür nie auf – dann steckt auch niemand dahinter', () => {
    // Kein Softlock, aber aus dem anderen Grund: Zwei Platten und ein freier
    // Spieler heißt, die Tür bleibt zu (M77) – hinüber kommt niemand, also
    // sitzt auch niemand fest. Rot ist hier der Öffner-Check.
    const rep = validateLevel(returnTrip(false));
    expect(rep.find((c) => c.key === 'softlock')?.ok).toBe(true);
    expect(rep.find((c) => c.key === 'openers')?.ok).toBe(false);
    expect(pairReachable(returnTrip(false), true).p1.has(cellKey(0, [5, 0]))).toBe(false);
  });

  it('die Einrast-Annahme gilt NUR für die Tür – ein echter Riegel bleibt rot', () => {
    // Gegenprobe zum Gummistempel: Dasselbe Level plus Transporter in eine
    // Ebene ohne Rückweg. Die latchende Tür ändert daran nichts.
    const trap = parseLevel({
      id: 'custom-trap',
      name: 'Falle',
      players: 2,
      mpMode: 'coop',
      floors: [
        {
          size: [7, 2],
          maze: oneRow(7),
          elements: [
            { type: 'door', id: 'tor', edge: [[2, 0], 'e'], require: 'all', latch: true },
            { type: 'plate', cell: [1, 0], opens: 'tor' },
            { type: 'plate', cell: [3, 0], opens: 'tor' },
            { type: 'transporter', cell: [5, 0], target: { floor: 1, cell: [0, 0] } },
          ],
          start: [0, 0],
          goal: [2, 0],
          start2: [6, 0],
          goal2: [4, 0],
        },
        { size: [2, 2], maze: { seed: 5 }, elements: [], start: [0, 0], goal: null },
      ],
    });
    const rep = validateLevel(trap);
    expect(rep.find((c) => c.key === 'softlock')?.ok).toBe(false);
  });
});

// M79 – DER SOFTLOCK SAGT, WER IHN VERURSACHT: Meldung aus dem Levelbau
// („er denkt, ein Horcher ist im Weg, der aber weggelockt werden kann") –
// der Bericht nannte nur die ZELLE, und wer dort einen Horcher stehen sieht,
// hält den für den Riegel. Horcher und Wächter kommen in diesem Beweis gar
// nicht vor; gerechnet wird mit Wänden, Türen, Strömungen und Transportern.
// Also nennt der Bericht den Übeltäter.
describe('Softlock-Bericht nennt den Grund (M79)', () => {
  it('Tür, die hinter dir zufällt: der Bericht nennt sie beim Namen', () => {
    const rep = validateLevel(returnTrip(false /* kein latch */));
    // Ohne latch geht diese Tür nie auf – für den GRUND-Test braucht es eine,
    // die aufgeht und wieder zufällt: eine Platte, die der Partner hält.
    expect(rep.find((c) => c.key === 'softlock')?.ok).toBe(true);
    const oneWay = parseLevel({
      id: 'custom-shut',
      name: 'Zufallende Tür',
      players: 2,
      mpMode: 'coop',
      floors: [
        {
          size: [6, 2],
          maze: oneRow(6),
          elements: [
            { type: 'door', id: 'tor', edge: [[2, 0], 'e'] },
            // Die Platte liegt HINTER der Tür: Spieler 2 hält sie, Spieler 1
            // rollt durch – und steht dann auf der falschen Seite, wenn sein
            // Ziel davor liegt und der Partner losgeht.
            { type: 'plate', cell: [4, 0], opens: 'tor' },
            { type: 'current', cell: [3, 0], dir: 'e', force: 3400 },
          ],
          start: [0, 0],
          goal: [1, 0],
          start2: [5, 0],
          goal2: [4, 0],
        },
      ],
    });
    const sl = validateLevel(oneWay).find((c) => c.key === 'softlock');
    expect(sl?.ok).toBe(false);
    expect(sl?.detail).toMatch(/Tür tor fällt hinter dir zu|kein Rückweg|Ebene/);
  });

  it('Transporter ohne Rückweg: der Bericht nennt die Ebene', () => {
    const trap = parseLevel({
      id: 'custom-oneway',
      name: 'Einbahn-Transporter',
      floors: [
        {
          size: [4, 2],
          maze: oneRow(4),
          elements: [{ type: 'transporter', cell: [2, 0], target: { floor: 1, cell: [0, 0] } }],
          start: [0, 0],
          goal: [3, 0],
        },
        { size: [2, 2], maze: { seed: 5 }, elements: [], start: [0, 0], goal: null },
      ],
    });
    const sl = validateLevel(trap).find((c) => c.key === 'softlock');
    expect(sl?.ok).toBe(false);
    expect(sl?.detail).toContain('von Ebene 2 führt kein Weg zurück');
  });
});
