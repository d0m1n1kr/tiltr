// Datei zum Nutzer bringen. Auf iOS (installierte PWA) ist der Download-Link
// unzuverlässig, der Teilen-Dialog mit Datei aber der native Weg („In Dateien
// sichern", AirDrop, Mail). Deshalb: Web Share mit Datei, wenn der Browser das
// kann – sonst der klassische Download. Rückgabe sagt, welcher Weg es war.

export async function saveTextFile(
  name: string,
  text: string,
  mime = "text/plain",
): Promise<"share" | "download"> {
  const file = new File([text], name, { type: mime });
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
