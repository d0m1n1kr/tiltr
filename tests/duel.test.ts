// Duell-Codec + Spur-Beweis: Ein Lauf muss als Token transportierbar sein
// (klein genug für eine URL) und beim Empfänger als plausibel nachweisbar.

import { describe, expect, it } from 'vitest';
import { parseLevel } from '../src/levels/schema';
import { GHOST_INTERVAL_S, type GhostData } from '../src/ghost';
import { decodeDuel, encodeDuel, packGhost, unpackGhost, validateGhostRun } from '../src/levels/duel';
import { mulberry32 } from '../src/core/rng';
import { CELL } from '../src/core/constants';

const rawLevel = {
  id: 'custom-duel',
  name: 'Duell-Probe',
  pingBudget: 3,
  floors: [
    {
      size: [4, 5],
      maze: { seed: 7 },
      elements: [] as unknown[],
      start: [0, 0],
      goal: [3, 4],
    },
  ],
};
const def = parseLevel(rawLevel);
const center = (c: readonly [number, number]) => ({ x: (c[0] + 0.5) * CELL, y: (c[1] + 0.5) * CELL });

/** Plausibler Lauf: Start -> Ziel, leicht schlängelnd, feste Rasterzeiten. */
function makeRun(time: number, floor = 0): GhostData {
  const a = center(def.floors[0]!.start);
  const b = center(def.floors[0]!.goal!);
  const n = Math.ceil(time / GHOST_INTERVAL_S) + 1;
  const frames: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = Math.min(i * GHOST_INTERVAL_S, time);
    const k = t / time;
    const wobble = i === 0 || i === n - 1 ? 0 : Math.sin(k * 12) * 9;
    frames.push(t, floor, Math.round(a.x + (b.x - a.x) * k + wobble), Math.round(a.y + (b.y - a.y) * k - wobble));
  }
  return { time, frames };
}

describe('Duell-Spur: packen und wieder auspacken', () => {
  it('Roundtrip über das exakte Raster erhält Zeiten und Positionen', () => {
    const run = makeRun(6);
    const back = unpackGhost(packGhost(run, 6), 6);
    expect(back.frames.length).toBe(run.frames.length);
    for (let i = 0; i < run.frames.length; i += 4) {
      expect(back.frames[i]).toBeCloseTo(run.frames[i]!, 3); // Zeit
      expect(back.frames[i + 1]).toBe(run.frames[i + 1]); // Ebene
      expect(Math.abs(back.frames[i + 2]! - run.frames[i + 2]!)).toBeLessThanOrEqual(1);
      expect(Math.abs(back.frames[i + 3]! - run.frames[i + 3]!)).toBeLessThanOrEqual(1);
    }
  });

  it('Ebenenwechsel landen als Wechsel-Liste, nicht in jedem Sample', () => {
    const run = makeRun(4);
    // zweite Hälfte auf Ebene 2 (nur zum Packen – Beweis prüft das separat).
    // Index MUSS auf einer 4er-Grenze starten, sonst landet die Ebene in x/y.
    const from = Math.floor(run.frames.length / 8) * 4;
    for (let i = from; i < run.frames.length; i += 4) run.frames[i + 1] = 1;
    const packed = packGhost(run, 4);
    expect(packed.f.length).toBe(2); // genau ein Wechsel: [index, 1]
    expect(packed.f[1]).toBe(1);
    const back = unpackGhost(packed, 4);
    expect(back.frames.at(-3)).toBe(1); // Ebene am Ende
  });
});

