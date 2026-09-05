// Klangwelt mit Spatial Audio (HRTF-PannerNode): Rollgeräusch, Wand-Impacts,
// Ziel-Beacon, Loch-Grollen, Windzonen, Checkpoints, bröckelnde Wände,
// Echo-Ping und Herzschlag. Der Hörer sitzt im Ball; Richtungen kommen als
// (dx, dy) in Weltkoordinaten.

import type { Voice } from './chiptune';

/** Dämpfung des Musik-Busses während eines Echo-Pings (≈ -12 dB). Musik
 *  verdeckt in DIESEM Spiel die Hinweise – das ist die Pointe der Jukebox,
 *  aber der Ping muss lesbar bleiben. */
const MUSIC_DUCK = 0.25;
/** So lange bleibt gedämpft, bevor die Musik zurückkommt (Reflexionen
 *  brauchen bis zu einer halben Sekunde). */
const MUSIC_DUCK_HOLD = 0.5;
const MUSIC_DUCK_RELEASE = 0.4;

/** Was hört man gerade von der Jukebox? Test-Haken (window.__tiltrJukebox). */
export interface MusicDebug {
  /** Sidechain-Dämpfung: 1 = frei, MUSIC_DUCK = unter dem Ping */
  duck: number;
  /** Entfernungs-Lautstärke des Automaten (0 = außer Hörweite) */
  vol: number;
  /** Insgesamt eingeplante Noten seit Start (wächst, solange Musik läuft) */
  notes: number;
  /** Wie oft der Plattenkratzer geklungen hat (Titelwechsel) */
  scratches: number;
}

export interface PingReflection {
  dx: number;
  dy: number;
  delay: number;
  gain: number;
  freq?: number;
  /** Doppel-Blip (z. B. Durchgänge, Gems) */
  double?: boolean;
}

export interface PingOptions {
  /** Lautstärke des Emissions-Chirps. Der Chirp ist UNGEPANNT (er kommt vom
   *  Ball, nicht von der Welt) – wer die Richtung einer Reflexion beurteilen
   *  will, braucht ihn leise, sonst ist das lauteste Ereignis mittig. */
  chirpGain?: number;
}

/** Was hat das Ohr beim letzten Ping bekommen? Test-Haken (window.__tiltrPing):
 *  Panning ist nicht messbar, die Struktur des Reizes schon. */
export interface PingDebug {
  chirpGain: number;
  refl: Array<{ x: number; z: number; gain: number; broadband: boolean }>;
}

/** Wie weit die Welt zurückweicht, während man stimmt (~−20 dB). Nicht ganz
 *  still: Ein Wandtreffer oder das Ziel bleiben als Ahnung da – man steht
 *  weiter IN der Welt, man hört nur genauer hin. */
const TUNE_DUCK = 0.1;

export class GameAudio {
  private ctx: AudioContext | null = null;
  /** First Person (M23): Blickrichtung des Hörers in rad. Gedreht wird an
   *  GENAU einer Stelle (unitPos) – damit hören alle Quellen konsistent
   *  „links/rechts von MIR" statt Weltkoordinaten. 0 = Draufsicht. */
  private heading = 0;
  /** Wanderfenster in den Rausch-Puffer (Ping-Anschläge klingen nie identisch). */
  private noiseCursor = 0;
  private master!: GainNode;
  private rollFilter!: BiquadFilterNode;
  private rollGain!: GainNode;
  private windGain!: GainNode;
  private windPanner!: PannerNode;
  private rumbleGain!: GainNode;
  private rumblePanner!: PannerNode;
  private guardGain!: GainNode;
  private guardPanner!: PannerNode;
  /** Schläfer (M45): tiefes, langsames Schnarchen statt Brummen */
  private snoreGain!: GainNode;
  private snorePanner!: PannerNode;
  /** Hallraum (M46): Send vom Master in ein Feedback-Delay – lange Fahnen */
  private reverbSend!: GainNode;
  /** Stimmgabel (M45): zwei Sinus, UNGEPANNT – Ortung über die Schwebung */
  private forkGain!: GainNode;
  private forkA!: OscillatorNode;
  private forkB!: OscillatorNode;
  private portalGain!: GainNode;
  private portalPanner!: PannerNode;
  private currentGain!: GainNode;
  private currentPanner!: PannerNode;
  private fogFilter!: BiquadFilterNode;
  private listenerGain!: GainNode;
  private listenerPanner!: PannerNode;
  private sniffLfo!: OscillatorNode;
  private iceGain!: GainNode;
  private iceVibrato!: OscillatorNode;
  private anchorGain!: GainNode;
  private drainGain!: GainNode;
  private drainPanner!: PannerNode;
  private anchorPanner!: PannerNode;
  private rivalGain!: GainNode;
  private rivalFilter!: BiquadFilterNode;
  private rivalPanner!: PannerNode;
  private worldDuck!: GainNode;
  private resMineOsc!: OscillatorNode;
  private resMineGain!: GainNode;
  private resTheirsOsc!: OscillatorNode;
  private resTheirsGain!: GainNode;
  private resTheirsPanner!: PannerNode;
  private resShimmerOsc!: OscillatorNode;
  private resShimmerGain!: GainNode;
  private resGuideOsc!: OscillatorNode;
  private resGuideGain!: GainNode;
  private buddyGain!: GainNode;
  private buddyRollGain!: GainNode;
  private buddyFilter!: BiquadFilterNode;
  private buddyPanner!: PannerNode;
  /** Musik-Bus: Note -> duck (Sidechain) -> vol (Entfernung) -> HRTF-Panner.
   *  Die Musik kommt AUS der Jukebox, nicht vom Schirm – sie ist damit ein
   *  akustisches Wahrzeichen, an dem man sich orientieren kann. */
  private musicDuck!: GainNode;
  private musicVol!: GainNode;
  private musicPanner!: PannerNode;
  /** 25-%-Pulswelle: die Stimme der NES-Ära (reines 'square' ist 50 %). */
  private pulseWave: PeriodicWave | null = null;
  /** Laufende Musikquellen – ein Titelwechsel muss sie SOFORT abwürgen. */
  private musicSources: Array<OscillatorNode | AudioBufferSourceNode> = [];
  private musicNotes = 0;
  private musicScratches = 0;
  private nextPing = 0;
  private nextBeat = 0;
  private nextTinkle = 0;
  private nextMarkTick = 0;
  private nextWaitCall = 0;
  private nextTock = 0;
  private tockHigh = false;

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
    // Nebel: EIN Lowpass hinter dem Master dämpft ALLE Klänge (auch den
    // Beacon) – offen bei 18 kHz, im Nebelkern hinunter bis ~500 Hz.
    this.fogFilter = this.ctx.createBiquadFilter();
    this.fogFilter.type = 'lowpass';
    this.fogFilter.frequency.value = 18000;
    // STIMM-MODUS (M91b): Wer in einem Resonanzfeld steht, soll die ZWEI TÖNE
    // hören und möglichst nichts sonst – abstimmen heißt vergleichen, und
    // dazwischen darf nicht die halbe Welt rasseln (die Kugel in der Schale,
    // Wandtreffer, der Partner, die Musik). Deshalb sitzt zwischen Master und
    // Nebelfilter ein WELT-BUS, den `setResonance` absenkt; die beiden
    // Resonanzstimmen hängen dahinter und bleiben voll da. Dieselbe Idee wie
    // das Ducking der Musik unter dem Ping – nur umgekehrt: hier duckt der Ton
    // die Welt. Der Hall-Send hängt am WELT-Bus (sonst käme die gedämpfte Welt
    // durch ihre eigene Fahne zurück).
    this.worldDuck = this.ctx.createGain();
    this.worldDuck.gain.value = 1;
    this.master.connect(this.worldDuck).connect(this.fogFilter).connect(this.ctx.destination);
    // Hallraum (M46): Feedback-Delay statt Convolver – keine Impulsantwort-
    // Datei in der PWA. Der Send ist normal zu; in der Zone geht er auf.
    // Der Nachhall läuft durch den Nebelfilter wie alles andere.
    this.reverbSend = this.ctx.createGain();
    this.reverbSend.gain.value = 0;
    const delay = this.ctx.createDelay(1);
    delay.delayTime.value = 0.17;
    const feedback = this.ctx.createGain();
    feedback.gain.value = 0.62;
    const damp = this.ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 3200;
    this.worldDuck.connect(this.reverbSend).connect(delay);
    delay.connect(damp).connect(feedback).connect(delay);
    delay.connect(this.fogFilter);

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

