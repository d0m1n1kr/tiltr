// Klangwelt: Rollgeräusch, Wand-Impacts (gepannt), Ziel-Beacon (Ping-Rate & Panning nach Richtung/Distanz).

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.rollGain = null;
    this.rollFilter = null;
    this.nextPing = 0;
  }

  // Aus User-Geste aufrufen (Autoplay-Policy).
  async start() {
    if (this.ctx) { await this.ctx.resume(); return; }
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    await this.ctx.resume();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);

    // Rollgeräusch: geloopter Noise-Buffer -> Tiefpass -> Gain
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      // bräunliches Rauschen klingt nach Rollen, nicht nach Zischen
      last = (last + (Math.random() * 2 - 1) * 0.04) * 0.985;
      data[i] = last * 6;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    this.rollFilter = this.ctx.createBiquadFilter();
    this.rollFilter.type = 'lowpass';
    this.rollFilter.frequency.value = 250;
    this.rollGain = this.ctx.createGain();
    this.rollGain.gain.value = 0;
    src.connect(this.rollFilter).connect(this.rollGain).connect(this.master);
    src.start();

    // Wind über Löchern: helles Rauschen -> Bandpass mit langsamer Böen-LFO
    const wlen = this.ctx.sampleRate * 2;
    const wbuf = this.ctx.createBuffer(1, wlen, this.ctx.sampleRate);
    const wdata = wbuf.getChannelData(0);
    for (let i = 0; i < wlen; i++) wdata[i] = Math.random() * 2 - 1;
    const wsrc = this.ctx.createBufferSource();
    wsrc.buffer = wbuf;
    wsrc.loop = true;
    this.windFilter = this.ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 700;
    this.windFilter.Q.value = 2.5;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.35;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 220;
    lfo.connect(lfoGain).connect(this.windFilter.frequency);
    lfo.start();
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0;
    this.windPan = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    if (this.windPan) {
      wsrc.connect(this.windFilter).connect(this.windGain).connect(this.windPan).connect(this.master);
    } else {
      wsrc.connect(this.windFilter).connect(this.windGain).connect(this.master);
    }
    wsrc.start();
  }

  // Wind des nächsten Lochs: closeness01 = 1 direkt am Rand, 0 = außer Hörweite.
  setWind(closeness01, pan = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(Math.min(0.45, closeness01 ** 1.5 * 0.5), t, 0.1);
    if (this.windPan) this.windPan.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), t, 0.1);
  }

  // Absturz ins Loch: fallender Pfeifton + verhallendes Rauschen.
  fall() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.9);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 1.05);
    this.setWind(0);
    this.setRolling(0);
  }

  // speed01: Ballgeschwindigkeit normiert auf [0,1]
  setRolling(speed01) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.rollGain.gain.setTargetAtTime(Math.min(0.5, speed01 * 0.55), t, 0.06);
    this.rollFilter.frequency.setTargetAtTime(220 + speed01 * 1400, t, 0.08);
  }

  // Wand-Treffer: dumpfer Thump, Lautstärke nach Aufprallstärke, Panning nach Wandseite.
  hit(intensity01, pan = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const g = Math.min(1, 0.15 + intensity01 * 0.9);

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160 + intensity01 * 120, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + 0.09);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(g, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    const panner = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    if (panner) {
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      osc.connect(gain).connect(panner).connect(this.master);
    } else {
      osc.connect(gain).connect(this.master);
    }
    osc.start(t);
    osc.stop(t + 0.14);
  }

  // Ziel-Beacon wie ein Sonar: näher = schneller & lauter, Panning zeigt die Richtung.
  // dx: horizontale Richtung zum Ziel [-1,1], dist01: Distanz normiert [0,1].
  beacon(dx, dist01) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (t < this.nextPing) return;
    const interval = 0.14 + dist01 * 1.1;
    this.nextPing = t + interval;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    const freq = 660 + (1 - dist01) * 660;
    osc.frequency.setValueAtTime(freq, t);

    const gain = this.ctx.createGain();
    const g = 0.05 + (1 - dist01) * 0.3;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(g, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

    const panner = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    if (panner) {
      panner.pan.value = Math.max(-1, Math.min(1, dx));
      osc.connect(gain).connect(panner).connect(this.master);
    } else {
      osc.connect(gain).connect(this.master);
    }
    osc.start(t);
    osc.stop(t + 0.2);
  }

  win() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = f;
      const gain = this.ctx.createGain();
      const t0 = t + i * 0.12;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.35, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.5);
      osc.connect(gain).connect(this.master);
      osc.start(t0);
      osc.stop(t0 + 0.55);
    });
  }
}
