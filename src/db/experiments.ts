// 実験記録の保存先（ブラウザ内蔵の IndexedDB）。保存先を変えるときはこのファイルだけ直す。

import type { GridSizeKey } from '../life/board'
import type { LifeStatus } from '../life/status'

export type SourceType = 'manual' | 'preset' | 'random' | 'file' | 'mixed'

export type Experiment = {
  id?: number
  title: string
  created_at: string
  updated_at: string
  generations: number
  population: number
  initial_population: number
  max_population: number
  max_population_gen: number
  status: LifeStatus
  period?: number
  status_gen?: number
  grid_size: GridSizeKey
  source_type: SourceType
  source_detail?: string
  /** 盤面全体のRLE（位置を保ったまま再現するため） */
  initial_pattern: string
  final_pattern: string
  population_history: number[]
}

export const SOURCE_LABELS: Record<SourceType, string> = {
  manual: '手描き',
  preset: 'プリセット',
  random: 'ランダム',
  file: 'ファイル',
  mixed: '組み合わせ',
}

const DB_NAME = 'life-game-lab'
const STORE = 'experiments'

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return (await openDB()).transaction(STORE, mode).objectStore(STORE)
}

export async function listExperiments(): Promise<Experiment[]> {
  return promisify((await store('readonly')).getAll() as IDBRequest<Experiment[]>)
}

/** id があれば上書き、なければ新しく追加する。保存後の id を返す */
export async function saveExperiment(experiment: Experiment): Promise<number> {
  const record = { ...experiment }
  if (record.id === undefined) delete record.id
  return Number(await promisify((await store('readwrite')).put(record)))
}

export async function deleteExperiments(ids: number[]): Promise<void> {
  const tx = (await openDB()).transaction(STORE, 'readwrite')
  for (const id of ids) tx.objectStore(STORE).delete(id)
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function exportJSON(): Promise<string> {
  return JSON.stringify({ app: DB_NAME, version: 1, experiments: await listExperiments() }, null, 2)
}

/** バックアップを読み込む。同じ id の記録は上書きする。読み込んだ件数を返す */
export async function importJSON(text: string): Promise<number> {
  const data = JSON.parse(text)
  const list: unknown = Array.isArray(data) ? data : data?.experiments
  if (!Array.isArray(list)) throw new Error('記録のJSONではありません')
  const tx = (await openDB()).transaction(STORE, 'readwrite')
  for (const item of list) {
    if (typeof item?.title !== 'string' || typeof item?.initial_pattern !== 'string') {
      tx.abort()
      throw new Error('記録の形式が正しくありません')
    }
    tx.objectStore(STORE).put(item)
  }
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  return list.length
}
