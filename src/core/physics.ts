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
  Hourglass,
  Bell,
  ReverbZone,
  Boulder,
  Goal,
  Guard,
  Hole,
  IcePatch,
  Jukebox,
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
  Torch,
} from './types';
import { ABSORB_GAIN, shielded } from './occlusion';

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
  torches: Torch[] = [];
  ice: IcePatch[] = [];
  crystals: Collectible[] = [];
  hourglasses: Hourglass[] = [];
  bells: Bell[] = [];
  reverbZones: ReverbZone[] = [];
  boulders: Boulder[] = [];
  /** Rollstein (M47): ab dieser Aufprallgeschwindigkeit (px/s) rollt er */
  pushSpeed = 170;
  /** Dauer eines Zellen-Rollens in Sekunden */
  boulderRollS = 0.35;
  /** Steine, die in diesem Schritt losgerollt / angekommen / versunken sind (Klang) */
  boulderEvents: Array<{ kind: 'roll' | 'stop' | 'sink' | 'plate'; x: number; y: number }> = [];
  anchors: Anchor[] = [];
  glass: GlassPlate[] = [];
  keys: Key[] = [];
  gems: Collectible[] = [];
  transporters: Transporter[] = [];
  jukeboxes: Jukebox[] = [];
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

      this.updateBoulders(h);
      this.advanceGuards(h);
      this.advanceHoles(h);
      this.updateBells(h);
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

  /** Wächter laufen ihre Wegpunkte im Ping-Pong ab – deterministisch, ohne
   *  Physik und ohne Ball. Öffentlich, weil die Editor-Vorschau genau das
   *  braucht: Patrouillen laufen sehen, ohne zu spielen. */
  advanceGuards(dt: number): void {
    for (const g of this.guards) {
      // Schläfer (M45): wach = Patrouille wie jeder Wächter, die Uhr läuft ab;
      // schlafend = heim zu Wegpunkt 0 und dort stehen bleiben.
      if (g.sleeper) {
        if (g.sleeper.awakeLeft > 0) {
          g.sleeper.awakeLeft = Math.max(0, g.sleeper.awakeLeft - dt);
        } else {
          const home = g.waypoints[0]!;
          const dx = home.x - g.x,
            dy = home.y - g.y;
          const d = Math.hypot(dx, dy);
          const step = Math.min(d, g.speed * 0.6 * dt);
          if (d > 1e-6) {
            g.x += (dx / d) * step;
            g.y += (dy / d) * step;
          }
          g.target = g.waypoints.length > 1 ? 1 : 0;
          g.dir = 1;
          continue;
        }
      }
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
    // Lockglocke (M46): Solange eine Glocke klingt, ist SIE das Ziel – die
    // Horcher laufen zum Klang, nicht zum Ball. Ablenken statt Vermeiden.
    const ringing = this.bells.filter((bl) => bl.ringLeft > 0);
    for (const l of this.listeners) {
      if (ringing.length > 0) {
        let best = ringing[0]!;
        let bd = Infinity;
        for (const bl of ringing) {
          const d = Math.hypot(bl.x - l.x, bl.y - l.y);
          if (d < bd) {
            bd = d;
            best = bl;
          }
        }
        if (bd > 1e-6) {
          const step = Math.min(bd, l.speed * dt);
          l.x += ((best.x - l.x) / bd) * step;
          l.y += ((best.y - l.y) / bd) * step;
        }
        continue;
      }
      // Deckung (M43): Liegt eine Schallschutzwand zwischen Ball und Horcher,
      // kommt das Rollen nur gedämpft an – dieselbe Regel wie für jede andere
      // Klangquelle (occlusion.ts), nur in Gegenrichtung. Hinter der Wand darf
      // man also rollen, solange man nicht rast.
      const heardSpeed = shielded(this.walls, b.x, b.y, l.x, l.y) ? b.speed * ABSORB_GAIN : b.speed;
      const moving = heardSpeed > this.listenerWakeSpeed;
      const target = moving ? b : l.home;
      // Jagd skaliert mit der gehörten Rollgeschwindigkeit; Rückzug mit halber Kraft.
      const v = moving ? l.speed * Math.min(1, heardSpeed / 260) : l.speed * 0.5;
      const dx = target.x - l.x,
        dy = target.y - l.y;
      const d = Math.hypot(dx, dy);
      if (d < 1e-6) continue;
      const step = Math.min(d, v * dt);
      l.x += (dx / d) * step;
      l.y += (dy / d) * step;
    }
  }

  /** Rollstein als Kollisions-Rechteck (Kasten um die gezeichnete Mitte). */
  static boulderRect(b: Boulder): Wall {
    return { x: b.x - b.size / 2, y: b.y - b.size / 2, w: b.size, h: b.size };
  }

  /** Ist die Zelle für einen Stein frei? Keine Wand im Zielkasten (offene
   *  Türen ausgenommen; Schiebewände zählen IMMER als Wand), kein anderer
   *  Stein, kein Transporter, keine Glocke. Konservativ – wie der Beweis. */
  boulderCellFree(cx: number, cy: number, cell: number, except: Boulder): boolean {
    const size = except.size;
    // Geprüft wird der ÜBERSTRICHENE Bereich von der jetzigen Mitte bis zur
    // Zielzelle – die Wand zwischen zwei Zellen liegt auf der Kante, nicht im
    // Zielkasten (der hat 14 px Luft zum Rand).
    const tx = (cx + 0.5) * cell,
      ty = (cy + 0.5) * cell;
    const x0 = Math.min(except.x, tx) - size / 2,
      y0 = Math.min(except.y, ty) - size / 2;
    const rect = { x: x0, y: y0, w: Math.max(except.x, tx) + size / 2 - x0, h: Math.max(except.y, ty) + size / 2 - y0 };
    const overlaps = (r: { x: number; y: number; w: number; h: number }) =>
      rect.x < r.x + r.w && rect.x + rect.w > r.x && rect.y < r.y + r.h && rect.y + rect.h > r.y;
    for (const w of this.walls) {
      if (w.door?.open && !w.slide) continue;
      if (overlaps(w)) return false;
    }
    for (const o of this.boulders) {
      if (o === except || o.sunk) continue;
      const oc = o.move ? [Math.floor(o.move.toX / cell), Math.floor(o.move.toY / cell)] : o.cell;
      if (oc[0] === cx && oc[1] === cy) return false;
    }
    for (const t of this.transporters) if (Math.floor(t.x / cell) === cx && Math.floor(t.y / cell) === cy) return false;
    for (const bl of this.bells) if (Math.floor(bl.x / cell) === cx && Math.floor(bl.y / cell) === cy) return false;
    return true;
  }

  /** Rollsteine (M47): Kollision mit dem Ball, Anstoß, Rollen, Ankunft.
   *  Zellgröße ist implizit: `size` ist 0,72 Zellen, also Zelle = size/0.72. */
  private updateBoulders(dt: number): void {
    const b = this.ball;
    for (const st of this.boulders) {
      if (st.sunk) continue;
      const cell = st.size / 0.72;
      if (st.move) {
        st.move.t = Math.min(1, st.move.t + dt / this.boulderRollS);
        const k = st.move.t;
        st.x = st.move.fromX + (st.move.toX - st.move.fromX) * k;
        st.y = st.move.fromY + (st.move.toY - st.move.fromY) * k;
        if (k >= 1) {
          const dir = st.move.dir;
          st.move = null;
          st.cell = [Math.floor(st.x / cell), Math.floor(st.y / cell)];
          // Loch füllen: ein stehendes, offenes Loch unter der Mitte.
          const hi = this.holes.findIndex((h) => !h.roam && !h.breathing && Math.hypot(h.x - st.x, h.y - st.y) < cell * 0.4);
          if (hi >= 0) {
            this.holes.splice(hi, 1);
            st.sunk = true;
            this.boulderEvents.push({ kind: 'sink', x: st.x, y: st.y });
            continue;
          }
          // Eis: weiterrollen, solange die nächste Zelle frei ist.
          const onIce = this.ice.some((z) => st.x > z.x && st.x < z.x + z.w && st.y > z.y && st.y < z.y + z.h);
          if (onIce && this.boulderCellFree(st.cell[0] + dir[0], st.cell[1] + dir[1], cell, st)) {
            this.startBoulderMove(st, dir, cell);
            continue;
          }
          this.boulderEvents.push({ kind: 'stop', x: st.x, y: st.y });
        }
      }
      // Platten: der Stein hält, was unter ihm liegt (auch während er ankommt).
      for (const pl of this.plates) {
        const on = !st.move && Math.hypot(pl.x - st.x, pl.y - st.y) < cell * 0.4;
        if (on && !pl.boulder) this.boulderEvents.push({ kind: 'plate', x: st.x, y: st.y });
        if (on) pl.boulder = true;
        else if (pl.boulder && this.boulders.every((o) => o.sunk || o.move || Math.hypot(pl.x - o.x, pl.y - o.y) >= cell * 0.4)) pl.boulder = false;
      }
      // Kollision Ball ↔ Stein: fester Kasten; ein kräftiger Stoß rollt ihn an.
      const hit = this.collideCircleRect(b, World.boulderRect(st));
      if (!hit || st.move) continue;
      if (hit.impact < this.pushSpeed) continue;
      // Stoßrichtung = entgegen der Kollisionsnormalen, auf die Achse gerundet.
      const dir: [number, number] = Math.abs(hit.nx) > Math.abs(hit.ny) ? [hit.nx > 0 ? -1 : 1, 0] : [0, hit.ny > 0 ? -1 : 1];
      if (this.boulderCellFree(st.cell[0] + dir[0], st.cell[1] + dir[1], cell, st)) this.startBoulderMove(st, dir, cell);
    }
  }

  private startBoulderMove(st: Boulder, dir: [number, number], cell: number): void {
    const toX = (st.cell[0] + dir[0] + 0.5) * cell;
    const toY = (st.cell[1] + dir[1] + 0.5) * cell;
    st.move = { fromX: st.x, fromY: st.y, toX, toY, t: 0, dir };
    this.boulderEvents.push({ kind: 'roll', x: st.x, y: st.y });
  }

  /** Stein-Ereignisse seit dem letzten Aufruf (für den Klang). */
  consumeBoulderEvents(): Array<{ kind: 'roll' | 'stop' | 'sink' | 'plate'; x: number; y: number }> {
    const e = this.boulderEvents;
    this.boulderEvents = [];
    return e;
  }

  /** Wanderlöcher (M46) laufen ihre Wegpunkte im Ping-Pong ab – wie Wächter,
   *  deterministisch, ohne Ball. Öffentlich für die Editor-Vorschau. */
  advanceHoles(dt: number): void {
    for (const hole of this.holes) {
      const r = hole.roam;
      if (!r || r.waypoints.length < 2) continue;
      let remaining = r.speed * dt;
      while (remaining > 0) {
        const t = r.waypoints[r.target]!;
        const dx = t.x - hole.x,
          dy = t.y - hole.y;
        const d = Math.hypot(dx, dy);
        if (d <= remaining) {
          hole.x = t.x;
          hole.y = t.y;
          remaining -= d;
          if (r.target + r.dir < 0 || r.target + r.dir >= r.waypoints.length) r.dir = -r.dir as 1 | -1;
          r.target += r.dir;
        } else {
          hole.x += (dx / d) * remaining;
          hole.y += (dy / d) * remaining;
          remaining = 0;
        }
      }
    }
  }

  /** Lockglocken (M46): Nachklang herunterzählen, Überrollen als Kanten-Trigger
   *  anschlagen. Liefert die in diesem Schritt NEU angeschlagenen Glocken. */
  private rungNow: Bell[] = [];
  private updateBells(dt: number): void {
    const b = this.ball;
    for (const bl of this.bells) {
      if (bl.ringLeft > 0) bl.ringLeft = Math.max(0, bl.ringLeft - dt);
      const on = Math.hypot(bl.x - b.x, bl.y - b.y) < bl.r + b.r * 0.5;
      if (on && !bl.inside) {
        bl.ringLeft = bl.ringS;
        this.rungNow.push(bl);
      }
      bl.inside = on;
    }
  }
  /** Seit dem letzten Aufruf angeschlagene Glocken (für den Klang). */
  consumeRings(): Bell[] {
    const r = this.rungNow;
    this.rungNow = [];
    return r;
  }

  /** Liegt der Ballmittelpunkt gerade in einem Hallraum? */
  inReverb(): boolean {
    const b = this.ball;
    return this.reverbZones.some((z) => b.x > z.x && b.x < z.x + z.w && b.y > z.y && b.y < z.y + z.h);
  }

  /** Schläfer wecken (M45): Ein Echo-Ping bei (x,y) weckt jeden Schläfer in
   *  seinem Weckradius für `awakeS` Sekunden. Liefert die Geweckten (Klang). */
  wakeSleepers(x: number, y: number): Guard[] {
    const woken: Guard[] = [];
    for (const g of this.guards) {
      if (!g.sleeper) continue;
      if (Math.hypot(g.x - x, g.y - y) > g.sleeper.wakeRadius) continue;
      if (g.sleeper.awakeLeft <= 0) woken.push(g);
      g.sleeper.awakeLeft = g.sleeper.awakeS;
    }
    return woken;
  }

  /** Schläft dieser Wächter gerade? (Kein Schläfer = nie.) */
  static asleep(g: Guard): boolean {
    return g.sleeper !== undefined && g.sleeper.awakeLeft <= 0;
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
