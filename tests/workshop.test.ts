// Werkstatt-Store (M40: Level-Bundles) über einen localStorage-Stub. Der
// Store ist ein Modul-Singleton – der Stub muss VOR dem Import stehen.

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const backing = new Map<string, string>();
type WS = typeof import('../src/workshop');
let ws: WS;

// v1-Bestand: zwei flache Level, Beta älter als Alpha → im Bundle kommt Beta zuerst.
const V1 = {
  levels: [
    { id: 'custom-a', def: { id: 'custom-a', name: 'Alpha', pingBudget: 3, floors: [{ size: [4, 4], maze: { seed: 1 }, elements: [], start: [0, 0], goal: [3, 3] }] }, createdAt: '2026-01-02T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z' },
    { id: 'custom-b', def: { id: 'custom-b', name: 'Beta', pingBudget: 3, floors: [{ size: [4, 4], maze: { seed: 2 }, elements: [], start: [0, 0], goal: [3, 3] }] }, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  ],
};

beforeAll(async () => {
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => backing.get(k) ?? null,
    setItem: (k: string, v: string) => void backing.set(k, v),
    removeItem: (k: string) => void backing.delete(k),
  };
  backing.set('tiltr.workshop.v1', JSON.stringify(V1));
  ws = await import('../src/workshop');
});

describe('Migration v1 → v2', () => {
  it('flache Level werden EIN Bundle, älteste zuerst; v1 bleibt liegen', () => {
    const all = ws.bundles.list();
    expect(all).toHaveLength(1);
    expect(all[0]!.title).toBe('Meine Level');
    expect(all[0]!.levels.map((l) => l.def.name)).toEqual(['Beta', 'Alpha']);
    expect(backing.has('tiltr.workshop.v2')).toBe(true);
    expect(backing.has('tiltr.workshop.v1')).toBe(true);
    expect(ws.bundles.current()?.id).toBe(all[0]!.id);
  });

  it('migrateV1 ist rein: leer, Müll und fehlender Schlüssel ergeben kein Bundle', () => {
    expect(ws.migrateV1(null, 'X').bundles).toEqual([]);
    expect(ws.migrateV1('kein json', 'X').bundles).toEqual([]);
    expect(ws.migrateV1('{"levels":[]}', 'X').bundles).toEqual([]);
    expect(ws.migrateV1(JSON.stringify(V1), 'Titel').bundles[0]!.title).toBe('Titel');
  });
});

describe('IDs in derselben Millisekunde (CI-Flake v2.8.0)', () => {
  afterEach(() => vi.restoreAllMocks());
  it('newCustomId/newBundleId bleiben eindeutig bei eingefrorener Uhr', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    const ids = new Set(Array.from({ length: 500 }, () => ws.newCustomId()));
    expect(ids.size).toBe(500);
    expect(ws.newBundleId().startsWith('bundle-')).toBe(true);
  });
});

