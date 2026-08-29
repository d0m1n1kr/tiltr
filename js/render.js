// Rendering: fast schwarzer Screen. Der Ball glimmt schwach, berührte Wände
// leuchten kurz auf ("Echo") und verblassen wieder – so offenbart sich die Welt.

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(innerWidth * dpr);
    this.canvas.height = Math.round(innerHeight * dpr);
    this.canvas.style.width = innerWidth + 'px';
    this.canvas.style.height = innerHeight + 'px';
    this.dpr = dpr;
  }

  // Welt (worldW x worldH) mit Rand in den Screen einpassen.
  fitWorld(worldW, worldH) {
    const margin = 24 * this.dpr;
    const sw = this.canvas.width - margin * 2;
    const sh = this.canvas.height - margin * 2;
    this.scale = Math.min(sw / worldW, sh / worldH);
    this.offsetX = (this.canvas.width - worldW * this.scale) / 2;
    this.offsetY = (this.canvas.height - worldH * this.scale) / 2;
  }

  draw(world, opts) {
    const { debug = false, revealAll = false, now = performance.now() } = opts;
    const ctx = this.ctx;
    const s = this.scale, ox = this.offsetX, oy = this.offsetY;
    const tx = (x) => ox + x * s;
    const ty = (y) => oy + y * s;

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Wände & Trümmer zuerst, gruppiert nach quantisierter Alpha-Stufe und Farbe.
    // Eine Stufe wird als EIN Pfad gefüllt (Überlappungen innerhalb der Stufe
    // bleiben gleich hell), und 'destination-over' von hell nach dunkel sorgt
    // dafür, dass Kreuzungen zweier Stufen nicht aufaddieren.
    const buckets = new Map(); // key "r,g,b|q" -> {q, color, path}
    const addRect = (r, alpha, color) => {
      const q = Math.min(1, Math.ceil(alpha * 20) / 20);
      if (q <= 0) return;
      const key = color + '|' + q;
      let b = buckets.get(key);
      if (!b) { b = { q, color, path: new Path2D() }; buckets.set(key, b); }
      b.path.rect(tx(r.x), ty(r.y), r.w * s, r.h * s);
    };
    const wallAlpha = (w) => {
      if (debug || revealAll) return 0.55;
      if (w.litUntil && w.litUntil > now) return Math.min(1, (w.litUntil - now) / 1200) * 0.9;
      return 0;
    };
    for (const w of world.walls) {
      addRect(w, wallAlpha(w), w.hp !== undefined || w.cracked ? '255, 176, 96' : '110, 168, 255');
    }
    for (const d of world.debris || []) {
      if (d.litUntil > now) addRect(d, Math.min(1, (d.litUntil - now) / 1500) * 0.6, '255, 176, 96');
    }
    ctx.globalCompositeOperation = 'destination-over';
    for (const b of [...buckets.values()].sort((a, c) => c.q - a.q)) {
      ctx.fillStyle = `rgba(${b.color}, ${b.q})`;
      ctx.fill(b.path);
    }

    // Hintergrund hinter alles, dann wieder normal zeichnen.
    ctx.fillStyle = '#05070f';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.globalCompositeOperation = 'source-over';

    // Windzonen: nur bei Debug/Reveal als schraffierte Fläche mit Richtungspfeil.
    if (debug || revealAll) {
      for (const z of world.windZones || []) {
        ctx.fillStyle = 'rgba(120, 200, 255, 0.08)';
        ctx.fillRect(tx(z.x), ty(z.y), z.w * s, z.h * s);
        const cx = tx(z.x + z.w / 2), cy = ty(z.y + z.h / 2);
        const f = Math.hypot(z.fx, z.fy) || 1;
        const dx = (z.fx / f) * z.w * s * 0.3, dy = (z.fy / f) * z.h * s * 0.3;
        ctx.strokeStyle = 'rgba(120, 200, 255, 0.6)';
        ctx.lineWidth = 2 * this.dpr;
        ctx.beginPath();
        ctx.moveTo(cx - dx, cy - dy);
        ctx.lineTo(cx + dx, cy + dy);
        ctx.lineTo(cx + dx - (dx + dy) * 0.35, cy + dy - (dy - dx) * 0.35);
        ctx.moveTo(cx + dx, cy + dy);
        ctx.lineTo(cx + dx - (dx - dy) * 0.35, cy + dy - (dy + dx) * 0.35);
        ctx.stroke();
      }
    }

    // Checkpoints: Ring – sichtbar bei Debug/Reveal oder kurz nach Aktivierung.
    for (const cp of world.checkpoints || []) {
      let alpha = 0;
      if (debug || revealAll) alpha = cp.reached ? 0.7 : 0.4;
      else if (cp.litUntil && cp.litUntil > now) alpha = Math.min(1, (cp.litUntil - now) / 2000);
      if (alpha <= 0.01) continue;
      ctx.strokeStyle = `rgba(75, 224, 200, ${alpha})`;
      ctx.lineWidth = 3 * this.dpr;
      ctx.beginPath();
      ctx.arc(tx(cp.x), ty(cp.y), cp.r * s, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Löcher: tiefschwarz mit schwachem Rand – sichtbar bei Debug/Reveal
    // oder kurz nach einem Absturz (litUntil).
    for (const hole of world.holes || []) {
      let alpha = 0;
      if (debug || revealAll) alpha = 0.8;
      else if (hole.litUntil && hole.litUntil > now) alpha = Math.min(1, (hole.litUntil - now) / 1500);
      if (alpha <= 0.01) continue;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(tx(hole.x), ty(hole.y), hole.r * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(150, 90, 220, ${alpha * 0.7})`;
      ctx.lineWidth = 2 * this.dpr;
      ctx.stroke();
    }

    // Ziel: pulsierender Schein nur bei Debug/Reveal (sonst rein akustisch).
    if (debug || revealAll) {
      const g = world.goal;
      const pulse = 0.5 + 0.5 * Math.sin(now / 300);
      const r = g.r * s * (1.1 + pulse * 0.3);
      const grad = ctx.createRadialGradient(tx(g.x), ty(g.y), 0, tx(g.x), ty(g.y), r * 2);
      grad.addColorStop(0, `rgba(75, 224, 140, ${0.5 + pulse * 0.3})`);
      grad.addColorStop(1, 'rgba(75, 224, 140, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(tx(g.x), ty(g.y), r * 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Ball mit sanftem Glow – der einzige ständige Lichtpunkt.
    const b = world.ball;
    const br = b.r * s;
    const glow = ctx.createRadialGradient(tx(b.x), ty(b.y), 0, tx(b.x), ty(b.y), br * 5);
    glow.addColorStop(0, 'rgba(75, 224, 200, 0.5)');
    glow.addColorStop(1, 'rgba(75, 224, 200, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(tx(b.x), ty(b.y), br * 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#4be0c8';
    ctx.beginPath();
    ctx.arc(tx(b.x), ty(b.y), br, 0, Math.PI * 2);
    ctx.fill();
  }
}
