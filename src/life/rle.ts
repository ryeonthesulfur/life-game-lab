// RLE 形式の読み書き。https://conwaylife.com/wiki/Run_Length_Encoded

import type { Pattern } from './board'

export class PatternParseError extends Error {}

/** B3/S23 を表すルール表記か（"B3/S23"、"b3/s23"、旧表記の "23/3"） */
export function isConwayRule(rule: string | undefined): boolean {
  if (!rule) return true
  const r = rule.replace(/\s/g, '').toUpperCase()
  return r === 'B3/S23' || r === 'S23/B3' || r === '23/3'
}

export function parseRLE(text: string): Pattern {
  const lines = text.split(/\r?\n/)
  const comments: string[] = []
  let name: string | undefined
  let rule: string | undefined
  let width = 0
  let height = 0
  let headerFound = false
  const body: string[] = []

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    if (!headerFound && line.startsWith('#')) {
      const tag = line[1]
      const value = line.slice(2).trim()
      if (tag === 'N') name = value
      else if (tag === 'C' || tag === 'c') comments.push(value)
      continue
    }
    if (!headerFound && /^x\s*=/.test(line)) {
      headerFound = true
      for (const part of line.split(',')) {
        const [k, v] = part.split('=').map((s) => s.trim())
        if (k === 'x') width = Number(v)
        else if (k === 'y') height = Number(v)
        else if (k === 'rule') rule = v
      }
      continue
    }
    body.push(line)
  }

  if (!headerFound) throw new PatternParseError('RLEのヘッダー（x = …, y = …）が見つかりません')
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 0 || height < 0) {
    throw new PatternParseError('RLEのヘッダーの大きさが正しくありません')
  }

  // 本体を読み、住人の座標を集める（ヘッダーより大きくても受け入れる）
  const alive: [number, number][] = []
  let x = 0
  let y = 0
  let count = ''
  const src = body.join('')
  let ended = false
  for (const ch of src) {
    if (ended) break
    if (ch >= '0' && ch <= '9') {
      count += ch
      continue
    }
    const n = count ? Number(count) : 1
    count = ''
    if (ch === 'b' || ch === '.') x += n
    else if (ch === '$') {
      y += n
      x = 0
    } else if (ch === '!') ended = true
    else if (/[a-zA-Z]/.test(ch)) {
      // o のほか、多状態ルール用の文字も住人として扱う
      for (let i = 0; i < n; i++) alive.push([x + i, y])
      x += n
    } else if (/\s/.test(ch)) continue
    else throw new PatternParseError(`RLEに読めない文字があります: "${ch}"`)
  }

  for (const [ax, ay] of alive) {
    if (ax + 1 > width) width = ax + 1
    if (ay + 1 > height) height = ay + 1
  }
  const cells = new Uint8Array(width * height)
  for (const [ax, ay] of alive) cells[ay * width + ax] = 1
  return { width, height, cells, name, comments, rule }
}

const LINE_WIDTH = 70

export function encodeRLE(pattern: Pattern, options: { name?: string; comments?: string[] } = {}): string {
  const { width: w, height: h, cells } = pattern
  const header: string[] = []
  if (options.name) header.push(`#N ${options.name}`)
  for (const c of options.comments ?? []) header.push(`#C ${c}`)
  header.push(`x = ${w}, y = ${h}, rule = B3/S23`)

  // トークン列を作る。行末の空き家は省き、空行は $ の回数にまとめる
  const tokens: string[] = []
  let pendingRows = 0
  const run = (n: number, tag: string) => tokens.push(n > 1 ? `${n}${tag}` : tag)
  for (let y = 0; y < h; y++) {
    let last = -1
    for (let x = w - 1; x >= 0; x--) {
      if (cells[y * w + x]) {
        last = x
        break
      }
    }
    if (last < 0) {
      pendingRows++
      continue
    }
    if (tokens.length > 0) run(pendingRows + 1, '$')
    else if (pendingRows > 0) run(pendingRows, '$')
    pendingRows = 0
    let x = 0
    while (x <= last) {
      const v = cells[y * w + x]
      let n = 1
      while (x + n <= last && cells[y * w + x + n] === v) n++
      run(n, v ? 'o' : 'b')
      x += n
    }
  }
  tokens.push('!')

  // 1行を70文字以内に折り返す（トークンの途中では切らない）
  const lines: string[] = []
  let current = ''
  for (const t of tokens) {
    if (current.length + t.length > LINE_WIDTH) {
      lines.push(current)
      current = ''
    }
    current += t
  }
  if (current) lines.push(current)
  return [...header, ...lines].join('\n') + '\n'
}