    // Rivale (Geist-Duell): dasselbe Rollen wie das eigene, aber dumpfer und
    // GEPANNT – „ich" ist ungepannt, alles Fremde kommt aus einer Richtung.
    // Freundlich gemeint: kein Beitrag zum Herzschlag, keine Warnfarbe.
    const rival = this.ctx.createBufferSource();
    rival.buffer = this.noiseBuffer('brown');
    rival.loop = true;
    this.rivalFilter = this.ctx.createBiquadFilter();
    this.rivalFilter.type = 'lowpass';
    this.rivalFilter.frequency.value = 180;
    this.rivalGain = this.ctx.createGain();
    this.rivalGain.gain.value = 0;
    this.rivalPanner = this.panner();
    rival.connect(this.rivalFilter).connect(this.rivalGain).connect(this.rivalPanner).connect(this.master);

    // Partner im Coop (M88): Gesellschaft, keine Bedrohung – deshalb TONAL,
    // wo der Rivale Rauschen ist: ein warmer Quint-Grundton (D3 + A3), sehr
    // leise, plus ein Rollanteil nach seiner Geschwindigkeit. KEIN Pulsieren:
    // Puls ist in diesem Spiel der Herzschlag, also Gefahr.
    this.buddyPanner = this.panner();
    this.buddyGain = this.ctx.createGain();
    this.buddyGain.gain.value = 0;
    this.buddyFilter = this.ctx.createBiquadFilter();
    this.buddyFilter.type = 'lowpass';
    this.buddyFilter.frequency.value = 900;
    this.buddyFilter.connect(this.buddyGain).connect(this.buddyPanner).connect(this.master);
    const buddyTone = this.ctx.createGain();
    buddyTone.gain.value = 0.5;
    buddyTone.connect(this.buddyFilter);
    for (const [hz, g] of [
      [146.83, 0.6],
      [220, 0.35],
    ] as Array<[number, number]>) {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = hz;
      const og = this.ctx.createGain();
      og.gain.value = g; // die Quinte leiser als der Grundton
      osc.connect(og).connect(buddyTone);
      osc.start();
    }
    const buddyRoll = this.ctx.createBufferSource();
    buddyRoll.buffer = this.noiseBuffer('brown');
    buddyRoll.loop = true;
    this.buddyRollGain = this.ctx.createGain();
    this.buddyRollGain.gain.value = 0;
    buddyRoll.connect(this.buddyRollGain).connect(this.buddyFilter);
    buddyRoll.start();

    // RESONANZFELDER (M91): zwei SINUS-Stimmen, denn die Schwebung ist das
    // Rätsel – ein reiner Ton schwebt sauber, ein obertonreicher rauscht.
    // Gemischt werden sie NICHT künstlich: Beide laufen in denselben Master,
    // also entsteht die Schwebung akustisch, so wie zwei echte Gabeln.
    // Der eigene Ton ist UNGEPANNT (er kommt von mir), der des Partners steht
    // an SEINEM Feld – so liegt die Schwebung im Raum, nicht im Kopf.
    const resVoice = (panned: boolean): { osc: OscillatorNode; gain: GainNode; panner?: PannerNode } => {
      const osc = this.ctx!.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 220;
      const gain = this.ctx!.createGain();
      gain.gain.value = 0;
      if (panned) {
        const panner = this.panner();
        osc.connect(gain).connect(panner).connect(this.fogFilter);
        osc.start();
        return { osc, gain, panner };
      }
      osc.connect(gain).connect(this.fogFilter);
      osc.start();
      return { osc, gain };
    };
    const mine = resVoice(false);
    this.resMineOsc = mine.osc;
    this.resMineGain = mine.gain;
    const theirs = resVoice(true);
    this.resTheirsOsc = theirs.osc;
    this.resTheirsGain = theirs.gain;
    this.resTheirsPanner = theirs.panner!;
    // Schimmer: eine Oktave über dem eigenen Ton, wächst mit der Genauigkeit –
    // die Belohnung fürs Stimmen, hörbar BEVOR das Tor aufgeht.
    const shimmer = resVoice(false);
    this.resShimmerOsc = shimmer.osc;
    this.resShimmerGain = shimmer.gain;
    // Führungston: der Ton, den ICH treffen müsste – leise, ungepannt (er ist
    // eine Hilfe des Spiels, kein Ort in der Welt). Er liegt nahe an meinem
    // eigenen und SCHWEBT deshalb gegen ihn; bei einer Quinte ist das die
    // einzige Schwebung, die es gibt.
    const guide = resVoice(false);
    this.resGuideOsc = guide.osc;
    this.resGuideGain = guide.gain;

    // Musik-Bus (Jukebox). Zwei getrennte Gains mit Absicht: `musicDuck` ist
    // die Sidechain (der Ping drückt sie kurz herunter), `musicVol` die
    // Entfernung. Getrennt, weil sonst jede Ping-Rampe die gerade
    // nachgeführte Entfernung überschreiben würde.
    this.musicDuck = this.ctx.createGain();
    this.musicDuck.gain.value = 1;
    this.musicVol = this.ctx.createGain();
    this.musicVol.gain.value = 0;
    this.musicPanner = this.panner();
    this.musicDuck.connect(this.musicVol).connect(this.musicPanner).connect(this.master);
    // Fourier-Koeffizienten eines 25-%-Pulses: a_n = 2/(nπ) · sin(nπ·d).
    const harmonics = 24;
    const real = new Float32Array(harmonics);
    const imag = new Float32Array(harmonics);
    for (let n = 1; n < harmonics; n++) imag[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * 0.25);
    this.pulseWave = this.ctx.createPeriodicWave(real, imag, { disableNormalization: false });
    rival.start();

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

