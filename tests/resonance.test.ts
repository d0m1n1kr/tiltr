// Duett (M91): die Klang-Rechnung des Resonanz-Tors. Rein, also hier prüfbar –
// im Spiel braucht sie zwei Spieler und zwei Ohren.

import { describe, expect, it } from 'vitest';
import {
  FIFTH_CENTS,
  PITCH_SPAN_CENTS,
  RESONANCE_FORCE,
  RESONANCE_HOLD,
  RESONANCE_HZ,
  RESONANCE_R,
  TUNE_HOLD_MS,
  centsToHz,
  guideCents,
  holdTuned,
  inTune,
  pitchFromTilt,
  tuneAim,
  bowlPull,
  tuneStep,
} from '../src/core/resonance';
import { levelSchema, parseLevel } from '../src/levels/schema';
import { loadLevel } from '../src/levels/loader';

describe('pitchFromTilt', () => {
  it('Norden ist der Grundton, Süden die OKTAVE, Ost und West die Mitte', () => {
    expect(pitchFromTilt(0, -1).cents).toBeCloseTo(0, 5);
    expect(pitchFromTilt(0, 1).cents).toBeCloseTo(PITCH_SPAN_CENTS, 5);
    expect(pitchFromTilt(1, 0).cents).toBeCloseTo(PITCH_SPAN_CENTS / 2, 5);
    expect(pitchFromTilt(-1, 0).cents).toBeCloseTo(PITCH_SPAN_CENTS / 2, 5);
  });

  it('die QUINTE liegt im INNEREN, nicht am Rand (v3.25.3)', () => {
    // Vorher endete die Skala bei der Quinte: erreichbar nur bei Neigung exakt
    // nach Süden, ohne Luft nach beiden Seiten. Jetzt liegt sie bei 105° von
    // Norden – und links wie rechts davon geht es weiter.
    const at = (deg: number) => pitchFromTilt(Math.sin((deg * Math.PI) / 180), -Math.cos((deg * Math.PI) / 180)).cents;
    expect(Math.abs(at(105) - FIFTH_CENTS)).toBeLessThan(5);
    expect(at(95)).toBeLessThan(FIFTH_CENTS);
    expect(at(115)).toBeGreaterThan(FIFTH_CENTS);
    expect(PITCH_SPAN_CENTS).toBeGreaterThan(FIFTH_CENTS + 400);
  });

  it('nur die RICHTUNG zählt, nicht die Stärke', () => {
    expect(pitchFromTilt(0.2, 0.2).cents).toBeCloseTo(pitchFromTilt(0.9, 0.9).cents, 5);
  });

  it('ist überall stetig – auch dort, wo ein Kreis eine Naht hätte', () => {
    // Kurz vor und kurz hinter „genau nach unten": derselbe Ton, kein Sprung.
    const left = pitchFromTilt(-0.02, 1).cents;
    const right = pitchFromTilt(0.02, 1).cents;
    expect(Math.abs(left - right)).toBeLessThan(15);
    expect(left).toBeGreaterThan(PITCH_SPAN_CENTS - 25);
  });

  it('ohne Neigung klingt der Grundton, und `active` sagt „ich fasse nicht an"', () => {
    expect(pitchFromTilt(0, 0)).toEqual({ cents: 0, hz: RESONANCE_HZ, active: false });
    expect(pitchFromTilt(0.05, 0.02).cents).toBe(0);
    expect(pitchFromTilt(0.05, 0.02).active).toBe(false);
    expect(pitchFromTilt(0, -1).active).toBe(true);
  });

  it('Cent rechnen in Hz: die Quinte ist das 1,5-fache, die Oktave das Doppelte', () => {
    expect(centsToHz(FIFTH_CENTS) / RESONANCE_HZ).toBeCloseTo(1.5, 3);
    expect(centsToHz(PITCH_SPAN_CENTS)).toBeCloseTo(2 * RESONANCE_HZ, 5);
  });
});

