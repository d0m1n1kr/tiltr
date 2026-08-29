// Einfache 2D-Physik: Ball rollt unter Neigungs-"Gravitation", kollidiert mit Wand-Rechtecken.

export class Ball {
  constructor(x, y, r) {
    this.x = x; this.y = y; this.r = r;
    this.vx = 0; this.vy = 0;
  }
  get speed() { return Math.hypot(this.vx, this.vy); }
}

export class World {
  constructor(walls, ball, goal) {
    this.walls = walls;      // [{x,y,w,h}]
    this.ball = ball;
    this.goal = goal;        // {x,y,r}
    this.accel = 2600;       // px/s² bei voller Neigung
    this.friction = 1.4;     // Roll-Dämpfung pro Sekunde
    this.restitution = 0.38; // Abprall-Energieanteil
    this.maxSpeed = 900;
  }

  // tilt: {x,y} in [-1,1]. Liefert Kollisionsereignisse dieses Schritts.
  step(dt, tilt) {
    const b = this.ball;
    const hits = [];
    // Substeps verhindern Tunneln durch dünne Wände.
    const steps = Math.max(1, Math.ceil((b.speed * dt) / (b.r * 0.8)));
    const h = dt / steps;

    for (let i = 0; i < steps; i++) {
      b.vx += tilt.x * this.accel * h;
      b.vy += tilt.y * this.accel * h;
      const damp = Math.exp(-this.friction * h);
      b.vx *= damp; b.vy *= damp;
      const sp = b.speed;
      if (sp > this.maxSpeed) { b.vx *= this.maxSpeed / sp; b.vy *= this.maxSpeed / sp; }
      b.x += b.vx * h;
      b.y += b.vy * h;

      for (const wall of this.walls) {
        const hit = this.collideCircleRect(b, wall);
        if (hit) hits.push(hit);
      }
    }
    return hits;
  }

  collideCircleRect(b, rect) {
    const cx = Math.max(rect.x, Math.min(b.x, rect.x + rect.w));
    const cy = Math.max(rect.y, Math.min(b.y, rect.y + rect.h));
    const dx = b.x - cx, dy = b.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= b.r * b.r) return null;

    let nx, ny, pen;
    if (d2 > 1e-9) {
      const d = Math.sqrt(d2);
      nx = dx / d; ny = dy / d; pen = b.r - d;
    } else {
      // Mittelpunkt im Rechteck: entlang der geringsten Überdeckung ausstoßen.
      const left = b.x - rect.x, right = rect.x + rect.w - b.x;
      const top = b.y - rect.y, bottom = rect.y + rect.h - b.y;
      const m = Math.min(left, right, top, bottom);
      if (m === left) { nx = -1; ny = 0; } else if (m === right) { nx = 1; ny = 0; }
      else if (m === top) { nx = 0; ny = -1; } else { nx = 0; ny = 1; }
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

  goalReached() {
    const g = this.goal, b = this.ball;
    return Math.hypot(b.x - g.x, b.y - g.y) < g.r;
  }

  goalVector() {
    const g = this.goal, b = this.ball;
    const dx = g.x - b.x, dy = g.y - b.y;
    return { dx, dy, dist: Math.hypot(dx, dy) };
  }
}
