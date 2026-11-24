import { describe, expect, it } from 'vitest';
import { classify, DEFAULT_PARAMS } from '../src/omr/classify';
import { decodeExamCode, encodeExamCode } from '../src/omr/idcode';
import { bubbleCenter, questionBubbles, MARKER, PAGE, BUBBLE_R, MAX_QUESTIONS, ID_CELL_COUNT, idCellCenter, seatBubbles } from '../src/omr/layout';
import { evenPoints, fingerprint, fingerprintSimilarity, gradeSheet } from '../src/grading';
import { buildCsv } from '../src/csv';
import type { Exam, ScanRecord } from '../src/types';

describe('考試識別碼', () => {
  it('編碼後可解回（抽樣 207 個代碼）', () => {
    for (const c of [1, 2, 255, 4321, 32768, 65535, ...Array.from({ length: 200 }, (_, i) => 1 + i * 327)])
      expect(decodeExamCode(encodeExamCode(c))).toBe(c);
  });
  it('單一位元錯誤會被 CRC 或起止格擋下', () => {
    let accepted = 0;
    for (const c of [17, 4321, 60000]) {
      const bits = encodeExamCode(c);
      for (let i = 0; i < bits.length; i++) {
        const b = [...bits];
        b[i] ^= 1;
        if (decodeExamCode(b) !== null) accepted++;
      }
    }
    expect(accepted).toBe(0);
  });
  it('倒置（180°）讀值不會被誤認為有效代碼', () => {
    let fooled = 0;
    for (let c = 1; c < 65536; c += 97) if (decodeExamCode([...encodeExamCode(c)].reverse()) !== null) fooled++;
    expect(fooled).toBe(0);
  });
});

describe('答案卡配置', () => {
  it('所有圓圈都在紙內、不重疊、不碰定位點', () => {
    const s = seatBubbles();
    const circles = [...questionBubbles(MAX_QUESTIONS).flat(), ...s.tens, ...s.ones];
    for (const b of circles) {
      expect(b.cx - BUBBLE_R).toBeGreaterThan(5);
      expect(b.cx + BUBBLE_R).toBeLessThan(PAGE.width - 5);
      for (const m of Object.values(MARKER.centers))
        expect(Math.max(Math.abs(b.cx - m.x), Math.abs(b.cy - m.y))).toBeGreaterThan(MARKER.size / 2 + BUBBLE_R + 2);
    }
    for (let i = 0; i < circles.length; i++)
      for (let j = i + 1; j < circles.length; j++)
        expect(Math.hypot(circles[i].cx - circles[j].cx, circles[i].cy - circles[j].cy)).toBeGreaterThan(2 * BUBBLE_R + 1);
  });
  it('識別碼格子不與圓圈重疊', () => {
    for (let i = 0; i < ID_CELL_COUNT; i++) {
      const c = idCellCenter(i);
      for (const b of questionBubbles(MAX_QUESTIONS).flat()) expect(Math.hypot(b.cx - c.x, b.cy - c.y)).toBeGreaterThan(BUBBLE_R + 3);
    }
  });
  it('第 11 題位於第二欄第一列', () => {
    expect(bubbleCenter(11, 0).y).toBe(bubbleCenter(1, 0).y);
    expect(bubbleCenter(11, 0).x).toBeGreaterThan(bubbleCenter(1, 3).x);
  });
});

describe('畫記判讀規則', () => {
  const P = DEFAULT_PARAMS;
  it('單一清楚畫記 → 答案', () => expect(classify([0.02, 0.6, 0.01, 0], P)).toEqual({ kind: 'answer', option: 1 }));
  it('全部空白 → 空白', () => expect(classify([0.01, 0.02, 0, 0.05], P).kind).toBe('blank'));
  it('兩個都塗黑 → 複選', () => expect(classify([0.6, 0.55, 0, 0], P)).toEqual({ kind: 'multi', options: [0, 1] }));
  it('太淡 → 待確認，不猜測', () => expect(classify([0.2, 0.01, 0, 0], P).kind).toBe('unsure'));
  it('擦除殘影 + 新畫記 → 採新畫記並附註', () => {
    const d = classify([0.15, 0.0, 0.62, 0], P);
    expect(d.kind).toBe('answer');
    if (d.kind === 'answer') {
      expect(d.option).toBe(2);
      expect(d.note).toBeTruthy();
    }
  });
  it('第二深偏深但未達門檻 → 待確認', () => expect(classify([0.36, 0.25, 0, 0], P).kind).toBe('unsure'));
  it('兩個達門檻但深淺懸殊 → 待確認（可能擦除不完全）', () => expect(classify([0.9, 0.32, 0, 0], P).kind).toBe('unsure'));
  it('反光 → 待確認', () => expect(classify([0.6, 0, 0, 0], P, [0, 0.5, 0, 0]).kind).toBe('unsure'));
});

const exam: Exam = {
  id: 'e1', code: 1234, name: '測試', numQuestions: 5, key: ['A', 'B', 'C', 'D', 'A'], points: [20, 20, 20, 20, 20], createdAt: 0, updatedAt: 0,
};

describe('批改與計分', () => {
  it('答對、答錯、空白、複選、待確認分別計數；待確認不給分', () => {
    const g = gradeSheet(exam, [{ final: 'A' }, { final: 'C' }, { final: 'BLANK' }, { final: 'MULTI' }, { final: 'UNSURE' }]);
    expect(g).toMatchObject({ score: 20, maxScore: 100, correct: 1, wrong: 2, blank: 1, multi: 1, review: 1, complete: false });
  });
  it('全對且無待確認 → complete', () => {
    const g = gradeSheet(exam, ['A', 'B', 'C', 'D', 'A'].map((f) => ({ final: f as 'A' })));
    expect(g.score).toBe(100);
    expect(g.complete).toBe(true);
  });
  it('平均配分總和正確', () => {
    for (const n of [10, 20, 30, 40, 50, 3, 7]) expect(Math.round(evenPoints(n).reduce((a, b) => a + b, 0) * 100) / 100).toBe(100);
  });
  it('重複掃描指紋相似度', () => {
    const mk = (s: string) => [...s].map((d) => ({ detected: d as 'A' }));
    const a = fingerprint(mk('ABCDAB'), 3);
    expect(fingerprintSimilarity(a, fingerprint(mk('ABCDAB'), null))).toBe(1);
    expect(fingerprintSimilarity(a, fingerprint(mk('BCDABC'), 3))).toBe(0);
  });
});

describe('CSV 匯出', () => {
  it('含 BOM、標頭、標準答案列，並防止公式注入', () => {
    const finals = ['A', 'B', 'BLANK', 'MULTI', 'UNSURE'];
    const rec = {
      seat: 3,
      studentName: '=HYPERLINK("x")',
      createdAt: Date.UTC(2026, 0, 1),
      edits: [],
      grade: gradeSheet(exam, finals.map((f) => ({ final: f as 'A' }))),
      answers: finals.map((f, i) => ({ q: i + 1, final: f, detected: f, scores: [], edited: false })),
    } as unknown as ScanRecord;
    const csv = buildCsv(exam, [rec]);
    expect(csv.startsWith('﻿座號,姓名,總分')).toBe(true);
    expect(csv).toContain('標準答案');
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain('A,B,空白,複選,待確認');
  });
});
