import { describe, expect, it } from 'vitest';
import { parseLevel } from '../src/levels/schema';
import { goalCellFor, loadLevel, startCellFor } from '../src/levels/loader';
import { isShareable, pairReachable, pathSteps, validateLevel, cellKey } from '../src/levels/validate';
import { mirrorLevel } from '../src/levels/mirror';
import { removeFloor, type RawLevel } from '../src/ui/editor';
import { COOP_LEVELS } from '../src/levels/multiplayer';
import { CELL } from '../src/core/constants';

// Zwei-Spieler-Level aus dem Editor (M57): Host = Spieler 1 (start/goal),
// Gast = Spieler 2 (start2/goal2, sonst dieselben). Das Testlevel ist ein
// 4×3-Raster mit zwei getrennten Korridoren: oben rollt Spieler 1 durch eine
// Tür, die NUR die Platte am Start des Gasts öffnet; unten rollt der Gast
// frei zu seinem eigenen Ziel.
const carveRow = (y: number) => [0, 1, 2].map((x) => [[x, y], 'e'] as [[number, number], 'e']);
const sealRow = (y: number) => [0, 1, 2, 3].map((x) => [[x, y], 's'] as [[number, number], 's']);

function level(over: Record<string, unknown> = {}, floor0: Record<string, unknown> = {}) {
  return {
    id: 'custom-mp',
    name: 'Zwei Gänge',
    players: 2,
    mpMode: 'coop',
    pingBudget: 3,
    floors: [
      {
        size: [4, 3],
        maze: { seed: 7, carve: [...carveRow(0), ...carveRow(2)], add: [...sealRow(0), ...sealRow(1)] },
        elements: [
          { type: 'door', id: 'g', edge: [[1, 0], 'e'] },
          { type: 'plate', cell: [0, 2], opens: 'g' },
        ],
        start: [0, 0],
        goal: [3, 0],
        start2: [0, 2],
        goal2: [3, 2],
        ...floor0,
      },
    ],
    ...over,
  };
}

describe('Schema und Loader', () => {
  it('players/mpMode haben Vorgaben, alte Level bleiben Einzelspieler', () => {
    const def = parseLevel({ id: 'x', name: 'x', floors: [{ size: [3, 3], maze: { seed: 1 }, start: [0, 0], goal: [2, 2] }] });
    expect(def.players).toBe(1);
    expect(def.mpMode).toBe('any');
    expect(def.floors[0]!.start2).toBeUndefined();
  });

  it('Spieler 1 startet an start und hat goal; Spieler 2 start2 und goal2', () => {
    const def = parseLevel(level());
    expect(startCellFor(def, 1)).toEqual([0, 0]);
    expect(startCellFor(def, 2)).toEqual([0, 2]);
    expect(goalCellFor(def, 1)).toEqual({ floor: 0, cell: [3, 0] });
    expect(goalCellFor(def, 2)).toEqual({ floor: 0, cell: [3, 2] });
    const l1 = loadLevel(def);
    const l2 = loadLevel(def, { player: 2 });
    expect(l1.player).toBe(1);
    expect(l2.player).toBe(2);
    expect([l1.world.ball.x, l1.world.ball.y]).toEqual([0.5 * CELL, 0.5 * CELL]);
    expect([l2.world.ball.x, l2.world.ball.y]).toEqual([0.5 * CELL, 2.5 * CELL]);
    // Die Zielzone der Welt ist das EIGENE Ziel – das andere ist inert.
    expect(l1.world.goal).toMatchObject({ x: 3.5 * CELL, y: 0.5 * CELL });
    expect(l2.world.goal).toMatchObject({ x: 3.5 * CELL, y: 2.5 * CELL });
    expect(l2.goalPos).toEqual({ x: 3.5 * CELL, y: 2.5 * CELL });
  });

  it('ohne start2/goal2 gelten Start und Ziel für beide', () => {
    const def = parseLevel(level({}, { start2: undefined, goal2: undefined }));
    expect(startCellFor(def, 2)).toEqual([0, 0]);
    expect(goalCellFor(def, 2)).toEqual({ floor: 0, cell: [3, 0] });
    expect(loadLevel(def, { player: 2 }).world.ball.y).toBe(0.5 * CELL);
  });

  it('goal2 auf einer anderen Ebene: der Gast hat sein Ziel dort', () => {
    const raw = level();
    const f0 = raw.floors[0] as Record<string, unknown>;
    delete f0.goal2;
    (f0.elements as unknown[]).push({ type: 'transporter', cell: [3, 2], target: { floor: 1, cell: [0, 0] } });
    raw.floors.push({ size: [3, 3], maze: { seed: 2 }, elements: [], start: [0, 0], goal: null, goal2: [2, 2] } as never);
    const def = parseLevel(raw);
    const l2 = loadLevel(def, { player: 2 });
    expect(l2.goalFloor).toBe(1);
    expect(l2.floors[0]!.world.goal).toBeNull();
    expect(l2.floors[1]!.world.goal).not.toBeNull();
    // Spieler 1 sieht auf Ebene 2 KEIN Ziel.
    const l1 = loadLevel(def);
    expect(l1.goalFloor).toBe(0);
    expect(l1.floors[1]!.world.goal).toBeNull();
  });

  it('zwei goal2 oder start2 außerhalb des Felds knallen beim Laden', () => {
    const twoGoals = level();
    twoGoals.floors.push({ size: [3, 3], maze: { seed: 2 }, elements: [], start: [0, 0], goal: null, goal2: [1, 1] } as never);
    expect(() => loadLevel(twoGoals)).toThrow(/zweites Ziel/);
    expect(() => loadLevel(level({}, { start2: [9, 9] }))).toThrow(/start2/);
  });

  it('mirrorLevel spiegelt start2 und goal2 mit', () => {
    const m = mirrorLevel(parseLevel(level()), 'xy');
    expect(m.floors[0]!.start2).toEqual([3, 0]);
    expect(m.floors[0]!.goal2).toEqual([0, 0]);
    expect(m.floors[0]!.start).toEqual([3, 2]);
  });
});

