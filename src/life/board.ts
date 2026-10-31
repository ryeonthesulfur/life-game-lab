// 盤面データと1ターン分の計算（B3/S23）。画面には依存しない。

export type EdgeMode = 'wrap' | 'dead'

export type Board = {
  width: number
  height: number
  /** 1 = 住人, 0 = 空き家。index = y * width + x */
  cells: Uint8Array
}

/** RLE などから読み込んだ、盤面に置く前の形 */
export type Pattern = {
  width: number
  height: number
  cells: Uint8Array
  name?: string
  comments?: string[]
  rule?: string
}

export type GridSizeKey = 'small' | 'medium' | 'large'

export const GRID_SIZES: Record<GridSizeKey, { label: string; width: number; height: number; cellSize: number }> = {
  small: { label: '小', width: 80, height: 60, cellSize: 10 },
  medium: { label: '中', width: 160, height: 120, cellSize: 5 },
  large: { label: '大', width: 320, height: 240, cellSize: 3 },
}

export function createBoard(width: number, height: number): Board {
  return { width, height, cells: new Uint8Array(width * height) }
}

export function cloneBoard(board: Board): Board {
  return { width: board.width, height: board.height, cells: board.cells.slice() }
}

export function countPopulation(board: Board): number {
  let n = 0
  for (const c of board.cells) n += c
  return n
}

/**
 * 1ターン進める。全マスいっせいに更新するため、src を読んで dst に書く。
 * dst を渡せば使い回す（毎ターンの確保を避ける）。
 */
export function step(src: Board, edge: EdgeMode, dst: Board = createBoard(src.width, src.height)): Board {
  const { width: w, height: h, cells } = src
  const out = dst.cells
  for (let y = 0; y < h; y++) {
    const up = y - 1
    const down = y + 1
    for (let x = 0; x < w; x++) {
      const left = x - 1
      const right = x + 1
      let n = 0
      for (let dy = up; dy <= down; dy++) {
        let yy = dy
        if (yy < 0 || yy >= h) {
          if (edge === 'dead') continue
          yy = (yy + h) % h
        }
        const row = yy * w
        for (let dx = left; dx <= right; dx++) {
          if (dx === x && dy === y) continue
          let xx = dx
          if (xx < 0 || xx >= w) {
            if (edge === 'dead') continue
            xx = (xx + w) % w
          }
          n += cells[row + xx]
        }
      }
      const i = y * w + x
      out[i] = n === 3 || (n === 2 && cells[i] === 1) ? 1 : 0
    }
  }
  return dst
}

export function clearBoard(board: Board): void {
  board.cells.fill(0)
}

/** 各マスに density（0〜1）の確率で住人を置く。盤面は先に空にする */
export function randomize(board: Board, density: number, random: () => number = Math.random): void {
  const { cells } = board
  for (let i = 0; i < cells.length; i++) cells[i] = random() < density ? 1 : 0
}

/**
 * パターンを盤面に追加する（既存の住人は消さない）。
 * 位置を省略すると中央に置く。はみ出た部分は切り捨てる。
 */
export function placePattern(board: Board, pattern: Pattern, left?: number, top?: number): void {
  const ox = left ?? Math.floor((board.width - pattern.width) / 2)
  const oy = top ?? Math.floor((board.height - pattern.height) / 2)
  for (let y = 0; y < pattern.height; y++) {
    const by = oy + y
    if (by < 0 || by >= board.height) continue
    for (let x = 0; x < pattern.width; x++) {
      const bx = ox + x
      if (bx < 0 || bx >= board.width) continue
      if (pattern.cells[y * pattern.width + x]) board.cells[by * board.width + bx] = 1
    }
  }
}

/** 住人がいる範囲だけを切り出す。住人がいなければ 0×0 */
export function extractPattern(board: Board): Pattern {
  const { width: w, height: h, cells } = board
  let minX = w, minY = h, maxX = -1, maxY = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!cells[y * w + x]) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (maxX < 0) return { width: 0, height: 0, cells: new Uint8Array(0) }
  const pw = maxX - minX + 1
  const ph = maxY - minY + 1
  const out = new Uint8Array(pw * ph)
  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) out[y * pw + x] = cells[(minY + y) * w + minX + x]
  }
  return { width: pw, height: ph, cells: out }
}

/** 盤面全体をそのままパターンとして扱う（位置を保ったまま保存・復元するため） */
export function boardAsPattern(board: Board): Pattern {
  return { width: board.width, height: board.height, cells: board.cells }
}

/** パターンが収まる最小の盤面サイズ。どれにも収まらなければ null */
export function smallestFittingSize(pattern: Pattern): GridSizeKey | null {
  for (const key of ['small', 'medium', 'large'] as const) {
    const s = GRID_SIZES[key]
    if (pattern.width <= s.width && pattern.height <= s.height) return key
  }
  return null
}