describe('Duell-Token', () => {
  it('Roundtrip inkl. Zeit, Absender und Spur', async () => {
    const token = await encodeDuel(rawLevel, 12.34, makeRun(12.34), 'Dominik');
    const back = await decodeDuel(token);
    expect(back.time).toBeCloseTo(12.34, 3);
    expect(back.by).toBe('Dominik');
    expect(back.ghost).not.toBeNull();
    expect(back.def.name).toBe('Duell-Probe');
    expect(validateGhostRun(parseLevel(back.def), back.ghost!, back.time)).toBeNull();
  });

  it('bleibt für einen 60-Sekunden-Lauf URL-tauglich', async () => {
    // Pessimistisch: zufällige (schlecht komprimierbare) Deltas statt einer
    // glatten Linie. Schranke ist die Regressionsgrenze fürs Format.
    const rnd = mulberry32(4711);
    const n = Math.ceil(60 / GHOST_INTERVAL_S) + 1;
    const frames: number[] = [];
    let x = center(def.floors[0]!.start).x;
    let y = center(def.floors[0]!.start).y;
    for (let i = 0; i < n; i++) {
      frames.push(Math.min(i * GHOST_INTERVAL_S, 60), 0, Math.round(x), Math.round(y));
      x += (rnd() - 0.5) * 120;
      y += (rnd() - 0.5) * 120;
    }
    const token = await encodeDuel(rawLevel, 60, { time: 60, frames });
    expect(token.length).toBeLessThan(2500);
    expect((await decodeDuel(token)).ghost).not.toBeNull();
  });

  it('sehr lange Läufe fallen automatisch auf ein Zeit-only-Duell zurück', async () => {
    const rnd = mulberry32(99);
    const n = Math.ceil(900 / GHOST_INTERVAL_S) + 1; // 15 Minuten Zufallsspur
    const frames: number[] = [];
    for (let i = 0; i < n; i++) {
      frames.push(Math.min(i * GHOST_INTERVAL_S, 900), 0, Math.round(rnd() * 4000), Math.round(rnd() * 4000));
    }
    const token = await encodeDuel(rawLevel, 900, { time: 900, frames });
    const back = await decodeDuel(token);
    expect(back.ghost).toBeNull(); // Zielzeit bleibt, Spur fällt weg
    expect(back.time).toBe(900);
  });

  it('weist fremde Tokens und falsche Versionen zurück', async () => {
    await expect(decodeDuel('9abc')).rejects.toThrow();
    await expect(decodeDuel('0' + btoa('{"v":99}').replace(/=+$/, ''))).rejects.toThrow(/Duell-Version/);
    await expect(decodeDuel('0' + btoa('{"v":1,"def":{}}').replace(/=+$/, ''))).rejects.toThrow(/Zeit/);
  });
});

describe('validateGhostRun', () => {
  it('nimmt einen plausiblen Lauf an', () => {
    expect(validateGhostRun(def, makeRun(8), 8)).toBeNull();
  });

  it('lehnt Teleports ab', () => {
    const run = makeRun(8);
    run.frames[4 * 10 + 2] = 3500; // ein Sample weit weg
    expect(validateGhostRun(def, run, 8)).toMatch(/Teleport/);
  });

  it('lehnt eine Zeit ab, die nicht zur Spur passt', () => {
    expect(validateGhostRun(def, makeRun(8), 2)).toMatch(/Dauer/);
  });

  it('verlangt Start- und Zielpunkt', () => {
    const offStart = makeRun(8);
    offStart.frames[2] = 2000;
    expect(validateGhostRun(def, offStart, 8)).toMatch(/Startpunkt/);

    const offGoal = makeRun(8);
    offGoal.frames[offGoal.frames.length - 2] = 50;
    offGoal.frames[offGoal.frames.length - 1] = 50;
    expect(validateGhostRun(def, offGoal, 8)).toMatch(/Endpunkt|Teleport/);
  });

  it('erlaubt Ebenenwechsel nur an Transportern', () => {
    // Zwei Ebenen, Ziel oben: ohne Transporter ist der Wechsel unmöglich.
    const twoFloors = parseLevel({
      ...rawLevel,
      floors: [
        { size: [4, 5], maze: { seed: 7 }, elements: [], start: [0, 0], goal: null },
        { size: [4, 5], maze: { seed: 8 }, elements: [], start: [0, 0], goal: [3, 4] },
      ],
    });
    const run = makeRun(8);
    const half = Math.floor(run.frames.length / 8) * 4;
    for (let i = half; i < run.frames.length; i += 4) run.frames[i + 1] = 1;
    expect(validateGhostRun(twoFloors, run, 8)).toMatch(/Transporter/);

    // Mit passendem Transporter an genau dieser Zelle: angenommen.
    const fromCell = [
      Math.floor(run.frames[half - 2]! / CELL),
      Math.floor(run.frames[half - 1]! / CELL),
    ] as [number, number];
    const toCell = [Math.floor(run.frames[half + 2]! / CELL), Math.floor(run.frames[half + 3]! / CELL)] as [number, number];
    const linked = parseLevel({
      ...rawLevel,
      floors: [
        {
          size: [4, 5],
          maze: { seed: 7 },
          elements: [{ type: 'transporter', cell: fromCell, target: { floor: 1, cell: toCell } }],
          start: [0, 0],
          goal: null,
        },
        { size: [4, 5], maze: { seed: 8 }, elements: [], start: [0, 0], goal: [3, 4] },
      ],
    });
    expect(validateGhostRun(linked, run, 8)).toBeNull();
  });
});
