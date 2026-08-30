// Einfache 2D-Physik: Ball rollt unter Neigungs-"Gravitation", kollidiert mit
// Wand-Rechtecken, wird von Windzonen geschoben und offenen Löchern angesaugt.
// Deterministisch: keine Zeit-/Zufallsquellen außer den übergebenen Parametern.

import type {
  Checkpoint,
  Collectible,
  Current,
  Goal,
  Guard,
  Hole,
  Key,
  PingWave,
  Plate,
  Tilt,
  TimedSwitch,
  Transporter,
  Wall,
  WallHit,
  WindZone,
} from './types';

export class Ball {
  vx = 0;
  vy = 0;
  constructor(
    public x: number,
    public y: number,
    public r: number,
  ) {}
  get speed(): number {
    return Math.hypot(this.vx, this.vy);
  }
}

export class World {
  windZones: WindZone[] = [];
  currents: Current[] = [];
  switches: TimedSwitch[] = [];
  checkpoints: Checkpoint[] = [];
  guards: Guard[] = [];
  keys: Key[] = [];
  gems: Collectible[] = [];
  transporters: Transporter[] = [];
  plates: Plate[] = [];
  debris: Wall[] = [];
  pings: PingWave[] = [];
  accel = 2600; // px/s² bei voller Neigung
  friction = 1.4; // Roll-Dämpfung pro Sekunde
  restitution = 0.38; // Abprall-Energieanteil
  maxSpeed = 900;

  constructor(
    public walls: Wall[],
    public ball: Ball,
    /** null = das Ziel liegt auf einer anderen Ebene */
    public goal: Goal | null,
    public holes: Hole[] = [],
  ) {}

  // tilt: {x,y} in [-1,1]. Liefert Kollisionsereignisse dieses Schritts.
  step(dt: number, tilt: Tilt): WallHit[] {
    const b = this.ball;
    const hits: WallHit[] = [];
    // Substeps verhindern Tunneln durch dünne Wände.
    const steps = Math.max(1, Math.ceil((b.speed * dt) / (b.r * 0.8)));
    const h = dt / steps;

    for (let i = 0; i < steps; i++) {
      b.vx += tilt.x * this.accel * h;
      b.vy += tilt.y * this.accel * h;
      for (const z of this.windZones) {
        if (b.x > z.x && b.x < z.x + z.w && b.y > z.y && b.y < z.y + z.h) {
          b.vx += z.fx * h;
          b.vy += z.fy * h;
        }
      }
      // Strömung: wie Wind, aber stärker als die Neigung – unüberwindbar.
      for (const z of this.currents) {
        if (b.x > z.x && b.x < z.x + z.w && b.y > z.y && b.y < z.y + z.h) {
          b.vx += z.fx * h;
          b.vy += z.fy * h;
        }
      }
      const damp = Math.exp(-this.friction * h);
      b.vx *= damp;
      b.vy *= damp;
      const sp = b.speed;
      if (sp > this.maxSpeed) {
        b.vx *= this.maxSpeed / sp;
        b.vy *= this.maxSpeed / sp;
      }
      b.x += b.vx * h;
      b.y += b.vy * h;

      for (const wall of this.walls) {
        if (wall.door?.open) continue; // offene Coop-Tür ist passierbar
        // Schiebewand: nur im voll geöffneten Plateau passierbar – während der
        // Rampe gilt der Spalt als zu schmal (und die Wand schiebt den Ball raus).
        if (wall.slide && wall.slide.openness >= 0.999) continue;
        const hit = this.collideCircleRect(b, wall);
        if (hit) hits.push(hit);
      }

      this.updateGuards(h);

      // Offene Löcher ziehen den Ball leicht an, sobald er über den Rand rollt.
      // openness (0 zu, 1 offen) skaliert den Sog; fehlt es, gilt das Loch als offen.
      for (const hole of this.holes) {
        const open = hole.openness ?? 1;
        if (open < 0.2) continue;
        const dx = hole.x - b.x,
          dy = hole.y - b.y;
        const d = Math.hypot(dx, dy);
        if (d < hole.r + b.r && d > 1e-6) {
          const pull = this.accel * 0.55 * open * (1 - d / (hole.r + b.r));
          b.vx += (dx / d) * pull * h;
          b.vy += (dy / d) * pull * h;
        }
      }
    }
    return hits;
  }

  private collideCircleRect(b: Ball, rect: Wall): WallHit | null {
    const cx = Math.max(rect.x, Math.min(b.x, rect.x + rect.w));
    const cy = Math.max(rect.y, Math.min(b.y, rect.y + rect.h));
    const dx = b.x - cx,
      dy = b.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= b.r * b.r) return null;

