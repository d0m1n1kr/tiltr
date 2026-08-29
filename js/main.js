import { generateMaze, mazeToWalls, solveMaze } from './maze.js';
import { Ball, World } from './physics.js';
import { TiltInput } from './sensors.js';
import { GameAudio } from './audio.js';
import { haptics } from './haptics.js';
import { Renderer } from './render.js';

const COLS = 6, ROWS = 8;
const CELL = 100;             // Weltkoordinaten (werden auf den Screen skaliert)
const WALL_T = 10;
const BALL_R = 22;
const HOLE_COUNT = 4;
const HOLE_R = BALL_R * 0.95; // deutlich schmaler als der Gang (~44 vs. 90)
const HOLE_HEAR = CELL * 2;   // Hörweite des Loch-Grollens
const CHECKPOINT_R = 30;
const WINDZONE_COUNT = 2;
const WIND_ACCEL = 1150;      // Gegenhalten braucht ~10° Neigung
const WIND_HEAR = CELL * 1.8;
const BRITTLE_CHANCE = 0.16;  // Anteil brüchiger Innenwände
const BRITTLE_HITS = 3;       // Treffer bis zum Einsturz

const canvas = document.getElementById('game');
const overlay = document.getElementById('overlay');
const hud = document.getElementById('hud');
const statusEl = document.getElementById('status');
const timerEl = document.getElementById('timer');
const startBtn = document.getElementById('startBtn');
const calibrateBtn = document.getElementById('calibrateBtn');
const debugBtn = document.getElementById('debugBtn');

const input = new TiltInput();
const audio = new GameAudio();
const renderer = new Renderer(canvas);

let world = null;
let state = 'menu'; // menu | playing | fell | won
let debug = false;
let revealUntil = 0;
let maxDist = 1;
let respawnPoint = { x: CELL / 2, y: CELL / 2 };
let t0 = 0;
let message = '';
let messageUntil = 0;

const cellCenter = (c) => ({ x: (c.x + 0.5) * CELL, y: (c.y + 0.5) * CELL });
const flash = (text, ms = 1800) => { message = text; messageUntil = performance.now() + ms; };

// Zufällige freie Zellen ziehen; forbidden sammelt bereits belegte Zellindizes.
function pickCells(count, forbidden) {
  const picked = [];
  while (picked.length < count) {
    const cx = Math.floor(Math.random() * COLS);
    const cy = Math.floor(Math.random() * ROWS);
    const key = cy * COLS + cx;
    if (forbidden.has(key)) continue;
    forbidden.add(key);
    picked.push({ x: cx, y: cy });
  }
  return picked;
}

// Innenwände zufällig als brüchig markieren (Außenrand nie).
function markBrittleWalls(walls) {
  for (const w of walls) {
    const interior = w.x > 0 && w.y > 0 && w.x + w.w < COLS * CELL && w.y + w.h < ROWS * CELL;
    if (interior && Math.random() < BRITTLE_CHANCE) w.hp = BRITTLE_HITS;
  }
}

