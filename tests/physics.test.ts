import { describe, expect, it } from 'vitest';
import { Ball, World } from '../src/core/physics';
import { generateMaze, mazeToWalls } from '../src/core/maze';
import { mulberry32 } from '../src/core/rng';

describe('Löcher', () => {
  it('verschluckt nicht aus der Ferne, aber wenn der Mittelpunkt darüber rollt', () => {
    const world = new World([], new Ball(50, 50, 22), { x: 500, y: 500, r: 30 }, [
      { x: 200, y: 50, r: 27.5 },
    ]);
    expect(world.fallenHole()).toBeNull();
    world.ball.x = 195;
    expect(world.fallenHole()).not.toBeNull();
  });

  it('nearestHole liefert den Randabstand', () => {
    const world = new World([], new Ball(100, 50, 22), { x: 500, y: 500, r: 30 }, [
      { x: 200, y: 50, r: 27.5 },
    ]);
    expect(world.nearestHole()!.dist).toBeCloseTo(100 - 27.5, 6);
  });

  it('offenes Loch saugt den Ball an', () => {
    const world = new World([], new Ball(165, 50, 22), { x: 500, y: 500, r: 30 }, [
      { x: 200, y: 50, r: 27.5 },
    ]);
    world.step(0.05, { x: 0, y: 0 });
    expect(world.ball.vx).toBeGreaterThan(0);
  });

  it('geschlossenes Loch ist harmlos (kein Sturz, kein Sog)', () => {
    const world = new World([], new Ball(195, 50, 22), { x: 500, y: 500, r: 30 }, [
      { x: 200, y: 50, r: 27.5, openness: 0 },
    ]);
    expect(world.fallenHole()).toBeNull();
    world.step(0.05, { x: 0, y: 0 });
    expect(Math.abs(world.ball.vx)).toBeLessThan(1);
    world.holes[0]!.openness = 1;
    expect(world.fallenHole()).not.toBeNull();
  });
});

describe('Wände', () => {
  it('Ball tunnelt bei 10 s Volllast nicht aus dem Labyrinth', () => {
    const rng = mulberry32(1);
    const cells = generateMaze(6, 8, rng);
    const walls = mazeToWalls(cells, 6, 8, 100, 10);
    const world = new World(walls, new Ball(50, 50, 22), { x: 550, y: 750, r: 30 });
    for (let i = 0; i < 600; i++) {
      world.step(1 / 60, { x: 1, y: 1 });
      const b = world.ball;
      expect(b.x).toBeGreaterThan(-5);
      expect(b.y).toBeGreaterThan(-5);
      expect(b.x).toBeLessThan(605);
      expect(b.y).toBeLessThan(805);
    }
  });
});

describe('Windzonen', () => {
  it('schieben den Ball innerhalb der Zone', () => {
    const world = new World([], new Ball(150, 150, 22), { x: 500, y: 500, r: 30 });
    world.windZones = [{ x: 100, y: 100, w: 100, h: 100, fx: 1150, fy: 0 }];
    world.step(0.1, { x: 0, y: 0 });
    expect(world.ball.vx).toBeGreaterThan(50);
  });

  it('wirken außerhalb der Zone nicht', () => {
    const world = new World([], new Ball(350, 350, 22), { x: 500, y: 500, r: 30 });
    world.windZones = [{ x: 100, y: 100, w: 100, h: 100, fx: 1150, fy: 0 }];
    world.step(0.1, { x: 0, y: 0 });
    expect(Math.abs(world.ball.vx)).toBeLessThan(1);
  });
});
