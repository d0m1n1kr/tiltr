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
  plate: '255, 214, 90',
  buddy: '210, 225, 255',
  /** Schiebewand: helles Stein-Perlgrau – Wand, die sich bewegt */
  slider: '235, 224, 200',
  /** Strömung: Chartreuse – gerichteter, unüberwindbarer Fluss */
  current: '168, 232, 84',
  /** Horcher: Orangerot – lauschender Jäger (satter als Bernstein, wärmer als Wächter-Rot) */
  listener: '255, 120, 50',
  /** Nebel: entsättigtes Blaugrau – Klangdämpfung, keine Gefahr */
  fog: '160, 165, 185',
  /** Eis: kaltes Eisweiß – rutschiger Boden */
  ice: '185, 225, 240',
  /** Echo-Kristall: Ping-Teal – er IST abgefüllter Ping (+1 Vorrat) */
  crystal: '75, 224, 200',
  /** Sog-Anker: helles Violett – Gefahr-Familie der Löcher, eigener Ton */
  anchor: '170, 110, 240',
  /** Jukebox: warmes Magenta-Rosa – nahe der Portal-Familie (auch sie ist
   *  „Technik in der Wand"), aber wärmer: ein Möbelstück, keine Gefahr. */
  jukebox: '236, 118, 178',
  /** Schallschutzwand: mattes Filz-Khaki – Dämmstoff, kein Signal. Absichtlich
   *  stumpf zwischen Wand-Blau und Brüchig-Bernstein: Sie nimmt Klang weg. */
  absorb: '160, 165, 120',
  /** Echo-Spiegel (M45): kühles Silber – heller und kälter als Wand-Blau, ein
   *  Trugbild aus poliertem Metall. */
  mirror: '200, 215, 235',
  /** Sanduhr (M45): warmer Sand – Zeit, nicht Wert (das Gem ist eisblau, der
   *  Schlüssel Gold). */
  hourglass: '232, 196, 140',
  // Glasboden nutzt bewusst das Brüchig-Bernstein (WORLD.brittle):
  // gleiche Bedeutung "brüchig, Vorsicht" – nur als Boden statt Wand.
} as const;
