import { describe, expect, it } from 'vitest';
import { parseLevel } from '../src/levels/schema';
import { generatedBrittleEdges, loadLevel } from '../src/levels/loader';
import { generateQuickLevel, PRESETS, type Preset } from '../src/levels/quick';
import { generateMaze, mazeToWalls, setWall, solveMaze } from '../src/core/maze';
import { mulberry32 } from '../src/core/rng';
import { cellKey, reachable, validateLevel } from './helpers';

const minimalLevel = {
  id: 't-1',
  name: 'Test',
  floors: [
    {
      size: [4, 4],
      maze: { seed: 7 },
      start: [0, 0],
      goal: [3, 3],
    },
  ],
};

describe('Levelformat', () => {
  it('akzeptiert ein minimales Level und füllt Defaults', () => {
    const def = parseLevel(minimalLevel);
    expect(def.pingBudget).toBe(3);
    expect(def.floors[0]!.maze.brittleChance).toBe(0);
    expect(def.floors[0]!.elements).toEqual([]);
  });

  it('weist unbekannte Element-Typen und kaputte Werte zurück', () => {
    expect(() =>
      parseLevel({
        ...minimalLevel,
        floors: [{ ...minimalLevel.floors[0], elements: [{ type: 'laser', cell: [1, 1] }] }],
      }),
    ).toThrow();
    expect(() => parseLevel({ ...minimalLevel, floors: [] })).toThrow();
    expect(() =>
      parseLevel({
        ...minimalLevel,
        floors: [{ ...minimalLevel.floors[0], size: [1, 1] }],
      }),
    ).toThrow();
  });
});

describe('Loader', () => {
  it('baut Elemente über die Registry in die Welt', () => {
    const def = parseLevel({
      ...minimalLevel,
      floors: [
        {
          ...minimalLevel.floors[0],
          elements: [
            { type: 'hole', cell: [1, 1], breathing: { offset: 1 } },
            { type: 'hole', cell: [2, 1] },
            { type: 'windZone', cell: [1, 2], dir: 'e' },
            { type: 'checkpoint', cell: [2, 2] },
          ],
        },
      ],
    });
    const { world } = loadLevel(def);
    expect(world.holes).toHaveLength(2);
    expect(world.holes[0]!.breathing).toBeDefined();
    expect(world.holes[0]!.openness).toBe(0); // atmend startet geschlossen
    expect(world.holes[1]!.breathing).toBeUndefined();
    expect(world.holes[1]!.openness).toBe(1); // statisch ist offen
    expect(world.windZones).toHaveLength(1);
    expect(world.windZones[0]!.fx).toBeGreaterThan(0);
    expect(world.checkpoints).toHaveLength(1);
    expect(world.ball.x).toBe(50);
    expect(world.ball.y).toBe(50);
    expect(world.goal!.x).toBe(350);
  });

  it('ist deterministisch: gleiche Def ergibt identische Wände', () => {
    const a = loadLevel(minimalLevel);
    const b = loadLevel(minimalLevel);
    expect(a.world.walls).toEqual(b.world.walls);
  });

  it('verlangt genau ein Ziel über alle Ebenen', () => {
    expect(() =>
      loadLevel({ ...minimalLevel, floors: [{ ...minimalLevel.floors[0], goal: null }] }),
    ).toThrow(/kein Ziel/);
    expect(() =>
      loadLevel({ ...minimalLevel, floors: [minimalLevel.floors[0], minimalLevel.floors[0]] }),
    ).toThrow(/mehr als ein Ziel/);
  });

  it('validiert Transporter-Ziele (Ebene existiert, Zelle im Feld)', () => {
    const withTransporter = (target: { floor: number; cell: [number, number] }) => ({
      ...minimalLevel,
      floors: [
        {
          ...minimalLevel.floors[0],
          elements: [{ type: 'transporter', cell: [1, 1], target }],
        },
      ],
    });
    expect(() => loadLevel(withTransporter({ floor: 3, cell: [0, 0] }))).toThrow(/Ebene 3/);
    expect(() => loadLevel(withTransporter({ floor: 0, cell: [9, 9] }))).toThrow(/außerhalb/);
    expect(() => loadLevel(withTransporter({ floor: 0, cell: [2, 2] }))).not.toThrow();
  });
});

