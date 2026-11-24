import type { RgbaImage } from './omr/engine';
import { PX_PER_MM, WRITE_BOXES } from './omr/layout';

/** 讀取照片並縮到長邊 ≤ maxSide（瀏覽器會套用 EXIF 方向）。 */
export async function fileToRgba(file: Blob, maxSide = 2400): Promise<{ image: RgbaImage; previewUrl: string }> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  try {
    await img.decode();
  } catch {
    URL.revokeObjectURL(url);
    throw new Error('無法讀取這個影像檔。若是 iPhone 的 HEIC，請改用「拍照」，或在相機設定選「最相容」（JPEG）。');
  }
  const s = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * s);
  const h = Math.round(img.naturalHeight * s);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h);
  return { image: { width: w, height: h, data: d.data }, previewUrl: url };
}

interface Gray {
  width: number;
  height: number;
  data: Uint8Array;
}

function grayToCanvas(g: Gray, sx = 0, sy = 0, sw = g.width, sh = g.height, scale = 1) {
  const src = document.createElement('canvas');
  src.width = sw;
  src.height = sh;
  const ctx = src.getContext('2d')!;
  const id = ctx.createImageData(sw, sh);
  for (let y = 0; y < sh; y++)
    for (let x = 0; x < sw; x++) {
      const v = g.data[(y + sy) * g.width + (x + sx)];
      const i = (y * sw + x) * 4;
      id.data[i] = id.data[i + 1] = id.data[i + 2] = v;
      id.data[i + 3] = 255;
    }
  ctx.putImageData(id, 0, 0);
  if (scale === 1) return src;
  const out = document.createElement('canvas');
  out.width = Math.round(sw * scale);
  out.height = Math.round(sh * scale);
  const o = out.getContext('2d')!;
  o.imageSmoothingQuality = 'high';
  o.drawImage(src, 0, 0, out.width, out.height);
  return out;
}

const toBlob = (c: HTMLCanvasElement, q: number) =>
  new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('影像壓縮失敗'))), 'image/jpeg', q));

/** 校正後整張答案卡（3 px/mm，供核對與存檔）與姓名欄裁切圖。 */
export async function warpedToBlobs(g: Gray) {
  const sheet = await toBlob(grayToCanvas(g, 0, 0, g.width, g.height, 0.6), 0.72);
  const b = WRITE_BOXES.name;
  const nameImg = await toBlob(
    grayToCanvas(g, Math.round(b.x * PX_PER_MM), Math.round(b.y * PX_PER_MM), Math.round(b.w * PX_PER_MM), Math.round(b.h * PX_PER_MM)),
    0.8,
  );
  return { sheet, nameImg };
}

export function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** 把 Blob 轉成可顯示的網址，元件卸載時要 revoke。 */
export function useObjectUrl(blob: Blob | undefined | null): string | undefined {
  // 以簡單快取避免每次 render 產生新網址
  if (!blob) return undefined;
  const cached = urlCache.get(blob);
  if (cached) return cached;
  const u = URL.createObjectURL(blob);
  urlCache.set(blob, u);
  return u;
}
const urlCache = new WeakMap<Blob, string>();
