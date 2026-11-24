/**
 * OMR 辨識引擎：定位標記 → 透視校正 → 光照正規化 → 逐格取樣 → 判讀。
 * 只依賴傳入的 OpenCV.js 物件，瀏覽器（Web Worker）與 Node 測試共用同一份程式。
 */
import { classify, DEFAULT_PARAMS, median, type Decision, type OmrParams } from './classify';
import { decodeExamCode } from './idcode';
import {
  ID_CELL_COUNT,
  ID_STRIP,
  INNER_SAMPLE_RATIO,
  MARKER,
  PX_PER_MM,
  WARP_H,
  WARP_W,
  idCellCenter,
  questionBubbles,
  seatBubbles,
  type BubbleSpec,
  type Pt,
} from './layout';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CV = any;

export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

export interface RecognizeOptions {
  numQuestions: number;
  params?: Partial<OmrParams>;
  /** 回傳校正後灰階影像（供畫面疊圖與存檔） */
  keepWarped?: boolean;
  /** 覆寫模糊門檻（mm，測試用） */
  edgeWidthFail?: number;
  edgeWidthWarn?: number;
}

export type ErrorCode = 'NO_MARKERS' | 'BAD_GEOMETRY' | 'TOO_BLURRY' | 'BAD_IMAGE';

export interface QuestionReading {
  q: number;
  /** 扣除基線後的畫記程度，依選項順序 */
  scores: number[];
  /** 未扣基線的原始平均暗度 */
  raw: number[];
  glare: number[];
  decision: Decision;
}

export interface SeatReading {
  value: number | null;
  status: 'ok' | 'blank' | 'unsure';
  tens: Decision;
  ones: Decision;
}

export interface Quality {
  /** 印刷邊緣模糊寬度（mm，越小越清晰） */
  edgeWidthMm: number;
  /** 紙張（背景）亮度中位數 0–255 */
  paperLevel: number;
  /** 空白圓圈的暗度基線 */
  baseline: number;
  /** 答題圓圈中出現反光的比例 */
  glareRatio: number;
  /** 四個定位點在原圖中的最小邊長（px），太小代表拍太遠 */
  markerSizePx: number;
}

export interface RecognitionResult {
  ok: boolean;
  error?: { code: ErrorCode; message: string };
  warnings: string[];
  examCode: number | null;
  rotated180: boolean;
  /** 原圖座標中的四個定位點中心（TL, TR, BR, BL） */
  markers: Pt[];
  quality?: Quality;
  questions: QuestionReading[];
  seat?: SeatReading;
  warped?: { width: number; height: number; data: Uint8Array };
  timingMs: number;
}

/** 模糊門檻：邊緣過渡寬度（mm），由合成模糊測試決定，見 docs/ALGORITHM.md。 */
export const EDGE_WIDTH_FAIL = 1.5;
export const EDGE_WIDTH_WARN = 0.9;

const DETECT_LONG_SIDE = 1000;

interface Candidate {
  x: number;
  y: number;
  area: number;
  side: number;
}

function grayAt(data: Uint8Array, w: number, h: number, x: number, y: number): number {
  const xi = Math.min(w - 1, Math.max(0, Math.round(x)));
  const yi = Math.min(h - 1, Math.max(0, Math.round(y)));
  return data[yi * w + xi];
}

function boxMean(data: Uint8Array, w: number, h: number, cx: number, cy: number, half: number): number {
  let s = 0;
  let n = 0;
  const x0 = Math.max(0, Math.floor(cx - half));
  const x1 = Math.min(w - 1, Math.ceil(cx + half));
  const y0 = Math.max(0, Math.floor(cy - half));
  const y1 = Math.min(h - 1, Math.ceil(cy + half));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    s += data[y * w + x];
    n++;
  }
  return n ? s / n : 255;
}

