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

export type LibrarySummary = {
  sources: LibrarySource[]
  totalPhotos: number
}
