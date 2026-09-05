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

describe('Wächter', () => {
  it('läuft im Ping-Pong über seine Wegpunkte', () => {
    const world = new World([], new Ball(500, 500, 22), { x: 900, y: 900, r: 30 });
    world.guards.push({
      x: 50, y: 50, r: 26, speed: 100,
      waypoints: [{ x: 50, y: 50 }, { x: 250, y: 50 }],
      target: 1, dir: 1, waitLeft: 0,
    });
    const g = world.guards[0]!;
    for (let i = 0; i < 60; i++) world.step(1 / 60, { x: 0, y: 0 }); // 1 s -> 100 px
    expect(g.x).toBeCloseTo(150, 0);
    for (let i = 0; i < 90; i++) world.step(1 / 60, { x: 0, y: 0 }); // +1,5 s -> am Ende, kehrt um
    expect(g.x).toBeLessThan(250);
    expect(g.dir).toBe(-1);
    expect(g.y).toBe(50);
  });

  it('fängt den Ball bei Berührung', () => {
    const world = new World([], new Ball(100, 50, 22), { x: 900, y: 900, r: 30 });
    world.guards.push({
      x: 300, y: 50, r: 26, speed: 0,
      waypoints: [{ x: 300, y: 50 }], target: 0, dir: 1, waitLeft: 0,
    });
    expect(world.guardCaught()).toBeNull();
    world.ball.x = 260;
    expect(world.guardCaught()).not.toBeNull();
  });
});

describe('Schiebewände', () => {
  const cycle = { open: 3, closed: 2, ramp: 0.5, offset: 0 };

  it('blockiert geschlossen und lässt nur das voll geöffnete Plateau passieren', () => {
    const wall = { x: 195, y: 0, w: 10, h: 100, slide: { cycle, openness: 0 } };
    const world = new World([wall], new Ball(150, 50, 22), { x: 500, y: 50, r: 30 });
    for (let i = 0; i < 60; i++) world.step(1 / 60, { x: 1, y: 0 });
    expect(world.ball.x).toBeLessThan(195); // zu: prallt ab

    wall.slide.openness = 0.9; // Rampe: Spalt zu schmal, weiterhin solide
    world.ball.x = 150;
    world.ball.vx = 0;
    for (let i = 0; i < 60; i++) world.step(1 / 60, { x: 1, y: 0 });
    expect(world.ball.x).toBeLessThan(195);

    wall.slide.openness = 1; // offen: durchrollen
    world.ball.x = 150;
    world.ball.vx = 0;
    for (let i = 0; i < 90; i++) world.step(1 / 60, { x: 1, y: 0 });
    expect(world.ball.x).toBeGreaterThan(250);
  });

  it('schiebt einen Ball im Spalt beim Schließen wieder hinaus', () => {
    const wall = { x: 195, y: 0, w: 10, h: 100, slide: { cycle, openness: 1 } };
    const world = new World([wall], new Ball(200, 50, 22), { x: 500, y: 50, r: 30 });
    wall.slide.openness = 0; // schließt, Ball steht mitten in der Kante
    world.step(1 / 60, { x: 0, y: 0 });
    expect(Math.abs(world.ball.x - 200)).toBeGreaterThan(10); // ausgestoßen
  });
});

