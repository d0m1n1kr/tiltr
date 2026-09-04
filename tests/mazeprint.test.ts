// Karten-Drucker für den Levelbau (M44): druckt Kampagnen-Level als ASCII –
// GESPIEGELT, so wie buildFloorCells/der Loader sie sehen (rohe Def-Koordinaten
// = Spiegelung rückwärts: x' = cols-1-x bei 'x', y' = rows-1-y bei 'y').
// Türen/Schiebewände als D, Schallschutz als A, brüchig als B; Elemente als
// Buchstaben. Ohne PRINT_IDS druckt er nichts und ist grün:
//   PRINT_IDS=w1-04,w3-04 npx vitest run tests/mazeprint.test.ts
import { it } from 'vitest';
import { CAMPAIGN_LEVELS } from '../src/levels/campaign';
import { COOP_LEVELS, RACE_LEVELS } from '../src/levels/multiplayer';
import { buildFloorCells } from '../src/levels/validate';

const IDS = ((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.PRINT_IDS ?? '').split(',').filter(Boolean);
const MARK: Record<string, string> = { plate: 'P', hole: 'O', gem: '*', key: 'K', checkpoint: 'C', guard: 'g', listener: 'L', fogZone: '~', ice: '=', transporter: 'T', timedSwitch: 'W', jukebox: 'J', windZone: 'w', current: 'c', echoCrystal: 'x', anchor: 'A', glass: 'g' };

it('print', () => {
  for (const def of [...CAMPAIGN_LEVELS, ...COOP_LEVELS, ...RACE_LEVELS]) {
    if (!IDS.includes(def.id)) continue;
    def.floors.forEach((floor, fl) => {
      const [cols, rows] = floor.size;
      const cells = buildFloorCells(floor, { brittleOpen: true, doorsOpen: false }, def.mirror);
      const mark = new Map<string, string>();
      for (const el of floor.elements) {
        if ('cell' in el) mark.set(`${el.cell[0]},${el.cell[1]}`, MARK[el.type] ?? '?');
        if (el.type === 'guard') for (const c of el.patrol) mark.set(`${c[0]},${c[1]}`, 'g');
      }
      mark.set(`${floor.start[0]},${floor.start[1]}`, 'S');
      if (floor.start2) mark.set(`${floor.start2[0]},${floor.start2[1]}`, '2');
      if (floor.goal) mark.set(`${floor.goal[0]},${floor.goal[1]}`, 'G');
      if (floor.goal2) mark.set(`${floor.goal2[0]},${floor.goal2[1]}`, 'g');
      const norm = ([[x, y], d]: [[number, number], string]): string =>
        d === 'w' ? `${x - 1},${y},e` : d === 'n' ? `${x},${y - 1},s` : `${x},${y},${d}`;
      const doors = new Set(
        floor.elements
          .filter((e) => e.type === 'door' || e.type === 'slidingWall')
          .map((e) => norm((e as { edge: [[number, number], string] }).edge)),
      );
      const absorb = new Set(floor.maze.absorb.map((e) => norm(e as [[number, number], string])));
      const brittle = new Set(floor.maze.brittle.map((e) => norm(e as [[number, number], string])));
      let out = `\n${def.id} E${fl + 1} ${cols}x${rows} mirror=${def.mirror ?? '-'}\n`;
      out += '   ' + [...Array(cols).keys()].map((x) => String(x).padStart(2).padEnd(3)).join('') + '\n';
      out += '   ' + '+--'.repeat(cols) + '+\n';
      for (let y = 0; y < rows; y++) {
        let line = String(y).padStart(2) + ' |';
        let below = '   +';
        for (let x = 0; x < cols; x++) {
          const c = cells[y * cols + x]!;
          const m = mark.get(`${x},${y}`) ?? ' ';
          const ek = `${x},${y},e`;
          line += ` ${m}` + (c.e ? (doors.has(ek) ? 'D' : absorb.has(ek) ? 'A' : brittle.has(ek) ? 'B' : '|') : ' ');
          const sk = `${x},${y},s`;
          below += (c.s ? (doors.has(sk) ? 'DD' : absorb.has(sk) ? 'AA' : brittle.has(sk) ? 'BB' : '--') : '  ') + '+';
        }
        out += line + '\n' + below + '\n';
      }
      console.log(out);
    });
  }
});

it('behind sliding walls (w3-04)', () => {
  if (!IDS.includes('w3-04')) return;
  const def = CAMPAIGN_LEVELS.find((l) => l.id === 'w3-04')!;
  const floor = def.floors[0]!;
  const [cols, rows] = floor.size;
  const cells = buildFloorCells(floor, { brittleOpen: true, doorsOpen: true }, def.mirror);
  // Schiebewände schließen
  for (const el of floor.elements) {
    if (el.type !== 'slidingWall') continue;
    const [[x, y], d] = el.edge;
    const c = cells[y * cols + x]!;
    (c as unknown as Record<string, boolean>)[d] = true;
    const nb = d === 'e' ? [x + 1, y] : d === 'w' ? [x - 1, y] : d === 's' ? [x, y + 1] : [x, y - 1];
    const od = d === 'e' ? 'w' : d === 'w' ? 'e' : d === 's' ? 'n' : 's';
    (cells[nb[1]! * cols + nb[0]!] as unknown as Record<string, boolean>)[od] = true;
  }
  const seen = new Set<string>();
  const q = [floor.start as [number, number]];
  seen.add(floor.start.join(','));
  while (q.length) {
    const [x, y] = q.shift()!;
    const c = cells[y * cols + x]!;
    const nbs: Array<[number, number, 'n' | 'e' | 's' | 'w']> = [[x, y - 1, 'n'], [x + 1, y, 'e'], [x, y + 1, 's'], [x - 1, y, 'w']];
    for (const [nx, ny, d] of nbs) {
      if (c[d] || nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const k = `${nx},${ny}`;
      if (!seen.has(k)) { seen.add(k); q.push([nx, ny]); }
    }
  }
  const behind: string[] = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (!seen.has(`${x},${y}`)) behind.push(`(${x},${y})`);
  console.log('w3-04 shown cells behind sliding walls:', behind.join(' '));
});
