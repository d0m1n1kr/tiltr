// SCREENCAST (M104, Phase 2): der reine Teil – Container-Wahl, Dateiname,
// Karten-Zeiten. Der Browser-Teil (MediaRecorder) wird im E2E gefahren.
import { describe, expect, it } from 'vitest';
import {
  CAST_MIMES,
  TAIL_FADE_MS,
  TAIL_MS,
  TITLE_FADE_MS,
  TITLE_HOLD_MS,
  TITLE_MS,
  castExtension,
  castFileName,
  expectedCastMs,
  fmtBytes,
  pickCastMime,
  tailAlpha,
  titleAlpha,
} from '../src/core/cast';

describe('Screencast (M104, Phase 2)', () => {
  it('wählt den ersten Container, den das Gerät kann – mp4 vor webm', () => {
    expect(pickCastMime(() => true)).toBe(CAST_MIMES[0]);
    expect(pickCastMime((m) => m.startsWith('video/webm'))).toBe('video/webm;codecs=vp9,opus');
    expect(pickCastMime((m) => m === 'video/webm')).toBe('video/webm');
    expect(pickCastMime(() => false)).toBeNull();
  });

  it('ein Browser, der beim Fragen wirft, kann es nicht', () => {
    expect(
      pickCastMime((m) => {
        if (m.includes('mp4')) throw new Error('nope');
        return m === 'video/webm';
      }),
    ).toBe('video/webm');
  });

  it('Endung und Dateiname folgen dem Container', () => {
    expect(castExtension('video/mp4;codecs=avc1')).toBe('mp4');
    expect(castExtension('video/webm')).toBe('webm');
    expect(castFileName('w2-04', 12.34, 'video/mp4')).toBe('tiltr-w2-04-12_3s.mp4');
    expect(castFileName('custom-Ä 7', 3, 'video/webm')).toBe('tiltr-custom-7-3_0s.webm');
    expect(castFileName('!!!', 1, 'video/webm')).toBe('tiltr-lauf-1_0s.webm');
  });

  it('Bytes lesbar', () => {
    expect(fmtBytes(512)).toBe('512 B');
    expect(fmtBytes(20 * 1024)).toBe('20 KB');
    expect(fmtBytes(12.34 * 1024 * 1024)).toBe('12.3 MB');
  });

  it('Titelkarte steht, blendet aus, ist weg; Abspann blendet ein', () => {
    expect(titleAlpha(0)).toBe(1);
    expect(titleAlpha(TITLE_MS - TITLE_FADE_MS)).toBe(1);
    expect(titleAlpha(TITLE_MS - TITLE_FADE_MS / 2)).toBeCloseTo(0.5, 6);
    expect(titleAlpha(TITLE_MS)).toBe(0);
    expect(titleAlpha(TITLE_MS + 500)).toBe(0);
    expect(tailAlpha(0)).toBe(0);
    expect(tailAlpha(TAIL_FADE_MS / 2)).toBeCloseTo(0.5, 6);
    expect(tailAlpha(TAIL_MS)).toBe(1);
  });

  it('erwartete Länge: Titel-Pause + Lauf (im Zeitraffer halb) + Abspann', () => {
    expect(TITLE_HOLD_MS).toBe(TITLE_MS - TITLE_FADE_MS);
    expect(expectedCastMs(10, 1)).toBe(TITLE_HOLD_MS + 10000 + TAIL_MS);
    expect(expectedCastMs(10, 2)).toBe(TITLE_HOLD_MS + 5000 + TAIL_MS);
  });
});
