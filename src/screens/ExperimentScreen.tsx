import { useRef, useState } from 'react'
import { BoardCanvas } from '../components/BoardCanvas'
import { GRID_SIZES, type GridSizeKey } from '../life/board'
import { PRESETS } from '../life/presets'
import { CELL_SIZES, type Lab } from '../useLab'

const SIZE_KEYS: GridSizeKey[] = ['small', 'medium', 'large']
const PRESET_GROUPS = [...new Set(PRESETS.map((p) => p.group))]

export function ExperimentScreen({ lab }: { lab: Lab }) {
  const [presetId, setPresetId] = useState(PRESETS.find((p) => p.id === 'glider')!.id)
  const fileRef = useRef<HTMLInputElement>(null)
  const zoomIndex = CELL_SIZES.indexOf(lab.cellSize)

  return (
    <div className="experiment">
      <div className="status-bar">
        <span>ターン: <b>{lab.generation}</b></span>
        <span>住人: <b>{lab.population}</b></span>
        <span>状態: <b>{lab.statusLabel}</b></span>
      </div>

      <div className={`board-wrap${lab.inverted ? ' inverted' : ''}`}>
        <BoardCanvas
          board={lab.board}
          version={lab.version}
          cellSize={lab.cellSize}
          inverted={lab.inverted}
          onStrokeStart={lab.onStrokeStart}
          onPaint={lab.paint}
          onStrokeEnd={lab.onStrokeEnd}
          mode={lab.mode}
          edge={lab.edge}
          selection={lab.selection}
          selectable={!lab.running}
          onSelect={lab.select}
          onMoveSelection={lab.moveSelection}
        />
      </div>

      <div className="controls">
        <div className="row">
          <button className="primary play" onClick={lab.togglePlay}>
            {lab.running ? '⏸ 停止' : '▶ 再生'}
          </button>
          <button onClick={lab.stepBack} disabled={lab.running || !lab.canStepBack}>1ターン戻す</button>
          <button onClick={lab.stepOnce} disabled={lab.running}>1ターン進める</button>
          <label className="slider">
            速さ
            <input type="range" min={1} max={60} value={lab.speed} onChange={(e) => lab.setSpeed(Number(e.target.value))} />
            <span className="value">{lab.speed}ターン/秒</span>
          </label>
        </div>

        <div className="row">
          <fieldset>
            <legend>操作</legend>
            <label><input type="radio" checked={lab.mode === 'draw'} onChange={() => lab.setMode('draw')} />描く</label>
            <label><input type="radio" checked={lab.mode === 'select'} onChange={() => lab.setMode('select')} />選択</label>
          </fieldset>
          {lab.mode === 'select' && (
            <>
              <button onClick={lab.duplicateSelection} disabled={lab.running || !lab.selection}>複製</button>
              <button onClick={lab.rotateSelection} disabled={lab.running || !lab.selection}>右に回転</button>
              <button onClick={() => lab.flipSelection('horizontal')} disabled={lab.running || !lab.selection}>左右反転</button>
              <button onClick={() => lab.flipSelection('vertical')} disabled={lab.running || !lab.selection}>上下反転</button>
              <span className="hint">
                {lab.running ? '一時停止中に使えます' : lab.selection ? '枠の中をドラッグで移動' : '盤面をドラッグして囲む'}
              </span>
            </>
          )}
        </div>

        <div className="row">
          <button onClick={() => void lab.clear()}>クリア</button>
          <button onClick={() => void lab.random()}>ランダム</button>
          <label className="slider">
            密度
            <input type="range" min={5} max={80} value={lab.density} onChange={(e) => lab.setDensity(Number(e.target.value))} />
            <span className="value">{lab.density}%</span>
          </label>
        </div>

        <div className="row">
          <label>
            プリセット
            <select value={presetId} onChange={(e) => setPresetId(e.target.value)}>
              {PRESET_GROUPS.map((group) => (
                <optgroup key={group} label={group}>
                  {PRESETS.filter((p) => p.group === group).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.recommended === 'medium' ? '（中以上推奨）' : p.recommended === 'large' ? '（大推奨）' : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <button onClick={() => lab.placePreset(presetId)}>置く</button>
        </div>

        <div className="row">
          <button onClick={() => fileRef.current?.click()}>ファイル読み込み</button>
          <input
            ref={fileRef}
            type="file"
            accept=".rle,.cells,.txt"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void lab.loadFile(file)
            }}
          />
          <button onClick={lab.saveFile}>ファイルに保存</button>
        </div>

        <div className="row">
          <fieldset>
            <legend>端の扱い</legend>
            <label><input type="radio" checked={lab.edge === 'wrap'} onChange={() => lab.setEdge('wrap')} />つなげる</label>
            <label><input type="radio" checked={lab.edge === 'dead'} onChange={() => lab.setEdge('dead')} />空き家とみなす</label>
          </fieldset>
        </div>

        <div className="row">
          <fieldset>
            <legend>サイズ</legend>
            {SIZE_KEYS.map((key) => (
              <label key={key} title={`${GRID_SIZES[key].width}×${GRID_SIZES[key].height}`}>
                <input type="radio" checked={lab.size === key} onChange={() => void lab.changeSize(key)} />
                {GRID_SIZES[key].label}
              </label>
            ))}
          </fieldset>
          <button aria-label="拡大" onClick={() => lab.setCellSize(CELL_SIZES[zoomIndex + 1])} disabled={zoomIndex >= CELL_SIZES.length - 1}>
            🔍＋
          </button>
          <button aria-label="縮小" onClick={() => lab.setCellSize(CELL_SIZES[zoomIndex - 1])} disabled={zoomIndex <= 0}>
            🔍－
          </button>
          <button onClick={() => lab.setInverted((v) => !v)} aria-pressed={lab.inverted}>白黒反転</button>
        </div>

        <div className="row">
          <button className="primary" onClick={() => void lab.record()}>
            {lab.isRecorded ? '記録を更新する' : 'この実験を記録する'}
          </button>
        </div>
      </div>
    </div>
  )
}
