import { useEffect, useState } from 'react';
import { navigate } from '../App';
import ResultEditor from '../components/ResultEditor';
import { deleteScan, getScan, putScan } from '../db';
import { useAsync, useExam } from '../hooks';
import { useObjectUrl } from '../image';
import type { ScanRecord } from '../types';

export default function ScanDetail({ id }: { id: string }) {
  const [loaded] = useAsync(() => getScan(id), [id]);
  const [rec, setRec] = useState<ScanRecord>();
  const [dirty, setDirty] = useState(false);
  const [exam] = useExam(rec?.examId);
  useEffect(() => setRec(loaded), [loaded]);
  const imageUrl = useObjectUrl(rec?.image);
  const nameUrl = useObjectUrl(rec?.nameImage);

  if (!rec || !exam) return <p className="muted">載入中…</p>;
  return (
    <>
      <div className="topbar">
        <a className="btn" href={`#/results/${exam.id}`}>
          ← 成績列表
        </a>
        <span className="spacer" />
        {dirty && <span className="badge warn">尚未儲存</span>}
      </div>
      <ResultEditor
        exam={exam}
        record={rec}
        imageUrl={imageUrl}
        nameUrl={nameUrl}
        onChange={(r) => {
          setRec(r);
          setDirty(true);
        }}
      />
      {rec.edits.length > 0 && (
        <div className="card small">
          <h2 style={{ marginTop: 0 }}>人工修正紀錄</h2>
          {rec.edits.map((e, i) => (
            <div key={i} className="muted">
              {new Date(e.at).toLocaleString('zh-TW')}　{e.field.startsWith('q') ? `第 ${e.field.slice(1)} 題` : e.field === 'seat' ? '座號' : e.field}：{e.from || '（空）'} → {e.to || '（空）'}
            </div>
          ))}
        </div>
      )}
      <div className="card small muted">
        掃描於 {new Date(rec.createdAt).toLocaleString('zh-TW')} · 判讀門檻 塗黑 {rec.params.markThreshold} / 空白 {rec.params.blankThreshold}
        {rec.quality && ` · 邊緣模糊 ${rec.quality.edgeWidthMm.toFixed(2)} mm · 紙張亮度 ${rec.quality.paperLevel}`}
      </div>
      <div className="sticky-actions row">
        <button
          className="btn primary big"
          disabled={!dirty}
          onClick={async () => {
            await putScan({ ...rec, updatedAt: Date.now() });
            setDirty(false);
          }}
        >
          儲存修改
        </button>
        <span className="spacer" />
        <button
          className="btn danger"
          onClick={async () => {
            if (!confirm('刪除這筆成績？')) return;
            await deleteScan(rec.id);
            navigate(`/results/${exam.id}`);
          }}
        >
          刪除
        </button>
      </div>
    </>
  );
}
