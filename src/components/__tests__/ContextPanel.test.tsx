import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ContextPanel } from '../ContextPanel'
import type { DesktopEnvironment } from '../../desktop/environment'
import type { LibrarySummary } from '../../types/library'
import type { TimelinePhoto } from '../../types/photos'

const desktopEnvironment: DesktopEnvironment = {
  runtime: 'desktop',
  platform: 'macos',
  engine: 'rust',
}

const librarySummary: LibrarySummary = {
  sources: [],
  totalPhotos: 1,
  recentlyAddedCount: 1,
  favoritesCount: 0,
}

const selectedPhoto: TimelinePhoto = {
  id: 'photo-1',
  fileName: 'DSC_1001.jpg',
  relativePath: 'Trips/Japan/DSC_1001.jpg',
  folderPath: 'Trips/Japan',
  capturedAt: '2026-05-07T10:00:00.000Z',
  width: 4032,
  height: 3024,
  fileSize: 2_621_440,
  sourceName: 'Camera Roll',
  sourceStatus: 'online',
  thumbnailPath: null,
  isFavorite: false,
  cameraMake: 'Fujifilm',
  cameraModel: 'X-T5',
  lensModel: 'XF 23mm F1.4 R LM WR',
  gpsLatitude: 35.0116,
  gpsLongitude: 135.7681,
}

describe('ContextPanel', () => {
  it('shows selected photo metadata for the MVP detail panel', () => {
    render(
      <ContextPanel
        desktopEnvironment={desktopEnvironment}
        librarySummary={librarySummary}
        selectedPhoto={selectedPhoto}
      />,
    )

    expect(screen.getByText('DSC_1001.jpg')).toBeInTheDocument()
    expect(screen.getByText('4032 x 3024')).toBeInTheDocument()
    expect(screen.getByText('2.5 MB')).toBeInTheDocument()
    expect(screen.getByText('Trips/Japan')).toBeInTheDocument()
    expect(screen.getByText('Trips/Japan/DSC_1001.jpg')).toBeInTheDocument()
    expect(screen.getByText('Fujifilm X-T5')).toBeInTheDocument()
    expect(screen.getByText('XF 23mm F1.4 R LM WR')).toBeInTheDocument()
    expect(screen.getByText('35.01160, 135.76810')).toBeInTheDocument()
  })
})
