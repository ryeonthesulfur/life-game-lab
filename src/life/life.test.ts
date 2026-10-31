import { describe, expect, it } from 'vitest'
import { countPopulation, createBoard, extractPattern, placePattern, step, type Board, type EdgeMode } from './board'
import { parsePlaintext } from './plaintext'
import { PRESETS } from './presets'
import { encodeRLE, isConwayRule, parseRLE } from './rle'
import { StatusTracker } from './status'

function boardWith(preset: string, w: number, h: number): Board {
  const board = createBoard(w, h)
  placePattern(board, parseRLE(PRESETS.find((p) => p.id === preset)!.rle))
  return board
}

function run(board: Board, edge: EdgeMode, turns: number): Board {
  let b = board
  for (let i = 0; i < turns; i++) b = step(b, edge)
  return b
}

function runUntilSettled(board: Board, edge: EdgeMode, limit: number) {
  const tracker = new StatusTracker()
  let b = board
  tracker.observe(b, 0)
  for (let gen = 1; gen <= limit; gen++) {
    b = step(b, edge)
    const r = tracker.observe(b, gen)
    if (r.status !== 'running') return { ...r, gen }
  }
  return { status: 'running' as const, gen: limit }
}

describe('step', () => {
  it('ブリンカーは横一列と縦一列を繰り返す', () => {
    const b = boardWith('blinker', 5, 5)
    const next = step(b, 'dead')
    expect(Array.from(extractPattern(next).cells)).toEqual([1, 1, 1])
    expect(extractPattern(next)).toMatchObject({ width: 1, height: 3 })
    expect(step(next, 'dead').cells).toEqual(b.cells)
  })

  it('グライダーは4ターンで斜めに1マス進む', () => {
    const b = createBoard(10, 10)
    placePattern(b, parseRLE(PRESETS.find((p) => p.id === 'glider')!.rle), 2, 2)
    const after = run(b, 'dead', 4)
    const moved = createBoard(10, 10)
    placePattern(moved, parseRLE(PRESETS.find((p) => p.id === 'glider')!.rle), 3, 3)
    expect(after.cells).toEqual(moved.cells)
  })

  it('つなげるモードでは端を越えて反対側に出る', () => {
    const b = createBoard(5, 5)
    // 左端の縦一列 → 次は横一列になり、左端の外は右端につながる
    b.cells[1 * 5 + 0] = b.cells[2 * 5 + 0] = b.cells[3 * 5 + 0] = 1
    const wrapped = step(b, 'wrap')
    expect(wrapped.cells[2 * 5 + 4]).toBe(1)
    expect(step(b, 'dead').cells[2 * 5 + 4]).toBe(0)
  })
})

describe('StatusTracker', () => {
  it('ブロックは固定', () => {
    expect(runUntilSettled(boardWith('block', 10, 10), 'dead', 10)).toMatchObject({ status: 'still', statusGen: 0 })
  })

  it('パルサーは周期3', () => {
    expect(runUntilSettled(boardWith('pulsar', 30, 30), 'dead', 10)).toMatchObject({ status: 'oscillating', period: 3 })
  })

  it('ダイハードはちょうど130ターンで全滅する', () => {
    expect(runUntilSettled(boardWith('diehard', 160, 120), 'dead', 200)).toMatchObject({ status: 'extinct', statusGen: 130 })
  })

  it('グライダー銃は30ターンで住人が5増える（グライダー1つ分）', () => {
    const b = boardWith('gosper-gun', 160, 120)
    expect(countPopulation(run(b, 'dead', 30)) - countPopulation(b)).toBe(5)
  })
})

describe('RLE', () => {
  it('すべてのプリセットが読めて、書き出しても同じ形に戻る', () => {
    for (const p of PRESETS) {
      const pattern = parseRLE(p.rle)
      expect(countPopulation({ ...pattern }), p.id).toBeGreaterThan(0)
      const again = parseRLE(encodeRLE(pattern, { name: p.name }))
      expect(again.cells, p.id).toEqual(pattern.cells)
      expect(again.name).toBe(p.name)
    }
  })

  it('ヘッダー、名前、コメント、ルールを読む', () => {
    const p = parseRLE('#N Glider\n#C A comment\nx = 3, y = 3, rule = B3/S23\nbob$2bo$3o!')
    expect(p).toMatchObject({ width: 3, height: 3, name: 'Glider', comments: ['A comment'], rule: 'B3/S23' })
  })

  it('空行をはさむパターンを書き出せる', () => {
    const p = parseRLE('x = 3, y = 4\no2$2bo$o!')
    expect(encodeRLE(p).trim().split('\n').pop()).toBe('o2$2bo$o!')
  })

  it('1行は70文字以内', () => {
    const board = createBoard(200, 3)
    for (let x = 0; x < 200; x += 2) board.cells[x] = 1
    for (const line of encodeRLE(board).split('\n')) expect(line.length).toBeLessThanOrEqual(70)
  })

  it('ルール表記を判定する', () => {
    expect(isConwayRule('B3/S23')).toBe(true)
    expect(isConwayRule('23/3')).toBe(true)
    expect(isConwayRule(undefined)).toBe(true)
    expect(isConwayRule('B36/S23')).toBe(false)
  })
})

describe('Plaintext', () => {
  it('名前とセルを読む', () => {
    const p = parsePlaintext('!Name: Glider\n!\n.O\n..O\nOOO\n')
    expect(p).toMatchObject({ width: 3, height: 3, name: 'Glider' })
    expect(p.cells).toEqual(parseRLE('x = 3, y = 3\nbo$2bo$3o!').cells)
  })
})
