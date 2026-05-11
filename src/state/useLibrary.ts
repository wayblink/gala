import { useCallback, useEffect, useState } from 'react'
import {
  getLibrarySummary,
  listenToScanProgress,
} from '../desktop/library'
import { deleteSource as deleteSourceCmd, getFilterOptions, getSourceFolders } from '../desktop/photos'
import type { LibrarySummary, ScanProgress } from '../types/library'
import type { FilterOptions, SourceFolder } from '../types/photos'

const emptySummary: LibrarySummary = {
  sources: [],
  totalPhotos: 0,
  recentlyAddedCount: 0,
  favoritesCount: 0,
  hiddenCount: 0,
}

export type UseLibrary = {
  summary: LibrarySummary
  sources: SourceFolder[]
  filterOptions: FilterOptions | null
  scanProgress: ScanProgress | null
  isScanning: boolean
  setIsScanning: (v: boolean) => void
  setScanProgress: (p: ScanProgress | null) => void
  refreshSummary: () => Promise<void>
  refreshSources: () => Promise<void>
  refreshFilterOptions: () => Promise<void>
  refreshAll: () => Promise<void>
  removeSource: (sourceId: string) => Promise<void>
}

export function useLibrary(): UseLibrary {
  const [summary, setSummary] = useState<LibrarySummary>(emptySummary)
  const [sources, setSources] = useState<SourceFolder[]>([])
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null)
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null)
  const [isScanning, setIsScanning] = useState(false)

  const refreshSummary = useCallback(async () => {
    setSummary(await getLibrarySummary())
  }, [])

  const refreshSources = useCallback(async () => {
    setSources(await getSourceFolders())
  }, [])

  const refreshFilterOptions = useCallback(async () => {
    setFilterOptions(await getFilterOptions())
  }, [])

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshSummary(), refreshSources(), refreshFilterOptions()])
  }, [refreshSummary, refreshSources, refreshFilterOptions])

  const removeSource = useCallback(
    async (sourceId: string) => {
      await deleteSourceCmd(sourceId)
      await refreshAll()
    },
    [refreshAll],
  )

  useEffect(() => {
    void refreshAll()
  }, [refreshAll])

  useEffect(() => {
    let unlisten: (() => void) | null = null
    let mounted = true

    void listenToScanProgress((progress) => {
      if (!mounted) return
      setScanProgress(progress)
      const finished = progress.status === 'completed' || progress.status === 'failed'
      setIsScanning(!finished)
    }).then((cleanup) => {
      unlisten = cleanup
    })

    return () => {
      mounted = false
      unlisten?.()
    }
  }, [])

  return {
    summary,
    sources,
    filterOptions,
    scanProgress,
    isScanning,
    setIsScanning,
    setScanProgress,
    refreshSummary,
    refreshSources,
    refreshFilterOptions,
    refreshAll,
    removeSource,
  }
}
