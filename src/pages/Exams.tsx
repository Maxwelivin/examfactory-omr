import { useState } from 'react';
import { navigate } from '../App';
import { putExam, uid } from '../db';
import { evenPoints } from '../grading';
import { keyComplete, useExams } from '../hooks';
import { randomExamCode } from '../omr/idcode';
import { QUESTION_COUNTS } from '../omr/layout';
import { getCurrentExamId, setCurrentExamId } from '../settings';
import type { Exam } from '../types';

export default function Exams() {
  const [exams, reload] = useExams();
  const [name, setName] = useState('');
  const [n, setN] = useState<number>(20);
  const current = getCurrentExamId() ?? exams?.[0]?.id;

  async function create() {
    const now = Date.now();
    const exam: Exam = {
      id: uid(),
      code: randomExamCode(exams?.map((e) => e.code)),
      name: name.trim() || `考試 ${new Date().toLocaleDateString('zh-TW')}`,
      numQuestions: n,
      key: Array(n).fill(null),
      points: evenPoints(n),
      createdAt: now,
      updatedAt: now,
    };
    await putExam(exam);
    setCurrentExamId(exam.id);
    navigate(`/exams/${exam.id}`);
  }

  return (
    <>
      <h1>考試</h1>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>建立新考試</h2>
        <label className="field">
          <span>考試名稱</span>
          <input type="text" value={name} placeholder="例：八年級 第二次段考 理化" onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="field">
          <span className="muted small">題數（單選題，A–D 四個選項）</span>
          <div className="row" style={{ marginTop: 4 }}>
            {QUESTION_COUNTS.map((c) => (
              <button key={c} className={`btn ${n === c ? 'primary' : ''}`} onClick={() => setN(c)}>
                {c} 題
              </button>
            ))}
          </div>
        </div>
        <button className="btn primary big" onClick={create}>
          建立並設定答案
        </button>
      </div>

      <h2>已建立的考試</h2>
      {!exams?.length && <p className="muted">還沒有考試。</p>}
      {exams?.map((e) => (
        <div className="card" key={e.id}>
          <div className="row">
            <div>
              <div style={{ fontWeight: 800 }}>
                {e.name} {e.id === current && <span className="badge ok">使用中</span>}
              </div>
              <div className="muted small">
                {e.numQuestions} 題 · 識別碼 {e.code} · {keyComplete(e) ? '答案已設定' : <span style={{ color: 'var(--warn)' }}>答案未完成</span>}
              </div>
            </div>
            <span className="spacer" />
            {e.id !== current && (
              <button
                className="btn"
                onClick={() => {
                  setCurrentExamId(e.id);
                  reload();
                }}
              >
                設為使用中
              </button>
            )}
            <a className="btn" href={`#/exams/${e.id}`}>
              答案與配分
            </a>
            <a className="btn" href={`#/sheet/${e.id}`}>
              答案卡
            </a>
            <a className="btn" href={`#/results/${e.id}`}>
              成績
            </a>
          </div>
        </div>
      ))}
    </>
  );
}
