import { useMemo, useState } from 'react';
import { useExam } from '../hooks';
import { download } from '../image';
import { sheetSvg } from '../sheet/svg';

export default function SheetPage({ id }: { id: string }) {
  const [exam] = useExam(id);
  const [copies, setCopies] = useState(1);
  const [preSeat, setPreSeat] = useState(false);

  const pages = useMemo(() => {
    if (!exam) return [];
    const base = { examName: exam.name, examCode: exam.code, numQuestions: exam.numQuestions };
    if (!preSeat) return [sheetSvg(base)];
    return Array.from({ length: copies }, (_, i) => sheetSvg({ ...base, seat: i + 1 }));
  }, [exam, copies, preSeat]);

  if (!exam) return <p className="muted">載入中…</p>;
  const printPages = preSeat ? pages : Array(copies).fill(pages[0]);

  return (
    <>
      <div className="no-print">
        <h1>答案卡</h1>
        <div className="card">
          <div className="muted small" style={{ marginBottom: 10 }}>
            {exam.name} · {exam.numQuestions} 題 · 識別碼 {exam.code}
          </div>
          <div className="row">
            <label className="row small">
              份數
              <input type="number" min={1} max={60} value={copies} style={{ width: 90 }} onChange={(e) => setCopies(Math.max(1, Math.min(60, +e.target.value || 1)))} />
            </label>
            <label className="row small">
              <input type="checkbox" checked={preSeat} onChange={(e) => setPreSeat(e.target.checked)} />
              預印座號 1–{copies}（學生不必劃記座號）
            </label>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn primary big" onClick={() => window.print()}>
              🖨 列印／另存 PDF
            </button>
            <button className="btn" onClick={() => download(`答案卡_${exam.name}_${exam.code}.svg`, pages[0], 'image/svg+xml')}>
              下載 SVG
            </button>
          </div>
          <div className="notice small">
            列印時請選 <b>A4、直向、邊界「無」、縮放 100%（實際大小）</b>，並關閉「頁首頁尾」。若印表機自動縮小也沒關係：系統以四角定位點校正，等比例縮放不影響辨識，但四角黑塊不可被裁掉。要存成 PDF，在列印對話框選「另存為 PDF」。
          </div>
        </div>
        <div className="sheet-preview" dangerouslySetInnerHTML={{ __html: pages[0] }} />
      </div>
      <div className="print-only">
        {printPages.map((svg, i) => (
          <div className="print-page" key={i} dangerouslySetInnerHTML={{ __html: svg }} />
        ))}
      </div>
    </>
  );
}
