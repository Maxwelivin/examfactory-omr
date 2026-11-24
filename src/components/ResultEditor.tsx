import { useMemo, useState } from 'react';
import { bubbleCenter, BUBBLE_R, OPTION_LETTERS, PAGE } from '../omr/layout';
import { ANSWER_TEXT, setAnswer, setSeat } from '../record';
import type { AnswerValue, Exam, QStatus, ScanRecord } from '../types';

const STATUS_TEXT: Record<QStatus, string> = { correct: '對', wrong: '錯', blank: '空白', multi: '複選', review: '待確認', nokey: '未設答案' };
const VALUES: AnswerValue[] = ['A', 'B', 'C', 'D', 'BLANK', 'MULTI'];

interface Props {
  exam: Exam;
  record: ScanRecord;
  imageUrl?: string;
  nameUrl?: string;
  onChange: (r: ScanRecord) => void;
}

export default function ResultEditor({ exam, record, imageUrl, nameUrl, onChange }: Props) {
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [showScores, setShowScores] = useState(false);
  const g = record.grade;

  const overlay = useMemo(
    () =>
      record.answers.map((a, i) => {
        const st = g.statuses[i];
        const keyIdx = exam.key[i] ? OPTION_LETTERS.indexOf(exam.key[i]!) : -1;
        return OPTION_LETTERS.map((L, k) => {
          const c = bubbleCenter(a.q, k);
          const chosen = a.final === L;
          let stroke = 'none';
          if (st === 'review' && a.scores[k] >= 0.08) stroke = '#e08a00';
          else if (chosen) stroke = st === 'correct' ? '#169c55' : '#d6332b';
          else if ((st === 'multi' || a.final === 'MULTI') && a.scores[k] >= 0.25) stroke = '#d6332b';
          return (
            <g key={`${a.q}-${k}`}>
              {stroke !== 'none' && <circle cx={c.x} cy={c.y} r={BUBBLE_R + 0.9} fill="none" stroke={stroke} strokeWidth={0.9} />}
              {k === keyIdx && st !== 'correct' && (
                <circle cx={c.x} cy={c.y} r={BUBBLE_R + 1.9} fill="none" stroke="#169c55" strokeWidth={0.5} strokeDasharray="1 0.8" />
              )}
              {showScores && (
                <text x={c.x} y={c.y - BUBBLE_R - 0.6} fontSize={1.9} textAnchor="middle" fill="#2457d6">
                  {Math.round(a.scores[k] * 100)}
                </text>
              )}
            </g>
          );
        });
      }),
    [record, exam, showScores, g.statuses],
  );

  const rows = record.answers.filter((_, i) => !onlyIssues || ['review', 'wrong', 'multi', 'blank'].includes(g.statuses[i]));

  return (
    <>
      <div className="card">
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div>
            <div className="muted small">{exam.name}</div>
            <div className="score-big">
              {g.score}
              <span className="muted" style={{ fontSize: '1rem', fontWeight: 600 }}>
                {' '}
                / {g.maxScore}
              </span>
            </div>
          </div>
          <span className="spacer" />
          {g.maxScore === 0 ? (
            <span className="badge warn">尚未設定標準答案</span>
          ) : g.complete ? (
            <span className="badge ok">批改完成</span>
          ) : (
            <span className="badge warn">{g.review} 題待確認，分數暫不含這些題</span>
          )}
        </div>
        <div className="stats" style={{ marginTop: 12 }}>
          <div className="stat">
            <b style={{ color: 'var(--ok)' }}>{g.correct}</b>
            <span>答對</span>
          </div>
          <div className="stat">
            <b style={{ color: 'var(--bad)' }}>{g.wrong}</b>
            <span>答錯{g.multi ? `（含複選 ${g.multi}）` : ''}</span>
          </div>
          <div className="stat">
            <b>{g.blank}</b>
            <span>空白</span>
          </div>
          <div className="stat">
            <b style={{ color: g.review ? 'var(--warn)' : undefined }}>{g.review}</b>
            <span>待確認</span>
          </div>
        </div>
        {record.warnings.map((w, i) => (
          <div key={i} className="notice warn small">
            {w}
          </div>
        ))}
      </div>

      <div className="grid2">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>學生</h2>
          <label className="field">
            <span>座號 {record.seatSource === 'omr' ? '（由劃記辨識）' : record.seatSource === 'manual' ? '（手動輸入）' : ''}</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={99}
              value={record.seat ?? ''}
              placeholder="請輸入座號"
              onChange={(e) => onChange(setSeat(record, e.target.value ? Math.max(1, Math.min(99, Math.trunc(+e.target.value))) : null))}
              style={record.seat === null ? { borderColor: 'var(--warn)' } : undefined}
            />
          </label>
          <label className="field">
            <span>姓名（選填）</span>
            <input type="text" value={record.studentName} onChange={(e) => onChange({ ...record, studentName: e.target.value })} />
          </label>
          {nameUrl && (
            <>
              <div className="muted small">答案卡上的姓名欄：</div>
              <img className="nameimg" src={nameUrl} alt="姓名欄" />
            </>
          )}
        </div>
        <div className="card">
          <div className="row" style={{ marginBottom: 8 }}>
            <h2 style={{ margin: 0 }}>校正後影像</h2>
            <span className="spacer" />
            <label className="small row">
              <input type="checkbox" checked={showScores} onChange={(e) => setShowScores(e.target.checked)} />
              顯示畫記分數
            </label>
          </div>
          {imageUrl ? (
            <div className="sheetview">
              <img src={imageUrl} alt="校正後答案卡" />
              <svg viewBox={`0 0 ${PAGE.width} ${PAGE.height}`}>{overlay}</svg>
            </div>
          ) : (
            <p className="muted">沒有影像</p>
          )}
          <div className="small muted" style={{ marginTop: 6 }}>
            綠框＝答對、紅框＝答錯／複選、橘框＝待確認、綠虛線＝正確答案。請對照影像核對。
          </div>
        </div>
      </div>

      <div className="card">
        <div className="row" style={{ marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>逐題結果</h2>
          <span className="spacer" />
          <label className="small row">
            <input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} />
            只看非答對
          </label>
        </div>
        <div className="answers">
          {rows.map((a) => {
            const i = a.q - 1;
            const st = g.statuses[i];
            return (
              <div key={a.q} className={`ans ${st}`} title={a.note ?? ''}>
                <span className="qn">{a.q}</span>
                <span className="key">
                  答 {exam.key[i] ?? '—'}
                  <br />
                  <span style={{ color: st === 'correct' ? 'var(--ok)' : st === 'review' ? 'var(--warn)' : st === 'nokey' ? undefined : 'var(--bad)' }}>
                    {STATUS_TEXT[st]}
                  </span>
                </span>
                {VALUES.map((v) => (
                  <button
                    key={v}
                    className={`chip ${a.final === v ? 'on' : ''} ${exam.key[i] === v ? 'key' : ''}`}
                    onClick={() => onChange(setAnswer(record, exam, a.q, v))}
                    aria-label={`第${a.q}題改為${ANSWER_TEXT[v]}`}
                  >
                    {v === 'BLANK' ? '空' : v === 'MULTI' ? '複' : v}
                  </button>
                ))}
                {a.edited && <span className="badge">已改</span>}
              </div>
            );
          })}
        </div>
        {rows.some((a) => a.note) && (
          <div className="small muted" style={{ marginTop: 8 }}>
            {rows
              .filter((a) => a.note)
              .map((a) => (
                <div key={a.q}>
                  第 {a.q} 題：{a.note}
                </div>
              ))}
          </div>
        )}
      </div>
    </>
  );
}
