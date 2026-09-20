import { useCallback, useEffect, useRef, useState } from 'react'

type UseResizableOpts = {
  storageKey?: string
  initial: number
  min: number
  max: number
  step?: number
}

export function useResizable({ storageKey, initial, min, max, step = 8 }: UseResizableOpts) {
  const [width, setWidth] = useState<number>(() => {
    if (!storageKey || typeof window === 'undefined') return initial
    try {
      const raw = window.localStorage?.getItem(storageKey)
      if (raw) {
        const n = Number(raw)
        if (Number.isFinite(n)) return clamp(n, min, max)
      }
    } catch {
      /* no localStorage (SSR / jsdom without storage mock) */
    }
    return initial
  })

  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') return
    try {
      window.localStorage?.setItem(storageKey, String(width))
    } catch {
      /* ignore */
    }
  }, [storageKey, width])

  const draggingRef = useRef<{ startX: number; startW: number; direction: 1 | -1 } | null>(null)

  const onPointerDown = useCallback(
    (e: React.PointerEvent, direction: 1 | -1 = 1) => {
      e.preventDefault()
      ;(e.target as Element).setPointerCapture?.(e.pointerId)
      draggingRef.current = { startX: e.clientX, startW: width, direction }
    },
    [width],
  )

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        e.preventDefault()
        setWidth((current) => clamp(current + step, min, max))
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        e.preventDefault()
        setWidth((current) => clamp(current - step, min, max))
      } else if (e.key === 'Home') {
        e.preventDefault()
        setWidth(min)
      } else if (e.key === 'End') {
        e.preventDefault()
        setWidth(max)
      }
    },
    [max, min, step],
  )

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = draggingRef.current
      if (!d) return
      const delta = (e.clientX - d.startX) * d.direction
      setWidth(clamp(d.startW + delta, min, max))
    }
    const onUp = () => {
      draggingRef.current = null
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [min, max])

  return { width, setWidth, onPointerDown, onKeyDown, min, max }
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}
