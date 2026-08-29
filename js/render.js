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

    ctx.fillStyle = '#05070f';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Wände: nur sichtbar, wenn kürzlich berührt (Echo) oder Debug/Reveal.
    for (const w of world.walls) {
      let alpha = 0;
      if (debug || revealAll) {
        alpha = 0.55;
      } else if (w.litUntil && w.litUntil > now) {
        alpha = Math.min(1, (w.litUntil - now) / 1200) * 0.9;
      }
      if (alpha <= 0.01) continue;
      ctx.fillStyle = `rgba(110, 168, 255, ${alpha})`;
      ctx.fillRect(tx(w.x), ty(w.y), w.w * s, w.h * s);
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
