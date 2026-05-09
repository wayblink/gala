export type PhotoFilter =
  | { type: 'folder'; sourceId: string; folderPath: string }
  | { type: 'recent' }
  | { type: 'favorites' }
  | { type: 'hidden' }
  | { type: 'album'; albumId: string }

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
}
