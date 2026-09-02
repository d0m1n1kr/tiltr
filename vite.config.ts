import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { startupImagesPlugin } from './tools/startup.mjs';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};
const buildTime = new Date().toISOString();

// Schreibt version.json in den Build – die App fragt sie beim Update-Check ab,
// um anzuzeigen, WELCHE Version verfügbar ist.
function versionJson(): Plugin {
  return {
    name: 'tiltr-version-json',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ version: pkg.version, builtAt: buildTime }),
      });
    },
  };
}

export default defineConfig({
  // Relative Pfade, damit die App unter https://<user>.github.io/tiltr/ läuft.
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  plugins: [
    
    // iOS-Startbildschirm: sonst ist die installierte PWA beim Kaltstart kurz WEISS (tools/startup.mjs).
    startupImagesPlugin(),
    versionJson(),
    VitePWA({
      // 'prompt': neue Version wird gemeldet und erst auf Klick aktiviert.
      registerType: 'prompt',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'tiltr – das unsichtbare Labyrinth',
        short_name: 'tiltr',
        description:
          'Steuere einen Ball per Neigung durch ein unsichtbares Labyrinth. Klang, Vibration und Licht offenbaren die Welt.',
        // id/scope/start_url explizit – sonst öffnet Android geteilte Links
        // im Browser statt in der App; navigate-existing nutzt das offene Fenster.
        id: './',
        start_url: './',
        scope: './',
        launch_handler: { client_mode: 'navigate-existing' },
        // 'standalone', NICHT 'fullscreen': iOS unterstützt fullscreen nicht
        // und rendert solche PWAs mit verkürztem Container (schwarzer Balken
        // unten, ~Statusbarhöhe). Details: docs/DESIGN.md, Safe-Area.
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#05070f',
        theme_color: '#0b1020',
        lang: 'de',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Startbilder liegen NICHT in public/ (emitFile) – das Default-Glob
        // (js/css/html + includeAssets) sähe sie nicht. 18 × ~500 Byte.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],

        // version.json immer frisch vom Netz holen (Update-Anzeige).
        navigateFallbackDenylist: [/version\.json$/],
        runtimeCaching: [
          {
            urlPattern: /version\.json$/,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
});
