// Merkmals-Gate (M89): Ein Level mit Wegmarken darf nicht mit einer Seite
// gespielt werden, die keine legen kann – ein Sieg nach halben Regeln ist
// keiner. Das Gate hängt am LEVEL, nicht an der Versionsnummer.

import { describe, expect, it } from 'vitest';
import { FEATURES, canDo, needsFor } from '../src/core/features';

describe('needsFor', () => {
  it('Bojen im Level ⇒ das Merkmal wird verlangt', () => {
    expect(needsFor(3)).toEqual(['marks']);
    expect(needsFor(1)).toEqual(['marks']);
  });

  it('Level ohne Bojen verlangt nichts – es spielt mit jeder Fassung', () => {
    expect(needsFor(0)).toEqual([]);
  });
});

describe('needsFor: together (M90)', () => {
  it('meldet die Rendezvous-Regel als Merkmal – sonst gewinnt eine alte Seite nach der alten Regel', () => {
    expect(needsFor(0, true)).toEqual(['together']);
    expect(needsFor(3, true)).toEqual(['marks', 'together']);
    expect(needsFor(3, false)).toEqual(['marks']);
    expect(needsFor(0, false)).toEqual([]);
  });

  it('diese Fassung kann beides', () => {
    expect(canDo(needsFor(3, true), FEATURES)).toBe(true);
    // Eine Gegenstelle von vor M90 kennt „together" nicht.
    expect(canDo(needsFor(0, true), ['marks'])).toBe(false);
  });
});

describe('canDo', () => {
  it('diese Fassung kann, was sie selbst verlangt', () => {
    expect(canDo(needsFor(3), FEATURES)).toBe(true);
    expect(canDo(needsFor(0), FEATURES)).toBe(true);
  });

  it('eine ALTE Gegenstelle schickt das Feld nicht – das gilt als „kann nichts"', () => {
    expect(canDo(['marks'], undefined)).toBe(false);
    expect(canDo(['marks'], [])).toBe(false);
    // Aber ein Level ohne Bojen darf auch sie spielen.
    expect(canDo([], undefined)).toBe(true);
  });

  it('unbekanntes Merkmal der ANDEREN Seite (neuer Host, alter Gast) fällt auf', () => {
    expect(canDo(['duett'], FEATURES)).toBe(false);
    expect(canDo(['marks', 'duett'], FEATURES)).toBe(false);
  });
});
