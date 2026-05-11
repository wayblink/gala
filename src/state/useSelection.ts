import { useCallback, useState } from 'react'
import type { TimelinePhoto } from '../types/photos'

export type UseSelection = {
  selectedPhoto: TimelinePhoto | null
  setSelectedPhoto: (photo: TimelinePhoto | null) => void
  patchSelectedPhoto: (patch: Partial<TimelinePhoto>) => void
  selectedIds: Set<string>
  toggleSelected: (photoId: string) => void
  setSelectedIds: (ids: Set<string>) => void
  clearSelected: () => void
  selectionMode: boolean
  setSelectionMode: (on: boolean) => void
  toggleSelectionMode: () => void
}

export function useSelection(): UseSelection {
  const [selectedPhoto, setSelectedPhoto] = useState<TimelinePhoto | null>(null)
  const [selectedIds, setSelectedIdsState] = useState<Set<string>>(new Set())
  const [selectionMode, setSelectionModeState] = useState(false)

  const patchSelectedPhoto = useCallback((patch: Partial<TimelinePhoto>) => {
    setSelectedPhoto((prev) => (prev ? { ...prev, ...patch } : prev))
  }, [])

  const toggleSelected = useCallback((photoId: string) => {
    setSelectedIdsState((prev) => {
      const next = new Set(prev)
      if (next.has(photoId)) next.delete(photoId)
      else next.add(photoId)
      return next
    })
  }, [])

  const setSelectedIds = useCallback((ids: Set<string>) => {
    setSelectedIdsState(new Set(ids))
  }, [])

  const clearSelected = useCallback(() => {
    setSelectedIdsState(new Set())
  }, [])

  const setSelectionMode = useCallback((on: boolean) => {
    setSelectionModeState(on)
    if (!on) setSelectedIdsState(new Set())
  }, [])

  const toggleSelectionMode = useCallback(() => {
    setSelectionModeState((prev) => {
      const next = !prev
      if (!next) setSelectedIdsState(new Set())
      return next
    })
  }, [])

  return {
    selectedPhoto,
    setSelectedPhoto,
    patchSelectedPhoto,
    selectedIds,
    toggleSelected,
    setSelectedIds,
    clearSelected,
    selectionMode,
    setSelectionMode,
    toggleSelectionMode,
  }
}
