import type { OmrParams } from './omr/classify';
import type { OptionLetter } from './omr/layout';

export type AnswerValue = OptionLetter | 'BLANK' | 'MULTI' | 'UNSURE';

export interface Exam {
  id: string;
  /** 印在答案卡識別碼條上的 16 位元代碼 */
  code: number;
  name: string;
  numQuestions: number;
  key: (OptionLetter | null)[];
  points: number[];
  createdAt: number;
  updatedAt: number;
}

export interface ScanAnswer {
  q: number;
  /** 引擎判讀 */
  detected: AnswerValue;
  /** 最終答案（教師修正後） */
  final: AnswerValue;
  scores: number[];
  note?: string;
  edited: boolean;
}

export interface EditLog {
  at: number;
  field: string; // 'q12' / 'seat' / 'name'
  from: string;
  to: string;
}

export type QStatus = 'correct' | 'wrong' | 'blank' | 'multi' | 'review' | 'nokey';

export interface GradeSummary {
  score: number;
  maxScore: number;
  correct: number;
  wrong: number;
  blank: number;
  multi: number;
  review: number;
  statuses: QStatus[];
  /** 沒有待確認題目才算完成 */
  complete: boolean;
}

export interface ScanRecord {
  id: string;
  examId: string;
  seat: number | null;
  seatSource: 'omr' | 'manual' | null;
  studentName: string;
  answers: ScanAnswer[];
  grade: GradeSummary;
  createdAt: number;
  updatedAt: number;
  edits: EditLog[];
  warnings: string[];
  examCodeRead: number | null;
  quality: { edgeWidthMm: number; paperLevel: number; baseline: number; glareRatio: number } | null;
  params: OmrParams;
  /** 校正後答案卡縮圖（JPEG） */
  image?: Blob;
  /** 姓名欄裁切圖（JPEG） */
  nameImage?: Blob;
  fingerprint: string;
  source: 'upload' | 'camera';
}