describe('Transporter nur für einen Spieler (M65)', () => {
  // Gast-Korridor: Pad bei [2,2] nur für Spieler 2, Ziel = sein Ziel [3,2].
  const withPad = () => {
    const raw = level();
    (raw.floors[0] as { elements: unknown[] }).elements.push({ type: 'transporter', cell: [2, 2], target: { floor: 0, cell: [3, 2] }, player: 2 });
    return raw;
  };
  it('der Loader baut das Pad nur in die Welt von Spieler 2', () => {
    const def = parseLevel(withPad());
    expect(loadLevel(def, { player: 1 }).world.transporters).toHaveLength(0);
    expect(loadLevel(def, { player: 2 }).world.transporters).toHaveLength(1);
    expect(loadLevel(def, { player: 1, allTransporters: true }).world.transporters).toHaveLength(1);
  });
  it('der Beweis rechnet Sprünge nur für den Spieler, dem das Pad gehört', () => {
    const raw = level();
    // Pad im HOST-Korridor hinter der Tür, springt ins Ziel des Gasts – nur für Spieler 1.
    (raw.floors[0] as { elements: unknown[] }).elements.push({ type: 'transporter', cell: [2, 0], target: { floor: 0, cell: [3, 2] }, player: 1 });
    const pr = pairReachable(parseLevel(raw), true);
    expect(pr.p1.has(cellKey(0, [3, 2]))).toBe(true);
    expect(pr.p2.has(cellKey(0, [2, 0]))).toBe(false);
    // Dasselbe Pad für Spieler 2 erklärt: kein Sprung mehr für Spieler 1.
    (raw.floors[0] as { elements: Array<Record<string, unknown>> }).elements.at(-1)!.player = 2;
    expect(pairReachable(parseLevel(raw), true).p1.has(cellKey(0, [3, 2]))).toBe(false);
  });
  it('Badges bleiben grün: der Wächter-Beweis verlangt das Pad nur im Baum seines Spielers', () => {
    const checks = validateLevel(withPad());
    const map = new Map(checks.map((c) => [c.key, c]));
    expect(map.get('guards')?.ok).toBe(true);
    expect(map.get('coop')?.ok).toBe(true);
    expect(isShareable(checks)).toBe(true);
  });
  it('mirrorLevel behält die Spieler-Zuordnung', () => {
    const m = mirrorLevel(parseLevel(withPad()), 'x');
    const tp = m.floors[0]!.elements.find((e) => e.type === 'transporter')!;
    expect((tp as { player?: number }).player).toBe(2);
  });
});

