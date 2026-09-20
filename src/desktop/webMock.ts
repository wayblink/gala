import type { LibrarySource, LibrarySummary } from '../types/library'
import type { FilterOptions, Album, PhotoFilter, SourceFolder, TimelinePhoto } from '../types/photos'

const mockSources: LibrarySource[] = [
  {
    id: 'source-test-photos',
    name: 'test-photos',
    rootPath: '/Users/jyxc-dz-0101035/gala/test-photos',
    status: 'online',
    photoCount: 25,
    previewPaths: [
      '/Users/jyxc-dz-0101035/gala/test-photos/IMG_0001.jpg',
      '/Users/jyxc-dz-0101035/gala/test-photos/IMG_0002.jpg',
      '/Users/jyxc-dz-0101035/gala/test-photos/IMG_0003.jpg',
      '/Users/jyxc-dz-0101035/gala/test-photos/IMG_0004.jpg',
    ],
  },
  {
    id: 'source-test-photos-faces',
    name: 'test-photos-faces',
    rootPath: '/Users/jyxc-dz-0101035/gala/test-photos-faces',
    status: 'online',
    photoCount: 10,
    previewPaths: [
      '/Users/jyxc-dz-0101035/gala/test-photos-faces/ai_face_08.jpg',
      '/Users/jyxc-dz-0101035/gala/test-photos-faces/ai_face_02.jpg',
      '/Users/jyxc-dz-0101035/gala/test-photos-faces/ai_face_03.jpg',
      '/Users/jyxc-dz-0101035/gala/test-photos-faces/ai_face_04.jpg',
    ],
  },
  {
    id: 'source-test-photos-mixed',
    name: 'test-photos-mixed',
    rootPath: '/Users/jyxc-dz-0101035/gala/test-photos-mixed',
    status: 'online',
    photoCount: 5,
    previewPaths: [
      '/Users/jyxc-dz-0101035/gala/test-photos-mixed/MIX_0001.jpg',
    ],
  },
  {
    id: 'source-test-photos-portrait',
    name: 'test-photos-portrait',
    rootPath: '/Users/jyxc-dz-0101035/gala/test-photos-portrait',
    status: 'online',
    photoCount: 10,
    previewPaths: [
      '/Users/jyxc-dz-0101035/gala/test-photos-portrait/PHOTO_0001.jpg',
    ],
  },
]

const mockSourceFolders: SourceFolder[] = mockSources.map((source) => ({
  id: `${source.id}:root`,
  sourceId: source.id,
  name: source.name,
  folderPath: '',
  depth: 0,
  photoCount: source.photoCount,
}))

const getMockSourceRoot = (sourceId: string) => mockSources.find((source) => source.id === sourceId)?.rootPath ?? ''

const makePhoto = (
  id: string,
  fileName: string,
  sourceId: string,
  sourceName: string,
  capturedAt: string,
  qualityScore: number,
): TimelinePhoto & { sourceId: string } => ({
  id,
  fileName,
  relativePath: fileName,
  folderPath: '',
  capturedAt,
  width: 1024,
  height: 1024,
  cameraMake: null,
  cameraModel: null,
  lensModel: null,
  gpsLatitude: null,
  gpsLongitude: null,
  fileSize: 534_000,
  sourceName,
  sourceStatus: 'online',
  thumbnailPath: `${getMockSourceRoot(sourceId)}/${fileName}`,
  isFavorite: false,
  isHidden: false,
  quality: {
    photoId: id,
    score: qualityScore,
    label: qualityScore >= 75 ? 'strong' : qualityScore >= 50 ? 'solid' : 'weak',
    reasons: ['balanced frame', 'web preview mock'],
  },
  tags: [],
  sourceId,
})

