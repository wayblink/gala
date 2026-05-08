export type PhotoFilter =
  | { type: 'folder'; sourceId: string; folderPath: string }
  | { type: 'recent' }
  | { type: 'favorites' }

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
  fileSize: number
  sourceName: string
  sourceStatus: string
  thumbnailPath: string | null
  isFavorite: boolean
}
