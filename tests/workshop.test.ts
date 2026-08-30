// Werkstatt-Store: CRUD-Roundtrip über einen localStorage-Stub. Der Store
// ist ein Modul-Singleton – der Stub muss VOR dem Import stehen.

import { beforeAll, describe, expect, it } from 'vitest';

const backing = new Map<string, string>();
let workshop: typeof import('../src/workshop').workshop;
let blankLevel: typeof import('../src/workshop').blankLevel;
let newCustomId: typeof import('../src/workshop').newCustomId;

beforeAll(async () => {
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => backing.get(k) ?? null,
    setItem: (k: string, v: string) => void backing.set(k, v),
    removeItem: (k: string) => void backing.delete(k),
  };
  ({ workshop, blankLevel, newCustomId } = await import('../src/workshop'));
});

describe('Werkstatt-Store', () => {
  it('speichert, listet (neueste zuerst) und liest zurück', () => {
    const a = blankLevel('Alpha');
    const b = blankLevel('Beta');
    expect(workshop.save(a)).toBe(true);
    expect(workshop.save(b)).toBe(true);
    expect(workshop.list().map((l) => l.def.name)).toEqual(['Beta', 'Alpha']);
    expect(workshop.get(String(a.id))!.def).toEqual(a);
    // persistiert als parsebares JSON unter dem v1-Schlüssel
    const raw = backing.get('tiltr.workshop.v1')!;
    expect(JSON.parse(raw).levels).toHaveLength(2);
  });

  it('upsert per ID: erneutes Speichern legt kein Duplikat an', () => {
    const a = workshop.list().at(-1)!;
    const before = workshop.list().length;
    workshop.save({ ...a.def, name: 'Alpha 2' });
    expect(workshop.list().length).toBe(before);
    expect(workshop.get(a.id)!.def.name).toBe('Alpha 2');
  });

  it('dupliziert unter neuer ID mit Namenszusatz', () => {
    const src = workshop.list()[0]!;
    const copy = workshop.duplicate(src.id, '(Kopie)')!;
    expect(copy.id).not.toBe(src.id);
    expect(copy.def.id).toBe(copy.id);
    expect(String(copy.def.name)).toContain('(Kopie)');
  });

  it('löscht; fremde IDs werden nicht gespeichert', () => {
    const before = workshop.list().length;
    workshop.remove(workshop.list()[0]!.id);
    expect(workshop.list().length).toBe(before - 1);
    expect(workshop.save({ id: 'w1-01', name: 'Hack' })).toBe(false);
  });

  it('blankLevel ist parsebar und lösbar-strukturiert; IDs eindeutig', () => {
    expect(blankLevel('X').id).not.toBe(blankLevel('X').id);
    expect(newCustomId().startsWith('custom-')).toBe(true);
  });
});
