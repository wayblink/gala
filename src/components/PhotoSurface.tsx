import { useEffect, useMemo, useState } from 'react'
import { Eye, EyeOff, Star } from 'lucide-react'
import {
  getAlbumPhotos,
  getFavoritePhotos,
  getFilteredPhotos,
  getHiddenPhotos,
  getPhotosByLabel,
  getPhotosByPerson,
  getPhotosByTag,
  getRecentlyAddedPhotos,
  getTimelinePhotos,
  searchPhotos,
} from '../desktop/photos'
import { groupTimelinePhotos } from '../data/photoTimeline'
import type { Album, ComingSoonViewId, FilterOptions, PhotoDisplayMode, PhotoFilter, SmartFilter, TimelinePhoto } from '../types/photos'
import { ComingSoonView } from './ComingSoonView'
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
  dataVersion?: number
  onSelectPhoto: (photo: TimelinePhoto | null) => void
  smartFilter?: SmartFilter
  filterPanelOpen?: boolean
  filterOptions?: FilterOptions | null
  onSmartFilterChange?: (f: SmartFilter) => void
  onCloseFilterPanel?: () => void
  albums?: Album[]
  onBatchAddToAlbum?: (albumId: string, photoIds: string[]) => Promise<void>
  onBatchRemoveFromAlbum?: (albumId: string, photoIds: string[]) => Promise<void>
  selectionMode?: boolean
  onToggleSelectionMode?: () => void
  selectedIds: Set<string>
  onToggleSelectedId: (photoId: string) => void
  onClearSelection: () => void
  onSetSelectedIds: (ids: Set<string>) => void
  onBatchFavorite?: (photoIds: string[], favorited: boolean) => Promise<void>
  onBatchHide?: (photoIds: string[], hidden: boolean) => Promise<void>
  onBatchAddTags?: (photoIds: string[], tags: string[]) => Promise<void>
}

function filterKey(filter: PhotoFilter | null, searchQuery: string, smartFilter: SmartFilter, dataVersion: number): string {
  const trimmedSearch = searchQuery.trim()
  const v = `#v${dataVersion}`
  if (trimmedSearch) return `search:${trimmedSearch}${v}`
  if (!filter || filter.type === 'all') return `all:${JSON.stringify(smartFilter)}${v}`
  if (filter.type === 'recent') return `recent${v}`
  if (filter.type === 'favorites') return `favorites${v}`
  if (filter.type === 'hidden') return `hidden${v}`
  if (filter.type === 'album') return `album:${filter.albumId}${v}`
  if (filter.type === 'tag') return `tag:${filter.tagName}${v}`
  if (filter.type === 'label') return `label:${filter.labelId}${v}`
  if (filter.type === 'person') return `person:${filter.personId}${v}`
  if (filter.type === 'view') return `view:${filter.viewId}${v}`
  if (filter.type === 'explore') return `explore${v}`
  if (filter.type === 'sources') return `sources${v}`
  if (filter.type === 'settings') return `settings${v}`
  if (filter.type === 'tasks') return `tasks${v}`
  return `folder:${filter.sourceId}:${filter.folderPath}:${JSON.stringify(smartFilter)}${v}`
}

const comingSoonTitles: Record<ComingSoonViewId | 'explore', string> = {
  people: 'People',
  content: 'Content Recognition',
  similar: 'Similar Review',
  reorganize: 'Reorganize',
  explore: 'Explore',
}

function isComingSoonFilter(filter: PhotoFilter | null): filter is
  | { type: 'view'; viewId: ComingSoonViewId }
  | { type: 'explore' } {
  if (!filter) return false
  return filter.type === 'view' || filter.type === 'explore'
}

