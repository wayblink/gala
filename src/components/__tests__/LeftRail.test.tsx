import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { LeftRail } from '../LeftRail'
import type { LibrarySummary, ScanProgress } from '../../types/library'
import type { SourceFolder } from '../../types/photos'

const emptySummary: LibrarySummary = {
  sources: [],
  totalPhotos: 0,
  recentlyAddedCount: 0,
  favoritesCount: 0,
}

describe('LeftRail', () => {
  it('shows active scan progress and failures', () => {
    const scanProgress: ScanProgress = {
      status: 'thumbnailing',
      rootPath: '/Users/me/Pictures',
      sourceId: 'source-1',
      discoveredCount: 20,
      indexedCount: 20,
      thumbnailReadyCount: 7,
      thumbnailFailedCount: 2,
      skippedCount: 1,
      currentFile: 'IMG_0009.jpg',
      errorMessage: null,
    }

    render(<LeftRail librarySummary={emptySummary} isScanning scanProgress={scanProgress} />)

    expect(screen.getByText('Scanning')).toBeInTheDocument()
    expect(screen.getByText('9 / 20 processed')).toBeInTheDocument()
    expect(screen.getByText('IMG_0009.jpg')).toBeInTheDocument()
    expect(screen.getByText('2 failed')).toBeInTheDocument()
  })

  it('keeps the latest completed scan summary visible', () => {
    const scanProgress: ScanProgress = {
      status: 'completed',
      rootPath: '/Users/me/Pictures',
      sourceId: 'source-1',
      discoveredCount: 12,
      indexedCount: 12,
      thumbnailReadyCount: 11,
      thumbnailFailedCount: 1,
      skippedCount: 0,
      currentFile: null,
      errorMessage: null,
    }

    render(<LeftRail librarySummary={emptySummary} isScanning={false} scanProgress={scanProgress} />)

    expect(screen.getByText('Scan Complete')).toBeInTheDocument()
    expect(screen.getByText('12 / 12 processed')).toBeInTheDocument()
    expect(screen.getByText('1 failed')).toBeInTheDocument()
  })

  it('renders simplified navigation with todo markers for unsupported features', () => {
    render(
      <LeftRail
        librarySummary={emptySummary}
        isScanning={false}
        scanProgress={null}
        sourceFolders={[]}
        activeFilter={null}
        onSelectAllPhotos={() => undefined}
        onSelectRecent={() => undefined}
        onSelectFavorites={() => undefined}
        onSelectFolder={() => undefined}
      />,
    )

    expect(screen.queryByText('Explore')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /All Photos/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Recently Added/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Favorites/i })).toBeInTheDocument()
    expect(screen.getByText('People [todo]')).toBeInTheDocument()
    expect(screen.getByText('Places [todo]')).toBeInTheDocument()
  })

  it('renders nested source folders and selects a folder filter', async () => {
    const user = userEvent.setup()
    const summary: LibrarySummary = {
      totalPhotos: 4,
      recentlyAddedCount: 0,
      favoritesCount: 0,
      sources: [
        {
          id: 'source-1',
          name: 'Pictures',
          rootPath: '/Users/me/Pictures',
          status: 'online',
          photoCount: 4,
        },
      ],
    }
    const sourceFolders: SourceFolder[] = [
      {
        id: 'source-1:',
        sourceId: 'source-1',
        name: 'Pictures',
        folderPath: '',
        depth: 0,
        photoCount: 4,
      },
      {
        id: 'source-1:Trips',
        sourceId: 'source-1',
        name: 'Trips',
        folderPath: 'Trips',
        depth: 1,
        photoCount: 2,
      },
      {
        id: 'source-1:Trips/Japan',
        sourceId: 'source-1',
        name: 'Japan',
        folderPath: 'Trips/Japan',
        depth: 2,
        photoCount: 2,
      },
      {
        id: 'source-1:Trips/Japan/Kyoto',
        sourceId: 'source-1',
        name: 'Kyoto',
        folderPath: 'Trips/Japan/Kyoto',
        depth: 3,
        photoCount: 1,
      },
    ]
    const selections: Array<{ type: string; sourceId: string; folderPath: string }> = []

    render(
      <LeftRail
        librarySummary={summary}
        isScanning={false}
        scanProgress={null}
        sourceFolders={sourceFolders}
        activeFilter={{ type: 'folder', sourceId: 'source-1', folderPath: 'Trips/Japan' }}
        onSelectAllPhotos={() => undefined}
        onSelectRecent={() => undefined}
        onSelectFavorites={() => undefined}
        onSelectFolder={(filter) => selections.push(filter as any)}
      />,
    )

    expect(screen.getByRole('button', { name: /Pictures 4/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Trips 2/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Japan 2/i })).toHaveClass('active')
    expect(screen.getByRole('button', { name: /Kyoto 1/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Kyoto 1/i }))

    expect(selections).toEqual([{ type: 'folder', sourceId: 'source-1', folderPath: 'Trips/Japan/Kyoto' }])
  })
})
