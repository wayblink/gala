import { useCallback, useState } from 'react'
import type { TimelinePhoto } from '../types/photos'

export type SelectionScope =
  | { kind: 'explicit' }
  | { kind: 'visible'; label: string }
  | { kind: 'date'; dateKey: string; label: string }
  | { kind: 'matching'; label: string }

export type UseSelection = {
  selectedPhoto: TimelinePhoto | null
  setSelectedPhoto: (photo: TimelinePhoto | null) => void
  patchSelectedPhoto: (patch: Partial<TimelinePhoto>) => void
  selectedIds: Set<string>
  selectionScope: SelectionScope | null
  toggleSelected: (photoId: string) => void
  setSelectedIds: (ids: Set<string>, scope?: SelectionScope | null) => void
  clearSelected: () => void
  selectionMode: boolean
  setSelectionMode: (on: boolean) => void
  toggleSelectionMode: () => void
}

export function useSelection(): UseSelection {
  const [selectedPhoto, setSelectedPhoto] = useState<TimelinePhoto | null>(null)
  const [selectedIds, setSelectedIdsState] = useState<Set<string>>(new Set())
  const [selectionScope, setSelectionScope] = useState<SelectionScope | null>(null)
  const [selectionMode, setSelectionModeState] = useState(false)

  const patchSelectedPhoto = useCallback((patch: Partial<TimelinePhoto>) => {
    setSelectedPhoto((prev) => (prev ? { ...prev, ...patch } : prev))
  }, [])

  const toggleSelected = useCallback((photoId: string) => {
    setSelectedIdsState((prev) => {
      const next = new Set(prev)
      if (next.has(photoId)) next.delete(photoId)
      else next.add(photoId)
      setSelectionScope({ kind: 'explicit' })
      return next
    })
  }, [])

  const setSelectedIds = useCallback((ids: Set<string>, scope: SelectionScope | null = null) => {
    setSelectedIdsState(new Set(ids))
    setSelectionScope(ids.size > 0 ? scope : null)
  }, [])

  const clearSelected = useCallback(() => {
    setSelectedIdsState(new Set())
    setSelectionScope(null)
  }, [])

  const setSelectionMode = useCallback((on: boolean) => {
    setSelectionModeState(on)
    if (!on) {
      setSelectedIdsState(new Set())
      setSelectionScope(null)
    }
  }, [])

  const toggleSelectionMode = useCallback(() => {
    setSelectionModeState((prev) => {
      const next = !prev
      if (!next) {
        setSelectedIdsState(new Set())
        setSelectionScope(null)
      }
      return next
    })
  }, [])

  return {
    selectedPhoto,
    setSelectedPhoto,
    patchSelectedPhoto,
    selectedIds,
    selectionScope,
    toggleSelected,
    setSelectedIds,
    clearSelected,
    selectionMode,
    setSelectionMode,
    toggleSelectionMode,
  }
}
