// Schallschutzwand: Abschirmung ist ein Strahl vom Ohr zur Quelle gegen die
// absorbierenden Wand-Rechtecke (src/core/occlusion.ts) – plus der Loader-
// Weg: maze.absorb wird zur Wand mit `absorb`, der Ping schweigt dort.

import { describe, expect, it } from 'vitest';
import { ABSORB_GAIN, segmentHitsRect, shielded } from '../src/core/occlusion';
import type { Wall } from '../src/core/types';
import { parseLevel } from '../src/levels/schema';
import { loadLevel } from '../src/levels/loader';
import { mirrorLevel } from '../src/levels/mirror';

const R = { x: 10, y: 0, w: 2, h: 20 }; // senkrechte Wand bei x = 10..12

describe('segmentHitsRect', () => {
  it('trifft, wenn die Strecke die Wand kreuzt', () => {
    expect(segmentHitsRect(0, 5, 20, 5, R)).toBe(true);
    expect(segmentHitsRect(0, 0, 20, 20, R)).toBe(true);
  });
  it('verfehlt, wenn die Strecke vor der Wand endet oder daneben läuft', () => {
    expect(segmentHitsRect(0, 5, 9, 5, R)).toBe(false);
    expect(segmentHitsRect(0, 25, 20, 25, R)).toBe(false);
    expect(segmentHitsRect(0, -1, 20, -1, R)).toBe(false);
  });
  it('Start oder Ziel IM Rechteck zählt als Treffer', () => {
    expect(segmentHitsRect(11, 5, 30, 5, R)).toBe(true);
    expect(segmentHitsRect(0, 5, 11, 5, R)).toBe(true);
  });
  it('Nullstrecke außerhalb trifft nicht', () => {
    expect(segmentHitsRect(3, 3, 3, 3, R)).toBe(false);
  });
});

describe('shielded', () => {
  const wall = (absorb: boolean): Wall => ({ ...R, absorb });
  it('nur Schallschutzwände schirmen ab – eine massive Wand dazwischen nicht', () => {
    expect(shielded([wall(false)], 0, 5, 20, 5)).toBe(false);
    expect(shielded([wall(true)], 0, 5, 20, 5)).toBe(true);
  });
  it('Quelle auf derselben Seite bleibt frei', () => {
    expect(shielded([wall(true)], 0, 5, 8, 5)).toBe(false);
  });
  it('ABSORB_GAIN ist eine hörbare, aber nicht totale Dämpfung', () => {
    expect(ABSORB_GAIN).toBeGreaterThan(0.1);
    expect(ABSORB_GAIN).toBeLessThan(0.6);
  });
});

describe('Loader: maze.absorb', () => {
  const level = (absorb: unknown[], extra: Record<string, unknown> = {}) => ({
    id: 'custom-absorb',
    name: 'A',
    pingBudget: 3,
    floors: [
      {
        size: [4, 4],
        maze: { seed: 7, carve: [], add: [[[1, 1], 'e']], brittle: [], absorb },
        elements: [],
        start: [0, 0],
        goal: [3, 3],
      },
    ],
    ...extra,
  });

  it('markiert genau die gelistete Wand', () => {
    const world = loadLevel(parseLevel(level([[[1, 1], 'e']]))).floors[0]!.world;
    const marked = world.walls.filter((w) => w.absorb);
    expect(marked).toHaveLength(1);
    expect(world.walls.filter((w) => w.hp !== undefined)).toHaveLength(0);
  });

  it('absorb ist optional (Default leer) und eine fehlende Wand ist ein Fehler', () => {
    const def = parseLevel({ ...level([]), floors: [{ ...level([]).floors[0], maze: { seed: 7 } }] });
    expect(def.floors[0]!.maze.absorb).toEqual([]);
    // (1,1)/e ist durch `add` sicher eine Wand; eine Außenkante darf nicht.
    expect(() => loadLevel(parseLevel(level([[[0, 0], 'w']])))).toThrow(/Außenwand/);
  });

  it('wird gespiegelt wie brittle', () => {
    const def = parseLevel(level([[[1, 1], 'e']]));
    const m = mirrorLevel(def, 'x');
    expect(m.floors[0]!.maze.absorb).toHaveLength(1);
    expect(m.floors[0]!.maze.absorb[0]).not.toEqual([[1, 1], 'e']);
  });
});
