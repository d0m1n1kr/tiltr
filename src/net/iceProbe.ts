// ICE-SELBSTTEST: Trägt der TURN-Server, den dieses Gerät eingetragen hat?
//
// Ohne diese Messung ist „findet sich nicht" nicht zu unterscheiden von
// „TURN-Zugangsdaten abgelaufen". Der Test braucht KEINEN Partner: Eine
// wegwerfbare Verbindung sammelt die eigenen Kandidaten, und ihre Typen sagen
// alles – 'srflx' heißt „STUN antwortet", 'relay' heißt „TURN antwortet".
// Es fließen keine Spieldaten, es wird nichts angeboten; nach dem Sammeln ist
// die Verbindung zu.

import { candidateKind, type IceReport, type IceServer } from './ice';

/** Der Teil von RTCPeerConnection, den der Test anfasst – injizierbar, damit
 *  die Regeln ohne Browser prüfbar sind (tests/ice.test.ts). */
export interface ProbePc {
  createDataChannel(label: string): unknown;
  createOffer(): Promise<RTCSessionDescriptionInit>;
  setLocalDescription(desc: RTCSessionDescriptionInit): Promise<void>;
  close(): void;
  onicecandidate: ((e: { candidate: { candidate: string } | null }) => void) | null;
  onicecandidateerror: ((e: { errorCode?: number; errorText?: string; url?: string }) => void) | null;
}

export interface ProbeOptions {
  /** Fabrik für die Wegwerf-Verbindung (Vorgabe: echte RTCPeerConnection). */
  create?: (servers: readonly IceServer[]) => ProbePc;
  /** Abbruch, wenn nichts mehr kommt (ms). */
  timeout?: number;
  now?: () => number;
  /** Wecker – im Test ein Sofort-Aufruf statt echter Zeit. */
  after?: (ms: number, fn: () => void) => void;
}

const defaultCreate = (servers: readonly IceServer[]): ProbePc =>
  // Die eigenen STUN-Server bleiben drin (trystero hängt seine an die
  // Verbindung, hier braucht es sie explizit): srflx ohne relay ist die
  // Aussage „STUN ja, TURN nein" – ohne STUN wäre sie nicht zu treffen.
  new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, ...servers] as RTCIceServer[],
  }) as unknown as ProbePc;

/**
 * Sammelt Kandidaten und zählt ihre Typen. Läuft immer die volle Wartezeit:
 * Ein Relay-Kandidat kommt nach den lokalen, und „schon fertig" gibt es beim
 * Gathering nicht verlässlich (Safari meldet 'complete' zu früh).
 */
export async function probeIce(servers: readonly IceServer[], opts: ProbeOptions = {}): Promise<IceReport> {
  const create = opts.create ?? defaultCreate;
  const timeout = opts.timeout ?? 6000;
  const now = opts.now ?? (() => performance.now());
  const after = opts.after ?? ((ms, fn) => setTimeout(fn, ms));
  const t0 = now();
  const counts = { host: 0, srflx: 0, prflx: 0, relay: 0 };
  const errors: string[] = [];
  let pc: ProbePc;
  try {
    pc = create(servers);
  } catch (e) {
    return { host: 0, srflx: 0, relay: 0, errors: [String(e)], ms: 0 };
  }
  return new Promise<IceReport>((resolve) => {
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      try {
        pc.close();
      } catch {
        /* egal, der Test ist vorbei */
      }
      resolve({ host: counts.host, srflx: counts.srflx, relay: counts.relay, errors, ms: Math.round(now() - t0) });
    };
    pc.onicecandidate = (e) => {
      if (!e.candidate) return;
      const kind = candidateKind(e.candidate.candidate);
      if (kind) counts[kind]++;
    };
    pc.onicecandidateerror = (e) => {
      // Nur die ersten Fehler: Ein toter TURN-Server meldet sich mehrfach.
      const text = `${e.errorCode ?? '?'} ${e.errorText ?? ''} ${e.url ?? ''}`.trim();
      if (errors.length < 4 && !errors.includes(text)) errors.push(text);
    };
    after(timeout, finish);
    void (async () => {
      try {
        pc.createDataChannel('probe');
        await pc.setLocalDescription(await pc.createOffer());
      } catch (e) {
        errors.push(String(e));
        finish();
      }
    })();
  });
}