function newGame() {
  const cells = generateMaze(COLS, ROWS);
  const walls = mazeToWalls(cells, COLS, ROWS, CELL, WALL_T);
  markBrittleWalls(walls);

  const path = solveMaze(cells, COLS, ROWS);
  const cpCells = [path[Math.floor(path.length / 3)], path[Math.floor((2 * path.length) / 3)]];
  const checkpoints = cpCells.map((c) => ({ ...cellCenter(c), r: CHECKPOINT_R, reached: false }));

  const forbidden = new Set([0, (ROWS - 1) * COLS + (COLS - 1)]);
  for (const c of cpCells) forbidden.add(c.y * COLS + c.x);
  const jitter = () => (Math.random() - 0.5) * 16;
  const holes = pickCells(HOLE_COUNT, forbidden).map((c) => {
    const p = cellCenter(c);
    return { x: p.x + jitter(), y: p.y + jitter(), r: HOLE_R };
  });
  const windZones = pickCells(WINDZONE_COUNT, forbidden).map((c) => {
    const dir = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(Math.random() * 4)];
    return { x: c.x * CELL, y: c.y * CELL, w: CELL, h: CELL, fx: dir[0] * WIND_ACCEL, fy: dir[1] * WIND_ACCEL };
  });

  const ball = new Ball(CELL / 2, CELL / 2, BALL_R);
  const goal = { x: (COLS - 0.5) * CELL, y: (ROWS - 0.5) * CELL, r: BALL_R * 1.4 };
  world = new World(walls, ball, goal, holes);
  world.windZones = windZones;
  world.checkpoints = checkpoints;
  world.debris = [];

  maxDist = Math.hypot(COLS * CELL, ROWS * CELL);
  renderer.fitWorld(COLS * CELL, ROWS * CELL);
  respawnPoint = { x: CELL / 2, y: CELL / 2 };
  t0 = performance.now();
  state = 'playing';
  revealUntil = 0;
  input.calibrate();
}

function respawn() {
  const b = world.ball;
  b.x = respawnPoint.x;
  b.y = respawnPoint.y;
  b.vx = 0; b.vy = 0;
  state = 'playing';
  statusEl.textContent = '';
}

function bestTime(newSeconds) {
  try {
    const prev = parseFloat(localStorage.getItem('tiltr.best'));
    if (!isFinite(prev) || newSeconds < prev) {
      localStorage.setItem('tiltr.best', String(newSeconds));
      return isFinite(prev); // Rekord nur melden, wenn es schon eine Zeit gab
    }
  } catch { /* Storage kann fehlen (Private Mode) */ }
  return false;
}

// Nach dem Start-Tap erst kalibrieren: Beim Tippen hält man das Handy steil
// zum Gesicht – würde diese Lage als Null gelten, wäre die Vor/Zurück-Achse
// beim flachen Spielen dauerhaft am Anschlag (Ball klebt an der Wand).
startBtn.addEventListener('click', async () => {
  await Promise.all([input.start(), audio.start()]);
  startBtn.classList.add('hidden');
  document.getElementById('sensorNote').classList.add('hidden');
  const text = overlay.querySelector('p');
  for (let i = 3; i > 0; i--) {
    text.innerHTML = `Halte das Handy jetzt <b>flach wie ein Tablett</b> –<br>so, wie du spielen willst.<br><br><span style="font-size:34px">${i}</span>`;
    await new Promise((r) => setTimeout(r, 1000));
  }
  overlay.classList.add('hidden');
  hud.classList.remove('hidden');
  newGame(); // kalibriert auf die aktuelle, flache Haltung
});

calibrateBtn.addEventListener('click', () => input.calibrate());
debugBtn.addEventListener('click', () => { debug = !debug; });

window.addEventListener('resize', () => {
  if (world) renderer.fitWorld(COLS * CELL, ROWS * CELL);
});

