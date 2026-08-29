// Netz-Helfer: Raumcodes und das Parsen gescannter QR-Inhalte.

import { describe, expect, it } from 'vitest';
import { NOSTR_RELAYS, makeRoomCode } from '../src/net/transport';
import { extractRoomCode } from '../src/ui/scanner';

describe('makeRoomCode', () => {
  it('erzeugt 6 Zeichen ohne verwechselbare (0/O/1/I)', () => {
    for (let i = 0; i < 200; i++) {
      const code = makeRoomCode();
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    }
  });
});

describe('extractRoomCode', () => {
  it('liest den Code aus einem Join-Link', () => {
    expect(extractRoomCode('https://d0m1n1kr.github.io/tiltr/#join=AB2CD3')).toBe('AB2CD3');
  });
  it('akzeptiert einen rohen Code (auch kleingeschrieben)', () => {
    expect(extractRoomCode('ab2cd3')).toBe('AB2CD3');
    expect(extractRoomCode('TESTXY')).toBe('TESTXY');
  });
  it('lehnt anderen Inhalt ab', () => {
    expect(extractRoomCode('https://example.com/irgendwas')).toBeNull();
    expect(extractRoomCode('zu lang und mit leerzeichen')).toBeNull();
    expect(extractRoomCode('AB')).toBeNull();
  });
});

describe('NOSTR_RELAYS', () => {
  it('feste Liste von 8 wss-Relays für den Handshake', () => {
    expect(NOSTR_RELAYS).toHaveLength(8);
    expect(new Set(NOSTR_RELAYS).size).toBe(8);
    for (const url of NOSTR_RELAYS) expect(url).toMatch(/^wss:\/\//);
  });
});
