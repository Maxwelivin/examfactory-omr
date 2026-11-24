import { DEFAULT_PARAMS, type OmrParams } from './omr/classify';

const K_PARAMS = 'omr.params';
const K_THEME = 'omr.theme';
const K_CURRENT = 'omr.currentExam';

export function loadParams(): OmrParams {
  try {
    return { ...DEFAULT_PARAMS, ...JSON.parse(localStorage.getItem(K_PARAMS) ?? '{}') };
  } catch {
    return { ...DEFAULT_PARAMS };
  }
}
export const saveParams = (p: OmrParams) => localStorage.setItem(K_PARAMS, JSON.stringify(p));

export type Theme = 'auto' | 'light' | 'dark';
export const loadTheme = (): Theme => (localStorage.getItem(K_THEME) as Theme) || 'auto';
export function applyTheme(t: Theme) {
  localStorage.setItem(K_THEME, t);
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

export const getCurrentExamId = () => localStorage.getItem(K_CURRENT);
export const setCurrentExamId = (id: string) => localStorage.setItem(K_CURRENT, id);
