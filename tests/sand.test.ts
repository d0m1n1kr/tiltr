// SAND (M103): der zähe Untergrund – das Gegenstück zum Eis. Gewünscht als
// „langsam, anderes Rollgeräusch, Farbe".
//
// Geprüft wird die einzige Aussage, die das Modell wirklich macht: Die
// ENDGESCHWINDIGKEIT ist gedeckelt (`accel / sandFriction`), gelenkt wird
// weiter voll, und für die Lösbarkeit ist Sand kein Riegel – wie Eis. Die
// Grenze zwischen Eis und Sand ist dabei EINDEUTIG, sonst hinge das Verhalten
// an der Reihenfolge zweier Listen.
import { describe, expect, it } from 'vitest';
import { Ball, World } from '../src/core/physics';
import { parseLevel } from '../src/levels/schema';
import { loadLevel } from '../src/levels/loader';
import { validateLevel } from '../src/levels/validate';
import { levelFeatures } from '../src/levels/firstAppearances';
import { needsFor, canDo, FEATURES } from '../src/core/features';

/** Freies Feld, damit keine Wand die Messung stört. */
const world = (): World => new World([], new Ball(500, 500, 22), { x: 4000, y: 4000, r: 30 });

/** Ein Gang von vier Zellen mit Sand in der Mitte – dieselbe Bauform wie im
 *  Zehrfeld-Test: eine Zeile, Süd zugemauert. */
const sandLevel = (id: string) =>
  parseLevel({
    id,
    name: 'Sand',
    floors: [
      {
        size: [4, 2],
        maze: {
          seed: 3,
          carve: [0, 1, 2].map((x) => [[x, 0], 'e']),
          add: [0, 1, 2, 3].map((x) => [[x, 0], 's']),
        },
        elements: [{ type: 'sand', cell: [2, 0] }],
        start: [0, 0],
        goal: [3, 0],
      },
    ],
  });

/** Volle Neigung nach rechts, `s` Sekunden lang – gibt das Endtempo zurück. */
const roll = (w: World, s: number): number => {
  for (let i = 0; i < Math.round(s * 60); i++) w.step(1 / 60, { x: 1, y: 0 });
  return w.ball.speed;
};

describe('Sandfeld (M103)', () => {
  it('erkennt den Ball auf dem Feld – und daneben nicht', () => {
    const w = world();
    w.sand.push({ x: 400, y: 400, w: 200, h: 200 });
    expect(w.onSand()).toBe(true);
    w.ball.x = 700;
    expect(w.onSand()).toBe(false);
  });

  it('deckelt das Tempo auf rund die Hälfte – accel / sandFriction', () => {
    const stone = world();
    const stoneSpeed = roll(stone, 3);
    const sand = world();
    // Ein Feld, das die ganze Messstrecke abdeckt: es geht um den Untergrund,
    // nicht um die Kante.
    sand.sand.push({ x: 0, y: 0, w: 100000, h: 100000 });
    const sandSpeed = roll(sand, 3);
    expect(stoneSpeed).toBeCloseTo(stone.maxSpeed, 0);
    // Die Schrittrechnung landet ein paar Prozent unter dem stetigen Wert –
    // geprüft wird die AUSSAGE (das Gleichgewicht aus accel und sandFriction),
    // nicht die dritte Stelle.
    const cap = sand.accel / sand.sandFriction;
    expect(sandSpeed).toBeGreaterThan(cap * 0.94);
    expect(sandSpeed).toBeLessThan(cap * 1.02);
    expect(sandSpeed).toBeLessThan(stoneSpeed * 0.65);
    // „Langsam" heißt gedeckelt, nicht stehengeblieben – wer neigt, rollt.
    expect(sandSpeed).toBeGreaterThan(300);
  });

  it('lenkt weiter voll: quer aus voller Fahrt heraus geht sofort', () => {
    const w = world();
    w.sand.push({ x: 0, y: 0, w: 100000, h: 100000 });
    roll(w, 3);
    const vx0 = w.ball.vx;
    for (let i = 0; i < 30; i++) w.step(1 / 60, { x: 0, y: 1 });
    // In einer halben Sekunde quer ist die neue Achse schon die stärkere.
    expect(w.ball.vy).toBeGreaterThan(Math.abs(vx0) * 0.5);
  });

  it('Sand sticht Eis: liegt beides in einer Zelle, gilt Sand', () => {
    const w = world();
    w.sand.push({ x: 0, y: 0, w: 100000, h: 100000 });
    w.ice.push({ x: 0, y: 0, w: 100000, h: 100000 });
    expect(w.onSand()).toBe(true);
    expect(roll(w, 3)).toBeLessThan((w.accel / w.sandFriction) * 1.02);
  });

  it('lädt aus der Def und ist für die Lösbarkeit KEIN Riegel', () => {
    const def = sandLevel('sand-t');
    const loaded = loadLevel(def);
    expect(loaded.floors[0]!.world.sand).toHaveLength(1);
    const rep = validateLevel(def);
    expect(rep.find((r) => r.key === 'goal')?.ok).toBe(true);
    expect(rep.every((r) => r.ok)).toBe(true);
  });

  it('zählt als Merkmal und hängt am Merkmals-Gate', () => {
    const def = sandLevel('sand-f');
    expect(levelFeatures(def).has('sand')).toBe(true);
    const needs = needsFor(0, false, false, false, false, true);
    expect(needs).toContain('sand');
    expect(canDo(needs, FEATURES)).toBe(true);
    // Eine Fassung vor 3.39 kennt das Element nicht – das gehört gemeldet.
    expect(canDo(needs, ['marks', 'together', 'duet', 'multiOpens', 'drain'])).toBe(false);
  });
});
