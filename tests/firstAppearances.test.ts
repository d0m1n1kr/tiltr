import { describe, expect, it } from 'vitest';
import { TUTORIAL_LEVELS } from '../src/levels/tutorial';
import { CAMPAIGN_LEVELS } from '../src/levels/campaign';
import { firstAppearances, levelFeatures, newFeaturesIn } from '../src/levels/firstAppearances';

// Lehr-Reihenfolge wie in app.ts: Tutorial, dann Kampagne.
const TEACH = [...TUTORIAL_LEVELS, ...CAMPAIGN_LEVELS];

describe('Erst-Vorkommen (M43)', () => {
  it('kennt Element-Typen und Wand-Varianten eines Levels', () => {
    const f = levelFeatures(TUTORIAL_LEVELS.find((l) => l.id === 'tut-7')!);
    expect(f.has('wallBrittle')).toBe(true);
    expect(f.has('hole')).toBe(false);
    // Helle Ebenen sind kein Merkmal – da leuchtet nichts auf.
    expect(levelFeatures(TUTORIAL_LEVELS[0]!).has('bright')).toBe(false);
  });

  it('das Tutorial lehrt Loch, Atmen, Wind, Brüchig, Checkpoint – die Kampagne den Rest', () => {
    const first = firstAppearances(TEACH);
    expect(first.get('hole')).toBe('tut-4');
    expect(first.get('windZone')).toBe('tut-6');
    expect(first.get('wallBrittle')).toBe('tut-7');
    expect(first.get('checkpoint')).toBe('tut-8');
    expect(first.get('guard')).toBe('w1-03');
    expect(first.get('door')).toBe('w1-04');
    expect(first.get('key')).toBe('w1-04');
    expect(first.get('gem')).toBe('w1-01'); // M44: das Gem im Umweg von „Aufbruch"
    expect(first.get('glass')).toBe('w1-09');
    expect(first.get('anchor')).toBe('w3-06');
    expect(first.get('echoCrystal')).toBe('w4-03k');
    expect(first.get('wallAbsorb')).toBe('w4-02');
    expect(first.get('transporter')).toBe('w2-01');
    expect(first.get('jukebox')).toBe('w2-06'); // M44: Die Weite steht vor der Kathedrale
    expect(first.get('slidingWall')).toBe('w3-01');
    expect(first.get('timedSwitch')).toBe('w3-02');
    expect(first.get('current')).toBe('w3-03');
    expect(first.get('listener')).toBe('w4-01');
    expect(first.get('fogZone')).toBe('w4-02');
    expect(first.get('ice')).toBe('w4-03');
  });

  it('newFeaturesIn nennt nur, was GENAU dieses Level neu bringt', () => {
    expect(newFeaturesIn(TEACH, 'w1-03')).toEqual(['guard']);
    expect(newFeaturesIn(TEACH, 'w1-04').sort()).toEqual(['door', 'key']);
    expect(newFeaturesIn(TEACH, 'w1-01')).toEqual(['gem']);
    // w1-05 hat Löcher, Checkpoint und Gems – alles schon gelehrt.
    expect(newFeaturesIn(TEACH, 'w1-05')).toEqual([]);
    expect(newFeaturesIn(TEACH, 'w1-10')).toEqual([]);
    expect(newFeaturesIn(TEACH, 'gibt-es-nicht')).toEqual([]);
  });
});
