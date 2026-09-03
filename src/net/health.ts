// Zustand der Vermittler (Nostr-Relays) → was die Lobby sagt.
//
// Rein und DOM-frei: Der Transport liefert nur die Liste der Socket-Zustände,
// diese Datei entscheidet, ob wir noch verbinden, warten, oder ob niemand
// erreichbar ist. Grund für die eigene Datei: „Manchmal finden sie sich
// nicht" ist ohne Aussage über die Vermittler nicht diagnostizierbar – und
// die Aussage muss testbar sein, nicht im DOM verteilt.

export type SocketState = 'open' | 'connecting' | 'closing' | 'closed';

export interface RelayState {
  url: string;
  state: SocketState;
}

export interface RelayHealth {
  open: number;
  connecting: number;
  total: number;
}

export function relayHealth(relays: readonly RelayState[]): RelayHealth {
  return {
    open: relays.filter((r) => r.state === 'open').length,
    connecting: relays.filter((r) => r.state === 'connecting').length,
    total: relays.length,
  };
}

/**
 * Lage in der Lobby, solange KEIN Partner da ist:
 * - 'connecting': noch kein Socket offen, aber es ist erst ein Moment her.
 * - 'offline': kein Socket offen, obwohl Zeit war – die Vermittler sind nicht
 *   erreichbar (Netz, VPN, Firewall, blockierte WebSockets).
 * - 'waiting': mindestens ein Vermittler steht, wir warten auf den Partner.
 * - 'stalled': Vermittler stehen, aber nach einer halben Minute ist niemand
 *   gekommen – dann liegt es am Code, am Raum oder an einem hängenden
 *   Handshake, nicht am Netz. Der Vorschlag ist „neu verbinden".
 * - 'blocked' (M75): Der Partner WAR da – Angebot und Antwort sind über die
 *   Vermittler gelaufen –, aber zwischen den Geräten kam keine Strecke
 *   zustande. Das ist keine Wartelage, sondern ein Netz, das direkte
 *   Verbindungen verbietet (Mobilfunk-NAT, Gastnetz mit Client-Isolation).
 *   Deshalb steht es VOR allen Zeitregeln: „warte auf Partner" wäre gelogen.
 * Die Zeit kommt von außen (Sekunden seit dem Öffnen der Lobby), damit die
 * Regel ohne Uhr testbar bleibt.
 */
export type LobbyHint = 'connecting' | 'offline' | 'waiting' | 'stalled' | 'blocked';

export const OFFLINE_AFTER_S = 6;
export const STALLED_AFTER_S = 35;

export function lobbyHint(health: RelayHealth, waitingS: number, iceFailed = false): LobbyHint {
  if (iceFailed) return 'blocked';
  // Lokaler Transport (E2E, gleiches Gerät): keine Vermittler, kein Problem.
  if (health.total === 0) return waitingS < STALLED_AFTER_S ? 'waiting' : 'stalled';
  if (health.open === 0) return waitingS < OFFLINE_AFTER_S ? 'connecting' : 'offline';
  return waitingS < STALLED_AFTER_S ? 'waiting' : 'stalled';
}
