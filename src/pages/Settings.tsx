import { useEffect, useRef, useState } from 'react';
import type { CvState } from '../App';
import { exportBackup, importBackup, requestPersist, type BackupFile } from '../db';
import { download } from '../image';
import { DEFAULT_PARAMS, type OmrParams } from '../omr/classify';
import { applyTheme, loadParams, loadTheme, saveParams, type Theme } from '../settings';

const PARAM_INFO: { key: keyof OmrParams; label: string; help: string; min: number; max: number; step: number }[] = [
  { key: 'markThreshold', label: '塗黑門檻', help: '畫記程度達到此值才算「有塗」。學生普遍塗得淡時可略降。', min: 0.15, max: 0.6, step: 0.01 },
  { key: 'blankThreshold', label: '空白門檻', help: '低於此值算空白；介於兩門檻之間為「待確認」。', min: 0.04, max: 0.25, step: 0.01 },
  { key: 'dominanceRatio', label: '擦除容許比例', help: '第二深的選項 ≤ 最深 × 此比例，視為擦除殘影並採最深者。', min: 0.2, max: 0.8, step: 0.05 },
  { key: 'multiRatio', label: '複選判定比例', help: '兩個選項都達塗黑門檻，且第二深 ≥ 最深 × 此比例 → 複選。', min: 0.3, max: 0.95, step: 0.05 },
];

export default function Settings({ cvState }: { cvState: CvState }) {
  const [params, setParams] = useState<OmrParams>(loadParams);
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const [persist, setPersist] = useState<boolean | null>(null);
  const [usage, setUsage] = useState('');
  const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersist);
    navigator.storage?.estimate?.().then((e) => setUsage(`${((e.usage ?? 0) / 1048576).toFixed(1)} MB`));
  }, []);

  const set = (p: OmrParams) => {
    setParams(p);
    saveParams(p);
  };

  return (
    <>
      <h1>設定</h1>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>外觀</h2>
        <div className="row">
          {(['auto', 'light', 'dark'] as Theme[]).map((t) => (
            <button
              key={t}
              className={`btn ${theme === t ? 'primary' : ''}`}
              onClick={() => {
                setTheme(t);
                applyTheme(t);
              }}
            >
              {{ auto: '跟隨系統', light: '淺色', dark: '深色' }[t]}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>辨識閾值</h2>
        <p className="small muted" style={{ marginTop: 0 }}>
          畫記程度＝圓圈內部平均暗度扣除該張紙的空白基線（0＝白、1＝全黑）。在批改畫面勾選「顯示畫記分數」可看到每個圓圈的數值（×100），用來校準。修改只影響之後的掃描。
        </p>
        {PARAM_INFO.map((p) => (
          <label className="field" key={p.key}>
            <span>
              {p.label}：<b>{params[p.key]}</b>（預設 {DEFAULT_PARAMS[p.key]}）
            </span>
            <input type="range" min={p.min} max={p.max} step={p.step} value={params[p.key]} onChange={(e) => set({ ...params, [p.key]: +e.target.value })} style={{ width: '100%' }} />
            <div className="small muted">{p.help}</div>
          </label>
        ))}
        {params.blankThreshold >= params.markThreshold && <div className="notice bad small">空白門檻必須小於塗黑門檻。</div>}
        <button className="btn" onClick={() => set({ ...DEFAULT_PARAMS })}>
          恢復預設
        </button>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>資料備份與還原</h2>
        <p className="small muted" style={{ marginTop: 0 }}>
          資料只存在本機瀏覽器（目前使用 {usage || '—'}）。清除瀏覽器資料、iOS 長期未開啟網站，都可能讓資料消失；請定期備份並保存到雲端硬碟或電腦。
        </p>
        <div className="small" style={{ marginBottom: 10 }}>
          永久儲存：{persist === null ? '此瀏覽器不支援' : persist ? <span className="badge ok">已啟用</span> : <span className="badge warn">未啟用</span>}{' '}
          {!persist && persist !== null && (
            <button className="btn" onClick={async () => setPersist(await requestPersist())}>
              要求啟用
            </button>
          )}
        </div>
        <div className="row">
          <button
            className="btn primary"
            onClick={async () => {
              const data = await exportBackup(true);
              download(`OMR備份_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data), 'application/json');
              setMsg(`已備份 ${data.exams.length} 份考試、${data.scans.length} 筆成績（含影像）`);
            }}
          >
            備份（含影像）
          </button>
          <button
            className="btn"
            onClick={async () => {
              const data = await exportBackup(false);
              download(`OMR備份_無影像_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data), 'application/json');
              setMsg(`已備份 ${data.exams.length} 份考試、${data.scans.length} 筆成績（不含影像）`);
            }}
          >
            備份（不含影像，檔案較小）
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            從備份還原
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                const data = JSON.parse(await f.text()) as BackupFile;
                if (!confirm(`還原 ${data.exams?.length ?? 0} 份考試、${data.scans?.length ?? 0} 筆成績？相同 ID 的資料會被備份檔覆蓋，其他資料保留。`)) return;
                const r = await importBackup(data);
                setMsg(`還原完成：${r.exams} 份考試、${r.scans} 筆成績`);
              } catch (err) {
                setMsg(`還原失敗：${err instanceof Error ? err.message : err}`);
              }
            }}
          />
        </div>
        {msg && <div className="notice small">{msg}</div>}
      </div>

      <div className="card small muted">
        <h2 style={{ marginTop: 0, color: 'var(--text)' }}>關於</h2>
        ExamFactory OMR v0.1（Phase 1）· 辨識模組：{cvState === 'ready' ? 'OpenCV.js 已載入' : cvState === 'loading' ? '載入中' : '載入失敗'} · 所有運算在本機完成，不上傳影像與成績。
      </div>
    </>
  );
}