describe('inTune', () => {
  it('Einklang: dieselbe Höhe, Toleranz 40 Cent', () => {
    expect(inTune(300, 300, 'unison')).toBe(true);
    expect(inTune(300, 335, 'unison')).toBe(true);
    expect(inTune(300, 360, 'unison')).toBe(false);
  });

  it('Quinte: der Abstand gilt in BEIDE Richtungen (wer oben steht, ist eine Rolle)', () => {
    expect(inTune(0, FIFTH_CENTS, 'fifth')).toBe(true);
    expect(inTune(FIFTH_CENTS, 0, 'fifth')).toBe(true);
    expect(inTune(100, 100 + FIFTH_CENTS, 'fifth')).toBe(true);
    expect(inTune(0, 0, 'fifth')).toBe(false);
    expect(inTune(0, FIFTH_CENTS - 60, 'fifth')).toBe(false);
  });

  it('die Quinte hat eine ganze FAMILIE von Lösungen, nicht eine (v3.25.3)', () => {
    // Auf der alten Skala (Ende = Quinte) ging nur „einer ganz oben, einer ganz
    // unten". Jetzt findet man sich überall im Bereich – 498 Cent breit.
    for (const low of [0, 100, 250, 400, PITCH_SPAN_CENTS - FIFTH_CENTS]) {
      expect(inTune(low, low + FIFTH_CENTS, 'fifth'), `ab ${low} Cent`).toBe(true);
      expect(low + FIFTH_CENTS).toBeLessThanOrEqual(PITCH_SPAN_CENTS);
    }
  });

  it('aus der Neigung heraus: beide gleich = Einklang, Oktave ist nicht die Quinte', () => {
    const up = pitchFromTilt(0, -1).cents;
    const down = pitchFromTilt(0, 1).cents;
    expect(inTune(up, up, 'unison')).toBe(true);
    expect(inTune(up, down, 'unison')).toBe(false);
    // Norden gegen Süden ist jetzt eine OKTAVE, keine Quinte mehr.
    expect(inTune(up, down, 'fifth')).toBe(false);
    // Die Quinte liegt bei 105° – von Norden aus.
    const fifth = pitchFromTilt(Math.sin((105 * Math.PI) / 180), -Math.cos((105 * Math.PI) / 180)).cents;
    expect(inTune(up, fifth, 'fifth')).toBe(true);
  });
});

describe('tuneAim', () => {
  it('1 im Intervall, fällt mit dem Abstand auf 0', () => {
    expect(tuneAim(300, 300, 'unison')).toBe(1);
    expect(tuneAim(0, FIFTH_CENTS, 'fifth')).toBe(1);
    const near = tuneAim(300, 400, 'unison');
    expect(near).toBeGreaterThan(0);
    expect(near).toBeLessThan(1);
    expect(tuneAim(0, 600, 'unison')).toBe(0);
  });
});

describe('holdTuned', () => {
  it('das Tor geht erst auf, wenn der Ton STEHT', () => {
    const a = holdTuned(null, true, 1000);
    expect(a).toEqual({ since: 1000, open: false });
    expect(holdTuned(a.since, true, 1000 + TUNE_HOLD_MS - 1).open).toBe(false);
    expect(holdTuned(a.since, true, 1000 + TUNE_HOLD_MS).open).toBe(true);
  });

  it('Danebenrutschen setzt zurück – ein Durchwischen öffnet nichts', () => {
    const b = holdTuned(1000, false, 1200);
    expect(b).toEqual({ since: null, open: false });
    // Und danach beginnt die Wartezeit von vorn.
    expect(holdTuned(b.since, true, 1300)).toEqual({ since: 1300, open: false });
  });
});

describe('bowlPull – eine Schale, kein Sog', () => {
  it('die Kraft WÄCHST bis zur Lippe und fällt dahinter auf null', () => {
    expect(bowlPull(0)).toBe(0);
    expect(bowlPull(22.5)).toBeCloseTo(RESONANCE_FORCE / 2, 5);
    expect(bowlPull(45)).toBeCloseTo(RESONANCE_FORCE, 5);
    expect(bowlPull(67.5)).toBeCloseTo(RESONANCE_FORCE / 2, 5);
    expect(bowlPull(90)).toBe(0);
    expect(bowlPull(200)).toBe(0);
  });

  it('genau umgekehrt zum Sog-Anker (der ist im Zentrum am stärksten)', () => {
    const anchorAt = (d: number) => RESONANCE_FORCE * (1 - d / 90);
    // Nahe am Zentrum zieht der Anker stark, die Schale kaum …
    expect(bowlPull(5)).toBeLessThan(anchorAt(5));
    // … und an der Lippe ist es andersherum.
    expect(bowlPull(45)).toBeGreaterThan(anchorAt(45));
  });

  it('die Lippe liegt in der MITTE der Schale – dahinter lässt sie los', () => {
    expect(bowlPull(44)).toBeLessThan(bowlPull(45));
    expect(bowlPull(46)).toBeLessThan(bowlPull(45));
  });

  it('die Lippenkraft bleibt unter der stärksten Neigung EINER Achse', () => {
    // 2600 · 0,7 = 1820: Nur so kommt man auch aus einer Nische mit einer
    // einzigen offenen Seite heraus (die Simulation unten beweist es).
    expect(RESONANCE_FORCE).toBeLessThan(2600 * 0.7);
    // Und sie hält die Schranke ein, die das Schema dem Sog-Anker setzt.
    const asAnchor = levelSchema.safeParse({
      id: 'x',
      name: 'x',
      floors: [
        {
          size: [3, 3],
          maze: { seed: 1 },
          start: [0, 0],
          goal: [2, 2],
          elements: [{ type: 'anchor', cell: [1, 1], force: RESONANCE_FORCE }],
        },
      ],
    });
    expect(asAnchor.success).toBe(true);
  });
});

