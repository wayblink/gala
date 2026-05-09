import { useEffect, useMemo, useState } from 'react'
import {
  getAlbumPhotos,
  getFavoritePhotos,
  getFilteredPhotos,
  getHiddenPhotos,
  getRecentlyAddedPhotos,
  getTimelinePhotos,
  searchPhotos,
} from '../desktop/photos'
import { groupTimelinePhotos } from '../data/photoTimeline'
import type { FilterOptions, PhotoDisplayMode, PhotoFilter, SmartFilter, TimelinePhoto } from '../types/photos'
import { FilterPanel } from './FilterPanel'
import { PhotoCard } from './PhotoCard'
import { PhotoGallery } from './PhotoGallery'
import { PhotoViewer } from './PhotoViewer'

const PHOTOS_PER_PAGE = 50

type PhotoSurfaceProps = {
  filter: PhotoFilter | null
  title: string
  displayMode: PhotoDisplayMode
  selectedPhotoId: string | null
  searchQuery: string
  onSelectPhoto: (photo: TimelinePhoto) => void
  smartFilter?: SmartFilter
  filterPanelOpen?: boolean
  filterOptions?: FilterOptions | null
  onSmartFilterChange?: (f: SmartFilter) => void
  onCloseFilterPanel?: () => void
}

function filterKey(filter: PhotoFilter | null, searchQuery: string, smartFilter: SmartFilter): string {
  const trimmedSearch = searchQuery.trim()
  if (trimmedSearch) return `search:${trimmedSearch}`
  if (!filter) return `all:${JSON.stringify(smartFilter)}`
  if (filter.type === 'recent') return 'recent'
  if (filter.type === 'favorites') return 'favorites'
  if (filter.type === 'hidden') return 'hidden'
  if (filter.type === 'album') return `album:${filter.albumId}`
  return `folder:${filter.sourceId}:${filter.folderPath}:${JSON.stringify(smartFilter)}`
}

