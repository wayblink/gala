export type LibrarySource = {
  id: string
  name: string
  sourceKind?: 'local_folder' | 'apple_photos'
  rootPath: string
  status: 'online' | 'offline' | 'missing' | 'error' | 'limited' | 'denied'
  photoCount: number
  previewPaths?: string[]
  storageMode?: 'local' | 'sidecar' | 'hybrid'
  sidecarRoot?: string | null
  volumeId?: string | null
}

export type ApplePhotosStatus = {
  available: boolean
  authorization: 'notDetermined' | 'authorized' | 'limited' | 'denied' | 'restricted' | 'unsupported' | string
  assetCount: number
  sourceId: string | null
  message: string | null
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
