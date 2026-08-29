// Netzschicht für 2-Spieler-Multiplayer.
//
// Zwei Transporte hinter einem Interface:
// - TrysteroTransport (Nostr): P2P über WebRTC; der Handshake läuft über
//   eine FESTE Liste von 8 etablierten Nostr-Relays statt Auto-Discovery –
//   die Default-Tracker waren in anderen Projekten zu unzuverlässig.
// - LocalTransport (BroadcastChannel): gleiche Origin, gleicher Browser –
//   für E2E-Tests und lokales Entwickeln ohne Netz. Raumcodes mit dem
//   Präfix "TEST" wählen ihn automatisch.

export type MessageHandler = (type: string, payload: unknown) => void;
export type PeerHandler = (event: 'join' | 'leave') => void;

export interface Transport {
  send(type: string, payload: unknown): void;
  onMessage(cb: MessageHandler): void;
  onPeer(cb: PeerHandler): void;
  leave(): void;
}

// 8 etablierte, seit Jahren stabile Nostr-Relays für den WebRTC-Handshake.
export const NOSTR_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://relay.nostr.band',
  'wss://relay.snort.social',
  'wss://nostr.mom',
  'wss://offchain.pub',
  'wss://nostr.oxtr.dev',
];

const APP_ID = 'tiltr-mp-v1';

export function makeRoomCode(): string {
  // 6 Zeichen, ohne verwechselbare (0/O, 1/I)
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  const rand = crypto.getRandomValues(new Uint8Array(6));
  for (const b of rand) code += alphabet[b % alphabet.length];
  return code;
}

export async function connect(code: string): Promise<Transport> {
  return code.startsWith('TEST') ? new LocalTransport(code) : TrysteroTransport.create(code);
}

/* --- Trystero (Nostr) ------------------------------------------------------ */

interface TrysteroRoom {
  makeAction<T>(name: string): [(data: T) => void, (cb: (data: T, peerId: string) => void) => void];
  onPeerJoin(cb: (peerId: string) => void): void;
  onPeerLeave(cb: (peerId: string) => void): void;
  leave(): void;
}

class TrysteroTransport implements Transport {
  private messageCb: MessageHandler = () => {};
  private peerCb: PeerHandler = () => {};
  private sendAction!: (data: { t: string; p: unknown }) => void;
  private room!: TrysteroRoom;
  /** 2-Spieler-Raum: nur der erste Peer zählt, weitere werden ignoriert. */
  private peerId: string | null = null;

  static async create(code: string): Promise<TrysteroTransport> {
    const { joinRoom } = await import('trystero/nostr');
    const self = new TrysteroTransport();
    // Alle 8 Relays parallel nutzen (redundancy), nicht nur eine Teilmenge.
    self.room = joinRoom(
      { appId: APP_ID, relayConfig: { urls: NOSTR_RELAYS, redundancy: NOSTR_RELAYS.length } },
      code,
    ) as unknown as TrysteroRoom;
    const [send, receive] = self.room.makeAction<{ t: string; p: unknown }>('msg');
    self.sendAction = send;
    receive((data, peerId) => {
      if (self.peerId !== null && peerId !== self.peerId) return;
      self.messageCb(data.t, data.p);
    });
    self.room.onPeerJoin((peerId) => {
      if (self.peerId === null) {
        self.peerId = peerId;
        self.peerCb('join');
      }
    });
    self.room.onPeerLeave((peerId) => {
      if (peerId === self.peerId) {
        self.peerId = null;
        self.peerCb('leave');
      }
    });
    return self;
  }

  send(type: string, payload: unknown): void {
    this.sendAction({ t: type, p: payload });
  }
  onMessage(cb: MessageHandler): void {
    this.messageCb = cb;
  }
  onPeer(cb: PeerHandler): void {
    this.peerCb = cb;
  }
  leave(): void {
    this.room.leave();
  }
}

/* --- Lokal (BroadcastChannel) ---------------------------------------------- */

class LocalTransport implements Transport {
  private channel: BroadcastChannel;
  private closed = false;
  private readonly uid = Math.random().toString(36).slice(2);
  private peerUid: string | null = null;
  private messageCb: MessageHandler = () => {};
  private peerCb: PeerHandler = () => {};

  constructor(code: string) {
    this.channel = new BroadcastChannel(`tiltr-mp-${code}`);
    this.channel.onmessage = (e) => {
      const { uid, t, p } = e.data as { uid: string; t: string; p: unknown };
      if (uid === this.uid) return;
      if (t === '@hello') {
        const isNew = this.peerUid === null;
        this.peerUid = uid;
        this.post('@hello-ack', null);
        if (isNew) this.peerCb('join');
        return;
      }
      if (t === '@hello-ack') {
        if (this.peerUid === null) {
          this.peerUid = uid;
          this.peerCb('join');
        }
        return;
      }
      if (t === '@bye') {
        if (uid === this.peerUid) {
          this.peerUid = null;
          this.peerCb('leave');
        }
        return;
      }
      if (this.peerUid === uid) this.messageCb(t, p);
    };
    this.post('@hello', null);
  }

  private post(t: string, p: unknown): void {
    if (this.closed) return;
    this.channel.postMessage({ uid: this.uid, t, p });
  }
  send(type: string, payload: unknown): void {
    this.post(type, payload);
  }
  onMessage(cb: MessageHandler): void {
    this.messageCb = cb;
  }
  onPeer(cb: PeerHandler): void {
    this.peerCb = cb;
  }
  leave(): void {
    this.post('@bye', null);
    this.closed = true;
    this.channel.close();
  }
}
