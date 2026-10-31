import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AskFn } from '../components/Dialog'
import type { ShowToastFn } from '../components/Toast'
import {
  deleteExperiments,
  exportJSON,
  importJSON,
  listExperiments,
  saveExperiment,
  SOURCE_LABELS,
  type Experiment,
} from '../db/experiments'
import { downloadText, formatDateTime, safeFilename } from '../download'
import { extractPattern, GRID_SIZES } from '../life/board'
import { encodeRLE, parseRLE } from '../life/rle'
import { statusText } from '../life/status'

type SortKey = 'date-desc' | 'date-asc' | 'generations' | 'population' | 'title'

const SORTS: { key: SortKey; label: string; compare: (a: Experiment, b: Experiment) => number }[] = [
  { key: 'date-desc', label: '日付が新しい順', compare: (a, b) => b.created_at.localeCompare(a.created_at) },
  { key: 'date-asc', label: '日付が古い順', compare: (a, b) => a.created_at.localeCompare(b.created_at) },
  { key: 'generations', label: 'ターン数が多い順', compare: (a, b) => b.generations - a.generations },
  { key: 'population', label: '住人が多い順', compare: (a, b) => b.population - a.population },
  { key: 'title', label: 'タイトル順', compare: (a, b) => a.title.localeCompare(b.title, 'ja') },
]

type Props = {
  active: boolean
  ask: AskFn
  showToast: ShowToastFn
  onRestart: (exp: Experiment) => Promise<boolean>
  onContinue: (exp: Experiment) => Promise<boolean>
}

export function RecordsScreen({ active, ask, showToast, onRestart, onContinue }: Props) {
  const [records, setRecords] = useState<Experiment[]>([])
  const [sort, setSort] = useState<SortKey>('date-desc')
  const [query, setQuery] = useState('')
  const [deleteMode, setDeleteMode] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [detail, setDetail] = useState<Experiment | null>(null)
  const importRef = useRef<HTMLInputElement>(null)

  const reload = useCallback(async () => setRecords(await listExperiments()), [])

  useEffect(() => {
    if (active) void reload()
  }, [active, reload])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const compare = SORTS.find((s) => s.key === sort)!.compare
    return records.filter((r) => !q || r.title.toLowerCase().includes(q)).sort(compare)
  }, [records, sort, query])

  const allChecked = visible.length > 0 && visible.every((r) => selected.has(r.id!))

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const exitDeleteMode = () => {
    setDeleteMode(false)
    setSelected(new Set())
  }

  const deleteSelected = async () => {
    const res = await ask({
      message: `本当に削除しますか？（件数：${selected.size}件）`,
      buttons: [
        { label: 'いいえ', value: 'cancel' },
        { label: 'はい', value: 'ok', kind: 'danger' },
      ],
    })
    if (res.value !== 'ok') return
    await deleteExperiments([...selected])
    showToast(`${selected.size}件削除しました`)
    exitDeleteMode()
    await reload()
  }

  const importFile = async (file: File) => {
    try {
      const n = await importJSON(await file.text())
      showToast(`${n}件の記録を読み込みました`)
      await reload()
    } catch (e) {
      await ask({
        title: '記録を読み込めませんでした',
        message: e instanceof Error ? e.message : String(e),
        buttons: [{ label: 'OK', value: 'ok', kind: 'primary' }],
      })
    }
  }

  return (
    <div className="records">
      <div className="records-toolbar">
        <label>
          並び替え
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </label>
        <label>
          検索
          <input type="search" value={query} placeholder="タイトル" onChange={(e) => setQuery(e.target.value)} />
        </label>
        <span className="spacer" />
        <button className={deleteMode ? 'active' : ''} onClick={() => (deleteMode ? exitDeleteMode() : setDeleteMode(true))}>
          削除
        </button>
        {deleteMode && (
          <button className="danger" aria-label="選んだ記録を削除" disabled={selected.size === 0} onClick={() => void deleteSelected()}>
            🗑
          </button>
        )}
      </div>

      {records.length === 0 ? (
        <p className="empty">まだ記録がありません。実験画面の「この実験を記録する」で保存できます。</p>
      ) : (
        <table className="records-table">
          <thead>
            <tr>
              {deleteMode && (
                <th className="check">
                  <input
                    type="checkbox"
                    aria-label="すべて選択"
                    checked={allChecked}
                    onChange={() => setSelected(allChecked ? new Set() : new Set(visible.map((r) => r.id!)))}
                  />
                </th>
              )}
              <th>日付</th>
              <th>タイトル</th>
              <th>サイズ</th>
              <th className="num">ターン</th>
              <th className="num">住人</th>
              <th>状態</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr
                key={r.id}
                className={deleteMode && selected.has(r.id!) ? 'selected' : ''}
                onClick={() => (deleteMode ? toggle(r.id!) : setDetail(r))}
              >
                {deleteMode && (
                  <td className="check">
                    <input type="checkbox" checked={selected.has(r.id!)} onChange={() => toggle(r.id!)} onClick={(e) => e.stopPropagation()} />
                  </td>
                )}
                <td>{formatDateTime(r.created_at)}</td>
                <td>{r.title}</td>
                <td>{GRID_SIZES[r.grid_size].label}</td>
                <td className="num">{r.generations}</td>
                <td className="num">{r.population}</td>
                <td>{statusText(r.status, r.period)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="records-footer">
        <button onClick={async () => downloadText(`life-game-lab-records-${new Date().toISOString().slice(0, 10)}.json`, await exportJSON(), 'application/json')}>
          全記録を書き出す(JSON)
        </button>
        <button onClick={() => importRef.current?.click()}>記録を読み込む(JSON)</button>
        <input
          ref={importRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) void importFile(file)
          }}
        />
      </div>

      {detail && (
        <RecordDetail
          record={detail}
          onClose={() => setDetail(null)}
          onSaved={async (updated) => {
            setDetail(updated)
            await reload()
            showToast('タイトルを保存しました')
          }}
          onRestart={async () => {
            if (await onRestart(detail)) setDetail(null)
          }}
          onContinue={async () => {
            if (await onContinue(detail)) setDetail(null)
          }}
        />
      )}
    </div>
  )
}

