import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Exam, ScanRecord } from './types';

interface OmrDB extends DBSchema {
  exams: { key: string; value: Exam };
  scans: { key: string; value: ScanRecord; indexes: { byExam: string } };
}

let dbp: Promise<IDBPDatabase<OmrDB>> | null = null;
export function db() {
  if (!dbp)
    dbp = openDB<OmrDB>('examfactory-omr', 1, {
      upgrade(d) {
        d.createObjectStore('exams', { keyPath: 'id' });
        const s = d.createObjectStore('scans', { keyPath: 'id' });
        s.createIndex('byExam', 'examId');
      },
    });
  return dbp;
}

export const uid = () =>
  (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`).replace(/-/g, '').slice(0, 16);

export async function listExams(): Promise<Exam[]> {
  return (await (await db()).getAll('exams')).sort((a, b) => b.updatedAt - a.updatedAt);
}
export const getExam = async (id: string) => (await db()).get('exams', id);
export const putExam = async (e: Exam) => (await db()).put('exams', e);
export async function deleteExam(id: string) {
  const d = await db();
  const tx = d.transaction(['exams', 'scans'], 'readwrite');
  await tx.objectStore('exams').delete(id);
  const keys = await tx.objectStore('scans').index('byExam').getAllKeys(id);
  for (const k of keys) await tx.objectStore('scans').delete(k);
  await tx.done;
}
export async function listScans(examId: string): Promise<ScanRecord[]> {
  return (await db()).getAllFromIndex('scans', 'byExam', examId);
}
export const getScan = async (id: string) => (await db()).get('scans', id);
export const putScan = async (s: ScanRecord) => (await db()).put('scans', s);
export const deleteScan = async (id: string) => (await db()).delete('scans', id);
export async function countScans(): Promise<number> {
  return (await db()).count('scans');
}

/** 要求瀏覽器不要自動清除本機資料（iOS Safari 可能仍會在 7 天未使用後清除非主畫面網站的資料）。 */
export async function requestPersist(): Promise<boolean | null> {
  if (!navigator.storage?.persist) return null;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}

// ---------- 備份與還原 ----------
const blobToDataUrl = (b: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });
const dataUrlToBlob = async (u: string) => (await fetch(u)).blob();

export interface BackupFile {
  app: 'examfactory-omr';
  version: 1;
  exportedAt: string;
  exams: Exam[];
  scans: (Omit<ScanRecord, 'image' | 'nameImage'> & { image?: string; nameImage?: string })[];
}

export async function exportBackup(includeImages: boolean): Promise<BackupFile> {
  const d = await db();
  const exams = await d.getAll('exams');
  const scans = await d.getAll('scans');
  const out: BackupFile['scans'] = [];
  for (const s of scans) {
    const { image, nameImage, ...rest } = s;
    out.push({
      ...rest,
      ...(includeImages && image ? { image: await blobToDataUrl(image) } : {}),
      ...(includeImages && nameImage ? { nameImage: await blobToDataUrl(nameImage) } : {}),
    });
  }
  return { app: 'examfactory-omr', version: 1, exportedAt: new Date().toISOString(), exams, scans: out };
}

export async function importBackup(data: BackupFile): Promise<{ exams: number; scans: number }> {
  if (data?.app !== 'examfactory-omr' || data.version !== 1) throw new Error('這不是本系統的備份檔，或版本不相容');
  const d = await db();
  const scans: ScanRecord[] = [];
  for (const s of data.scans) {
    const { image, nameImage, ...rest } = s;
    scans.push({
      ...(rest as ScanRecord),
      image: image ? await dataUrlToBlob(image) : undefined,
      nameImage: nameImage ? await dataUrlToBlob(nameImage) : undefined,
    });
  }
  const tx = d.transaction(['exams', 'scans'], 'readwrite');
  for (const e of data.exams) await tx.objectStore('exams').put(e);
  for (const s of scans) await tx.objectStore('scans').put(s);
  await tx.done;
  return { exams: data.exams.length, scans: scans.length };
}
