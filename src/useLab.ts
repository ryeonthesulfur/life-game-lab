// 実験1回分の状態と操作をまとめたフック。実験画面と記録画面の両方から使う。

import { useCallback, useEffect, useRef, useState } from 'react'
import type { AskFn } from './components/Dialog'
import type { ShowToastFn } from './components/Toast'
import { saveExperiment, SOURCE_LABELS, type Experiment, type SourceType } from './db/experiments'
import { formatDateTime, downloadText, safeFilename } from './download'
import {
  boardAsPattern,
  clearBoard,
  cloneBoard,
  countPopulation,
  createBoard,
  extractPattern,
  GRID_SIZES,
  placePattern,
  randomize,
  smallestFittingSize,
  step,
  type Board,
  type EdgeMode,
  type GridSizeKey,
  type Pattern,
} from './life/board'
import { parsePlaintext } from './life/plaintext'
import { PRESETS } from './life/presets'
import { encodeRLE, isConwayRule, parseRLE } from './life/rle'
import {
  clearRect,
  duplicateRect,
  flipHorizontal,
  flipVertical,
  hasLife,
  placeRect,
  readRect,
  rotatedRect,
  rotateRight,
  stamp,
  trimToLife,
  type Rect,
} from './life/selection'
import { StatusTracker, statusText } from './life/status'

export const CELL_SIZES = [2, 3, 4, 5, 6, 8, 10, 12, 16, 20]

/** 「1ターン戻す」で戻れる手の数 */
const UNDO_LIMIT = 100

export type BoardMode = 'draw' | 'select'

type SourcePart = { type: SourceType; detail: string }

/** 1回の実験の記録用データ。盤面そのものは別に持つ */
type Session = {
  generation: number
  /** 最初に進めた瞬間の盤面（RLE）。まだ進めていなければ null */
  initialPattern: string | null
  initialPopulation: number
  maxPopulation: number
  maxPopulationGen: number
  history: number[]
  parts: SourcePart[]
  recordId: number | null
  title: string | null
  createdAt: string | null
  /** 最後に記録してから変化があるか */
  dirty: boolean
  /** 全滅・固定の確認を出したか */
  endAsked: boolean
  /** 周期のお知らせを出したか */
  periodNotified: boolean
}

/** 1手前に戻すための控え。盤面と、記録用データのうち手ごとに変わる部分 */
type UndoEntry = {
  cells: Uint8Array
  generation: number
  initialPattern: string | null
  initialPopulation: number
  maxPopulation: number
  maxPopulationGen: number
  historyLength: number
  parts: SourcePart[]
  endAsked: boolean
  periodNotified: boolean
}

function newSession(): Session {
  return {
    generation: 0,
    initialPattern: null,
    initialPopulation: 0,
    maxPopulation: 0,
    maxPopulationGen: 0,
    history: [],
    parts: [],
    recordId: null,
    title: null,
    createdAt: null,
    dirty: false,
    endAsked: false,
    periodNotified: false,
  }
}

function sourceOf(parts: SourcePart[]): { type: SourceType; detail: string } {
  if (parts.length === 0) return { type: 'manual', detail: '' }
  if (parts.length === 1) return parts[0]
  return {
    type: 'mixed',
    detail: parts.map((p) => (p.detail ? `${SOURCE_LABELS[p.type]}(${p.detail})` : SOURCE_LABELS[p.type])).join(' + '),
  }
}

function autoTitle(parts: SourcePart[]): string {
  const { type, detail } = sourceOf(parts)
  const label =
    type === 'preset' ? detail
    : type === 'random' ? `ランダム${detail.replace('密度', '')}`
    : type === 'file' ? detail.replace(/\.[^.]+$/, '')
    : SOURCE_LABELS[type]
  return `${label} ${formatDateTime(new Date().toISOString()).slice(5)}`
}

/** 選択枠の中身をそのまま使う（移動・複製） */
const same = (p: Pattern) => p

function parsePatternFile(name: string, text: string): Pattern {
  if (/\.cells$/i.test(name)) return parsePlaintext(text)
  if (/\.rle$/i.test(name)) return parseRLE(text)
  try {
    return parseRLE(text)
  } catch {
    return parsePlaintext(text)
  }
}

