import { useEffect, useMemo, useState } from 'react'
import {
  downloadApplePhotosOriginal,
  getAlbumPhotos,
  getFavoritePhotos,
  getFilteredPhotos,
  getHiddenPhotos,
  getPhotosByLabel,
  getPhotosByPerson,
  getPhotosByTag,
  getRecentlyAddedPhotos,
  getSourceCollectionPhotos,
  getTimelinePhotos,
} from '../desktop/photos'
import { groupTimelinePhotos } from '../data/photoTimeline'
import type { SelectionScope } from '../state/useSelection'
import type { ComingSoonViewId, PhotoDisplayMode, PhotoFilter, SmartFilter, TimelinePhoto } from '../types/photos'
import { ComingSoonView } from './ComingSoonView'
import { PhotoCard } from './PhotoCard'
import { PhotoGallery } from './PhotoGallery'
import { PhotoViewer } from './PhotoViewer'
import { ThemedSelect } from './ThemedSelect'
import { CheckSquare, GalleryHorizontal, Grid3X3, Rows3 } from 'lucide-react'
import { useI18n } from '../state/useLocale'

const PHOTOS_PER_PAGE = 50
const SELECTION_PAGE_SIZE = 500
const MAX_SELECTION_SIZE = 100_000

type PhotoSurfaceProps = {
  filter: PhotoFilter | null
  title: string
  displayMode: PhotoDisplayMode
  onDisplayModeChange?: (mode: PhotoDisplayMode) => void
  selectedPhotoId: string | null
  searchQuery: string
  dataVersion?: number
  onSelectPhoto: (photo: TimelinePhoto | null) => void
  onHoverPhoto?: (photo: TimelinePhoto | null) => void
  smartFilter?: SmartFilter
  variantMode?: 'merged' | 'separate'
  selectionMode?: boolean
  onToggleSelectionMode?: () => void
  selectedIds: Set<string>
  onToggleSelectedId: (photoId: string) => void
  onClearSelection: () => void
  onSetSelectedIds: (ids: Set<string>, scope?: SelectionScope | null) => void
  selectionScope?: SelectionScope | null
  showQuality?: boolean
  originalPaths?: Record<string, string>
  onOriginalPathsLoaded?: (paths: Record<string, string>) => void
}

type VariantDisplayMode = 'merged' | 'separate'
type VariantSelectionMode = 'all' | 'raw' | 'jpeg' | 'heif'

function getTimelineWithVariantMode(limit: number, offset: number, filter: PhotoFilter | null, mode: VariantDisplayMode) {
  return mode === 'merged'
    ? getTimelinePhotos(limit, offset, filter)
    : getTimelinePhotos(limit, offset, filter, false)
}