export function PhotoSurface({
  filter,
  title,
  displayMode,
  selectedPhotoId,
  searchQuery,
  onSelectPhoto,
  smartFilter = {},
  filterPanelOpen = false,
  filterOptions = null,
  onSmartFilterChange,
  onCloseFilterPanel,
}: PhotoSurfaceProps) {
  const [photos, setPhotos] = useState<TimelinePhoto[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const trimmedSearchQuery = searchQuery.trim()
  const currentFilterKey = filterKey(filter, searchQuery, smartFilter)
  const hasSmartFilter = Object.keys(smartFilter).some(
    (k) => (smartFilter as Record<string, unknown>)[k] !== undefined &&
      ((smartFilter as Record<string, unknown>)[k] as unknown[])?.length !== 0
  )
  const shouldGroupByTimeline =
    !trimmedSearchQuery && (!filter || filter.type === 'folder') && !hasSmartFilter
  const groupedPhotos = useMemo(
    () => (shouldGroupByTimeline ? groupTimelinePhotos(photos) : []),
    [photos, shouldGroupByTimeline],
  )
  const visiblePhotos = useMemo(
    () => (shouldGroupByTimeline ? groupedPhotos.flatMap((group) => group.photos) : photos),
    [groupedPhotos, photos, shouldGroupByTimeline],
  )

  useEffect(() => {
    setPhotos([])
    setIsLoading(true)
    setOffset(0)
    setHasMore(true)
    setViewerIndex(null)
  }, [currentFilterKey])

  useEffect(() => {
    let cancelled = false

    const loadPhotos = async () => {
      if (!hasMore && offset !== 0) {
        return
      }

      setIsLoading(true)

      let newPhotos: TimelinePhoto[]
      if (trimmedSearchQuery) {
        newPhotos = await searchPhotos(trimmedSearchQuery, PHOTOS_PER_PAGE, offset)
      } else if (filter?.type === 'recent') {
        newPhotos = await getRecentlyAddedPhotos(PHOTOS_PER_PAGE, offset)
      } else if (filter?.type === 'favorites') {
        newPhotos = await getFavoritePhotos(PHOTOS_PER_PAGE, offset)
      } else if (filter?.type === 'hidden') {
        newPhotos = await getHiddenPhotos(PHOTOS_PER_PAGE, offset)
      } else if (filter?.type === 'album') {
        newPhotos = await getAlbumPhotos(filter.albumId, PHOTOS_PER_PAGE, offset)
      } else if (hasSmartFilter) {
        const sourceId = filter?.type === 'folder' ? filter.sourceId : undefined
        const folderPath = filter?.type === 'folder' ? filter.folderPath : undefined
        newPhotos = await getFilteredPhotos(PHOTOS_PER_PAGE, offset, smartFilter, sourceId, folderPath)
      } else {
        newPhotos = await getTimelinePhotos(PHOTOS_PER_PAGE, offset, filter)
      }

      if (cancelled) {
        return
      }

      if (newPhotos.length < PHOTOS_PER_PAGE) {
        setHasMore(false)
      }
      setPhotos((prev) => (offset === 0 ? newPhotos : [...prev, ...newPhotos]))
      if (offset === 0 && newPhotos.length > 0) {
        onSelectPhoto(newPhotos[0])
      }
      setIsLoading(false)
    }

    void loadPhotos()

    return () => {
      cancelled = true
    }
  }, [filter, currentFilterKey, hasMore, offset, onSelectPhoto, trimmedSearchQuery])

  const handleScroll = (e: React.UIEvent<HTMLElement>) => {
    const element = e.currentTarget
    const isNearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 500

    if (isNearBottom && hasMore && !isLoading) {
      setOffset((prev) => prev + PHOTOS_PER_PAGE)
    }
  }

  const openPhotoViewer = (photo: TimelinePhoto) => {
    onSelectPhoto(photo)
    setViewerIndex(visiblePhotos.findIndex((item) => item.id === photo.id))
  }

  const renderPhotoCard = (photo: TimelinePhoto) => (
    <PhotoCard
      key={photo.id}
      photo={photo}
      variant={displayMode === 'list' ? 'list' : 'thumbnail'}
      selected={photo.id === selectedPhotoId}
      onClick={() => openPhotoViewer(photo)}
    />
  )

  const collectionClassName = displayMode === 'list' ? 'photo-list' : 'photo-grid'
  const shouldShowHeader = displayMode !== 'gallery' && title !== 'All Photos'

  return (
    <main
      className={`photo-surface${displayMode === 'gallery' ? ' photo-surface--gallery' : ''}`}
      aria-label="Timeline photo surface"
      onScroll={handleScroll}
    >
      {filterPanelOpen && filterOptions && (
        <FilterPanel
          filterOptions={filterOptions}
          smartFilter={smartFilter}
          onSmartFilterChange={(f) => onSmartFilterChange?.(f)}
          onClose={() => onCloseFilterPanel?.()}
        />
      )}
      {shouldShowHeader && (
        <header className="photo-surface__header">
          <h2>{title}</h2>
          <p>
            {photos.length} visible photos
            {shouldGroupByTimeline && groupedPhotos.length > 0
              ? ` · ${groupedPhotos.length} timeline groups`
              : ''}
          </p>
        </header>
      )}

      {photos.length === 0 && !isLoading && (
        <div className="photo-surface__empty">
          <p>No photos found in this view.</p>
        </div>
      )}

      {displayMode === 'gallery' && photos.length > 0 ? (
        <PhotoGallery
          photos={visiblePhotos}
          selectedPhotoId={selectedPhotoId}
          onSelectPhoto={onSelectPhoto}
          onOpenPhoto={openPhotoViewer}
        />
      ) : shouldGroupByTimeline ? (
        groupedPhotos.map((group) => (
          <section className="timeline-group" key={group.key}>
            <div className="timeline-group__header">
              <div>
                <h3>{group.title}</h3>
                <p>{group.count} photos</p>
              </div>
            </div>
            <div className={collectionClassName}>
              {group.photos.map(renderPhotoCard)}
            </div>
          </section>
        ))
      ) : (
        <div className={collectionClassName}>
          {photos.map(renderPhotoCard)}
        </div>
      )}

      {isLoading && (
        <div className="photo-surface__loading">
          <p>Loading photos...</p>
        </div>
      )}

      {viewerIndex !== null && (
        <PhotoViewer
          photos={visiblePhotos}
          initialIndex={viewerIndex}
          onPhotoChange={onSelectPhoto}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </main>
  )
}
