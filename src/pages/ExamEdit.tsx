import { useEffect, useState } from 'react';
import { navigate } from '../App';
import { deleteExam, listScans, putExam, putScan } from '../db';
import { evenPoints } from '../grading';
import { useExam } from '../hooks';
import { OPTION_LETTERS, type OptionLetter } from '../omr/layout';
import { regrade } from '../record';
import type { Exam } from '../types';

export default function ExamEdit({ id }: { id: string }) {
  const [loaded] = useExam(id);
  const [exam, setExam] = useState<Exam>();
  const [quick, setQuick] = useState('');
  const [saved, setSaved] = useState('');

  useEffect(() => {
    if (loaded) {
      setExam(loaded);
      setQuick(loaded.key.map((k) => k ?? '-').join(''));
    }
  }, [loaded]);
  if (!exam) return <p className="muted">載入中…</p>;

  const n = exam.numQuestions;
  const total = exam.points.slice(0, n).reduce((a, b) => a + b, 0);
  const update = (patch: Partial<Exam>) => {
    setExam({ ...exam, ...patch });
    setSaved('');
  };
  const setKey = (i: number, L: OptionLetter) => {
    const key = [...exam.key];
    key[i] = key[i] === L ? null : L;
    update({ key });
    setQuick(key.map((k) => k ?? '-').join(''));
  };
  const applyQuick = (s: string) => {
    setQuick(s);
    const letters = s.toUpperCase().replace(/[^ABCD\-_.]/g, '');
    const key = Array.from({ length: n }, (_, i) => {
      const c = letters[i];
      return c && 'ABCD'.includes(c) ? (c as OptionLetter) : null;
    });
    update({ key });
  };

  async function save() {
    const e = { ...exam!, updatedAt: Date.now() };
    await putExam(e);
    // 答案或配分修改後，重新計算已掃描的成績
    const scans = await listScans(e.id);
    for (const s of scans) await putScan(regrade(s, e));
    setSaved(`已儲存${scans.length ? `，並重新計算 ${scans.length} 份成績` : ''}`);
  }

  return (
    <>
      <div className="topbar">
        <h1 style={{ margin: 0 }}>答案與配分</h1>
        <span className="spacer" />
        <a className="btn" href={`#/sheet/${exam.id}`}>
          答案卡
        </a>
      </div>
      <div className="card">
        <label className="field">
          <span>考試名稱</span>
          <input type="text" value={exam.name} onChange={(e) => update({ name: e.target.value })} />
        </label>
        <div className="muted small">
          {n} 題 · 識別碼 {exam.code}（印在答案卡上，辨識時用來確認是否為同一份考試）
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>快速輸入</h2>
        <p className="muted small" style={{ marginTop: 0 }}>
          依序輸入 {n} 個字母，例如 <code>ABCDDCBA…</code>，未定的題目用 <code>-</code>。也可以在下方逐題點選。
        </p>
        <input type="text" value={quick} onChange={(e) => applyQuick(e.target.value)} autoCapitalize="characters" spellCheck={false} />
        <div className="small muted" style={{ marginTop: 6 }}>
          已設定 {exam.key.filter(Boolean).length} / {n} 題
        </div>
      </div>

      <div className="card">
        <div className="row" style={{ marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>標準答案</h2>
          <span className="spacer" />
          <span className={`badge ${Math.abs(total - 100) < 0.01 ? 'ok' : 'warn'}`}>總分 {+total.toFixed(2)}</span>
          <button className="btn" onClick={() => update({ points: evenPoints(n) })}>
            平均配分（總分 100）
          </button>
        </div>
        <div className="keygrid">
          {Array.from({ length: n }, (_, i) => (
            <div className="keyrow" key={i}>
              <span className="qn">{i + 1}</span>
              {OPTION_LETTERS.map((L) => (
                <button key={L} className={`opt ${exam.key[i] === L ? 'on' : ''}`} onClick={() => setKey(i, L)} aria-label={`第${i + 1}題 ${L}`}>
                  {L}
                </button>
              ))}
              <input
                className="pts"
                type="number"
                min={0}
                step={0.5}
                value={exam.points[i]}
                aria-label={`第${i + 1}題配分`}
                onChange={(e) => {
                  const points = [...exam.points];
                  points[i] = Math.max(0, Number(e.target.value) || 0);
                  update({ points });
                }}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="sticky-actions row">
        <button className="btn primary big" onClick={save}>
          儲存
        </button>
        {saved && <span className="badge ok">{saved}</span>}
        <span className="spacer" />
        <button
          className="btn danger"
          onClick={async () => {
            if (!confirm(`刪除「${exam.name}」以及它的所有掃描成績？此動作無法復原。`)) return;
            await deleteExam(exam.id);
            navigate('/exams');
          }}
        >
          刪除考試
        </button>
      </div>
    </>
  );
}
