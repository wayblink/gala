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
  // 结构/格式（gala 摄影特色）
  formatKinds?: string[]
  mergeVariants?: boolean
  // 时间
  dateFrom?: string
  dateTo?: string
  datePreset?: 'thisYear' | 'lastYear' | 'last30Days' | 'undated'
  // 收藏/隐藏
  favorites?: boolean
  hidden?: boolean
  // 标签
  tags?: string[]
  // 相机/镜头
  cameras?: string[]
  lenses?: string[]
  // 来源（多源）
  sources?: string[]
  // 尺寸/文件大小
  minWidth?: number
  minHeight?: number
  minFileSize?: number
  // 智能：质量分上限（过滤低质）
  qualityMax?: number
  // legacy
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
  lenses?: string[]
  tags?: string[]
  sources?: string[]
  formatKinds?: string[]
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
