// Einfache 2D-Physik: Ball rollt unter Neigungs-"Gravitation", kollidiert mit
// Wand-Rechtecken, wird von Windzonen geschoben und offenen Löchern angesaugt.
// Deterministisch: keine Zeit-/Zufallsquellen außer den übergebenen Parametern.

import type {
  Anchor,
  Checkpoint,
  Collectible,
  Current,
  FogZone,
  GlassPlate,
  Goal,
  Guard,
  Hole,
  IcePatch,
  Key,
  Listener,
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
  listeners: Listener[] = [];
  fogZones: FogZone[] = [];
  ice: IcePatch[] = [];
  crystals: Collectible[] = [];
  anchors: Anchor[] = [];
  glass: GlassPlate[] = [];
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
  iceFriction = 0.15; // Dämpfung auf Eis: der Ball gleitet weiter
  iceControl = 0.45; // Anteil der Neigungs-Beschleunigung auf Eis (schwammig)
  /** Ab dieser Ballgeschwindigkeit gilt "in Bewegung" (Horcher jagt) */
  listenerWakeSpeed = 40;

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
      // Eis: weniger Grip in beide Richtungen – schwächeres Lenken UND
      // schwächeres Bremsen (niedrigere Reibung unten).
      const iced = this.onIce();
      const control = iced ? this.iceControl : 1;
      b.vx += tilt.x * this.accel * control * h;
      b.vy += tilt.y * this.accel * control * h;
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
      const damp = Math.exp(-(iced ? this.iceFriction : this.friction) * h);
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
      this.updateListeners(h);

      // Sog-Anker: Anziehung wächst zum Zentrum hin, bleibt aber immer unter
      // der Neigungs-Beschleunigung – zäh, nie eine Falle.
      for (const a of this.anchors) {
        const adx = a.x - b.x,
          ady = a.y - b.y;
        const ad = Math.hypot(adx, ady);
        if (ad < a.r && ad > 1e-6) {
          const pull = a.force * (1 - ad / a.r);
          b.vx += (adx / ad) * pull * h;
          b.vy += (ady / ad) * pull * h;
        }
      }

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

  // Horcher: jagen den Ball geradlinig (sie hören durch Wände), solange er
  // rollt; steht er still, ziehen sie sich zum Heimatpunkt zurück.
  // Deterministisch: hängt nur von Ballzustand und dt ab.
  private updateListeners(dt: number): void {
    const b = this.ball;
    const moving = b.speed > this.listenerWakeSpeed;
    for (const l of this.listeners) {
      const target = moving ? b : l.home;
      // Jagd skaliert mit der Rollgeschwindigkeit; Rückzug mit halber Kraft.
      const v = moving ? l.speed * Math.min(1, b.speed / 260) : l.speed * 0.5;
      const dx = target.x - l.x,
        dy = target.y - l.y;
      const d = Math.hypot(dx, dy);
      if (d < 1e-6) continue;
      const step = Math.min(d, v * dt);
      l.x += (dx / d) * step;
      l.y += (dy / d) * step;
    }
  }

  /** Liegt der Ballmittelpunkt gerade auf einer Eisfläche? */
  onIce(): boolean {
    const b = this.ball;
    return this.ice.some((z) => b.x > z.x && b.x < z.x + z.w && b.y > z.y && b.y < z.y + z.h);
  }

  // Horcher, der den Ball gerade berührt, sonst null.
  listenerCaught(): Listener | null {
    const b = this.ball;
    for (const l of this.listeners) {
      if (Math.hypot(l.x - b.x, l.y - b.y) < l.r + b.r) return l;
    }
    return null;
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
