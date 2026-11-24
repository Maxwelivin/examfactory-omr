/**
 * 由 layout.ts 產生 A4 答案卡 SVG 字串（單位 mm）。
 * 瀏覽器列印與 Node 合成測試共用此函式，保證「印出來的」＝「辨識假設的」。
 */
import { encodeExamCode } from '../omr/idcode';
import {
  ANSWER_GRID,
  BUBBLE_R,
  ID_CELL_COUNT,
  ID_STRIP,
  LAYOUT_VERSION,
  MARKER,
  OPTION_LETTERS,
  PAGE,
  SEAT_GRID,
  WRITE_BOXES,
  bubbleCenter,
  idCellCenter,
  questionColumnX,
  seatBubbles,
} from '../omr/layout';

export interface SheetInfo {
  examName: string;
  examCode: number;
  numQuestions: number;
  /** 預印座號（選用，多份列印時使用） */
  seat?: number;
}

const FONT = "'Microsoft JhengHei','PingFang TC','Noto Sans TC','Heiti TC',sans-serif";
const INK = '#000';
const LINE = '#444';

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const f = (n: number) => +n.toFixed(3);

function text(x: number, y: number, s: string, size: number, opts: { anchor?: string; weight?: number; fill?: string } = {}) {
  return `<text x="${f(x)}" y="${f(y)}" font-size="${size}" text-anchor="${opts.anchor ?? 'start'}" font-weight="${opts.weight ?? 400}" fill="${opts.fill ?? INK}">${esc(s)}</text>`;
}

function bubble(cx: number, cy: number) {
  return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${BUBBLE_R}" fill="none" stroke="${LINE}" stroke-width="0.3"/>`;
}

