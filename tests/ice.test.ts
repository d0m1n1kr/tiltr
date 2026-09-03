// M75: TURN – Eingabe deuten, Kandidaten zählen, Urteil fällen.
import { describe, expect, it } from 'vitest';
import {
  candidateKind,
  formatIceServers,
  hasTurn,
  iceHosts,
  iceVerdict,
  parseIceServers,
  type IceReport,
} from '../src/net/ice';
import { probeIce, type ProbePc } from '../src/net/iceProbe';

describe('parseIceServers', () => {
  it('nimmt die Zeilenform mit und ohne Zugangsdaten', () => {
    expect(parseIceServers('turn:example.com:3478|bob|geheim')).toEqual([
      { urls: 'turn:example.com:3478', username: 'bob', credential: 'geheim' },
    ]);
    expect(parseIceServers('stun:stun.example.com:3478')).toEqual([{ urls: 'stun:stun.example.com:3478' }]);
    expect(parseIceServers(' turns:example.com:5349?transport=tcp | bob | geheim ')).toEqual([
      { urls: 'turns:example.com:5349?transport=tcp', username: 'bob', credential: 'geheim' },
    ]);
  });

  it('mehrere Zeilen, leere Eingabe = keine Server (kein Fehler)', () => {
    expect(parseIceServers('turn:a.de:3478|u|p\nturn:b.de:3478|u|p')).toHaveLength(2);
    expect(parseIceServers('  ')).toEqual([]);
  });

  it('nimmt das JSON einer Anbieter-Konsole, auch mit urls-Liste', () => {
    const json = JSON.stringify({
      iceServers: [
        { urls: ['turn:a.de:3478?transport=udp', 'turn:a.de:80?transport=tcp'], username: 'u', credential: 'p' },
        { urls: 'stun:a.de:3478' },
      ],
    });
    expect(parseIceServers(json)).toEqual([
      { urls: 'turn:a.de:3478?transport=udp', username: 'u', credential: 'p' },
      { urls: 'turn:a.de:80?transport=tcp', username: 'u', credential: 'p' },
      { urls: 'stun:a.de:3478' },
    ]);
  });

  it('Unfug ist null – der Nutzer bekommt einen Hinweis, keine stille Ablage', () => {
    expect(parseIceServers('example.com:3478|u|p')).toBeNull();
    expect(parseIceServers('https://example.com')).toBeNull();
    expect(parseIceServers('{kaputt')).toBeNull();
    expect(parseIceServers('[]')).toBeNull();
  });

  it('Rückweg: formatIceServers hängt keine leeren Felder an', () => {
    const servers = parseIceServers('turn:a.de:3478|u|p\nstun:b.de:3478')!;
    expect(formatIceServers(servers)).toBe('turn:a.de:3478|u|p\nstun:b.de:3478');
    expect(parseIceServers(formatIceServers(servers))).toEqual(servers);
  });

  it('nur Wirte für die Anzeige, nie Zugangsdaten', () => {
    const servers = parseIceServers('turn:a.de:3478?transport=tcp|bob|geheim')!;
    expect(iceHosts(servers)).toEqual(['a.de:3478']);
    expect(iceHosts(servers).join()).not.toContain('geheim');
    expect(hasTurn(servers)).toBe(true);
    expect(hasTurn(parseIceServers('stun:a.de:3478')!)).toBe(false);
  });
});

describe('candidateKind', () => {
  it('liest den Typ aus der Kandidatenzeile', () => {
    expect(candidateKind('candidate:1 1 udp 2113937151 192.168.1.5 54321 typ host generation 0')).toBe('host');
    expect(candidateKind('candidate:2 1 udp 1677729535 84.1.2.3 54321 typ srflx raddr 0.0.0.0')).toBe('srflx');
    expect(candidateKind('candidate:3 1 udp 41885439 5.6.7.8 60000 typ relay raddr 84.1.2.3')).toBe('relay');
    expect(candidateKind('a=end-of-candidates')).toBeNull();
  });
});

