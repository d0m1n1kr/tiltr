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
  /** Tür (v3.0.7): Rubinrot – VERSCHLOSSEN. Bis 3.0.6 Schlüssel-Gold, das im
   *  Echo-Alpha von 0,55 auf dunklem Grund nicht vom Brüchig-Bernstein der
   *  brüchigen Wände zu unterscheiden war (Hue 45° gegen 30°). Rubin liegt bei
   *  343°: klar getrennt von Bernstein, dunkler und rosiger als Wächter-Rot
   *  (255, 92, 92), satter und dunkler als Jukebox-Pink. Der Schlüssel bleibt
   *  Gold – Schlüssel und Tür unterscheiden sich in Form UND Farbe. */
  door: '232, 84, 128',
  gem: '190, 240, 255',
  portal: '240, 130, 230',
  plate: '255, 214, 90',
  buddy: '210, 225, 255',
  /** Wegmarke (M89): Kreide-Weiß. Absichtlich FARBLOS gegen alles andere –
   *  eine Boje gehört nicht der Welt, sondern den Spielern; sie ist eine
   *  Notiz auf der Karte, kein Gegenstand darin. */
  mark: '240, 244, 235',
  /** Partner als KÖRPER (M62): im Coop auf hellen Ebenen ein fester roter
   *  Ball – Rot ist die einzige Ballfarbe, die im Bild noch frei ist (Wächter-
   *  Rot ist ein Streifen, kein Ball) und liest sich nicht als das eigene Teal. */
  partner: '255, 96, 110',
  /** Fackel (M66): warmes Kerzenlicht – heller und gelber als Brüchig-
   *  Bernstein, blasser als Schlüssel-Gold: Licht, kein Ding. */
  torch: '255, 226, 160',
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
  /** Sand (M103): stumpfe, dunkle Ocker – der GEGENPOL zum Eis, warm statt
   *  kalt. Bewusst matter und dunkler als der Sanduhr-Sand (232,196,140):
   *  Die Sanduhr ist ein GEGENSTAND und darf leuchten, der Boden ist Boden
   *  und liegt unter allem. */
  sand: '186, 152, 96',
  /** Echo-Kristall: Ping-Teal – er IST abgefüllter Ping (+1 Vorrat) */
  crystal: '75, 224, 200',
  /** Sog-Anker: helles Violett – Gefahr-Familie der Löcher, eigener Ton */
  anchor: '170, 110, 240',
  /** Zehrfeld (M102): AUSGEWASCHENES Ping-Teal. Die Nähe zum Kristall ist
   *  Absicht – beide handeln mit demselben Gut –, aber dies hier ist die
   *  leere Seite davon: entsättigt und dunkel, ein Kristall ohne Licht. */
  drain: '96, 148, 142',
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
  /** Lockglocke (M46): Messing – wärmer und dunkler als Schlüssel-Gold, ein
   *  Instrument, kein Schlüssel. */
  bell: '214, 170, 84',
  /** Hallraum (M46): helles Blaugrau, luftiger als Nebel (der ist entsättigt
   *  und schwer) – Raum, der trägt statt schluckt. */
  reverb: '150, 195, 220',
  /** Resonanzfeld (M91): Pervenche – zwischen Wand-Blau (220°) und Anker-
   *  Violett (270°). Die Nähe zum Anker ist ABSICHT: Ein Resonanzfeld IST
   *  eine Schale, die zieht; anders als der Anker singt es und gehört der
   *  Coop-Familie. Die Platte darin bleibt Gold – sie ist eine Platte. */
  resonance: '150, 130, 255',
  /** Rollstein (M47): warmes Steingrau – ein Körper, kein Signal; heller als
   *  Wand-Blau, matter als die Schiebewand. */
  boulder: '176, 168, 156',
  // Glasboden nutzt bewusst das Brüchig-Bernstein (WORLD.brittle):
  // gleiche Bedeutung "brüchig, Vorsicht" – nur als Boden statt Wand.
} as const;
