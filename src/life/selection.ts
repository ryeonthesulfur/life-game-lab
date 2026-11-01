// 選択モードの計算（範囲の切り出し・書き込み・回転・反転、端の扱い）。画面には依存しない。
// 範囲の左上は盤面の外を指すこともあり、そのときは「つなげる」と同じく反対側に回り込んで読み書きする。

import type { Board, EdgeMode, Pattern } from './board'

export type Rect = { x: number; y: number; w: number; h: number }

/** 枠どうしの間隔（複製したとき、元の枠の右端から何マス空けるか） */
export const DUPLICATE_GAP = 5

const mod = (n: number, m: number) => ((n % m) + m) % m

function index(board: Board, x: number, y: number): number {
  return mod(y, board.height) * board.width + mod(x, board.width)
}

/** 範囲の左上を盤面の中に収まる座標（0 以上、幅・高さ未満）に直す */
export function normalizeRect(board: Board, r: Rect): Rect {
  return { ...r, x: mod(r.x, board.width), y: mod(r.y, board.height) }
}

/** マス (x, y) が範囲の中か。範囲が端をまたいでいてもよい */
export function rectContains(board: Board, r: Rect, x: number, y: number): boolean {
  return mod(x - r.x, board.width) < r.w && mod(y - r.y, board.height) < r.h
}

/** 盤面の中の範囲を、住人がちょうど収まる大きさに縮める。住人がいなければ null */
export function trimToLife(board: Board, r: Rect): Rect | null {
  let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1
  for (let dy = 0; dy < r.h; dy++) {
    for (let dx = 0; dx < r.w; dx++) {
      if (!board.cells[index(board, r.x + dx, r.y + dy)]) continue
      if (dx < minX) minX = dx
      if (dx > maxX) maxX = dx
      if (dy < minY) minY = dy
      if (dy > maxY) maxY = dy
    }
  }
  if (maxX < 0) return null
  return normalizeRect(board, { x: r.x + minX, y: r.y + minY, w: maxX - minX + 1, h: maxY - minY + 1 })
}

export function readRect(board: Board, r: Rect): Pattern {
  const cells = new Uint8Array(r.w * r.h)
  for (let dy = 0; dy < r.h; dy++) {
    for (let dx = 0; dx < r.w; dx++) cells[dy * r.w + dx] = board.cells[index(board, r.x + dx, r.y + dy)]
  }
  return { width: r.w, height: r.h, cells }
}

export function clearRect(board: Board, r: Rect): void {
  for (let dy = 0; dy < r.h; dy++) {
    for (let dx = 0; dx < r.w; dx++) board.cells[index(board, r.x + dx, r.y + dy)] = 0
  }
}

/** 範囲の中に住人が1人でもいるか */
export function hasLife(board: Board, r: Rect): boolean {
  for (let dy = 0; dy < r.h; dy++) {
    for (let dx = 0; dx < r.w; dx++) if (board.cells[index(board, r.x + dx, r.y + dy)]) return true
  }
  return false
}

/** パターンを (x, y) を左上にして重ねて置く（もとの住人は消さない） */
export function stamp(board: Board, pattern: Pattern, x: number, y: number): void {
  for (let dy = 0; dy < pattern.height; dy++) {
    for (let dx = 0; dx < pattern.width; dx++) {
      if (pattern.cells[dy * pattern.width + dx]) board.cells[index(board, x + dx, y + dy)] = 1
    }
  }
}

/** 右に90度回す */
export function rotateRight(p: Pattern): Pattern {
  const w = p.height
  const h = p.width
  const cells = new Uint8Array(w * h)
  for (let y = 0; y < p.height; y++) {
    for (let x = 0; x < p.width; x++) cells[x * w + (w - 1 - y)] = p.cells[y * p.width + x]
  }
  return { width: w, height: h, cells }
}

export function flipHorizontal(p: Pattern): Pattern {
  const cells = new Uint8Array(p.cells.length)
  for (let y = 0; y < p.height; y++) {
    for (let x = 0; x < p.width; x++) cells[y * p.width + (p.width - 1 - x)] = p.cells[y * p.width + x]
  }
  return { width: p.width, height: p.height, cells }
}

export function flipVertical(p: Pattern): Pattern {
  const cells = new Uint8Array(p.cells.length)
  for (let y = 0; y < p.height; y++) {
    cells.set(p.cells.subarray(y * p.width, (y + 1) * p.width), (p.height - 1 - y) * p.width)
  }
  return { width: p.width, height: p.height, cells }
}

/**
 * 置く先の範囲を端の扱いに合わせて決める。
 * つなげる：そのまま（回り込む）。空き家とみなす：盤面の中に押し戻す。入りきらなければ null
 */
export function placeRect(board: Board, r: Rect, edge: EdgeMode): Rect | null {
  if (edge === 'wrap') return normalizeRect(board, r)
  if (r.w > board.width || r.h > board.height) return null
  return {
    ...r,
    x: Math.min(Math.max(r.x, 0), board.width - r.w),
    y: Math.min(Math.max(r.y, 0), board.height - r.h),
  }
}

/** 回したあとの枠。中心がだいたい同じ位置になるようにする */
export function rotatedRect(r: Rect): Rect {
  return { x: r.x + Math.floor((r.w - r.h) / 2), y: r.y + Math.floor((r.h - r.w) / 2), w: r.h, h: r.w }
}

/** 複製先の枠。空き家とみなすときに右に入りきらなければ null */
export function duplicateRect(board: Board, r: Rect, edge: EdgeMode): Rect | null {
  const next = { ...r, x: r.x + r.w + DUPLICATE_GAP }
  if (edge === 'dead' && next.x + next.w > board.width) return null
  return placeRect(board, next, edge)
}
