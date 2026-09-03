// Datei zum Nutzer bringen. Auf iOS (installierte PWA) ist der Download-Link
// unzuverlässig, der Teilen-Dialog mit Datei aber der native Weg („In Dateien
// sichern", AirDrop, Mail). Deshalb: Web Share mit Datei, wenn der Browser das
// kann – sonst der klassische Download. Rückgabe sagt, welcher Weg es war.
//
// Zwei Sorten, gelernt am Signal-Test auf iOS (2.11.1–2.11.3):
// - 'text' (text/plain, .txt): Signal fügt den INHALT als Nachricht ein –
//   richtig für nichts, das als Anhang ankommen soll. Seit 2.11.7 nutzt es
//   niemand mehr (auch das Backup ist 'file'); bleibt als Option.
// - 'file' (application/octet-stream, eigene Endung .tiltr): generischer
//   Datentyp → Signal & Co. hängen die Datei als Anhang an. application/json
//   ging gar nicht (iOS reichte nur den Titel weiter = Dateiname als
//   Nachricht). Unsere Importe lesen den Inhalt, nie den Typ.

export type ShareKind = "text" | "file";
export const SHARE_MIME: Record<ShareKind, string> = {
  text: "text/plain",
  file: "application/octet-stream",
};
/** Endung für Level-/Bundle-Exporte – eigene Endung, damit iOS sie als
 *  generische Datei behandelt (public.data), nicht als Text. */
export const EXPORT_EXT = ".tiltr";

export async function saveTextFile(
  name: string,
  text: string,
  kind: ShareKind = "file",
): Promise<"share" | "download"> {
  const file = new File([text], name, { type: SHARE_MIME[kind] });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (
    typeof nav.canShare === "function" &&
    nav.canShare({ files: [file] }) &&
    nav.share
  ) {
    try {
      // KEIN title/text: Safari übergibt ihn als eigenes Text-Element, und
      // Signal (iOS) nimmt dann den Text statt der Datei – beim Empfänger
      // stand nur der Dateiname (2.11.4). Nur die Datei, sonst nichts.
      await nav.share({ files: [file] });
      return "share";
    } catch {
      /* abgebrochen oder verweigert – dann eben Download */
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
  return "download";
}

/**
 * Eine BINÄRDATEI teilen (M85: das Promo-GIF), sonst herunterladen. Wie
 * `saveTextFile`, aber mit echtem Typ: Ein GIF als octet-stream käme in
 * Messengern als Anhang an, nicht als Bild – und genau als Bild soll es
 * ankommen. Auch hier KEIN title/text neben der Datei (2.11.4).
 */
export async function shareBinaryFile(
  name: string,
  blob: Blob,
  type: string,
): Promise<"share" | "download"> {
  const file = new File([blob], name, { type });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (typeof nav.canShare === "function" && nav.canShare({ files: [file] }) && nav.share) {
    try {
      await nav.share({ files: [file] });
      return "share";
    } catch {
      /* abgebrochen – dann eben Download */
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
  return "download";
}
