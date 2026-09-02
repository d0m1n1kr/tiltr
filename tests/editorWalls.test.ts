// Wand-Werkzeug, Wand-Variante und Landeplätze im Editor – reine Funktionen.
//
// Das Wand-Werkzeug ist ein SCHALTER nach sichtbarem Zustand: Wand oder keine
// Wand, egal was der Seed an der Kante gewürfelt hat. Die Variante (massiv,
// brüchig, Schallschutz) ist eine EIGENSCHAFT der ausgewählten Wand – kein
// Zyklus mehr, der je nach Seed einen unsichtbaren Tap hatte.

import { describe, expect, it } from 'vitest';
import {
  edgeState,
  landingsOn,
  setEdgeVariant,
  toggleEdge,
  type Edge,
  type MazeEdits,
  type RawLevel,
} from '../src/ui/editor';

const E: Edge = [[1, 1], 'e'];
const fresh = (): MazeEdits => ({ carve: [], add: [], brittle: [], absorb: [], mirrors: [] });
const same = (a: Edge, b: Edge) => a[1] === b[1] && a[0][0] === b[0][0] && a[0][1] === b[0][1];

/** Ist E im Maze offen? Wie das echte Maze: add schließt, carve öffnet, sonst Seed. */
const openOf = (maze: MazeEdits, seedOpen: boolean) =>
  maze.add.some((x) => same(x, E)) ? false : maze.carve.some((x) => same(x, E)) ? true : seedOpen;

describe('toggleEdge', () => {
  it('offene Seed-Kante: Wand (add) → wieder offen (Listen leer)', () => {
    const maze = fresh();
    expect(toggleEdge(maze, E, openOf(maze, true), true)).toBe('wall');
    expect(maze).toEqual({ carve: [], add: [E], brittle: [], absorb: [], mirrors: [] });
    expect(toggleEdge(maze, E, openOf(maze, true), true)).toBe('open');
    expect(maze).toEqual(fresh());
  });

  it('Seed-Wand: offen (carve) → wieder Wand (Listen leer)', () => {
    const maze = fresh();
    expect(toggleEdge(maze, E, openOf(maze, false), false)).toBe('open');
    expect(maze).toEqual({ carve: [E], add: [], brittle: [], absorb: [], mirrors: [] });
    expect(toggleEdge(maze, E, openOf(maze, false), false)).toBe('wall');
    expect(maze).toEqual(fresh());
  });

  it('jeder Tap ist sichtbar: der Zustand wechselt IMMER', () => {
    for (const seedOpen of [true, false]) {
      const maze = fresh();
      let prev = edgeState(maze, E, seedOpen);
      for (let i = 0; i < 6; i++) {
        const next = toggleEdge(maze, E, openOf(maze, seedOpen), seedOpen);
        expect(next).not.toBe(prev);
        expect(edgeState(maze, E, openOf(maze, seedOpen))).toBe(next);
        prev = next;
      }
    }
  });

  it('eine entfernte Wand nimmt ihre Variante mit', () => {
    const maze: MazeEdits = { carve: [], add: [], brittle: [E], absorb: [], mirrors: [] };
    expect(toggleEdge(maze, E, false, false)).toBe('open');
    expect(maze.brittle).toEqual([]);
    const m2: MazeEdits = { carve: [], add: [E], brittle: [], absorb: [E], mirrors: [] };
    expect(toggleEdge(m2, E, false, true)).toBe('open');
    expect(m2).toEqual(fresh());
  });
});

describe('setEdgeVariant', () => {
  it('genau EINE Liste führt die Kante', () => {
    const maze = fresh();
    setEdgeVariant(maze, E, 'brittle');
    expect(maze.brittle).toEqual([E]);
    expect(maze.absorb).toEqual([]);
    setEdgeVariant(maze, E, 'absorb');
    expect(maze.brittle).toEqual([]);
    expect(maze.absorb).toEqual([E]);
    setEdgeVariant(maze, E, 'solid');
    expect(maze).toEqual(fresh());
  });

  it('doppelt setzen listet nicht doppelt', () => {
    const maze = fresh();
    setEdgeVariant(maze, E, 'absorb');
    setEdgeVariant(maze, E, 'absorb');
    expect(maze.absorb).toHaveLength(1);
  });

  it('edgeState: Schallschutz vor brüchig vor offen/Wand', () => {
    expect(edgeState({ carve: [], add: [], brittle: [E], absorb: [E], mirrors: [] }, E, false)).toBe('absorb');
    expect(edgeState({ carve: [], add: [], brittle: [E], absorb: [], mirrors: [] }, E, false)).toBe('brittle');
    expect(edgeState(fresh(), E, true)).toBe('open');
    expect(edgeState(fresh(), E, false)).toBe('wall');
  });
});

describe('landingsOn', () => {
  const maze = (seed: number) => ({ seed, carve: [], add: [], brittle: [], absorb: [], mirrors: [] });
  const lv: RawLevel = {
    id: 't',
    name: 'T',
    floors: [
      {
        size: [4, 4],
        maze: maze(1),
        elements: [
          { type: 'hole', cell: [0, 1] },
          { type: 'transporter', cell: [1, 0], target: { floor: 1, cell: [2, 2] } },
          { type: 'transporter', cell: [3, 3], target: { floor: 0, cell: [0, 3] } },
        ],
        start: [0, 0],
        goal: null,
      },
      {
        size: [4, 4],
        maze: maze(2),
        elements: [{ type: 'transporter', cell: [3, 0], target: { floor: 0, cell: [2, 0] } }],
        start: [0, 0],
        goal: [3, 3],
      },
    ],
  };

  it('sammelt die Ziele ALLER Ebenen, die auf der gefragten Ebene liegen', () => {
    expect(landingsOn(lv, 0)).toEqual([
      { cell: [0, 3], from: 0, index: 2 },
      { cell: [2, 0], from: 1, index: 0 },
    ]);
    expect(landingsOn(lv, 1)).toEqual([{ cell: [2, 2], from: 0, index: 1 }]);
  });

  it('Ebene ohne Ankunft: leer; Transporter ohne Ziel zählt nicht', () => {
    expect(landingsOn(lv, 2)).toEqual([]);
    const half: RawLevel = { ...lv, floors: [{ ...lv.floors[0]!, elements: [{ type: 'transporter', cell: [1, 0] }] }] };
    expect(landingsOn(half, 0)).toEqual([]);
  });
});
