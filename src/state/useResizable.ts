import { useCallback, useEffect, useRef, useState } from 'react'

type UseResizableOpts = {
  storageKey?: string
  initial: number
  min: number
  max: number
}

export function useResizable({ storageKey, initial, min, max }: UseResizableOpts) {
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

  return { width, setWidth, onPointerDown }
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}
