import { generateMaze, mazeToWalls } from './maze.js';
import { Ball, World } from './physics.js';
import { TiltInput } from './sensors.js';
import { GameAudio } from './audio.js';
import { haptics } from './haptics.js';
import { Renderer } from './render.js';

const COLS = 6, ROWS = 8;
const CELL = 100;          // Weltkoordinaten (werden auf den Screen skaliert)
const WALL_T = 10;
const BALL_R = 22;
const HOLE_COUNT = 4;
const HOLE_R = BALL_R * 1.25;
const WIND_RANGE = CELL * 2; // Hörweite des Loch-Winds

const canvas = document.getElementById('game');
const overlay = document.getElementById('overlay');
const hud = document.getElementById('hud');
const statusEl = document.getElementById('status');
const startBtn = document.getElementById('startBtn');
const calibrateBtn = document.getElementById('calibrateBtn');
const debugBtn = document.getElementById('debugBtn');

const input = new TiltInput();
const audio = new GameAudio();
const renderer = new Renderer(canvas);

let world = null;
let state = 'menu'; // menu | playing | won
let debug = false;
let revealUntil = 0;
let maxDist = 1;

// Löcher in zufällige Zellen legen – nie in Start-/Zielzelle oder doppelt.
function placeHoles() {
  const forbidden = new Set([0, (ROWS - 1) * COLS + (COLS - 1)]);
  const holes = [];
  while (holes.length < HOLE_COUNT) {
    const cx = Math.floor(Math.random() * COLS);
    const cy = Math.floor(Math.random() * ROWS);
    const key = cy * COLS + cx;
    if (forbidden.has(key)) continue;
    forbidden.add(key);
    const jitter = () => (Math.random() - 0.5) * 16;
    holes.push({ x: (cx + 0.5) * CELL + jitter(), y: (cy + 0.5) * CELL + jitter(), r: HOLE_R });
  }
  return holes;
}

function newGame() {
  const cells = generateMaze(COLS, ROWS);
  const walls = mazeToWalls(cells, COLS, ROWS, CELL, WALL_T);
  const ball = new Ball(CELL / 2, CELL / 2, BALL_R);
  const goal = { x: (COLS - 0.5) * CELL, y: (ROWS - 0.5) * CELL, r: BALL_R * 1.4 };
  world = new World(walls, ball, goal, placeHoles());
  maxDist = Math.hypot(COLS * CELL, ROWS * CELL);
  renderer.fitWorld(COLS * CELL, ROWS * CELL);
  state = 'playing';
  revealUntil = 0;
  input.calibrate();
}

function respawn() {
  const b = world.ball;
  b.x = CELL / 2; b.y = CELL / 2;
  b.vx = 0; b.vy = 0;
  state = 'playing';
  statusEl.textContent = '';
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
      hit.wall.litUntil = now + 1200; // Echo: berührte Wand kurz sichtbar machen
      const intensity = Math.min(1, hit.impact / 500);
      if (intensity > 0.06) {
        audio.hit(intensity, -hit.nx * 0.8);
        haptics.hit(intensity);
      }
    }

    audio.setRolling(Math.min(1, world.ball.speed / world.maxSpeed));

    const { dx, dist } = world.goalVector();
    audio.beacon(dx / (dist || 1), Math.min(1, dist / maxDist));

    // Wind & Warnvibration des nächsten Lochs
    const near = world.nearestHole();
    if (near) {
      const closeness = Math.max(0, 1 - near.dist / WIND_RANGE);
      const pan = (near.hole.x - world.ball.x) / (WIND_RANGE / 2);
      audio.setWind(closeness, pan);
      if (closeness > 0.55) haptics.holeWarning(closeness);
    }

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
      audio.setRolling(0);
      audio.setWind(0);
      audio.win();
      haptics.win();
      statusEl.textContent = 'Ziel gefunden! 🎉';
      setTimeout(() => { statusEl.textContent = ''; newGame(); }, 4000);
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
