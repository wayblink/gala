import { ContextPanel } from './components/ContextPanel'
import { LeftRail } from './components/LeftRail'
import { PhotoSurface } from './components/PhotoSurface'
import { PhotoViewer } from './components/PhotoViewer'
import { TopBar } from './components/TopBar'
import { SimilarReviewView } from './features/similar-review/SimilarReviewView'
import { PeopleView } from './features/people/PeopleView'
import { photoEmbeddingsByIds, photoEmbeddingsSummary, analysisEmbedPhotos, readArtifactBytes } from './desktop/capability'
import { buildSimilarReviewQueue, DEFAULT_WINDOW_MS, DEFAULT_THRESHOLD_COSINE } from './features/similar-review/similarReviewModel'
import { getTimelinePhotos } from './desktop/photos'
import { pickPhotoFolder, scanPhotoSource } from './desktop/library'
import {
  addTagsToPhotosBatch,
  revealInFinder,
  setPhotosFavoriteBatch,
  setPhotosHiddenBatch,
  togglePhotoFavorite,
  togglePhotoHidden,
} from './desktop/photos'
import { useAlbums } from './state/useAlbums'
import { useLibrary } from './state/useLibrary'
import { useResizable } from './state/useResizable'
import { useSelection } from './state/useSelection'
import { useTags } from './state/useTags'
import { useViewFilter } from './state/useViewFilter'
import type { ComingSoonViewId, PhotoFilter } from './types/photos'
import { useEffect, useMemo, useState } from 'react'

