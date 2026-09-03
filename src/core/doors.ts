// Türzustand aus ihren Öffnern – EINE Regel für Schlüssel, Zeitschloss-
// Schalter und Druckplatten, im Spiel (app.ts) wie im Editor-Vorschau-Modell.
//
// `require: 'any'` (Default): ein erfüllter Öffner genügt. `require: 'all'`:
// alle Öffner müssen GLEICHZEITIG erfüllt sein – alle Schlüssel eingesammelt,
// alle Schalter laufen, alle Platten gehalten. Ein Schlüssel ist dauerhaft
// erfüllt; besteht die erfüllte Bedingung nur aus Schlüsseln, ist die Tür
// DAUERHAFT offen (sie wird zu Schutt), sonst gleitet sie auf und wieder zu.
// Rein und DOM-frei wie der Rest von core/.

export type DoorRequire = 'any' | 'all';

export interface OpenerState {
  kind: 'key' | 'timedSwitch' | 'plate';
  /** Schlüssel: eingesammelt; Schalter: Timer läuft; Platte: gehalten */
  satisfied: boolean;
}

export interface DoorState {
  /** Tür ist jetzt passierbar */
  open: boolean;
  /** Tür bleibt für immer offen (nur Schlüssel haben sie geöffnet) */
  permanent: boolean;
}

export function doorState(openers: readonly OpenerState[], require: DoorRequire = 'any'): DoorState {
  if (!openers.length) return { open: false, permanent: false };
  if (require === 'all') {
    const open = openers.every((o) => o.satisfied);
    return { open, permanent: open && openers.every((o) => o.kind === 'key') };
  }
  const keyDone = openers.some((o) => o.kind === 'key' && o.satisfied);
  const open = keyDone || openers.some((o) => o.satisfied);
  return { open, permanent: keyDone };
}

/** Was eine Welt an Öffnern beiträgt – STRUKTURELL beschrieben, damit `World`
 *  (physics.ts) ohne Import passt und ein Test mit nackten Objekten reicht. */
export interface OpenerSource {
  keys: readonly { opens: string; collected: boolean }[];
  switches: readonly { opens: string; openUntil: number | null }[];
  plates: readonly { opens: string; held: boolean; boulder?: boolean }[];
}

/** Öffner-Zustände mehrerer Welten (alle Ebenen – im Coop die BEIDER Spieler)
 *  zu einer Liste je Tür-ID sammeln. EINE Stelle für Spiel, Multiplayer und
 *  den Editor-Testmodus: Wer eine Öffner-Art einführt, trägt sie hier ein. */
export function collectOpeners(sources: readonly OpenerSource[], now: number): Map<string, OpenerState[]> {
  const openers = new Map<string, OpenerState[]>();
  const add = (id: string, o: OpenerState): void => {
    const list = openers.get(id);
    if (list) list.push(o);
    else openers.set(id, [o]);
  };
  for (const s of sources) {
    for (const k of s.keys) add(k.opens, { kind: 'key', satisfied: k.collected });
    for (const sw of s.switches) add(sw.opens, { kind: 'timedSwitch', satisfied: sw.openUntil !== null && sw.openUntil > now });
    // Platte gehalten: von einem Spieler (MP, Testmodus) oder einem Rollstein (M47).
    for (const p of s.plates) add(p.opens, { kind: 'plate', satisfied: p.held || p.boulder === true });
  }
  return openers;
}
