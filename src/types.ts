export type SourceStatus = 'online' | 'offline' | 'missing' | 'error'
export type PhotoStatus = 'indexed' | 'missing' | 'offline'

export type NavItem = {
  label: string
  count?: string
  active?: boolean
}

export type SourceItem = {
  name: string
  status: SourceStatus
}

export type PhotoItem = {
  id: string
  fileName: string
  sourceName: string
  sourceStatus: SourceStatus
  status: PhotoStatus
  capturedAt: string | null
  importedAt: string
  camera: string
  lens: string
  dimensions: string
  color: string
  aspectRatio: string
  relatedViews: string[]
}

export type TimelineGroup = {
  key: string
  year: string
  monthLabel: string
  count: number
  dateBasis: 'captured' | 'imported'
  photos: PhotoItem[]
}
