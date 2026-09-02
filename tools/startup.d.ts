import type { Plugin } from 'vite';
export const STARTUP_BG: string;
export const DEVICES: ReadonlyArray<{ w: number; h: number; dpr: number; name: string }>;
export function startupFile(d: { w: number; h: number; dpr: number }): string;
export function startupMedia(d: { w: number; h: number; dpr: number }): string;
export function solidPng(w: number, h: number, hex: string): Buffer;
export function startupImagesPlugin(): Plugin;
