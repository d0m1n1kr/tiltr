// Share-Link-Codec: Level als kompaktes, URL-taugliches Token – komplett
// serverlos wie die Daily-Links. Deflate kommt vom NATIVEN
// CompressionStream('deflate-raw') (0 KB Bundle statt ~45 KB pako; iOS ≥
// 16.4, Chrome 80+, Firefox 113+, Node ≥ 18). Das erste Zeichen des Tokens
// ist die Codec-Version: '1' = deflate-raw + base64url, '0' = unkomprimiert
// (Fallback für Umgebungen ohne CompressionStream – Empfänger MIT Streams
// lesen beide). Sollte je ein Altgerät wichtig werden, kann pako hinter
// genau dieser API nachgerüstet werden, ohne bestehende Links zu brechen.

const V_RAW = '0';
const V_DEFLATE = '1';

/** Warnschwelle fürs UI: darüber werden Links unhandlich (QR, Messenger). */
export const SHARE_WARN_BYTES = 8000;

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replaceAll('-', '+').replaceAll('_', '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const readable = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(readable).arrayBuffer());
}

/** Rohe Level-Def -> Token (erst Codec-Version, dann base64url-Daten). */
export async function encodeLevel(def: Record<string, unknown>): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(def));
  if (typeof CompressionStream === 'undefined') return V_RAW + toBase64Url(json);
  const packed = await pipe(json, new CompressionStream('deflate-raw'));
  return V_DEFLATE + toBase64Url(packed);
}

/** Token -> rohe Level-Def; wirft bei kaputten/fremden Tokens. */
export async function decodeLevel(token: string): Promise<Record<string, unknown>> {
  const version = token[0];
  const bytes = fromBase64Url(token.slice(1));
  let json: Uint8Array;
  if (version === V_DEFLATE) {
    if (typeof DecompressionStream === 'undefined') throw new Error('DecompressionStream fehlt');
    json = await pipe(bytes, new DecompressionStream('deflate-raw'));
  } else if (version === V_RAW) {
    json = bytes;
  } else {
    throw new Error(`Unbekannte Codec-Version "${version}"`);
  }
  const parsed: unknown = JSON.parse(new TextDecoder().decode(json));
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('Kein Level-Objekt');
  return parsed as Record<string, unknown>;
}

/** Kompletter Share-Link auf die aktuelle Seite. */
export async function shareUrl(def: Record<string, unknown>): Promise<string> {
  const token = await encodeLevel(def);
  return `${location.origin}${location.pathname}#level=${token}`;
}