    let nx: number, ny: number, pen: number;
    if (d2 > 1e-9) {
      const d = Math.sqrt(d2);
      nx = dx / d;
      ny = dy / d;
      pen = b.r - d;
    } else {
      // Mittelpunkt im Rechteck: entlang der geringsten Überdeckung ausstoßen.
      const left = b.x - rect.x,
        right = rect.x + rect.w - b.x;
      const top = b.y - rect.y,
        bottom = rect.y + rect.h - b.y;
      const m = Math.min(left, right, top, bottom);
      if (m === left) {
        nx = -1;
        ny = 0;
      } else if (m === right) {
        nx = 1;
        ny = 0;
      } else if (m === top) {
        nx = 0;
        ny = -1;
      } else {
        nx = 0;
        ny = 1;
      }
      pen = b.r + m;
    }

    b.x += nx * pen;
    b.y += ny * pen;
    const vn = b.vx * nx + b.vy * ny;
    let impact = 0;
    if (vn < 0) {
      impact = -vn;
      b.vx -= (1 + this.restitution) * vn * nx;
      b.vy -= (1 + this.restitution) * vn * ny;
    }
    return { wall: rect, nx, ny, impact };
  }

  // Wächter laufen ihre Wegpunkte im Ping-Pong ab – deterministisch, ohne Physik.
  private updateGuards(dt: number): void {
    for (const g of this.guards) {
      let remaining = g.speed * dt;
      while (remaining > 0 && g.waypoints.length > 1) {
        const t = g.waypoints[g.target]!;
        const dx = t.x - g.x,
          dy = t.y - g.y;
        const d = Math.hypot(dx, dy);
        if (d <= remaining) {
          g.x = t.x;
          g.y = t.y;
          remaining -= d;
          if (g.target + g.dir < 0 || g.target + g.dir >= g.waypoints.length) g.dir = -g.dir as 1 | -1;
          g.target += g.dir;
        } else {
          g.x += (dx / d) * remaining;
          g.y += (dy / d) * remaining;
          remaining = 0;
        }
      }
    }
  }

  // Wächter, der den Ball gerade berührt, sonst null.
  guardCaught(): Guard | null {
    const b = this.ball;
    for (const g of this.guards) {
      if (Math.hypot(g.x - b.x, g.y - b.y) < g.r + b.r) return g;
    }
    return null;
  }

  // Loch, in das der Ball gerade fällt (Mittelpunkt über einem offenen Loch), sonst null.
  fallenHole(): Hole | null {
    const b = this.ball;
    for (const hole of this.holes) {
      if ((hole.openness ?? 1) < 0.6) continue;
      if (Math.hypot(hole.x - b.x, hole.y - b.y) < hole.r * 0.85) return hole;
    }
    return null;
  }

  // Nächstgelegenes Loch inkl. Randabstand.
  nearestHole(): { hole: Hole; dist: number } | null {
    const b = this.ball;
    let best: Hole | null = null,
      bestD = Infinity;
    for (const hole of this.holes) {
      const d = Math.hypot(hole.x - b.x, hole.y - b.y) - hole.r;
      if (d < bestD) {
        bestD = d;
        best = hole;
      }
    }
    return best ? { hole: best, dist: Math.max(0, bestD) } : null;
  }

  goalReached(): boolean {
    const g = this.goal;
    if (!g) return false;
    const b = this.ball;
    return Math.hypot(b.x - g.x, b.y - g.y) < g.r;
  }

  // Druckplatten, auf denen der Ball gerade steht.
  platesUnderBall(): Plate[] {
    // Gedrückt, sobald der Ball deutlich auf der Platte steht – auch wenn er
    // in einer Ecke an der Wand lehnt (halber Ballradius Toleranz).
    const b = this.ball;
    return this.plates.filter((pl) => Math.hypot(pl.x - b.x, pl.y - b.y) < pl.r + b.r / 2);
  }

  // Zeitschloss-Schalter, auf dem der Ball gerade steht, sonst null
  // (gleiche Toleranz wie Druckplatten).
  switchUnderBall(): TimedSwitch | null {
    const b = this.ball;
    for (const sw of this.switches) {
      if (Math.hypot(sw.x - b.x, sw.y - b.y) < sw.r + b.r / 2) return sw;
    }
    return null;
  }

  // Transporter, auf dem der Ball gerade steht, sonst null.
  transporterHit(): Transporter | null {
    const b = this.ball;
    for (const t of this.transporters) {
      if (Math.hypot(t.x - b.x, t.y - b.y) < t.r * 0.8) return t;
    }
    return null;
  }
}