export function PhotoSurface({
  filter,
  title,
  displayMode,
  selectedPhotoId,
  searchQuery,
  dataVersion = 0,
  onSelectPhoto,
  smartFilter = {},
  filterPanelOpen = false,
  filterOptions = null,
  onSmartFilterChange,
  onCloseFilterPanel,
  albums = [],
  onBatchAddToAlbum,
  onBatchRemoveFromAlbum,
  selectionMode = false,
  onToggleSelectionMode,
  selectedIds,
  onToggleSelectedId,
  onClearSelection,
  onSetSelectedIds,
  onBatchFavorite,
  onBatchHide,
  onBatchAddTags,
}: PhotoSurfaceProps) {
  const [photos, setPhotos] = useState<TimelinePhoto[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [batchAlbumPickerOpen, setBatchAlbumPickerOpen] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const trimmedSearchQuery = searchQuery.trim()
  const currentFilterKey = filterKey(filter, searchQuery, smartFilter, dataVersion)
  const comingSoon = isComingSoonFilter(filter)
  const hasSmartFilter = Object.keys(smartFilter).some(
    (k) => (smartFilter as Record<string, unknown>)[k] !== undefined &&
      ((smartFilter as Record<string, unknown>)[k] as unknown[])?.length !== 0
  )
  const shouldGroupByTimeline =
    !trimmedSearchQuery && (!filter || filter.type === 'folder' || filter.type === 'all') && !hasSmartFilter
  const groupedPhotos = useMemo(
    () => (shouldGroupByTimeline ? groupTimelinePhotos(photos) : []),
    [photos, shouldGroupByTimeline],
  )
  const visiblePhotos = useMemo(
    () => (shouldGroupByTimeline ? groupedPhotos.flatMap((group) => group.photos) : photos),
    [groupedPhotos, photos, shouldGroupByTimeline],
  )

  const allSelectedFavorited = useMemo(() => {
    if (selectedIds.size === 0) return false
    const selectedPhotos = visiblePhotos.filter((p) => selectedIds.has(p.id))
    return selectedPhotos.length > 0 && selectedPhotos.every((p) => p.isFavorite)
  }, [selectedIds, visiblePhotos])

  useEffect(() => {
    setPhotos([])
    setIsLoading(true)
    setOffset(0)
    setHasMore(true)
    setViewerIndex(null)
    onClearSelection()
  }, [currentFilterKey, onClearSelection])

  useEffect(() => {
    let cancelled = false

    const loadPhotos = async () => {
      if (comingSoon) {
        setPhotos([])
        setIsLoading(false)
        setHasMore(false)
        return
      }
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
      } else if (filter?.type === 'tag') {
        newPhotos = await getPhotosByTag(filter.tagName, PHOTOS_PER_PAGE, offset)
      } else if (filter?.type === 'label') {
        newPhotos = await getPhotosByLabel(filter.labelId, PHOTOS_PER_PAGE, offset)
      } else if (filter?.type === 'person') {
        newPhotos = await getPhotosByPerson(filter.personId, PHOTOS_PER_PAGE, offset)
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
  }, [filter, currentFilterKey, hasMore, offset, onSelectPhoto, trimmedSearchQuery, comingSoon])

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

  const handlePhotoClick = (photo: TimelinePhoto) => {
    if (selectionMode) {
      onToggleSelectedId(photo.id)
      return
    }
    if (selectedPhotoId === photo.id) {
      onSelectPhoto(null) // toggle off
      return
    }
    onSelectPhoto(photo)
  }

  const handlePhotoDoubleClick = (photo: TimelinePhoto) => {
    if (selectionMode) return
    openPhotoViewer(photo)
  }

  const selectAllVisible = () => {
    onSetSelectedIds(new Set(visiblePhotos.map((p) => p.id)))
  }

  const renderPhotoCard = (photo: TimelinePhoto) => {
    const isChecked = selectedIds.has(photo.id)
    return (
      <div
        key={photo.id}
        className={`photo-card-wrapper${isChecked ? ' photo-card-wrapper--selected' : ''}${
          selectionMode ? ' photo-card-wrapper--selecting' : ''
        }`}
        onDoubleClick={(e) => {
          e.stopPropagation()
          handlePhotoDoubleClick(photo)
        }}
      >
        <PhotoCard
          photo={photo}
          variant={displayMode === 'list' ? 'list' : 'thumbnail'}
          selected={photo.id === selectedPhotoId}
          onClick={() => handlePhotoClick(photo)}
        />
        {selectionMode && (
          <button
            className="photo-select-overlay"
            type="button"
            title={isChecked ? 'Deselect' : 'Select'}
            aria-label={isChecked ? 'Deselect photo' : 'Select photo'}
            aria-pressed={isChecked}
            onClick={(e) => {
              e.stopPropagation()
              onToggleSelectedId(photo.id)
            }}
          >
            {isChecked ? '✓' : ''}
          </button>
        )}
      </div>
    )
  }

  const collectionClassName = displayMode === 'list' ? 'photo-list' : 'photo-grid'
  const shouldShowHeader = displayMode !== 'gallery' && title !== 'All Photos'

  if (comingSoon && filter) {
    const viewId = filter.type === 'view' ? filter.viewId : filter.type
    return <ComingSoonView viewId={viewId} title={comingSoonTitles[viewId] ?? title} />
  }

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

      {(selectionMode || selectedIds.size > 0) && (
        <div className="selection-toolbar">
          <span className="selection-toolbar__count">
            {selectedIds.size} selected
            {selectionMode ? ' · Select mode' : ''}
          </span>
          <div className="selection-toolbar__actions">
            <button
              className="selection-toolbar__btn"
              type="button"
              onClick={selectAllVisible}
              disabled={visiblePhotos.length === 0}
            >
              Select all
            </button>
            <button
              className="selection-toolbar__btn"
              type="button"
              disabled={selectedIds.size === 0}
              onClick={onClearSelection}
            >
              Unselect all
            </button>
            <button
              className="selection-toolbar__btn"
              type="button"
              disabled={selectedIds.size === 0 || !onBatchFavorite}
              title={allSelectedFavorited ? 'Remove favorite from selection' : 'Mark selection as favorite'}
              aria-label={allSelectedFavorited ? 'Unfavorite selection' : 'Favorite selection'}
              onClick={async () => {
                await onBatchFavorite?.(Array.from(selectedIds), !allSelectedFavorited)
              }}
            >
              <Star
                size={14}
                strokeWidth={2}
                fill={allSelectedFavorited ? 'currentColor' : 'none'}
              />
              {allSelectedFavorited ? 'Unfavorite' : 'Favorite'}
            </button>
            <button
              className="selection-toolbar__btn"
              type="button"
              disabled={selectedIds.size === 0 || !onBatchHide}
              title={filter?.type === 'hidden' ? 'Unhide selection' : 'Hide selection'}
              aria-label={filter?.type === 'hidden' ? 'Unhide selection' : 'Hide selection'}
              onClick={async () => {
                await onBatchHide?.(Array.from(selectedIds), filter?.type !== 'hidden')
              }}
            >
              {filter?.type === 'hidden' ? <Eye size={14} strokeWidth={2} /> : <EyeOff size={14} strokeWidth={2} />}
              {filter?.type === 'hidden' ? 'Unhide' : 'Hide'}
            </button>
            <form
              className="selection-toolbar__tag-form"
              onSubmit={async (e) => {
                e.preventDefault()
                const tag = tagInput.trim()
                if (!tag || selectedIds.size === 0 || !onBatchAddTags) return
                await onBatchAddTags(Array.from(selectedIds), [tag])
                setTagInput('')
              }}
            >
              <input
                className="selection-toolbar__tag-input"
                placeholder="Add tag…"
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                disabled={selectedIds.size === 0 || !onBatchAddTags}
              />
              <button
                className="selection-toolbar__btn"
                type="submit"
                disabled={selectedIds.size === 0 || !onBatchAddTags || !tagInput.trim()}
              >
                Tag
              </button>
            </form>
            <div className="selection-toolbar__album-picker">
              <button
                className="selection-toolbar__btn"
                type="button"
                onClick={() => setBatchAlbumPickerOpen((v) => !v)}
                disabled={selectedIds.size === 0}
              >
                Add to Album
              </button>
              {batchAlbumPickerOpen && (
                <div className="selection-toolbar__album-dropdown">
                  {albums.length === 0 && <div className="selection-toolbar__album-empty">No albums</div>}
                  {albums.map((album) => (
                    <button
                      className="selection-toolbar__album-item"
                      key={album.id}
                      type="button"
                      onClick={async () => {
                        await onBatchAddToAlbum?.(album.id, Array.from(selectedIds))
                        setBatchAlbumPickerOpen(false)
                      }}
                    >
                      {album.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {filter?.type === 'album' && onBatchRemoveFromAlbum ? (
              <button
                className="selection-toolbar__btn"
                type="button"
                disabled={selectedIds.size === 0}
                onClick={async () => {
                  if (filter.type !== 'album') return
                  await onBatchRemoveFromAlbum(filter.albumId, Array.from(selectedIds))
                }}
              >
                Remove from Album
              </button>
            ) : null}
            <button
              className="selection-toolbar__btn selection-toolbar__btn--clear"
              type="button"
              onClick={() => {
                onClearSelection()
                setBatchAlbumPickerOpen(false)
                if (selectionMode) onToggleSelectionMode?.()
              }}
            >
              {selectionMode ? 'Done' : 'Clear'}
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
