/**
 * 答案卡配置 — 產生器（SVG）與辨識引擎共用的唯一資料規格。
 * 所有座標單位為 mm，原點在 A4 紙左上角，x 向右、y 向下。
 * 修改任何數字會同時改變列印與辨識；改完必須重跑 `npm test`，
 * 並把 LAYOUT_VERSION 加一（舊版答案卡將無法與新版引擎相容）。
 */

export const LAYOUT_VERSION = 1;

export const PAGE = { width: 210, height: 297 } as const;

export const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const;
export type OptionLetter = (typeof OPTION_LETTERS)[number];

export const MAX_QUESTIONS = 50;
export const QUESTION_COUNTS = [10, 20, 30, 40, 50] as const;

export interface Pt {
  x: number;
  y: number;
}

/** 四角定位標記：實心黑色正方形。中心點即透視轉換的對應點。 */
export const MARKER = {
  size: 8,
  centers: {
    tl: { x: 12, y: 12 },
    tr: { x: 198, y: 12 },
    br: { x: 198, y: 285 },
    bl: { x: 12, y: 285 },
  },
} as const;

/** 畫記圓圈半徑（mm）。 */
export const BUBBLE_R = 2.75;

/** 取樣半徑比例：只取圓圈內部 60%，避開印刷外框。 */
export const INNER_SAMPLE_RATIO = 0.6;

/** 答案區：5 欄 × 10 列，第 5、6 列之間多留空隙方便對行。 */
export const ANSWER_GRID = {
  columns: 5,
  rowsPerColumn: 10,
  colX0: 14,
  colPitch: 37,
  numberRightOffset: 8, // 題號文字右緣（相對欄起點）
  firstBubbleOffset: 13, // 第一個圓圈中心（相對欄起點）
  bubblePitch: 7,
  headerY: 84, // A B C D 欄頭
  firstRowY: 92,
  rowPitch: 10,
  groupGap: 5, // 第 5 列之後的額外間距
} as const;

/** 座號劃記：十位、個位兩列，各 0–9。 */
export const SEAT_GRID = {
  labelX: 18,
  x0: 46,
  pitch: 7.5,
  digitsY: 49.5, // 數字標示
  tensY: 55,
  onesY: 63,
} as const;

/** 考試識別碼條：1 個起始格（恆黑）+16 位資料 + 4 位 CRC + 1 個結束格（恆白）。 */
export const ID_STRIP = {
  x0: 22,
  y: 74,
  cell: 4,
  pitch: 6,
  dataBits: 16,
  crcBits: 4,
} as const;
export const ID_CELL_COUNT = 1 + ID_STRIP.dataBits + ID_STRIP.crcBits + 1;

/** 手寫欄位（只印框，不辨識；辨識後裁切成圖片供教師核對）。 */
export const WRITE_BOXES = {
  name: { x: 18, y: 26, w: 92, h: 14, label: '姓名' },
  seat: { x: 114, y: 26, w: 34, h: 14, label: '座號' },
  klass: { x: 152, y: 26, w: 40, h: 14, label: '班級' },
} as const;

/** 標準化影像解析度：透視校正後每 mm 幾個像素。 */
export const PX_PER_MM = 5;
export const WARP_W = PAGE.width * PX_PER_MM; // 1050
export const WARP_H = PAGE.height * PX_PER_MM; // 1485

export interface BubbleSpec {
  /** 題號（1 起算）或座號位數 */
  index: number;
  option: number;
  cx: number;
  cy: number;
  r: number;
}

export function questionRowY(row: number): number {
  const g = ANSWER_GRID;
  return g.firstRowY + row * g.rowPitch + (row >= 5 ? g.groupGap : 0);
}

export function questionColumnX(col: number): number {
  return ANSWER_GRID.colX0 + col * ANSWER_GRID.colPitch;
}

/** 第 q 題（1 起算）第 k 個選項的圓心。 */
export function bubbleCenter(q: number, k: number): Pt {
  if (q < 1 || q > MAX_QUESTIONS) throw new RangeError(`題號 ${q} 超出 1–${MAX_QUESTIONS}`);
  const i = q - 1;
  const col = Math.floor(i / ANSWER_GRID.rowsPerColumn);
  const row = i % ANSWER_GRID.rowsPerColumn;
  return {
    x: questionColumnX(col) + ANSWER_GRID.firstBubbleOffset + k * ANSWER_GRID.bubblePitch,
    y: questionRowY(row),
  };
}

export function questionBubbles(numQuestions: number): BubbleSpec[][] {
  const out: BubbleSpec[][] = [];
  for (let q = 1; q <= numQuestions; q++) {
    out.push(
      OPTION_LETTERS.map((_, k) => {
        const c = bubbleCenter(q, k);
        return { index: q, option: k, cx: c.x, cy: c.y, r: BUBBLE_R };
      }),
    );
  }
  return out;
}

export function seatBubbles(): { tens: BubbleSpec[]; ones: BubbleSpec[] } {
  const mk = (y: number, index: number) =>
    Array.from({ length: 10 }, (_, d) => ({
      index,
      option: d,
      cx: SEAT_GRID.x0 + d * SEAT_GRID.pitch,
      cy: y,
      r: BUBBLE_R,
    }));
  return { tens: mk(SEAT_GRID.tensY, 10), ones: mk(SEAT_GRID.onesY, 1) };
}

/** 識別碼第 i 格的中心。 */
export function idCellCenter(i: number): Pt {
  return { x: ID_STRIP.x0 + i * ID_STRIP.pitch + ID_STRIP.cell / 2, y: ID_STRIP.y + ID_STRIP.cell / 2 };
}