    // Schläfer (M45): tiefes Schnarchen – Sinus um 70 Hz, im 0,45-Hz-Atem
    // moduliert, mit einem rauen Anteil. Unverwechselbar gegen das Wächter-
    // Brummen (Tremolo 6 Hz): Das hier ist LANGSAM.
    this.snoreGain = this.ctx.createGain();
    this.snoreGain.gain.value = 0;
    this.snorePanner = this.panner();
    const snore = this.ctx.createOscillator();
    snore.type = 'sawtooth';
    snore.frequency.value = 68;
    const snoreFilter = this.ctx.createBiquadFilter();
    snoreFilter.type = 'lowpass';
    snoreFilter.frequency.value = 220;
    const breath = this.ctx.createOscillator();
    breath.frequency.value = 0.45;
    const breathGain = this.ctx.createGain();
    breathGain.gain.value = 0.5;
    const breathBase = this.ctx.createGain();
    breathBase.gain.value = 0.5;
    breath.connect(breathGain).connect(breathBase.gain);
    snore.connect(snoreFilter).connect(breathBase).connect(this.snoreGain);
    this.snoreGain.connect(this.snorePanner).connect(this.master);
    snore.start();
    breath.start();

    // Stimmgabel (M45): zwei Sinus-Oszillatoren, ungepannt direkt auf den
    // Master – die Information liegt in der Schwebung, nicht in der Richtung.
    this.forkGain = this.ctx.createGain();
    this.forkGain.gain.value = 0;
    this.forkA = this.ctx.createOscillator();
    this.forkB = this.ctx.createOscillator();
    this.forkA.type = 'sine';
    this.forkB.type = 'sine';
    this.forkA.frequency.value = 440;
    this.forkB.frequency.value = 444;
    this.forkA.connect(this.forkGain);
    this.forkB.connect(this.forkGain);
    this.forkGain.connect(this.master);
    this.forkA.start();
    this.forkB.start();

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

    // Strömung: tiefes, PULSIERENDES gerichtetes Rauschen – drängender als
    // Wind (dessen Böen-LFO die Filterfrequenz moduliert; hier pulsiert die
    // Lautstärke selbst im 2,4-Hz-Takt).
    const flow = this.ctx.createBufferSource();
    flow.buffer = this.noiseBuffer('brown');
    flow.loop = true;
    const flowFilter = this.ctx.createBiquadFilter();
    flowFilter.type = 'bandpass';
    flowFilter.frequency.value = 260;
    flowFilter.Q.value = 1.6;
    const pulse = this.ctx.createOscillator();
    pulse.frequency.value = 2.4;
    const pulseGain = this.ctx.createGain();
    pulseGain.gain.value = 0.5;
    const pulseBase = this.ctx.createGain();
    pulseBase.gain.value = 0.5;
    pulse.connect(pulseGain).connect(pulseBase.gain);
    this.currentGain = this.ctx.createGain();
    this.currentGain.gain.value = 0;
    this.currentPanner = this.panner();
    flow.connect(flowFilter).connect(pulseBase).connect(this.currentGain);
    this.currentGain.connect(this.currentPanner).connect(this.master);
    flow.start();
    pulse.start();

    // Horcher: Schnüffeln/Knistern – helles Rauschen, von einem Rechteck-LFO
    // in Schnüffel-Stöße zerhackt; Stoßrate steigt mit der eigenen
    // Rollgeschwindigkeit (er hört DICH).
    const sniff = this.ctx.createBufferSource();
    sniff.buffer = this.noiseBuffer('white');
    sniff.loop = true;
    const sniffFilter = this.ctx.createBiquadFilter();
    sniffFilter.type = 'bandpass';
    sniffFilter.frequency.value = 1500;
    sniffFilter.Q.value = 2.8;
    this.sniffLfo = this.ctx.createOscillator();
    this.sniffLfo.type = 'square';
    this.sniffLfo.frequency.value = 3;
    const sniffDepth = this.ctx.createGain();
    sniffDepth.gain.value = 0.5;
    const sniffBase = this.ctx.createGain();
    sniffBase.gain.value = 0.5;
    this.sniffLfo.connect(sniffDepth).connect(sniffBase.gain);
    this.listenerGain = this.ctx.createGain();
    this.listenerGain.gain.value = 0;
    this.listenerPanner = this.panner();
    sniff.connect(sniffFilter).connect(sniffBase).connect(this.listenerGain);
    this.listenerGain.connect(this.listenerPanner).connect(this.master);
    sniff.start();
    this.sniffLfo.start();

    // Eis: kristallines Sirren – zwei leicht verstimmte hohe Sinus mit
    // Vibrato, ungepannt (es kommt von unter dem eigenen Ball).
    this.iceGain = this.ctx.createGain();
    this.iceGain.gain.value = 0;
    this.iceVibrato = this.ctx.createOscillator();
    this.iceVibrato.frequency.value = 6;
    const vibratoDepth = this.ctx.createGain();
    vibratoDepth.gain.value = 14;
    this.iceVibrato.connect(vibratoDepth);
    for (const f of [2350, 2364]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      vibratoDepth.connect(osc.frequency);
      const g = this.ctx.createGain();
      g.gain.value = 0.5;
      osc.connect(g).connect(this.iceGain);
      osc.start();
    }
    this.iceVibrato.start();
    this.iceGain.connect(this.master);

    // Sog-Anker: elektrisches Brummen – zwei fast gleiche Rechtecke schweben
    // gegeneinander (Netzbrumm-Charakter), klar getrennt von Wächter-Sägezahn
    // und Loch-Grollen.
    this.anchorGain = this.ctx.createGain();
    this.anchorGain.gain.value = 0;
    this.anchorPanner = this.panner();
    const anchorFilter = this.ctx.createBiquadFilter();
    anchorFilter.type = 'bandpass';
    anchorFilter.frequency.value = 420;
    anchorFilter.Q.value = 1.2;
    for (const f of [96, 97.3]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.value = 0.5;
      osc.connect(g).connect(anchorFilter);
      osc.start();
    }
    anchorFilter.connect(this.anchorGain);
    this.anchorGain.connect(this.anchorPanner).connect(this.master);

