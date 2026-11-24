import { existsSync, readFileSync } from 'node:fs';
import { DEFAULT_PARAMS, type OmrParams } from '../../src/omr/classify';

export interface RealCase {
  /** photos/ 底下的檔名 */
  image: string;
  numQuestions: number;
  /** 人工核對的正確畫記：A–D、- 空白、M 複選、? 人工也無法確定（不計分） */
  expected: string;
  seat?: number;
  examCode?: number;
  /** 情境標籤，例如 正常、傾斜、陰影、淡色、擦除、模糊、出框、反光、日光燈、黃光 */
  conditions?: string[];
  /** 這張本來就該被拒收（例如刻意拍糊、出框） */
  expectReject?: boolean;
  /** 拍攝裝置與備註 */
  device?: string;
  notes?: string;
}

export function loadParamsFromFile(url: URL): OmrParams {
  if (!existsSync(url)) return { ...DEFAULT_PARAMS };
  return { ...DEFAULT_PARAMS, ...JSON.parse(readFileSync(url, 'utf8')) };
}
