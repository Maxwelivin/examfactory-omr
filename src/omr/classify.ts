/**
 * 依各選項的「畫記程度」判斷學生答案。純函式，無 OpenCV 依賴，可單獨測試。
 * 分數 = 圓圈內部平均暗度（0 白、1 全黑）扣除本張答案卡的紙張基線。
 */

export interface OmrParams {
  /** 達到此值視為「有塗」 */
  markThreshold: number;
  /** 低於此值視為「空白」；介於兩者之間＝不確定 */
  blankThreshold: number;
  /**
   * 第二深選項 ≤ 最深 × 此比例 時，最深者視為唯一答案（其餘當作擦除殘影）。
   * 高於此比例且未達塗黑門檻 → 待人工確認。
   */
  dominanceRatio: number;
  /** 兩個選項都達門檻，且第二深 ≥ 最深 × 此比例 → 判定複選 */
  multiRatio: number;
  /** 圓圈內過曝像素比例超過此值 → 該題待確認 */
  glareLimit: number;
}

export const DEFAULT_PARAMS: OmrParams = {
  markThreshold: 0.3,
  blankThreshold: 0.12,
  dominanceRatio: 0.5,
  multiRatio: 0.6,
  glareLimit: 0.25,
};

export type Decision =
  | { kind: 'answer'; option: number; note?: string }
  | { kind: 'blank' }
  | { kind: 'multi'; options: number[] }
  | { kind: 'unsure'; reason: string; candidates: number[] };

export function classify(scores: number[], params: OmrParams = DEFAULT_PARAMS, glare: number[] = []): Decision {
  const glared = glare.map((g, i) => (g > params.glareLimit ? i : -1)).filter((i) => i >= 0);
  if (glared.length) return { kind: 'unsure', reason: '反光遮蔽', candidates: glared };

  const order = scores.map((s, i) => [s, i] as const).sort((a, b) => b[0] - a[0]);
  const [top, topIdx] = order[0];
  const second = order.length > 1 ? order[1][0] : 0;
  const filled = order.filter(([s]) => s >= params.markThreshold).map(([, i]) => i);

  if (filled.length >= 2) {
    if (second >= top * params.multiRatio) return { kind: 'multi', options: filled.sort((a, b) => a - b) };
    return { kind: 'unsure', reason: '兩個選項都有明顯畫記，可能是擦除不完全', candidates: filled.sort((a, b) => a - b) };
  }
  if (filled.length === 1) {
    if (second < params.blankThreshold) return { kind: 'answer', option: topIdx };
    if (second <= top * params.dominanceRatio)
      return { kind: 'answer', option: topIdx, note: '其他選項有淡痕（可能是擦除），已採最深的選項' };
    return { kind: 'unsure', reason: '另一個選項的畫記也偏深', candidates: [topIdx, order[1][1]].sort((a, b) => a - b) };
  }
  if (top < params.blankThreshold) return { kind: 'blank' };
  return {
    kind: 'unsure',
    reason: '畫記太淡',
    candidates: order.filter(([s]) => s >= params.blankThreshold).map(([, i]) => i).sort((a, b) => a - b),
  };
}

/** 中位數（用於紙張基線）。 */
export function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
