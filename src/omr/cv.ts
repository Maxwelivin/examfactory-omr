import type { CV } from './engine';

/**
 * 等待 OpenCV.js（WebAssembly）初始化完成。
 * Emscripten 的 Module 物件帶有 then()，直接 return 會造成 Promise 無限解析，
 * 所以一律包在 { cv } 物件裡回傳。
 */
export async function waitForCv(mod: CV): Promise<{ cv: CV }> {
  if (mod instanceof Promise) mod = await mod;
  if (mod && mod.Mat && mod.getBuildInformation) return { cv: mod };
  await new Promise<void>((resolve) => {
    const prev = mod.onRuntimeInitialized;
    mod.onRuntimeInitialized = () => {
      prev?.();
      resolve();
    };
    if (mod.Mat && mod.getBuildInformation) resolve();
  });
  return { cv: mod };
}
