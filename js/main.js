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

function newGame() {
  const cells = generateMaze(COLS, ROWS);
  const walls = mazeToWalls(cells, COLS, ROWS, CELL, WALL_T);
  const ball = new Ball(CELL / 2, CELL / 2, BALL_R);
  const goal = { x: (COLS - 0.5) * CELL, y: (ROWS - 0.5) * CELL, r: BALL_R * 1.4 };
  world = new World(walls, ball, goal);
  maxDist = Math.hypot(COLS * CELL, ROWS * CELL);
  renderer.fitWorld(COLS * CELL, ROWS * CELL);
  state = 'playing';
  revealUntil = 0;
  input.calibrate();
}

startBtn.addEventListener('click', async () => {
  await Promise.all([input.start(), audio.start()]);
  overlay.classList.add('hidden');
  hud.classList.remove('hidden');
  newGame();
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
    const hits = world.step(dt, input.tilt);

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

    if (world.goalReached()) {
      state = 'won';
      revealUntil = now + 4000;
      audio.setRolling(0);
      audio.win();
      haptics.win();
      statusEl.textContent = 'Ziel gefunden! 🎉';
      setTimeout(() => { statusEl.textContent = ''; newGame(); }, 4000);
    } else {
      const mode = input.hasSensor ? 'Neigung' : 'Tasten (WASD/Pfeile)';
      statusEl.textContent = debug ? `Debug · ${mode}` : '';
    }
  }

  renderer.draw(world, { debug, revealAll: revealUntil > now, now });
}
requestAnimationFrame(frame);
