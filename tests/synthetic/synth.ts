/**
 * 合成測試影像產生器（僅供自動化測試；不是真實拍攝影像）。
 * 流程：sheetSvg() → resvg 點陣化 → 模擬鉛筆畫記 → 透視投影到桌面背景 → 光照/陰影/模糊/雜訊。
 */
import { createRequire } from 'node:module';
import { Resvg } from '@resvg/resvg-js';
import { sheetSvg, type SheetInfo } from '../../src/sheet/svg';
import { bubbleCenter, seatBubbles, BUBBLE_R, MARKER, PAGE, type Pt } from '../../src/omr/layout';
import { waitForCv } from '../../src/omr/cv';
import type { CV, RgbaImage } from '../../src/omr/engine';

const require = createRequire(import.meta.url);
let cvPromise: Promise<CV> | null = null;
export function getCv(): Promise<CV> {
  if (!cvPromise) cvPromise = waitForCv(require('@techstark/opencv-js')).then((r) => r.cv);
  return cvPromise;
}

/** 可重現的亂數 */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };
}

export type MarkStyle = 'pencil' | 'light' | 'erased' | 'partial' | 'check';

export interface MarkSpec {
  q: number; // 題號；座號用 seatTens/seatOnes
  option: number;
  style?: MarkStyle;
}

export interface SceneSpec {
  info: SheetInfo;
  marks: MarkSpec[];
  seat?: number;
  /** 紙張四角在照片中的位置（照片像素），順序 TL TR BR BL；未給則置中略傾斜 */
  corners?: Pt[];
  photo?: { width: number; height: number };
  /** 光照：左上到右下的亮度倍率範圍 */
  lighting?: [number, number];
  /** 斜向陰影帶強度 0–1 */
  shadow?: number;
  blurSigma?: number;
  noise?: number;
  /** 照片整體旋轉 180°（答案卡倒放） */
  upsideDown?: boolean;
  /** 圓形反光斑：中心（mm）與半徑（mm） */
  glare?: { x: number; y: number; r: number };
  seed?: number;
}

const SHEET_PX_PER_MM = 8;

export function renderSheetRgba(info: SheetInfo, pxPerMm = SHEET_PX_PER_MM): RgbaImage {
  const svg = sheetSvg(info);
  const r = new Resvg(svg, {
    fitTo: { mode: 'width', value: Math.round(PAGE.width * pxPerMm) },
    font: { loadSystemFonts: true, defaultFontFamily: 'Microsoft JhengHei' },
    background: '#ffffff',
  });
  const img = r.render();
  return { width: img.width, height: img.height, data: new Uint8Array(img.pixels) };
}

function paintMark(cv: CV, sheet: CV, c: Pt, style: MarkStyle, rand: () => number, k = SHEET_PX_PER_MM) {
  const cx = c.x * k;
  const cy = c.y * k;
  const r = BUBBLE_R * k;
  const data = sheet.data as Uint8Array;
  const w = sheet.cols;
  const fill = (rr: number, base: number, coverage: number, jitter: number, offX = 0) => {
    for (let y = Math.floor(cy - rr); y <= cy + rr; y++)
      for (let x = Math.floor(cx - rr + offX); x <= cx + rr + offX; x++) {
        if ((x - cx - offX) ** 2 + (y - cy) ** 2 > rr * rr) continue;
        if (rand() > coverage) continue;
        const i = (y * w + x) * 4;
        const v = Math.max(0, Math.min(255, base + (rand() - 0.5) * jitter));
        for (let ch = 0; ch < 3; ch++) data[i + ch] = Math.min(data[i + ch], v);
      }
  };
  switch (style) {
    case 'pencil':
      fill(r * 0.95, 70, 0.92, 60);
      break;
    case 'light':
      fill(r * 0.9, 165, 0.85, 40);
      break;
    case 'erased':
      fill(r * 1.0, 212, 0.7, 30);
      break;
    case 'partial': // 只塗了偏一側的大半圈
      fill(r * 0.75, 75, 0.9, 50, r * 0.15);
      break;
    case 'check': // 打勾而非塗滿
      cv.line(sheet, new cv.Point(cx - r * 0.7, cy), new cv.Point(cx - r * 0.1, cy + r * 0.6), new cv.Scalar(60, 60, 60, 255), Math.max(1, k * 0.4));
      cv.line(sheet, new cv.Point(cx - r * 0.1, cy + r * 0.6), new cv.Point(cx + r * 0.8, cy - r * 0.7), new cv.Scalar(60, 60, 60, 255), Math.max(1, k * 0.4));
      break;
  }
}

