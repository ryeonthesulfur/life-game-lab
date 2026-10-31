// 画面の端に小さく出るお知らせ。ボタンを1つ添えられる。

import { useCallback, useEffect, useState, type ReactNode } from 'react'

export type ToastOptions = { message: string; actionLabel?: string; onAction?: () => void }

export type ShowToastFn = (options: ToastOptions | string) => void

const DURATION_MS = 8000

export function useToast(): [ReactNode, ShowToastFn] {
  const [toast, setToast] = useState<(ToastOptions & { id: number }) | null>(null)

  const show = useCallback<ShowToastFn>((options) => {
    setToast({ ...(typeof options === 'string' ? { message: options } : options), id: Date.now() })
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), DURATION_MS)
    return () => clearTimeout(timer)
  }, [toast])

  const element = toast ? (
    <div className="toast" role="status">
      <span>{toast.message}</span>
      {toast.actionLabel && (
        <button
          onClick={() => {
            setToast(null)
            toast.onAction?.()
          }}
        >
          {toast.actionLabel}
        </button>
      )}
      <button className="toast-close" aria-label="閉じる" onClick={() => setToast(null)}>
        ×
      </button>
    </div>
  ) : null

  return [element, show]
}