describe('M9-Elemente (Schiebewand, Zeitschloss, Strömung)', () => {
  const withFloor = (floor: Record<string, unknown>) => ({
    ...minimalLevel,
    floors: [{ ...minimalLevel.floors[0], ...floor }],
  });

  it('Schiebewand braucht eine offene Kante und startet geschlossen', () => {
    const ok = withFloor({
      maze: { seed: 7, carve: [[[1, 1], 'e']] },
      elements: [{ type: 'slidingWall', edge: [[1, 1], 'e'] }],
    });
    const { world } = loadLevel(ok);
    const slider = world.walls.find((w) => w.slide);
    expect(slider).toBeDefined();
    expect(slider!.slide!.openness).toBe(0);
    expect(slider!.slide!.cycle.open).toBeGreaterThan(0); // Defaults gefüllt

    const bad = withFloor({
      maze: { seed: 7, add: [[[1, 1], 'e']] },
      elements: [{ type: 'slidingWall', edge: [[1, 1], 'e'] }],
    });
    expect(() => loadLevel(bad)).toThrow(/nicht offen/);
  });

  it('Strömung verlangt eine offene Kante in Fließrichtung (kein Dauer-Pin)', () => {
    const ok = withFloor({
      maze: { seed: 7, carve: [[[1, 1], 'e']] },
      elements: [{ type: 'current', cell: [1, 1], dir: 'e' }],
    });
    expect(loadLevel(ok).world.currents).toHaveLength(1);

    const pinned = withFloor({
      maze: { seed: 7, add: [[[1, 1], 'e']] },
      elements: [{ type: 'current', cell: [1, 1], dir: 'e' }],
    });
    expect(() => loadLevel(pinned)).toThrow(/Dauer-Pin/);

    // Randzelle mit Fluss nach außen: Außenwand blockiert -> gleicher Fehler.
    const border = withFloor({
      maze: { seed: 7 },
      elements: [{ type: 'current', cell: [3, 1], dir: 'e' }],
    });
    expect(() => loadLevel(border)).toThrow(/Dauer-Pin/);
  });

  it('Zeitschloss zählt als Tür-Öffner; hängende Verknüpfungen laden mild', () => {
    const ok = withFloor({
      maze: { seed: 7, carve: [[[2, 2], 'e']] },
      elements: [
        { type: 'door', id: 'takt', edge: [[2, 2], 'e'] },
        { type: 'timedSwitch', cell: [0, 1], opens: 'takt' },
      ],
    });
    const { world } = loadLevel(ok);
    expect(world.switches).toHaveLength(1);
    expect(world.switches[0]!.durationS).toBe(6); // Default

    // Editor-Zwischenzustände: Tür ohne Öffner / Schalter ohne Tür sind
    // lauffähig (Loader mild) – die Strenge wohnt im 'links'-Beweis.
    const orphanDoor = withFloor({
      maze: { seed: 7, carve: [[[2, 2], 'e']] },
      elements: [{ type: 'door', id: 'takt', edge: [[2, 2], 'e'] }],
    });
    expect(loadLevel(orphanDoor).floors[0]!.world.walls.some((w) => w.door?.id === 'takt')).toBe(true);

    const orphanSwitch = withFloor({
      maze: { seed: 7 },
      elements: [{ type: 'timedSwitch', cell: [0, 1], opens: 'nix' }],
    });
    expect(loadLevel(orphanSwitch).floors[0]!.world.switches).toHaveLength(1);
  });
});

describe('Zufällige Brüchigkeit hängt an der Wand, nicht an der Reihenfolge', () => {
  const level = (carve: unknown[]) => ({
    id: 'custom-brittle',
    name: 'B',
    pingBudget: 3,
    floors: [
      {
        size: [6, 8],
        maze: { seed: 12345, carve, add: [], brittle: [], brittleChance: 0.25, brittleHits: 3 },
        elements: [],
        start: [0, 0],
        goal: [5, 7],
      },
    ],
  });
  const brittleKeys = (def: unknown) =>
    new Set(
      loadLevel(parseLevel(def))
        .floors[0]!.world.walls.filter((w) => w.hp !== undefined)
        .map((w) => `${w.x},${w.y},${w.w}`),
    );

  it('eine aufgeschnittene Wand verschiebt die anderen brüchigen Wände NICHT', () => {
    // Der Bug: Der Wurf lief über die Wand-LISTE; fiel eine Wand weg,
    // bekam die nächste deren Ziehung – im Editor sah man, wie plötzlich
    // eine ganz andere Wand brüchig wurde.
    const before = brittleKeys(level([]));
    const after = brittleKeys(level([[[2, 3], 'e']]));
    expect(before.size).toBeGreaterThan(2);
    const appeared = [...after].filter((k) => !before.has(k));
    expect(appeared).toEqual([]);
    // Genau die aufgeschnittene Wand darf fehlen (falls sie brüchig war).
    expect([...before].filter((k) => !after.has(k)).length).toBeLessThanOrEqual(1);
  });

  it('generatedBrittleEdges trifft exakt dieselben Wände (fürs Einbacken)', () => {
    const def = parseLevel(level([]));
    const edges = generatedBrittleEdges(def.floors[0]!, def.mirror);
    expect(edges.length).toBe(brittleKeys(level([])).size);

    // Eingebacken (explizite Liste, brittleChance 0) ergibt dieselbe Welt –
    // so übernimmt die Werkstatt ein Zufallslevel versionsfest.
    const baked = level([]) as unknown as { floors: Array<{ maze: Record<string, unknown> }> };
    baked.floors[0]!.maze.brittle = edges;
    baked.floors[0]!.maze.brittleChance = 0;
    expect(brittleKeys(baked)).toEqual(brittleKeys(level([])));
  });
});

