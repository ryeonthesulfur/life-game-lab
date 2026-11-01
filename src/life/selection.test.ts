import { describe, expect, it } from 'vitest'
import { createBoard, type Board } from './board'
import { parseRLE } from './rle'
import {
  duplicateRect,
  flipHorizontal,
  flipVertical,
  hasLife,
  placeRect,
  readRect,
  rectContains,
  rotatedRect,
  rotateRight,
  stamp,
  trimToLife,
} from './selection'

const glider = () => parseRLE('x = 3, y = 3\nbob$2bo$3o!')
const rows = (p: { width: number; height: number; cells: Uint8Array }) =>
  Array.from({ length: p.height }, (_, y) =>
    Array.from(p.cells.subarray(y * p.width, (y + 1) * p.width), (c) => (c ? 'o' : '.')).join(''),
  )

function boardWithGlider(x: number, y: number): Board {
  const b = createBoard(20, 10)
  stamp(b, glider(), x, y)
  return b
}

describe('selection', () => {
  it('囲んだ範囲を住人ぴったりの枠に縮める', () => {
    const b = boardWithGlider(5, 3)
    expect(trimToLife(b, { x: 2, y: 1, w: 10, h: 8 })).toEqual({ x: 5, y: 3, w: 3, h: 3 })
    expect(trimToLife(b, { x: 12, y: 0, w: 5, h: 5 })).toBeNull()
  })

  it('右に回転・左右反転・上下反転', () => {
    expect(rows(rotateRight(glider()))).toEqual(['o..', 'o.o', 'oo.'])
    expect(rows(flipHorizontal(glider()))).toEqual(['.o.', 'o..', 'ooo'])
    expect(rows(flipVertical(glider()))).toEqual(['ooo', '..o', '.o.'])
    const lwss = parseRLE('x = 5, y = 4\nbo2bo$o4b$o3bo$4o!')
    const r = rotateRight(lwss)
    expect([r.width, r.height]).toEqual([4, 5])
    expect(rotateRight(rotateRight(rotateRight(r))).cells).toEqual(lwss.cells)
  })

  it('回した枠は中心がだいたい同じ', () => {
    expect(rotatedRect({ x: 10, y: 10, w: 5, h: 1 })).toEqual({ x: 12, y: 8, w: 1, h: 5 })
  })

  it('つなげるときは端を越えて回り込む', () => {
    const b = createBoard(20, 10)
    const r = placeRect(b, { x: 18, y: -1, w: 3, h: 3 }, 'wrap')!
    expect(r).toEqual({ x: 18, y: 9, w: 3, h: 3 })
    stamp(b, glider(), r.x, r.y)
    expect(rows(readRect(b, r))).toEqual(rows(glider()))
    expect(b.cells[0 * 20 + 0]).toBe(1) // 右下の o は左上の端に回り込む
    expect(rectContains(b, r, 0, 1)).toBe(true)
    expect(rectContains(b, r, 1, 1)).toBe(false)
  })

  it('空き家とみなすときは端で止まる', () => {
    const b = createBoard(20, 10)
    expect(placeRect(b, { x: 18, y: -1, w: 3, h: 3 }, 'dead')).toEqual({ x: 17, y: 0, w: 3, h: 3 })
    expect(placeRect(b, { x: 0, y: 0, w: 3, h: 11 }, 'dead')).toBeNull()
  })

  it('複製は5マス空けて右隣。空き家とみなすときは入りきらなければ null', () => {
    const b = createBoard(20, 10)
    expect(duplicateRect(b, { x: 2, y: 1, w: 3, h: 3 }, 'dead')).toEqual({ x: 10, y: 1, w: 3, h: 3 })
    expect(duplicateRect(b, { x: 10, y: 1, w: 3, h: 3 }, 'dead')).toBeNull()
    expect(duplicateRect(b, { x: 10, y: 1, w: 3, h: 3 }, 'wrap')).toEqual({ x: 18, y: 1, w: 3, h: 3 })
  })

  it('範囲に住人がいるか', () => {
    const b = boardWithGlider(5, 3)
    expect(hasLife(b, { x: 0, y: 0, w: 5, h: 10 })).toBe(false)
    expect(hasLife(b, { x: 7, y: 5, w: 1, h: 1 })).toBe(true)
  })
})
