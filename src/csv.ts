import type { Exam, ScanRecord } from './types';

const ANSWER_LABEL: Record<string, string> = { BLANK: '空白', MULTI: '複選', UNSURE: '待確認' };

function cell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\r\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? "'" : '') + s.replace(/"/g, '""')}"` : s;
}

function fmtTime(t: number): string {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 成績 CSV（UTF-8 BOM，Excel 可直接開啟中文）。 */
export function buildCsv(exam: Exam, records: ScanRecord[]): string {
  const n = exam.numQuestions;
  const head = ['座號', '姓名', '總分', '滿分', '答對', '答錯', '空白', '待確認', '狀態', '掃描時間', '人工修正次數'];
  for (let i = 1; i <= n; i++) head.push(`第${i}題`);
  const rows = [head];
  rows.push(['標準答案', '', '', '', '', '', '', '', '', '', '', ...exam.key.slice(0, n).map((k) => k ?? '')]);
  const sorted = [...records].sort((a, b) => (a.seat ?? 999) - (b.seat ?? 999) || a.createdAt - b.createdAt);
  for (const r of sorted) {
    rows.push([
      r.seat ?? '',
      r.studentName,
      r.grade.score,
      r.grade.maxScore,
      r.grade.correct,
      r.grade.wrong,
      r.grade.blank,
      r.grade.review,
      r.grade.complete ? '完成' : '待確認',
      fmtTime(r.createdAt),
      r.edits.length,
      ...r.answers.slice(0, n).map((a) => ANSWER_LABEL[a.final] ?? a.final),
    ].map(String));
  }
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
