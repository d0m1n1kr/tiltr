// Backup & Restore: einsammeln (nur tiltr.*), Codec-Roundtrip, ERSETZEN
// (Altlasten weg), fremde/kaputte Dateien abweisen, Zusammenfassung.

import { describe, expect, it } from "vitest";
import {
  applyBackup,
  collectBackup,
  decodeBackup,
  encodeBackup,
  summarizeBackup,
  type StorageLike,
} from "../src/backup";
import { encodePayload } from "../src/levels/shareCodec";

function mem(
  init: Record<string, string> = {},
): StorageLike & { dump(): Record<string, string> } {
  const m = new Map(Object.entries(init));
  return {
    get length() {
      return m.size;
    },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    dump: () => Object.fromEntries(m),
  };
}

const state = {
  "tiltr.profile": JSON.stringify({
    name: "Dom",
    best: { "w1-01": 12.5, "w1-02": 9.1 },
    stars: {},
  }),
  "tiltr.workshop.v1": JSON.stringify({
    levels: [
      { id: "custom-a", def: {} },
      { id: "custom-b", def: {} },
    ],
  }),
  "tiltr.ghost.w1-01": JSON.stringify({ time: 12.5, frames: [0, 0, 1, 1] }),
  "tiltr.ghost.w1-02": JSON.stringify({ time: 9.1, frames: [] }),
  "tiltr.lang": "de",
};

describe("collectBackup", () => {
  it("nimmt alle tiltr.*-Schlüssel und lässt fremde liegen", () => {
    const s = mem({ ...state, "other.app": "x", debug: "1" });
    const p = collectBackup(s, "2.7.0", "2026-09-02T10:00:00.000Z");
    expect(Object.keys(p.data).sort()).toEqual(Object.keys(state).sort());
    expect(p.app).toBe("2.7.0");
    expect(p.format).toBe("tiltr-backup");
  });
});

describe("Roundtrip", () => {
  it("encode → decode liefert dieselben Daten, komprimiert", async () => {
    const p = collectBackup(mem(state), "2.7.0", "2026-09-02T10:00:00.000Z");
    const text = await encodeBackup(p);
    expect(text[0]).toBe("1"); // deflate-Codec
    expect(text.length).toBeLessThan(JSON.stringify(p).length);
    const back = await decodeBackup(text + "\n");
    expect(back.data).toEqual(state);
    expect(back.at).toBe("2026-09-02T10:00:00.000Z");
  });
});

describe("applyBackup", () => {
  it("ERSETZT: Altlasten unter tiltr.* verschwinden, Fremdes bleibt", () => {
    const s = mem({
      "tiltr.ghost.alt": "{}",
      "tiltr.profile": '{"name":"Alt"}',
      "other.app": "x",
    });
    const p = collectBackup(mem(state), "2.7.0", "");
    const r = applyBackup(s, p);
    expect(r).toEqual({ removed: 2, restored: 5 });
    expect(s.dump()).toEqual({ ...state, "other.app": "x" });
  });
});

describe("decodeBackup weist ab", () => {
  it("fremdes Format (ein Level-Token ist kein Backup)", async () => {
    const tok = await encodePayload({
      id: "custom-x",
      name: "Level",
      floors: [],
    });
    await expect(decodeBackup(tok)).rejects.toThrow(/kein tiltr-Backup/);
  });
  it("fremde Schlüssel und Nicht-Text-Werte", async () => {
    const bad1 = await encodePayload({
      format: "tiltr-backup",
      v: 1,
      at: "",
      app: "",
      data: { "evil.key": "x" },
    });
    await expect(decodeBackup(bad1)).rejects.toThrow(/fremder Schlüssel/);
    const bad2 = await encodePayload({
      format: "tiltr-backup",
      v: 1,
      at: "",
      app: "",
      data: { "tiltr.profile": { a: 1 } },
    });
    await expect(decodeBackup(bad2)).rejects.toThrow(/kein Text/);
  });
  it("unbekannte Version und Müll", async () => {
    const v9 = await encodePayload({ format: "tiltr-backup", v: 9, data: {} });
    await expect(decodeBackup(v9)).rejects.toThrow(/Version 9/);
    await expect(decodeBackup("hallo welt")).rejects.toThrow(/nicht lesbar/);
    // Codec-Innereien („Failed to fetch") dürfen nicht bis zum Nutzer durchsickern.
    await expect(decodeBackup("1" + "Q".repeat(40))).rejects.toThrow(
      /^Datei nicht lesbar$/,
    );
  });
});

describe("summarizeBackup", () => {
  it("zählt Level, Bestzeiten, Geister, Einträge", () => {
    const p = collectBackup(mem(state), "2.7.0", "");
    expect(summarizeBackup(p)).toEqual({
      levels: 2,
      best: 2,
      ghosts: 2,
      entries: 5,
    });
  });
  it("ein kaputter Eintrag macht nur seine Zahl 0", () => {
    const p = collectBackup(
      mem({ ...state, "tiltr.workshop.v1": "{not json" }),
      "2.7.0",
      "",
    );
    expect(summarizeBackup(p).levels).toBe(0);
    expect(summarizeBackup(p).best).toBe(2);
  });
});