describe('Bundles: CRUD, Reihenfolge, aktuelles Bundle', () => {
  it('create wird aktuell; update ändert Titel/Beschreibung; list zuletzt geändert zuerst', () => {
    const b = ws.bundles.create('Zweites', 'Beschreibung');
    expect(ws.bundles.currentId()).toBe(b.id);
    expect(ws.bundles.update(b.id, { title: 'Zweites!' })).toBe(true);
    expect(ws.bundles.get(b.id)?.title).toBe('Zweites!');
    expect(ws.bundles.get(b.id)?.description).toBe('Beschreibung');
    expect(ws.bundles.list()[0]!.id).toBe(b.id);
  });

  it('save legt neue Level ans Ende des AKTUELLEN Bundles, bestehende bleiben, wo sie sind', () => {
    const cur = ws.bundles.current()!;
    const def = ws.blankLevel('Neu im Zweiten');
    expect(ws.workshop.save(def)).toBe(true);
    expect(cur.levels.at(-1)?.def.name).toBe('Neu im Zweiten');
    // Alpha liegt im ersten Bundle – ein Save verschiebt es nicht
    const alpha = ws.workshop.get('custom-a')!;
    ws.workshop.save({ ...alpha.def, name: 'Alpha 2' });
    expect(ws.workshop.bundleOf('custom-a')?.title).toBe('Meine Level');
    expect(ws.workshop.get('custom-a')?.def.name).toBe('Alpha 2');
    expect(ws.workshop.list().map((l) => l.def.name)).toContain('Neu im Zweiten');
  });

  it('move sortiert innerhalb des Bundles; ungültige Indizes tun nichts', () => {
    const first = ws.bundles.list().find((b) => b.title === 'Meine Level')!;
    expect(ws.bundles.move(first.id, 1, 0)).toBe(true);
    expect(first.levels.map((l) => l.def.name)).toEqual(['Alpha 2', 'Beta']);
    expect(ws.bundles.move(first.id, 5, 0)).toBe(false);
    expect(ws.bundles.move(first.id, 0, 0)).toBe(false);
  });

  it('duplicate legt die Kopie direkt hinter das Original', () => {
    const first = ws.bundles.list().find((b) => b.title === 'Meine Level')!;
    const copy = ws.workshop.duplicate('custom-a', '(Kopie)')!;
    expect(first.levels.map((l) => l.id)[1]).toBe(copy.id);
    expect(String(copy.def.name)).toContain('(Kopie)');
    ws.workshop.remove(copy.id);
    expect(first.levels).toHaveLength(2);
  });

  it('remove eines Bundles wählt ein anderes als aktuelles', () => {
    const b = ws.bundles.create('Kurz');
    expect(ws.bundles.currentId()).toBe(b.id);
    ws.bundles.remove(b.id);
    expect(ws.bundles.get(b.id)).toBeNull();
    expect(ws.bundles.currentId()).not.toBe(b.id);
    expect(ws.bundles.current()).not.toBeNull();
  });
});

describe('bundleProgress', () => {
  const b = { levels: [{ id: 'l1' }, { id: 'l2' }, { id: 'l3' }] };
  it('weiter beim ersten Level ohne Bestzeit; Freischaltung folgt dem Vorgänger', () => {
    const best = (id: string) => (id === 'l1' ? 12 : null);
    const p = ws.bundleProgress(b, best);
    expect(p.resume).toBe(1);
    expect(p.done).toBe(1);
    expect([0, 1, 2].map(p.unlocked)).toEqual([true, true, false]);
  });
  it('alles geschafft → von vorn', () => {
    expect(ws.bundleProgress(b, () => 1).resume).toBe(0);
  });
});

describe('Export/Import als Bundle-Datei', () => {
  it('Export zählt die Version hoch; parseFile erkennt neuer/gleich; applyFile ersetzt', () => {
    const src = ws.bundles.list().find((b) => b.title === 'Meine Level')!;
    const v0 = src.version;
    const text = ws.bundles.exportFile(src.id)!;
    expect(ws.bundles.get(src.id)!.version).toBe(v0 + 1);
    const parsed = JSON.parse(text);
    expect(parsed.format).toBe('tiltr-bundle');
    expect(parsed.bundle.levels).toHaveLength(2);
    // dieselbe Datei erneut: gleiche Version → nicht „neuer"
    const same = ws.bundles.parseFile(text)!;
    expect(same.existing?.id).toBe(src.id);
    expect(same.newer).toBe(false);
    // Datei mit höherer Version und geändertem Titel ersetzt ungefragt
    parsed.bundle.version = v0 + 5;
    parsed.bundle.title = 'Meine Level (neu)';
    parsed.bundle.levels[0].name = 'Beta umbenannt';
    const newer = ws.bundles.parseFile(JSON.stringify(parsed))!;
    expect(newer.newer).toBe(true);
    const saved = ws.bundles.applyFile(newer.incoming);
    expect(saved.title).toBe('Meine Level (neu)');
    expect(saved.version).toBe(v0 + 5);
    expect(ws.bundles.list().filter((b) => b.id === src.id)).toHaveLength(1);
    expect(ws.workshop.get('custom-a')).not.toBeNull(); // Level-IDs bleiben → Fortschritt bleibt
  });

  it('Level-ID, die in einem ANDEREN Bundle liegt, bekommt eine frische', () => {
    const other = ws.bundles.create('Fremd');
    const raw = { ...ws.blankLevel('Doppelgänger'), id: 'custom-a' };
    const saved = ws.bundles.applyFile({ id: other.id, version: 1, title: 'Fremd', description: '', levels: [raw] });
    expect(saved.levels[0]!.id).not.toBe('custom-a');
    expect(ws.workshop.bundleOf('custom-a')?.title).toBe('Meine Level (neu)');
    ws.bundles.remove(other.id);
  });

  it('parseFile weist Müll, fremdes Format und kaputte Level ab', () => {
    expect(ws.bundles.parseFile('kein json')).toBeNull();
    expect(ws.bundles.parseFile('{"format":"tiltr-level","def":{}}')).toBeNull();
    expect(ws.bundles.parseFile('{"format":"tiltr-bundle","bundle":{"id":"x","levels":[{"kaputt":true}]}}')).toBeNull();
    // eine Bundle-Datei ist KEIN Einzel-Level
    expect(ws.parseLevelText(ws.bundles.exportFile(ws.bundles.list()[0]!.id)!)).toBeNull();
  });

  it('importBuiltin: feste ID, App-Version als Version, erneuter Import ersetzt', () => {
    const lv = ws.blankLevel('W1-Level') as Record<string, unknown>;
    lv.id = 'w1-01';
    const b1 = ws.bundles.importBuiltin(1, 'Welt 1', 'Stand 2.10.0', [lv as never], '2.10.0');
    expect(b1.id).toBe('builtin-w1');
    expect(b1.version).toBe(21000);
    expect(b1.levels[0]!.id).toBe('w1-01');
    const b2 = ws.bundles.importBuiltin(1, 'Welt 1', 'Stand 2.10.1', [lv as never], '2.10.1');
    expect(b2.version).toBe(21001);
    expect(ws.bundles.list().filter((b) => b.id === 'builtin-w1')).toHaveLength(1);
    expect(ws.versionNumber('3.0.0')).toBeGreaterThan(ws.versionNumber('2.99.99'));
    ws.bundles.remove('builtin-w1');
  });
});

