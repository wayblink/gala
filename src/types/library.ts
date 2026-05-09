export type LibrarySource = {
  id: string
  name: string
  rootPath: string
  status: 'online' | 'offline' | 'missing' | 'error'
  photoCount: number
}

export type ScanSummary = {
  source: LibrarySource
  indexedCount: number
  skippedCount: number
}

export type ScanProgressStatus =
  | 'scanning'
  | 'indexing'
  | 'thumbnailing'
  | 'completed'
  | 'failed'

export type ScanProgress = {
  status: ScanProgressStatus
  rootPath: string | null
  sourceId: string | null
  discoveredCount: number
  indexedCount: number
  thumbnailReadyCount: number
  thumbnailFailedCount: number
  skippedCount: number
  currentFile: string | null
  errorMessage: string | null
}

export type LibrarySummary = {
  sources: LibrarySource[]
  totalPhotos: number
  recentlyAddedCount: number
  favoritesCount: number
  hiddenCount: number
}
