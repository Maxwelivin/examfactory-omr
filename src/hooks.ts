import { useCallback, useEffect, useState } from 'react';
import { getExam, listExams, listScans } from './db';
import { getCurrentExamId } from './settings';
import type { Exam, ScanRecord } from './types';

/** 簡單的非同步載入 hook，回傳 [資料, 重新載入] */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): [T | undefined, () => void, boolean] {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fn().then((d) => {
      if (alive) {
        setData(d);
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return [data, reload, loading];
}

export const useExams = () => useAsync<Exam[]>(listExams, []);
export const useExam = (id: string | undefined) => useAsync<Exam | undefined>(async () => (id ? getExam(id) : undefined), [id]);
export const useScans = (examId: string | undefined) =>
  useAsync<ScanRecord[]>(async () => (examId ? listScans(examId) : []), [examId]);

/** 目前使用中的考試：localStorage 記錄的那份，否則最近修改的一份 */
export function useCurrentExam(): [Exam | undefined, boolean] {
  const [exams, , loading] = useExams();
  const id = getCurrentExamId();
  const exam = exams?.find((e) => e.id === id) ?? exams?.[0];
  return [exam, loading];
}

export function keyComplete(e: Exam) {
  return e.key.slice(0, e.numQuestions).every(Boolean);
}