describe('Beweise (pairReachable)', () => {
  it('Coop: die Platte des Gasts öffnet die Tür des Hosts – beide erreichen ihr Ziel', () => {
    const def = parseLevel(level());
    const pr = pairReachable(def, true);
    expect(pr.p1.has(cellKey(0, [3, 0]))).toBe(true);
    expect(pr.p2.has(cellKey(0, [3, 2]))).toBe(true);
  });

  it('Race: niemand hält die Platte – Spieler 1 kommt nicht durch', () => {
    const def = parseLevel(level());
    const pr = pairReachable(def, false);
    expect(pr.p1.has(cellKey(0, [3, 0]))).toBe(false);
    expect(pr.p2.has(cellKey(0, [3, 2]))).toBe(true);
  });

  it('Coop (M59): der Schlüssel im Gang des Gasts öffnet die Tür des Hosts – im Race nicht', () => {
    const raw = level();
    (raw.floors[0] as { elements: unknown[] }).elements = [
      { type: 'door', id: 'g', edge: [[1, 0], 'e'] },
      { type: 'key', cell: [1, 2], opens: 'g' },
    ];
    const def = parseLevel(raw);
    expect(pairReachable(def, true).p1.has(cellKey(0, [3, 0]))).toBe(true);
    expect(pairReachable(def, false).p1.has(cellKey(0, [3, 0]))).toBe(false);
  });

  it('Coop über Kreuz: jeder holt den Schlüssel für die Tür des anderen', () => {
    const raw = level();
    (raw.floors[0] as { elements: unknown[] }).elements = [
      { type: 'door', id: 'g1', edge: [[1, 0], 'e'] },
      { type: 'key', cell: [0, 2], opens: 'g1' },
      { type: 'door', id: 'g2', edge: [[1, 2], 'e'] },
      { type: 'key', cell: [2, 0], opens: 'g2' },
    ];
    const checks = validateLevel(raw);
    const map = new Map(checks.map((c) => [c.key, c]));
    expect(map.get('coop')?.ok).toBe(true);
    expect(map.get('openers')?.ok).toBe(true);
    expect(map.get('softlock')?.ok).toBe(true);
    expect(isShareable(checks)).toBe(true);
    // Als Race wäre es unlösbar: keiner kommt an den fremden Schlüssel.
    expect(validateLevel({ ...raw, mpMode: 'race' }).find((c) => c.key === 'race')?.ok).toBe(false);
  });

  it('pathSteps zählt Zellen über Ebenen, Infinity ohne Weg', () => {
    const def = parseLevel(level());
    expect(pathSteps(def, { floor: 0, cell: [0, 0] }, { floor: 0, cell: [3, 0] })).toBe(3);
    expect(pathSteps(def, { floor: 0, cell: [0, 0] }, { floor: 0, cell: [3, 2] })).toBe(Infinity);
  });
});

