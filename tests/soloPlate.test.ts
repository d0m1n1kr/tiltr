import { describe, expect, it } from 'vitest';
import { parseLevel } from '../src/levels/schema';
import { validateLevel } from '../src/levels/validate';

// DRUCKPLATTE IM SOLO (M95): Allein kann niemand auf der Platte stehen UND
// gleichzeitig durch die Tür rollen (M74 ohne Partner). Lösbar wird sie
// trotzdem – auf zwei Wegen, und genau die beiden rechnet das Modell:
//   1. ein ROLLSTEIN hält sie dauerhaft (`plate.boulder`),
//   2. die Tür hat „bleibt offen" – sie rastet beim Draufrollen ein.
// Vorher zählte eine Platte im Solo einfach als erreichbarer Öffner: Das Level
// war GRÜN und unspielbar, und deshalb versteckte der Editor die Platte.
describe('Druckplatte im Solo (M95)', () => {
  // Ein GANG in Reihe 0 (die Reihe darunter ist abgemauert und leer): Start
  // links, Ziel rechts, die Tür kurz davor. Die Platte steht im Gang – wo
  // genau, sagt der Test.
  const level = (elements: unknown[], size: [number, number] = [5, 2]) =>
    parseLevel({
      id: 'custom-solo-plate',
      name: 'Solo mit Platte',
      floors: [
        {
          size,
          maze: {
            seed: 3,
            carve: [...Array(size[0] - 1).keys()].map((x) => [[x, 0], 'e']),
            add: [...Array(size[0]).keys()].map((x) => [[x, 0], 's']),
          },
          elements,
          start: [0, 0],
          goal: [size[0] - 1, 0],
        },
      ],
    });
  const red = (def: ReturnType<typeof parseLevel>) =>
    validateLevel(def)
      .filter((c) => !c.ok)
      .map((c) => c.key);

  it('Platte ohne Stein und ohne „bleibt offen": das Ziel gilt als UNERREICHBAR', () => {
    const def = level([
      { type: 'door', id: 'g1', edge: [[3, 0], 'e'] },
      { type: 'plate', cell: [1, 0], opens: 'g1' },
    ]);
    expect(red(def)).toContain('goal');
  });

  it('mit „bleibt offen" rastet sie beim Draufrollen ein – lösbar', () => {
    const def = level([
      { type: 'door', id: 'g1', edge: [[3, 0], 'e'], latch: true },
      { type: 'plate', cell: [1, 0], opens: 'g1' },
    ]);
    expect(red(def)).toEqual([]);
  });

  // Für den Stein braucht es eine NISCHE: In einem ein Zelle breiten Gang
  // versperrt der Stein auf der Platte den Weg (das Modell weiß das – die
  // erste Fassung dieses Tests war deshalb zu Recht rot). Und die Wände
  // stehen hier EXAKT: Jede innere Kante ist entweder gecarvt oder gemauert,
  // sonst würfelt der Seed einen Umweg um die Tür herum (auch das ist beim
  // Schreiben passiert).
  const exact = (open: string[], elements: unknown[], size: [number, number] = [6, 3]) => {
    const [cols, rows] = size;
    const carve: Array<[[number, number], 'e' | 's']> = [];
    const add: Array<[[number, number], 'e' | 's']> = [];
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        if (x < cols - 1) (open.includes(`${x},${y},e`) ? carve : add).push([[x, y], 'e']);
        if (y < rows - 1) (open.includes(`${x},${y},s`) ? carve : add).push([[x, y], 's']);
      }
    return parseLevel({
      id: 'custom-solo-stone',
      name: 'Solo mit Stein',
      floors: [{ size, maze: { seed: 3, carve, add }, elements, start: [0, 1], goal: [cols - 1, 1] }],
    });
  };

  it('mit einem ROLLSTEIN, den man in die Nische auf die Platte schiebt – lösbar', () => {
    // Der Ball geht OBEN herum und stößt den Stein von [2,0] nach unten in die
    // Nische; danach ist der Gang frei und die Tür offen.
    //   Reihe 0  . . .            (Weg nach oben und nach rechts)
    //   Reihe 1  S # ▣ . . D G    (# = Wand, der Gang beginnt erst am Stein)
    //   Reihe 2      P            (Nische mit der Platte)
    const def = exact(
      ['0,0,s', '0,0,e', '1,0,e', '2,0,s', '2,1,e', '3,1,e', '4,1,e', '2,1,s'],
      [
        { type: 'door', id: 'g1', edge: [[4, 1], 'e'] },
        { type: 'boulder', cell: [2, 1] },
        { type: 'plate', cell: [2, 2], opens: 'g1' },
      ],
    );
    expect(red(def)).toEqual([]);
  });

  it('… aber nur, wenn der Stein die Platte auch erreichen kann', () => {
    // Derselbe Gang, aber der Stein steht NEBEN der Nische: Von links gestoßen
    // rollt er an ihr vorbei bis vor die Tür, und niemand bekommt ihn hinein.
    const def = exact(
      ['0,1,e', '1,1,e', '2,1,e', '3,1,e', '4,1,e', '2,1,s'],
      [
        { type: 'door', id: 'g1', edge: [[4, 1], 'e'] },
        { type: 'boulder', cell: [3, 1] },
        { type: 'plate', cell: [2, 2], opens: 'g1' },
      ],
    );
    expect(red(def)).toContain('goal');
  });

  it('eine „alle Öffner"-Tür aus Schlüssel UND Platte geht nicht mit dem Schlüssel allein auf', () => {
    // Die tote Platte darf nicht aus der Bedingung verschwinden – sonst wäre
    // die Tür plötzlich eine reine Schlüssel-Tür.
    const def = level(
      [
        { type: 'door', id: 'g1', edge: [[4, 0], 'e'], require: 'all' },
        { type: 'key', cell: [1, 0], opens: 'g1' },
        { type: 'plate', cell: [2, 0], opens: 'g1' },
      ],
      [6, 2],
    );
    expect(red(def)).toContain('goal');
  });
});