export function useLab(ask: AskFn, showToast: ShowToastFn) {
  const [size, setSize] = useState<GridSizeKey>('small')
  const [edge, setEdgeState] = useState<EdgeMode>('wrap')
  const [running, setRunning] = useState(false)
  const [speed, setSpeed] = useState(10)
  const [density, setDensity] = useState(25)
  const [cellSize, setCellSize] = useState(GRID_SIZES.small.cellSize)
  const [inverted, setInverted] = useState(false)
  const [version, setVersion] = useState(0)
  const [mode, setModeState] = useState<BoardMode>('draw')
  const [selection, setSelection] = useState<Rect | null>(null)

  const boardRef = useRef<Board>(createBoard(GRID_SIZES.small.width, GRID_SIZES.small.height))
  const spareRef = useRef<Board>(createBoard(GRID_SIZES.small.width, GRID_SIZES.small.height))
  const trackerRef = useRef(new StatusTracker())
  const sessionRef = useRef<Session>(newSession())
  const edgeRef = useRef<EdgeMode>('wrap')
  const undoRef = useRef<UndoEntry[]>([])

  const redraw = useCallback(() => setVersion((v) => v + 1), [])

  const isInExperiment = useCallback(() => sessionRef.current.generation >= 1 && sessionRef.current.dirty, [])

  /** 過去の盤面が当てにならなくなったときに、判定をやり直す */
  const resetTracker = useCallback(() => {
    trackerRef.current.reset()
    if (sessionRef.current.generation > 0) trackerRef.current.observe(boardRef.current, sessionRef.current.generation)
  }, [])

  /** 盤面がリセットされたときに、戻せる手と選択枠を捨てる */
  const forgetHistory = useCallback(() => {
    undoRef.current = []
    setSelection(null)
  }, [])

  const replaceBoard = useCallback((key: GridSizeKey) => {
    const s = GRID_SIZES[key]
    boardRef.current = createBoard(s.width, s.height)
    spareRef.current = createBoard(s.width, s.height)
    setSize(key)
    setCellSize(s.cellSize)
    forgetHistory()
  }, [forgetHistory])

  const startNewSession = useCallback(() => {
    sessionRef.current = newSession()
    trackerRef.current.reset()
    forgetHistory()
  }, [forgetHistory])

  // ---- 1ターン戻す ----

  /** 盤面を変える直前に呼び、今の状態を控えておく */
  const pushUndo = useCallback(() => {
    const s = sessionRef.current
    undoRef.current.push({
      cells: boardRef.current.cells.slice(),
      generation: s.generation,
      initialPattern: s.initialPattern,
      initialPopulation: s.initialPopulation,
      maxPopulation: s.maxPopulation,
      maxPopulationGen: s.maxPopulationGen,
      historyLength: s.history.length,
      parts: [...s.parts],
      endAsked: s.endAsked,
      periodNotified: s.periodNotified,
    })
    if (undoRef.current.length > UNDO_LIMIT) undoRef.current.shift()
  }, [])

  // ---- 記録 ----

  const record = useCallback(async (): Promise<boolean> => {
    const s = sessionRef.current
    const board = boardRef.current
    const defaultTitle = s.title ?? autoTitle(s.parts)
    const res = await ask({
      title: s.recordId ? '記録を更新する' : 'この実験を記録する',
      input: { label: 'タイトル', value: defaultTitle },
      buttons: [
        { label: 'キャンセル', value: 'cancel' },
        { label: s.recordId ? '更新する' : '記録する', value: 'save', kind: 'primary' },
      ],
    })
    if (res.value !== 'save') return false

    const population = countPopulation(board)
    if (s.initialPattern === null) {
      // まだ1ターンも進めていなければ、今の盤面を初期配置とする
      s.initialPattern = encodeRLE(boardAsPattern(board))
      s.initialPopulation = population
      s.maxPopulation = population
      s.history = [population]
    }
    const title = res.input.trim() || defaultTitle
    const now = new Date().toISOString()
    const status = trackerRef.current.current
    const source = sourceOf(s.parts)
    const experiment: Experiment = {
      ...(s.recordId !== null && { id: s.recordId }),
      title,
      created_at: s.createdAt ?? now,
      updated_at: now,
      generations: s.generation,
      population,
      initial_population: s.initialPopulation,
      max_population: s.maxPopulation,
      max_population_gen: s.maxPopulationGen,
      status: s.generation === 0 ? 'running' : status.status,
      period: status.period,
      status_gen: status.statusGen,
      grid_size: size,
      source_type: source.type,
      source_detail: source.detail || undefined,
      initial_pattern: s.initialPattern,
      final_pattern: encodeRLE(boardAsPattern(board)),
      population_history: s.history,
    }
    try {
      s.recordId = await saveExperiment(experiment)
    } catch (e) {
      await ask({ title: '記録できませんでした', message: String(e), buttons: [{ label: 'OK', value: 'ok', kind: 'primary' }] })
      return false
    }
    s.title = title
    s.createdAt = experiment.created_at
    s.dirty = false
    showToast(`「${title}」を記録しました`)
    redraw()
    return true
  }, [ask, showToast, redraw, size])

  /** 盤面をリセットする前の確認。続けてよければ true */
  const confirmReset = useCallback(async (): Promise<boolean> => {
    if (!isInExperiment()) return true
    setRunning(false)
    const res = await ask({
      message: '実験中です。今の実験を記録してから、新しく始めますか？',
      buttons: [
        { label: 'キャンセル', value: 'cancel' },
        { label: '記録せずに始める', value: 'discard' },
        { label: '記録して始める', value: 'save', kind: 'primary' },
      ],
    })
    if (res.value === 'save') return record()
    return res.value === 'discard'
  }, [ask, isInExperiment, record])

  // ---- 進める ----

  const advance = useCallback(() => {
    const s = sessionRef.current
    const tracker = trackerRef.current
    pushUndo()
    if (s.generation === 0) {
      const population = countPopulation(boardRef.current)
      s.initialPattern = encodeRLE(boardAsPattern(boardRef.current))
      s.initialPopulation = population
      s.maxPopulation = population
      s.maxPopulationGen = 0
      s.history = [population]
      tracker.reset()
      tracker.observe(boardRef.current, 0)
    }
    const next = step(boardRef.current, edgeRef.current, spareRef.current)
    spareRef.current = boardRef.current
    boardRef.current = next
    s.generation++
    s.dirty = true
    const population = countPopulation(next)
    s.history.push(population)
    if (population > s.maxPopulation) {
      s.maxPopulation = population
      s.maxPopulationGen = s.generation
    }
    return tracker.observe(next, s.generation)
  }, [pushUndo])

  /** 進めたあとの結末チェック。止めたら true */
  const checkEnding = useCallback((): boolean => {
    const s = sessionRef.current
    const r = trackerRef.current.current
    if ((r.status === 'extinct' || r.status === 'still') && !s.endAsked) {
      s.endAsked = true
      setRunning(false)
      const message = r.status === 'extinct'
        ? `全滅しました（ターン${r.statusGen}）。記録しますか？`
        : `変化が止まりました（ターン${r.statusGen}）。記録しますか？`
      void ask({
        message,
        buttons: [
          { label: '記録しない', value: 'cancel' },
          { label: '記録する', value: 'save', kind: 'primary' },
        ],
      }).then((res) => {
        if (res.value === 'save') void record()
      })
      return true
    }
    if (r.status === 'oscillating' && !s.periodNotified) {
      s.periodNotified = true
      showToast({
        message: `周期${r.period}に入りました（ターン${r.statusGen}）`,
        actionLabel: '停止して記録',
        onAction: () => {
          setRunning(false)
          void record()
        },
      })
    }
    return false
  }, [ask, record, showToast])

  const canStart = useCallback(() => {
    if (sessionRef.current.generation === 0 && countPopulation(boardRef.current) === 0) {
      showToast('住人を置いてから始めてください')
      return false
    }
    return true
  }, [showToast])

  const togglePlay = useCallback(() => {
    if (running) setRunning(false)
    else if (canStart()) {
      // 再生すると、選択枠はその時点の配置で確定する
      setSelection(null)
      setRunning(true)
    }
  }, [running, canStart])

  const stepOnce = useCallback(() => {
    if (running || !canStart()) return
    advance()
    checkEnding()
    redraw()
  }, [running, canStart, advance, checkEnding, redraw])

  const stepBack = useCallback(() => {
    if (running) return
    const entry = undoRef.current.pop()
    if (!entry) return
    boardRef.current.cells.set(entry.cells)
    const s = sessionRef.current
    s.generation = entry.generation
    s.initialPattern = entry.initialPattern
    s.initialPopulation = entry.initialPopulation
    s.maxPopulation = entry.maxPopulation
    s.maxPopulationGen = entry.maxPopulationGen
    s.history.length = entry.historyLength
    s.parts = entry.parts
    s.endAsked = entry.endAsked
    s.periodNotified = entry.periodNotified
    s.dirty = true
    resetTracker()
    setSelection(null)
    redraw()
  }, [running, resetTracker, redraw])

  // 再生中は、速さ（ターン/秒）に合わせて進める
  useEffect(() => {
    if (!running) return
    let frame = 0
    let last = performance.now()
    let carry = 0
    const tick = (now: number) => {
      carry += ((now - last) * speed) / 1000
      last = now
      // 描画が間に合わない環境でも速さを保てるよう追いつくが、
      // 裏タブから戻ったときなどに溜まった分を一気に計算しないよう、0.25秒分までにする
      const maxTurns = Math.max(1, Math.ceil(speed / 4))
      const turns = Math.min(Math.floor(carry), maxTurns)
      carry = Math.min(carry - turns, maxTurns)
      let stopped = false
      for (let i = 0; i < turns && !stopped; i++) {
        advance()
        stopped = checkEnding()
      }
      if (turns > 0) redraw()
      if (!stopped) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [running, speed, advance, checkEnding, redraw])

  // ---- 盤面の編集 ----

  /** 実験の途中で盤面を手で変えたとき */
  const afterEdit = useCallback(() => {
    const s = sessionRef.current
    if (s.generation > 0) {
      s.dirty = true
      s.endAsked = false
      s.periodNotified = false
      resetTracker()
    }
    redraw()
  }, [resetTracker, redraw])

  const addPart = useCallback((part: SourcePart) => {
    const s = sessionRef.current
    if (s.generation === 0 && countPopulation(boardRef.current) === 0) s.parts = [part]
    else if (!(part.type === 'manual' && s.parts.some((p) => p.type === 'manual'))) {
      if (s.parts.length === 0) s.parts = [{ type: 'manual', detail: '' }]
      s.parts.push(part)
    }
  }, [])

  const onStrokeStart = useCallback(() => {
    pushUndo()
    addPart({ type: 'manual', detail: '' })
  }, [pushUndo, addPart])

  const paint = useCallback((x: number, y: number, alive: boolean) => {
    const b = boardRef.current
    b.cells[y * b.width + x] = alive ? 1 : 0
    redraw()
  }, [redraw])

  const clear = useCallback(async () => {
    if (!(await confirmReset())) return
    setRunning(false)
    clearBoard(boardRef.current)
    startNewSession()
    redraw()
  }, [confirmReset, startNewSession, redraw])

  const random = useCallback(async () => {
    if (!(await confirmReset())) return
    setRunning(false)
    randomize(boardRef.current, density / 100)
    startNewSession()
    sessionRef.current.parts = [{ type: 'random', detail: `密度${density}%` }]
    redraw()
  }, [confirmReset, density, startNewSession, redraw])

  const changeSize = useCallback(async (key: GridSizeKey) => {
    if (key === size || !(await confirmReset())) return
    setRunning(false)
    replaceBoard(key)
    startNewSession()
    redraw()
  }, [size, confirmReset, replaceBoard, startNewSession, redraw])

  const placePreset = useCallback((id: string) => {
    const preset = PRESETS.find((p) => p.id === id)
    if (!preset) return
    pushUndo()
    addPart({ type: 'preset', detail: preset.name })
    placePattern(boardRef.current, parseRLE(preset.rle))
    afterEdit()
  }, [pushUndo, addPart, afterEdit])

  // ---- 選択モード ----

  const setMode = useCallback((next: BoardMode) => {
    setModeState(next)
    setSelection(null)
  }, [])

  /** 囲んだ範囲を、住人がちょうど収まる枠にする。住人がいなければ枠を消す */
  const select = useCallback((rect: Rect | null) => {
    setSelection(rect && trimToLife(boardRef.current, rect))
  }, [])

  /**
   * 選択枠の中身を make で変えて target に置く。
   * 置く先にほかの住人がいれば確認を出す。keepSource なら元の場所は残す（複製）
   */
  const applySelection = useCallback(async (
    target: Rect | null,
    make: (p: Pattern) => Pattern,
    { keepSource = false, failMessage = '' } = {},
  ) => {
    if (running || !selection) return
    if (!target) {
      showToast(failMessage)
      return
    }
    const board = boardRef.current
    const content = make(readRect(board, selection))
    const next = cloneBoard(board)
    if (!keepSource) clearRect(next, selection)
    if (hasLife(next, target)) {
      const res = await ask({
        message: '重なってしまいますがよろしいですか？',
        buttons: [
          { label: 'いいえ', value: 'cancel' },
          { label: 'はい', value: 'ok', kind: 'primary' },
        ],
      })
      if (res.value !== 'ok') return
    }
    pushUndo()
    stamp(next, content, target.x, target.y)
    board.cells.set(next.cells)
    setSelection(target)
    afterEdit()
  }, [running, selection, ask, showToast, pushUndo, afterEdit])

  const moveSelection = useCallback((dx: number, dy: number) => {
    if (!selection) return
    const target = placeRect(boardRef.current, { ...selection, x: selection.x + dx, y: selection.y + dy }, edgeRef.current)
    if (target && target.x === selection.x && target.y === selection.y) return
    void applySelection(target, same)
  }, [selection, applySelection])

  const duplicateSelection = useCallback(() => {
    if (!selection) return
    void applySelection(duplicateRect(boardRef.current, selection, edgeRef.current), same, {
      keepSource: true,
      failMessage: 'これ以上右に複製できません',
    })
  }, [selection, applySelection])

  const rotateSelection = useCallback(() => {
    if (!selection) return
    void applySelection(placeRect(boardRef.current, rotatedRect(selection), edgeRef.current), rotateRight, {
      failMessage: '盤面に入りきらないので回転できません',
    })
  }, [selection, applySelection])

  const flipSelection = useCallback((direction: 'horizontal' | 'vertical') => {
    void applySelection(selection, direction === 'horizontal' ? flipHorizontal : flipVertical)
  }, [selection, applySelection])

  const setEdge = useCallback((mode: EdgeMode) => {
    edgeRef.current = mode
    setEdgeState(mode)
    resetTracker()
    redraw()
  }, [resetTracker, redraw])

  // ---- ファイル ----

  const loadFile = useCallback(async (file: File) => {
    let pattern: Pattern
    try {
      pattern = parsePatternFile(file.name, await file.text())
    } catch (e) {
      await ask({
        title: 'ファイルを読み込めませんでした',
        message: e instanceof Error ? e.message : String(e),
        buttons: [{ label: 'OK', value: 'ok', kind: 'primary' }],
      })
      return
    }
    if (!(await confirmReset())) return
    setRunning(false)

    if (!isConwayRule(pattern.rule)) {
      const res = await ask({
        message: `このパターンは別のルール（${pattern.rule}）用です。B3/S23で動かしますか？`,
        buttons: [
          { label: 'キャンセル', value: 'cancel' },
          { label: 'B3/S23で動かす', value: 'ok', kind: 'primary' },
        ],
      })
      if (res.value !== 'ok') return
    }

    let target = size
    const current = GRID_SIZES[size]
    if (pattern.width > current.width || pattern.height > current.height) {
      const fit = smallestFittingSize(pattern)
      const suggestion = fit ?? 'large'
      const res = await ask({
        message: fit
          ? `パターン（${pattern.width}×${pattern.height}）が盤面より大きいです。${GRID_SIZES[fit].label}サイズに切り替えますか？`
          : `パターン（${pattern.width}×${pattern.height}）は大サイズにも収まりません。大サイズに切り替えて、はみ出た部分を切り捨てますか？`,
        buttons: [
          { label: 'キャンセル', value: 'cancel' },
          ...(suggestion !== size ? [{ label: 'このまま（はみ出しを切り捨て）', value: 'keep' }] : []),
          { label: `${GRID_SIZES[suggestion].label}サイズに切り替える`, value: 'switch', kind: 'primary' as const },
        ],
      })
      if (res.value === 'cancel') return
      if (res.value === 'switch') target = suggestion
    }

    if (target !== size) replaceBoard(target)
    else clearBoard(boardRef.current)
    startNewSession()
    sessionRef.current.parts = [{ type: 'file', detail: file.name }]
    placePattern(boardRef.current, pattern)
    redraw()
    showToast(`「${pattern.name ?? file.name}」を読み込みました`)
  }, [ask, confirmReset, size, replaceBoard, startNewSession, redraw, showToast])

  const saveFile = useCallback(() => {
    const pattern = extractPattern(boardRef.current)
    if (pattern.width === 0) {
      showToast('住人がいないので保存できません')
      return
    }
    const s = sessionRef.current
    const name = s.title ?? autoTitle(s.parts)
    const text = encodeRLE(pattern, {
      name,
      comments: [`${formatDateTime(new Date().toISOString())} ターン${s.generation}`],
    })
    downloadText(`${safeFilename(name)}.rle`, text)
  }, [showToast])

  // ---- 記録画面から ----

  const restartFrom = useCallback(async (exp: Experiment): Promise<boolean> => {
    if (!(await confirmReset())) return false
    setRunning(false)
    replaceBoard(exp.grid_size)
    startNewSession()
    placePattern(boardRef.current, parseRLE(exp.initial_pattern), 0, 0)
    sessionRef.current.parts = [{ type: exp.source_type, detail: exp.source_detail ?? '' }]
    redraw()
    return true
  }, [confirmReset, replaceBoard, startNewSession, redraw])

  const continueFrom = useCallback(async (exp: Experiment): Promise<boolean> => {
    if (!(await confirmReset())) return false
    setRunning(false)
    replaceBoard(exp.grid_size)
    placePattern(boardRef.current, parseRLE(exp.final_pattern), 0, 0)
    sessionRef.current = {
      ...newSession(),
      generation: exp.generations,
      initialPattern: exp.initial_pattern,
      initialPopulation: exp.initial_population,
      maxPopulation: exp.max_population,
      maxPopulationGen: exp.max_population_gen,
      history: [...exp.population_history],
      parts: [{ type: exp.source_type, detail: exp.source_detail ?? '' }],
      recordId: exp.id ?? null,
      title: exp.title,
      createdAt: exp.created_at,
      endAsked: exp.status === 'extinct' || exp.status === 'still',
      periodNotified: exp.status === 'oscillating',
    }
    resetTracker()
    redraw()
    return true
  }, [confirmReset, replaceBoard, resetTracker, redraw])

  // 実験中にタブを閉じようとしたら、ブラウザ標準の確認を出す
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isInExperiment()) e.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isInExperiment])

  const s = sessionRef.current
  const st = trackerRef.current.current
  return {
    board: boardRef.current,
    version,
    size,
    edge,
    mode,
    selection,
    running,
    speed,
    density,
    cellSize,
    inverted,
    generation: s.generation,
    population: countPopulation(boardRef.current),
    statusLabel: s.generation === 0 ? '未開始' : statusText(st.status, st.period),
    isRecorded: s.recordId !== null,
    isInExperiment,
    setRunning,
    setSpeed,
    setDensity,
    setCellSize,
    setInverted,
    togglePlay,
    stepOnce,
    stepBack,
    canStepBack: undoRef.current.length > 0,
    clear,
    random,
    changeSize,
    placePreset,
    setEdge,
    loadFile,
    saveFile,
    record,
    onStrokeStart,
    paint,
    onStrokeEnd: afterEdit,
    setMode,
    select,
    moveSelection,
    duplicateSelection,
    rotateSelection,
    flipSelection,
    restartFrom,
    continueFrom,
  }
}

export type Lab = ReturnType<typeof useLab>
