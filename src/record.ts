import { uid } from './db';
import { decisionToValue, fingerprint, gradeSheet } from './grading';
import type { OmrParams } from './omr/classify';
import type { QuestionReading, RecognitionResult } from './omr/engine';
import { OPTION_LETTERS } from './omr/layout';
import type { AnswerValue, Exam, ScanAnswer, ScanRecord } from './types';

export function answersFrom(questions: QuestionReading[]): ScanAnswer[] {
  return questions.map((q) => {
    const v = decisionToValue(q.decision);
    let note: string | undefined;
    if (q.decision.kind === 'answer') note = q.decision.note;
    else if (q.decision.kind === 'unsure')
      note = `${q.decision.reason}${q.decision.candidates.length ? `（可能：${q.decision.candidates.map((i) => OPTION_LETTERS[i]).join('、')}）` : ''}`;
    return { q: q.q, detected: v, final: v, scores: q.scores, note, edited: false };
  });
}

export function buildDraft(
  exam: Exam,
  r: RecognitionResult,
  params: OmrParams,
  blobs: { sheet?: Blob; nameImg?: Blob },
  source: ScanRecord['source'],
): ScanRecord {
  const answers = answersFrom(r.questions);
  const seat = r.seat?.value ?? null;
  const warnings = [...r.warnings];
  if (r.seat?.status === 'unsure') warnings.push('座號劃記無法確認，請手動輸入座號。');
  if (r.seat?.status === 'blank') warnings.push('沒有座號劃記，請手動輸入座號。');
  if (r.examCode !== null && r.examCode !== exam.code)
    warnings.push(`答案卡識別碼 ${r.examCode} 與目前考試（${exam.code}）不同，可能拿錯答案卡或選錯考試。`);
  const now = Date.now();
  return {
    id: uid(),
    examId: exam.id,
    seat,
    seatSource: seat !== null ? 'omr' : null,
    studentName: '',
    answers,
    grade: gradeSheet(exam, answers),
    createdAt: now,
    updatedAt: now,
    edits: [],
    warnings,
    examCodeRead: r.examCode,
    quality: r.quality
      ? { edgeWidthMm: r.quality.edgeWidthMm, paperLevel: r.quality.paperLevel, baseline: r.quality.baseline, glareRatio: r.quality.glareRatio }
      : null,
    params,
    image: blobs.sheet,
    nameImage: blobs.nameImg,
    fingerprint: fingerprint(answers, seat),
    source,
  };
}

export function setAnswer(rec: ScanRecord, exam: Exam, q: number, value: AnswerValue): ScanRecord {
  const a = rec.answers[q - 1];
  if (!a || a.final === value) return rec;
  const answers = rec.answers.map((x) => (x.q === q ? { ...x, final: value, edited: value !== x.detected } : x));
  return {
    ...rec,
    answers,
    grade: gradeSheet(exam, answers),
    edits: [...rec.edits, { at: Date.now(), field: `q${q}`, from: a.final, to: value }],
    updatedAt: Date.now(),
  };
}

export function setSeat(rec: ScanRecord, seat: number | null): ScanRecord {
  if (rec.seat === seat) return rec;
  return {
    ...rec,
    seat,
    seatSource: seat === null ? null : 'manual',
    edits: [...rec.edits, { at: Date.now(), field: 'seat', from: String(rec.seat ?? ''), to: String(seat ?? '') }],
    updatedAt: Date.now(),
  };
}

/** 考試答案或配分改了之後重算 */
export const regrade = (rec: ScanRecord, exam: Exam): ScanRecord => ({ ...rec, grade: gradeSheet(exam, rec.answers) });

export const ANSWER_TEXT: Record<AnswerValue, string> = { A: 'A', B: 'B', C: 'C', D: 'D', BLANK: '空白', MULTI: '複選', UNSURE: '待確認' };
