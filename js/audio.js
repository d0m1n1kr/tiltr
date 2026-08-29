// Klangwelt mit Spatial Audio (HRTF-PannerNode): Rollgeräusch, Wand-Impacts,
// Ziel-Beacon, Loch-Grollen, Windzonen, Checkpoints, bröckelnde Wände.
// Der Hörer sitzt im Ball; Richtungen kommen als (dx, dy) in Weltkoordinaten.

export class GameAudio {
  constructor() {
    this.ctx = null;
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

    // Rollgeräusch: bräunliches Rauschen -> Tiefpass -> Gain (ungepannt, das ist "ich")
    const roll = this.ctx.createBufferSource();
    roll.buffer = this._noiseBuffer('brown');
    roll.loop = true;
    this.rollFilter = this.ctx.createBiquadFilter();
    this.rollFilter.type = 'lowpass';
    this.rollFilter.frequency.value = 250;
    this.rollGain = this.ctx.createGain();
    this.rollGain.gain.value = 0;
    roll.connect(this.rollFilter).connect(this.rollGain).connect(this.master);
    roll.start();

    // Windzonen: helles Rauschen -> Bandpass mit Böen-LFO -> Gain -> Panner
    const wind = this.ctx.createBufferSource();
    wind.buffer = this._noiseBuffer('white');
    wind.loop = true;
    const windFilter = this.ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 700;
    windFilter.Q.value = 2.5;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.35;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 220;
    lfo.connect(lfoGain).connect(windFilter.frequency);
    lfo.start();
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0;
    this.windPanner = this._panner();
    wind.connect(windFilter).connect(this.windGain).connect(this.windPanner).connect(this.master);
    wind.start();

    // Löcher: dunkles Grollen – tiefes Rauschen + Sub-Sinus
    const rumble = this.ctx.createBufferSource();
    rumble.buffer = this._noiseBuffer('brown');
    rumble.loop = true;
    const rumbleFilter = this.ctx.createBiquadFilter();
    rumbleFilter.type = 'lowpass';
    rumbleFilter.frequency.value = 110;
    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = 48;
    const subGain = this.ctx.createGain();
    subGain.gain.value = 0.5;
    this.rumbleGain = this.ctx.createGain();
    this.rumbleGain.gain.value = 0;
    this.rumblePanner = this._panner();
    rumble.connect(rumbleFilter).connect(this.rumbleGain);
    sub.connect(subGain).connect(this.rumbleGain);
    this.rumbleGain.connect(this.rumblePanner).connect(this.master);
    rumble.start();
    sub.start();
  }

  _noiseBuffer(kind) {
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      if (kind === 'brown') {
        last = (last + (Math.random() * 2 - 1) * 0.04) * 0.985;
        data[i] = last * 6;
      } else {
        data[i] = Math.random() * 2 - 1;
      }
    }
    return buf;
  }

  // HRTF-Panner: Richtung übernimmt der Kopf, Lautstärke steuern wir selbst.
  _panner() {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'linear';
    p.rolloffFactor = 0;
    return p;
  }

  // Quelle auf den Einheitskreis um den Hörer setzen; -z ist "vorn".
  _place(panner, dx, dy) {
    const d = Math.hypot(dx, dy) || 1;
    const x = (dx / d) * 3, z = (dy / d) * 3;
    if (panner.positionX) {
      panner.positionX.value = x;
      panner.positionY.value = 0;
      panner.positionZ.value = z;
    } else {
      panner.setPosition(x, 0, z);
    }
  }

  // Kurzlebige Quelle durch einen frisch platzierten Panner schicken.
  _spatialOut(dx, dy) {
    const p = this._panner();
    this._place(p, dx, dy);
    p.connect(this.master);
    return p;
  }

  setRolling(speed01) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.rollGain.gain.setTargetAtTime(Math.min(0.5, speed01 * 0.55), t, 0.06);
    this.rollFilter.frequency.setTargetAtTime(220 + speed01 * 1400, t, 0.08);
  }

  // Windzone: closeness01 = 1 mittendrin, 0 = außer Hörweite.
  setWind(closeness01, dx, dy) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(Math.min(0.5, closeness01 ** 1.4 * 0.55), t, 0.1);
    if (closeness01 > 0) this._place(this.windPanner, dx, dy);
  }

  // Loch-Grollen: closeness01 = 1 am Rand, 0 = außer Hörweite.
  setHoleRumble(closeness01, dx, dy) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.rumbleGain.gain.setTargetAtTime(Math.min(0.6, closeness01 ** 1.6 * 0.7), t, 0.1);
    if (closeness01 > 0) this._place(this.rumblePanner, dx, dy);
  }

  // Wand-Treffer: dumpfer Thump aus Richtung der Wand (Normale zeigt vom Ball weg).
  hit(intensity01, nx, ny) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160 + intensity01 * 120, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + 0.09);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(Math.min(1, 0.15 + intensity01 * 0.9), t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(gain).connect(this._spatialOut(-nx, -ny));
    osc.start(t);
    osc.stop(t + 0.14);
  }

  // Ziel-Beacon wie ein Sonar: näher = schneller, lauter, höher.
  beacon(dx, dy, dist01) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (t < this.nextPing) return;
    this.nextPing = t + 0.14 + dist01 * 1.1;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660 + (1 - dist01) * 660, t);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.05 + (1 - dist01) * 0.3, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.connect(gain).connect(this._spatialOut(dx, dy));
    osc.start(t);
    osc.stop(t + 0.2);
  }

  // Brüchige Wand knirscht beim Treffer.
  crackle(nx, ny) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this._spatialOut(-nx, -ny);
    for (let i = 0; i < 3; i++) {
      const src = this.ctx.createBufferSource();
      src.buffer = this._noiseBuffer('white');
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1800 + Math.random() * 1500;
      filter.Q.value = 6;
      const gain = this.ctx.createGain();
      const t0 = t + i * 0.05 + Math.random() * 0.02;
      gain.gain.setValueAtTime(0.35, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.06);
      src.connect(filter).connect(gain).connect(out);
      src.start(t0);
      src.stop(t0 + 0.08);
    }
  }

  // Wand stürzt ein: Poltern + tiefer Schlag.
  crumble(nx, ny) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this._spatialOut(-nx, -ny);
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer('brown');
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, t);
    filter.frequency.exponentialRampToValueAtTime(120, t + 0.5);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.7, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    src.connect(filter).connect(gain).connect(out);
    src.start(t);
    src.stop(t + 0.6);
    const thump = this.ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(90, t);
    thump.frequency.exponentialRampToValueAtTime(40, t + 0.25);
    const tg = this.ctx.createGain();
    tg.gain.setValueAtTime(0.6, t);
    tg.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    thump.connect(tg).connect(out);
    thump.start(t);
    thump.stop(t + 0.32);
  }

  // Checkpoint erreicht: freundlicher Doppelklang.
  checkpoint() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [880, 1318.5].forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const gain = this.ctx.createGain();
      const t0 = t + i * 0.1;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.3, t0 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.35);
      osc.connect(gain).connect(this.master);
      osc.start(t0);
      osc.stop(t0 + 0.4);
    });
  }

  // Absturz ins Loch: fallender Pfeifton.
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
    this.setHoleRumble(0, 0, 0);
    this.setWind(0, 0, 0);
    this.setRolling(0);
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
