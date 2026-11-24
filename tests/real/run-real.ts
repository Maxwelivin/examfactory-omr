/**
 * 真實照片測試：npm run test:real
 *
 * 把手機拍的答案卡照片放進 tests/real/photos/，並在 tests/real/cases.json 寫下人工核對過的正確畫記。
 * 本程式用與 App 相同的辨識引擎跑每一張，輸出：
 *   tests/real/report_<時間>.md   — 每張、每種情境的統計
 *   tests/real/errors_<時間>.jsonl — 每一筆不一致（可追蹤：照片、題號、預期、實得、各選項分數）
 *
 * cases.json 格式見 tests/real/README.md。
 */
import { createRequire } from 'node:module';
import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import { recognize, type RgbaImage } from '../../src/omr/engine';
import { waitForCv } from '../../src/omr/cv';
import { loadParamsFromFile, type RealCase } from './cases';

const require = createRequire(import.meta.url);
const here = new URL('./', import.meta.url);
const casesFile = new URL('cases.json', here);
if (!existsSync(casesFile)) {
  console.error('找不到 tests/real/cases.json。請參考 tests/real/README.md 與 cases.example.json 建立。');
  process.exit(1);
}
const cases: RealCase[] = JSON.parse(readFileSync(casesFile, 'utf8'));
const params = loadParamsFromFile(new URL('params.json', here));
const { cv } = await waitForCv(require('@techstark/opencv-js'));

function decode(path: URL): RgbaImage {
  const buf = readFileSync(path);
  if (/\.png$/i.test(path.pathname)) {
    const p = PNG.sync.read(buf);
    return { width: p.width, height: p.height, data: p.data };
  }
  const j = jpeg.decode(buf, { useTArray: true, maxMemoryUsageInMB: 1024, formatAsRGBA: true });
  return { width: j.width, height: j.height, data: j.data };
}

/** 與 App 相同：長邊縮到 2400 px */
function downscale(img: RgbaImage, maxSide = 2400): RgbaImage {
  const s = Math.min(1, maxSide / Math.max(img.width, img.height));
  if (s === 1) return img;
  const src = new cv.Mat(img.height, img.width, cv.CV_8UC4);
  src.data.set(img.data);
  const dst = new cv.Mat();
  cv.resize(src, dst, new cv.Size(Math.round(img.width * s), Math.round(img.height * s)), 0, 0, cv.INTER_AREA);
  const out = { width: dst.cols, height: dst.rows, data: new Uint8Array(dst.data) };
  src.delete();
  dst.delete();
  return out;
}

const L = 'ABCD';
const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
const errFile = new URL(`errors_${stamp}.jsonl`, here);
writeFileSync(errFile, '');

interface Tally {
  sheets: number;
  rejected: number;
  questions: number;
  correct: number;
  flagged: number; // 引擎標為待確認（安全，需人工）
  silent: number; // 引擎給了確定答案但與人工核對不符（最嚴重）
}
const total: Tally = { sheets: 0, rejected: 0, questions: 0, correct: 0, flagged: 0, silent: 0 };
const byCond = new Map<string, Tally>();
const rows: string[] = [];
const bump = (t: Tally, k: keyof Tally) => (t[k] += 1);

