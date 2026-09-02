// iOS-Startbildschirm für die installierte PWA.
//
// iOS zeigt beim Start einer PWA einen SYSTEM-Startbildschirm, bevor die
// Seite überhaupt geladen ist – und der ist WEISS, solange keine
// apple-touch-startup-image passt (das Manifest-background_color ignoriert
// iOS dafür). Ein Bild passt nur bei EXAKT gleicher Pixelgröße, sonst wird
// es still verworfen; daher eine Geräteliste und je ein Bild.
//
// Die Bilder sind einfarbig im Spielfeld-Ton (--bg-deep, theme.css): Die
// Welt offenbart sich über sparsames Licht – ein Logo-Splash wäre gegen das
// Spiel. Einfarbig heißt auch: 1-Bit-Palette, ein paar hundert Byte pro
// Bild statt Kilobytes; alle Bilder zusammen bleiben unter 10 KB Precache.
//
// EINE Quelle: Aus DEVICES erzeugt vite.config.ts beim Build sowohl die PNGs
// (emitFile) als auch die <link>-Tags (transformIndexHtml). Nichts wird
// eingecheckt, nichts doppelt gepflegt. E2E-Lauf 26 prüft Tag ↔ Bildgröße.

import { deflateSync } from "node:zlib";

/** Farbe = --bg-deep in src/ui/theme.css. Der E2E-Lauf vergleicht gegen den
 *  gerenderten Token, damit die beiden nicht auseinanderlaufen. */
export const STARTUP_BG = "#05070f";

/** CSS-Pixel (device-width × device-height) und Pixeldichte, Hochkant.
 *  Quelle: Apple HIG „Layout“ / bekannte Viewport-Tabellen. Gleiche
 *  Maße = ein Eintrag (iPhone 12 mini teilt sie mit X/XS/11 Pro). */
export const DEVICES = [
  { w: 375, h: 667, dpr: 2, name: "iPhone SE (2./3. Gen), 6/7/8" },
  { w: 414, h: 736, dpr: 3, name: "iPhone 6/7/8 Plus" },
  { w: 375, h: 812, dpr: 3, name: "iPhone X/XS/11 Pro, 12/13 mini" },
  { w: 414, h: 896, dpr: 2, name: "iPhone XR/11" },
  { w: 414, h: 896, dpr: 3, name: "iPhone XS Max/11 Pro Max" },
  { w: 390, h: 844, dpr: 3, name: "iPhone 12/13/14, 12/13 Pro" },
  { w: 428, h: 926, dpr: 3, name: "iPhone 12/13 Pro Max, 14 Plus" },
  { w: 393, h: 852, dpr: 3, name: "iPhone 14 Pro, 15, 15 Pro, 16" },
  {
    w: 430,
    h: 932,
    dpr: 3,
    name: "iPhone 14 Pro Max, 15 Plus/Pro Max, 16 Plus",
  },
  { w: 402, h: 874, dpr: 3, name: "iPhone 16 Pro" },
  { w: 440, h: 956, dpr: 3, name: "iPhone 16 Pro Max" },
  { w: 744, h: 1133, dpr: 2, name: "iPad mini (6. Gen)" },
  { w: 768, h: 1024, dpr: 2, name: 'iPad 9.7", mini 5' },
  { w: 810, h: 1080, dpr: 2, name: 'iPad 10.2"' },
  { w: 820, h: 1180, dpr: 2, name: 'iPad 10.9" (Air 4/5, 10. Gen)' },
  { w: 834, h: 1112, dpr: 2, name: 'iPad Pro 10.5"' },
  { w: 834, h: 1194, dpr: 2, name: 'iPad Pro 11", Air 11"' },
  { w: 1024, h: 1366, dpr: 2, name: 'iPad Pro 12.9"/13"' },
];

export const startupFile = (d) => `startup/${d.w}x${d.h}@${d.dpr}.png`;
export const startupMedia = (d) =>
  `(device-width: ${d.w}px) and (device-height: ${d.h}px) and (-webkit-device-pixel-ratio: ${d.dpr}) and (orientation: portrait)`;

/* --- Minimaler PNG-Encoder: 1 Bit, Palette mit EINER Farbe --------------- */
const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc32 = (buf) => {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
const chunk = (type, data) => {
  const t = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
};

/** Einfarbiges PNG w×h (Gerätepixel) in `hex`. */
export function solidPng(w, h, hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 1; // bit depth: 1 Bit je Pixel
  ihdr[9] = 3; // colour type: Palette
  // [10] compression 0, [11] filter 0, [12] interlace 0
  const rowBytes = Math.ceil(w / 8);
  const raw = Buffer.alloc((rowBytes + 1) * h); // je Zeile 1 Filterbyte (0) + Bits (alle 0 = Palette-Index 0)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("PLTE", Buffer.from([r, g, b])),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Vite-Plugin: Bilder als Assets emittieren + <link>-Tags in den Head. Nur
 *  im Build (im Dev-Server gäbe es die Dateien nicht – und dort ist kein iOS). */
export function startupImagesPlugin() {
  return {
    name: "tiltr-ios-startup",
    apply: "build",
    generateBundle() {
      for (const d of DEVICES) {
        this.emitFile({
          type: "asset",
          fileName: startupFile(d),
          source: solidPng(d.w * d.dpr, d.h * d.dpr, STARTUP_BG),
        });
      }
    },
    transformIndexHtml() {
      return DEVICES.map((d) => ({
        tag: "link",
        attrs: {
          rel: "apple-touch-startup-image",
          media: startupMedia(d),
          href: startupFile(d),
        },
        injectTo: "head",
      }));
    },
  };
}
