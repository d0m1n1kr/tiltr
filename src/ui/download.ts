// Datei zum Nutzer bringen. Auf iOS (installierte PWA) ist der Download-Link
// unzuverlässig, der Teilen-Dialog mit Datei aber der native Weg („In Dateien
// sichern", AirDrop, Mail). Deshalb: Web Share mit Datei, wenn der Browser das
// kann – sonst der klassische Download. Rückgabe sagt, welcher Weg es war.
//
// Zwei Sorten, gelernt am Signal-Test auf iOS (2.11.1–2.11.3):
// - 'text' (text/plain, .txt): Signal fügt den INHALT als Nachricht ein –
//   richtig für nichts, das als Anhang ankommen soll; das Backup bleibt so,
//   weil „In Dateien sichern" damit funktioniert.
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
  kind: ShareKind = "text",
): Promise<"share" | "download"> {
  const file = new File([text], name, { type: SHARE_MIME[kind] });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (
    typeof nav.canShare === "function" &&
    nav.canShare({ files: [file] }) &&
    nav.share
  ) {
    try {
      await nav.share({ files: [file], title: name });
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
