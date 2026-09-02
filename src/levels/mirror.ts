// Level-Spiegelung: erzeugt aus einem handgebauten Level ein exaktes
// Spiegelbild (horizontal, vertikal oder beides), damit nicht jedes Level
// oben links startet und unten rechts endet. mirrorLevel transformiert alle
// Def-Koordinaten (Kanten, Elemente, Start/Ziel, Richtungen) und setzt das
// mirror-Feld; Loader und Test-Helfer spiegeln damit zusätzlich das
// generierte Maze-Rauschen (mirrorCells) – per Symmetrie bleiben alle
// bewiesenen Invarianten (Lösbarkeit, Tür-Semantik, Patrouillen) erhalten.
//
// Achtung bei der Achsenwahl: Intro-Texte mit Richtungsbezug ("im oberen
// Gang", "rechts") müssen zur Achse passen – 'x' erhält oben/unten,
// 'y' erhält links/rechts.

import type { ElementDef, FloorDef, LevelDef } from './schema';

export type MirrorAxis = 'x' | 'y' | 'xy';
type Dir = 'n' | 'e' | 's' | 'w';
type Coord = [number, number];
type Edge = [Coord, Dir];

const DIR_X: Record<Dir, Dir> = { n: 'n', s: 's', e: 'w', w: 'e' };
const DIR_Y: Record<Dir, Dir> = { n: 's', s: 'n', e: 'e', w: 'w' };

function mirrorLevelDir(dir: Dir, axis: MirrorAxis): Dir {
  let d = dir;
  if (axis.includes('x')) d = DIR_X[d];
  if (axis.includes('y')) d = DIR_Y[d];
  return d;
}

function mirrorCoord([x, y]: readonly [number, number], cols: number, rows: number, axis: MirrorAxis): Coord {
  return [axis.includes('x') ? cols - 1 - x : x, axis.includes('y') ? rows - 1 - y : y];
}

function mirrorFloor(floor: FloorDef, axis: MirrorAxis, sizes: ReadonlyArray<readonly [number, number]>): FloorDef {
  const [cols, rows] = floor.size;
  const mc = (c: readonly [number, number]): Coord => mirrorCoord(c, cols, rows, axis);
  const me = ([c, d]: Edge): Edge => [mc(c), mirrorLevelDir(d, axis)];

  const elements = floor.elements.map((el): ElementDef => {
    switch (el.type) {
      case 'guard':
        return { ...el, patrol: el.patrol.map(mc) };
      case 'door':
        return { ...el, edge: me(el.edge as Edge) };
      case 'slidingWall':
        return { ...el, edge: me(el.edge as Edge) };
      case 'windZone':
      case 'current':
        return { ...el, cell: mc(el.cell), dir: mirrorLevelDir(el.dir, axis) };
      case 'hole':
        return {
          ...el,
          cell: mc(el.cell),
          jitter: [axis.includes('x') ? -el.jitter[0] : el.jitter[0], axis.includes('y') ? -el.jitter[1] : el.jitter[1]],
        };
      case 'transporter': {
        const [tc, tr] = sizes[el.target.floor]!;
        return { ...el, cell: mc(el.cell), target: { floor: el.target.floor, cell: mirrorCoord(el.target.cell, tc, tr, axis) } };
      }
      default:
        return { ...el, cell: mc(el.cell) };
    }
  });

  return {
    ...floor,
    maze: {
      ...floor.maze,
      carve: floor.maze.carve.map((e) => me(e as Edge)),
      add: floor.maze.add.map((e) => me(e as Edge)),
      brittle: floor.maze.brittle.map((e) => me(e as Edge)),
      absorb: floor.maze.absorb.map((e) => me(e as Edge)),
      mirrors: floor.maze.mirrors.map((e) => me(e as Edge)),
    },
    elements,
    start: mc(floor.start),
    goal: floor.goal ? mc(floor.goal) : null,
  };
}

export function mirrorLevel(def: LevelDef, axis: MirrorAxis): LevelDef {
  if (def.mirror) throw new Error(`mirrorLevel: ${def.id} ist bereits gespiegelt`);
  const sizes = def.floors.map((f) => f.size);
  return { ...def, floors: def.floors.map((f) => mirrorFloor(f, axis, sizes)), mirror: axis };
}