function ringMean(data: Uint8Array, w: number, h: number, cx: number, cy: number, inner: number, outer: number): number {
  let s = 0;
  let n = 0;
  const step = Math.max(1, Math.floor((outer - inner) / 4));
  for (let y = Math.floor(cy - outer); y <= cy + outer; y += step) {
    for (let x = Math.floor(cx - outer); x <= cx + outer; x += step) {
      const dx = Math.abs(x - cx);
      const dy = Math.abs(y - cy);
      if (Math.max(dx, dy) < inner) continue;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      s += data[y * w + x];
      n++;
    }
  }
  return n ? s / n : 0;
}

/** Step 2：在縮小的灰階影像上找出所有「實心深色方塊」候選。 */
export function findMarkerCandidates(cv: CV, gray: CV): Candidate[] {
  const w = gray.cols;
  const h = gray.rows;
  const long = Math.max(w, h);
  const blur = new cv.Mat();
  const bin = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  const out: Candidate[] = [];
  try {
    cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
    let block = Math.round(long / 12) | 1;
    if (block < 15) block = 15;
    cv.adaptiveThreshold(blur, bin, 255, cv.ADAPTIVE_THRESH_MEAN_C, cv.THRESH_BINARY_INV, block, 12);
    cv.findContours(bin, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
    const data = blur.data as Uint8Array;
    const minArea = (long * 0.006) ** 2;
    const maxArea = (long * 0.1) ** 2;
    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i);
      try {
        const area = cv.contourArea(c);
        if (area < minArea || area > maxArea) continue;
        const rect = cv.minAreaRect(c);
        const rw = rect.size.width;
        const rh = rect.size.height;
        if (Math.max(rw, rh) / Math.max(1, Math.min(rw, rh)) > 1.8) continue;
        if (area / (rw * rh) < 0.86) continue; // 圓形（已塗圓圈）約 0.785，會被排除
        const approx = new cv.Mat();
        cv.approxPolyDP(c, approx, 0.06 * cv.arcLength(c, true), true);
        const verts = approx.rows;
        approx.delete();
        if (verts < 4 || verts > 5) continue;
        const s = Math.max(rw, rh);
        const cx = rect.center.x;
        const cy = rect.center.y;
        const inner = boxMean(data, w, h, cx, cy, Math.min(rw, rh) * 0.25);
        const ring = ringMean(data, w, h, cx, cy, s * 0.7, s * 1.0);
        if (!(inner < ring * 0.6 && ring - inner > 40)) continue;
        out.push({ x: cx, y: cy, area, side: Math.sqrt(area) });
      } finally {
        c.delete();
      }
    }
  } finally {
    blur.delete();
    bin.delete();
    contours.delete();
    hierarchy.delete();
  }
  // RETR_LIST 可能同一方塊回傳內外兩條輪廓：合併中心很近者
  out.sort((a, b) => b.area - a.area);
  const merged: Candidate[] = [];
  for (const c of out) if (!merged.some((m) => Math.hypot(m.x - c.x, m.y - c.y) < m.side * 0.6)) merged.push(c);
  return merged;
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** 從候選中挑出最像「答案卡四角」的四個點，依 TL, TR, BR, BL 排序（180° 方向尚未確定）。 */
export function chooseQuad(cands: Candidate[]): Pt[] | null {
  const top = cands.slice(0, 20);
  const expectRatio = (MARKER.centers.bl.y - MARKER.centers.tl.y) / (MARKER.centers.tr.x - MARKER.centers.tl.x);
  const markerFrac = MARKER.size / (MARKER.centers.tr.x - MARKER.centers.tl.x);
  let best: { pts: Pt[]; score: number } | null = null;
  const n = top.length;
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++) for (let d = c + 1; d < n; d++) {
    const g = [top[a], top[b], top[c], top[d]];
    const areas = g.map((p) => p.area);
    if (Math.max(...areas) / Math.min(...areas) > 3) continue;
    const cx = (g[0].x + g[1].x + g[2].x + g[3].x) / 4;
    const cy = (g[0].y + g[1].y + g[2].y + g[3].y) / 4;
    const pts = [...g].sort((p, q) => Math.atan2(p.y - cy, p.x - cx) - Math.atan2(q.y - cy, q.x - cx));
    // 凸四邊形檢查
    let sign = 0;
    let convex = true;
    for (let i = 0; i < 4; i++) {
      const p0 = pts[i];
      const p1 = pts[(i + 1) % 4];
      const p2 = pts[(i + 2) % 4];
      const cr = (p1.x - p0.x) * (p2.y - p1.y) - (p1.y - p0.y) * (p2.x - p1.x);
      const s = Math.sign(cr);
      if (sign === 0) sign = s;
      else if (s !== sign) convex = false;
    }
    if (!convex) continue;
    const s0 = dist(pts[0], pts[1]);
    const s1 = dist(pts[1], pts[2]);
    const s2 = dist(pts[2], pts[3]);
    const s3 = dist(pts[3], pts[0]);
    if (Math.max(s0, s2) / Math.min(s0, s2) > 2 || Math.max(s1, s3) / Math.min(s1, s3) > 2) continue;
    const e02 = (s0 + s2) / 2;
    const e13 = (s1 + s3) / 2;
    const ratio = Math.max(e02, e13) / Math.min(e02, e13);
    if (ratio < expectRatio / 1.35 || ratio > expectRatio * 1.35) continue;
    const meanSide = g.reduce((t, p) => t + p.side, 0) / 4;
    const expectSide = Math.min(e02, e13) * markerFrac;
    if (meanSide / expectSide < 0.5 || meanSide / expectSide > 1.8) continue;
    // 鞋帶公式面積
    let area = 0;
    for (let i = 0; i < 4; i++) area += pts[i].x * pts[(i + 1) % 4].y - pts[(i + 1) % 4].x * pts[i].y;
    area = Math.abs(area) / 2;
    const score = area * (1 - Math.abs(Math.log(ratio / expectRatio)));
    if (!best || score > best.score) {
      // 讓 pts[0]→pts[1] 為短邊（紙張寬度方向）
      let ordered = e02 <= e13 ? pts : [pts[1], pts[2], pts[3], pts[0]];
      // 兩種 180° 選擇中，先取左上角較靠近影像左上者；之後由識別碼確認
      const alt = [ordered[2], ordered[3], ordered[0], ordered[1]];
      if (alt[0].x + alt[0].y < ordered[0].x + ordered[0].y) ordered = alt;
      best = { pts: ordered.map((p) => ({ x: p.x, y: p.y })), score };
    }
  }
  return best ? best.pts : null;
}

