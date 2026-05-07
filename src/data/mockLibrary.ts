import { groupPhotosByTimeline } from './timeline'
import type { NavItem, PhotoItem, SourceItem } from '../types'

export const libraryItems: NavItem[] = [
  { label: 'All Photos', count: '18k', active: true },
  { label: 'Recently Added', count: '412' },
  { label: 'Favorites', count: '698' },
  { label: 'Hidden' },
]

export const viewItems: NavItem[] = [
  { label: 'Timeline' },
  { label: 'Places' },
  { label: 'People' },
  { label: 'Memories' },
  { label: 'Similar' },
  { label: 'Custom Views' },
]

export const exploreItems: NavItem[] = [
  { label: 'Same Day' },
  { label: 'Forgotten Photos' },
  { label: 'Similar Light' },
  { label: 'Trips' },
]

export const sources: SourceItem[] = [
  { name: 'Mac Photos', status: 'online' },
  { name: 'X100V Drive', status: 'online' },
  { name: 'Archive SSD', status: 'offline' },
  { name: 'Old Export', status: 'missing' },
]

export const photos: PhotoItem[] = [
  {
    id: 'p-001',
    fileName: 'DSCF4281.RAF',
    sourceName: 'X100V Drive',
    sourceStatus: 'online',
    status: 'indexed',
    capturedAt: '2026-05-07T08:30:00Z',
    importedAt: '2026-05-07T10:00:00Z',
    camera: 'X100V',
    lens: '23mm f/2',
    dimensions: '6240 x 4160',
    color: '#c9974d',
    aspectRatio: '1 / 1',
    relatedViews: ['Kyoto Nights', 'Similar Light'],
  },
  {
    id: 'p-002',
    fileName: 'IMG_2044.HEIC',
    sourceName: 'Mac Photos',
    sourceStatus: 'online',
    status: 'indexed',
    capturedAt: '2026-05-07T06:00:00Z',
    importedAt: '2026-05-07T10:00:00Z',
    camera: 'iPhone 16 Pro',
    lens: '24mm',
    dimensions: '4032 x 3024',
    color: '#527c8e',
    aspectRatio: '1 / 1.25',
    relatedViews: ['Lake Morning'],
  },
  {
    id: 'p-003',
    fileName: 'ARCHIVE_1182.JPG',
    sourceName: 'Archive SSD',
    sourceStatus: 'offline',
    status: 'offline',
    capturedAt: '2025-10-04T13:00:00Z',
    importedAt: '2026-05-07T10:00:00Z',
    camera: 'GR III',
    lens: '18.3mm',
    dimensions: '6000 x 4000',
    color: '#8e887e',
    aspectRatio: '1.2 / 1',
    relatedViews: ['Japan 2025'],
  },
  {
    id: 'p-004',
    fileName: 'MISSING_0042.JPG',
    sourceName: 'Old Export',
    sourceStatus: 'missing',
    status: 'missing',
    capturedAt: null,
    importedAt: '2025-10-04T09:00:00Z',
    camera: 'Unknown',
    lens: 'Unknown',
    dimensions: '3000 x 2000',
    color: '#9d4b3f',
    aspectRatio: '1 / 1',
    relatedViews: ['Needs Review'],
  },
]

export const timelineGroups = groupPhotosByTimeline(photos)
export const selectedPhoto = photos[0]
