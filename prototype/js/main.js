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
const PING_MAX = 3;           // Echo-Pings pro Runde (Checkpoint füllt +1 auf)
const PING_RANGE = 260;       // Reichweite des Echo-Pings
const PING_SPEED = 600;       // px/s – Wellenfront visuell & Echo-Verzögerung
const HOLE_RAMP = 0.6;        // Atem-Zyklus der Löcher (Sekunden)
const HOLE_OPEN = 2.6;
const HOLE_CLOSED = 2.2;
const HOLE_PERIOD = HOLE_RAMP * 2 + HOLE_OPEN + HOLE_CLOSED;

const canvas = document.getElementById('game');
const overlay = document.getElementById('overlay');
const hud = document.getElementById('hud');
const statusEl = document.getElementById('status');
const timerEl = document.getElementById('timer');
const pingsEl = document.getElementById('pings');
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
let pings = PING_MAX;

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
    // offset entzerrt die Atem-Zyklen, damit nie alle Löcher synchron sind
    return { x: p.x + jitter(), y: p.y + jitter(), r: HOLE_R, offset: Math.random() * HOLE_PERIOD, openness: 0 };
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
  world.pings = [];
  pings = PING_MAX;

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

// Atem-Zyklus der Löcher: öffnen (Rampe) -> offen -> schließen (Rampe) -> zu.
function updateHoles(nowMs) {
  for (const h of world.holes) {
    const cyc = (nowMs / 1000 + h.offset) % HOLE_PERIOD;
    if (cyc < HOLE_RAMP) h.openness = cyc / HOLE_RAMP;
    else if (cyc < HOLE_RAMP + HOLE_OPEN) h.openness = 1;
    else if (cyc < HOLE_RAMP * 2 + HOLE_OPEN) h.openness = 1 - (cyc - HOLE_RAMP - HOLE_OPEN) / HOLE_RAMP;
    else h.openness = 0;
  }
}

// Echo-Ping: Umgebung im Radius aufdecken (als Wellenfront) und die
// Reflexionen verzögert & räumlich zurückkommen lassen.
function firePing(now) {
  if (!world || state !== 'playing' || pings <= 0) return;
  pings--;
  const b = world.ball;
  world.pings.push({ x: b.x, y: b.y, start: now, speed: PING_SPEED, range: PING_RANGE });

  const reflections = [];
  for (const w of world.walls) {
    const cx = Math.max(w.x, Math.min(b.x, w.x + w.w));
    const cy = Math.max(w.y, Math.min(b.y, w.y + w.h));
    const dist = Math.hypot(b.x - cx, b.y - cy);
    if (dist > PING_RANGE) continue;
    w.litFrom = now + (dist / PING_SPEED) * 1000;
    w.litUntil = w.litFrom + 1000;
    reflections.push({ dx: cx - b.x, dy: cy - b.y, dist, freq: 950 });
  }
  for (const h of world.holes) {
    const dist = Math.max(0, Math.hypot(b.x - h.x, b.y - h.y) - h.r);
    if (dist > PING_RANGE) continue;
    h.litFrom = now + (dist / PING_SPEED) * 1000;
    h.litUntil = h.litFrom + 1200;
    reflections.push({ dx: h.x - b.x, dy: h.y - b.y, dist, freq: 280 });
  }
  reflections.sort((a, c) => a.dist - c.dist);
  audio.echoPing(reflections.slice(0, 8).map((r) => ({
    dx: r.dx, dy: r.dy, freq: r.freq,
    delay: r.dist / PING_SPEED,
    gain: 0.05 + 0.25 * (1 - r.dist / PING_RANGE),
  })));
}

canvas.addEventListener('pointerdown', () => firePing(performance.now()));
window.addEventListener('keydown', (e) => {
  if (e.key === ' ' && !e.repeat) firePing(performance.now());
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

  updateHoles(now);
  world.pings = world.pings.filter((p) => ((now - p.start) / 1000) * p.speed < p.range);

  if (state === 'playing') {
    const tilt = input.tilt;
    const hits = world.step(dt, tilt);

    for (const hit of hits) {
      const wall = hit.wall;
      wall.litFrom = 0;           // Berührung leuchtet sofort, ohne Ping-Verzögerung
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

    // Gefahr = Nähe des bedrohlichsten OFFENEN Lochs: steuert Grollen
    // (Atmen = An- und Abschwellen mit dem Öffnungsgrad), Warnvibration
    // und den Herzschlag.
    let danger = 0, dangerHole = null;
    for (const h of world.holes) {
      const d = Math.max(0, Math.hypot(h.x - world.ball.x, h.y - world.ball.y) - h.r);
      const c = Math.max(0, 1 - d / HOLE_HEAR) * h.openness;
      if (c > danger) { danger = c; dangerHole = h; }
    }
    if (dangerHole) {
      audio.setHoleRumble(danger, dangerHole.x - world.ball.x, dangerHole.y - world.ball.y);
    } else {
      audio.setHoleRumble(0, 0, 0);
    }
    if (danger > 0.55) haptics.holeWarning(danger);
    audio.heartbeat(danger);

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
        pings = Math.min(PING_MAX, pings + 1);
        audio.checkpoint();
        haptics.checkpoint();
        flash('Checkpoint! ✓ +1 Ping');
      }
    }

    timerEl.textContent = ((now - t0) / 1000).toFixed(1) + ' s';
    pingsEl.textContent = '● '.repeat(pings) + '○ '.repeat(PING_MAX - pings);

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
