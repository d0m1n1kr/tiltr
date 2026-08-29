// QR-Scanner: nutzt den nativen BarcodeDetector (Android/Chrome) und fällt
// sonst auf jsQR zurück (lazy geladen, u. a. für iOS Safari). Alternativ
// funktioniert immer die Kamera-App: Der QR-Code enthält einen Join-Link.

interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
declare const BarcodeDetector: (new (opts: { formats: string[] }) => BarcodeDetectorLike) | undefined;

export function extractRoomCode(text: string): string | null {
  const fromUrl = text.match(/#join=([A-Za-z0-9-]{4,12})/);
  if (fromUrl) return fromUrl[1]!.toUpperCase();
  if (/^[A-Za-z0-9-]{4,12}$/.test(text.trim())) return text.trim().toUpperCase();
  return null;
}

/** Öffnet den Scanner; löst mit dem Raumcode auf oder mit null bei Abbruch. */
export function scanRoomCode(): Promise<string | null> {
  const panel = document.getElementById('scanner')!;
  const video = document.getElementById('scannerVideo') as HTMLVideoElement;
  const closeBtn = document.getElementById('scannerClose')!;

  return new Promise((resolve) => {
    let stream: MediaStream | null = null;
    let stopped = false;

    const stop = (result: string | null) => {
      if (stopped) return;
      stopped = true;
      stream?.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
      panel.classList.add('hidden');
      closeBtn.removeEventListener('click', onClose);
      resolve(result);
    };
    const onClose = () => stop(null);
    closeBtn.addEventListener('click', onClose);
    panel.classList.remove('hidden');

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
        video.srcObject = stream;
        await video.play();

        if (typeof BarcodeDetector !== 'undefined') {
          const detector = new BarcodeDetector({ formats: ['qr_code'] });
          const tick = async () => {
            if (stopped) return;
            try {
              const codes = await detector.detect(video);
              for (const c of codes) {
                const code = extractRoomCode(c.rawValue);
                if (code) return stop(code);
              }
            } catch {
              /* Frame noch nicht bereit */
            }
            setTimeout(() => void tick(), 150);
          };
          void tick();
        } else {
          // Fallback: jsQR über ein Canvas (lazy geladen)
          const { default: jsQR } = await import('jsqr');
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
          const tick = () => {
            if (stopped) return;
            if (video.videoWidth) {
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              ctx.drawImage(video, 0, 0);
              const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const hit = jsQR(img.data, img.width, img.height);
              if (hit) {
                const code = extractRoomCode(hit.data);
                if (code) return stop(code);
              }
            }
            setTimeout(tick, 200);
          };
          tick();
        }
      } catch {
        // Kamera verweigert/nicht verfügbar
        stop(null);
      }
    })();
  });
}