const mockPhotos: Array<TimelinePhoto & { sourceId: string }> = [
  makePhoto('face-001', 'ai_face_08.jpg', 'source-test-photos-faces', 'test-photos-faces', '2026-05-28T10:00:00.000Z', 52),
  makePhoto('face-002', 'ai_face_02.jpg', 'source-test-photos-faces', 'test-photos-faces', '2026-05-28T10:01:00.000Z', 52),
  makePhoto('face-003', 'ai_face_03.jpg', 'source-test-photos-faces', 'test-photos-faces', '2026-05-28T10:02:00.000Z', 52),
  makePhoto('face-004', 'ai_face_04.jpg', 'source-test-photos-faces', 'test-photos-faces', '2026-05-28T10:03:00.000Z', 52),
  makePhoto('face-005', 'ai_face_05.jpg', 'source-test-photos-faces', 'test-photos-faces', '2026-05-28T10:04:00.000Z', 52),
  makePhoto('face-006', 'ai_face_06.jpg', 'source-test-photos-faces', 'test-photos-faces', '2026-05-28T10:05:00.000Z', 52),
  makePhoto('face-007', 'ai_face_07.jpg', 'source-test-photos-faces', 'test-photos-faces', '2026-05-28T10:06:00.000Z', 52),
  makePhoto('face-008', 'ai_face_01.jpg', 'source-test-photos-faces', 'test-photos-faces', '2026-05-28T10:07:00.000Z', 52),
  makePhoto('face-009', 'einstein.jpg', 'source-test-photos-faces', 'test-photos-faces', '2026-05-28T10:08:00.000Z', 83),
  makePhoto('face-010', 'solvay_1927.jpg', 'source-test-photos-faces', 'test-photos-faces', '2026-05-28T10:09:00.000Z', 53),
  makePhoto('mixed-001', 'MIX_0001.jpg', 'source-test-photos-mixed', 'test-photos-mixed', '2026-05-18T09:00:00.000Z', 61),
  makePhoto('portrait-001', 'PHOTO_0001.jpg', 'source-test-photos-portrait', 'test-photos-portrait', '2026-05-11T08:30:00.000Z', 74),
  makePhoto('source-001', 'IMG_0001.jpg', 'source-test-photos', 'test-photos', '2026-05-01T07:20:00.000Z', 68),
]

const mockAlbums: Album[] = []
const mockAlbumPhotoIds = new Map<string, Set<string>>()
let nextAlbumNumber = 1

const initialMockSources = mockSources.map((source) => ({
  ...source,
  previewPaths: source.previewPaths ? [...source.previewPaths] : [],
}))
const initialMockSourceFolders = mockSourceFolders.map((folder) => ({ ...folder }))
const initialMockPhotos = mockPhotos.map((photo) => ({
  ...photo,
  quality: photo.quality ? { ...photo.quality, reasons: [...photo.quality.reasons] } : null,
  tags: [...photo.tags],
}))

const cloneAlbum = (album: Album): Album => ({ ...album })

function requireAlbum(albumId: string): Album {
  const album = mockAlbums.find((item) => item.id === albumId)
  if (!album) throw new Error('Album not found')
  return album
}

function refreshAlbumCount(albumId: string): void {
  const album = requireAlbum(albumId)
  album.photoCount = mockAlbumPhotoIds.get(albumId)?.size ?? 0
}

function removePhotoFromAllAlbums(photoId: string): void {
  for (const [albumId, photoIds] of mockAlbumPhotoIds.entries()) {
    photoIds.delete(photoId)
    refreshAlbumCount(albumId)
  }
}

export const webMockSummary: LibrarySummary = {
  sources: mockSources,
  totalPhotos: mockSources.reduce((total, source) => total + source.photoCount, 0),
  recentlyAddedCount: mockPhotos.length,
  favoritesCount: 0,
  hiddenCount: 0,
}

export function getWebMockLibrarySummary(): LibrarySummary {
  return {
    ...webMockSummary,
    sources: mockSources.map((source) => ({
      ...source,
      previewPaths: source.previewPaths ? [...source.previewPaths] : [],
    })),
  }
}

export function getWebMockSourceFolders(): SourceFolder[] {
  return mockSourceFolders.map((folder) => ({ ...folder }))
}

/** Restore deterministic preview data between tests without changing browser-session behavior. */
export function resetWebMockLibrary(): void {
  mockSources.splice(0, mockSources.length, ...initialMockSources.map((source) => ({
    ...source,
    previewPaths: source.previewPaths ? [...source.previewPaths] : [],
  })))
  mockSourceFolders.splice(
    0,
    mockSourceFolders.length,
    ...initialMockSourceFolders.map((folder) => ({ ...folder })),
  )
  mockPhotos.splice(
    0,
    mockPhotos.length,
    ...initialMockPhotos.map((photo) => ({
      ...photo,
      quality: photo.quality ? { ...photo.quality, reasons: [...photo.quality.reasons] } : null,
      tags: [...photo.tags],
    })),
  )
  webMockSummary.totalPhotos = mockSources.reduce((total, source) => total + source.photoCount, 0)
  webMockSummary.recentlyAddedCount = mockPhotos.length
  mockAlbums.splice(0, mockAlbums.length)
  mockAlbumPhotoIds.clear()
  nextAlbumNumber = 1
}

