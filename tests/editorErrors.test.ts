import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { describeLoadError } from '../src/ui/editor';
import { parseLevel } from '../src/levels/schema';
import { setLang } from '../src/i18n';

beforeEach(() => setLang('de'));
afterEach(() => setLang('de'));

// Ladefehler im Editor (M61): lesbar statt rohes zod-JSON in der Statuszeile.
const broken = {
  id: 'x',
  name: 'x',
  players: 2,
  floors: [
    {
      size: [3, 3],
      maze: { seed: 1 },
      elements: [{ type: 'hole', cell: [1, 1] }, { type: 'plate', cell: [2, 2] }],
      start: [0, 0],
      goal: [2, 0],
    },
  ],
};

describe('describeLoadError', () => {
  it('nennt Ebene, Element und fehlendes Feld statt JSON', () => {
    let msg = '';
    try {
      parseLevel(broken);
    } catch (e) {
      msg = describeLoadError(e, broken);
    }
    expect(msg).toContain('E1 · Druckplatte 2: opens fehlt');
    expect(msg).not.toContain('"path"');
  });
  it('reicht gewöhnliche Fehler unverändert durch', () => {
    expect(describeLoadError(new Error('Level x: kein Ziel definiert'), null)).toBe('Level x: kein Ziel definiert');
  });
});
