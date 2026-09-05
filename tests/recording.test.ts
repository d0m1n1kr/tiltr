// MITSCHNITT (M104): Eingabe je Bild plus Kugel als Wahrheit, Schlüsselstellen
// als Marker. Geprüft wird das Format – Bild rein, Bild raus – und die
// Grenzen (Überlauf, leerer Lauf).
import { describe, expect, it } from 'vitest';
import { FRAME_STRIDE, MAX_FRAMES, RunRecorder, duration, frameAt, frameCount } from '../src/core/recording';

const ball = (x: number, y: number, vx = 0, vy = 0) => ({ x, y, vx, vy });

describe('Mitschnitt (M104)', () => {
  it('ein Bild rein, dasselbe Bild raus – alle zehn Zahlen', () => {
    const r = new RunRecorder('lvl', 1000, false);
    r.frame(16.7, 0.0167, { x: 0.3, y: -0.5 }, true, 1, ball(150, 250, 12, -8));
    const rec = r.result(3.2)!;
    expect(rec.levelId).toBe('lvl');
    expect(rec.t0).toBe(1000);
    expect(rec.time).toBe(3.2);
    expect(rec.frames).toHaveLength(FRAME_STRIDE);
    expect(frameCount(rec)).toBe(1);
    expect(frameAt(rec, 0)).toEqual({ t: 16.7, dt: 0.0167, tx: 0.3, ty: -0.5, ping: true, floor: 1, x: 150, y: 250, vx: 12, vy: -8 });
    expect(frameAt(rec, 1)).toBeNull();
    expect(frameAt(rec, -1)).toBeNull();
  });

  it('die Uhr und der Schritt sind ZWEI Zeiten: dt bleibt geklemmt, t springt', () => {
    const r = new RunRecorder('lvl', 0, false);
    r.frame(16, 0.016, { x: 0, y: 0 }, false, 0, ball(0, 0));
    // Ein hängendes Bild: 300 ms Wanduhr, aber die Schleife klemmt dt bei 50 ms.
    r.frame(316, 0.05, { x: 0, y: 0 }, false, 0, ball(0, 0));
    const rec = r.result(null)!;
    expect(frameAt(rec, 1)!.t).toBe(316);
    expect(frameAt(rec, 1)!.dt).toBe(0.05);
    expect(duration(rec)).toBeCloseTo(0.316, 6);
  });

  it('Marker tragen Sekunden und gerundete Orte', () => {
    const r = new RunRecorder('lvl', 0, true);
    r.frame(16, 0.016, { x: 0, y: 0 }, false, 0, ball(0, 0));
    r.mark(1234.6, 'door', 2, 150.4, 249.6);
    const rec = r.result(null)!;
    expect(rec.fp).toBe(true);
    expect(rec.marks).toEqual([{ t: 1.235, kind: 'door', floor: 2, x: 150, y: 250 }]);
  });

  it('ohne ein einziges Bild gibt es keinen Mitschnitt', () => {
    expect(new RunRecorder('lvl', 0, false).result(null)).toBeNull();
  });

  it('ein Lauf über zehn Minuten wird nicht mitgeschnitten (Überlauf)', () => {
    const r = new RunRecorder('lvl', 0, false);
    for (let i = 0; i <= MAX_FRAMES; i++) r.frame(i * 16, 0.016, { x: 0, y: 0 }, false, 0, ball(0, 0));
    expect(r.count).toBe(MAX_FRAMES);
    expect(r.result(600)).toBeNull();
  });
});
