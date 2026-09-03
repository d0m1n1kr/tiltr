// Netzschicht für 2-Spieler-Multiplayer.
//
// Zwei Transporte hinter einem Interface:
// - TrysteroTransport (Nostr): P2P über WebRTC; der Handshake läuft über
//   eine FESTE Liste von 8 etablierten Nostr-Relays statt Auto-Discovery –
//   die Default-Tracker waren in anderen Projekten zu unzuverlässig.
// - LocalTransport (BroadcastChannel): gleiche Origin, gleicher Browser –
//   für E2E-Tests und lokales Entwickeln ohne Netz. Raumcodes mit dem
//   Präfix "TEST" wählen ihn automatisch.

import type { RelayState } from './health';

export type MessageHandler = (type: string, payload: unknown) => void;
export type PeerHandler = (event: 'join' | 'leave') => void;

/** Ein Ereignis der Netzschicht für die Diagnose (Lobby-Debug, M70). */
export interface NetEvent {
  /** ms seit dem Verbinden */
  at: number;
  text: string;
}

/** Was die Netzschicht über sich sagt – Grundlage der Lobby-Diagnose (M70).
 *  „Sie finden sich nicht" ist ohne DIESE Auskunft nicht zu unterscheiden von
 *  „kein Vermittler erreichbar", „falscher Raum" oder „Partner ist weg". */
export interface TransportInfo {
  kind: 'nostr' | 'local';
  /** eigene Peer-ID (trystero selfId) – im Log des Partners wiederzufinden */
  selfId: string;
  /** Handshake-Server: beide Seiten nutzen DIESELBE feste Liste */
  relays: RelayState[];
  /** Peers, mit denen eine Verbindung steht */
  peers: string[];
  events: NetEvent[];
}

export interface Transport {
  send(type: string, payload: unknown): void;
  onMessage(cb: MessageHandler): void;
  onPeer(cb: PeerHandler): void;
  leave(): void;
  /** Momentaufnahme für die Diagnose (kein Zustand, nur Auskunft). */
  info(): TransportInfo;
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

// Minimale Sicht auf die trystero-0.25-API (@trystero-p2p/core):
// makeAction liefert ein OBJEKT {send, onMessage}, onPeerJoin/-Leave sind
// zuweisbare Properties. (Die 0.21er-Tupel-API existiert nicht mehr –
// der frühere Cast hatte genau das versteckt.)
interface TrysteroAction<T> {
  send(data: T): Promise<void>;
  onMessage: ((data: T, ctx: { peerId: string }) => void) | null;
}
interface TrysteroRoom {
  makeAction<T>(name: string): TrysteroAction<T>;
  onPeerJoin: ((peerId: string) => void) | null;
  onPeerLeave: ((peerId: string) => void) | null;
  leave(): Promise<void>;
}

class TrysteroTransport implements Transport {
  private messageCb: MessageHandler = () => {};
  private peerCb: PeerHandler = () => {};
  private action!: TrysteroAction<{ t: string; p: unknown }>;
  private room!: TrysteroRoom;
  /** 2-Spieler-Raum: nur der erste Peer zählt, weitere werden ignoriert. */
  private peerId: string | null = null;
  private sockets: () => Record<string, WebSocket> = () => ({});
  private selfId = '?';
  private readonly t0 = Date.now();
  private readonly events: NetEvent[] = [];

  private log(text: string): void {
    this.events.push({ at: Date.now() - this.t0, text });
    // Ein Ringpuffer: Die Diagnose will die letzten Ereignisse, keine Chronik.
    if (this.events.length > 60) this.events.splice(0, this.events.length - 60);
  }

  static async create(code: string): Promise<TrysteroTransport> {
    const { joinRoom, getRelaySockets, selfId } = await import('trystero/nostr');
    const self = new TrysteroTransport();
    self.sockets = getRelaySockets as () => Record<string, WebSocket>;
    self.selfId = selfId;
    self.log(`Raum ${code} · ich ${selfId.slice(0, 8)} · ${NOSTR_RELAYS.length} Vermittler`);
    // Alle 8 Relays parallel nutzen (redundancy), nicht nur eine Teilmenge:
    // Beide Seiten sprechen damit garantiert dieselben Handshake-Server an
    // (getRelays in trystero nimmt eine gesetzte url-Liste unverändert – ohne
    // sie würfelt es je Gerät eine Teilmenge, und dann finden sich zwei
    // Spieler nur, wenn sich die Teilmengen überschneiden).
    self.room = joinRoom(
      { appId: APP_ID, relayConfig: { urls: NOSTR_RELAYS, redundancy: NOSTR_RELAYS.length } },
      code,
      { onJoinError: (e: { error: string }) => self.log(`Fehler: ${e.error}`) },
    ) as unknown as TrysteroRoom;
    self.action = self.room.makeAction<{ t: string; p: unknown }>('msg');
    self.action.onMessage = (data, ctx) => {
      if (self.peerId !== null && ctx.peerId !== self.peerId) {
        self.log(`Nachricht von fremdem Peer ${ctx.peerId.slice(0, 8)} verworfen`);
        return;
      }
      self.messageCb(data.t, data.p);
    };
    self.room.onPeerJoin = (peerId) => {
      if (self.peerId === null) {
        self.peerId = peerId;
        self.log(`Partner da: ${peerId.slice(0, 8)}`);
        self.peerCb('join');
      } else {
        // Dritter im Raum – oder ein Zombie aus einer alten Sitzung. Beides
        // wird ignoriert, aber es steht im Log: Genau das erklärt ein
        // „der Partner kommt nicht durch", das nicht am Netz liegt.
        self.log(`weiterer Peer ${peerId.slice(0, 8)} ignoriert (Raum ist voll)`);
      }
    };
    self.room.onPeerLeave = (peerId) => {
      if (peerId === self.peerId) {
        self.peerId = null;
        self.log(`Partner weg: ${peerId.slice(0, 8)}`);
        self.peerCb('leave');
      } else self.log(`fremder Peer weg: ${peerId.slice(0, 8)}`);
    };
    return self;
  }

  info(): TransportInfo {
    const map = this.sockets();
    const states: Record<number, RelayState['state']> = {
      [WebSocket.CONNECTING]: 'connecting',
      [WebSocket.OPEN]: 'open',
      [WebSocket.CLOSING]: 'closing',
      [WebSocket.CLOSED]: 'closed',
    };
    // Ein Relay, zu dem trystero (noch) keinen Socket hält, gilt als zu –
    // sonst sähe eine Liste mit einem einzigen Eintrag gesund aus.
    const relays: RelayState[] = NOSTR_RELAYS.map((url) => ({
      url,
      state: map[url] ? (states[map[url]!.readyState] ?? 'closed') : 'closed',
    }));
    return {
      kind: 'nostr',
      selfId: this.selfId,
      relays,
      peers: this.peerId === null ? [] : [this.peerId],
      events: [...this.events],
    };
  }

  send(type: string, payload: unknown): void {
    void this.action.send({ t: type, p: payload });
  }
  onMessage(cb: MessageHandler): void {
    this.messageCb = cb;
  }
  onPeer(cb: PeerHandler): void {
    this.peerCb = cb;
  }
  leave(): void {
    void this.room.leave();
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
  info(): TransportInfo {
    return {
      kind: 'local',
      selfId: this.uid,
      relays: [],
      peers: this.peerUid === null ? [] : [this.peerUid],
      events: [],
    };
  }
}
