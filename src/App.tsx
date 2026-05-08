import { useEffect, useState } from 'react'
import { ContextPanel } from './components/ContextPanel'
import { LeftRail } from './components/LeftRail'
import { PhotoSurface } from './components/PhotoSurface'
import { TopBar } from './components/TopBar'
import { type DesktopEnvironment, getDesktopEnvironment } from './desktop/environment'
import { getLibrarySummary, listenToScanProgress, pickPhotoFolder, scanPhotoSource } from './desktop/library'
import { getSourceFolders, togglePhotoFavorite } from './desktop/photos'
import type { LibrarySummary, ScanProgress } from './types/library'
import type { PhotoFilter, SourceFolder, TimelinePhoto } from './types/photos'

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
  })
  const [isScanning, setIsScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [selectedPhoto, setSelectedPhoto] = useState<TimelinePhoto | null>(null)
  const [sourceFolders, setSourceFolders] = useState<SourceFolder[]>([])
  const [photoFilter, setPhotoFilter] = useState<PhotoFilter | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    void getDesktopEnvironment().then(setDesktopEnvironment)
    void getLibrarySummary().then(setLibrarySummary)
    void getSourceFolders().then(setSourceFolders)
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
        : activeFolder?.folderPath
          ? activeFolder.folderPath
          : activeSource?.name ?? 'All Photos'
  const topBarViewTitle = trimmedSearchQuery ? 'Search Results' : 'Timeline: All Photos'

  return (
    <div className="app-shell">
      <TopBar
        onAddFolder={handleAddFolder}
        isScanning={isScanning}
        librarySummary={librarySummary}
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        viewTitle={topBarViewTitle}
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
        />
        <PhotoSurface
          key={refreshKey}
          filter={photoFilter}
          title={photoViewTitle}
          selectedPhotoId={selectedPhoto?.id ?? null}
          searchQuery={searchQuery}
          onSelectPhoto={setSelectedPhoto}
        />
        <ContextPanel
          desktopEnvironment={desktopEnvironment}
          librarySummary={librarySummary}
          selectedPhoto={selectedPhoto}
          onToggleFavorite={handleToggleFavorite}
        />
      </div>
    </div>
  )
}