for (const c of cases) {
  const path = new URL(`photos/${c.image}`, here);
  if (!existsSync(path)) {
    console.warn(`略過：找不到 photos/${c.image}`);
    continue;
  }
  const conds = c.conditions?.length ? c.conditions : ['未分類'];
  const tallies = [total, ...conds.map((k) => byCond.get(k) ?? byCond.set(k, { sheets: 0, rejected: 0, questions: 0, correct: 0, flagged: 0, silent: 0 }).get(k)!)];
  const r = recognize(cv, downscale(decode(path)), { numQuestions: c.numQuestions, params });
  tallies.forEach((t) => bump(t, 'sheets'));

  if (!r.ok) {
    tallies.forEach((t) => bump(t, 'rejected'));
    const expectReject = c.expectReject === true;
    rows.push(`| ${c.image} | ${conds.join(', ')} | 拒收：${r.error?.code} ${expectReject ? '（符合預期）' : ''} | | | |`);
    if (!expectReject) appendFileSync(errFile, JSON.stringify({ image: c.image, kind: 'rejected', error: r.error }) + '\n');
    continue;
  }
  if (c.expectReject) appendFileSync(errFile, JSON.stringify({ image: c.image, kind: 'should-have-rejected' }) + '\n');

  let ok = 0;
  let flagged = 0;
  let silent = 0;
  r.questions.forEach((q, i) => {
    const exp = c.expected[i];
    if (!exp || exp === '?') return; // 人工也無法確定的題目不計
    tallies.forEach((t) => bump(t, 'questions'));
    const d = q.decision;
    const got = d.kind === 'answer' ? L[d.option] : d.kind === 'blank' ? '-' : d.kind === 'multi' ? 'M' : '?';
    if (got === exp) {
      ok++;
      tallies.forEach((t) => bump(t, 'correct'));
    } else if (got === '?') {
      flagged++;
      tallies.forEach((t) => bump(t, 'flagged'));
      appendFileSync(errFile, JSON.stringify({ image: c.image, q: q.q, kind: 'flagged', expected: exp, got, scores: q.scores.map((s) => +s.toFixed(3)), reason: d.kind === 'unsure' ? d.reason : '' }) + '\n');
    } else {
      silent++;
      tallies.forEach((t) => bump(t, 'silent'));
      appendFileSync(errFile, JSON.stringify({ image: c.image, q: q.q, kind: 'SILENT_ERROR', expected: exp, got, scores: q.scores.map((s) => +s.toFixed(3)) }) + '\n');
    }
  });
  const seatOk = c.seat === undefined ? '' : r.seat?.value === c.seat ? '座號✓' : `座號✗(${r.seat?.value ?? '無'})`;
  const codeOk = c.examCode === undefined ? '' : r.examCode === c.examCode ? '識別碼✓' : `識別碼✗(${r.examCode ?? '無'})`;
  if (c.seat !== undefined && r.seat?.value !== c.seat)
    appendFileSync(errFile, JSON.stringify({ image: c.image, kind: 'seat', expected: c.seat, got: r.seat?.value ?? null, status: r.seat?.status }) + '\n');
  rows.push(`| ${c.image} | ${conds.join(', ')} | ${ok} | ${flagged} | ${silent} | ${[seatOk, codeOk, r.quality ? `模糊 ${r.quality.edgeWidthMm.toFixed(2)}mm` : ''].filter(Boolean).join(' ')} |`);
}

const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : '—');
const line = (name: string, t: Tally) =>
  `| ${name} | ${t.sheets} | ${t.rejected} | ${t.questions} | ${t.correct} (${pct(t.correct, t.questions)}) | ${t.flagged} (${pct(t.flagged, t.questions)}) | ${t.silent} (${pct(t.silent, t.questions)}) |`;
const md = [
  `# 真實照片測試報告 ${stamp}`,
  '',
  `判讀參數：${JSON.stringify(params)}`,
  '',
  '「靜默錯誤」＝引擎給出確定答案、但與人工核對不符，是最需要避免的錯誤；「待確認」會交給教師處理。',
  '',
  '| 情境 | 張數 | 拒收 | 題數 | 正確 | 待確認 | 靜默錯誤 |',
  '|---|---|---|---|---|---|---|',
  line('全部', total),
  ...[...byCond.entries()].map(([k, t]) => line(k, t)),
  '',
  '## 逐張',
  '',
  '| 照片 | 情境 | 正確 | 待確認 | 靜默錯誤 | 其他 |',
  '|---|---|---|---|---|---|',
  ...rows,
  '',
  `錯誤明細：${errFile.pathname.split('/').pop()}`,
].join('\n');
const reportFile = new URL(`report_${stamp}.md`, here);
writeFileSync(reportFile, md);
console.log(md);
