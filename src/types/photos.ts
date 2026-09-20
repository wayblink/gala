import type { PhotoQualityScore } from '../domain/photoQuality'

export type ComingSoonViewId = 'people' | 'content' | 'similar' | 'reorganize'

export type PhotoFilter =
  // Library — always-available base views
  | { type: 'all' }
  | { type: 'recent' }
  | { type: 'favorites' }
  | { type: 'hidden' }
  // Views — semantic views (V1 targets; most are placeholders in V0)
  | { type: 'view'; viewId: ComingSoonViewId }
  // Sources — provider-scoped views and local filesystem folders
  | { type: 'folder'; sourceId: string; folderPath: string }
  | { type: 'source-favorites'; sourceId: string; sourceName: string }
  | { type: 'source-collection'; sourceId: string; collectionId: string; collectionName: string }
  // Custom views — user-created groupings
  | { type: 'album'; albumId: string }
  | { type: 'tag'; tagName: string }
  | { type: 'label'; labelId: string; labelName: string; labelKind: string }
  // People — single-person detail view (M1.6)
  | { type: 'person'; personId: string; displayName: string | null }
  // Explore / utility surfaces
  | { type: 'explore' }
  | { type: 'sources' }
  | { type: 'settings' }
  | { type: 'tasks' }

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

export type SourceCollection = {
  id: string
  sourceId: string
  name: string
  photoCount: number
}

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
  logicalId?: string | null
  fileName: string
  extension?: string
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
  quality?: PhotoQualityScore | null
  tags: string[]
  variantCount?: number
  variants?: PhotoVariant[]
}

export type PhotoVariant = {
  id: string
  fileName: string
  extension: string
  formatKind: 'raw' | 'jpeg' | 'heif' | 'other' | string
}

export type Tag = {
  name: string
  photoCount: number
}

export type Label = {
  id: string
  name: string
  kind: string
  semanticKey: string | null
  visibility: string
  createdBy: string
  sourceCount: number
  photoCount: number
}
