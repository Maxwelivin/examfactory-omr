/** 產生合成樣張 PNG（供目視檢查與瀏覽器端手動測試）：npm run synth */
import { mkdirSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { makeScene, tiltedCorners } from './synth';
import { recognize } from '../../src/omr/engine';
import { getCv } from './synth';
import type { RgbaImage } from '../../src/omr/engine';

const outDir = new URL('./out/', import.meta.url);
mkdirSync(outDir, { recursive: true });

export function savePng(img: RgbaImage, name: string) {
  const png = new PNG({ width: img.width, height: img.height });
  png.data = Buffer.from(img.data);
  writeFileSync(new URL(name, outDir), PNG.sync.write(png));
}

const info = { examName: '合成測試 第一次小考', examCode: 4321, numQuestions: 20 };
const answers = 'ABCDABCDABCDABCDABCD';
const marks = [...answers].map((L, i) => ({ q: i + 1, option: 'ABCD'.indexOf(L) }));

const cv = await getCv();
const scenes: Record<string, Parameters<typeof makeScene>[0]> = {
  normal: { info, marks, seat: 17 },
  tilted: { info, marks, seat: 17, corners: tiltedCorners(1500, 2000, { rotateDeg: 12, keystone: 0.12 }), lighting: [1.0, 0.7] },
  shadow: { info, marks, seat: 17, shadow: 0.45 },
  upside: { info, marks, seat: 17, upsideDown: true },
};
for (const [name, spec] of Object.entries(scenes)) {
  const img = await makeScene(spec);
  savePng(img, `${name}.png`);
  const r = recognize(cv, img, { numQuestions: 20, keepWarped: true });
  const ans = r.questions.map((q) => (q.decision.kind === 'answer' ? 'ABCD'[q.decision.option] : q.decision.kind[0])).join('');
  console.log(name, r.ok, r.error?.message ?? '', 'code', r.examCode, 'rot', r.rotated180, 'seat', r.seat?.value, ans, ans === answers ? 'OK' : 'MISMATCH', r.quality && JSON.stringify({ edge: r.quality.edgeWidthMm, b: +r.quality.baseline.toFixed(3), p: r.quality.paperLevel }), r.timingMs + 'ms', r.warnings);
  if (r.warped) {
    const g = r.warped;
    const rgba = new Uint8Array(g.width * g.height * 4);
    for (let i = 0; i < g.data.length; i++) { rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = g.data[i]; rgba[i * 4 + 3] = 255; }
    savePng({ width: g.width, height: g.height, data: rgba }, `${name}_warped.png`);
  }
}