describe('Strömungen', () => {
  it('ist gegen volle Neigung unüberwindbar – Wind mit derselben Lage nicht', () => {
    // Ball am stromabwärtigen Rand, volle Neigung GEGEN die Strömung: er
    // kommt nie am stromaufwärtigen Rand (x=100) hinaus.
    const strong = new World([], new Ball(190, 150, 22), { x: 500, y: 500, r: 30 });
    strong.currents = [{ x: 100, y: 100, w: 100, h: 100, fx: 3400, fy: 0, dir: 'e' }];
    let minX = strong.ball.x;
    for (let i = 0; i < 240; i++) {
      strong.step(1 / 60, { x: -1, y: 0 });
      minX = Math.min(minX, strong.ball.x);
    }
    expect(minX).toBeGreaterThan(100);
    // Gegenprobe: eine Windzone (schwächer als die Neigung) verliert.
    const wind = new World([], new Ball(190, 150, 22), { x: 500, y: 500, r: 30 });
    wind.windZones = [{ x: 100, y: 100, w: 100, h: 100, fx: 1150, fy: 0 }];
    for (let i = 0; i < 240; i++) wind.step(1 / 60, { x: -1, y: 0 });
    expect(wind.ball.x).toBeLessThan(100);
  });

  it('reißt einen ruhenden Ball mit', () => {
    const world = new World([], new Ball(150, 150, 22), { x: 500, y: 500, r: 30 });
    world.currents = [{ x: 100, y: 100, w: 100, h: 100, fx: 3400, fy: 0, dir: 'e' }];
    world.step(0.1, { x: 0, y: 0 });
    expect(world.ball.vx).toBeGreaterThan(100);
  });
});

describe('Zeitschloss-Schalter', () => {
  it('switchUnderBall nutzt die Platten-Toleranz (halber Ballradius)', () => {
    const world = new World([], new Ball(100, 50, 22), { x: 900, y: 900, r: 30 });
    world.switches.push({ x: 200, y: 50, r: 30, opens: ['tor'], durationS: 6, openUntil: null, held: false });
    expect(world.switchUnderBall()).toBeNull();
    world.ball.x = 165; // Abstand 35 < 30 + 11
    expect(world.switchUnderBall()).not.toBeNull();
  });
});

describe('Horcher', () => {
  const withListener = () => {
    const world = new World([], new Ball(500, 300, 22), { x: 900, y: 900, r: 30 });
    world.listeners.push({ x: 100, y: 300, r: 26, speed: 100, home: { x: 100, y: 300 } });
    return world;
  };

  it('bewegt sich NUR, solange der Ball rollt (deterministisch aus der Ballbewegung)', () => {
    const world = withListener();
    const l = world.listeners[0]!;
    for (let i = 0; i < 60; i++) world.step(1 / 60, { x: 0, y: 0 }); // Ball still
    expect(l.x).toBe(100);
    world.ball.vx = 400; // Ball rollt -> er jagt
    for (let i = 0; i < 30; i++) world.step(1 / 60, { x: 1, y: 0 });
    expect(l.x).toBeGreaterThan(120);
  });

  it('zieht sich bei Stille zum Heimatpunkt zurück', () => {
    const world = withListener();
    const l = world.listeners[0]!;
    l.x = 300; // war schon auf der Jagd
    for (let i = 0; i < 240; i++) world.step(1 / 60, { x: 0, y: 0 });
    expect(l.x).toBeLessThan(150); // wieder fast daheim
  });

  it('fängt den Ball bei Berührung', () => {
    const world = withListener();
    expect(world.listenerCaught()).toBeNull();
    world.listeners[0]!.x = world.ball.x - 30;
    world.listeners[0]!.y = world.ball.y;
    expect(world.listenerCaught()).not.toBeNull();
  });
});

describe('Eisflächen', () => {
  it('auf Eis gleitet der Ball weiter (weniger Reibung), daneben bremst er normal', () => {
    const roll = (ice: boolean) => {
      const world = new World([], new Ball(150, 150, 22), { x: 900, y: 900, r: 30 });
      if (ice) world.ice = [{ x: 0, y: 0, w: 1000, h: 1000 }];
      world.ball.vx = 400;
      for (let i = 0; i < 60; i++) world.step(1 / 60, { x: 0, y: 0 }); // 1 s ausrollen
      return world.ball.vx;
    };
    const onIce = roll(true);
    const offIce = roll(false);
    expect(onIce).toBeGreaterThan(offIce * 2); // Eis hält die Fahrt
    expect(offIce).toBeLessThan(150);
  });

  it('Lenken ist auf Eis schwammig (reduzierter Grip)', () => {
    const accel = (ice: boolean) => {
      const world = new World([], new Ball(150, 150, 22), { x: 900, y: 900, r: 30 });
      if (ice) world.ice = [{ x: 0, y: 0, w: 1000, h: 1000 }];
      world.step(0.1, { x: 1, y: 0 });
      return world.ball.vx;
    };
    expect(accel(true)).toBeLessThan(accel(false) * 0.6);
  });
});

