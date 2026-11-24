import type { CvState } from '../App';
import { keyComplete, useCurrentExam, useScans } from '../hooks';

export default function Dashboard({ cvState }: { cvState: CvState }) {
  const [exam, loading] = useCurrentExam();
  const [scans] = useScans(exam?.id);
  const pending = scans?.filter((s) => !s.grade.complete || s.seat === null).length ?? 0;
  const avg = scans?.length ? scans.reduce((t, s) => t + s.grade.score, 0) / scans.length : null;

  return (
    <>
      <div className="topbar">
        <h1 style={{ margin: 0 }}>閱卷總覽</h1>
        <span className="spacer" />
        {cvState === 'ready' ? (
          <span className="badge ok">辨識模組就緒</span>
        ) : cvState === 'loading' ? (
          <span className="badge warn">辨識模組載入中…</span>
        ) : (
          <span className="badge bad">辨識模組失敗</span>
        )}
      </div>

      {!loading && !exam && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>開始使用</h2>
          <ol className="muted">
            <li>建立考試並輸入標準答案</li>
            <li>列印答案卡發給學生</li>
            <li>拍照或上傳答案卡，自動批改</li>
            <li>匯出 CSV 成績</li>
          </ol>
          <a className="btn primary big" href="#/exams">
            ＋ 建立第一份考試
          </a>
        </div>
      )}

      {exam && (
        <div className="card">
          <div className="row">
            <div>
              <div className="muted small">目前考試</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{exam.name}</div>
              <div className="muted small">
                {exam.numQuestions} 題 · 識別碼 {exam.code}
              </div>
            </div>
            <span className="spacer" />
            <a className="btn" href={`#/exams/${exam.id}`}>
              編輯
            </a>
          </div>
          {!keyComplete(exam) && <div className="notice warn">標準答案尚未填完，批改結果會有「未設答案」的題目。</div>}
          <div className="stats" style={{ marginTop: 12 }}>
            <div className="stat">
              <b>{scans?.length ?? 0}</b>
              <span>已掃描</span>
            </div>
            <div className="stat">
              <b style={{ color: pending ? 'var(--warn)' : undefined }}>{pending}</b>
              <span>待確認</span>
            </div>
            <div className="stat">
              <b>{avg === null ? '—' : avg.toFixed(1)}</b>
              <span>平均分數</span>
            </div>
          </div>
          <div className="grid2" style={{ marginTop: 14 }}>
            <a className="btn primary big block" href="#/scan">
              ◉ 開始閱卷
            </a>
            <a className="btn big block" href={`#/sheet/${exam.id}`}>
              🖨 列印答案卡
            </a>
            <a className="btn big block" href={`#/results/${exam.id}`}>
              ▦ 成績與匯出
            </a>
            <a className="btn big block" href="#/exams">
              ☰ 切換／建立考試
            </a>
          </div>
        </div>
      )}

      <div className="card small muted">
        所有影像辨識與成績資料都只存在這台裝置的瀏覽器中，不會上傳。瀏覽器資料可能因清除快取或長期未使用被刪除，請定期到「設定」備份。
      </div>
    </>
  );
}
