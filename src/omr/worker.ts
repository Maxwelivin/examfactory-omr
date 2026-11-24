/// <reference lib="webworker" />
/**
 * 辨識在 Web Worker 執行，避免 OpenCV.js（約 13 MB WebAssembly）卡住畫面。
 * 所有運算都在本機，不上傳任何影像。
 */
import { recognize, type RecognizeOptions, type RgbaImage } from './engine';
import { waitForCv } from './cv';
// 必須靜態匯入：OpenCV 物件帶有 then()，動態 import() 會把模組 namespace 當成 Promise 而出錯
import cvModule from '@techstark/opencv-js';

type Req =
  | { id: number; type: 'init' }
  | { id: number; type: 'recognize'; image: RgbaImage; opts: RecognizeOptions };

let cvReady: Promise<unknown> | null = null;
function getCv() {
  if (!cvReady) cvReady = waitForCv(cvModule).then((r) => r.cv);
  return cvReady;
}

self.onmessage = async (ev: MessageEvent<Req>) => {
  const msg = ev.data;
  try {
    const cv = await getCv();
    if (msg.type === 'init') {
      self.postMessage({ id: msg.id, ok: true });
      return;
    }
    const result = recognize(cv, msg.image, msg.opts);
    const transfer: Transferable[] = result.warped ? [result.warped.data.buffer] : [];
    self.postMessage({ id: msg.id, ok: true, result }, transfer);
  } catch (e) {
    self.postMessage({ id: msg.id, ok: false, error: e instanceof Error ? e.message : String(e) });
  }
};
