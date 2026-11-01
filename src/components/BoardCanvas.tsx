// 盤面の描画とクリック・ドラッグでの描き込み。選択モードでは枠で囲んで動かす。

import { useEffect, useRef, useState } from 'react'
import type { Board, EdgeMode, Pattern } from '../life/board'
import { placeRect, readRect, rectContains, type Rect } from '../life/selection'
import type { BoardMode } from '../useLab'

type Props = {
  board: Board
  /** 盤面の中身が変わるたびに増える。再描画のきっかけ */
  version: number
  cellSize: number
  inverted: boolean
  onStrokeStart: () => void
  onPaint: (x: number, y: number, alive: boolean) => void
  onStrokeEnd: () => void
  mode: BoardMode
  edge: EdgeMode
  selection: Rect | null
  /** 選択モードの操作を受け付けるか（再生中は false） */
  selectable: boolean
  onSelect: (rect: Rect | null) => void
  onMoveSelection: (dx: number, dy: number) => void
}

/** 選択モードでドラッグしている途中の様子 */
type Drag =
  | { kind: 'select'; x0: number; y0: number; x1: number; y1: number }
  | { kind: 'move'; sx: number; sy: number; dx: number; dy: number; content: Pattern }

const SELECTION_COLOR = '#1e88e5'

function cornersToRect(d: { x0: number; y0: number; x1: number; y1: number }): Rect {
  return {
    x: Math.min(d.x0, d.x1),
    y: Math.min(d.y0, d.y1),
    w: Math.abs(d.x1 - d.x0) + 1,
    h: Math.abs(d.y1 - d.y0) + 1,
  }
}

const COLORS = {
  normal: { bg: '#ffffff', grid: '#dcdcdc', cell: '#111111' },
  inverted: { bg: '#111111', grid: '#3a3a3a', cell: '#f5f5f5' },
}

export function BoardCanvas({
  board, version, cellSize, inverted, onStrokeStart, onPaint, onStrokeEnd,
  mode, edge, selection, selectable, onSelect, onMoveSelection,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stroke = useRef<{ alive: boolean; x: number; y: number } | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [overSelection, setOverSelection] = useState(false)
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

    // ---- 選択枠 ----
    // 端をまたぐ枠は、上下左右に1盤面ずらした位置にも描いて回り込んで見せる（はみ出しは描かれない）
    const strokeRect = (r: Rect, dashed: boolean) => {
      ctx.save()
      ctx.strokeStyle = SELECTION_COLOR
      ctx.lineWidth = 2
      ctx.setLineDash(dashed ? [6, 4] : [])
      for (const oy of [0, -height, height]) {
        for (const ox of [0, -width, width]) {
          ctx.strokeRect((r.x + ox) * cellSize + 1, (r.y + oy) * cellSize + 1, r.w * cellSize - 1, r.h * cellSize - 1)
        }
      }
      ctx.restore()
    }

    if (drag?.kind === 'select') {
      strokeRect(cornersToRect(drag), true)
    } else if (drag?.kind === 'move' && selection) {
      const target = placeRect(board, { ...selection, x: selection.x + drag.dx, y: selection.y + drag.dy }, edge)
      strokeRect(selection, true)
      if (target) {
        ctx.save()
        ctx.globalAlpha = 0.5
        ctx.fillStyle = SELECTION_COLOR
        const { content } = drag
        for (let y = 0; y < content.height; y++) {
          for (let x = 0; x < content.width; x++) {
            if (!content.cells[y * content.width + x]) continue
            const bx = (target.x + x) % width
            const by = (target.y + y) % height
            ctx.fillRect(bx * cellSize, by * cellSize, cellSize, cellSize)
          }
        }
        ctx.restore()
        strokeRect(target, false)
      }
    } else if (selection) {
      strokeRect(selection, true)
    }
  }, [board, version, cellSize, inverted, width, height, drag, selection, edge])

  const cellAt = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const x = Math.floor((e.clientX - rect.left) / cellSize)
    const y = Math.floor((e.clientY - rect.top) / cellSize)
    return x >= 0 && y >= 0 && x < width && y < height ? { x, y } : null
  }

  /** 盤面の外までドラッグしても、いちばん近いマスを返す */
  const clampedCellAt = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const x = Math.floor((e.clientX - rect.left) / cellSize)
    const y = Math.floor((e.clientY - rect.top) / cellSize)
    return { x: Math.min(Math.max(x, 0), width - 1), y: Math.min(Math.max(y, 0), height - 1) }
  }

  const finishDrag = (commit: boolean) => {
    const d = drag
    setDrag(null)
    if (!d || !commit) return
    if (d.kind === 'select') {
      // ドラッグせずにクリックしただけなら、枠を消す
      onSelect(d.x0 === d.x1 && d.y0 === d.y1 ? null : cornersToRect(d))
    } else if (d.dx !== 0 || d.dy !== 0) {
      onMoveSelection(d.dx, d.dy)
    }
  }

  if (mode === 'select') {
    return (
      <canvas
        ref={canvasRef}
        className="board-canvas"
        style={{ cursor: !selectable ? 'not-allowed' : overSelection || drag?.kind === 'move' ? 'move' : 'crosshair' }}
        onPointerDown={(e) => {
          if (e.button !== 0 || !selectable) return
          const c = cellAt(e)
          if (!c) return
          e.currentTarget.setPointerCapture(e.pointerId)
          if (selection && rectContains(board, selection, c.x, c.y)) {
            setDrag({ kind: 'move', sx: c.x, sy: c.y, dx: 0, dy: 0, content: readRect(board, selection) })
          } else {
            setDrag({ kind: 'select', x0: c.x, y0: c.y, x1: c.x, y1: c.y })
          }
        }}
        onPointerMove={(e) => {
          if (!drag) {
            const c = cellAt(e)
            setOverSelection(!!(c && selection && rectContains(board, selection, c.x, c.y)))
            return
          }
          const c = clampedCellAt(e)
          if (drag.kind === 'select') {
            if (c.x !== drag.x1 || c.y !== drag.y1) setDrag({ ...drag, x1: c.x, y1: c.y })
          } else {
            const dx = c.x - drag.sx
            const dy = c.y - drag.sy
            if (dx !== drag.dx || dy !== drag.dy) setDrag({ ...drag, dx, dy })
          }
        }}
        onPointerUp={() => finishDrag(true)}
        onPointerCancel={() => finishDrag(false)}
        onPointerLeave={() => setOverSelection(false)}
      />
    )
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