/** 以膨脹（局部最大值）估計紙張亮度，再平滑：用來抵消陰影與光照不均。 */
function estimateBackground(cv: CV, warped: CV): CV {
  const bg = new cv.Mat();
  const k = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(41, 41));
  cv.dilate(warped, bg, k);
  k.delete();
  cv.GaussianBlur(bg, bg, new cv.Size(0, 0), 12);
  return bg;
}

interface Sampler {
  gray: Uint8Array;
  bg: Uint8Array;
  paperLevel: number;
  /** 紙張亮度第 90 百分位；紙本身已過曝（≥238）時無法分辨反光，停用反光偵測 */
  paperHigh: number;
}

function sampleDisk(s: Sampler, cxMm: number, cyMm: number, rMm: number): { dark: number; glare: number } {
  const cx = cxMm * PX_PER_MM;
  const cy = cyMm * PX_PER_MM;
  const r = rMm * PX_PER_MM;
  const r2 = r * r;
  let sum = 0;
  let n = 0;
  let glare = 0;
  const glareOn = s.paperHigh < 238;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > r2) continue;
      if (x < 0 || y < 0 || x >= WARP_W || y >= WARP_H) continue;
      const i = y * WARP_W + x;
      const g = s.gray[i];
      const b = Math.max(1, s.bg[i]);
      sum += Math.min(1, Math.max(0, 1 - g / b));
      if (glareOn && g >= 252) glare++;
      n++;
    }
  }
  return { dark: n ? sum / n : 0, glare: n ? glare / n : 0 };
}

