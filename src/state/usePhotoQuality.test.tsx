import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { usePhotoQuality } from './usePhotoQuality'

describe('usePhotoQuality', () => {
  beforeEach(() => {
    const values = new Map<string, string>()
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
        clear: () => values.clear(),
      },
    })
  })

  it('defaults to disabled and persists explicit opt-in', () => {
    const { result } = renderHook(() => usePhotoQuality())
    expect(result.current.enabled).toBe(false)
    expect(window.localStorage.getItem('gala:photo-quality-enabled')).toBe('false')

    act(() => result.current.setEnabled(true))
    expect(result.current.enabled).toBe(true)
    expect(window.localStorage.getItem('gala:photo-quality-enabled')).toBe('true')
  })
})
