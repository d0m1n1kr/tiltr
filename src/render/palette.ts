// Weltfarben – die Bedeutungsfarben der unsichtbaren Welt (docs/DESIGN.md).
// Eine Farbe = eine Bedeutung. RGB-Tripel als String, weil das Rendering
// eigene Alpha-Werte interpoliert (Echo-Fade); Vollfarben als Hex.

export const WORLD = {
  bgDeep: '#05070f',
  ball: '#4be0c8',
  ballGlow: '75, 224, 200',
  wall: '110, 168, 255',
  brittle: '255, 176, 96',
  holeFill: '#000',
  holeRim: '150, 90, 220',
  goal: '75, 224, 140',
  ping: '75, 224, 200',
  wind: '120, 200, 255',
  checkpoint: '75, 224, 200',
  heart: '255, 110, 130',
  guard: '255, 92, 92',
  key: '255, 214, 90',
  door: '255, 214, 90',
  gem: '190, 240, 255',
  portal: '240, 130, 230',
} as const;
