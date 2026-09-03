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
    expect(openers?.detail).toContain('2 Platten gleichzeitig, 1 Halter');
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