// Nähe + Richtung zu einem Rechteck (für den Windzonen-Sound).
function zoneProximity(z, b) {
  const cx = Math.max(z.x, Math.min(b.x, z.x + z.w));
  const cy = Math.max(z.y, Math.min(b.y, z.y + z.h));
  const dist = Math.hypot(b.x - cx, b.y - cy);
  const inside = dist === 0;
  // Drinnen kommt der Klang aus der Richtung, in die der Wind drückt.
  const dx = inside ? z.fx : cx - b.x;
  const dy = inside ? z.fy : cy - b.y;
  return { dist, dx, dy };
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!world) return;

  if (state === 'playing') {
    const tilt = input.tilt;
    const hits = world.step(dt, tilt);

    for (const hit of hits) {
      const wall = hit.wall;
      wall.litUntil = now + 1200; // Echo: berührte Wand kurz sichtbar machen
      const intensity = Math.min(1, hit.impact / 500);
      if (intensity <= 0.06) continue;
      audio.hit(intensity, hit.nx, hit.ny);
      haptics.hit(intensity);
      // Brüchige Wand: knirscht bei kräftigen Treffern, stürzt irgendwann ein.
      if (wall.hp !== undefined && intensity > 0.2) {
        wall.hp--;
        wall.cracked = true;
        if (wall.hp <= 0) {
          const i = world.walls.indexOf(wall);
          if (i !== -1) world.walls.splice(i, 1);
          world.debris.push({ ...wall, litUntil: now + 1500 });
          audio.crumble(hit.nx, hit.ny);
          haptics.crumble();
          flash('Wand eingestürzt! 🧱');
        } else {
          audio.crackle(hit.nx, hit.ny);
        }
      }
    }

    audio.setRolling(Math.min(1, world.ball.speed / world.maxSpeed));

    const { dx, dy, dist } = world.goalVector();
    audio.beacon(dx, dy, Math.min(1, dist / maxDist));

    // Loch-Grollen + Warnvibration
    const near = world.nearestHole();
    if (near) {
      const closeness = Math.max(0, 1 - near.dist / HOLE_HEAR);
      audio.setHoleRumble(closeness, near.hole.x - world.ball.x, near.hole.y - world.ball.y);
      if (closeness > 0.55) haptics.holeWarning(closeness);
    }

    // Windzonen: hörbar in der Nähe, spürbar (Kraft) mittendrin
    let bestZone = null;
    for (const z of world.windZones) {
      const p = zoneProximity(z, world.ball);
      if (!bestZone || p.dist < bestZone.dist) bestZone = p;
    }
    if (bestZone) {
      audio.setWind(Math.max(0, 1 - bestZone.dist / WIND_HEAR), bestZone.dx, bestZone.dy);
    }

    // Checkpoints: einmalig aktivieren, wird neuer Respawn-Punkt
    for (const cp of world.checkpoints) {
      if (cp.reached) continue;
      if (Math.hypot(cp.x - world.ball.x, cp.y - world.ball.y) < cp.r) {
        cp.reached = true;
        cp.litUntil = now + 2000;
        respawnPoint = { x: cp.x, y: cp.y };
        audio.checkpoint();
        haptics.checkpoint();
        flash('Checkpoint! ✓');
      }
    }

    timerEl.textContent = ((now - t0) / 1000).toFixed(1) + ' s';

    const fallen = world.fallenHole();
    if (fallen) {
      state = 'fell';
      fallen.litUntil = now + 1500;
      audio.fall();
      haptics.fall();
      statusEl.textContent = 'In ein Loch gestürzt! 🕳';
      setTimeout(respawn, 1300);
    } else if (world.goalReached()) {
      state = 'won';
      revealUntil = now + 4000;
      const seconds = (now - t0) / 1000;
      audio.setRolling(0);
      audio.setWind(0, 0, 0);
      audio.setHoleRumble(0, 0, 0);
      audio.win();
      haptics.win();
      statusEl.textContent = `Ziel in ${seconds.toFixed(1)} s! 🎉${bestTime(seconds) ? ' Neue Bestzeit!' : ''}`;
      setTimeout(() => { statusEl.textContent = ''; newGame(); }, 4000);
    } else if (messageUntil > now) {
      statusEl.textContent = message;
    } else {
      const mode = input.hasSensor ? 'Neigung' : 'Tasten (WASD/Pfeile)';
      statusEl.textContent = debug
        ? `Debug · ${mode} · x ${tilt.x.toFixed(2)} y ${tilt.y.toFixed(2)}`
        : '';
    }
  }

  renderer.draw(world, { debug, revealAll: revealUntil > now, now });
  window.__tiltrBall = { x: world.ball.x, y: world.ball.y }; // Testbarkeits-Hook
}
requestAnimationFrame(frame);
