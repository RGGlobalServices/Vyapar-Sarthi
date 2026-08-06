// The UPI QR is generated async (dynamic import of the qrcode package, then
// toDataURL) and only swaps in for a placeholder <div> once that resolves.
// cloneNode() only clones whatever is in the DOM *right now* — if the click
// lands before generation finishes, the clone captures the placeholder div,
// not an <img>, and there's nothing left for waitForImages() below to wait
// on. Call this on the LIVE (pre-clone) element first so the real <img> has
// actually appeared before we snapshot it.
export async function waitForQrCode(sourceEl: HTMLElement, expectQr: boolean, timeoutMs = 4000): Promise<void> {
  if (!expectQr) return;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const img = sourceEl.querySelector('img[alt="UPI QR"]') as HTMLImageElement | null;
    if (img && img.src.startsWith('data:')) return;
    await new Promise((r) => setTimeout(r, 150));
  }
}

// html2canvas snapshots the DOM synchronously — if an <img> (e.g. the UPI QR,
// generated async via the qrcode package) hasn't finished decoding yet, the
// captured PDF/share image shows it blank or broken. Call this on the cloned
// node right before html2canvas to make sure every image is actually painted.
export async function waitForImages(container: HTMLElement, timeoutMs = 4000): Promise<void> {
  const imgs = Array.from(container.querySelectorAll('img'));
  await Promise.all(
    imgs.map(async (img) => {
      if (!img.src) return;
      if (typeof img.decode === 'function') {
        try {
          await Promise.race([img.decode(), new Promise((r) => setTimeout(r, timeoutMs))]);
          return;
        } catch {
          // decode() rejects on a genuinely broken image — fall through to the
          // load/error listener below instead of leaving the row half-drawn.
        }
      }
      if (img.complete && img.naturalWidth > 0) return;
      await new Promise<void>((resolve) => {
        const done = () => resolve();
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true });
        setTimeout(done, timeoutMs);
      });
    })
  );
}