export function sheetSvg(info: SheetInfo): string {
  const p: string[] = [];
  p.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE.width}mm" height="${PAGE.height}mm" viewBox="0 0 ${PAGE.width} ${PAGE.height}" font-family="${FONT}">`,
  );
  p.push(`<rect x="0" y="0" width="${PAGE.width}" height="${PAGE.height}" fill="#fff"/>`);

  // 定位標記
  for (const c of Object.values(MARKER.centers)) {
    const h = MARKER.size / 2;
    p.push(`<rect x="${c.x - h}" y="${c.y - h}" width="${MARKER.size}" height="${MARKER.size}" fill="${INK}"/>`);
  }

  // 標題
  p.push(text(105, 15, info.examName || '未命名考試', 5.2, { anchor: 'middle', weight: 700 }));
  p.push(text(105, 21, `答案卡　共 ${info.numQuestions} 題　·　限用 2B 鉛筆塗滿圓圈`, 3, { anchor: 'middle', fill: '#333' }));

  // 手寫欄
  for (const b of Object.values(WRITE_BOXES)) {
    p.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="none" stroke="${LINE}" stroke-width="0.35" rx="1"/>`);
    p.push(text(b.x + 1.8, b.y + 4.2, b.label, 2.8, { fill: '#333' }));
  }
  if (info.seat) p.push(text(WRITE_BOXES.seat.x + WRITE_BOXES.seat.w / 2, WRITE_BOXES.seat.y + 11, String(info.seat), 7, { anchor: 'middle', weight: 700 }));

  // 座號劃記
  const seats = seatBubbles();
  p.push(text(SEAT_GRID.labelX, SEAT_GRID.digitsY, '座號劃記', 3, { weight: 700 }));
  p.push(text(SEAT_GRID.labelX, SEAT_GRID.tensY + 1.1, '十位', 3));
  p.push(text(SEAT_GRID.labelX, SEAT_GRID.onesY + 1.1, '個位', 3));
  for (let d = 0; d < 10; d++) p.push(text(SEAT_GRID.x0 + d * SEAT_GRID.pitch, SEAT_GRID.digitsY, String(d), 3, { anchor: 'middle' }));
  for (const b of [...seats.tens, ...seats.ones]) p.push(bubble(b.cx, b.cy));
  if (info.seat) {
    // 預印座號：直接塗黑對應圓圈
    const t = Math.floor(info.seat / 10);
    const o = info.seat % 10;
    if (t > 0) p.push(`<circle cx="${seats.tens[t].cx}" cy="${seats.tens[t].cy}" r="${BUBBLE_R}" fill="${INK}"/>`);
    p.push(`<circle cx="${seats.ones[o].cx}" cy="${seats.ones[o].cy}" r="${BUBBLE_R}" fill="${INK}"/>`);
  }

  // 說明（右側）
  const ix = 128;
  p.push(text(ix, 48, '作答說明', 3, { weight: 700 }));
  p.push(text(ix, 53, '1. 用 2B 鉛筆將圓圈完全塗滿。', 2.7));
  p.push(text(ix, 57.5, '2. 修改時請用橡皮擦擦乾淨。', 2.7));
  p.push(text(ix, 62, '3. 不要摺疊，不要在四角黑塊附近塗寫。', 2.7));
  p.push(text(ix, 67, '正確：', 2.7));
  p.push(`<circle cx="${ix + 10}" cy="66" r="${BUBBLE_R * 0.7}" fill="${INK}"/>`);
  p.push(text(ix + 17, 67, '錯誤：', 2.7));
  p.push(`<circle cx="${ix + 27}" cy="66" r="${BUBBLE_R * 0.7}" fill="none" stroke="${LINE}" stroke-width="0.3"/>`);
  p.push(`<path d="M${ix + 25.3} 66 l1.2 1.3 l2.4 -2.8" fill="none" stroke="${INK}" stroke-width="0.4"/>`);
  p.push(`<circle cx="${ix + 33}" cy="66" r="${BUBBLE_R * 0.7}" fill="none" stroke="${LINE}" stroke-width="0.3"/>`);
  p.push(`<path d="M${ix + 31.6} 64.6 l2.8 2.8 M${ix + 34.4} 64.6 l-2.8 2.8" stroke="${INK}" stroke-width="0.4"/>`);

  // 考試識別碼條
  const bits = encodeExamCode(info.examCode);
  for (let i = 0; i < ID_CELL_COUNT; i++) {
    const c = idCellCenter(i);
    const h = ID_STRIP.cell / 2;
    p.push(
      bits[i]
        ? `<rect x="${f(c.x - h)}" y="${f(c.y - h)}" width="${ID_STRIP.cell}" height="${ID_STRIP.cell}" fill="${INK}"/>`
        : `<rect x="${f(c.x - h)}" y="${f(c.y - h)}" width="${ID_STRIP.cell}" height="${ID_STRIP.cell}" fill="none" stroke="#999" stroke-width="0.2"/>`,
    );
  }
  const stripEnd = idCellCenter(ID_CELL_COUNT - 1).x + ID_STRIP.cell / 2;
  p.push(text(stripEnd + 4, ID_STRIP.y + 3.2, `考試識別碼 ${info.examCode}　版型 v${LAYOUT_VERSION}`, 2.6, { fill: '#333' }));

  // 答案區
  const g = ANSWER_GRID;
  const usedCols = Math.ceil(info.numQuestions / g.rowsPerColumn);
  for (let c = 0; c < usedCols; c++) {
    const x0 = questionColumnX(c);
    OPTION_LETTERS.forEach((L, k) =>
      p.push(text(x0 + g.firstBubbleOffset + k * g.bubblePitch, g.headerY, L, 3.2, { anchor: 'middle', weight: 700 })),
    );
  }
  for (let q = 1; q <= info.numQuestions; q++) {
    const c0 = bubbleCenter(q, 0);
    const col = Math.floor((q - 1) / g.rowsPerColumn);
    p.push(text(questionColumnX(col) + g.numberRightOffset, c0.y + 1.15, String(q), 3.2, { anchor: 'end', weight: 700 }));
    for (let k = 0; k < OPTION_LETTERS.length; k++) {
      const c = bubbleCenter(q, k);
      p.push(bubble(c.x, c.y));
    }
  }

  // 頁尾
  p.push(text(105, 278, `ExamFactory OMR　·　影印可等比例縮放，但不可裁掉四角黑色方塊`, 2.4, { anchor: 'middle', fill: '#666' }));
  p.push('</svg>');
  return p.join('\n');
}
