import { useEffect, useState } from 'react'
import { ContextPanel } from './components/ContextPanel'
import { LeftRail } from './components/LeftRail'
import { PhotoSurface } from './components/PhotoSurface'
import { TopBar } from './components/TopBar'
import { type DesktopEnvironment, getDesktopEnvironment } from './desktop/environment'
import { getLibrarySummary, listenToScanProgress, pickPhotoFolder, scanPhotoSource } from './desktop/library'
import {
  addPhotoToAlbum,
  createAlbum,
  deleteAlbum,
  getAlbums,
  getFilterOptions,
  getSourceFolders,
  removePhotoFromAlbum,
  renameAlbum,
  togglePhotoFavorite,
  togglePhotoHidden,
} from './desktop/photos'
import type { LibrarySummary, ScanProgress } from './types/library'
import type { Album, FilterOptions, PhotoDisplayMode, PhotoFilter, SmartFilter, SourceFolder, TimelinePhoto } from './types/photos'

export default function App() {
  const [desktopEnvironment, setDesktopEnvironment] = useState<DesktopEnvironment>({
    runtime: 'web',
    platform: 'browser',
    engine: 'mock',
  })
  const [librarySummary, setLibrarySummary] = useState<LibrarySummary>({
    sources: [],
    totalPhotos: 0,
    recentlyAddedCount: 0,
    favoritesCount: 0,
    hiddenCount: 0,
  })
  const [isScanning, setIsScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [selectedPhoto, setSelectedPhoto] = useState<TimelinePhoto | null>(null)
  const [sourceFolders, setSourceFolders] = useState<SourceFolder[]>([])
  const [photoFilter, setPhotoFilter] = useState<PhotoFilter | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [displayMode, setDisplayMode] = useState<PhotoDisplayMode>('thumbnail')
  const [albums, setAlbums] = useState<Album[]>([])
  const [smartFilter, setSmartFilter] = useState<SmartFilter>({})
  const [filterPanelOpen, setFilterPanelOpen] = useState(false)
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null)

  useEffect(() => {
    void getDesktopEnvironment().then(setDesktopEnvironment)
    void getLibrarySummary().then(setLibrarySummary)
    void getSourceFolders().then(setSourceFolders)
    void getAlbums().then(setAlbums)
    void getFilterOptions().then(setFilterOptions)
  }, [])

  useEffect(() => {
    let unlisten: (() => void) | null = null
    let isMounted = true

    void listenToScanProgress((progress) => {
      if (!isMounted) {
        return
      }

      setScanProgress(progress)
      if (progress.status === 'completed' || progress.status === 'failed') {
        setIsScanning(false)
      } else {
        setIsScanning(true)
      }
    }).then((cleanup) => {
      unlisten = cleanup
    })

    return () => {
      isMounted = false
      unlisten?.()
    }
  }, [])

  const handleAddFolder = async () => {
    console.log('Add folder clicked, isScanning:', isScanning)
    const path = await pickPhotoFolder()
    console.log('Picked folder path:', path)
    if (!path) {
      console.warn('No folder selected or Tauri not available')
      return
    }

    setIsScanning(true)
    setScanProgress({
      status: 'scanning',
      rootPath: path,
      sourceId: null,
      discoveredCount: 0,
      indexedCount: 0,
      thumbnailReadyCount: 0,
      thumbnailFailedCount: 0,
      skippedCount: 0,
      currentFile: null,
      errorMessage: null,
    })
    try {
      console.log('Starting scan for:', path)
      const result = await scanPhotoSource(path)
      console.log('Scan result:', result)
      if (result) {
        setLibrarySummary(await getLibrarySummary())
        setSourceFolders(await getSourceFolders())
        setAlbums(await getAlbums())
        setFilterOptions(await getFilterOptions())
        setPhotoFilter(null)
        setSelectedPhoto(null)
        setRefreshKey((prev) => prev + 1)
      }
    } catch (error) {
      console.error('Scan error:', error)
    } finally {
      setIsScanning(false)
    }
  }

  const handleSelectAllPhotos = () => {
    setPhotoFilter(null)
    setSearchQuery('')
    setSelectedPhoto(null)
  }

  const handleSelectRecent = () => {
    setPhotoFilter({ type: 'recent' })
    setSearchQuery('')
    setSelectedPhoto(null)
  }

  const handleSelectFavorites = () => {
    setPhotoFilter({ type: 'favorites' })
    setSearchQuery('')
    setSelectedPhoto(null)
  }

  const handleSelectHidden = () => {
    setPhotoFilter({ type: 'hidden' })
    setSearchQuery('')
    setSelectedPhoto(null)
  }

  const handleSelectAlbum = (albumId: string) => {
    setPhotoFilter({ type: 'album', albumId })
    setSearchQuery('')
    setSelectedPhoto(null)
  }

  const handleCreateAlbum = async (name: string) => {
    const album = await createAlbum(name)
    if (album) setAlbums(await getAlbums())
  }

  const handleDeleteAlbum = async (albumId: string) => {
    await deleteAlbum(albumId)
    if (photoFilter?.type === 'album' && photoFilter.albumId === albumId) {
      setPhotoFilter(null)
    }
    setAlbums(await getAlbums())
  }

  const handleRenameAlbum = async (albumId: string, newName: string) => {
    await renameAlbum(albumId, newName)
    setAlbums(await getAlbums())
  }

  const handleSelectFolder = (filter: PhotoFilter) => {
    setPhotoFilter(filter)
    setSearchQuery('')
    setSelectedPhoto(null)
  }

  const handleSearchChange = (query: string) => {
    setSearchQuery(query)
    setSelectedPhoto(null)
  }

  const handleToggleFavorite = async (photoId: string) => {
    const newState = await togglePhotoFavorite(photoId)
    if (selectedPhoto && selectedPhoto.id === photoId) {
      setSelectedPhoto({ ...selectedPhoto, isFavorite: newState })
    }
    setLibrarySummary(await getLibrarySummary())
    setRefreshKey((prev) => prev + 1)
  }

  const handleToggleHidden = async (photoId: string) => {
    const newState = await togglePhotoHidden(photoId)
    if (selectedPhoto && selectedPhoto.id === photoId) {
      setSelectedPhoto({ ...selectedPhoto, isHidden: newState })
    }
    setLibrarySummary(await getLibrarySummary())
    setRefreshKey((prev) => prev + 1)
  }

  const handleAddToAlbum = async (albumId: string, photoId: string) => {
    await addPhotoToAlbum(albumId, photoId)
    setAlbums(await getAlbums())
    setRefreshKey((prev) => prev + 1)
  }

  const handleRemoveFromAlbum = async (albumId: string, photoId: string) => {
    await removePhotoFromAlbum(albumId, photoId)
    setAlbums(await getAlbums())
    setRefreshKey((prev) => prev + 1)
  }

  const activeFolder = photoFilter?.type === 'folder'
    ? sourceFolders.find(
        (folder) =>
          folder.sourceId === photoFilter.sourceId && folder.folderPath === photoFilter.folderPath,
      )
    : null
  const activeSource = photoFilter?.type === 'folder'
    ? librarySummary.sources.find((source) => source.id === photoFilter.sourceId)
    : null
  const trimmedSearchQuery = searchQuery.trim()
  const photoViewTitle = trimmedSearchQuery
    ? `Search: "${trimmedSearchQuery}"`
    : photoFilter?.type === 'recent'
      ? 'Recently Added'
      : photoFilter?.type === 'favorites'
        ? 'Favorites'
        : photoFilter?.type === 'hidden'
          ? 'Hidden'
          : photoFilter?.type === 'album'
            ? (albums.find((a) => a.id === photoFilter.albumId)?.name ?? 'Album')
            : activeFolder?.folderPath
              ? activeFolder.folderPath
              : activeSource?.name ?? 'All Photos'
  return (
    <div className="app-shell">
      <TopBar
        onAddFolder={handleAddFolder}
        isScanning={isScanning}
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        displayMode={displayMode}
        onDisplayModeChange={setDisplayMode}
        filterActive={Object.keys(smartFilter).length > 0}
        onToggleFilter={() => setFilterPanelOpen((prev) => !prev)}
      />
      <div className="workspace-grid">
        <LeftRail
          librarySummary={librarySummary}
          isScanning={isScanning}
          scanProgress={scanProgress}
          sourceFolders={sourceFolders}
          activeFilter={photoFilter}
          onSelectAllPhotos={handleSelectAllPhotos}
          onSelectRecent={handleSelectRecent}
          onSelectFavorites={handleSelectFavorites}
          onSelectFolder={handleSelectFolder}
          onSelectHidden={handleSelectHidden}
          albums={albums}
          onSelectAlbum={handleSelectAlbum}
          onCreateAlbum={handleCreateAlbum}
          onDeleteAlbum={handleDeleteAlbum}
          onRenameAlbum={handleRenameAlbum}
        />
        <PhotoSurface
          key={refreshKey}
          filter={photoFilter}
          title={photoViewTitle}
          displayMode={displayMode}
          selectedPhotoId={selectedPhoto?.id ?? null}
          searchQuery={searchQuery}
          smartFilter={smartFilter}
          filterPanelOpen={filterPanelOpen}
          filterOptions={filterOptions}
          onSmartFilterChange={setSmartFilter}
          onCloseFilterPanel={() => setFilterPanelOpen(false)}
          onSelectPhoto={setSelectedPhoto}
        />
        <ContextPanel
          desktopEnvironment={desktopEnvironment}
          librarySummary={librarySummary}
          selectedPhoto={selectedPhoto}
          onToggleFavorite={handleToggleFavorite}
          onToggleHidden={handleToggleHidden}
          albums={albums}
          currentAlbumId={photoFilter?.type === 'album' ? photoFilter.albumId : undefined}
          onAddToAlbum={handleAddToAlbum}
          onRemoveFromAlbum={handleRemoveFromAlbum}
        />
      </div>
    </div>
  )
}