/** 產生一張「照片」 */
export async function makeScene(spec: SceneSpec): Promise<RgbaImage> {
  const cv = await getCv();
  const rand = rng(spec.seed ?? 7);
  const sheetImg = renderSheetRgba(spec.info);
  const sheet = new cv.Mat(sheetImg.height, sheetImg.width, cv.CV_8UC4);
  sheet.data.set(sheetImg.data);
  for (const m of spec.marks) paintMark(cv, sheet, bubbleCenter(m.q, m.option), m.style ?? 'pencil', rand);
  if (spec.seat) {
    const s = seatBubbles();
    const t = Math.floor(spec.seat / 10);
    if (t > 0) paintMark(cv, sheet, { x: s.tens[t].cx, y: s.tens[t].cy }, 'pencil', rand);
    paintMark(cv, sheet, { x: s.ones[spec.seat % 10].cx, y: s.ones[spec.seat % 10].cy }, 'pencil', rand);
  }

  const W = spec.photo?.width ?? 1500;
  const H = spec.photo?.height ?? 2000;
  const corners = spec.corners ?? [
    { x: 160, y: 140 },
    { x: 1340, y: 170 },
    { x: 1380, y: 1850 },
    { x: 120, y: 1820 },
  ];
  const photo = new cv.Mat(H, W, cv.CV_8UC4, new cv.Scalar(96, 88, 80, 255));
  // 桌面紋理
  const pd = photo.data as Uint8Array;
  for (let i = 0; i < pd.length; i += 4) {
    const v = (rand() - 0.5) * 20;
    pd[i] += v;
    pd[i + 1] += v;
    pd[i + 2] += v;
  }
  const sw = sheetImg.width;
  const sh = sheetImg.height;
  const src = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, sw, 0, sw, sh, 0, sh]);
  const dst = cv.matFromArray(4, 1, cv.CV_32FC2, corners.flatMap((p) => [p.x, p.y]));
  const M = cv.getPerspectiveTransform(src, dst);
  cv.warpPerspective(sheet, photo, M, new cv.Size(W, H), cv.INTER_LINEAR, cv.BORDER_TRANSPARENT);
  src.delete();
  dst.delete();
  sheet.delete();

  // 光照、陰影、反光
  const [l0, l1] = spec.lighting ?? [1, 1];
  const shadow = spec.shadow ?? 0;
  let glareCenter: Pt | null = null;
  let glareR = 0;
  if (spec.glare) {
    const gm = cv.matFromArray(1, 1, cv.CV_32FC2, [spec.glare.x * SHEET_PX_PER_MM, spec.glare.y * SHEET_PX_PER_MM]);
    const go = new cv.Mat();
    cv.perspectiveTransform(gm, go, M);
    glareCenter = { x: go.data32F[0], y: go.data32F[1] };
    const scalePx = Math.hypot(corners[1].x - corners[0].x, corners[1].y - corners[0].y) / PAGE.width;
    glareR = spec.glare.r * scalePx;
    gm.delete();
    go.delete();
  }
  M.delete();
  const noise = spec.noise ?? 4;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const t = (x / W + y / H) / 2;
      let f = l0 + (l1 - l0) * t;
      if (shadow > 0) {
        const d = (x - W * 0.55) * 0.8 + (y - H * 0.4) * 0.6; // 斜向邊界
        const s = 1 / (1 + Math.exp(-d / 25));
        f *= 1 - shadow * s;
      }
      const i = (y * W + x) * 4;
      let add = (rand() - 0.5) * noise * 2;
      if (glareCenter) {
        const dd = Math.hypot(x - glareCenter.x, y - glareCenter.y);
        if (dd < glareR) add += 400;
      }
      for (let ch = 0; ch < 3; ch++) pd[i + ch] = Math.max(0, Math.min(255, pd[i + ch] * f + add));
    }
  if (spec.blurSigma) cv.GaussianBlur(photo, photo, new cv.Size(0, 0), spec.blurSigma);
  if (spec.upsideDown) cv.rotate(photo, photo, cv.ROTATE_180);
  const out: RgbaImage = { width: W, height: H, data: new Uint8Array(photo.data) };
  photo.delete();
  return out;
}

/** 依紙張四角產生「拍攝角度」：傾斜 / 透視 */
export function tiltedCorners(W: number, H: number, opts: { rotateDeg?: number; keystone?: number; fill?: number; offsetX?: number; offsetY?: number } = {}): Pt[] {
  const fill = opts.fill ?? 0.82;
  const ar = PAGE.height / PAGE.width;
  let h = H * fill;
  let w = h / ar;
  if (w > W * fill) {
    w = W * fill;
    h = w * ar;
  }
  const k = opts.keystone ?? 0; // 上緣縮短比例（模擬由下往上斜拍）
  const pts = [
    { x: -w / 2 * (1 - k), y: -h / 2 },
    { x: w / 2 * (1 - k), y: -h / 2 },
    { x: w / 2, y: h / 2 },
    { x: -w / 2, y: h / 2 },
  ];
  const a = ((opts.rotateDeg ?? 0) * Math.PI) / 180;
  const cx = W / 2 + (opts.offsetX ?? 0);
  const cy = H / 2 + (opts.offsetY ?? 0);
  return pts.map((p) => ({ x: cx + p.x * Math.cos(a) - p.y * Math.sin(a), y: cy + p.x * Math.sin(a) + p.y * Math.cos(a) }));
}

export { MARKER };
