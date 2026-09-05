import { describe, expect, it } from 'vitest';
import { CAMPAIGN_LEVELS, WORLDS } from '../src/levels/campaign';
import { loadLevel } from '../src/levels/loader';
import { setWall } from '../src/core/maze';
import { parseLevel, type DoorDef } from '../src/levels/schema';
import { buildFloorCells, cellKey, coopReachable, reachable, validateLevel } from './helpers';
import { switchDoorSteps, timerSeconds } from '../src/levels/validate';

describe('Kampagne', () => {
  it('Welt 1 hat 10, Welt 2–3 je 6, Welt 4 sieben (Kristallgang, M44), Welt 5 acht (Trugbild M48 + Stimmton M97); IDs eindeutig, Intro + Par überall', () => {
    expect(WORLDS[0]!.levels).toHaveLength(10);
    expect(WORLDS[1]!.levels).toHaveLength(6);
    expect(WORLDS[2]!.levels).toHaveLength(6);
    expect(WORLDS[3]!.levels).toHaveLength(7);
    expect(WORLDS[4]!.levels).toHaveLength(8);
    expect(new Set(CAMPAIGN_LEVELS.map((l) => l.id)).size).toBe(37);
    // DIE ARRAY-ORDNUNG IST DIE SPIELREIHENFOLGE, die ID ist ein Schlüssel
    // (wie im Coop-Kapitel, M93): „Der Stimmton" (w5-08) steht VOR dem Finale
    // „Dämmerung" (w5-07), denn nach dem Finale zu lehren wäre sinnlos – und
    // umnummeriert wird eine ID nie, sonst verliert jemand seinen Fortschritt.
    expect(WORLDS[4]!.levels.map((l) => l.id).slice(-2)).toEqual(['w5-08', 'w5-07']);
    for (const l of CAMPAIGN_LEVELS) {
      expect(l.intro?.length ?? 0, l.id).toBeGreaterThan(20);
      expect(l.parTimeS, l.id).toBeGreaterThan(0);
    }
  });

  it('Par-Band (M43): 1,2 bis 2,6 s je Zelle – große Felder nicht nach dem Rückgrat schätzen', () => {
    // „Die Weite" hatte 0,77 s/Zelle, „Taktstraße" 1,13: Par aus der Länge des
    // Rückgrats, obwohl man sich auf großen Feldern proportional zur FLÄCHE
    // verirrt. Das Band ist der Prüfstein für jedes neue Level.
    for (const l of CAMPAIGN_LEVELS) {
      const cells = l.floors.reduce((n, f) => n + f.size[0] * f.size[1], 0);
      const perCell = l.parTimeS! / cells;
      expect(perCell, `${l.id}: ${perCell.toFixed(2)} s/Zelle`).toBeGreaterThanOrEqual(1.2);
      expect(perCell, `${l.id}: ${perCell.toFixed(2)} s/Zelle`).toBeLessThanOrEqual(2.6);
    }
  });

  it('Ping-Budget ist je Welt konstant (M43): 3 / 4 / 4 / 3 / 4 – Knappheit ist der Schwierigkeits-Dial, nicht die Levelgröße', () => {
    const want = [3, 4, 4, 3, 4];
    WORLDS.forEach((w, i) => {
      for (const l of w.levels) expect(l.pingBudget, l.id).toBe(want[i]);
    });
  });

  it('alle Level laden ohne Fehler (Türen offen, Schlüssel passend, Transporter-Ziele gültig)', () => {
    for (const def of CAMPAIGN_LEVELS) {
      expect(() => loadLevel(def), def.id).not.toThrow();
    }
  });

  it('jeder Schlüssel und jeder Zeitschloss-Schalter ist VOR seiner Tür erreichbar', () => {
    for (const def of CAMPAIGN_LEVELS) {
      const preDoor = reachable(def, { brittleOpen: true, doorsOpen: false });
      def.floors.forEach((floor, fl) => {
        for (const el of floor.elements) {
          if (el.type === 'key' || el.type === 'timedSwitch') {
            expect(preDoor.has(cellKey(fl, el.cell)), `${def.id}: ${el.type} E${fl} ${el.cell}`).toBe(true);
          }
        }
      });
    }
  });

  it('Zeitschloss-Beweis: Strecke Schalter→Tür ist im Timer machbar (2,5× Sicherheitsfaktor, ein Transporter-Sprung erlaubt)', () => {
    let crossFloor = 0;
    for (const def of CAMPAIGN_LEVELS) {
      def.floors.forEach((floor, swFl) => {
        for (const el of floor.elements) {
          if (el.type !== 'timedSwitch') continue;
          const doors = def.floors.flatMap((f, fl) =>
            f.elements.filter((d): d is DoorDef => d.type === 'door' && d.id === el.opens).map((door) => ({ door, fl })),
          );
          expect(doors.length, `${def.id}: Zeitschloss ohne Tür`).toBeGreaterThan(0);
          for (const { door, fl } of doors) {
            const { steps, hops } = switchDoorSteps(def, swFl, el.cell, door, fl);
            if (hops > 0) crossFloor++;
            expect(steps, `${def.id}: Tür ${door.id} vom Schalter unerreichbar`).toBeLessThan(Infinity);
            expect(timerSeconds(steps, hops), `${def.id}: Timer ${el.durationS}s zu knapp für ${steps + 1} Zellen + ${hops} Sprung`).toBeLessThanOrEqual(
              el.durationS,
            );
          }
        }
      });
    }
    // Maschinenraum (w3-05) und Zwei Uhren (w5-05): Schalter unten, Tür oben – je EIN Sprung.
    expect(crossFloor).toBe(2);
  });

  it('Welt 2 steigt monoton in der Par (M44: Zwillingstore auf Platz 2, Kathedrale als Finale)', () => {
    const pars = WORLDS[1]!.levels.map((l) => l.parTimeS!);
    for (let i = 1; i < pars.length; i++) expect(pars[i]!, WORLDS[1]!.levels[i]!.id).toBeGreaterThan(pars[i - 1]!);
    expect(WORLDS[1]!.levels.map((l) => l.id)).toEqual(['w2-01', 'w2-04', 'w2-02', 'w2-03', 'w2-06', 'w2-05']);
  });

  it('Sterne ehrlich (M44): jedes Level hat Gems oder eine Sturzgefahr – „sturzfrei" ist nie geschenkt', () => {
    for (const def of CAMPAIGN_LEVELS) {
      const els = def.floors.flatMap((f) => f.elements);
      const gems = els.some((e) => e.type === 'gem');
      const hazard = els.some((e) => e.type === 'hole' || e.type === 'guard' || e.type === 'listener' || e.type === 'glass');
      expect(gems || hazard, `${def.id}: weder Gems noch Sturzgefahr`).toBe(true);
    }
  });

  it('Schlüssel-Türen sind PFLICHT: ohne Öffner bleibt das Ziel unerreichbar (w1-04, w1-08, w2-02, w2-05, w3-04)', () => {
    // w1-04 hatte einen Umweg um die Tür: (2,0)→(2,1)→(1,1)→(0,1)→(0,0) im
    // gespiegelten Feld – „Schlüsseldienst" ging ohne Schlüssel. M44 mauert ihn zu.
    // w1-10 „Schlussstein" fehlt ABSICHTLICH: Dort führen zwei Wege ans Ziel
    // („wähle weise") – die Tür ist die Abkürzung, der Ring der lange Weg.
    for (const id of ['w1-04', 'w1-08', 'w2-02', 'w2-05', 'w3-04']) {
      const def = CAMPAIGN_LEVELS.find((l) => l.id === id)!;
      const goalFl = def.floors.findIndex((f) => f.goal);
      const closed = reachable(def, { brittleOpen: true, doorsOpen: false });
      expect(closed.has(cellKey(goalFl, def.floors[goalFl]!.goal!)), `${id}: Ziel ohne Tür erreichbar`).toBe(false);
    }
  });

  it('kein Softlock: von JEDER erreichbaren Zelle bleibt das Ziel erreichbar (Öffner-Fixpunkt, gerichtete Strömungen)', () => {
    // Strömungen sind Einbahnstraßen und Zeitschloss-Türen fallen wieder zu –
    // dieser Beweis läuft den Öffner-Fixpunkt von jeder erreichbaren Zelle:
    // Wo immer der Ball strandet, lässt sich jede nötige Tür wieder öffnen
    // und das Ziel erreichen.
    for (const def of CAMPAIGN_LEVELS) {
      const goalFl = def.floors.findIndex((f) => f.goal);
      const goalKey = cellKey(goalFl, def.floors[goalFl]!.goal!);
      const states = coopReachable(def);
      expect(states.has(goalKey), `${def.id}: Ziel vom Start unerreichbar`).toBe(true);
      for (const k of states) {
        const [fl, xy] = k.split(':');
        const [x, y] = xy!.split(',').map(Number);
        const seen = coopReachable(def, new Set(), { floor: Number(fl), cell: [x!, y!] });
        expect(seen.has(goalKey), `${def.id}: Softlock bei ${k}`).toBe(true);
      }
    }
  });

  it('mit Schlüsseln sind Ziel, Gems, Checkpoints, Patrouillen und Transporter-Ziele erreichbar', () => {
    for (const def of CAMPAIGN_LEVELS) {
      const open = reachable(def, { brittleOpen: true, doorsOpen: true });
      def.floors.forEach((floor, fl) => {
        if (floor.goal) expect(open.has(cellKey(fl, floor.goal)), `${def.id}: Ziel E${fl}`).toBe(true);
        for (const el of floor.elements) {
          if (el.type === 'gem' || el.type === 'checkpoint' || el.type === 'key' || el.type === 'listener') {
            // Horcher: sein Heimatpunkt muss erreichbar sein (er ist
            // patrouillenfrei – mehr Weg-Beweis braucht er nicht).
            expect(open.has(cellKey(fl, el.cell)), `${def.id}: ${el.type} E${fl} ${el.cell}`).toBe(true);
          }
          if (el.type === 'guard') {
            for (const wp of el.patrol) expect(open.has(cellKey(fl, wp)), `${def.id}: guard E${fl} ${wp}`).toBe(true);
          }
          if (el.type === 'transporter') {
            expect(open.has(cellKey(fl, el.cell)), `${def.id}: transporter E${fl} ${el.cell}`).toBe(true);
            expect(
              open.has(cellKey(el.target.floor, el.target.cell)),
              `${def.id}: transporter-Ziel E${el.target.floor} ${el.target.cell}`,
            ).toBe(true);
          }
        }
      });
    }
  });

  it('Multi-Ebenen-Level sind OHNE Transporter unlösbar (Ebenenwechsel ist Pflicht)', () => {
    // Ohne Sprünge bleibt man auf Ebene 0; Türen öffnen sich nur, wenn ihr
    // Schlüssel dort erreichbar ist (Fixpunkt).
    for (const def of CAMPAIGN_LEVELS) {
      if (def.floors.length === 1) continue; // einstöckige Level (auch Multi-Screen) sind hier nicht gemeint
      // Ziel auf Ebene 1 (Die Weite mit Unterwelt, Uhrwerk mit Maschinenraum):
      // die tiefe Ebene ist Abkürzung bzw. Schalterraum, kein Pflichtweg zum Ziel.
      if (def.floors[0]!.goal) continue;
      const floor0 = def.floors[0]!;
      const [cols, rows] = floor0.size;
      const openDoors = new Set<string>();

      const reachFloor0 = (): Set<string> => {
        const cells = buildFloorCells(floor0, { brittleOpen: true, doorsOpen: false }, def.mirror);
        for (const el of floor0.elements) {
          if (el.type === 'door' && openDoors.has(el.id)) {
            setWall(cells, cols, rows, el.edge[0][0], el.edge[0][1], el.edge[1], false);
          }
        }
        const seen = new Set<string>([floor0.start.join(',')]);
        const stack: Array<[number, number]> = [[floor0.start[0], floor0.start[1]]];
        while (stack.length) {
          const [x, y] = stack.pop()!;
          const c = cells[y * cols + x]!;
          const push = (nx: number, ny: number) => {
            const k = `${nx},${ny}`;
            if (!seen.has(k)) {
              seen.add(k);
              stack.push([nx, ny]);
            }
          };
          if (!c.n && y > 0) push(x, y - 1);
          if (!c.e && x < cols - 1) push(x + 1, y);
          if (!c.s && y < rows - 1) push(x, y + 1);
          if (!c.w && x > 0) push(x - 1, y);
        }
        return seen;
      };

      let seen = reachFloor0();
      let changed = true;
      while (changed) {
        changed = false;
        for (const el of floor0.elements) {
          if (el.type === 'key' && !openDoors.has(el.opens) && seen.has(el.cell.join(','))) {
            openDoors.add(el.opens);
            changed = true;
          }
        }
        if (changed) seen = reachFloor0();
      }

      const goalFloorIndex = def.floors.findIndex((f) => f.goal);
      const goal = def.floors[goalFloorIndex]!.goal!;
      const reachableWithoutJumps = goalFloorIndex === 0 && seen.has(goal.join(','));
      expect(reachableWithoutJumps, `${def.id}: Ziel ohne Transporter erreichbar`).toBe(false);
    }
  });

  it('M27/M48: die fünf Level mit Jukebox sind vollständig bewiesen', () => {
    // Ein Musikautomat ist eine WAND: Er nimmt seine Zelle für immer. In
    // handgebauten, austarierten Leveln ist das kein Detail – deshalb läuft
    // hier der GANZE Prüfbericht über jedes Kampagnen-Level, nicht nur der
    // jukebox-Check. Wer einen Automaten verschiebt, sieht sofort, ob er
    // damit einen Pflichtweg, eine Patrouille oder ein Gem zumauert.
    const withBox = CAMPAIGN_LEVELS.filter((l) =>
      l.floors.some((f) => f.elements.some((e) => e.type === 'jukebox')),
    );
    expect(withBox.map((l) => l.id)).toEqual(['w2-06', 'w2-05', 'w3-05', 'w3-06', 'w5-07']);
    for (const lvl of CAMPAIGN_LEVELS) {
      for (const floor of lvl.floors) {
        expect(floor.elements.filter((e) => e.type === 'jukebox').length, lvl.id).toBeLessThanOrEqual(1);
      }
      for (const c of validateLevel(lvl)) {
        if (c.key === 'items') continue; // optional: Gems dürfen hinter Glas liegen
        expect(c.ok, `${lvl.id}: ${c.key} (${c.detail ?? ''})`).toBe(true);
      }
    }
  });

  // DER STIMMTON (M97): Das Lehrlevel zu M96 lebt von einer KETTE – Feld mit
  // Vorgabe-Ton, Tür mit „bleibt offen", nichts sonst. Fällt ein Glied weg,
  // ist das Level unspielbar, und genau das prüfen die drei Proben hier.
  it('w5-08 „Der Stimmton": Vorgabe-Ton, „bleibt offen", und ohne die Tür kein Ziel', () => {
    const def = CAMPAIGN_LEVELS.find((l) => l.id === 'w5-08')!;
    const els = def.floors[0]!.elements;
    const field = els.find((e) => e.type === 'plate')!;
    expect(field).toMatchObject({ tune: 'unison', pitch: 1200 });
    // Allein hält man das Feld nur, solange man darauf liegt (M95) – also
    // MUSS die Tür einrasten, sonst zählt der Öffner nicht.
    expect(els.find((e) => e.type === 'door')).toMatchObject({ latch: true });
    // Und die Fackel, die es im Dunkeln überhaupt findbar macht: ein
    // Resonanzfeld ist STUMM, bis man daraufrollt.
    expect(els.some((e) => e.type === 'torch')).toBe(true);
    const closed = reachable(def, { brittleOpen: true, doorsOpen: false });
    expect(closed.has(cellKey(0, def.floors[0]!.goal!)), 'Ziel ohne Tür erreichbar').toBe(false);
  });

  it('… und ohne „bleibt offen" wäre es UNLÖSBAR (die Kette einmal rot gesehen)', () => {
    const def = CAMPAIGN_LEVELS.find((l) => l.id === 'w5-08')!;
    // `mirror` MUSS mitkommen: Die Def-Koordinaten sind schon gespiegelt, das
    // Seed-RAUSCHEN spiegelt `buildFloorCells` erst anhand dieses Feldes. Ohne
    // es steht ein anderes Labyrinth da – die erste Fassung dieser Probe war
    // deshalb grün, obwohl die Kette gebrochen war.
    const noLatch = parseLevel({
      ...def,
      floors: def.floors.map((f) => ({
        ...f,
        elements: f.elements.map((e) => (e.type === 'door' ? { ...e, latch: false } : e)),
      })),
    });
    expect(validateLevel(noLatch).filter((c) => !c.ok).map((c) => c.key)).toContain('goal');
  });

  it('Wächter- und Wanderloch-Patrouillen verlaufen achsenparallel durch offene Gänge', () => {
    for (const def of CAMPAIGN_LEVELS) {
      def.floors.forEach((floor, fl) => {
        const cells = buildFloorCells(floor, { brittleOpen: false, doorsOpen: false }, def.mirror);
        const cols = floor.size[0];
        for (const el of floor.elements) {
          if (el.type !== 'guard' && el.type !== 'roamingHole') continue;
          for (let i = 1; i < el.patrol.length; i++) {
            const [ax, ay] = el.patrol[i - 1]!;
            const [bx, by] = el.patrol[i]!;
            expect(ax === bx || ay === by, `${def.id} E${fl}: Patrouille nicht achsenparallel`).toBe(true);
            let [x, y] = [ax, ay];
            while (x !== bx || y !== by) {
              const dx = Math.sign(bx - x),
                dy = Math.sign(by - y);
              const c = cells[y * cols + x]!;
              const open = dx === 1 ? !c.e : dx === -1 ? !c.w : dy === 1 ? !c.s : !c.n;
              expect(open, `${def.id} E${fl}: Patrouille blockiert bei (${x},${y})`).toBe(true);
              x += dx;
              y += dy;
            }
          }
        }
      });
    }
  });
});
