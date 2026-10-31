// 全滅・固定・周期の判定。直近の盤面を覚えておき、同じ盤面が再び現れたら周期とみなす。

import { countPopulation, type Board } from './board'

export type LifeStatus = 'running' | 'extinct' | 'still' | 'oscillating'

export type StatusResult = {
  status: LifeStatus
  /** oscillating のときの周期 */
  period?: number
  /** 全滅・固定・周期になったターン */
  statusGen?: number
}

export const STATUS_LABELS: Record<LifeStatus, string> = {
  running: '変化中',
  extinct: '全滅',
  still: '固定',
  oscillating: '周期',
}

export function statusText(status: LifeStatus, period?: number): string {
  return status === 'oscillating' ? `周期${period ?? ''}` : STATUS_LABELS[status]
}

const HISTORY = 100

type Snapshot = { gen: number; hash: number; cells: Uint8Array }

/** 盤面の指紋（FNV-1a）。一致したら中身も比べるので、衝突しても誤判定しない */
function hashCells(cells: Uint8Array): number {
  let h = 0x811c9dc5
  for (let i = 0; i < cells.length; i++) {
    h ^= cells[i] + (i & 0xff)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function sameCells(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

export class StatusTracker {
  private snapshots: Snapshot[] = []
  private result: StatusResult = { status: 'running' }

  /** 手で編集したり端の扱いを変えたりして、過去の盤面が当てにならなくなったら呼ぶ */
  reset(): void {
    this.snapshots = []
    this.result = { status: 'running' }
  }

  get current(): StatusResult {
    return this.result
  }

  /** そのターンの盤面を記録し、判定結果を返す。一度決まった結末は reset まで変わらない */
  observe(board: Board, gen: number): StatusResult {
    if (this.result.status !== 'running') return this.result

    if (countPopulation(board) === 0) {
      this.result = { status: 'extinct', statusGen: gen }
      return this.result
    }

    const hash = hashCells(board.cells)
    for (let i = this.snapshots.length - 1; i >= 0; i--) {
      const s = this.snapshots[i]
      if (s.hash !== hash || !sameCells(s.cells, board.cells)) continue
      const period = gen - s.gen
      this.result = period === 1
        ? { status: 'still', statusGen: s.gen }
        : { status: 'oscillating', period, statusGen: s.gen }
      return this.result
    }

    this.snapshots.push({ gen, hash, cells: board.cells.slice() })
    if (this.snapshots.length > HISTORY) this.snapshots.shift()
    return this.result
  }
}
