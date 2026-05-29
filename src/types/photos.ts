export type ComingSoonViewId = 'timeline' | 'places' | 'people' | 'memories' | 'similar'

export type PhotoFilter =
  // Library — always-available base views
  | { type: 'all' }
  | { type: 'recent' }
  | { type: 'favorites' }
  | { type: 'hidden' }
  // Views — semantic views (V1 targets; most are placeholders in V0)
  | { type: 'view'; viewId: ComingSoonViewId }
  // Sources — filesystem sources and nested folders
  | { type: 'folder'; sourceId: string; folderPath: string }
  // Custom views — user-created groupings
  | { type: 'album'; albumId: string }
  | { type: 'tag'; tagName: string }
  // People — single-person detail view (M1.6)
  | { type: 'person'; personId: string; displayName: string | null }
  // Explore / Settings placeholders
  | { type: 'explore' }
  | { type: 'settings' }

export type SmartFilter = {
  cameras?: string[]
  dateFrom?: string
  dateTo?: string
  extensions?: string[]
}

export type Album = {
  id: string
  name: string
  photoCount: number
  createdAt: string
}

export type FilterOptions = {
  cameras: string[]
  extensions: string[]
  dateMin: string | null
  dateMax: string | null
}

export type PhotoDisplayMode = 'thumbnail' | 'list' | 'gallery'

export type SourceFolder = {
  id: string
  sourceId: string
  name: string
  folderPath: string
  depth: number
  photoCount: number
}

export type TimelinePhoto = {
  id: string
  fileName: string
  relativePath: string
  folderPath: string
  capturedAt: string | null
  width: number | null
  height: number | null
  cameraMake: string | null
  cameraModel: string | null
  lensModel: string | null
  gpsLatitude: number | null
  gpsLongitude: number | null
  fileSize: number
  sourceName: string
  sourceStatus: string
  thumbnailPath: string | null
  isFavorite: boolean
  isHidden: boolean
  tags: string[]
}

export type Tag = {
  name: string
  photoCount: number
}
