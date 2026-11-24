/**
 * 合成影像測試：用答案卡產生器的 SVG 點陣化後加入畫記與拍攝變形，驗證辨識引擎。
 * 這些是「合成」影像，不代表真實拍攝的準確率；真實照片請用 tests/real/。
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { recognize, type CV, type RecognitionResult } from '../src/omr/engine';
import { getCv, makeScene, rng, tiltedCorners, type MarkSpec, type SceneSpec } from './synthetic/synth';

let cv: CV;
beforeAll(async () => {
  cv = await getCv();
});

const L = 'ABCD';
const SYM: Record<string, string> = { blank: '-', multi: 'M', unsure: '?' };
function readout(r: RecognitionResult): string {
  return r.questions.map((q) => (q.decision.kind === 'answer' ? L[q.decision.option] : SYM[q.decision.kind])).join('');
}
function marksFor(ans: string, style: MarkSpec['style'] = 'pencil'): MarkSpec[] {
  return [...ans].flatMap((c, i) => (L.includes(c) ? [{ q: i + 1, option: L.indexOf(c), style }] : []));
}
function randomAnswers(n: number, seed: number) {
  const r = rng(seed);
  return Array.from({ length: n }, () => L[Math.floor(r() * 4)]).join('');
}
async function run(spec: SceneSpec, n = spec.info.numQuestions) {
  return recognize(cv, await makeScene(spec), { numQuestions: n });
}
const info20 = { examName: '合成測試', examCode: 4321, numQuestions: 20 };

describe('正常畫記', () => {
  it('20 題全部作答、座號 17、識別碼', async () => {
    const ans = randomAnswers(20, 1);
    const r = await run({ info: info20, marks: marksFor(ans), seat: 17 });
    expect(r.ok).toBe(true);
    expect(readout(r)).toBe(ans);
    expect(r.examCode).toBe(4321);
    expect(r.seat?.value).toBe(17);
    expect(r.warnings).toEqual([]);
  });
  it('50 題、個位數座號 5', async () => {
    const info = { examName: '五十題', examCode: 65000, numQuestions: 50 };
    const ans = randomAnswers(50, 2);
    const r = await run({ info, marks: marksFor(ans), seat: 5 });
    expect(readout(r)).toBe(ans);
    expect(r.seat?.value).toBe(5);
    expect(r.examCode).toBe(65000);
  });
  it('部分塗滿（偏一側）仍可判讀', async () => {
    const ans = randomAnswers(20, 3);
    const r = await run({ info: info20, marks: marksFor(ans, 'partial') });
    expect(readout(r)).toBe(ans);
  });
});

describe('空白、複選、淡色、擦除', () => {
  it('空白題 → 空白；複選題 → 複選', async () => {
    const marks: MarkSpec[] = [
      ...marksFor('AB-D-BCA--'),
      { q: 11, option: 0 },
      { q: 11, option: 2 },
      { q: 12, option: 1 },
      { q: 12, option: 2 },
      { q: 12, option: 3 },
    ];
    const r = await run({ info: info20, marks });
    expect(readout(r).slice(0, 12)).toBe('AB-D-BCA--MM');
    expect(r.questions[10].decision).toEqual({ kind: 'multi', options: [0, 2] });
  });
  it('淡色畫記 → 待確認（不得猜測為答案）', async () => {
    const r = await run({ info: info20, marks: [...marksFor('A'), { q: 2, option: 1, style: 'light' }, { q: 3, option: 3, style: 'light' }] });
    expect(readout(r).slice(0, 3)).toBe('A??');
  });
  it('擦除殘影 + 新畫記 → 採新畫記', async () => {
    const r = await run({
      info: info20,
      marks: [{ q: 1, option: 0, style: 'erased' }, { q: 1, option: 2 }, { q: 2, option: 3, style: 'erased' }, { q: 2, option: 1 }],
    });
    expect(readout(r).slice(0, 2)).toBe('CB');
  });
  it('只有擦除殘影（擦掉不作答）→ 不得判為答案', async () => {
    const r = await run({ info: info20, marks: [{ q: 1, option: 0, style: 'erased' }, { q: 2, option: 3, style: 'erased' }] });
    expect(['-', '?']).toContain(readout(r)[0]);
    expect(['-', '?']).toContain(readout(r)[1]);
  });
  it('打勾而非塗滿 → 不得判為確定答案', async () => {
    const r = await run({ info: info20, marks: [{ q: 1, option: 1, style: 'check' }] });
    expect(r.questions[0].decision.kind).not.toBe('answer');
  });
});

describe('拍攝角度與方向', () => {
  const ans = randomAnswers(20, 4);
  it('旋轉 12° + 梯形透視 15%', async () => {
    const r = await run({ info: info20, marks: marksFor(ans), corners: tiltedCorners(1500, 2000, { rotateDeg: 12, keystone: 0.15 }) });
    expect(readout(r)).toBe(ans);
  });
  it('答案卡倒放（180°）', async () => {
    const r = await run({ info: info20, marks: marksFor(ans), seat: 23, upsideDown: true });
    expect(r.rotated180).toBe(true);
    expect(readout(r)).toBe(ans);
    expect(r.seat?.value).toBe(23);
  });
  it('橫拿手機（照片橫向、答案卡轉 90°）', async () => {
    const r = await run({ info: info20, marks: marksFor(ans), photo: { width: 2000, height: 1500 }, corners: tiltedCorners(2000, 1500, { rotateDeg: 90 }) });
    expect(readout(r)).toBe(ans);
  });
  it('轉 -80° 且傾斜', async () => {
    const r = await run({
      info: info20,
      marks: marksFor(ans),
      photo: { width: 2000, height: 1500 },
      corners: tiltedCorners(2000, 1500, { rotateDeg: -80, keystone: 0.1 }),
    });
    expect(readout(r)).toBe(ans);
  });
  it('低解析度照片（750×1000）', async () => {
    const r = await run({ info: info20, marks: marksFor(ans), photo: { width: 750, height: 1000 }, corners: tiltedCorners(750, 1000, { fill: 0.88 }) });
    expect(readout(r)).toBe(ans);
  });
});

describe('光照', () => {
  const ans = randomAnswers(20, 5);
  it('光照不均（亮度 100% → 55%）', async () => {
    const r = await run({ info: info20, marks: marksFor(ans), lighting: [1.0, 0.55] });
    expect(readout(r)).toBe(ans);
  });
  it('斜向陰影（遮去 50% 亮度）', async () => {
    const r = await run({ info: info20, marks: marksFor(ans), shadow: 0.5 });
    expect(readout(r)).toBe(ans);
  });
  it('整體偏暗 + 陰影 + 雜訊', async () => {
    const r = await run({ info: info20, marks: marksFor(ans), lighting: [0.6, 0.45], shadow: 0.35, noise: 12 });
    expect(readout(r)).toBe(ans);
  });
  it('反光斑蓋住第 3 題 → 第 3 題待確認，其他題不會讀錯', async () => {
    const r = await run({ info: info20, marks: marksFor(ans), lighting: [0.85, 0.85], glare: { x: 33, y: 112, r: 6 } });
    expect(r.questions[2].decision.kind).toBe('unsure');
    r.questions.forEach((q, i) => {
      if (q.decision.kind === 'answer') expect(L[q.decision.option]).toBe(ans[i]);
    });
    expect(r.warnings.join()).toContain('反光');
  });
});

describe('模糊與失敗情況', () => {
  const ans = randomAnswers(20, 6);
  it('輕微模糊（σ=2px）仍正確、無警告', async () => {
    const r = await run({ info: info20, marks: marksFor(ans), blurSigma: 2 });
    expect(readout(r)).toBe(ans);
    expect(r.warnings).toEqual([]);
  });
  it('中度模糊（σ=4px）正確但提出警告', async () => {
    const r = await run({ info: info20, marks: marksFor(ans), blurSigma: 4 });
    expect(r.ok).toBe(true);
    expect(readout(r)).toBe(ans);
    expect(r.warnings.join()).toContain('模糊');
  });
  it('嚴重模糊（σ=7px）→ 拒收並要求重拍', async () => {
    const r = await run({ info: info20, marks: marksFor(ans), blurSigma: 7 });
    expect(r.ok).toBe(false);
    expect(['TOO_BLURRY', 'NO_MARKERS']).toContain(r.error?.code);
  });
  it('答案卡右下角超出畫面 → 拒收並提示完整入鏡', async () => {
    const r = await run({ info: info20, marks: marksFor(ans), corners: tiltedCorners(1500, 2000, { fill: 0.95, offsetX: 180, offsetY: 160 }) });
    expect(r.ok).toBe(false);
    expect(['NO_MARKERS', 'BAD_GEOMETRY']).toContain(r.error?.code);
    expect(r.error?.message).toContain('入鏡');
  });
  it('沒有答案卡的照片 → 失敗而非亂給答案', () => {
    const W = 800;
    const H = 600;
    const data = new Uint8Array(W * H * 4);
    const rr = rng(9);
    for (let i = 0; i < data.length; i += 4) {
      const v = 120 + rr() * 60;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
    const r = recognize(cv, { width: W, height: H, data }, { numQuestions: 20 });
    expect(r.ok).toBe(false);
  });
});

describe('一致性', () => {
  it('同一張答案卡兩次拍攝（不同角度）結果相同 → 可用於重複掃描偵測', async () => {
    const ans = randomAnswers(20, 7);
    const a = await run({ info: info20, marks: marksFor(ans), seat: 9, seed: 1 });
    const b = await run({
      info: info20,
      marks: marksFor(ans),
      seat: 9,
      seed: 2,
      corners: tiltedCorners(1500, 2000, { rotateDeg: -8, keystone: 0.08 }),
    });
    expect(readout(a)).toBe(ans);
    expect(readout(b)).toBe(ans);
  });
});