describe('validateLevel für zwei Spieler', () => {
  const keys = (raw: unknown) => validateLevel(raw).map((c) => `${c.key}:${c.ok ? 1 : 0}`);

  it('Coop-Level: Badge coop grün, kein goal/race-Badge, fair grün, teilbar', () => {
    const checks = validateLevel(level());
    const map = new Map(checks.map((c) => [c.key, c]));
    expect(map.get('coop')?.ok).toBe(true);
    expect(map.has('goal')).toBe(false);
    expect(map.has('race')).toBe(false);
    expect(map.get('fair')?.ok).toBe(true);
    expect(map.get('softlock')?.ok).toBe(true);
    expect(isShareable(checks)).toBe(true);
  });

  it("mpMode 'any' verlangt Coop UND Race – das Platten-Level ist dann nicht teilbar", () => {
    const checks = validateLevel(level({ mpMode: 'any' }));
    const map = new Map(checks.map((c) => [c.key, c]));
    expect(map.get('coop')?.ok).toBe(true);
    expect(map.get('race')?.ok).toBe(false);
    expect(map.get('race')?.detail).toBe('Spieler 1');
    expect(isShareable(checks)).toBe(false);
  });

  it('Race-Level ohne Tür: race grün, teilbar', () => {
    const raw = level({ mpMode: 'race' });
    (raw.floors[0] as { elements: unknown[] }).elements = [];
    expect(keys(raw)).toContain('race:1');
    expect(isShareable(validateLevel(raw))).toBe(true);
  });

  it("'fair' ist weich: ungleiche Wege blockieren das Teilen nicht", () => {
    // Gast-Ziel direkt neben seinem Start: 1 Zelle gegen 3 – bei max(3, 30 %)
    // Toleranz noch fair; mit 9 Spalten wird es ungleich.
    const raw = level({ mpMode: 'coop' }, {
      size: [9, 3],
      maze: {
        seed: 7,
        carve: [...[0, 1, 2, 3, 4, 5, 6, 7].map((x) => [[x, 0], 'e']), ...[0, 1, 2, 3, 4, 5, 6, 7].map((x) => [[x, 2], 'e'])],
        add: [...[0, 1, 2, 3, 4, 5, 6, 7, 8].flatMap((x) => [[[x, 0], 's'], [[x, 1], 's']])],
      },
      goal: [8, 0],
      goal2: [1, 2],
    });
    const checks = validateLevel(raw);
    const fair = checks.find((c) => c.key === 'fair')!;
    expect(fair.ok).toBe(false);
    expect(fair.detail).toBe('8 ↔ 1');
    expect(isShareable(checks)).toBe(true);
  });

  it('Einzelspieler-Level bekommen keines der neuen Badges', () => {
    const k = keys(level({ players: 1 }, { start2: undefined, goal2: undefined, elements: [] }));
    expect(k.some((x) => x.startsWith('coop') || x.startsWith('race') || x.startsWith('fair'))).toBe(false);
    expect(k).toContain('goal:1');
  });
});

describe('Editor: Ebene löschen mit zweitem Start/Ziel', () => {
  it('goal2 der gelöschten Ebene wandert in eine freie Zelle von Ebene 1', () => {
    const lv: RawLevel = {
      id: 't',
      name: 't',
      players: 2,
      floors: [
        { size: [3, 3], maze: { seed: 1, carve: [], add: [], brittle: [], absorb: [], mirrors: [] }, elements: [{ type: 'hole', cell: [2, 0] }], start: [0, 0], goal: [2, 2], start2: [0, 2] },
        { size: [3, 3], maze: { seed: 1, carve: [], add: [], brittle: [], absorb: [], mirrors: [] }, elements: [], start: [0, 0], goal: null, goal2: [1, 1] },
      ],
    };
    removeFloor(lv, 1);
    expect(lv.floors).toHaveLength(1);
    const f0 = lv.floors[0]!;
    expect(f0.goal2).toBeDefined();
    const g2 = f0.goal2!;
    expect(g2).not.toEqual([2, 0]); // nicht ins Loch
    expect(g2).not.toEqual(f0.start);
    expect(g2).not.toEqual(f0.goal);
    expect(g2).not.toEqual(f0.start2);
  });
});

