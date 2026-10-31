// Plaintext（.cells）形式の読み込み。https://conwaylife.com/wiki/Plaintext

import type { Pattern } from './board'
import { PatternParseError } from './rle'

export function parsePlaintext(text: string): Pattern {
  const comments: string[] = []
  let name: string | undefined
  const rows: string[] = []

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '')
    if (line.startsWith('!')) {
      const value = line.slice(1).trim()
      const m = /^Name:\s*(.*)$/.exec(value)
      if (m) name = m[1]
      else comments.push(value)
      continue
    }
    rows.push(line)
  }
  while (rows.length > 0 && rows[rows.length - 1] === '') rows.pop()

  const width = Math.max(0, ...rows.map((r) => r.length))
  const height = rows.length
  const cells = new Uint8Array(width * height)
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x]
      if (ch === 'O' || ch === '*') cells[y * width + x] = 1
      else if (ch !== '.') throw new PatternParseError(`.cells に読めない文字があります: "${ch}"（${y + 1}行目）`)
    }
  })
  return { width, height, cells, name, comments }
}
