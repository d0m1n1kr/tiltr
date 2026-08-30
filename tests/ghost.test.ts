// Geist-Replay: Rasterung der Aufzeichnung, Interpolation der Wiedergabe,
// Ebenen-Sprünge und die Längen-Kappung.

import { describe, expect, it } from 'vitest';
import { GhostRecorder, sampleGhost, type GhostData } from '../src/ghost';

const record = (positions: Array<[number, number, number, number]>): number[] => {
  const rec = new GhostRecorder();
  for (const [t, f, x, y] of positions) rec.add(t, f, x, y);
  return rec.result()!;
};

describe('GhostRecorder', () => {
  it('hält mindestens 125 ms Abstand zwischen Samples', () => {
    const frames = record([
      [0.01, 0, 10, 10], // erstes Sample sofort
      [0.13, 0, 20, 20], // < 125 ms danach -> verworfen
      [0.14, 0, 21, 21],
      [0.26, 0, 30, 30], // < 125 ms nach 0.14 -> verworfen
    ]);
    expect(frames.length).toBe(8); // 2 Samples à 4 Werte
    expect(frames[2]).toBe(10);
    expect(frames[6]).toBe(21);
  });

  it('rundet Koordinaten auf ganze Pixel', () => {
    const frames = record([[0.2, 0, 123.456, 78.9]]);
    expect(frames[2]).toBe(123);
    expect(frames[3]).toBe(79);
  });

  it('kappt überlange Läufe (result() wird null)', () => {
    const rec = new GhostRecorder();
    for (let t = 0.125; t < 700; t += 0.125) rec.add(t, 0, 0, 0);
    expect(rec.result()).toBeNull();
  });
});

describe('sampleGhost', () => {
  const ghost: GhostData = {
    time: 2,
    frames: [0.125, 0, 100, 100, 0.25, 0, 200, 100, 0.375, 1, 500, 500],
  };

  it('interpoliert linear zwischen Rasterpunkten derselben Ebene', () => {
    const p = sampleGhost(ghost, 0.1875)!;
    expect(p.floor).toBe(0);
    expect(p.x).toBeCloseTo(150, 6);
    expect(p.y).toBe(100);
  });

  it('klemmt vor dem ersten und nach dem letzten Frame', () => {
    expect(sampleGhost(ghost, 0)).toMatchObject({ floor: 0, x: 100 });
    expect(sampleGhost(ghost, 99)).toMatchObject({ floor: 1, x: 500 });
  });

  it('springt an Ebenenwechseln statt zu interpolieren', () => {
    const before = sampleGhost(ghost, 0.26)!;
    const after = sampleGhost(ghost, 0.37)!;
    expect(before.floor).toBe(0);
    expect(after.floor).toBe(1);
    expect(after.x).toBe(500);
  });

  it('leere Spur liefert null', () => {
    expect(sampleGhost({ time: 1, frames: [] }, 0.5)).toBeNull();
  });
});
