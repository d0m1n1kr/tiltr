// Klangwelt mit Spatial Audio (HRTF-PannerNode): Rollgeräusch, Wand-Impacts,
// Ziel-Beacon, Loch-Grollen, Windzonen, Checkpoints, bröckelnde Wände,
// Echo-Ping und Herzschlag. Der Hörer sitzt im Ball; Richtungen kommen als
// (dx, dy) in Weltkoordinaten.

export interface PingReflection {
  dx: number;
  dy: number;
  delay: number;
  gain: number;
  freq?: number;
  /** Doppel-Blip (z. B. Durchgänge, Gems) */
  double?: boolean;
}

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private rollFilter!: BiquadFilterNode;
  private rollGain!: GainNode;
  private windGain!: GainNode;
  private windPanner!: PannerNode;
  private rumbleGain!: GainNode;
  private rumblePanner!: PannerNode;
  private guardGain!: GainNode;
  private guardPanner!: PannerNode;
  private portalGain!: GainNode;
  private portalPanner!: PannerNode;
  private nextPing = 0;
  private nextBeat = 0;
  private nextTinkle = 0;

  // Aus User-Geste aufrufen (Autoplay-Policy).
  async start(): Promise<void> {
    if (this.ctx) {
      await this.ctx.resume();
      return;
    }
    this.ctx = new AudioContext();
    await this.ctx.resume();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);

    // Rollgeräusch: bräunliches Rauschen -> Tiefpass -> Gain (ungepannt, das ist "ich")
    const roll = this.ctx.createBufferSource();
    roll.buffer = this.noiseBuffer('brown');
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
    wind.buffer = this.noiseBuffer('white');
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
    this.windPanner = this.panner();
    wind.connect(windFilter).connect(this.windGain).connect(this.windPanner).connect(this.master);
    wind.start();

    // Löcher: dunkles Grollen – tiefes Rauschen + Sub-Sinus
    const rumble = this.ctx.createBufferSource();
    rumble.buffer = this.noiseBuffer('brown');
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
    this.rumblePanner = this.panner();
    rumble.connect(rumbleFilter).connect(this.rumbleGain);
    sub.connect(subGain).connect(this.rumbleGain);
    this.rumbleGain.connect(this.rumblePanner).connect(this.master);
    rumble.start();
    sub.start();

    // Wächter: tonales, pulsierendes Brummen (Sägezahn + Tremolo) – klar
    // unterscheidbar vom rauschigen Loch-Grollen.
    const growl = this.ctx.createOscillator();
    growl.type = 'sawtooth';
    growl.frequency.value = 55;
    const growlFilter = this.ctx.createBiquadFilter();
    growlFilter.type = 'lowpass';
    growlFilter.frequency.value = 300;
    const tremolo = this.ctx.createOscillator();
    tremolo.frequency.value = 4.5;
    const tremoloGain = this.ctx.createGain();
    tremoloGain.gain.value = 0.5;
    const tremoloBase = this.ctx.createGain();
    tremoloBase.gain.value = 0.5;
    this.guardGain = this.ctx.createGain();
    this.guardGain.gain.value = 0;
    this.guardPanner = this.panner();
    // Tremolo moduliert die Lautstärke: base 0.5 ± 0.5
    tremolo.connect(tremoloGain).connect(tremoloBase.gain);
    growl.connect(growlFilter).connect(tremoloBase).connect(this.guardGain);
    this.guardGain.connect(this.guardPanner).connect(this.master);
    growl.start();
    tremolo.start();

    // Transporter: schwebender Doppelton (zwei leicht verstimmte Sinus ->
    // langsames Schweben) – klar unterscheidbar von Wind, Grollen und Wächter.
    this.portalGain = this.ctx.createGain();
    this.portalGain.gain.value = 0;
    this.portalPanner = this.panner();
    for (const f of [392, 396.5]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.value = 0.5;
      osc.connect(g).connect(this.portalGain);
      osc.start();
    }
    this.portalGain.connect(this.portalPanner).connect(this.master);
  }

  // Transporter-Schweben: closeness01 = 1 auf dem Pad, 0 = außer Hörweite.
  setPortal(closeness01: number, dx: number, dy: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.portalGain.gain.setTargetAtTime(Math.min(0.35, closeness01 ** 1.5 * 0.4), t, 0.1);
    if (closeness01 > 0) this.place(this.portalPanner, dx, dy);
  }

  // Ebenenwechsel: Schimmer-Arpeggio, abwärts fallend oder aufwärts steigend;
  // 'same' (Portal) als schneller Doppelschlag auf einer Höhe.
  warp(dir: 'up' | 'down' | 'same'): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const base = [523.25, 659.25, 783.99, 1046.5];
    const notes = dir === 'down' ? [...base].reverse() : base;
    const seq = dir === 'same' ? [783.99, 783.99] : notes;
    seq.forEach((f, i) => {
      const osc = this.ctx!.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t + i * 0.09);
      osc.frequency.exponentialRampToValueAtTime(dir === 'down' ? f * 0.8 : f * 1.2, t + i * 0.09 + 0.18);
      const gain = this.ctx!.createGain();
      gain.gain.setValueAtTime(0, t + i * 0.09);
      gain.gain.linearRampToValueAtTime(0.22, t + i * 0.09 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.09 + 0.35);
      osc.connect(gain).connect(this.master);
      osc.start(t + i * 0.09);
      osc.stop(t + i * 0.09 + 0.4);
    });
    // Luftzug unter dem Schimmern
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer('white');
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.2;
    filter.frequency.setValueAtTime(dir === 'down' ? 1200 : 400, t);
    filter.frequency.exponentialRampToValueAtTime(dir === 'down' ? 300 : 1600, t + 0.5);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t);
    src.stop(t + 0.6);
  }

  private noiseBuffer(kind: 'brown' | 'white'): AudioBuffer {
    const ctx = this.ctx!;
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
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
  private panner(): PannerNode {
    const p = this.ctx!.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'linear';
    p.rolloffFactor = 0;
    return p;
  }

  // Quelle auf den Einheitskreis um den Hörer setzen; -z ist "vorn".
  private place(panner: PannerNode, dx: number, dy: number): void {
    const d = Math.hypot(dx, dy) || 1;
    const x = (dx / d) * 3,
      z = (dy / d) * 3;
    if (panner.positionX) {
      panner.positionX.value = x;
      panner.positionY.value = 0;
      panner.positionZ.value = z;
    } else {
      panner.setPosition(x, 0, z);
    }
  }

  // Kurzlebige Quelle durch einen frisch platzierten Panner schicken.
  private spatialOut(dx: number, dy: number): PannerNode {
    const p = this.panner();
    this.place(p, dx, dy);
    p.connect(this.master);
    return p;
  }

  setRolling(speed01: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.rollGain.gain.setTargetAtTime(Math.min(0.5, speed01 * 0.55), t, 0.06);
    this.rollFilter.frequency.setTargetAtTime(220 + speed01 * 1400, t, 0.08);
  }

  // Windzone: closeness01 = 1 mittendrin, 0 = außer Hörweite.
  setWind(closeness01: number, dx: number, dy: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(Math.min(0.5, closeness01 ** 1.4 * 0.55), t, 0.1);
    if (closeness01 > 0) this.place(this.windPanner, dx, dy);
  }

  // Loch-Grollen: closeness01 = 1 am Rand, 0 = außer Hörweite.
  setHoleRumble(closeness01: number, dx: number, dy: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.rumbleGain.gain.setTargetAtTime(Math.min(0.6, closeness01 ** 1.6 * 0.7), t, 0.1);
    if (closeness01 > 0) this.place(this.rumblePanner, dx, dy);
  }

  // Wächter-Brummen: closeness01 = 1 direkt daneben, 0 = außer Hörweite.
  setGuard(closeness01: number, dx: number, dy: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.guardGain.gain.setTargetAtTime(Math.min(0.5, closeness01 ** 1.5 * 0.55), t, 0.1);
    if (closeness01 > 0) this.place(this.guardPanner, dx, dy);
  }

  // Schlüssel-Klimpern: metallischer Doppel-Blip, Rate steigt mit der Nähe.
  keyTinkle(dx: number, dy: number, dist01: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (t < this.nextTinkle) return;
    this.nextTinkle = t + 0.5 + dist01 * 1.6;
    const out = this.spatialOut(dx, dy);
    [1760, 2217].forEach((f, i) => {
      const osc = this.ctx!.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = f;
      const gain = this.ctx!.createGain();
      const t0 = t + i * 0.07;
      const g = 0.04 + (1 - dist01) * 0.16;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(g, t0 + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.1);
      osc.connect(gain).connect(out);
      osc.start(t0);
      osc.stop(t0 + 0.12);
    });
  }

  // Schlüssel eingesammelt: aufsteigendes Klimpern.
  collectKey(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [1318.5, 1760, 2217].forEach((f, i) => {
      const osc = this.ctx!.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = f;
      const gain = this.ctx!.createGain();
      const t0 = t + i * 0.07;
      gain.gain.setValueAtTime(0.25, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.2);
      osc.connect(gain).connect(this.master);
      osc.start(t0);
      osc.stop(t0 + 0.22);
    });
  }

  // Tür gleitet auf: steinernes Rutschen + Einrast-Klick aus Richtung der Tür.
  doorOpen(dx: number, dy: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this.spatialOut(dx, dy);
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer('brown');
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(200, t);
    filter.frequency.exponentialRampToValueAtTime(700, t + 0.45);
    filter.Q.value = 1.5;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.5, t + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    src.connect(filter).connect(gain).connect(out);
    src.start(t);
    src.stop(t + 0.55);
    const click = this.ctx.createOscillator();
    click.type = 'square';
    click.frequency.value = 880;
    const cg = this.ctx.createGain();
    cg.gain.setValueAtTime(0.15, t + 0.48);
    cg.gain.exponentialRampToValueAtTime(0.001, t + 0.54);
    click.connect(cg).connect(out);
    click.start(t + 0.48);
    click.stop(t + 0.56);
  }

  // Gem eingesammelt: funkelnde Arpeggio-Spitze.
  collectGem(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [1567.98, 2093, 2637] .forEach((f, i) => {
      const osc = this.ctx!.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const gain = this.ctx!.createGain();
      const t0 = t + i * 0.06;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.28, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.3);
      osc.connect(gain).connect(this.master);
      osc.start(t0);
      osc.stop(t0 + 0.32);
    });
  }

  // Vom Wächter erwischt: harter, dissonanter Sting.
  caught(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const f of [110, 116.5]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f, t);
      osc.frequency.exponentialRampToValueAtTime(f / 2, t + 0.45);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      osc.connect(gain).connect(this.master);
      osc.start(t);
      osc.stop(t + 0.52);
    }
    this.setGuard(0, 0, 0);
    this.setRolling(0);
  }

  // Wand-Treffer: dumpfer Thump aus Richtung der Wand (Normale zeigt vom Ball weg).
  hit(intensity01: number, nx: number, ny: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160 + intensity01 * 120, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + 0.09);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(Math.min(1, 0.15 + intensity01 * 0.9), t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(gain).connect(this.spatialOut(-nx, -ny));
    osc.start(t);
    osc.stop(t + 0.14);
  }

  // Ziel-Beacon wie ein Sonar: näher = schneller, lauter, höher.
  // muffled = Ziel liegt auf einer anderen Ebene: tiefer, leiser, träger –
  // als käme der Ping durch den Boden.
  beacon(dx: number, dy: number, dist01: number, muffled = false): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (t < this.nextPing) return;
    this.nextPing = t + (muffled ? 0.6 : 0.14) + dist01 * 1.1;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    const freq = 660 + (1 - dist01) * 660;
    osc.frequency.setValueAtTime(muffled ? freq * 0.45 : freq, t);
    const gain = this.ctx.createGain();
    const g = 0.05 + (1 - dist01) * 0.3;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(muffled ? g * 0.35 : g, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, t + (muffled ? 0.3 : 0.18));
    osc.connect(gain).connect(this.spatialOut(dx, dy));
    osc.start(t);
    osc.stop(t + (muffled ? 0.32 : 0.2));
  }

  // Aktiver Echo-Ping: Abstrahl-Chirp, dann kommen die Reflexionen der
  // Umgebung zurück – verzögert nach Entfernung, räumlich aus ihrer Richtung.
  echoPing(reflections: PingReflection[]): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const chirp = this.ctx.createOscillator();
    chirp.type = 'sine';
    chirp.frequency.setValueAtTime(1400, t);
    chirp.frequency.exponentialRampToValueAtTime(900, t + 0.08);
    const cg = this.ctx.createGain();
    cg.gain.setValueAtTime(0.25, t);
    cg.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    chirp.connect(cg).connect(this.master);
    chirp.start(t);
    chirp.stop(t + 0.11);

    for (const r of reflections) {
      const out = this.spatialOut(r.dx, r.dy);
      const blips = r.double ? [0, 0.07] : [0];
      blips.forEach((off, i) => {
        const t0 = t + 0.1 + r.delay + off;
        const osc = this.ctx!.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = r.freq ?? 950;
        const gain = this.ctx!.createGain();
        gain.gain.setValueAtTime(0, t0);
        gain.gain.linearRampToValueAtTime(r.gain * (i === 0 ? 1 : 0.7), t0 + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.12);
        osc.connect(gain).connect(out);
        osc.start(t0);
        osc.stop(t0 + 0.14);
      });
    }
  }

  // Herzschlag: "lub-dub", Tempo und Lautstärke steigen mit der Gefahr.
  heartbeat(danger01: number): void {
    if (!this.ctx || danger01 < 0.05) return;
    const t = this.ctx.currentTime;
    if (t < this.nextBeat) return;
    this.nextBeat = t + 1.25 - danger01 * 0.8;
    const vol = 0.08 + danger01 * 0.25;
    const parts: Array<[number, number, number]> = [
      [0, 1, 58],
      [0.14, 0.7, 50],
    ];
    for (const [off, mul, freq] of parts) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + off);
      osc.frequency.exponentialRampToValueAtTime(35, t + off + 0.1);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(vol * mul, t + off);
      gain.gain.exponentialRampToValueAtTime(0.001, t + off + 0.12);
      osc.connect(gain).connect(this.master);
      osc.start(t + off);
      osc.stop(t + off + 0.14);
    }
  }

  // Brüchige Wand knirscht beim Treffer.
  crackle(nx: number, ny: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this.spatialOut(-nx, -ny);
    for (let i = 0; i < 3; i++) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer('white');
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
  crumble(nx: number, ny: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this.spatialOut(-nx, -ny);
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer('brown');
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
  checkpoint(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [880, 1318.5].forEach((f, i) => {
      const osc = this.ctx!.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const gain = this.ctx!.createGain();
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
  fall(): void {
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
    this.setGuard(0, 0, 0);
    this.setPortal(0, 0, 0);
    this.setRolling(0);
  }

  win(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      const osc = this.ctx!.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = f;
      const gain = this.ctx!.createGain();
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