function readIdCells(s: Sampler): number[] {
  const cells: number[] = [];
  for (let i = 0; i < ID_CELL_COUNT; i++) {
    const c = idCellCenter(i);
    const half = (ID_STRIP.cell * 0.3) * PX_PER_MM;
    let sum = 0;
    let n = 0;
    for (let y = Math.round(c.y * PX_PER_MM - half); y <= c.y * PX_PER_MM + half; y++)
      for (let x = Math.round(c.x * PX_PER_MM - half); x <= c.x * PX_PER_MM + half; x++) {
        const k = y * WARP_W + x;
        sum += 1 - s.gray[k] / Math.max(1, s.paperLevel);
        n++;
      }
    cells.push(sum / n > 0.45 ? 1 : 0);
  }
  return cells;
}

function makeSampler(cv: CV, warped: CV): Sampler {
  const bg = estimateBackground(cv, warped);
  const gray = new Uint8Array(warped.data);
  const bgData = new Uint8Array(bg.data);
  bg.delete();
  const sample: number[] = [];
  for (let i = 0; i < bgData.length; i += 97) sample.push(bgData[i]);
  sample.sort((a, b) => a - b);
  return { gray, bg: bgData, paperLevel: median(sample), paperHigh: sample[Math.floor(sample.length * 0.9)] };
}

/**
 * 模糊程度：量測識別碼黑格左右邊緣的 20%→80% 亮度過渡寬度（mm）。
 * 印刷邊緣是理想階梯，寬度幾乎只來自相機失焦與手震；值越小越清晰。
 */
function edgeWidthMm(s: Sampler, bits: number[]): number {
  const widths: number[] = [];
  const half = ID_STRIP.cell / 2;
  const step = 0.05;
  for (let i = 0; i < ID_CELL_COUNT; i++) {
    if (!bits[i]) continue;
    const c = idCellCenter(i);
    if (c.x > 120) continue; // 右側上方有說明文字，只用左側格子
    // 從格子內部（黑）往上（白）取樣：上方到座號圓圈之間約 8 mm 空白
    const prof: number[] = [];
    for (let t = -1.5; t <= 5; t += step) {
      let sum = 0;
      for (let dx = -1.2; dx <= 1.2; dx += 0.3) sum += grayAt(s.gray, WARP_W, WARP_H, (c.x + dx) * PX_PER_MM, (c.y - half - t) * PX_PER_MM);
      prof.push(sum / 9);
    }
    const lo = prof[0];
    const hi = prof[prof.length - 1];
    if (hi - lo < 40) continue;
    const at = (f: number) => prof.findIndex((v) => v >= lo + (hi - lo) * f);
    const w = (at(0.8) - at(0.2)) * step;
    if (w >= 0) widths.push(w);
  }
  return widths.length ? median(widths) : Infinity;
}

function fail(code: ErrorCode, message: string, t0: number, extra: Partial<RecognitionResult> = {}): RecognitionResult {
  return {
    ok: false,
    error: { code, message },
    warnings: [],
    examCode: null,
    rotated180: false,
    markers: [],
    questions: [],
    timingMs: Date.now() - t0,
    ...extra,
  };
}

function readBubbles(s: Sampler, specs: BubbleSpec[]) {
  return specs.map((b) => sampleDisk(s, b.cx, b.cy, b.r * INNER_SAMPLE_RATIO));
}

