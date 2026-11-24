import { navigate } from '../App';
import { buildCsv } from '../csv';
import { useCurrentExam, useExam, useExams, useScans } from '../hooks';
import { download } from '../image';
import { setCurrentExamId } from '../settings';

export default function Results({ examId }: { examId?: string }) {
  const [current] = useCurrentExam();
  const [byId] = useExam(examId);
  const exam = examId ? byId : current;
  const [exams] = useExams();
  const [scans] = useScans(exam?.id);

  if (!exam) return <p className="muted">{exams?.length === 0 ? '還沒有考試。' : '載入中…'}</p>;
  const list = [...(scans ?? [])].sort((a, b) => (a.seat ?? 999) - (b.seat ?? 999) || a.createdAt - b.createdAt);
  const n = list.length;
  const scores = list.map((s) => s.grade.score);
  const avg = n ? scores.reduce((a, b) => a + b, 0) / n : 0;
  const pending = list.filter((s) => !s.grade.complete || s.seat === null).length;
  const seatCounts = new Map<number, number>();
  for (const s of list) if (s.seat !== null) seatCounts.set(s.seat, (seatCounts.get(s.seat) ?? 0) + 1);

  // 逐題答對率
  const rate = Array.from({ length: exam.numQuestions }, (_, i) =>
    n ? list.filter((s) => s.grade.statuses[i] === 'correct').length / n : 0,
  );

  const stamp = new Date().toISOString().slice(0, 10);

  return (
    <>
      <div className="topbar">
        <h1 style={{ margin: 0 }}>成績</h1>
        <span className="spacer" />
        <select
          value={exam.id}
          style={{ width: 'auto', maxWidth: 260 }}
          onChange={(e) => {
            setCurrentExamId(e.target.value);
            navigate(`/results/${e.target.value}`);
          }}
        >
          {exams?.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </div>
      <div className="card">
        <div className="stats">
          <div className="stat">
            <b>{n}</b>
            <span>份</span>
          </div>
          <div className="stat">
            <b>{n ? avg.toFixed(1) : '—'}</b>
            <span>平均</span>
          </div>
          <div className="stat">
            <b>{n ? Math.max(...scores) : '—'}</b>
            <span>最高</span>
          </div>
          <div className="stat">
            <b>{n ? Math.min(...scores) : '—'}</b>
            <span>最低</span>
          </div>
          <div className="stat">
            <b style={{ color: pending ? 'var(--warn)' : undefined }}>{pending}</b>
            <span>待確認</span>
          </div>
        </div>
        {pending > 0 && <div className="notice warn small">有 {pending} 份含待確認題目或缺座號，匯出前請先點進去處理；這些分數目前不含待確認題。</div>}
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn primary" disabled={!n} onClick={() => download(`成績_${exam.name}_${stamp}.csv`, buildCsv(exam, list), 'text/csv;charset=utf-8')}>
            ⬇ 匯出 CSV
          </button>
          <a className="btn" href="#/scan">
            繼續閱卷
          </a>
        </div>
      </div>

      <div className="card">
        <div className="tablewrap">
          <table className="list">
            <thead>
              <tr>
                <th>座號</th>
                <th>姓名</th>
                <th>分數</th>
                <th>對／錯／空</th>
                <th>狀態</th>
                <th>時間</th>
              </tr>
            </thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id} className="click" onClick={() => navigate(`/record/${s.id}`)}>
                  <td>
                    {s.seat ?? <span className="badge warn">未填</span>}
                    {s.seat !== null && (seatCounts.get(s.seat) ?? 0) > 1 && <span className="badge bad"> 重複</span>}
                  </td>
                  <td>{s.studentName}</td>
                  <td>
                    <b>{s.grade.score}</b>
                  </td>
                  <td className="small">
                    {s.grade.correct}／{s.grade.wrong}／{s.grade.blank}
                  </td>
                  <td>
                    {s.grade.complete ? <span className="badge ok">完成</span> : <span className="badge warn">待確認 {s.grade.review}</span>}
                    {s.edits.length > 0 && <span className="badge"> 修正 {s.edits.length}</span>}
                  </td>
                  <td className="small muted">{new Date(s.createdAt).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!n && <p className="muted">尚無成績。</p>}
        </div>
      </div>

      {n > 0 && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>逐題答對率</h2>
          <div className="keygrid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
            {rate.map((r, i) => (
              <div key={i} className="row small" style={{ flexWrap: 'nowrap' }}>
                <span style={{ width: '2.4em', textAlign: 'right', fontWeight: 700 }}>{i + 1}</span>
                <div style={{ flex: 1, height: 10, background: 'var(--surface-2)', borderRadius: 5, overflow: 'hidden' }}>
                  <div style={{ width: `${r * 100}%`, height: '100%', background: r < 0.4 ? 'var(--bad)' : r < 0.7 ? 'var(--warn)' : 'var(--ok)' }} />
                </div>
                <span style={{ width: '3em', textAlign: 'right' }}>{Math.round(r * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