describe('Einzel-Level: Export-Hülle, Import, IDs', () => {
  it('Export-Hülle -> Import: Roundtrip; nackte Def mit fremder ID bekommt eine frische', () => {
    const def = ws.blankLevel('Roundtrip');
    const via = ws.importLevel(ws.exportPayload(def));
    expect(via?.def.name).toBe('Roundtrip');
    const bare = { ...ws.blankLevel('Nackt'), id: 'w1-01' };
    const imported = ws.importLevel(JSON.stringify(bare));
    expect(imported!.id.startsWith('custom-')).toBe(true);
  });

  it('Import ins gewünschte Bundle; Kollision → neue ID; Müll → null', () => {
    const target = ws.bundles.create('Ziel');
    const def = ws.blankLevel('Original');
    ws.workshop.save(def, target.id);
    const again = ws.importLevel(JSON.stringify(def), target.id)!;
    expect(again.id).not.toBe(def.id);
    expect(ws.workshop.bundleOf(again.id)?.id).toBe(target.id);
    expect(ws.importLevel('kein json')).toBeNull();
    expect(ws.importLevel('{"format":"tiltr-level","def":{"kaputt":true}}')).toBeNull();
    ws.bundles.remove(target.id);
  });

  it('save ohne Bundle legt „Meine Level" an, wenn es gar keins gibt', () => {
    for (const b of ws.bundles.list()) ws.bundles.remove(b.id);
    expect(ws.bundles.current()).toBeNull();
    expect(ws.workshop.save(ws.blankLevel('Erstes'), undefined, 'Frisch')).toBe(true);
    expect(ws.bundles.list()[0]!.title).toBe('Frisch');
    expect(ws.bundles.list()[0]!.levels).toHaveLength(1);
  });
});

describe('Bearbeitungs-Draft (reload-fest)', () => {
  it('Roundtrip: saveDraft -> loadDraft -> clearDraft', () => {
    expect(ws.loadDraft()).toBeNull();
    const def = ws.blankLevel('Entwurf');
    ws.saveDraft(def);
    expect(ws.loadDraft()).toEqual(def);
    expect(backing.has('tiltr.workshop.draft.v1')).toBe(true);
    ws.clearDraft();
    expect(ws.loadDraft()).toBeNull();
  });

  it('kaputter Storage-Inhalt liest sich als "kein Draft"', () => {
    backing.set('tiltr.workshop.draft.v1', 'kein json');
    expect(ws.loadDraft()).toBeNull();
    backing.set('tiltr.workshop.draft.v1', '{"ohneDef":1}');
    expect(ws.loadDraft()).toBeNull();
    backing.delete('tiltr.workshop.draft.v1');
  });
});
