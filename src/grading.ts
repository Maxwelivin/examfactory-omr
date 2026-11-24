import type { Decision } from './omr/classify';
import { OPTION_LETTERS, type OptionLetter } from './omr/layout';
import type { AnswerValue, Exam, GradeSummary, QStatus, ScanAnswer } from './types';

export function decisionToValue(d: Decision): AnswerValue {
  switch (d.kind) {
    case 'answer':
      return OPTION_LETTERS[d.option];
    case 'blank':
      return 'BLANK';
    case 'multi':
      return 'MULTI';
    default:
      return 'UNSURE';
  }
}

export function gradeAnswer(final: AnswerValue, key: OptionLetter | null): QStatus {
  if (final === 'UNSURE') return 'review';
  if (!key) return 'nokey';
  if (final === 'BLANK') return 'blank';
  if (final === 'MULTI') return 'multi';
  return final === key ? 'correct' : 'wrong';
}

/** 計分：待確認題一律不給分，並使 complete = false。 */
export function gradeSheet(exam: Exam, answers: Pick<ScanAnswer, 'final'>[]): GradeSummary {
  const statuses = answers.slice(0, exam.numQuestions).map((a, i) => gradeAnswer(a.final, exam.key[i] ?? null));
  const s: GradeSummary = { score: 0, maxScore: 0, correct: 0, wrong: 0, blank: 0, multi: 0, review: 0, statuses, complete: true };
  statuses.forEach((st, i) => {
    const pts = exam.points[i] ?? 0;
    if (exam.key[i]) s.maxScore += pts;
    if (st === 'correct') {
      s.correct++;
      s.score += pts;
    } else if (st === 'wrong') s.wrong++;
    else if (st === 'blank') s.blank++;
    else if (st === 'multi') {
      s.multi++;
      s.wrong++;
    } else if (st === 'review') s.review++;
  });
  s.score = Math.round(s.score * 100) / 100;
  s.maxScore = Math.round(s.maxScore * 100) / 100;
  s.complete = s.review === 0;
  return s;
}

/** 平均分配配分（總分 100，餘數加在前面幾題，保留兩位小數） */
export function evenPoints(n: number, total = 100): number[] {
  const base = Math.floor((total / n) * 100) / 100;
  const pts = Array(n).fill(base);
  let rest = Math.round((total - base * n) * 100);
  for (let i = 0; rest > 0; i = (i + 1) % n, rest--) pts[i] = Math.round((pts[i] + 0.01) * 100) / 100;
  return pts;
}

/** 答案卡指紋：用來偵測同一張卡重複掃描（相同畫記組合）。 */
export function fingerprint(answers: Pick<ScanAnswer, 'detected'>[], seat: number | null): string {
  const s = answers.map((a) => (a.detected.length === 1 ? a.detected : a.detected[0].toLowerCase())).join('');
  return `${seat ?? '-'}|${s}`;
}

/** 兩份指紋的答案相似度（0–1），座號不計 */
export function fingerprintSimilarity(a: string, b: string): number {
  const x = a.split('|')[1] ?? '';
  const y = b.split('|')[1] ?? '';
  if (!x.length || x.length !== y.length) return 0;
  let same = 0;
  let marked = 0;
  for (let i = 0; i < x.length; i++) {
    if (x[i] === 'b' && y[i] === 'b') continue; // 兩邊都空白不列入
    marked++;
    if (x[i] === y[i]) same++;
  }
  return marked < 5 ? 0 : same / marked;
}