export function recognize(cv: CV, img: RgbaImage, opts: RecognizeOptions): RecognitionResult {
  const t0 = Date.now();
  const params: OmrParams = { ...DEFAULT_PARAMS, ...(opts.params ?? {}) };
  if (!img.width || !img.height || img.data.length !== img.width * img.height * 4)
    return fail('BAD_IMAGE', '影像資料不正確', t0);

  const mats: CV[] = [];
  const track = <T>(m: T): T => {
    mats.push(m);
    return m;
  };
  try {
    const rgba = track(new cv.Mat(img.height, img.width, cv.CV_8UC4));
    rgba.data.set(img.data);
    const gray = track(new cv.Mat());
    cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);

    // Step 2：在縮小影像上找定位標記
    const scale = Math.min(1, DETECT_LONG_SIDE / Math.max(img.width, img.height));
    const small = track(new cv.Mat());
    if (scale < 1) cv.resize(gray, small, new cv.Size(Math.round(img.width * scale), Math.round(img.height * scale)), 0, 0, cv.INTER_AREA);
    else gray.copyTo(small);
    const cands = findMarkerCandidates(cv, small);
    if (cands.length < 4)
      return fail(
        'NO_MARKERS',
        `只找到 ${cands.length} 個定位點（需要 4 個）。請讓整張答案卡（含四個角的黑色方塊）完整入鏡，避免手指或陰影遮住角落。`,
        t0,
      );
    const quadSmall = chooseQuad(cands);
    if (!quadSmall)
      return fail('BAD_GEOMETRY', '找不到完整的四個角定位點（可能有角落超出畫面、被手指遮住，或拍得太斜）。請讓整張答案卡完整入鏡、正對後重拍。', t0);
    const quad = quadSmall.map((p) => ({ x: p.x / scale, y: p.y / scale }));
    const markerSizePx = Math.min(...cands.slice(0, 20).filter((c) => quadSmall.some((q) => q.x === c.x && q.y === c.y)).map((c) => c.side)) / scale;

    // Step 3–4：透視轉換
    const C = MARKER.centers;
    const dstPts = [C.tl, C.tr, C.br, C.bl].flatMap((p) => [p.x * PX_PER_MM, p.y * PX_PER_MM]);
    const srcMat = track(cv.matFromArray(4, 1, cv.CV_32FC2, quad.flatMap((p) => [p.x, p.y])));
    const dstMat = track(cv.matFromArray(4, 1, cv.CV_32FC2, dstPts));
    const M = track(cv.getPerspectiveTransform(srcMat, dstMat));
    let warped = track(new cv.Mat());
    cv.warpPerspective(gray, warped, M, new cv.Size(WARP_W, WARP_H), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(255));

    // Step 5：光照正規化 + 判斷方向（識別碼 CRC 正確的方向為正）
    let sampler = makeSampler(cv, warped);
    let idBits = readIdCells(sampler);
    let examCode = decodeExamCode(idBits);
    let rotated180 = false;
    let markers = quad;
    if (examCode === null) {
      const rot = track(new cv.Mat());
      cv.rotate(warped, rot, cv.ROTATE_180);
      const s2 = makeSampler(cv, rot);
      const bits2 = readIdCells(s2);
      const code2 = decodeExamCode(bits2);
      if (code2 !== null) {
        idBits = bits2;
        warped = rot;
        sampler = s2;
        examCode = code2;
        rotated180 = true;
        markers = [quad[2], quad[3], quad[0], quad[1]];
      }
    }

    const warnings: string[] = [];
    // 定位點自我檢查：校正後四角應為黑色
    for (const p of [C.tl, C.tr, C.br, C.bl]) {
      const m = boxMean(sampler.gray, WARP_W, WARP_H, p.x * PX_PER_MM, p.y * PX_PER_MM, MARKER.size * 0.25 * PX_PER_MM);
      if (m > sampler.paperLevel * 0.6)
        return fail('BAD_GEOMETRY', '透視校正後定位點不在預期位置，可能誤認了其他黑色方塊。請重拍。', t0, { markers });
    }
    if (examCode === null) warnings.push('無法讀取考試識別碼（可能被遮住、塗改或答案卡不是本系統產生的）；方向假設為正向，請核對結果。');

    // 起始格恆為黑色，即使識別碼讀取失敗也能量模糊
    const edgeWidth = edgeWidthMm(sampler, idBits[0] ? idBits : [1]);
    const eFail = opts.edgeWidthFail ?? EDGE_WIDTH_FAIL;
    const eWarn = opts.edgeWidthWarn ?? EDGE_WIDTH_WARN;
    if (edgeWidth > eFail)
      return fail('TOO_BLURRY', `影像太模糊（邊緣模糊 ${edgeWidth.toFixed(2)} mm，上限 ${eFail} mm）。請拿穩、等對焦後重拍。`, t0, { markers });
    if (edgeWidth > eWarn) warnings.push(`影像略模糊（邊緣模糊 ${edgeWidth.toFixed(2)} mm），淡色畫記可能較難判斷。`);
    if (markerSizePx < 14) warnings.push('答案卡在照片中太小，請靠近一點拍攝。');
    if (sampler.paperLevel < 90) warnings.push('光線太暗，建議到明亮處重拍。');

    // Step 6–7：逐格取樣
    const qSpecs = questionBubbles(opts.numQuestions);
    const qRaw = qSpecs.map((row) => readBubbles(sampler, row));
    const baseline = median(qRaw.flat().map((r) => r.dark));
    const adj = (v: number) => Math.max(0, v - baseline);

    // Step 8：判讀
    const questions: QuestionReading[] = qRaw.map((row, i) => {
      const raw = row.map((r) => r.dark);
      const scores = raw.map(adj);
      const glare = row.map((r) => r.glare);
      return { q: i + 1, scores, raw, glare, decision: classify(scores, params, glare) };
    });
    const glareRatio = qRaw.flat().filter((r) => r.glare > params.glareLimit).length / Math.max(1, qRaw.flat().length);
    if (glareRatio > 0.02) warnings.push('部分圓圈有反光，相關題目已標為待確認。建議調整角度避開燈光。');

    const seatSpec = seatBubbles();
    const tensS = readBubbles(sampler, seatSpec.tens);
    const onesS = readBubbles(sampler, seatSpec.ones);
    const tens = classify(tensS.map((r) => adj(r.dark)), params, tensS.map((r) => r.glare));
    const ones = classify(onesS.map((r) => adj(r.dark)), params, onesS.map((r) => r.glare));
    let seat: SeatReading;
    if (tens.kind === 'blank' && ones.kind === 'blank') seat = { value: null, status: 'blank', tens, ones };
    else if (ones.kind === 'answer' && (tens.kind === 'answer' || tens.kind === 'blank')) {
      const v = (tens.kind === 'answer' ? tens.option * 10 : 0) + ones.option;
      seat = v > 0 ? { value: v, status: 'ok', tens, ones } : { value: null, status: 'unsure', tens, ones };
    } else seat = { value: null, status: 'unsure', tens, ones };

    const result: RecognitionResult = {
      ok: true,
      warnings,
      examCode,
      rotated180,
      markers,
      quality: { edgeWidthMm: edgeWidth, paperLevel: sampler.paperLevel, baseline, glareRatio, markerSizePx },
      questions,
      seat,
      timingMs: 0,
    };
    if (opts.keepWarped) result.warped = { width: WARP_W, height: WARP_H, data: sampler.gray };
    result.timingMs = Date.now() - t0;
    return result;
  } finally {
    for (const m of mats) {
      try {
        m.delete();
      } catch {
        /* already deleted */
      }
    }
  }
}

/** 以新的閾值重新判讀（不必重拍）：分數已保存在結果中。 */
export function reclassify(questions: QuestionReading[], params: OmrParams): QuestionReading[] {
  return questions.map((q) => ({ ...q, decision: classify(q.scores, params, q.glare) }));
}

/** 用於測試與診斷：把 grayAt 匯出 */
export const _internal = { grayAt };
