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
