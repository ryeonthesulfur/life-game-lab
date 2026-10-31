// 盤面の描画とクリック・ドラッグでの描き込み。

import { useEffect, useRef } from 'react'
import type { Board } from '../life/board'

type Props = {
  board: Board
  /** 盤面の中身が変わるたびに増える。再描画のきっかけ */
  version: number
  cellSize: number
  inverted: boolean
  onStrokeStart: () => void
  onPaint: (x: number, y: number, alive: boolean) => void
  onStrokeEnd: () => void
}

const COLORS = {
  normal: { bg: '#ffffff', grid: '#dcdcdc', cell: '#111111' },
  inverted: { bg: '#111111', grid: '#3a3a3a', cell: '#f5f5f5' },
}

export function BoardCanvas({ board, version, cellSize, inverted, onStrokeStart, onPaint, onStrokeEnd }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stroke = useRef<{ alive: boolean; x: number; y: number } | null>(null)
  const { width, height } = board

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const pw = width * cellSize
    const ph = height * cellSize
    if (canvas.width !== Math.round(pw * dpr) || canvas.height !== Math.round(ph * dpr)) {
      canvas.width = Math.round(pw * dpr)
      canvas.height = Math.round(ph * dpr)
      canvas.style.width = `${pw}px`
      canvas.style.height = `${ph}px`
    }
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const color = inverted ? COLORS.inverted : COLORS.normal

    ctx.fillStyle = color.bg
    ctx.fillRect(0, 0, pw, ph)

    // 1マスが4px未満だと線が細かすぎるので描かない
    if (cellSize >= 4) {
      ctx.beginPath()
      for (let x = 0; x <= width; x++) {
        ctx.moveTo(x * cellSize + 0.5, 0)
        ctx.lineTo(x * cellSize + 0.5, ph)
      }
      for (let y = 0; y <= height; y++) {
        ctx.moveTo(0, y * cellSize + 0.5)
        ctx.lineTo(pw, y * cellSize + 0.5)
      }
      ctx.strokeStyle = color.grid
      ctx.lineWidth = 1
      ctx.stroke()
    }

    ctx.fillStyle = color.cell
    const { cells } = board
    // 3px以下では丸が見えにくいので四角で塗る
    if (cellSize <= 3) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (cells[y * width + x]) ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize)
        }
      }
    } else {
      const r = cellSize * 0.36
      const half = cellSize / 2 + 0.5
      ctx.beginPath()
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (!cells[y * width + x]) continue
          const cx = x * cellSize + half
          const cy = y * cellSize + half
          ctx.moveTo(cx + r, cy)
          ctx.arc(cx, cy, r, 0, Math.PI * 2)
        }
      }
      ctx.fill()
    }
  }, [board, version, cellSize, inverted, width, height])

  const cellAt = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const x = Math.floor((e.clientX - rect.left) / cellSize)
    const y = Math.floor((e.clientY - rect.top) / cellSize)
    return x >= 0 && y >= 0 && x < width && y < height ? { x, y } : null
  }

  return (
    <canvas
      ref={canvasRef}
      className="board-canvas"
      onPointerDown={(e) => {
        if (e.button !== 0) return
        const c = cellAt(e)
        if (!c) return
        e.currentTarget.setPointerCapture(e.pointerId)
        // 最初に触ったマスが空き家なら「置く」、住人なら「消す」でなぞる
        const alive = !board.cells[c.y * width + c.x]
        stroke.current = { alive, ...c }
        onStrokeStart()
        onPaint(c.x, c.y, alive)
      }}
      onPointerMove={(e) => {
        const s = stroke.current
        if (!s) return
        const c = cellAt(e)
        if (!c || (c.x === s.x && c.y === s.y)) return
        // 速く動かしても途切れないよう、前のマスとの間も塗る
        const steps = Math.max(Math.abs(c.x - s.x), Math.abs(c.y - s.y))
        for (let i = 1; i <= steps; i++) {
          onPaint(Math.round(s.x + ((c.x - s.x) * i) / steps), Math.round(s.y + ((c.y - s.y) * i) / steps), s.alive)
        }
        s.x = c.x
        s.y = c.y
      }}
      onPointerUp={() => {
        if (!stroke.current) return
        stroke.current = null
        onStrokeEnd()
      }}
      onPointerCancel={() => {
        if (!stroke.current) return
        stroke.current = null
        onStrokeEnd()
      }}
    />
  )
}
