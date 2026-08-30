// Editor-Tap-Ziele: Zelle vs. Kante (kanonisch 'e'/'s'), Außenkanten fallen
// auf die Zelle zurück, außerhalb des Felds kommt null.

import { describe, expect, it } from 'vitest';
import { pickTarget } from '../src/ui/editor';

describe('pickTarget', () => {
  it('Zellmitte trifft die Zelle', () => {
    expect(pickTarget(150, 250, 4, 4)).toEqual({ kind: 'cell', cell: [1, 2] });
  });

  it('nahe einer inneren Linie trifft die kanonische Kante', () => {
    // senkrechte Linie zwischen (0,1) und (1,1): x ≈ 100
    expect(pickTarget(104, 150, 4, 4)).toEqual({ kind: 'edge', edge: [[0, 1], 'e'] });
    expect(pickTarget(96, 150, 4, 4)).toEqual({ kind: 'edge', edge: [[0, 1], 'e'] });
    // waagerechte Linie zwischen (2,1) und (2,2): y ≈ 200
    expect(pickTarget(250, 205, 4, 4)).toEqual({ kind: 'edge', edge: [[2, 1], 's'] });
  });

  it('Außenkanten gibt es nicht: nahe am Rand kommt die Zelle', () => {
    expect(pickTarget(4, 150, 4, 4)).toEqual({ kind: 'cell', cell: [0, 1] }); // linker Rand
    expect(pickTarget(396, 150, 4, 4)).toEqual({ kind: 'cell', cell: [3, 1] }); // rechter Rand
    expect(pickTarget(150, 397, 4, 4)).toEqual({ kind: 'cell', cell: [1, 3] }); // untere Kante
  });

  it('außerhalb des Felds: null', () => {
    expect(pickTarget(-5, 50, 4, 4)).toBeNull();
    expect(pickTarget(401, 50, 4, 4)).toBeNull();
  });
});
