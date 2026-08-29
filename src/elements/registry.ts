// Element-Bibliothek: Jedes Spielelement ist ein Modul gegen dieses Interface.
// Level-Loader (build), Galerie (gallery) und später Editor/Netzcode kennen
// nur die Registry, nicht die einzelnen Elemente.

import type { World } from '../core/physics';
import type { GameAudio } from '../audio/audio';
import type { ElementDef } from '../levels/schema';

export interface BuildContext {
  world: World;
  cell: number;
  cols: number;
  rows: number;
  /** Index der Ebene, in die gebaut wird (0 = Start-Ebene) */
  floorIndex: number;
}

export interface GalleryEntry {
  title: string;
  description: string;
  /** Miniatur in ein kleines Canvas zeichnen */
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  /** Klang-Signatur des Elements abspielen */
  demoSound?: (audio: GameAudio) => void;
}

export interface ElementModule<T extends ElementDef = ElementDef> {
  type: T['type'];
  /** Baut den Level-Eintrag deterministisch in die Welt ein. */
  build(def: T, ctx: BuildContext): void;
  gallery: GalleryEntry;
}

const registry = new Map<string, ElementModule>();

export function registerElement<T extends ElementDef>(mod: ElementModule<T>): void {
  registry.set(mod.type, mod as unknown as ElementModule);
}

export function buildElements(defs: ElementDef[], ctx: BuildContext): void {
  for (const def of defs) {
    const mod = registry.get(def.type);
    if (!mod) throw new Error(`Unbekanntes Element: ${def.type}`);
    mod.build(def, ctx);
  }
}

export function galleryEntries(): GalleryEntry[] {
  return [...registry.values()].map((m) => m.gallery);
}

export const cellCenter = (c: readonly [number, number], cell: number) => ({
  x: (c[0] + 0.5) * cell,
  y: (c[1] + 0.5) * cell,
});