describe('Sog-Anker', () => {
  it('zieht im Radius an, außerhalb nicht', () => {
    const world = new World([], new Ball(200, 150, 22), { x: 900, y: 900, r: 30 });
    world.anchors = [{ x: 150, y: 150, r: 120, force: 2000 }];
    world.step(0.05, { x: 0, y: 0 });
    expect(world.ball.vx).toBeLessThan(-10); // Richtung Zentrum (links)
    const far = new World([], new Ball(400, 150, 22), { x: 900, y: 900, r: 30 });
    far.anchors = [{ x: 150, y: 150, r: 120, force: 2000 }];
    far.step(0.05, { x: 0, y: 0 });
    expect(Math.abs(far.ball.vx)).toBeLessThan(1);
  });

  it('ist mit voller Neigung immer überwindbar (Kraft < Beschleunigung)', () => {
    // Ball im Zentrum des Ankers, volle Neigung nach rechts: er entkommt.
    const world = new World([], new Ball(150, 150, 22), { x: 900, y: 900, r: 30 });
    world.anchors = [{ x: 150, y: 150, r: 120, force: 2400 }]; // Schema-Maximum
    for (let i = 0; i < 240; i++) world.step(1 / 60, { x: 1, y: 0 });
    expect(world.ball.x).toBeGreaterThan(270); // aus dem Radius heraus
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

// M72: Pause je Wegpunkt – der Wächter hält dort an, statt durchzulaufen.
describe('Wächter-Pause', () => {
  const mk = (pause: number) => {
    const world = new World([], new Ball(900, 900, 22), { x: 1500, y: 1500, r: 30 });
    world.guards.push({
      x: 50, y: 50, r: 26, speed: 100,
      waypoints: [{ x: 50, y: 50 }, { x: 150, y: 50, pause }],
      target: 1, dir: 1, waitLeft: 0,
    });
    return { world, g: world.guards[0]! };
  };
  const run = (world: World, seconds: number) => {
    for (let i = 0; i < Math.round(seconds * 60); i++) world.advanceGuards(1 / 60);
  };

  it('ohne Pause läuft er sofort zurück', () => {
    const { world, g } = mk(0);
    run(world, 1.5); // 1 s bis zum Wegpunkt, dann 0,5 s zurück
    expect(g.x).toBeCloseTo(100, 0);
    expect(g.dir).toBe(-1);
  });
  it('mit Pause bleibt er am Wegpunkt stehen und läuft danach weiter', () => {
    const { world, g } = mk(2);
    run(world, 1.5); // nach 1 s am Wegpunkt, dann 0,5 s Pause
    expect(g.x).toBeCloseTo(150, 0);
    expect(g.waitLeft).toBeGreaterThan(0);
    run(world, 0.9); // Pause noch nicht ganz um (2 s ab t=1 s)
    expect(g.x).toBeCloseTo(150, 0);
    run(world, 1); // Pause vorbei -> zurück auf dem Weg
    expect(g.x).toBeLessThan(120);
    expect(g.dir).toBe(-1);
    expect(g.waitLeft).toBe(0);
  });
  it('ein Schläfer wartet nicht, er schläft (waitLeft bleibt 0)', () => {
    const { world, g } = mk(3);
    g.sleeper = { wakeRadius: 200, awakeS: 5, awakeLeft: 0 };
    run(world, 2);
    expect(g.waitLeft).toBe(0);
    expect(g.x).toBeCloseTo(50, 0); // heim zu Wegpunkt 0
  });
});