type DetailProps = {
  record: Experiment
  onClose: () => void
  onSaved: (r: Experiment) => void
  onRestart: () => void
  onContinue: () => void
}

function RecordDetail({ record: r, onClose, onSaved, onRestart, onContinue }: DetailProps) {
  const [title, setTitle] = useState(r.title)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const saveTitle = async () => {
    const updated = { ...r, title: title.trim() || r.title, updated_at: new Date().toISOString() }
    await saveExperiment(updated)
    onSaved(updated)
  }

  const exportPattern = (which: 'initial' | 'final') => {
    const pattern = extractPattern(parseRLE(which === 'initial' ? r.initial_pattern : r.final_pattern))
    const turn = which === 'initial' ? 0 : r.generations
    const text = encodeRLE(pattern, { name: r.title, comments: [`${formatDateTime(r.created_at)} ターン${turn}`] })
    downloadText(`${safeFilename(r.title)}_${which === 'initial' ? '初期配置' : `ターン${turn}`}.rle`, text)
  }

  const source = r.source_detail ? `${SOURCE_LABELS[r.source_type]}（${r.source_detail}）` : SOURCE_LABELS[r.source_type]
  const rows: [string, string][] = [
    ['記録日時', formatDateTime(r.created_at)],
    ['更新日時', formatDateTime(r.updated_at)],
    ['サイズ', `${GRID_SIZES[r.grid_size].label}（${GRID_SIZES[r.grid_size].width}×${GRID_SIZES[r.grid_size].height}）`],
    ['ターン数', String(r.generations)],
    ['住人の数', String(r.population)],
    ['最初の住人の数', String(r.initial_population)],
    ['最も多かった住人の数', `${r.max_population}（ターン${r.max_population_gen}）`],
    ['状態', statusText(r.status, r.period)],
    ['結末が決まったターン', r.status_gen === undefined ? '—' : String(r.status_gen)],
    ['初期配置の作り方', source],
  ]

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog detail" role="dialog" aria-modal="true" aria-label="記録の詳細">
        <h2>記録の詳細</h2>
        <label className="dialog-input">
          タイトル
          <span className="inline">
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
            <button onClick={() => void saveTitle()} disabled={title.trim() === r.title || !title.trim()}>保存</button>
          </span>
        </label>
        <dl className="detail-list">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <div className="dialog-buttons wrap">
          <button onClick={() => exportPattern('initial')}>初期配置をRLEで書き出す</button>
          <button onClick={() => exportPattern('final')}>最終盤面をRLEで書き出す</button>
        </div>
        <div className="dialog-buttons">
          <button onClick={onClose}>閉じる</button>
          <button onClick={onContinue}>最後の盤面から続ける</button>
          <button className="primary" onClick={onRestart}>最初の配置から再実験</button>
        </div>
      </div>
    </div>
  )
}
