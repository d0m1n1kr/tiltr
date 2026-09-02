// Türregel (core/doors.ts): einer genügt oder alle gleichzeitig – für
// Schlüssel (dauerhaft), Zeitschloss (läuft) und Platte (gehalten).

import { describe, expect, it } from 'vitest';
import { doorState, type OpenerState } from '../src/core/doors';

const key = (satisfied: boolean): OpenerState => ({ kind: 'key', satisfied });
const sw = (satisfied: boolean): OpenerState => ({ kind: 'timedSwitch', satisfied });
const plate = (satisfied: boolean): OpenerState => ({ kind: 'plate', satisfied });

describe('doorState', () => {
  it('ohne Öffner bleibt die Tür zu', () => {
    expect(doorState([])).toEqual({ open: false, permanent: false });
  });

  it('any: ein Schlüssel öffnet dauerhaft, ein Schalter nur solange er läuft', () => {
    expect(doorState([key(true), key(false)])).toEqual({ open: true, permanent: true });
    expect(doorState([sw(true), key(false)])).toEqual({ open: true, permanent: false });
    expect(doorState([sw(false), key(false)])).toEqual({ open: false, permanent: false });
  });

  it('all: erst wenn ALLE erfüllt sind', () => {
    expect(doorState([key(true), key(false)], 'all')).toEqual({ open: false, permanent: false });
    expect(doorState([key(true), key(true)], 'all')).toEqual({ open: true, permanent: true });
  });

  it('all mit Schalter/Platte: offen nur im Überlapp, nie dauerhaft', () => {
    expect(doorState([key(true), sw(true)], 'all')).toEqual({ open: true, permanent: false });
    expect(doorState([key(true), sw(false)], 'all')).toEqual({ open: false, permanent: false });
    expect(doorState([plate(true), plate(true)], 'all')).toEqual({ open: true, permanent: false });
    expect(doorState([plate(true), plate(false)], 'all')).toEqual({ open: false, permanent: false });
  });

  it('any mit Platte und Schalter: irgendein erfüllter Öffner genügt', () => {
    expect(doorState([plate(false), sw(true)])).toEqual({ open: true, permanent: false });
    expect(doorState([plate(true), sw(false)])).toEqual({ open: true, permanent: false });
  });
});
