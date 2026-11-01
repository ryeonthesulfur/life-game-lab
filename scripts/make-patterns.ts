// 素数の60列配置と、公差数列群（mod 60, r=1）の0の配置を patterns/ にRLEで書き出す。
// 使い方: npm run patterns
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { encodeRLE } from '../src/life/rle.ts'

const outDir = join(import.meta.dirname, '..', 'patterns')

const isPrime = (n: number): boolean => {
  n = Math.abs(n)
  if (n < 2) return false
  if (n % 2 === 0) return n === 2
  for (let d = 3; d * d <= n; d += 2) if (n % d === 0) return false
  return true
}

mkdirSync(outDir, { recursive: true })

// ---- 1. 素数の60列配置（1〜7200、1行60個） ----
{
  const width = 60
  const height = 120
  const cells = new Uint8Array(width * height)
  let count = 0
  for (let n = 1; n <= width * height; n++) {
    if (!isPrime(n)) continue
    cells[n - 1] = 1
    count++
  }
  const text = encodeRLE(
    { width, height, cells },
    {
      name: 'Primes in 60 columns (1-7200)',
      comments: ['1,2,3,... placed 60 per row from top-left. A cell is alive if its number is prime.', `${count} primes`],
    },
  )
  writeFileSync(join(outDir, 'primes-60-columns.rle'), text)
  console.log(`primes-60-columns.rle: ${width}x${height}, ${count} primes`)
}

// ---- 2. 公差数列群（mod 60, r=1）。0 のマスを住人にする ----
{
  const MOD = 60
  const R = 1
  const NEG = 60 // 負の側から取る素数の数
  const POS = 61 // 正の側から取る素数の数

  const neg: number[] = []
  for (let k = -1; neg.length < NEG; k--) if (isPrime(R + MOD * k)) neg.push(R + MOD * k)
  const pos: number[] = []
  for (let k = 0; pos.length < POS; k++) if (isPrime(R + MOD * k)) pos.push(R + MOD * k)
  // 符号つきで小さい順（上が −、下が ＋）
  const primes = [...neg.reverse(), ...pos]
  const L = primes.length

  // 1段目は符号つきの差（すべて60の倍数）、2段目からは絶対値の差
  const rows: number[][] = []
  let cur = primes.slice(1).map((v, i) => v - primes[i])
  while (cur.length > 0) {
    rows.push(cur)
    cur = cur.slice(1).map((v, i) => Math.abs(v - cur[i]))
  }

  // 素数列を右端の縦の列とみなし、差分を左へ1列ずつ並べる。
  // 各段の値は上の段の2つの値の間に来るので、縦は1マスおきに置いてずらす
  const width = L - 1
  const height = 2 * L - 2
  const cells = new Uint8Array(width * height)
  let zeros = 0
  rows.forEach((row, d) => {
    const depth = d + 1
    const x = width - depth
    row.forEach((v, i) => {
      if (v !== 0) return
      cells[(2 * i + depth - 1) * width + x] = 1
      zeros++
    })
  })

  // 何段目から 0 と 60 だけになったか
  const binaryFrom = rows.findIndex((row, d) => rows.slice(d).every((r) => r.every((v) => v === 0 || v === MOD))) + 1
  const multiples = rows[0].every((v) => v % MOD === 0)

  const text = encodeRLE(
    { width, height, cells },
    {
      name: `Difference triangle of primes 1+60k (${primes[0]} to ${primes[L - 1]})`,
      comments: [
        `${L} primes p with p = 1 + 60k (k may be negative; primality by |p|), in signed ascending order.`,
        'Column 1 (rightmost) = p[i+1] - p[i]; each column to the left = |difference| of the column to its right.',
        'A cell is alive where the value is 0. Values sit between the two values they come from, so rows alternate.',
      ],
    },
  )
  writeFileSync(join(outDir, 'diff-triangle-mod60-r1.rle'), text)
  console.log(`diff-triangle-mod60-r1.rle: ${width}x${height}, primes ${primes[0]}..${primes[L - 1]}, zeros ${zeros}`)
  console.log(`first differences all multiples of 60: ${multiples}; only 0/60 from depth ${binaryFrom}`)
  console.log('first rows:', rows.slice(0, 3).map((r) => r.slice(55, 68).join(' ')))
}