// GEMESSEN, nicht geschätzt: dieselbe Physik wie im Spiel. Die erste Fassung
// hing am Sog-Profil, und da rutschte die Kugel beim STIMMEN von der Platte
// (Ruhelage bei sanfter Neigung: 61 px, Platte endet bei 41) – während man mit
// Tastatur (höchstens 0,7) nie herauskam. Beides steht hier als Zusicherung.
describe('Die Schale im Lauf der echten Physik', () => {
  // OFFENES Feld: Die Schale liegt in der Mitte, keine Wand in der Nähe –
  // sonst messe man Wände statt Kräfte (erster Versuch: die Kugel blieb bei
  // 41 px stehen, das war die Zellecke, nicht die Lippe).
  const carveAll = (cols: number, rows: number) => {
    const out: Array<[[number, number], 'e' | 's']> = [];
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        if (x < cols - 1) out.push([[x, y], 'e']);
        if (y < rows - 1) out.push([[x, y], 's']);
      }
    return out;
  };
  const field = () =>
    loadLevel(
      parseLevel({
        id: 'schale',
        name: 'Schale',
        players: 2,
        mpMode: 'coop',
        floors: [
          {
            size: [5, 5],
            maze: { seed: 3, carve: carveAll(5, 5) },
            elements: [
              { type: 'door', id: 'tor', edge: [[4, 4], 'n'] },
              { type: 'plate', cell: [2, 2], opens: 'tor', tune: 'unison' },
            ],
            start: [2, 2],
            goal: [0, 0],
            start2: [4, 4],
            goal2: [0, 4],
          },
        ],
      }),
    );

  /**
   * `seconds` lang mit dieser Neigung schieben, dann den Abstand zur Feldmitte
   * messen. Die Neigung RAMPT wie die echte Eingabe (input/tilt.ts: 0,15 je
   * Bild) – das ist keine Kosmetik: Ein Ruck gibt der Kugel Schwung, mit dem
   * sie über die Lippe kommt, und genau daran war eine erste Fassung im Test
   * grün und im Spiel eine Falle.
   */
  const hold = (tilt: { x: number; y: number }, seconds = 4): { end: number; max: number } => {
    const { world } = field();
    const pl = world.plates[0]!;
    const t = { x: 0, y: 0 };
    let max = 0;
    for (let i = 0; i < seconds * 60; i++) {
      t.x += (tilt.x - t.x) * 0.15;
      t.y += (tilt.y - t.y) * 0.15;
      world.step(1 / 60, t);
      max = Math.max(max, Math.hypot(world.ball.x - pl.x, world.ball.y - pl.y));
    }
    return { end: Math.hypot(world.ball.x - pl.x, world.ball.y - pl.y), max };
  };

  it('SANFT geneigt bleibt die Kugel im Feld (so wird gestimmt)', () => {
    for (const t of [0.15, 0.2, 0.3]) {
      const d = hold({ x: t, y: 0 });
      expect(d.max, `Neigung ${t}: Ausschlag ${d.max.toFixed(1)} px`).toBeLessThan(RESONANCE_HOLD);
    }
  });

  it('ein TIPP stimmt und lässt die Kugel im Feld – der Ton bleibt danach stehen', () => {
    // Die eigentliche Stimm-Bewegung, seit der Ton Zustand ist (v3.25.1):
    // kurz antippen, loslassen, der Ton steht. Auf der Tastatur ist ein Tipp
    // die einzige sanfte Neigung (eine gehaltene Taste ist immer 0,7).
    const { world } = field();
    const t = { x: 0, y: 0 };
    let max = 0;
    for (let i = 0; i < 300; i++) {
      t.x += ((i < 6 ? 0.7 : 0) - t.x) * 0.15;
      world.step(1 / 60, t);
      max = Math.max(max, Math.hypot(world.ball.x - world.plates[0]!.x, world.ball.y - world.plates[0]!.y));
      expect(world.platesUnderBall()).toHaveLength(1);
    }
    expect(max, `Ausschlag ${max.toFixed(1)} px`).toBeLessThan(RESONANCE_HOLD);
  });

  it('wer ENTSCHIEDEN kippt, rollt hinaus – keine Falle, in JEDER Richtung', () => {
    // Die Lippenkraft (1500) liegt unter der stärksten Neigung EINER Achse
    // (2600 · 0,7 = 1820): Auch aus einer Nische mit einer einzigen offenen
    // Seite kommt man heraus.
    for (const dir of [
      { x: 0.7, y: 0 },
      { x: -0.7, y: 0 },
      { x: 0, y: 0.7 },
      { x: 0, y: -0.7 },
      { x: 0.5, y: 0 },
    ]) {
      expect(hold(dir).end, `Richtung ${JSON.stringify(dir)}`).toBeGreaterThan(RESONANCE_R);
    }
  });
});