    // ZEHRFELD (M102): ein SAUGENDES Zehren – schmalbandiges Rauschen um
    // 300 Hz mit langsamem Atem (0,7 Hz). Bewusst RAUSCHEN und nicht tonal:
    // Die tonalen Stimmen sind vergeben (Schlüssel, Stimmgabel, Resonanz,
    // Partner), und ein Ton hier klänge nach etwas, das man holen soll. Der
    // Atem trennt es vom Wind (breit und stetig) und von der Strömung
    // (gerichtet und drängend): Dies hier zieht, ohne zu schieben.
    this.drainGain = this.ctx.createGain();
    this.drainGain.gain.value = 0;
    this.drainPanner = this.panner();
    const drainFilter = this.ctx.createBiquadFilter();
    drainFilter.type = 'bandpass';
    drainFilter.frequency.value = 300;
    drainFilter.Q.value = 3.5;
    const drainNoise = this.ctx.createBufferSource();
    drainNoise.buffer = this.noiseBuffer('brown');
    drainNoise.loop = true;
    const drainBreath = this.ctx.createGain();
    drainBreath.gain.value = 0.55;
    const breathLfo = this.ctx.createOscillator();
    breathLfo.type = 'sine';
    breathLfo.frequency.value = 0.7;
    const breathDepth = this.ctx.createGain();
    breathDepth.gain.value = 0.45;
    breathLfo.connect(breathDepth).connect(drainBreath.gain);
    breathLfo.start();
    drainNoise.connect(drainFilter).connect(drainBreath).connect(this.drainGain);
    this.drainGain.connect(this.drainPanner).connect(this.master);
    drainNoise.start();
  }

  /** Zehrfeld in Hörweite (M102): closeness01 = 1 mittendrin, 0 außer Reichweite. */
  setDrain(closeness01: number, dx: number, dy: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.drainGain.gain.setTargetAtTime(Math.min(0.4, closeness01 ** 1.4 * 0.45), t, 0.12);
    if (closeness01 > 0) this.place(this.drainPanner, dx, dy);
  }

  /** Bezahlt (M102): ein schlürfender Abwärtston plus Rausch-Zug – das
   *  Gegenstück zum hellen Aufwärts-Anschlag des Echo-Kristalls. Ungepannt:
   *  Es passiert AN einem selbst, nicht irgendwo im Raum. */
  drainPay(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(620, t);
    osc.frequency.exponentialRampToValueAtTime(140, t + 0.45);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.55);
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer('white');
    const nf = this.ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.setValueAtTime(900, t);
    nf.frequency.exponentialRampToValueAtTime(200, t + 0.4);
    nf.Q.value = 2;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.22, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    noise.connect(nf).connect(ng).connect(this.master);
    noise.start(t);
    noise.stop(t + 0.5);
  }

  // Sog-Anker: closeness01 = 1 im Zentrum, 0 = außer Hörweite.
  setAnchor(closeness01: number, dx: number, dy: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.anchorGain.gain.setTargetAtTime(Math.min(0.45, closeness01 ** 1.5 * 0.5), t, 0.1);
    if (closeness01 > 0) this.place(this.anchorPanner, dx, dy);
  }

  // Echo-Kristall eingesammelt: glasklarer Glockenschlag mit Obertönen –
  // heller und einzelner als das Gem-Arpeggio.
  collectCrystal(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [2637, 5274, 7911].forEach((f, i) => {
      const osc = this.ctx!.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const gain = this.ctx!.createGain();
      const g = [0.3, 0.12, 0.05][i]!;
      gain.gain.setValueAtTime(g, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.7 - i * 0.15);
      osc.connect(gain).connect(this.master);
      osc.start(t);
      osc.stop(t + 0.75);
    });
  }

  // Glasboden knackt beim ersten Überrollen: kurzer, heller Riss.
  glassCrack(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer('white');
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 2600;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t);
    src.stop(t + 0.1);
    const ping = this.ctx.createOscillator();
    ping.type = 'sine';
    ping.frequency.setValueAtTime(3200, t);
    ping.frequency.exponentialRampToValueAtTime(2300, t + 0.08);
    const pg = this.ctx.createGain();
    pg.gain.setValueAtTime(0.18, t);
    pg.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    ping.connect(pg).connect(this.master);
    ping.start(t);
    ping.stop(t + 0.14);
  }

  // Glasboden zerbricht: Splittern – fallende Glaspartials plus Scherbenregen.
  glassShatter(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [3600, 2900, 2200, 1500].forEach((f, i) => {
      const osc = this.ctx!.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, t + i * 0.04);
      osc.frequency.exponentialRampToValueAtTime(f * 0.55, t + i * 0.04 + 0.25);
      const gain = this.ctx!.createGain();
      gain.gain.setValueAtTime(0.16, t + i * 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.04 + 0.3);
      osc.connect(gain).connect(this.master);
      osc.start(t + i * 0.04);
      osc.stop(t + i * 0.04 + 0.32);
    });
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer('white');
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 3200;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t);
    src.stop(t + 0.5);
  }

  // Nebel: fog01 = 0 klare Luft, 1 mitten im Nebelkern. Exponentiell von
  // 18 kHz (offen) auf ~500 Hz (Watte) – weich nachgeführt.
  setFog(fog01: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const freq = 18000 * Math.pow(500 / 18000, Math.max(0, Math.min(1, fog01)));
    this.fogFilter.frequency.setTargetAtTime(freq, t, 0.25);
  }

  // Horcher-Schnüffeln: closeness01 = Nähe, activity01 = eigene Roll-Aktivität
  // (still = fast lautlos, der Horcher schläft).
  setListener(closeness01: number, activity01: number, dx: number, dy: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const g = Math.min(0.5, closeness01 ** 1.4 * (0.12 + 0.88 * activity01) * 0.6);
    this.listenerGain.gain.setTargetAtTime(g, t, 0.1);
    this.sniffLfo.frequency.setTargetAtTime(2.5 + activity01 * 6, t, 0.15);
    if (closeness01 > 0) this.place(this.listenerPanner, dx, dy);
  }

  // Eis-Sirren: slide01 = Gleitgeschwindigkeit (0 = nicht auf Eis).
  setIce(slide01: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.iceGain.gain.setTargetAtTime(Math.min(0.22, slide01 * 0.26), t, 0.08);
    this.iceVibrato.frequency.setTargetAtTime(4 + slide01 * 7, t, 0.15);
  }

  // Strömung: closeness01 = 1 mittendrin, 0 = außer Hörweite.
  setCurrent(closeness01: number, dx: number, dy: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.currentGain.gain.setTargetAtTime(Math.min(0.7, closeness01 ** 1.4 * 0.8), t, 0.1);
    if (closeness01 > 0) this.place(this.currentPanner, dx, dy);
  }

  // Schiebewand schleift auf (rising) bzw. zu (falling): körniges Steinreiben,
  // tiefer und rauer als das Tür-Gleiten.
  slideGrind(dx: number, dy: number, opening: boolean): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this.spatialOut(dx, dy);
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer('brown');
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 2.2;
    filter.frequency.setValueAtTime(opening ? 90 : 320, t);
    filter.frequency.exponentialRampToValueAtTime(opening ? 320 : 90, t + 0.55);
    const wobble = this.ctx.createOscillator();
    wobble.frequency.value = 11;
    const wobbleGain = this.ctx.createGain();
    wobbleGain.gain.value = 45;
    wobble.connect(wobbleGain).connect(filter.frequency);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.55, t + 0.07);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    src.connect(filter).connect(gain).connect(out);
    src.start(t);
    src.stop(t + 0.65);
    wobble.start(t);
    wobble.stop(t + 0.65);
  }

  // Warn-Takt der Schiebewand: kurzer, steinerner Klack aus ihrer Richtung.
  slideTick(dx: number, dy: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.exponentialRampToValueAtTime(140, t + 0.05);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.22, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    osc.connect(gain).connect(this.spatialOut(dx, dy));
    osc.start(t);
    osc.stop(t + 0.08);
  }

  // Zeitschloss ausgelöst: federnder Aufzieh-Klick (heller als die Druckplatte).
  switchPress(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [740, 1180].forEach((f, i) => {
      const osc = this.ctx!.createOscillator();
      osc.type = 'square';
      osc.frequency.value = f;
      const gain = this.ctx!.createGain();
      gain.gain.setValueAtTime(0.16, t + i * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.06 + 0.07);
      osc.connect(gain).connect(this.master);
      osc.start(t + i * 0.06);
      osc.stop(t + i * 0.06 + 0.09);
    });
  }

  // Zeitschloss-Countdown: Tick-Tock (zwei alternierende Höhen), Rate und
  // Schärfe steigen mit der Dringlichkeit. Pro Frame aufrufen; intern getaktet.
  switchTick(urgency01: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (t < this.nextTock) return;
    this.nextTock = t + 0.72 - urgency01 * 0.5;
    this.tockHigh = !this.tockHigh;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = this.tockHigh ? 1320 : 990;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.1 + urgency01 * 0.14, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.07);
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

  /** Hörer-Blickrichtung setzen (First Person). Läuft pro Frame mit. */
  setHeading(rad: number): void {
    this.heading = rad;
  }

  /** Richtung -> Position auf dem Kreis (Radius 3) um den Hörer; -z ist „vorn".
   *  Vorher wird die WELT-Richtung um -heading gedreht: Der Hörer schaut in
   *  Blickrichtung, also ist „vorn" das, was auf dem Screen oben liegt. */
  private unitPos(dx: number, dy: number): { x: number; z: number } {
    const c = Math.cos(this.heading);
    const sn = Math.sin(this.heading);
    const rx = dx * c + dy * sn;
    const ry = -dx * sn + dy * c;
    const d = Math.hypot(rx, ry) || 1;
    return { x: (rx / d) * 3, z: (ry / d) * 3 };
  }

  // Quelle auf den Einheitskreis um den Hörer setzen; -z ist "vorn".
  private place(panner: PannerNode, dx: number, dy: number): void {
    const { x, z } = this.unitPos(dx, dy);
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

  /** Rollstein rollt an (M47): schweres Mahlen, 0,35 s, aus seiner Richtung. */
  boulderRoll(dx: number, dy: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer('brown');
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(420, t);
    lp.frequency.linearRampToValueAtTime(260, t + 0.35);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.7, t + 0.05);
    g.gain.setValueAtTime(0.7, t + 0.28);
    g.gain.linearRampToValueAtTime(0, t + 0.38);
    src.connect(lp).connect(g).connect(this.spatialOut(dx, dy));
    src.start(t);
    src.stop(t + 0.4);
  }

  /** Rollstein hält an (M47): dumpfer, kurzer Schlag. */
  boulderStop(dx: number, dy: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + 0.18);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.6, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc.connect(g).connect(this.spatialOut(dx, dy));
    osc.start(t);
    osc.stop(t + 0.25);
  }

  /** Rollstein füllt ein Loch (M47): tiefer Fall, dann Stille statt Grollen. */
  boulderSink(dx: number, dy: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.5);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    const out = this.spatialOut(dx, dy);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + 0.65);
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer('brown');
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0, t + 0.4);
    ng.gain.linearRampToValueAtTime(0.5, t + 0.45);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    src.connect(ng).connect(out);
    src.start(t + 0.4);
    src.stop(t + 0.95);
  }

  /** Hallraum (M46): 0 = trocken, 1 = voller Nachhall. */
  setReverb(level01: number): void {
    if (!this.ctx) return;
    this.reverbSend.gain.setTargetAtTime(Math.min(0.7, level01 * 0.7), this.ctx.currentTime, 0.2);
  }

  /** Lockglocke (M46): heller Glockenschlag mit Obertönen, 4 s Nachklang,
   *  gepannt aus Richtung der Glocke – die Horcher hören ihn auch. */
  bellRing(dx: number, dy: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this.spatialOut(dx, dy);
    // Glocken-Partialtöne (nicht harmonisch – das macht den Metallklang).
    [
      [1046, 0.5, 4.0],
      [2093, 0.25, 2.6],
      [2793, 0.18, 1.8],
      [4186, 0.1, 1.1],
    ].forEach(([f, g, dur]) => {
      const osc = this.ctx!.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f!;
      const gain = this.ctx!.createGain();
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(g!, t + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur!);
      osc.connect(gain).connect(out);
      osc.start(t);
      osc.stop(t + dur! + 0.05);
    });
    // Breitbandiger Anschlag (Klöppel), damit das Ohr die Richtung fasst.
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer('white');
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2600;
    bp.Q.value = 1.2;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.35, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    src.connect(bp).connect(ng).connect(out);
    src.start(t);
    src.stop(t + 0.08);
  }

  /** Schläfer (M45): Schnarchen aus seiner Richtung, closeness01 wie beim Wächter. */
  setSnore(closeness01: number, dx: number, dy: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.snoreGain.gain.setTargetAtTime(Math.min(0.4, closeness01 ** 1.5 * 0.45), t, 0.12);
    if (closeness01 > 0) this.place(this.snorePanner, dx, dy);
  }

  /** Schläfer erwacht (M45): scharfes Zischen aus seiner Richtung – der Ping
   *  hat ihn geweckt, und das hört man SOFORT. */
  sleeperWake(dx: number, dy: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer('white');
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1800, t);
    bp.frequency.exponentialRampToValueAtTime(4200, t + 0.35);
    bp.Q.value = 2.5;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.5, t + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    src.connect(bp).connect(gain).connect(this.spatialOut(dx, dy));
    src.start(t);
    src.stop(t + 0.55);
  }

  /** Stimmgabel (M45): level01 = Lautstärke (0 = aus), beatHz = Schwebung. */
  setFork(level01: number, beatHz: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.forkGain.gain.setTargetAtTime(Math.min(0.22, level01 * 0.22), t, 0.08);
    if (level01 > 0) this.forkB.frequency.setTargetAtTime(440 + beatHz, t, 0.06);
  }

  /** Sanduhr eingesammelt (M45): kurzes Rieseln, dann ein heller Tick. */
  collectHourglass(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer('white');
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 5000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    src.connect(hp).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 0.4);
    const tick = this.ctx.createOscillator();
    tick.type = 'square';
    tick.frequency.value = 1480;
    const tg = this.ctx.createGain();
    tg.gain.setValueAtTime(0, t + 0.3);
    tg.gain.linearRampToValueAtTime(0.25, t + 0.31);
    tg.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    tick.connect(tg).connect(this.master);
    tick.start(t + 0.3);
    tick.stop(t + 0.55);
  }

  /** Rivale im Duell: Rollen aus seiner Richtung. Hörst du ihn hinter dir,
   *  bist du vorn – das ist die eigentliche Anzeige, nicht eine Zahl.
   *  muffled = andere Ebene (dann nur ein fernes Grundeln, wie im Nebel). */
  setRival(closeness01: number, dx: number, dy: number, muffled = false): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const target = closeness01 <= 0 ? 0 : Math.min(0.42, closeness01 ** 1.4 * 0.5) * (muffled ? 0.35 : 1);
    this.rivalGain.gain.setTargetAtTime(target, t, 0.12);
    // Näher = eine Spur klarer (120 Hz fern, 320 Hz direkt daneben).
    this.rivalFilter.frequency.setTargetAtTime(muffled ? 110 : 120 + closeness01 * 200, t, 0.2);
    if (closeness01 > 0) this.place(this.rivalPanner, dx, dy);
  }

  /** Positionswechsel im Duell: kurzer Zweiklang – aufwärts, wenn DU
   *  vorbeiziehst, abwärts, wenn der Rivale dich überholt. */
  rivalPass(ahead: boolean): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const notes = ahead ? [587.33, 880] : [880, 587.33];
    notes.forEach((f, i) => {
      const osc = this.ctx!.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = f;
      const gain = this.ctx!.createGain();
      const t0 = t + i * 0.09;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.14, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.22);
      osc.connect(gain).connect(this.master);
      osc.start(t0);
      osc.stop(t0 + 0.24);
    });
  }

  /** Partner im COOP (M88): warmer Quint-Grundton aus seiner Richtung, dazu
   *  ein Rollanteil nach seiner Geschwindigkeit (`moving01`). Im RACE bleibt
   *  er stumm – dort ist die Blindheit das Rennen, wie dort auch Platten nicht
   *  zählen (M57). `muffled` = andere Ebene: nur ein fernes Grundeln.
   *  Der Nebel dämpft ihn von selbst (fogFilter am Master). */
  setBuddy(closeness01: number, dx: number, dy: number, moving01 = 0, muffled = false): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const near = Math.max(0, Math.min(1, closeness01));
    // Leiser als der Rivale (0.42): Der Partner soll die Welt nicht zudecken,
    // sondern in ihr stehen.
    const target = near <= 0 ? 0 : Math.min(0.3, near ** 1.5 * 0.34) * (muffled ? 0.3 : 1);
    this.buddyGain.gain.setTargetAtTime(target, t, 0.15);
    this.buddyRollGain.gain.setTargetAtTime(near <= 0 ? 0 : 0.22 * Math.max(0, Math.min(1, moving01)), t, 0.12);
    this.buddyFilter.frequency.setTargetAtTime(muffled ? 320 : 500 + near * 900, t, 0.2);
    if (near > 0) this.place(this.buddyPanner, dx, dy);
  }

  /**
   * DUETT (M91): Die beiden Resonanztöne. `mineHz`/`theirsHz` = null heißt
   * „steht niemand auf dem Feld" (dann ist die Stimme still). `aim` 0…1 ist die
   * Genauigkeit – sie fährt den Schimmer eine Oktave über dem eigenen Ton auf,
   * damit man das Ziel HÖRT, ehe das Tor aufgeht. Die Frequenz gleitet (kein
   * Sprung): Ein Ton, der springt, klingt kaputt, und die Schwebung braucht
   * Zeit, um langsamer zu werden.
   */
  setResonance(
    mineHz: number | null,
    theirsHz: number | null,
    dx: number,
    dy: number,
    aim = 0,
    guideHz: number | null = null,
  ): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // Solange ich stimme, weicht die Welt zurück (siehe Welt-Bus oben): Zwei
    // Töne aufeinander abzustimmen geht nur, wenn man sie auch hört.
    this.worldDuck.gain.setTargetAtTime(mineHz !== null ? TUNE_DUCK : 1, t, 0.18);
    this.resMineGain.gain.setTargetAtTime(mineHz ? 0.14 : 0, t, 0.12);
    if (mineHz) {
      this.resMineOsc.frequency.setTargetAtTime(mineHz, t, 0.04);
      this.resShimmerOsc.frequency.setTargetAtTime(mineHz * 2, t, 0.04);
    }
    this.resTheirsGain.gain.setTargetAtTime(theirsHz ? 0.14 : 0, t, 0.12);
    if (theirsHz) {
      this.resTheirsOsc.frequency.setTargetAtTime(theirsHz, t, 0.04);
      this.place(this.resTheirsPanner, dx, dy);
    }
    const shimmer = mineHz && theirsHz ? Math.max(0, Math.min(1, aim)) ** 2 * 0.06 : 0;
    this.resShimmerGain.gain.setTargetAtTime(shimmer, t, 0.15);
    // Der Führungston ist deutlich leiser als die beiden Stimmen: Er soll die
    // Schwebung stiften, nicht das Duett übertönen.
    this.resGuideGain.gain.setTargetAtTime(guideHz ? 0.075 : 0, t, 0.12);
    if (guideHz) this.resGuideOsc.frequency.setTargetAtTime(guideHz, t, 0.04);
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

  /** Wegmarke (M89): weicher Holz-Tick aus ihrer Richtung, Takt wird schneller,
   *  je näher man ist – wie das Schlüssel-Klimpern, aber dumpf und ohne Metall.
   *  Bewusst KEIN Glockenton (die Glocke lockt Horcher) und kein Ping-Teal-
   *  Klang (der Ping ist ein Ereignis, die Boje ein Ort). Es tickt immer nur
   *  die NÄCHSTE – ein Bus, eine Richtung, wie beim Automaten. */
  markTick(dx: number, dy: number, dist01: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (t < this.nextMarkTick) return;
    this.nextMarkTick = t + 0.6 + dist01 * 1.4;
    const out = this.spatialOut(dx, dy);
    // Holz: kurzer Dreieck-Anschlag mit schnellem Abfall, tief genug, um nicht
    // mit dem Schlüssel (1760 Hz) verwechselt zu werden.
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(430, t);
    osc.frequency.exponentialRampToValueAtTime(300, t + 0.06);
    const gain = this.ctx.createGain();
    const g = 0.03 + (1 - dist01) * 0.1;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(g, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    osc.connect(gain).connect(out);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  /** Quittung am eigenen Ball (ungepannt – sie kommt von mir, nicht aus der
   *  Welt): abgelegt = zwei Töne aufwärts, aufgenommen = abwärts. */
  markSet(placed: boolean): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const notes = placed ? [430, 645] : [645, 430];
    notes.forEach((f, i) => {
      const osc = this.ctx!.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = f;
      const gain = this.ctx!.createGain();
      const t0 = t + i * 0.07;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.12, t0 + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.14);
      osc.connect(gain).connect(this.master);
      osc.start(t0);
      osc.stop(t0 + 0.16);
    });
  }

  /** GEMEINSAM ANKOMMEN (M90): Der Partner steht im Ziel und wartet auf mich.
   *  Ein RUF, kein Puls: zwei Töne aufwärts (Quarte, wie man einen Namen
   *  ruft), ungepannt – er kommt vom Schirm, nicht aus der Welt, wie das
   *  Konfetti. Ein Pulsieren wäre in diesem Spiel der Herzschlag und damit
   *  Gefahr (siehe die Partner-Stimme); Warten ist keine Gefahr, es ist eine
   *  Aufforderung. Wird jeden Frame gerufen, die Sperre hält den Abstand –
   *  hört das Warten auf, bleibt nichts stehen, das man abschalten müsste. */
  waitCall(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (t < this.nextWaitCall) return;
    this.nextWaitCall = t + 1.6;
    [659.25, 880].forEach((f, i) => {
      const osc = this.ctx!.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = f;
      const gain = this.ctx!.createGain();
      const t0 = t + i * 0.16;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.07, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.34);
      osc.connect(gain).connect(this.master);
      osc.start(t0);
      osc.stop(t0 + 0.36);
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

  // Druckplatte: satter Klick beim Drücken, tieferer beim Loslassen.
  plate(pressed: boolean): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = pressed ? 620 : 380;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.08);
  }

  // Tür gleitet wieder zu (Umkehrung von doorOpen).
  doorClose(dx: number, dy: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this.spatialOut(dx, dy);
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer('brown');
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(700, t);
    filter.frequency.exponentialRampToValueAtTime(180, t + 0.4);
    filter.Q.value = 1.5;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    src.connect(filter).connect(gain).connect(out);
    src.start(t);
    src.stop(t + 0.5);
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
  /** Wand-Rempler aus Richtung der Normale. `soft` = Schallschutzwand: tiefer,
   *  leiser und kürzer – ein Stoß in Dämmstoff statt gegen Stein. */
  hit(intensity01: number, nx: number, ny: number, soft = false): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime((soft ? 110 : 160) + intensity01 * (soft ? 50 : 120), t);
    osc.frequency.exponentialRampToValueAtTime(soft ? 45 : 55, t + (soft ? 0.06 : 0.09));
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(Math.min(1, 0.15 + intensity01 * 0.9) * (soft ? 0.45 : 1), t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + (soft ? 0.08 : 0.12));
    osc.connect(gain).connect(this.spatialOut(-nx, -ny));
    osc.start(t);
    osc.stop(t + (soft ? 0.1 : 0.14));
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
  echoPing(reflections: PingReflection[], opts: PingOptions = {}): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // Musik weicht dem Ping (Sidechain) – vor dem Chirp, damit schon der
    // Anschlag frei steht.
    this.duckMusic();
    const chirpGain = opts.chirpGain ?? 0.25;
    if (chirpGain > 0.001) {
      const chirp = this.ctx.createOscillator();
      chirp.type = 'sine';
      chirp.frequency.setValueAtTime(1400, t);
      chirp.frequency.exponentialRampToValueAtTime(900, t + 0.08);
      const cg = this.ctx.createGain();
      cg.gain.setValueAtTime(chirpGain, t);
      cg.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      chirp.connect(cg).connect(this.master);
      chirp.start(t);
      chirp.stop(t + 0.11);
    }

    const debug: PingDebug = { chirpGain, refl: [] };
    for (const r of reflections) {
      const out = this.spatialOut(r.dx, r.dy);
      const blips = r.double ? [0, 0.07] : [0];
      blips.forEach((off, i) => {
        const t0 = t + 0.1 + r.delay + off;
        const vol = r.gain * (i === 0 ? 1 : 0.7);
        const osc = this.ctx!.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = r.freq ?? 950;
        const gain = this.ctx!.createGain();
        gain.gain.setValueAtTime(0, t0);
        gain.gain.linearRampToValueAtTime(vol, t0 + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.12);
        osc.connect(gain).connect(out);
        osc.start(t0);
        osc.stop(t0 + 0.14);
        // Breitbandiger ANSCHLAG durch denselben Panner. Erst er macht die
        // Richtung hörbar: Ein (fast) reiner Ton um 1 kHz ist der schlechteste
        // Reiz fürs Ortungsgehör – Laufzeitunterschiede werden dort
        // phasen-mehrdeutig, Lautstärkeunterschiede sind noch klein. Der
        // kurze Rausch-Transient (Band um 2,6 kHz) liefert beides sauber,
        // ohne die tonale Signatur des Elements zu überdecken.
        const nz = this.ctx!.createBufferSource();
        nz.buffer = this.noiseBuffer('white');
        const band = this.ctx!.createBiquadFilter();
        band.type = 'bandpass';
        band.frequency.value = 2600;
        band.Q.value = 0.7;
        const ng = this.ctx!.createGain();
        ng.gain.setValueAtTime(0, t0);
        ng.gain.linearRampToValueAtTime(vol * 0.85, t0 + 0.004);
        ng.gain.exponentialRampToValueAtTime(0.001, t0 + 0.05);
        nz.connect(band).connect(ng).connect(out);
        // Rotierender Offset: jeder Anschlag ein anderer Ausschnitt, damit es
        // nicht mechanisch identisch klingt (deterministisch, kein Zufall).
        this.noiseCursor = (this.noiseCursor + 0.137) % 1;
        nz.start(t0, this.noiseCursor * (nz.buffer.duration - 0.1));
        nz.stop(t0 + 0.06);
        const pos = this.unitPos(r.dx, r.dy);
        debug.refl.push({ x: pos.x, z: pos.z, gain: vol, broadband: true });
      });
    }
    (window as unknown as { __tiltrPing?: PingDebug }).__tiltrPing = debug;
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
    this.setCurrent(0, 0, 0);
    this.setListener(0, 0, 0, 0);
    this.setIce(0);
    this.setAnchor(0, 0, 0);
    this.setDrain(0, 0, 0);
    this.setRolling(0);
  }

  /** Konfetti-Salve: kurze Papier-Knaller plus Funkeln.
   *
   *  Bewusst STEREO gepannt und NICHT über den HRTF-Pfad: Die Feier kommt vom
   *  SCHIRM, nicht aus der Spielwelt. Über `place()` würde sie mit der
   *  Blickrichtung mitdrehen (First Person) – ein Konfetti-Knall „hinter dem
   *  Ball" wäre Unsinn. */
  confetti(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const pan = (at: number): AudioNode => {
      const p = this.ctx!.createStereoPanner();
      p.pan.value = at;
      p.connect(this.master);
      return p;
    };
    // Vier Knaller, links/rechts verteilt wie die beiden Kanonen.
    const pops: Array<[number, number, number]> = [
      // [Zeitpunkt, Panorama, Höhe des Bandpass]
      [0, -0.75, 1300],
      [0.055, 0.7, 1650],
      [0.13, -0.35, 1100],
      [0.2, 0.85, 1900],
    ];
    for (const [off, at, freq] of pops) {
      const t0 = t + off;
      const out = pan(at);
      const nz = this.ctx.createBufferSource();
      nz.buffer = this.noiseBuffer('white');
      const band = this.ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = freq;
      band.Q.value = 1.1;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.3, t0 + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.14);
      nz.connect(band).connect(gain).connect(out);
      this.noiseCursor = (this.noiseCursor + 0.211) % 1;
      nz.start(t0, this.noiseCursor * (nz.buffer.duration - 0.2));
      nz.stop(t0 + 0.16);
    }
    // Funkeln: absteigende helle Blips, wie herabtaumelndes Papier.
    [2600, 2100, 3100, 1800, 2400].forEach((f, i) => {
      const t0 = t + 0.16 + i * 0.085;
      const out = pan(i % 2 === 0 ? 0.5 : -0.5);
      const osc = this.ctx!.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, t0);
      osc.frequency.exponentialRampToValueAtTime(f * 0.72, t0 + 0.18);
      const gain = this.ctx!.createGain();
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.1, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.2);
      osc.connect(gain).connect(out);
      osc.start(t0);
      osc.stop(t0 + 0.22);
    });
  }

  /* --- Jukebox: Musik-Bus (M27) --------------------------------------------
     Die Musik kommt RÄUMLICH aus dem Automaten (derselbe HRTF-Pfad wie
     Wächter, Portal und Strömung) – damit ist sie keine Hintergrundmusik,
     sondern ein akustisches Wahrzeichen, an dem man sich orientieren kann.
     Der Scheduler wohnt in app.ts, hier stehen nur die Stimmen. */

  /** Läuft der Audio-Graph schon? (Der Scheduler plant nur dann.) */
  get running(): boolean {
    return this.ctx !== null;
  }

  /** Die Audio-Uhr. Der Musik-Scheduler MUSS in dieser Zeitbasis planen:
   *  performance.now() driftet gegen den Audio-Takt, und Noten, die nach
   *  Wanduhr gesetzt werden, eiern hörbar. */
  now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  /** Entfernung und Richtung des Automaten (pro Frame). closeness01 = 1 direkt
   *  daneben, 0 = außer Hörweite. */
  setMusic(closeness01: number, dx: number, dy: number, immediate = false): void {
    if (!this.ctx) return;
    // Quadratisch: Musik soll LOKAL bleiben, ein Problem des Raums – nicht des
    // Levels. 0.5 Deckel, damit sie den Ping nie ganz zudeckt.
    const target = Math.min(0.5, closeness01 ** 2 * 0.55);
    // `immediate` für die Vorschau: Dort soll der erste Ton sofort stehen,
    // im Spiel darf sich die Entfernung nur weich ändern.
    if (immediate) this.musicVol.gain.setValueAtTime(target, this.ctx.currentTime);
    else this.musicVol.gain.setTargetAtTime(target, this.ctx.currentTime, 0.12);
    if (closeness01 > 0) this.place(this.musicPanner, dx, dy);
  }

  /** EINE Note einplanen. `atS` liegt in der Audio-Zeitbasis (siehe now()). */
  musicNote(voice: Voice, freq: number, atS: number, durS: number, gain: number): void {
    if (!this.ctx) return;
    const t0 = Math.max(this.ctx.currentTime, atS);
    const g = this.ctx.createGain();
    // Schnelle Hüllkurve mit kurzem Abfall – 8-Bit-Kanäle haben keinen
    // weichen Anschlag, und ein Attack über 5 ms nimmt dem Puls den Biss.
    const peak = gain * (voice === 'noise' ? 0.16 : voice === 'triangle' ? 0.22 : 0.14);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * 0.55), t0 + Math.min(0.12, durS));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + durS);
    g.connect(this.musicDuck);

    if (voice === 'noise') {
      const nz = this.ctx.createBufferSource();
      nz.buffer = this.noiseBuffer('white');
      const band = this.ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 1800;
      band.Q.value = 0.8;
      nz.connect(band).connect(g);
      this.noiseCursor = (this.noiseCursor + 0.173) % 1;
      nz.start(t0, this.noiseCursor * (nz.buffer.duration - 0.3));
      nz.stop(t0 + durS + 0.02);
      this.trackMusicSource(nz);
    } else {
      const osc = this.ctx.createOscillator();
      if (voice === 'triangle') osc.type = 'triangle';
      else if (this.pulseWave) osc.setPeriodicWave(this.pulseWave);
      else osc.type = 'square';
      osc.frequency.value = freq;
      osc.connect(g);
      osc.start(t0);
      osc.stop(t0 + durS + 0.02);
      this.trackMusicSource(osc);
    }
    this.musicNotes++;
  }

  /** Quellen merken, damit ein Titelwechsel sie abwürgen kann – und die Liste
   *  dabei ausdünnen (sonst wächst sie über einen langen Lauf unbegrenzt). */
  private trackMusicSource(src: OscillatorNode | AudioBufferSourceNode): void {
    src.addEventListener('ended', () => {
      const i = this.musicSources.indexOf(src);
      if (i !== -1) this.musicSources.splice(i, 1);
    });
    this.musicSources.push(src);
  }

  /** Alles Eingeplante sofort abwürgen (Titelwechsel, Levelende). */
  stopMusic(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const src of this.musicSources.splice(0)) {
      try {
        src.stop(t);
      } catch {
        /* schon beendet – nichts zu tun */
      }
    }
    this.musicVol.gain.cancelScheduledValues(t);
    this.musicVol.gain.setValueAtTime(0, t);
  }

  /** Sidechain: Der Echo-Ping drückt die Musik kurz herunter (≈ -12 dB), damit
   *  die Reflexionen lesbar bleiben. Musik DARF störend sein – aber nicht das
   *  einzige Werkzeug des Spielers unbrauchbar machen. */
  private duckMusic(): void {
    if (!this.ctx || !this.musicDuck) return;
    const t = this.ctx.currentTime;
    const p = this.musicDuck.gain;
    p.cancelScheduledValues(t);
    p.setValueAtTime(p.value, t);
    p.linearRampToValueAtTime(MUSIC_DUCK, t + 0.03);
    p.setValueAtTime(MUSIC_DUCK, t + MUSIC_DUCK_HOLD);
    p.linearRampToValueAtTime(1, t + MUSIC_DUCK_HOLD + MUSIC_DUCK_RELEASE);
  }

  /** Plattenkratzer beim Anrempeln: Rausch-Wischer plus ein Ton, dessen Höhe
   *  absackt – wie ein aus dem Takt geworfener Plattenspieler. `hard01`
   *  skaliert die Tiefe des Absackens, nicht nur die Lautstärke. */
  scratch(hard01: number, dx: number, dy: number): void {
    if (!this.ctx) return;
    this.musicScratches++;
    const t = this.ctx.currentTime;
    const hard = Math.max(0.15, Math.min(1, hard01));
    const out = this.spatialOut(dx, dy);

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(420, t);
    osc.frequency.exponentialRampToValueAtTime(70 - hard * 40, t + 0.1 + hard * 0.12);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0.16 * hard, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.16 + hard * 0.12);
    osc.connect(og).connect(out);
    osc.start(t);
    osc.stop(t + 0.3 + hard * 0.12);

    // Der Wischer: Bandpass fährt zweimal hin und her (Hand auf der Platte).
    const nz = this.ctx.createBufferSource();
    nz.buffer = this.noiseBuffer('white');
    const band = this.ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 3.5;
    band.frequency.setValueAtTime(2400, t);
    band.frequency.exponentialRampToValueAtTime(700, t + 0.07);
    band.frequency.exponentialRampToValueAtTime(2000, t + 0.14);
    band.frequency.exponentialRampToValueAtTime(600, t + 0.22);
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.22 * hard, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
    nz.connect(band).connect(ng).connect(out);
    this.noiseCursor = (this.noiseCursor + 0.317) % 1;
    nz.start(t, this.noiseCursor * (nz.buffer.duration - 0.3));
    nz.stop(t + 0.3);
  }

  /** Stimm-Modus: Wie stark die Welt gerade zurückweicht (1 = voll da). Für
   *  die E2E – „hört man wirklich nur die zwei Töne?" ist sonst nicht prüfbar
   *  (wie `musicState` für „ist es wirklich still?"). */
  worldDuckValue(): number {
    return this.worldDuck?.gain.value ?? 1;
  }

  musicState(): MusicDebug {
    return {
      duck: this.musicDuck?.gain.value ?? 1,
      vol: this.musicVol?.gain.value ?? 0,
      notes: this.musicNotes,
      scratches: this.musicScratches,
    };
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
