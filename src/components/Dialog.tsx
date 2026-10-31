// 確認メッセージと、タイトル入力つきのダイアログ。ask() で開き、押されたボタンの value を待つ。

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

export type DialogButton = { label: string; value: string; kind?: 'primary' | 'danger' }

export type DialogOptions = {
  title?: string
  message?: ReactNode
  input?: { label: string; value: string }
  buttons: DialogButton[]
  /** Esc や背景クリックのときに返す値（省略時は "cancel"） */
  cancelValue?: string
}

export type DialogResult = { value: string; input: string }

export type AskFn = (options: DialogOptions) => Promise<DialogResult>

type Pending = DialogOptions & { id: number; resolve: (r: DialogResult) => void }

let nextId = 0

export function useDialog(): [ReactNode, AskFn] {
  const [pending, setPending] = useState<Pending | null>(null)

  const ask = useCallback<AskFn>(
    (options) => new Promise((resolve) => setPending({ ...options, id: nextId++, resolve })),
    [],
  )

  const element = pending ? (
    <DialogView
      key={pending.id}
      options={pending}
      onClose={(result) => {
        setPending(null)
        pending.resolve(result)
      }}
    />
  ) : null

  return [element, ask]
}

function DialogView({ options, onClose }: { options: DialogOptions; onClose: (r: DialogResult) => void }) {
  const [input, setInput] = useState(options.input?.value ?? '')
  const inputRef = useRef<HTMLInputElement>(null)
  const primaryRef = useRef<HTMLButtonElement>(null)
  const cancelValue = options.cancelValue ?? 'cancel'

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    } else primaryRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose({ value: cancelValue, input })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cancelValue, input, onClose])

  const primary = options.buttons.find((b) => b.kind === 'primary')

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose({ value: cancelValue, input })}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={options.title}>
        {options.title && <h2>{options.title}</h2>}
        {options.message && <div className="dialog-message">{options.message}</div>}
        {options.input && (
          <label className="dialog-input">
            {options.input.label}
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && primary && !e.nativeEvent.isComposing) onClose({ value: primary.value, input })
              }}
            />
          </label>
        )}
        <div className="dialog-buttons">
          {options.buttons.map((b) => (
            <button
              key={b.value}
              ref={b === primary ? primaryRef : undefined}
              className={b.kind}
              onClick={() => onClose({ value: b.value, input })}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