describe('tuneStep – der Ton ist Zustand, kein Abbild der Neigung', () => {
  it('Neigen dreht den Knopf, LOSLASSEN hält ihn', () => {
    // Betreten: irgendwo muss der Knopf stehen – der Grundton.
    let tone = tuneStep(null, true, 0, 0);
    expect(tone).toBe(0);
    // Nach Osten geneigt: die Mitte der Skala.
    tone = tuneStep(tone, true, 1, 0);
    expect(tone).toBeCloseTo(PITCH_SPAN_CENTS / 2, 5);
    // Gerät flach hingelegt: der Ton BLEIBT – das ist der Spielerwechsel im
    // Testmodus (wer 👥 antippt, hält das Gerät fast flach), und es ist die
    // Stimm-Bewegung selbst: antippen, loslassen, der Ton steht.
    const held = tuneStep(tone, true, 0, 0);
    expect(held).toBeCloseTo(PITCH_SPAN_CENTS / 2, 5);
    expect(tuneStep(held, true, 0.01, -0.01)).toBeCloseTo(PITCH_SPAN_CENTS / 2, 5);
  });

  it('das Feld verlassen macht stumm – und Betreten beginnt wieder beim Grundton', () => {
    expect(tuneStep(351, false, 1, 0)).toBeNull();
    expect(tuneStep(null, true, 0, 0)).toBe(0);
  });

  it('eine echte Neigung überschreibt jeden gehaltenen Wert', () => {
    expect(tuneStep(351, true, 0, 1)).toBeCloseTo(PITCH_SPAN_CENTS, 5);
    expect(tuneStep(FIFTH_CENTS, true, 0, -1)).toBeCloseTo(0, 5);
  });
});

describe('guideCents – der Führungston (v3.25.4)', () => {
  it('zeigt, wo MEIN Ton liegen müsste – bei der Quinte über oder unter seinem', () => {
    // Er steht bei 300, ich bei 900: das nähere Ziel ist 300 + 702.
    expect(guideCents(900, 300, 'fifth')).toBe(300 + FIFTH_CENTS);
    // Ich bei 100: näher ist 300 − 702 (auch wenn das unter null liegt – der
    // Ton führt mich in die richtige RICHTUNG, das Feld begrenzt ihn ohnehin).
    expect(guideCents(100, 300, 'fifth')).toBe(300 - FIFTH_CENTS);
    // Genau in der Mitte zwischen beiden Zielen: das obere gewinnt (<=).
    expect(guideCents(300, 300, 'fifth')).toBe(300 + FIFTH_CENTS);
  });

  it('beim Einklang IST sein Ton der Führungston – deshalb gibt app.ts dort keinen aus', () => {
    expect(guideCents(500, 300, 'unison')).toBe(300);
    expect(guideCents(100, 300, 'unison')).toBe(300);
  });

  it('am Führungston gemessen ist das Intervall gestimmt', () => {
    const theirs = 250;
    for (const mine of [0, 400, 900, 1200]) {
      const guide = guideCents(mine, theirs, 'fifth');
      expect(inTune(guide, theirs, 'fifth'), `von ${mine} aus`).toBe(true);
    }
  });
});
