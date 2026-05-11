import { useCallback, useState } from 'react'
import type {
  PhotoDisplayMode,
  PhotoFilter,
  SmartFilter,
} from '../types/photos'

// "All Photos" is the default; it lives in Library but we represent it as null
// so a missing filter still means "no restriction".
const defaultFilter: PhotoFilter | null = null

export type UseViewFilter = {
  filter: PhotoFilter | null
  searchQuery: string
  smartFilter: SmartFilter
  displayMode: PhotoDisplayMode
  filterPanelOpen: boolean
  dataVersion: number
  setFilter: (next: PhotoFilter | null) => void
  setSearchQuery: (q: string) => void
  setSmartFilter: (f: SmartFilter) => void
  setDisplayMode: (m: PhotoDisplayMode) => void
  setFilterPanelOpen: (open: boolean) => void
  toggleFilterPanel: () => void
  bumpDataVersion: () => void
}

export function useViewFilter(): UseViewFilter {
  const [filter, setFilterState] = useState<PhotoFilter | null>(defaultFilter)
  const [searchQuery, setSearchQuery] = useState('')
  const [smartFilter, setSmartFilter] = useState<SmartFilter>({})
  const [displayMode, setDisplayMode] = useState<PhotoDisplayMode>('thumbnail')
  const [filterPanelOpen, setFilterPanelOpen] = useState(false)
  const [dataVersion, setDataVersion] = useState(0)

  const setFilter = useCallback((next: PhotoFilter | null) => {
    setFilterState(next)
    setSearchQuery('')
  }, [])

  const toggleFilterPanel = useCallback(() => {
    setFilterPanelOpen((v) => !v)
  }, [])

  const bumpDataVersion = useCallback(() => {
    setDataVersion((v) => v + 1)
  }, [])

  return {
    filter,
    searchQuery,
    smartFilter,
    displayMode,
    filterPanelOpen,
    dataVersion,
    setFilter,
    setSearchQuery,
    setSmartFilter,
    setDisplayMode,
    setFilterPanelOpen,
    toggleFilterPanel,
    bumpDataVersion,
  }
}