describe('iceVerdict', () => {
  const rep = (over: Partial<IceReport>): IceReport => ({ host: 1, srflx: 1, relay: 0, errors: [], ms: 100, ...over });

  it('ein Relay-Kandidat ist der Beweis, dass der Weiterleiter trägt', () => {
    expect(iceVerdict(rep({ relay: 2 }), true)).toBe('ok');
  });
  it('TURN eingetragen, aber kein Relay-Kandidat: der Server antwortet nicht', () => {
    expect(iceVerdict(rep({}), true)).toBe('turnDead');
  });
  it('ohne TURN ist ein fehlender Relay-Kandidat kein Fehler, nur die Lage', () => {
    expect(iceVerdict(rep({}), false)).toBe('noTurn');
  });
  it('gar keine Kandidaten: das Gerät ist blind, nicht der Server tot', () => {
    expect(iceVerdict(rep({ host: 0, srflx: 0 }), true)).toBe('blind');
    expect(iceVerdict(null, true)).toBe('unknown');
  });
});

/** Wegwerf-Verbindung als Attrappe: liefert die Kandidaten, die der Test
 *  hineinlegt, und merkt sich, ob sie geschlossen wurde. */
function fakePc(lines: string[], errors: { errorCode?: number; errorText?: string }[] = []) {
  const state = { closed: false, servers: [] as unknown[] };
  const pc: ProbePc = {
    createDataChannel: () => null,
    createOffer: () => Promise.resolve({ type: 'offer', sdp: 'x' } as RTCSessionDescriptionInit),
    setLocalDescription: () => {
      for (const line of lines) pc.onicecandidate?.({ candidate: { candidate: line } });
      for (const e of errors) pc.onicecandidateerror?.(e);
      pc.onicecandidate?.({ candidate: null });
      return Promise.resolve();
    },
    close: () => {
      state.closed = true;
    },
    onicecandidate: null,
    onicecandidateerror: null,
  };
  return { pc, state };
}

describe('probeIce', () => {
  it('zählt die Typen und schließt die Verbindung wieder', async () => {
    const { pc, state } = fakePc([
      'candidate:1 1 udp 1 192.168.1.5 1 typ host',
      'candidate:2 1 udp 1 84.1.2.3 1 typ srflx',
      'candidate:3 1 udp 1 5.6.7.8 1 typ relay',
      'candidate:4 1 tcp 1 5.6.7.8 2 typ relay',
    ]);
    const report = await probeIce([{ urls: 'turn:a.de:3478' }], {
      create: () => pc,
      // Der Wecker muss NACH den Kandidaten schlagen: die Attrappe schickt
      // sie beim setLocalDescription, also in einer Microtask.
      after: (_ms, fn) => void setTimeout(fn, 0),
      now: () => 0,
    });
    expect(report).toMatchObject({ host: 1, srflx: 1, relay: 2, errors: [] });
    expect(state.closed).toBe(true);
  });

  it('sammelt Fehler des Servers, aber nicht denselben zehnmal', async () => {
    const err = { errorCode: 401, errorText: 'Unauthorized' };
    const { pc } = fakePc(['candidate:1 1 udp 1 10.0.0.1 1 typ host'], [err, err, err]);
    const report = await probeIce([{ urls: 'turn:a.de:3478' }], {
      create: () => pc,
      // Der Wecker muss NACH den Kandidaten schlagen: die Attrappe schickt
      // sie beim setLocalDescription, also in einer Microtask.
      after: (_ms, fn) => void setTimeout(fn, 0),
      now: () => 0,
    });
    expect(report.errors).toEqual(['401 Unauthorized']);
    expect(iceVerdict(report, true)).toBe('turnDead');
  });

  it('eine Verbindung, die gar nicht aufgeht, liefert einen Bericht statt zu werfen', async () => {
    const report = await probeIce([], {
      create: () => {
        throw new Error('kein WebRTC');
      },
    });
    expect(report.relay).toBe(0);
    expect(report.errors[0]).toContain('kein WebRTC');
  });
});