export default function App() {
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const [similarReviewPhotos, setSimilarReviewPhotos] = useState<Awaited<ReturnType<typeof getTimelinePhotos>>>([])
  const [similarReviewWindowMs, setSimilarReviewWindowMs] = useState<number>(DEFAULT_WINDOW_MS)
  const [similarReviewThreshold, setSimilarReviewThreshold] = useState<number>(DEFAULT_THRESHOLD_COSINE)
  const [similarReviewEmbeddings, setSimilarReviewEmbeddings] = useState<Map<string, Float32Array>>(
    () => new Map(),
  )
  const [similarReviewEmbedStats, setSimilarReviewEmbedStats] = useState<{ total: number; embedded: number }>({
    total: 0,
    embedded: 0,
  })
  const [similarReviewEmbedBusy, setSimilarReviewEmbedBusy] = useState(false)
  const [similarReviewActiveCardId, setSimilarReviewActiveCardId] = useState<string | null>(null)
  const [similarReviewViewerState, setSimilarReviewViewerState] = useState<{
    photos: Awaited<ReturnType<typeof getTimelinePhotos>>
    index: number
  } | null>(null)

  const library = useLibrary()
  const albumsState = useAlbums()
  const tagsState = useTags()
  const selection = useSelection()
  const view = useViewFilter()
  const leftRailSize = useResizable({ storageKey: 'gala:leftRailW', initial: 240, min: 200, max: 480 })
  const rightPanelSize = useResizable({ storageKey: 'gala:rightPanelW', initial: 280, min: 220, max: 520 })

  const handleAddFolder = async () => {
    const path = await pickPhotoFolder()
    if (!path) return

    library.setIsScanning(true)
    library.setScanProgress({
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
      const result = await scanPhotoSource(path)
      if (result) {
        await library.refreshAll()
        await albumsState.refresh()
        view.setFilter(null)
        selection.setSelectedPhoto(null)
        view.bumpDataVersion()
      }
    } catch (error) {
      console.error('Scan error:', error)
    } finally {
      library.setIsScanning(false)
    }
  }

  const handleSelectAllPhotos = () => {
    view.setFilter(null)
    selection.setSelectedPhoto(null)
  }

  const handleSelectFilter = (next: PhotoFilter) => {
    view.setFilter(next)
    selection.setSelectedPhoto(null)
  }

  const handleSelectComingSoonView = (viewId: ComingSoonViewId) => {
    handleSelectFilter({ type: 'view', viewId })
    if (viewId === 'similar') {
      void getTimelinePhotos(100, 0).then(async (photos) => {
        setSimilarReviewPhotos(photos)
        await loadSimilarReviewEmbeddings(photos.map((p) => p.id))
        try {
          const summary = await photoEmbeddingsSummary()
          setSimilarReviewEmbedStats(summary)
        } catch {
          /* ignore */
        }
      })
    }
  }

  const loadSimilarReviewEmbeddings = async (photoIds: string[]) => {
    if (photoIds.length === 0) {
      setSimilarReviewEmbeddings(new Map())
      return
    }
    try {
      const rows = await photoEmbeddingsByIds(photoIds)
      const next = new Map<string, Float32Array>()
      for (const row of rows) {
        try {
          const buffer = await readArtifactBytes(row.embedding_path)
          if (buffer.byteLength === row.dimensions * 4) {
            next.set(row.photo_id, new Float32Array(buffer))
          }
        } catch (err) {
          console.warn('[similar-review] embedding read failed:', row.photo_id, err)
        }
      }
      setSimilarReviewEmbeddings(next)
    } catch (err) {
      console.warn('[similar-review] embeddings fetch failed:', err)
      setSimilarReviewEmbeddings(new Map())
    }
  }

  const handleRunPhotoEmbed = async () => {
    setSimilarReviewEmbedBusy(true)
    try {
      await analysisEmbedPhotos()
      const summary = await photoEmbeddingsSummary()
      setSimilarReviewEmbedStats(summary)
      await loadSimilarReviewEmbeddings(similarReviewPhotos.map((p) => p.id))
    } catch (err) {
      console.warn('[similar-review] embed run failed:', err)
    } finally {
      setSimilarReviewEmbedBusy(false)
    }
  }

  const handleSelectExplore = () => handleSelectFilter({ type: 'explore' })
  const handleSelectSettings = () => handleSelectFilter({ type: 'settings' })

  const handleSearchChange = (query: string) => {
    view.setSearchQuery(query)
    selection.setSelectedPhoto(null)
  }

  const handleToggleFavorite = async (photoId: string) => {
    const newState = await togglePhotoFavorite(photoId)
    selection.patchSelectedPhoto({ isFavorite: newState })
    await library.refreshSummary()
    view.bumpDataVersion()
  }

  const handleToggleHidden = async (photoId: string) => {
    const newState = await togglePhotoHidden(photoId)
    selection.patchSelectedPhoto({ isHidden: newState })
    await library.refreshSummary()
    view.bumpDataVersion()
  }

  const handleAddToAlbum = async (albumId: string, photoId: string) => {
    await albumsState.addPhoto(albumId, photoId)
    view.bumpDataVersion()
  }

  const handleRemoveFromAlbum = async (albumId: string, photoId: string) => {
    await albumsState.removePhoto(albumId, photoId)
    view.bumpDataVersion()
  }

  const handleBatchAddToAlbum = async (albumId: string, photoIds: string[]) => {
    await albumsState.addBatch(albumId, photoIds)
    view.bumpDataVersion()
  }

  const handleBatchFavorite = async (photoIds: string[], favorited: boolean) => {
    await setPhotosFavoriteBatch(photoIds, favorited)
    if (selection.selectedPhoto && photoIds.includes(selection.selectedPhoto.id)) {
      selection.patchSelectedPhoto({ isFavorite: favorited })
    }
    await library.refreshSummary()
    view.bumpDataVersion()
  }

  const handleBatchHide = async (photoIds: string[], hidden: boolean) => {
    await setPhotosHiddenBatch(photoIds, hidden)
    if (selection.selectedPhoto && photoIds.includes(selection.selectedPhoto.id)) {
      selection.patchSelectedPhoto({ isHidden: hidden })
    }
    await library.refreshSummary()
    view.bumpDataVersion()
  }

  const handleBatchAddTags = async (photoIds: string[], tags: string[]) => {
    await addTagsToPhotosBatch(photoIds, tags)
    await tagsState.refresh()
    view.bumpDataVersion()
  }

  const handleSetPhotoTags = async (photoId: string, nextTags: string[]) => {
    const updated = await tagsState.setForPhoto(photoId, nextTags)
    selection.patchSelectedPhoto({ tags: updated })
    view.bumpDataVersion()
  }

  const handleRevealInFinder = async (photoId: string) => {
    await revealInFinder(photoId)
  }

  const handleSelectTag = (tagName: string) => {
    handleSelectFilter({ type: 'tag', tagName })
  }

  const handleDeleteAlbum = async (albumId: string) => {
    if (view.filter?.type === 'album' && view.filter.albumId === albumId) {
      view.setFilter(null)
    }
    await albumsState.remove(albumId)
  }

  const folderFilter = view.filter?.type === 'folder' ? view.filter : null
  const activeFolder = folderFilter
    ? library.sources.find(
        (folder) =>
          folder.sourceId === folderFilter.sourceId && folder.folderPath === folderFilter.folderPath,
      )
    : null
  const activeSource = folderFilter
    ? library.summary.sources.find((source) => source.id === folderFilter.sourceId)
    : null
  const trimmedSearchQuery = view.searchQuery.trim()
  const photoViewTitle = trimmedSearchQuery
    ? `Search: "${trimmedSearchQuery}"`
    : view.filter?.type === 'recent'
      ? 'Recently Added'
      : view.filter?.type === 'favorites'
        ? 'Favorites'
        : view.filter?.type === 'hidden'
          ? 'Hidden'
          : view.filter?.type === 'album'
            ? (albumsState.albums.find((a) => view.filter?.type === 'album' && a.id === view.filter.albumId)?.name ?? 'Album')
            : view.filter?.type === 'tag'
              ? `Tag: ${view.filter.tagName}`
              : view.filter?.type === 'person'
                ? (view.filter.displayName ?? `Person · ${view.filter.personId.slice(0, 6)}`)
                : view.filter?.type === 'view'
                ? view.filter.viewId.charAt(0).toUpperCase() + view.filter.viewId.slice(1)
                : view.filter?.type === 'explore'
                  ? 'Explore'
                  : view.filter?.type === 'settings'
                    ? 'Settings'
                    : activeFolder?.folderPath
                      ? activeFolder.folderPath
                      : (activeSource?.name ?? 'All Photos')

  const filterActive = Object.keys(view.smartFilter).some(
    (k) => (view.smartFilter as Record<string, unknown>)[k] !== undefined,
  )
  const isSimilarReviewSelected = view.filter?.type === 'view' && view.filter.viewId === 'similar'
  const isPeopleSelected = view.filter?.type === 'view' && view.filter.viewId === 'people'
  const similarReviewCards = useMemo(
    () => buildSimilarReviewQueue(similarReviewPhotos, {
      windowMs: similarReviewWindowMs,
      embeddings: similarReviewEmbeddings.size > 0 ? similarReviewEmbeddings : undefined,
      thresholdCosine: similarReviewThreshold,
    }),
    [similarReviewPhotos, similarReviewWindowMs, similarReviewEmbeddings, similarReviewThreshold],
  )
  const similarReviewPhotosById = useMemo(
    () => new Map(similarReviewPhotos.map((p) => [p.id, p])),
    [similarReviewPhotos],
  )
  const similarReviewActiveCard = useMemo(() => {
    if (similarReviewCards.length === 0) return null
    return (
      similarReviewCards.find((c) => c.id === similarReviewActiveCardId) ?? similarReviewCards[0]
    )
  }, [similarReviewCards, similarReviewActiveCardId])
  useEffect(() => {
    if (!isSimilarReviewSelected) return
    const expected = similarReviewActiveCard?.id ?? null
    if (expected !== similarReviewActiveCardId) setSimilarReviewActiveCardId(expected)
  }, [isSimilarReviewSelected, similarReviewActiveCard, similarReviewActiveCardId])

  const similarReviewInspector = isSimilarReviewSelected
    ? (() => {
        if (!similarReviewActiveCard) {
          return (
            <section>
              <p className="eyebrow">Similar Review</p>
              <p className="mono-muted">No active group. Widen the time window or scan a source.</p>
            </section>
          )
        }
        const card = similarReviewActiveCard
        const firstPhoto = similarReviewPhotosById.get(card.photoIds[0])
        const totalBytes = card.photoIds.reduce(
          (acc, id) => acc + (similarReviewPhotosById.get(id)?.fileSize ?? 0),
          0,
        )
        const totalSize =
          totalBytes >= 1024 * 1024
            ? `${(totalBytes / 1024 / 1024).toFixed(1)} MB`
            : totalBytes > 0
              ? `${Math.round(totalBytes / 1024)} KB`
              : '—'
        const span = card.timeSpanMs
        const spanLabel =
          span == null
            ? 'sequence'
            : span < 60_000
              ? `${Math.max(1, Math.round(span / 1_000))} s`
              : `${(span / 60_000).toFixed(1)} min`
        return (
          <section className="sr-cp-inspector">
            <p className="eyebrow">Group Inspector</p>
            <h3 className="cp-photo-name">{card.title}</h3>
            <p className="cp-photo-date">
              {card.fileNameRange.first} → {card.fileNameRange.last}
            </p>
            <dl className="metadata-list" aria-label="Group metadata">
              <div>
                <dt>Kind</dt>
                <dd>{card.kind}</dd>
              </div>
              <div>
                <dt>Photos</dt>
                <dd>{card.photoIds.length}</dd>
              </div>
              <div>
                <dt>Time span</dt>
                <dd>{spanLabel}</dd>
              </div>
              <div>
                <dt>Captured</dt>
                <dd>
                  {card.capturedAt
                    ? new Date(card.capturedAt).toLocaleString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })
                    : '—'}
                </dd>
              </div>
              <div>
                <dt>Camera</dt>
                <dd>{firstPhoto?.cameraModel ?? firstPhoto?.cameraMake ?? '—'}</dd>
              </div>
              <div>
                <dt>Lens</dt>
                <dd>{firstPhoto?.lensModel ?? '—'}</dd>
              </div>
              <div>
                <dt>Total size</dt>
                <dd>{totalSize}</dd>
              </div>
              <div>
                <dt>Confidence</dt>
                <dd>{card.confidence.toFixed(2)}</dd>
              </div>
            </dl>
          </section>
        )
      })()
    : undefined

  return (
    <div
      className="app-shell"
      style={
        {
          '--left-rail-w': `${leftRailSize.width}px`,
          '--right-panel-w': `${rightPanelSize.width}px`,
        } as React.CSSProperties
      }
    >
      <TopBar
        searchQuery={view.searchQuery}
        onSearchChange={handleSearchChange}
        displayMode={view.displayMode}
        onDisplayModeChange={view.setDisplayMode}
        filterActive={filterActive}
        onToggleFilter={view.toggleFilterPanel}
        selectionMode={selection.selectionMode}
        onToggleSelectionMode={selection.toggleSelectionMode}
        similarReviewMode={isSimilarReviewSelected}
        windowMs={similarReviewWindowMs}
        onWindowChange={setSimilarReviewWindowMs}
      />
      <div
        className={`workspace-grid${leftCollapsed ? ' workspace-grid--left-collapsed' : ''}${
          rightCollapsed ? ' workspace-grid--right-collapsed' : ''
        }`}
      >
        <LeftRail
          librarySummary={library.summary}
          isScanning={library.isScanning}
          scanProgress={library.scanProgress}
          sourceFolders={library.sources}
          activeFilter={view.filter}
          onSelectAllPhotos={handleSelectAllPhotos}
          onSelectRecent={() => handleSelectFilter({ type: 'recent' })}
          onSelectFavorites={() => handleSelectFilter({ type: 'favorites' })}
          onSelectHidden={() => handleSelectFilter({ type: 'hidden' })}
          onSelectFolder={handleSelectFilter}
          onAddSource={handleAddFolder}
          onDeleteSource={(sourceId) => {
            if (
              view.filter?.type === 'folder' &&
              view.filter.sourceId === sourceId
            ) {
              view.setFilter(null)
              selection.setSelectedPhoto(null)
            }
            void library.removeSource(sourceId).then(() => view.bumpDataVersion())
          }}
          onSelectView={handleSelectComingSoonView}
          onSelectExplore={handleSelectExplore}
          onSelectSettings={handleSelectSettings}
          albums={albumsState.albums}
          onSelectAlbum={(id) => handleSelectFilter({ type: 'album', albumId: id })}
          onCreateAlbum={(name) => void albumsState.create(name)}
          onDeleteAlbum={handleDeleteAlbum}
          onRenameAlbum={(id, name) => void albumsState.rename(id, name)}
          tags={tagsState.tags}
          onSelectTag={handleSelectTag}
          collapsed={leftCollapsed}
          onToggleCollapse={() => setLeftCollapsed((v) => !v)}
        />
        {!leftCollapsed && (
          <div
            className="workspace-grid__resizer"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize left sidebar"
            onPointerDown={(e) => leftRailSize.onPointerDown(e, 1)}
            onDoubleClick={() => leftRailSize.setWidth(240)}
          />
        )}
        {isSimilarReviewSelected ? (
          <SimilarReviewView
            cards={similarReviewCards}
            photosById={similarReviewPhotosById}
            activeCardId={similarReviewActiveCard?.id ?? null}
            onSelectCard={(cardId) => {
              setSimilarReviewActiveCardId(cardId)
              selection.setSelectedPhoto(null)
            }}
            selectedPhotoId={selection.selectedPhoto?.id ?? null}
            onSelectPhoto={selection.setSelectedPhoto}
            selectionMode={selection.selectionMode}
            selectedIds={selection.selectedIds}
            onToggleSelectedId={selection.toggleSelected}
            onClearSelection={selection.clearSelected}
            onZoomPhotos={(photos, index) => setSimilarReviewViewerState({ photos, index })}
            embeddingStats={similarReviewEmbedStats}
            thresholdCosine={similarReviewThreshold}
            onThresholdChange={setSimilarReviewThreshold}
            onRunPhotoEmbed={handleRunPhotoEmbed}
            embeddingsLoaded={similarReviewEmbeddings.size > 0}
            embeddingsBusy={similarReviewEmbedBusy}
          />
        ) : isPeopleSelected ? (
          <PeopleView
            onSelectPerson={(personId, displayName) =>
              handleSelectFilter({ type: 'person', personId, displayName })
            }
          />
        ) : (
          <PhotoSurface
            filter={view.filter}
            title={photoViewTitle}
            displayMode={view.displayMode}
            dataVersion={view.dataVersion}
            selectedPhotoId={selection.selectedPhoto?.id ?? null}
            searchQuery={view.searchQuery}
            smartFilter={view.smartFilter}
            filterPanelOpen={view.filterPanelOpen}
            filterOptions={library.filterOptions}
            onSmartFilterChange={view.setSmartFilter}
            onCloseFilterPanel={() => view.setFilterPanelOpen(false)}
            onSelectPhoto={selection.setSelectedPhoto}
            albums={albumsState.albums}
            onBatchAddToAlbum={handleBatchAddToAlbum}
            onBatchRemoveFromAlbum={async (albumId, photoIds) => {
              await albumsState.removeBatch(albumId, photoIds)
              view.bumpDataVersion()
            }}
            selectionMode={selection.selectionMode}
            onToggleSelectionMode={selection.toggleSelectionMode}
            selectedIds={selection.selectedIds}
            onToggleSelectedId={selection.toggleSelected}
            onClearSelection={selection.clearSelected}
            onSetSelectedIds={selection.setSelectedIds}
            onBatchFavorite={handleBatchFavorite}
            onBatchHide={handleBatchHide}
            onBatchAddTags={handleBatchAddTags}
          />
        )}
        {!rightCollapsed && (
          <div
            className="workspace-grid__resizer"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize right panel"
            onPointerDown={(e) => rightPanelSize.onPointerDown(e, -1)}
            onDoubleClick={() => rightPanelSize.setWidth(280)}
          />
        )}
        <ContextPanel
          librarySummary={library.summary}
          selectedPhoto={selection.selectedPhoto}
          onToggleFavorite={handleToggleFavorite}
          onToggleHidden={handleToggleHidden}
          albums={albumsState.albums}
          currentAlbumId={view.filter?.type === 'album' ? view.filter.albumId : undefined}
          onAddToAlbum={handleAddToAlbum}
          onRemoveFromAlbum={handleRemoveFromAlbum}
          onSetPhotoTags={handleSetPhotoTags}
          onRevealInFinder={handleRevealInFinder}
          collapsed={rightCollapsed}
          onToggleCollapse={() => setRightCollapsed((v) => !v)}
          selectionMode={selection.selectionMode}
          selectedIds={selection.selectedIds}
          onBatchFavorite={handleBatchFavorite}
          onBatchHide={handleBatchHide}
          onBatchAddTags={handleBatchAddTags}
          onBatchAddToAlbum={handleBatchAddToAlbum}
          onBatchRemoveFromAlbum={async (albumId, photoIds) => {
            await albumsState.removeBatch(albumId, photoIds)
            view.bumpDataVersion()
          }}
          similarReviewMode={isSimilarReviewSelected}
          similarReviewInspector={similarReviewInspector}
        />
      </div>
      {similarReviewViewerState && (
        <PhotoViewer
          photos={similarReviewViewerState.photos}
          initialIndex={similarReviewViewerState.index}
          onClose={() => setSimilarReviewViewerState(null)}
        />
      )}
    </div>
  )
}
