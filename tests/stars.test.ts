import { describe, expect, it } from 'vitest';
import { effectivePar, starsFor } from '../src/core/stars';

// Sterne (M45): eine Rechnung, die Sanduhr bringt ihren Bonus genau hier ein.
describe('Sterne', () => {
  const base = { seconds: 80, parS: 75, bonusS: 0, gemsTotal: 2, gemsGot: 2, falls: 0 };
  it('über Par ohne Bonus: zwei Sterne (Ziel + Gems)', () => {
    expect(starsFor(base)).toBe(2);
  });
  it('die Sanduhr verlängert die Par: mit +10 s wird es der dritte Stern', () => {
    expect(effectivePar(75, 10)).toBe(85);
    expect(starsFor({ ...base, bonusS: 10 })).toBe(3);
  });
  it('ohne Par gibt es keinen zweiten Stern – auch nicht mit Bonus', () => {
    expect(effectivePar(undefined, 10)).toBeUndefined();
    expect(starsFor({ ...base, parS: undefined, bonusS: 30 })).toBe(2);
  });
  it('ohne Gems zählt „sturzfrei" für den dritten Stern', () => {
    expect(starsFor({ ...base, seconds: 60, gemsTotal: 0, gemsGot: 0, falls: 0 })).toBe(3);
    expect(starsFor({ ...base, seconds: 60, gemsTotal: 0, gemsGot: 0, falls: 1 })).toBe(2);
  });
  it('nur geschafft: ein Stern', () => {
    expect(starsFor({ ...base, seconds: 200, gemsGot: 1, falls: 3 })).toBe(1);
  });
});
