// Labyrinth-Generierung (Recursive Backtracker) und Umwandlung in Wand-Rechtecke.

export function generateMaze(cols, rows, rng = Math.random) {
  const cells = Array.from({ length: cols * rows }, () => ({ n: true, e: true, s: true, w: true }));
  const idx = (x, y) => y * cols + x;
  const visited = new Array(cols * rows).fill(false);
  const stack = [[0, 0]];
  visited[0] = true;

  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const neighbors = [];
    if (y > 0 && !visited[idx(x, y - 1)]) neighbors.push([x, y - 1, 'n', 's']);
    if (x < cols - 1 && !visited[idx(x + 1, y)]) neighbors.push([x + 1, y, 'e', 'w']);
    if (y < rows - 1 && !visited[idx(x, y + 1)]) neighbors.push([x, y + 1, 's', 'n']);
    if (x > 0 && !visited[idx(x - 1, y)]) neighbors.push([x - 1, y, 'w', 'e']);
    if (!neighbors.length) { stack.pop(); continue; }
    const [nx, ny, wall, opp] = neighbors[Math.floor(rng() * neighbors.length)];
    cells[idx(x, y)][wall] = false;
    cells[idx(nx, ny)][opp] = false;
    visited[idx(nx, ny)] = true;
    stack.push([nx, ny]);
  }
  return cells;
}

// Lösungsweg von (0,0) nach (cols-1, rows-1) per BFS – für Checkpoint-Platzierung.
export function solveMaze(cells, cols, rows) {
  const idx = (x, y) => y * cols + x;
  const prev = new Array(cols * rows).fill(-1);
  const seen = new Array(cols * rows).fill(false);
  const queue = [0];
  seen[0] = true;
  while (queue.length) {
    const c = queue.shift();
    const x = c % cols, y = (c - x) / cols;
    const cell = cells[c];
    const next = [];
    if (!cell.n) next.push(idx(x, y - 1));
    if (!cell.e) next.push(idx(x + 1, y));
    if (!cell.s) next.push(idx(x, y + 1));
    if (!cell.w) next.push(idx(x - 1, y));
    for (const n of next) {
      if (!seen[n]) { seen[n] = true; prev[n] = c; queue.push(n); }
    }
  }
  const path = [];
  let c = cols * rows - 1;
  while (c !== -1) {
    path.push({ x: c % cols, y: Math.floor(c / cols) });
    c = prev[c];
  }
  return path.reverse();
}

// Wände als achsenparallele Rechtecke {x, y, w, h} in Weltkoordinaten.
// Wände liegen zentriert auf den Gitterlinien, Dopplungen werden vermieden
// (Nord-/Westwand nur am Rand, sonst reichen Ost- und Südwände).
export function mazeToWalls(cells, cols, rows, cell, t) {
  const walls = [];
  const idx = (x, y) => y * cols + x;
  const add = (x, y, w, h) => walls.push({ x, y, w, h });
  const ht = t / 2;

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const c = cells[idx(x, y)];
      if (y === 0 && c.n) add(x * cell - ht, -ht, cell + t, t);
      if (x === 0 && c.w) add(-ht, y * cell - ht, t, cell + t);
      if (c.e) add((x + 1) * cell - ht, y * cell - ht, t, cell + t);
      if (c.s) add(x * cell - ht, (y + 1) * cell - ht, cell + t, t);
    }
  }
  return walls;
}
