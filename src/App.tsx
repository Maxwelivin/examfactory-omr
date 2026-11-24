import { useEffect, useState } from 'react';
import { warmup } from './omr/client';
import Dashboard from './pages/Dashboard';
import Exams from './pages/Exams';
import ExamEdit from './pages/ExamEdit';
import SheetPage from './pages/SheetPage';
import Scan from './pages/Scan';
import Results from './pages/Results';
import ScanDetail from './pages/ScanDetail';
import Settings from './pages/Settings';

export function navigate(path: string) {
  location.hash = path;
}

function useHashPath() {
  const get = () => location.hash.replace(/^#/, '') || '/';
  const [path, setPath] = useState(get);
  useEffect(() => {
    const on = () => {
      setPath(get());
      window.scrollTo(0, 0);
    };
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return path;
}

const NAV = [
  { to: '/', ico: '⌂', label: '首頁' },
  { to: '/exams', ico: '☰', label: '考試' },
  { to: '/scan', ico: '◉', label: '閱卷' },
  { to: '/results', ico: '▦', label: '成績' },
  { to: '/settings', ico: '⚙', label: '設定' },
];

export type CvState = 'loading' | 'ready' | 'error';

export default function App() {
  const path = useHashPath();
  const [cvState, setCvState] = useState<CvState>('loading');
  const [cvError, setCvError] = useState('');

  useEffect(() => {
    warmup()
      .then(() => setCvState('ready'))
      .catch((e) => {
        setCvState('error');
        setCvError(String(e?.message ?? e));
      });
  }, []);

  const seg = path.split('/').filter(Boolean);
  let page: JSX.Element;
  switch (seg[0]) {
    case undefined:
      page = <Dashboard cvState={cvState} />;
      break;
    case 'exams':
      page = seg[1] ? <ExamEdit id={seg[1]} /> : <Exams />;
      break;
    case 'sheet':
      page = <SheetPage id={seg[1]} />;
      break;
    case 'scan':
      page = <Scan cvState={cvState} />;
      break;
    case 'results':
      page = <Results examId={seg[1]} />;
      break;
    case 'record':
      page = <ScanDetail id={seg[1]} />;
      break;
    case 'settings':
      page = <Settings cvState={cvState} />;
      break;
    default:
      page = <p>找不到頁面。</p>;
  }
  const active = (to: string) => (to === '/' ? path === '/' : path.startsWith(to) || (to === '/exams' && path.startsWith('/sheet')));

  return (
    <div className="shell">
      <nav className="side no-print">
        <div className="brand" style={{ padding: '4px 12px 14px' }}>
          ExamFactory<small>OMR</small>
        </div>
        {NAV.map((n) => (
          <a key={n.to} href={'#' + n.to} className={active(n.to) ? 'active' : ''}>
            <span className="ico">{n.ico}</span>
            {n.label}
          </a>
        ))}
      </nav>
      <main className="main">
        {cvState === 'error' && (
          <div className="notice bad no-print">辨識模組載入失敗：{cvError}。請重新整理；若持續失敗，請確認瀏覽器支援 WebAssembly。</div>
        )}
        {page}
      </main>
      <nav className="tabbar no-print">
        {NAV.map((n) => (
          <a key={n.to} href={'#' + n.to} className={active(n.to) ? 'active' : ''}>
            <span className="ico">{n.ico}</span>
            {n.label}
          </a>
        ))}
      </nav>
    </div>
  );
}