describe('M10-Elemente (Horcher, Nebelzone, Eisfläche)', () => {
  it('Loader baut Horcher (mit Heimatpunkt), Nebel- und Eiszonen', () => {
    const def = parseLevel({
      ...minimalLevel,
      floors: [
        {
          ...minimalLevel.floors[0],
          elements: [
            { type: 'listener', cell: [2, 1] },
            { type: 'fogZone', cell: [1, 2] },
            { type: 'ice', cell: [2, 2] },
          ],
        },
      ],
    });
    const { world } = loadLevel(def);
    expect(world.listeners).toHaveLength(1);
    expect(world.listeners[0]!.home).toEqual({ x: 250, y: 150 });
    expect(world.listeners[0]!.speed).toBe(95); // Default
    expect(world.fogZones).toEqual([{ x: 100, y: 200, w: 100, h: 100 }]);
    expect(world.ice).toEqual([{ x: 200, y: 200, w: 100, h: 100 }]);
  });
});

describe('M11-Elemente (Echo-Kristall, Sog-Anker, Glasboden)', () => {
  it('Loader baut Kristalle, Anker (mit Radius/Kraft) und Glasboden (intakt)', () => {
    const def = parseLevel({
      ...minimalLevel,
      floors: [
        {
          ...minimalLevel.floors[0],
          elements: [
            { type: 'echoCrystal', cell: [1, 1] },
            { type: 'anchor', cell: [2, 1] },
            { type: 'glass', cell: [1, 2] },
          ],
        },
      ],
    });
    const { world } = loadLevel(def);
    expect(world.crystals).toHaveLength(1);
    expect(world.crystals[0]!.r).toBe(16); // Default
    expect(world.anchors[0]).toMatchObject({ x: 250, y: 150, r: 120, force: 2000 });
    expect(world.glass[0]).toMatchObject({ x: 100, y: 200, state: 0, wasOn: false });
  });

  it('Schema deckelt die Anker-Kraft unter der Neigungs-Beschleunigung', () => {
    expect(() =>
      parseLevel({
        ...minimalLevel,
        floors: [{ ...minimalLevel.floors[0], elements: [{ type: 'anchor', cell: [1, 1], force: 3000 }] }],
      }),
    ).toThrow();
  });
});

describe('Maze-Edits (carve/add)', () => {
  it('setWall hält Nachbarzellen konsistent', () => {
    const cells = generateMaze(3, 3, mulberry32(1));
    setWall(cells, 3, 3, 0, 0, 'e', false);
    expect(cells[0]!.e).toBe(false);
    expect(cells[1]!.w).toBe(false);
    setWall(cells, 3, 3, 0, 0, 'e', true);
    expect(cells[1]!.w).toBe(true);
  });

  it('carve öffnet Durchgänge (weniger Wand-Rechtecke)', () => {
    const before = loadLevel(minimalLevel).world.walls.length;
    const carved = loadLevel({
      ...minimalLevel,
      floors: [{ ...minimalLevel.floors[0], maze: { seed: 7, carve: [[[0, 0], 'e']] } }],
    }).world.walls.length;
    // (0,0).e kann im Seed-7-Maze schon offen sein – dann ändert carve nichts.
    expect(carved).toBeLessThanOrEqual(before);
  });
});

