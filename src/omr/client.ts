import type { RecognitionResult, RecognizeOptions, RgbaImage } from './engine';

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
let initPromise: Promise<void> | null = null;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (ev) => {
      const { id, ok, result, error } = ev.data;
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      if (ok) p.resolve(result);
      else p.reject(new Error(error));
    };
    worker.onerror = (ev) => {
      for (const p of pending.values()) p.reject(new Error(ev.message || '辨識模組載入失敗'));
      pending.clear();
      worker = null;
      initPromise = null;
    };
  }
  return worker;
}

function call<T>(msg: object, transfer: Transferable[] = []): Promise<T> {
  const id = ++seq;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    getWorker().postMessage({ id, ...msg }, transfer);
  });
}

/** 預先載入 OpenCV.js（首次約數秒）。 */
export function warmup(): Promise<void> {
  if (!initPromise) initPromise = call<void>({ type: 'init' });
  return initPromise;
}

export async function recognizeImage(image: RgbaImage, opts: RecognizeOptions): Promise<RecognitionResult> {
  await warmup();
  return call<RecognitionResult>({ type: 'recognize', image, opts }, [image.data.buffer]);
}
