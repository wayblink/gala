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
  favoritesCount: 0, hiddenCount: 0,
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

    // After hiding Library Status idle card, completed scan summary is not shown in the rail.
    expect(screen.queryByText('Scan Complete')).not.toBeInTheDocument()
  })

  it('renders workflow views and bottom utility icon navigation', () => {
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

    expect(screen.getByRole('heading', { name: 'Library' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Views' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Sources/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Albums/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Gala Analysis' })).toBeInTheDocument()
    for (const title of ['Library', 'Sources', 'Albums', 'Gala Analysis']) {
      expect(screen.getByRole('heading', { name: new RegExp(title) })).toHaveClass('rail-group__header-row')
    }
    expect(screen.getByRole('button', { name: 'Collapse Sources' }).parentElement).toHaveClass('rail-group__heading-main')
    expect(screen.queryByRole('heading', { name: 'Explore' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Arrange' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Settings' })).not.toBeInTheDocument()

    expect(screen.getByRole('button', { name: /All Photos/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Recently Added/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Favorites/i })).toBeInTheDocument()

    expect(screen.queryByRole('button', { name: 'Timeline' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Places' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Memories' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'People' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Similar Review' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reorganize' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Background Tasks' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument()
  })

  it('groups Apple Photos provider views separately from local folders', async () => {
    const user = userEvent.setup()
    const selections: unknown[] = []
    const summary: LibrarySummary = {
      totalPhotos: 104,
      recentlyAddedCount: 0,
      favoritesCount: 0,
      hiddenCount: 0,
      sources: [
        { id: 'photos-1', name: 'Apple Photos', sourceKind: 'apple_photos', rootPath: 'apple-photos://library', status: 'online', photoCount: 100 },
        { id: 'folder-1', name: 'Pictures', sourceKind: 'local_folder', rootPath: '/Users/me/Pictures', status: 'online', photoCount: 4 },
      ],
    }
    const { container } = render(
      <LeftRail
        librarySummary={summary}
        isScanning={false}
        sourceFolders={[
          { id: 'photos-1:', sourceId: 'photos-1', name: 'Apple Photos', folderPath: '', depth: 0, photoCount: 100 },
          { id: 'folder-1:', sourceId: 'folder-1', name: 'Pictures', folderPath: '', depth: 0, photoCount: 4 },
        ]}
        sourceCollections={[{ id: 'album-1', sourceId: 'photos-1', name: 'Japan', photoCount: 12 }]}
        onSelectFolder={(filter) => selections.push(filter)}
        onSelectSourceFavorites={(sourceId, sourceName) => selections.push({ type: 'source-favorites', sourceId, sourceName })}
      />,
    )

    expect(screen.getByText('Local Folders')).toBeInTheDocument()
    expect(screen.getAllByText('Apple Photos')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /Albums.*Not synced/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Media Types.*Not synced/i })).not.toBeInTheDocument()
    const appleToggle = screen.queryByRole('button', { name: 'Expand Apple Photos' })
    if (appleToggle) await user.click(appleToggle)
    const applePhotos = screen.getByRole('button', { name: 'Collapse Apple Photos' })
    const allPhotos = screen.getAllByRole('button', { name: /All Photos/i }).at(-1)!
    const sourceAlbums = screen.getByRole('button', { name: 'Expand Albums' })
    const sourceFavorites = screen.getAllByRole('button', { name: 'Favorites' }).at(-1)!
    const localFolders = screen.getByRole('button', { name: 'Expand Local Folders' })

    expect(applePhotos).toHaveClass('rail-source-provider__collapse')
    expect(localFolders).toHaveClass('rail-source-provider__collapse')
    expect(allPhotos).toHaveClass('rail-item--provider-child')
    expect(sourceAlbums).toHaveClass('rail-item--provider-child', 'rail-item--provider-toggle')
    expect(sourceAlbums.querySelector('.rail-item__tree-toggle')).toBeInTheDocument()
    expect(sourceFavorites).toHaveClass('rail-item--provider-child')
    expect(sourceAlbums).not.toHaveClass('rail-source-type-label')
    expect(localFolders).toHaveAttribute('aria-expanded', 'false')
    expect(container.querySelector('.rail-item__count')).not.toBeInTheDocument()
    expect(container.querySelector('.rail-source-provider__count')).not.toBeInTheDocument()
    const favoritesButtons = screen.getAllByRole('button', { name: 'Favorites' })
    await user.click(favoritesButtons[favoritesButtons.length - 1])
    expect(selections).toContainEqual({ type: 'source-favorites', sourceId: 'photos-1', sourceName: 'Apple Photos' })
  })

  it('collapses top-level navigation groups and source providers independently', async () => {
    const user = userEvent.setup()
    const summary: LibrarySummary = {
      totalPhotos: 100,
      recentlyAddedCount: 0,
      favoritesCount: 0,
      hiddenCount: 0,
      sources: [
        { id: 'photos-1', name: 'Apple Photos', sourceKind: 'apple_photos', rootPath: 'apple-photos://library', status: 'online', photoCount: 100 },
      ],
    }
    render(
      <LeftRail
        librarySummary={summary}
        isScanning={false}
        sourceCollections={[{ id: 'album-1', sourceId: 'photos-1', name: 'Japan', photoCount: 12 }]}
      />,
    )

    const initialToggle = screen.queryByRole('button', { name: 'Expand Apple Photos' })
    if (!initialToggle) await user.click(screen.getByRole('button', { name: 'Collapse Apple Photos' }))
    expect(screen.queryByRole('button', { name: /Japan/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Expand Apple Photos' }))
    expect(screen.getByRole('button', { name: 'Expand Albums' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: /Japan/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Expand Albums' }))
    expect(screen.getByRole('button', { name: /Japan/ })).toHaveClass('rail-item--provider-collection')
    await user.click(screen.getByRole('button', { name: 'Collapse Sources' }))
    expect(screen.queryByText('Apple Photos')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Expand Sources' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('renders nested source folders and selects a folder filter', async () => {
    const user = userEvent.setup()
    const summary: LibrarySummary = {
      totalPhotos: 4,
      recentlyAddedCount: 0,
      favoritesCount: 0, hiddenCount: 0,
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

    await user.click(screen.getByRole('button', { name: 'Expand Local Folders' }))
    expect(screen.getByRole('button', { name: /Pictures 4/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Trips 2/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Japan 2/i }).closest('.rail-item--folder')).toHaveClass('active')
    expect(screen.getByRole('button', { name: /Kyoto 1/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Kyoto 1/i }))

    expect(selections).toEqual([{ type: 'folder', sourceId: 'source-1', folderPath: 'Trips/Japan/Kyoto' }])
  })
})
