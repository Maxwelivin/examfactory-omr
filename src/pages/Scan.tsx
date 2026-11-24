import { useEffect, useRef, useState } from 'react';
import type { CvState } from '../App';
import ResultEditor from '../components/ResultEditor';
import { deleteScan, listExams, listScans, putScan, requestPersist } from '../db';
import { fingerprintSimilarity } from '../grading';
import { keyComplete, useCurrentExam } from '../hooks';
import { fileToRgba, useObjectUrl, warpedToBlobs } from '../image';
import { recognizeImage } from '../omr/client';
import type { RecognitionResult } from '../omr/engine';
import { buildDraft } from '../record';
import { loadParams, setCurrentExamId } from '../settings';
import type { Exam, ScanRecord } from '../types';

type Stage =
  | { kind: 'idle' }
  | { kind: 'working'; label: string }
  | { kind: 'failed'; message: string; previewUrl: string; result?: RecognitionResult }
  | { kind: 'review'; draft: ScanRecord; otherExam?: Exam };

interface Conflict {
  sameSeat?: ScanRecord;
  similar?: { rec: ScanRecord; sim: number };
}

export default function Scan({ cvState }: { cvState: CvState }) {
  const [current] = useCurrentExam();
  const [exam, setExam] = useState<Exam>();
  const [queue, setQueue] = useState<File[]>([]);
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const [lastSaved, setLastSaved] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (current && !exam) setExam(current);
  }, [current, exam]);

  // 佇列有檔案且閒置 → 處理下一張
  useEffect(() => {
    if (stage.kind === 'idle' && queue.length && exam && cvState === 'ready') void process(queue[0], exam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, stage.kind, exam, cvState]);

  async function process(file: File, ex: Exam) {
    setConflict(null);
    setStage({ kind: 'working', label: '讀取照片…' });
    let previewUrl = '';
    try {
      const { image, previewUrl: url } = await fileToRgba(file);
      previewUrl = url;
      setStage({ kind: 'working', label: '定位、校正與辨識中…' });
      const params = loadParams();
      const r = await recognizeImage(image, { numQuestions: ex.numQuestions, params, keepWarped: true });
      if (!r.ok) {
        setStage({ kind: 'failed', message: r.error?.message ?? '辨識失敗', previewUrl, result: r });
        return;
      }
      const blobs = r.warped ? await warpedToBlobs(r.warped) : {};
      const draft = buildDraft(ex, r, params, blobs, 'upload');
      let otherExam: Exam | undefined;
      if (r.examCode !== null && r.examCode !== ex.code) otherExam = (await listExams()).find((e) => e.code === r.examCode);
      URL.revokeObjectURL(previewUrl);
      setStage({ kind: 'review', draft, otherExam });
    } catch (e) {
      setStage({ kind: 'failed', message: e instanceof Error ? e.message : String(e), previewUrl });
    }
  }

  function next() {
    setConflict(null);
    setQueue((q) => q.slice(1));
    setStage({ kind: 'idle' });
  }

  async function save(force?: 'replace' | 'keep') {
    if (stage.kind !== 'review' || !exam) return;
    const draft = stage.draft;
    if (!force) {
      const existing = await listScans(exam.id);
      const sameSeat = draft.seat !== null ? existing.find((s) => s.seat === draft.seat) : undefined;
      let similar: Conflict['similar'];
      for (const s of existing) {
        const sim = fingerprintSimilarity(s.fingerprint, draft.fingerprint);
        if (sim >= 0.95 && (!similar || sim > similar.sim)) similar = { rec: s, sim };
      }
      if (sameSeat || similar) {
        setConflict({ sameSeat, similar });
        return;
      }
    }
    if (force === 'replace' && conflict?.sameSeat) await deleteScan(conflict.sameSeat.id);
    await putScan({ ...draft, updatedAt: Date.now() });
    void requestPersist();
    navigator.vibrate?.(60);
    setSavedCount((c) => c + 1);
    setLastSaved(`座號 ${draft.seat ?? '未填'}：${draft.grade.score} 分${draft.grade.complete ? '' : '（有待確認）'}`);
    next();
  }

  const onFiles = (list: FileList | null) => {
    // FileList 是即時物件：清空 input.value 之後就變空，必須先複製
    const files = list ? Array.from(list) : [];
    if (!files.length) return;
    setQueue((q) => [...q, ...files]);
  };

  const imageUrl = useObjectUrl(stage.kind === 'review' ? stage.draft.image : undefined);
  const nameUrl = useObjectUrl(stage.kind === 'review' ? stage.draft.nameImage : undefined);

  if (!current && !exam) return <div className="card">請先到「考試」建立一份考試。<a href="#/exams">前往</a></div>;
  if (!exam) return <p className="muted">載入中…</p>;

  return (
    <>
      <div className="topbar">
        <h1 style={{ margin: 0 }}>閱卷</h1>
        <span className="spacer" />
        {savedCount > 0 && <span className="badge ok">本次已存 {savedCount} 張</span>}
      </div>
      <div className="card">
        <div className="row">
          <div>
            <div className="muted small">批改考試</div>
            <b>{exam.name}</b>
            <div className="muted small">
              {exam.numQuestions} 題 · 識別碼 {exam.code}
            </div>
          </div>
          <span className="spacer" />
          <a className="btn" href={`#/results/${exam.id}`}>
            成績列表
          </a>
        </div>
        {!keyComplete(exam) && <div className="notice warn small">標準答案尚未設定完成，未設答案的題目不會計分。</div>}
        {lastSaved && <div className="notice ok small">✓ 已儲存 {lastSaved}</div>}

        {stage.kind === 'idle' && (
          <>
            <div className="grid2" style={{ marginTop: 12 }}>
              <button className="btn primary big block" disabled={cvState !== 'ready'} onClick={() => camRef.current?.click()}>
                📷 拍攝答案卡
              </button>
              <button className="btn big block" disabled={cvState !== 'ready'} onClick={() => fileRef.current?.click()}>
                🖼 選擇照片（可多張）
              </button>
            </div>
            {cvState === 'loading' && (
              <div className="row small muted" style={{ marginTop: 10 }}>
                <span className="spinner" /> 辨識模組載入中（第一次約需數秒）…
              </div>
            )}
            <div className="small muted" style={{ marginTop: 10 }}>
              拍攝要點：整張答案卡（含四角黑色方塊）完整入鏡、光線均勻、避免反光與手指遮擋，盡量從正上方拍。
            </div>
          </>
        )}
        <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (onFiles(e.target.files), (e.target.value = ''))} />
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => (onFiles(e.target.files), (e.target.value = ''))} />
        {queue.length > 1 && <div className="small muted" style={{ marginTop: 8 }}>佇列中還有 {queue.length - 1} 張</div>}
      </div>

      {stage.kind === 'working' && (
        <div className="card row">
          <span className="spinner" /> {stage.label}
        </div>
      )}

      {stage.kind === 'failed' && (
        <div className="card">
          <div className="notice bad">✗ {stage.message}</div>
          {stage.previewUrl && <img src={stage.previewUrl} alt="原始照片" style={{ maxWidth: '100%', maxHeight: 420, borderRadius: 8 }} />}
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn primary big" onClick={() => (next(), setTimeout(() => camRef.current?.click(), 50))}>
              重新拍攝
            </button>
            <button className="btn" onClick={next}>
              略過這張
            </button>
          </div>
        </div>
      )}

      {stage.kind === 'review' && (
        <>
          {stage.otherExam && (
            <div className="notice warn">
              這張答案卡屬於「{stage.otherExam.name}」。
              <button
                className="btn"
                style={{ marginLeft: 8 }}
                onClick={() => {
                  setCurrentExamId(stage.otherExam!.id);
                  setExam(stage.otherExam);
                  setStage({ kind: 'idle' });
                }}
              >
                改用該考試批改
              </button>
            </div>
          )}
          <ResultEditor exam={exam} record={stage.draft} imageUrl={imageUrl} nameUrl={nameUrl} onChange={(d) => setStage({ ...stage, draft: d })} />
          {conflict && (
            <div className="card" style={{ borderColor: 'var(--warn)' }}>
              {conflict.sameSeat && (
                <div className="notice warn">
                  座號 {conflict.sameSeat.seat} 已經有一筆紀錄（{conflict.sameSeat.grade.score} 分，{new Date(conflict.sameSeat.createdAt).toLocaleString('zh-TW')}）。
                </div>
              )}
              {conflict.similar && conflict.similar.rec.id !== conflict.sameSeat?.id && (
                <div className="notice warn">
                  這張的畫記與座號 {conflict.similar.rec.seat ?? '未填'} 的紀錄 {Math.round(conflict.similar.sim * 100)}% 相同，可能是同一張答案卡重複掃描。
                </div>
              )}
              <div className="row">
                {conflict.sameSeat && (
                  <button className="btn primary" onClick={() => save('replace')}>
                    取代舊紀錄
                  </button>
                )}
                <button className="btn" onClick={() => save('keep')}>
                  仍然另存一筆
                </button>
                <button className="btn" onClick={() => setConflict(null)}>
                  取消
                </button>
                <button className="btn danger" onClick={next}>
                  不儲存，丟棄這張
                </button>
              </div>
            </div>
          )}
          {!conflict && (
            <div className="sticky-actions row">
              <button className="btn primary big" onClick={() => save()} disabled={stage.draft.seat === null}>
                {stage.draft.seat === null ? '請先輸入座號' : '儲存並掃下一張'}
              </button>
              <button className="btn" onClick={next}>
                不儲存
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
