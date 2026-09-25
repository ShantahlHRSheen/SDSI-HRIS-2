// Browser-side preparation of uploaded images (ID card, chat), so each
// stored file is small.
//   ID photo:  centre-cropped to 3:4 and saved as a 450×600 JPEG (~40–60 KB).
//   Signature: the paper background is made transparent, the empty margins
//              trimmed, and the result capped at 600×200 as a PNG (~5–20 KB).

export async function loadBitmap(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("That image couldn't be read — use a JPG or PNG (iPhone HEIC photos: take a screenshot of it, or set the camera to 'Most Compatible').");
  }
}

export function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't process the image."))), type, quality));
}

export async function prepareIdPhoto(file: Blob): Promise<Blob> {
  const img = await loadBitmap(file);
  const targetRatio = 3 / 4;
  let sw = img.width;
  let sh = img.height;
  if (sw / sh > targetRatio) sw = Math.round(sh * targetRatio);
  else sh = Math.round(sw / targetRatio);
  const sx = Math.round((img.width - sw) / 2);
  const sy = Math.round((img.height - sh) / 2);
  const canvas = document.createElement("canvas");
  canvas.width = 450;
  canvas.height = 600;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return toBlob(canvas, "image/jpeg", 0.82);
}

export async function prepareSignature(file: Blob): Promise<Blob> {
  const img = await loadBitmap(file);
  // Work at a modest size first so large phone photos stay fast.
  const scale = Math.min(1, 1200 / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const work = document.createElement("canvas");
  work.width = w;
  work.height = h;
  const wctx = work.getContext("2d", { willReadFrequently: true })!;
  wctx.drawImage(img, 0, 0, w, h);
  const data = wctx.getImageData(0, 0, w, h);
  const px = data.data;

  // Ink = noticeably darker than the paper. Paper brightness is estimated
  // from the brighter pixels so shadows/greyish paper still clear out.
  let sum = 0;
  let n = 0;
  for (let i = 0; i < px.length; i += 16) {
    const l = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    if (l > 128) {
      sum += l;
      n++;
    }
  }
  const paper = n ? sum / n : 255;
  const threshold = paper - 55;
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const l = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      if (px[i + 3] < 20 || l > threshold) {
        px[i + 3] = 0;
      } else {
        // Dark ink, fully opaque; keep a soft edge for anti-aliasing.
        px[i] = px[i + 1] = px[i + 2] = 20;
        px[i + 3] = Math.min(255, Math.round(((threshold - l) / 40) * 255) + 60);
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error("No signature found in that image — sign in dark ink on plain white paper and try again.");
  wctx.putImageData(data, 0, 0);

  const pad = 6;
  const cx = Math.max(0, minX - pad);
  const cy = Math.max(0, minY - pad);
  const cw = Math.min(w, maxX + pad) - cx;
  const ch = Math.min(h, maxY + pad) - cy;
  const outScale = Math.min(1, 600 / cw, 200 / ch);
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(cw * outScale));
  out.height = Math.max(1, Math.round(ch * outScale));
  out.getContext("2d")!.drawImage(work, cx, cy, cw, ch, 0, 0, out.width, out.height);
  return toBlob(out, "image/png");
}

// Chat photo: longest side at most 1600 px, JPEG (~150–400 KB).
export async function prepareChatPhoto(file: Blob): Promise<Blob> {
  const img = await loadBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return toBlob(canvas, "image/jpeg", 0.8);
}