describe('Schnelles Spiel', () => {
  it('ist deterministisch pro Seed', () => {
    expect(generateQuickLevel(42)).toEqual(generateQuickLevel(42));
    expect(generateQuickLevel(42)).not.toEqual(generateQuickLevel(43));
  });

  it('erzeugt ein lösbares, vollständiges Level', () => {
    for (const seed of [1, 42, 999]) {
      const def = generateQuickLevel(seed);
      const { world, cols, rows } = loadLevel(def);
      expect(world.holes).toHaveLength(4);
      expect(world.windZones).toHaveLength(2);
      expect(world.checkpoints).toHaveLength(2);
      // Lösbarkeit des zugrundeliegenden Mazes
      const cells = generateMaze(cols, rows, mulberry32(def.floors[0]!.maze.seed));
      const path = solveMaze(cells, cols, rows);
      expect(path.at(-1)).toEqual({ x: cols - 1, y: rows - 1 });
      // Checkpoints liegen auf dem Lösungsweg
      for (const cp of world.checkpoints) {
        const cell = { x: Math.floor(cp.x / 100), y: Math.floor(cp.y / 100) };
        expect(path).toContainEqual(cell);
      }
    }
  });

  it('M11: Kristalle/Anker/Glas nach Preset – Anker und Glas beweisbar abseits der Pflichtwege', () => {
    for (const seed of [1, 7, 42, 99, 555, 1234, 4711, 90210]) {
      for (const preset of ['easy', 'normal', 'hard'] as Preset[]) {
        const def = generateQuickLevel(seed, preset);
        const floor = def.floors[0]!;
        const count = (t: string) => floor.elements.filter((e) => e.type === t).length;
        expect(count('echoCrystal'), `${preset}/${seed}`).toBe(PRESETS[preset].crystals);
        expect(count('anchor'), `${preset}/${seed}`).toBe(PRESETS[preset].anchors);
        expect(count('glass'), `${preset}/${seed}`).toBe(PRESETS[preset].glass);
        // Konservatives Modell: Glas- und Anker-Zellen komplett gesperrt –
        // Ziel, Checkpoints UND Kristalle müssen erreichbar bleiben.
        const safe = reachable(def, { brittleOpen: false, doorsOpen: true, glassBlocked: true, anchorsBlocked: true });
        expect(safe.has(cellKey(0, floor.goal!)), `${preset}/${seed}: Ziel`).toBe(true);
        for (const el of floor.elements) {
          if (el.type === 'checkpoint' || el.type === 'echoCrystal') {
            expect(safe.has(cellKey(0, el.cell)), `${preset}/${seed}: ${el.type} ${el.cell}`).toBe(true);
          }
        }
      }
    }
  });

  it('M27: Musikautomaten nach Preset – nie ein Riegel, immer anrempelbar', () => {
    // Der Automat ist eine WAND: Er darf weder das Ziel noch ein
    // Sammelziel wegmauern. Der 'jukebox'-Beweis in validate.ts prüft
    // genau das (plus Start/Ziel, Erreichbarkeit, unbekannte Titel), also
    // wird hier über viele Seeds der ganze Prüfbericht abgefragt.
    for (const seed of [1, 7, 42, 99, 555, 1234, 4711, 90210, 31337, 8080]) {
      for (const preset of ['easy', 'normal', 'hard'] as Preset[]) {
        const def = generateQuickLevel(seed, preset);
        const floor = def.floors[0]!;
        const boxes = floor.elements.filter((e) => e.type === 'jukebox');
        expect(boxes.length, `${preset}/${seed}`).toBe(PRESETS[preset].jukeboxes);
        for (const checks of [validateLevel(def)]) {
          for (const c of checks) {
            if (c.key === 'items') continue; // optional (Gems dürfen hinter Glas liegen)
            expect(c.ok, `${preset}/${seed}: ${c.key} (${c.detail ?? ''})`).toBe(true);
          }
        }
      }
    }
  });

  it('legt keine Löcher auf Start-, Ziel- oder Checkpoint-Zellen', () => {
    for (const seed of [1, 42, 999]) {
      const { world, cols, rows } = loadLevel(generateQuickLevel(seed));
      const cpCells = new Set(
        world.checkpoints.map((c) => `${Math.floor(c.x / 100)},${Math.floor(c.y / 100)}`),
      );
      for (const h of world.holes) {
        const key = `${Math.floor(h.x / 100)},${Math.floor(h.y / 100)}`;
        expect(key).not.toBe('0,0');
        expect(key).not.toBe(`${cols - 1},${rows - 1}`);
        expect(cpCells.has(key)).toBe(false);
      }
    }
  });
});

describe('mazeToWalls', () => {
  it('bleibt nach setWall-Edits konsistent (keine doppelten Wände)', () => {
    const cells = generateMaze(4, 4, mulberry32(3));
    setWall(cells, 4, 4, 1, 1, 's', true);
    const walls = mazeToWalls(cells, 4, 4, 100, 10);
    const keys = walls.map((w) => `${w.x},${w.y},${w.w},${w.h}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
