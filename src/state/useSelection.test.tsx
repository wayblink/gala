import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useSelection } from './useSelection'

describe('useSelection', () => {
  it('keeps scope with a resolved selection and resets scope when cleared', () => {
    const { result } = renderHook(() => useSelection())

    act(() => {
      result.current.setSelectionMode(true)
      result.current.setSelectedIds(new Set(['apple-photos:a', 'local:b']), {
        kind: 'matching',
        label: 'Apple Photos',
      })
    })

    expect(result.current.selectedIds).toEqual(new Set(['apple-photos:a', 'local:b']))
    expect(result.current.selectionScope).toEqual({ kind: 'matching', label: 'Apple Photos' })

    act(() => result.current.clearSelected())
    expect(result.current.selectedIds.size).toBe(0)
    expect(result.current.selectionScope).toBeNull()
  })

  it('turns a scoped selection into an explicit selection when one photo is toggled', () => {
    const { result } = renderHook(() => useSelection())

    act(() => result.current.setSelectedIds(new Set(['photo:a', 'photo:b']), {
      kind: 'date',
      dateKey: '2026-05-07',
      label: 'May 7, 2026',
    }))
    act(() => result.current.toggleSelected('photo:a'))

    expect(result.current.selectedIds).toEqual(new Set(['photo:b']))
    expect(result.current.selectionScope).toEqual({ kind: 'explicit' })
  })

  it('clears both IDs and scope when selection mode ends', () => {
    const { result } = renderHook(() => useSelection())

    act(() => {
      result.current.setSelectionMode(true)
      result.current.setSelectedIds(new Set(['photo:a']), { kind: 'visible', label: 'Visible photos' })
    })
    act(() => result.current.setSelectionMode(false))

    expect(result.current.selectionMode).toBe(false)
    expect(result.current.selectedIds.size).toBe(0)
    expect(result.current.selectionScope).toBeNull()
  })
})