function filterKey(filter: PhotoFilter | null, searchQuery: string, smartFilter: SmartFilter, dataVersion: number): string {
  const trimmedSearch = searchQuery.trim()
  const v = `#v${dataVersion}`
  if (trimmedSearch) return `search:${trimmedSearch}${v}`
  if (!filter || filter.type === 'all') return `all:${JSON.stringify(smartFilter)}${v}`
  if (filter.type === 'recent') return `recent${v}`
  if (filter.type === 'favorites') return `favorites${v}`
  if (filter.type === 'hidden') return `hidden${v}`
  if (filter.type === 'source-favorites') return `source-favorites:${filter.sourceId}${v}`
  if (filter.type === 'source-collection') return `source-collection:${filter.collectionId}${v}`
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
  onDisplayModeChange,
  selectedPhotoId,
  searchQuery,
  dataVersion = 0,
  onSelectPhoto,
  onHoverPhoto,
  smartFilter = {},
  variantMode = 'merged',
  selectionMode = false,
  onToggleSelectionMode,
  selectedIds,
  onToggleSelectedId,
  onClearSelection,
  onSetSelectedIds,
  selectionScope = null,
  showQuality = false,
  originalPaths = {},
  onOriginalPathsLoaded,
}: PhotoSurfaceProps) {
  const { t } = useI18n()
  const [variantSelectionMode, setVariantSelectionMode] = useState<VariantSelectionMode>('all')
  const [photos, setPhotos] = useState<TimelinePhoto[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [selectionBusyLabel, setSelectionBusyLabel] = useState<string | null>(null)
  const [selectionError, setSelectionError] = useState<string | null>(null)
  const trimmedSearchQuery = searchQuery.trim()
  const currentFilterKey = `${filterKey(filter, searchQuery, smartFilter, dataVersion)}:${variantMode}`
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

  const selectionSummary = useMemo(() => {
    const applePhotos = Array.from(selectedIds).filter((id) => id.startsWith('apple-photos:')).length
    return {
      total: selectedIds.size,
      applePhotos,
      localPhotos: selectedIds.size - applePhotos,
    }
  }, [selectedIds])
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
        const sourceId = filter?.type === 'folder' ? filter.sourceId : undefined
        const folderPath = filter?.type === 'folder' ? filter.folderPath : undefined
        newPhotos = await getFilteredPhotos(PHOTOS_PER_PAGE, offset, { ...smartFilter, mergeVariants: variantMode === 'merged' }, sourceId, folderPath, trimmedSearchQuery)
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
      } else if (filter?.type === 'source-favorites') {
        newPhotos = await getFavoritePhotos(PHOTOS_PER_PAGE, offset, filter.sourceId)
      } else if (filter?.type === 'source-collection') {
        newPhotos = await getSourceCollectionPhotos(filter.collectionId, PHOTOS_PER_PAGE, offset)
      } else if (hasSmartFilter) {
        const sourceId = filter?.type === 'folder' ? filter.sourceId : undefined
        const folderPath = filter?.type === 'folder' ? filter.folderPath : undefined
        newPhotos = await getFilteredPhotos(PHOTOS_PER_PAGE, offset, { ...smartFilter, mergeVariants: variantMode === 'merged' }, sourceId, folderPath)
      } else {
        newPhotos = await getTimelineWithVariantMode(PHOTOS_PER_PAGE, offset, filter, variantMode)
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
    if (!selectionMode) onToggleSelectionMode?.()
    const ids = visiblePhotos.flatMap((photo) => {
      const variants = photo.variants ?? []
      if (variantSelectionMode === 'all') return variants.length > 0 ? variants.map((v) => v.id) : [photo.id]
      return variants.filter((variant) => variant.formatKind === variantSelectionMode).map((variant) => variant.id)
    })
    onSetSelectedIds(new Set(ids), { kind: 'visible', label: `Visible photos · ${variantSelectionMode}` })
  }
  const fetchSelectionPage = async (limit: number, pageOffset: number): Promise<TimelinePhoto[]> => {
    if (trimmedSearchQuery) {
      const sourceId = filter?.type === 'folder' ? filter.sourceId : undefined
      const folderPath = filter?.type === 'folder' ? filter.folderPath : undefined
      return getFilteredPhotos(limit, pageOffset, { ...smartFilter, mergeVariants: variantMode === 'merged' }, sourceId, folderPath, trimmedSearchQuery)
    }
    if (filter?.type === 'recent') return getRecentlyAddedPhotos(limit, pageOffset)
    if (filter?.type === 'favorites') return getFavoritePhotos(limit, pageOffset)
    if (filter?.type === 'hidden') return getHiddenPhotos(limit, pageOffset)
    if (filter?.type === 'album') return getAlbumPhotos(filter.albumId, limit, pageOffset)
    if (filter?.type === 'tag') return getPhotosByTag(filter.tagName, limit, pageOffset)
    if (filter?.type === 'label') return getPhotosByLabel(filter.labelId, limit, pageOffset)
    if (filter?.type === 'person') return getPhotosByPerson(filter.personId, limit, pageOffset)
    if (filter?.type === 'source-favorites') return getFavoritePhotos(limit, pageOffset, filter.sourceId)
    if (filter?.type === 'source-collection') return getSourceCollectionPhotos(filter.collectionId, limit, pageOffset)
    if (hasSmartFilter) {
      return getFilteredPhotos(
        limit,
        pageOffset,
        smartFilter,
        filter?.type === 'folder' ? filter.sourceId : undefined,
        filter?.type === 'folder' ? filter.folderPath : undefined,
      )
    }
    return getTimelineWithVariantMode(limit, pageOffset, filter, variantMode)
  }

  const resolveAllPages = async (
    getPage: (limit: number, pageOffset: number) => Promise<TimelinePhoto[]>,
  ): Promise<TimelinePhoto[]> => {
    const resolved: TimelinePhoto[] = []
    for (let pageOffset = 0; ; pageOffset += SELECTION_PAGE_SIZE) {
      const page = await getPage(SELECTION_PAGE_SIZE, pageOffset)
      if (resolved.length + page.length > MAX_SELECTION_SIZE) {
        throw new Error(`Selection exceeds the ${MAX_SELECTION_SIZE.toLocaleString()} photo safety limit.`)
      }
      resolved.push(...page)
      if (page.length < SELECTION_PAGE_SIZE) return resolved
      if (resolved.length === MAX_SELECTION_SIZE) {
        const overflow = await getPage(1, pageOffset + SELECTION_PAGE_SIZE)
        if (overflow.length > 0) {
          throw new Error(`Selection exceeds the ${MAX_SELECTION_SIZE.toLocaleString()} photo safety limit.`)
        }
        return resolved
      }
    }
  }

  const selectAllMatching = async () => {
    if (selectionBusyLabel) return
    if (!selectionMode) onToggleSelectionMode?.()
    setSelectionError(null)
    setSelectionBusyLabel('Selecting all matching photos…')
    try {
      const matching = await resolveAllPages(fetchSelectionPage)
      const ids = matching.flatMap((photo) => {
        const variants = photo.variants ?? []
        if (variantSelectionMode === 'all') return variants.length > 0 ? variants.map((v) => v.id) : [photo.id]
        return variants.filter((variant) => variant.formatKind === variantSelectionMode).map((variant) => variant.id)
      })
      onSetSelectedIds(new Set(ids), { kind: 'matching', label: variantSelectionMode === 'all' ? title : `${title} · ${variantSelectionMode}` })
    } catch (error) {
      setSelectionError(error instanceof Error ? error.message : 'Could not select all matching photos.')
    } finally {
      setSelectionBusyLabel(null)
    }
  }

  const resolveDateGroup = async (group: typeof groupedPhotos[number]) => {
    const allMatching = await resolveAllPages(fetchSelectionPage)
    if (group.key === 'undated') return allMatching.filter((photo) => !photo.capturedAt)
    return allMatching.filter((photo) => {
      if (!photo.capturedAt) return false
      const date = new Date(photo.capturedAt)
      if (Number.isNaN(date.getTime())) return false
      const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
      return key === group.key
    })
  }

  const selectDateGroup = async (group: typeof groupedPhotos[number], deselect: boolean) => {
    if (selectionBusyLabel) return
    if (!selectionMode) onToggleSelectionMode?.()
    setSelectionError(null)
    setSelectionBusyLabel(`${deselect ? 'Deselecting' : 'Selecting'} ${group.title}…`)
    try {
      const datePhotos = await resolveDateGroup(group)
      const nextSelection = new Set(selectedIds)
      datePhotos.forEach((photo) => deselect ? nextSelection.delete(photo.id) : nextSelection.add(photo.id))
      onSetSelectedIds(nextSelection, deselect ? { kind: 'explicit' } : { kind: 'date', dateKey: group.key, label: group.title })
    } catch (error) {
      setSelectionError(error instanceof Error ? error.message : `Could not select ${group.title}.`)
    } finally {
      setSelectionBusyLabel(null)
    }
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
          originalPath={originalPaths[photo.id]}
          variant={displayMode === 'list' ? 'list' : 'thumbnail'}
          selected={photo.id === selectedPhotoId}
          onClick={() => handlePhotoClick(photo)}
          onHover={() => onHoverPhoto?.(photo)}
          showQuality={showQuality}
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
      onMouseLeave={() => onHoverPhoto?.(null)}
    >
      <div className="photo-surface__toolbar">
        <div className="photo-surface__toolbar-title">
          {!shouldShowHeader && <span className="photo-surface__toolbar-title-text">{title}</span>}
        </div>
        <div className="photo-surface__toolbar-tools">
          <div className="seg" role="group" aria-label={t('top.displayMode')}>
            <button type="button" className={displayMode === 'thumbnail' ? 'on' : ''} title={t('top.thumbnailTable')} aria-label={t('top.thumbnailTable')} aria-pressed={displayMode === 'thumbnail'} onClick={() => onDisplayModeChange?.('thumbnail')}><Grid3X3 size={15} /></button>
            <button type="button" className={displayMode === 'list' ? 'on' : ''} title={t('top.list')} aria-label={t('top.list')} aria-pressed={displayMode === 'list'} onClick={() => onDisplayModeChange?.('list')}><Rows3 size={15} /></button>
            <button type="button" className={displayMode === 'gallery' ? 'on' : ''} title={t('top.gallery')} aria-label={t('top.gallery')} aria-pressed={displayMode === 'gallery'} onClick={() => onDisplayModeChange?.('gallery')}><GalleryHorizontal size={15} /></button>
          </div>
          <button type="button" className={`iconbtn${selectionMode ? ' on' : ''}`} title={selectionMode ? t('top.doneSelecting') : t('top.select')} aria-label={selectionMode ? t('top.exitSelection') : t('top.enterSelection')} aria-pressed={selectionMode} onClick={onToggleSelectionMode}><CheckSquare size={15} /></button>
        </div>
      </div>
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
        groupedPhotos.map((group) => {
          const selectedInGroup = group.photos.filter((photo) => selectedIds.has(photo.id)).length
          const allInGroupSelected = selectedInGroup === group.photos.length
          return (
            <section className="timeline-group" key={group.key}>
              <div className="timeline-group__header">
                <div>
                  <h3>{group.title}</h3>
                  <p>{group.count} photos</p>
                </div>
                <button
                  type="button"
                  className="timeline-group__select-btn"
                  onClick={() => void selectDateGroup(group, allInGroupSelected)}
                  disabled={selectionBusyLabel !== null}
                  aria-label={`${allInGroupSelected ? 'Deselect' : 'Select'} photos from ${group.title}`}
                >
                  {allInGroupSelected ? 'Deselect date' : selectedInGroup > 0 ? 'Select remaining' : 'Select date'}
                </button>
              </div>
              <div className={collectionClassName}>
                {group.photos.map(renderPhotoCard)}
              </div>
            </section>
          )
        })
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
          originalPaths={originalPaths}
          onLoadOriginal={async (photoId) => {
            const path = await downloadApplePhotosOriginal(photoId)
            if (path) onOriginalPathsLoaded?.({ [photoId]: path })
            return path
          }}
          onPhotoChange={onSelectPhoto}
          onClose={() => setViewerIndex(null)}
        />
      )}

      {(selectionMode || selectedIds.size > 0) && (
        <div className="selection-toolbar">
          <span className="selection-toolbar__count">
            {selectedIds.size} selected
            {selectionScope && 'label' in selectionScope ? ` · ${selectionScope.label}` : ''}
            {selectionSummary.total > 0 ? ` · ${selectionSummary.applePhotos} Apple Photos · ${selectionSummary.localPhotos} local` : ''}
          </span>
          <div className="selection-toolbar__actions">
            {selectionBusyLabel && <span className="selection-toolbar__status" role="status">{selectionBusyLabel}</span>}
            {selectionError && <span className="selection-toolbar__status selection-toolbar__status--error" role="alert">{selectionError}</span>}
            <button
              className="selection-toolbar__btn"
              type="button"
              onClick={selectAllVisible}
              disabled={visiblePhotos.length === 0 || selectionBusyLabel !== null}
            >
              Select visible
            </button>
            <button
              className="selection-toolbar__btn"
              type="button"
              onClick={() => void selectAllMatching()}
              disabled={visiblePhotos.length === 0 || selectionBusyLabel !== null}
            >
              Select all matching
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
              className="selection-toolbar__btn selection-toolbar__btn--clear"
              type="button"
              onClick={() => {
                onClearSelection()
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