// M72: Tür nur für EINEN Spieler. Für den anderen ist sie eine reine Wand –
// im Spiel (keine `door`-Eigenschaft, updateDoors fasst sie nie an) wie im
// Beweis (in jedem Modell zu, auch mit doorsOpen).
describe('Tür je Spieler (M72)', () => {
  // 4×2, obere Reihe offen, untere zugemauert: ein Korridor mit einer Tür
  // zwischen (1,0) und (2,0), die nur Spieler 1 passieren darf. Der Schlüssel
  // liegt vor der Tür, damit sie für Spieler 1 wirklich aufgeht.
  const def = (player?: 1 | 2) =>
    parseLevel({
      id: 'custom-doorp',
      name: 'Meine Tür',
      players: 2,
      mpMode: 'coop',
      floors: [
        {
          size: [4, 2],
          maze: {
            seed: 5,
            carve: [...carveRow(0), ...carveRow(1)],
            add: [...sealRow(0), ...sealRow(1)],
          },
          elements: [
            { type: 'door', id: 'tor1', edge: [[1, 0], 'e'], ...(player ? { player } : {}) },
            { type: 'key', cell: [1, 0], opens: 'tor1' },
          ],
          start: [0, 0],
          goal: [3, 0],
          start2: [0, 1],
          goal2: [3, 1],
        },
      ],
    });

  const doorWalls = (d: ReturnType<typeof def>, player: 1 | 2) =>
    loadLevel(d, { player }).world.walls.filter((w) => w.door !== undefined).length;

  it('Loader: Spieler 1 bekommt die Tür, Spieler 2 eine Wand', () => {
    const d = def(1);
    expect(doorWalls(d, 1)).toBe(1);
    expect(doorWalls(d, 2)).toBe(0);
    // Die Wand ist trotzdem da – nur eben ohne Türregel.
    expect(loadLevel(d, { player: 2 }).world.walls.length).toBe(loadLevel(d, { player: 1 }).world.walls.length);
  });
  it('ohne Angabe gilt die Tür für beide', () => {
    const d = def();
    expect(doorWalls(d, 1)).toBe(1);
    expect(doorWalls(d, 2)).toBe(1);
  });
  it('Beweis: Spieler 2 kommt durch eine Spieler-1-Tür nicht hindurch', () => {
    const d = def(1);
    const p1 = pairReachable(d, true).p1;
    const p2 = pairReachable(d, true).p2;
    expect(p1.has(cellKey(0, [3, 0]))).toBe(true); // Spieler 1 hat den Schlüssel
    expect(p2.has(cellKey(0, [3, 0]))).toBe(false); // für Spieler 2 ist da eine Wand
  });
  it('Coop-Badge wird rot, wenn das Ziel des Gasts hinter der fremden Tür liegt', () => {
    const d = parseLevel({
      ...def(1),
      floors: [{ ...def(1).floors[0]!, goal2: [3, 0], start2: [0, 0] }],
    });
    const coop = validateLevel(d).find((c) => c.key === 'coop')!;
    expect(coop.ok).toBe(false);
    expect(coop.detail).toBe('Spieler 2');
  });
});

// GEMEINSAM ANKOMMEN (M90): Das Flag ist eine Coop-Regel, und das eingebaute
// Level dazu muss BEIDEN Spielern sein Ziel offen halten – sonst wartet einer
// dort, wo der andere nie ankommt.
describe('Gemeinsam ankommen (M90)', () => {
  it('das Schema lässt „together" nur bei zwei Spielern im Coop zu', () => {
    const two = (over: Record<string, unknown>) => () => parseLevel(level(over));
    expect(two({ together: true })).not.toThrow();
    expect(two({ together: true, mpMode: 'any' })).not.toThrow();
    expect(two({ together: true, mpMode: 'race' })).toThrow(/together/);
    expect(two({ together: true, players: 1 })).toThrow(/together/);
    // Ohne das Flag gilt die alte Regel – und alte Level bleiben ladbar.
    expect(parseLevel(level()).together).toBeUndefined();
  });

  it('coop-07 „Gleichschritt": beide erreichen ihr Ziel (der Beweis kennt kein Timing)', () => {
    const def = COOP_LEVELS.find((l) => l.id === 'coop-07')!;
    expect(def.together).toBe(true);
    expect(def.players).toBe(2);
    const goal1 = goalCellFor(def, 1)!;
    const goal2 = goalCellFor(def, 2)!;
    // Zwei verschiedene Ziele – sonst wäre „gleichzeitig" keine Verabredung.
    expect(goal1).not.toEqual(goal2);
    const pair = pairReachable(def, true);
    expect(pair.p1.has(cellKey(goal1.floor, goal1.cell))).toBe(true);
    expect(pair.p2.has(cellKey(goal2.floor, goal2.cell))).toBe(true);
    // Und keine Tür, die einer halten müsste, während er selbst im Ziel liegt:
    // Das Rendezvous ist die ganze Aufgabe.
    for (const f of def.floors) expect(f.elements.some((e) => e.type === 'door')).toBe(false);
    expect(isShareable(validateLevel(def))).toBe(true);
  });
});