export function renameWebMockSource(sourceId: string, newName: string): void {
  const source = mockSources.find((item) => item.id === sourceId)
  if (!source) throw new Error('Source not found')
  const trimmed = newName.trim()
  if (!trimmed) throw new Error('Source name cannot be empty')
  source.name = trimmed
  const folder = mockSourceFolders.find((item) => item.sourceId === sourceId)
  if (folder) folder.name = trimmed
  for (const photo of mockPhotos) {
    if (photo.sourceId === sourceId) photo.sourceName = trimmed
  }
}

export function deleteWebMockSource(sourceId: string): void {
  const index = mockSources.findIndex((item) => item.id === sourceId)
  if (index < 0) throw new Error('Source not found')
  mockSources.splice(index, 1)
  for (let photoIndex = mockPhotos.length - 1; photoIndex >= 0; photoIndex -= 1) {
    if (mockPhotos[photoIndex].sourceId === sourceId) {
      removePhotoFromAllAlbums(mockPhotos[photoIndex].id)
      mockPhotos.splice(photoIndex, 1)
    }
  }
  for (let folderIndex = mockSourceFolders.length - 1; folderIndex >= 0; folderIndex -= 1) {
    if (mockSourceFolders[folderIndex].sourceId === sourceId) mockSourceFolders.splice(folderIndex, 1)
  }
  webMockSummary.totalPhotos = mockSources.reduce((total, source) => total + source.photoCount, 0)
  webMockSummary.recentlyAddedCount = mockPhotos.length
}

export const webMockSourceFolders = mockSourceFolders

export function getWebMockAlbums(): Album[] {
  return mockAlbums.map(cloneAlbum)
}

export function createWebMockAlbum(name: string): Album {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Album name cannot be empty')
  const album: Album = {
    id: `web-album-${nextAlbumNumber++}`,
    name: trimmed,
    photoCount: 0,
    createdAt: new Date().toISOString(),
  }
  mockAlbums.push(album)
  mockAlbumPhotoIds.set(album.id, new Set())
  return cloneAlbum(album)
}

export function deleteWebMockAlbum(albumId: string): void {
  const index = mockAlbums.findIndex((album) => album.id === albumId)
  if (index < 0) throw new Error('Album not found')
  mockAlbums.splice(index, 1)
  mockAlbumPhotoIds.delete(albumId)
}

export function renameWebMockAlbum(albumId: string, newName: string): void {
  const trimmed = newName.trim()
  if (!trimmed) throw new Error('Album name cannot be empty')
  requireAlbum(albumId).name = trimmed
}

export function addWebMockPhotoToAlbum(albumId: string, photoId: string): void {
  requireAlbum(albumId)
  if (!mockPhotos.some((photo) => photo.id === photoId)) throw new Error('Photo not found')
  mockAlbumPhotoIds.get(albumId)?.add(photoId)
  refreshAlbumCount(albumId)
}

export function removeWebMockPhotoFromAlbum(albumId: string, photoId: string): void {
  requireAlbum(albumId)
  mockAlbumPhotoIds.get(albumId)?.delete(photoId)
  refreshAlbumCount(albumId)
}

export function addWebMockPhotosToAlbumBatch(albumId: string, photoIds: string[]): void {
  photoIds.forEach((photoId) => addWebMockPhotoToAlbum(albumId, photoId))
}

export function removeWebMockPhotosFromAlbumBatch(albumId: string, photoIds: string[]): void {
  photoIds.forEach((photoId) => removeWebMockPhotoFromAlbum(albumId, photoId))
}

export function getWebMockAlbumPhotos(albumId: string): TimelinePhoto[] {
  const ids = mockAlbumPhotoIds.get(albumId)
  if (!ids) throw new Error('Album not found')
  return mockPhotos.filter((photo) => ids.has(photo.id))
}

export const webMockFilterOptions: FilterOptions = {
  cameras: [],
  extensions: ['jpg'],
  dateMin: '2026-05-01T07:20:00.000Z',
  dateMax: '2026-05-28T10:09:00.000Z',
}

export function getWebMockTimelinePhotos(filter?: PhotoFilter | null): TimelinePhoto[] {
  if (filter?.type === 'folder') {
    return mockPhotos.filter((photo) => photo.sourceId === filter.sourceId)
  }

  if (filter?.type === 'favorites' || filter?.type === 'hidden') {
    return []
  }

  if (filter?.type === 'album') {
    return getWebMockAlbumPhotos(filter.albumId)
  }

  return mockPhotos
}

export function searchWebMockPhotos(query: string): TimelinePhoto[] {
  const normalized = query.trim().toLowerCase()
  if (!normalized) {
    return mockPhotos
  }

  return mockPhotos.filter(
    (photo) =>
      photo.fileName.toLowerCase().includes(normalized) ||
      photo.sourceName.toLowerCase().includes(normalized),
  )
}