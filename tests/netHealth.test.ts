// M70: Was die Lobby über die Vermittler sagt – rein und ohne Uhr.
import { describe, expect, it } from 'vitest';
import { lobbyHint, relayHealth, OFFLINE_AFTER_S, STALLED_AFTER_S, type RelayState } from '../src/net/health';

const rs = (states: RelayState['state'][]): RelayState[] => states.map((state, i) => ({ url: `wss://r${i}`, state }));

describe('relayHealth', () => {
  it('zählt offene und verbindende Sockets', () => {
    expect(relayHealth(rs(['open', 'connecting', 'closed', 'open']))).toEqual({ open: 2, connecting: 1, total: 4 });
    expect(relayHealth([])).toEqual({ open: 0, connecting: 0, total: 0 });
  });
});

describe('lobbyHint', () => {
  it('gescheiterte Strecke sticht jede Wartelage (M75)', () => {
    // Der Partner WAR da (SDP ausgetauscht), nur die Verbindung kam nicht
    // zustande: „warte auf Partner" wäre gelogen, egal wie die Vermittler
    // stehen und wie lange man wartet.
    expect(lobbyHint(relayHealth(rs(['open', 'open'])), 1, true)).toBe('blocked');
    expect(lobbyHint(relayHealth(rs(['closed'])), 99, true)).toBe('blocked');
    expect(lobbyHint(relayHealth([]), 1, true)).toBe('blocked');
    // Ohne das Signal bleibt alles wie vorher (Vorgabe false).
    expect(lobbyHint(relayHealth(rs(['open'])), 1)).toBe('waiting');
  });

  it('kein Socket offen: erst „verbinde", dann „offline"', () => {
    const h = relayHealth(rs(['connecting', 'connecting']));
    expect(lobbyHint(h, 1)).toBe('connecting');
    expect(lobbyHint(h, OFFLINE_AFTER_S)).toBe('offline');
    expect(lobbyHint(relayHealth(rs(['closed', 'closed'])), 30)).toBe('offline');
  });
  it('mindestens ein Vermittler steht: warten – nach einer halben Minute „hängt"', () => {
    const h = relayHealth(rs(['open', 'closed']));
    expect(lobbyHint(h, 2)).toBe('waiting');
    expect(lobbyHint(h, STALLED_AFTER_S - 1)).toBe('waiting');
    expect(lobbyHint(h, STALLED_AFTER_S)).toBe('stalled');
  });
  it('lokaler Transport (keine Vermittler) ist nie „offline"', () => {
    const h = relayHealth([]);
    expect(lobbyHint(h, 0)).toBe('waiting');
    expect(lobbyHint(h, 10)).toBe('waiting');
    expect(lobbyHint(h, STALLED_AFTER_S)).toBe('stalled');
  });
});
