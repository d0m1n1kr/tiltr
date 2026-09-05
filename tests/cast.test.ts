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
  castFormats,
  expectedCastMs,
  fileHasAudioTrack,
  fmtBytes,
  highlightSeconds,
  pickCastMimeFor,
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

  it('erwartete Länge: Titel-Pause + gezeigte Sekunden (im Zeitraffer halb) + Abspann', () => {
    expect(TITLE_HOLD_MS).toBe(TITLE_MS - TITLE_FADE_MS);
    expect(expectedCastMs(10, 1)).toBe(TITLE_HOLD_MS + 10000 + TAIL_MS);
    expect(expectedCastMs(10, 2)).toBe(TITLE_HOLD_MS + 5000 + TAIL_MS);
  });

  it('erkennt eine Tonspur im Dateikopf – mp4 über soun, webm über den Codec', () => {
    const enc = (s: string) => new TextEncoder().encode(s);
    expect(fileHasAudioTrack(enc('....ftypisom....moov....trak....hdlr....vide....trak....hdlr....soun....'))).toBe(true);
    expect(fileHasAudioTrack(enc('....ftypisom....moov....trak....hdlr....vide....'))).toBe(false);
    expect(fileHasAudioTrack(enc('.Eß£.B†.B÷.B‚.B„webmB‡.B….V_VP9...A_OPUS...'))).toBe(true);
    expect(fileHasAudioTrack(enc('....webm....V_VP9....'))).toBe(false);
    expect(fileHasAudioTrack(enc('irgendwas ohne Container'))).toBeNull();
  });

  it('Format-Regler: welche Container das Gerät kann, und der beste je Format', () => {
    const chromium = (m: string) => m === 'video/mp4' || m.startsWith('video/webm');
    expect(castFormats(chromium)).toEqual(['mp4', 'webm']);
    expect(pickCastMimeFor('webm', chromium)).toBe('video/webm;codecs=vp9,opus');
    expect(pickCastMimeFor('mp4', chromium)).toBe('video/mp4');
    const safari = (m: string) => m.startsWith('video/mp4');
    expect(castFormats(safari)).toEqual(['mp4']);
    expect(pickCastMimeFor('webm', safari)).toBeNull();
    expect(castFormats(() => false)).toEqual([]);
  });

  it('Highlights zeigen die Fenstersumme, nicht den Lauf', () => {
    const segs = [{ from: 0, to: 2.5 }, { from: 6, to: 9.5 }, { from: 14, to: 16 }];
    expect(highlightSeconds(segs)).toBeCloseTo(8, 6);
    expect(expectedCastMs(highlightSeconds(segs), 1)).toBe(TITLE_HOLD_MS + 8000 + TAIL_MS);
    expect(highlightSeconds([{ from: 3, to: 3 }])).toBe(0);
  });
});
