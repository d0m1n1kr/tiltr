// Gemeinsame Test-Helfer. Das Erreichbarkeits-Modell (BFS über Ebenen,
// gerichtete Transporter-/Strömungs-Kanten, Öffner-Fixpunkt, hazardsBlocked)
// lebt seit M12 in src/levels/validate.ts – EINE Quelle der Wahrheit für
// Testsuite UND Editor-Badges. Hier bleiben nur Re-Exports und der
// Sammel-Helfer expectAllReachable.

import { cellKey, reachable } from '../src/levels/validate';
import type { LevelDef } from '../src/levels/schema';

export {
  buildFloorCells,
  cellKey,
  coopReachable,
  directedDistances,
  reachable,
  validateLevel,
  isShareable,
  type CellConfig,
  type CheckResult,
  type StartPos,
} from '../src/levels/validate';

/** Prüft alle Element-Positionen + Ziel eines Levels auf Erreichbarkeit. */
export function expectAllReachable(
  def: LevelDef,
  expectFn: (cond: boolean, msg: string) => void,
): void {
  const open = reachable(def, { brittleOpen: true, doorsOpen: true });
  def.floors.forEach((floor, fl) => {
    if (floor.goal) expectFn(open.has(cellKey(fl, floor.goal)), `${def.id}: Ziel E${fl}`);
    for (const el of floor.elements) {
      if (el.type === 'gem' || el.type === 'checkpoint' || el.type === 'key' || el.type === 'echoCrystal') {
        expectFn(open.has(cellKey(fl, el.cell)), `${def.id}: ${el.type} E${fl} ${el.cell}`);
      }
      if (el.type === 'guard') {
        for (const wp of el.patrol) expectFn(open.has(cellKey(fl, wp)), `${def.id}: guard E${fl} ${wp}`);
      }
      if (el.type === 'transporter') {
        expectFn(open.has(cellKey(fl, el.cell)), `${def.id}: transporter E${fl} ${el.cell}`);
        expectFn(
          open.has(cellKey(el.target.floor, el.target.cell)),
          `${def.id}: transporter-Ziel E${el.target.floor} ${el.target.cell}`,
        );
      }
    }
  });
}
