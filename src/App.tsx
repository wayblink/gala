import { ContextPanel } from './components/ContextPanel'
import { FunctionDock } from './components/FunctionDock'
import { LeftRail } from './components/LeftRail'
import { PhotoSurface } from './components/PhotoSurface'
import { PhotoViewer } from './components/PhotoViewer'

import {
  analysisClusterFaces,
  analysisEmbedFaces,
  analysisRequest,
} from './desktop/capability'
import { downloadApplePhotosOriginal, downloadApplePhotosOriginals, getTimelinePhotos, materializeContentLabels } from './desktop/photos'
import { connectApplePhotos, getApplePhotosStatus, openSourceFolder, pickPhotoFolder, scanPhotoSource } from './desktop/library'
import {
  addTagsToPhotosBatch,
  revealInFinder,
  setPhotosFavoriteBatch,
  setPhotosHiddenBatch,
  togglePhotoFavorite,
  togglePhotoHidden,
} from './desktop/photos'
import { useAlbums } from './state/useAlbums'
import { useAppearance } from './state/useAppearance'
import { useLibrary } from './state/useLibrary'
import { I18nProvider, useLocaleState } from './state/useLocale'
import { useResizable } from './state/useResizable'
import { usePhotoQuality } from './state/usePhotoQuality'
import { useBackgroundTasks } from './state/useBackgroundTasks'
import { useSelection } from './state/useSelection'
import { useTags } from './state/useTags'
import { useViewFilter } from './state/useViewFilter'
import { useSimilarReviewWorkflow } from './features/similar-review/useSimilarReviewWorkflow'
import type { ComingSoonViewId, PhotoFilter } from './types/photos'
import { lazy, Suspense, useEffect, useState } from 'react'
import { getSourceCollections } from './desktop/photos'
import type { ApplePhotosStatus } from './types/library'
import type { SourceCollection } from './types/photos'
import type { TimelinePhoto } from './types/photos'
import { relinkPhotoSource } from './desktop/library'

const BackgroundTasksView = lazy(() => import('./components/BackgroundTasksView').then((module) => ({ default: module.BackgroundTasksView })))
const SimilarReviewView = lazy(() => import('./features/similar-review/SimilarReviewView').then((module) => ({ default: module.SimilarReviewView })))
const ContentRecognitionView = lazy(() => import('./features/explore/ContentRecognitionView').then((module) => ({ default: module.ContentRecognitionView })))
const LabelsView = lazy(() => import('./features/explore/LabelsView').then((module) => ({ default: module.LabelsView })))
const PeopleView = lazy(() => import('./features/people/PeopleView').then((module) => ({ default: module.PeopleView })))
const ReorganizeView = lazy(() => import('./features/reorganize/ReorganizeView').then((module) => ({ default: module.ReorganizeView })))
const SettingsView = lazy(() => import('./features/settings/SettingsView').then((module) => ({ default: module.SettingsView })))
const SourcesView = lazy(() => import('./features/sources/SourcesView').then((module) => ({ default: module.SourcesView })))

export default function App() {
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null)
  const [hoveredPhoto, setHoveredPhoto] = useState<TimelinePhoto | null>(null)
  const [applePhotosOriginalPaths, setApplePhotosOriginalPaths] = useState<Record<string, string>>({})
  const [activeSourceActionId, setActiveSourceActionId] = useState<string | null>(null)
  const [sourceFeedbackMessage, setSourceFeedbackMessage] = useState<string | null>(null)
  const [applePhotosStatus, setApplePhotosStatus] = useState<ApplePhotosStatus | null>(null)
  const [applePhotosBusy, setApplePhotosBusy] = useState(false)
  const [applePhotosCollections, setApplePhotosCollections] = useState<SourceCollection[]>([])

  useEffect(() => {
    void getApplePhotosStatus().then(async (status) => {
      setApplePhotosStatus(status)
      if (status.sourceId) setApplePhotosCollections(await getSourceCollections(status.sourceId))
    }).catch((error) => {
      console.error('Apple Photos status error:', error)
    })
  }, [])

  const appearance = useAppearance()
  const photoQuality = usePhotoQuality()
  const locale = useLocaleState()
  const { t } = locale
  const library = useLibrary()
  const backgroundTasks = useBackgroundTasks()
  const albumsState = useAlbums()
  const tagsState = useTags()
  const selection = useSelection()
  useEffect(() => {
    if (!selection.selectionMode) {
      setHoveredPhoto(null)
    }
  }, [selection.selectionMode])
  const view = useViewFilter()
  const leftRailSize = useResizable({ storageKey: 'gala:leftRailW', initial: 240, min: 200, max: 480 })
  const rightPanelSize = useResizable({ storageKey: 'gala:rightPanelW', initial: 280, min: 220, max: 520 })
  const isSimilarReviewSelected = view.filter?.type === 'view' && view.filter.viewId === 'similar'
  const similarReview = useSimilarReviewWorkflow({
    selected: isSimilarReviewSelected,
    runBackgroundTask: backgroundTasks.runBackgroundTask,
    onDecisionsApplied: async () => {
      await library.refreshSummary()
      selection.setSelectedPhoto(null)
      selection.clearSelected()
      view.bumpDataVersion()
    },
  })

  const handleAddFolder = async (stayOnSources = false) => {
    setSourceFeedbackMessage(null)
    const path = await pickPhotoFolder()
    if (!path) {
      if (stayOnSources) {
        setSourceFeedbackMessage(t('sources.action.cancelled'))
      }
      return
    }

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
        view.setFilter(stayOnSources || view.filter?.type === 'sources' ? { type: 'sources' } : null)
        selection.setSelectedPhoto(null)
        setSourceFeedbackMessage(t('sources.action.rescanSuccess'))
        view.bumpDataVersion()
      }
    } catch (error) {
      console.error('Scan error:', error)
    } finally {
      library.setIsScanning(false)
    }
  }

  const handleSelectAllPhotos = () => {
    setEditingSourceId(null)
    view.setFilter(null)
    selection.setSelectedPhoto(null)
  }

  const handleSelectFilter = (next: PhotoFilter) => {
    if (next.type !== 'sources') {
      setEditingSourceId(null)
    }
    view.setFilter(next)
    selection.setSelectedPhoto(null)
  }

  const handleSelectComingSoonView = (viewId: ComingSoonViewId) => {
    handleSelectFilter({ type: 'view', viewId })
    if (viewId === 'similar') {
      void similarReview.refresh()
    }
  }

  const handleRunPeoplePipeline = async () => {
    await backgroundTasks.runBackgroundTask(
      {
        kind: 'people',
        title: 'Scan People pipeline',
        description: 'Detect faces, embed them, then cluster people',
        operationPayload: { pipeline: ['face.detect', 'face.embed', 'face.cluster'], scopeKind: 'all' },
      },
      async (update) => {
        update({ progressLabel: '1/3 Detecting faces…' })
        const detected = await analysisRequest({
          capability: 'face.detect',
          scope_kind: 'all',
          priority: 0,
          force: false,
        })
        update({
          progressLabel: '2/3 Embedding faces…',
          detail: `${detected.photos_done} photos detected · ${detected.photos_failed} failed`,
        })
        const embedded = await analysisEmbedFaces()
        update({
          progressLabel: '3/3 Clustering people…',
          detail: `${embedded.faces_embedded} faces embedded · ${embedded.faces_failed} failed`,
        })
        const clustered = await analysisClusterFaces()
        const result = `${clustered.persons_created} new persons · ${clustered.persons_existing} reused`
        update({ result })
        return result
      },
    )
  }

  const handleRunContentRecognition = async () => {
    await backgroundTasks.runBackgroundTask(
      {
        kind: 'content',
        title: 'Scan Content Recognition',
        description: 'Classify photos into subject labels for Explore',
        operationPayload: {
          capability: 'content.classify',
          provider: 'macos.vision.classify.v1',
          scopeKind: 'all',
          config: { maxLabels: 8, minConfidence: 0.2, materializeConfidence: 0.35 },
        },
      },
      async (update) => {
        update({ progressLabel: 'Classifying photos…', detail: 'Running on-device Vision image classification' })
        const classified = await analysisRequest({
          capability: 'content.classify',
          scope_kind: 'all',
          priority: 0,
          force: false,
          config: { maxLabels: 8, minConfidence: 0.2 },
        })
        update({
          progressLabel: 'Writing subject labels…',
          detail: `${classified.photos_done} classified · ${classified.photos_failed} failed · ${classified.photos_skipped} skipped`,
        })
        const materialized = await materializeContentLabels(0.35)
        const result = `${materialized.labelsWritten} labels across ${materialized.photosProcessed} photos`
        update({ result })
        return result
      },
    )
  }

  const handleRunPhotoQuality = async () => {
    if (!photoQuality.enabled) return
    await backgroundTasks.runBackgroundTask(
      {
        kind: 'quality',
        title: 'Scan Photo Quality',
        description: 'Score every photo for visual review and sorting',
        operationPayload: { capability: 'photo.quality', scopeKind: 'all' },
      },
      async (update) => {
        update({ progressLabel: 'Scoring photo quality…', detail: 'Reading dimensions and source metadata' })
        const scored = await analysisRequest({
          capability: 'photo.quality',
          scope_kind: 'all',
          priority: 0,
          force: false,
        })
        const result = `${scored.photos_done} scored · ${scored.photos_failed} failed · ${scored.photos_skipped} skipped`
        update({ result })
        view.bumpDataVersion()
        return result
      },
    )
  }

  const handleSelectExplore = () => handleSelectFilter({ type: 'explore' })
  const handleSelectSources = () => {
    setEditingSourceId(null)
    handleSelectFilter({ type: 'sources' })
  }
  const handleConnectApplePhotos = async () => {
    setApplePhotosBusy(true)
    setSourceFeedbackMessage(null)
    try {
      const status = await connectApplePhotos()
      setApplePhotosStatus(status)
      if (status.sourceId) setApplePhotosCollections(await getSourceCollections(status.sourceId))
      await library.refreshAll()
      selection.setSelectedPhoto(null)
      if (status.sourceId) {
        view.setFilter({ type: 'folder', sourceId: status.sourceId, folderPath: '' })
      } else {
        view.setFilter({ type: 'sources' })
      }
      view.bumpDataVersion()
      setSourceFeedbackMessage(status.message)
    } catch (error) {
      setSourceFeedbackMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setApplePhotosBusy(false)
    }
  }

  const handleOpenAddSourceFlow = () => {
    setEditingSourceId(null)
    view.setFilter({ type: 'sources' })
    selection.setSelectedPhoto(null)
  }

  const handleAddFolderSource = async () => {
    await handleAddFolder(true)
  }
  const handleSelectSettings = () => handleSelectFilter({ type: 'settings' })
  const handleSelectTasks = () => handleSelectFilter({ type: 'tasks' })

  const handleStartEditingSource = (sourceId: string) => {
    setSourceFeedbackMessage(null)
    setEditingSourceId(sourceId)
    view.setFilter({ type: 'sources' })
    selection.setSelectedPhoto(null)
  }

  const handleRenameSource = async (sourceId: string, nextName: string) => {
    const source = library.summary.sources.find((item) => item.id === sourceId)
    const trimmedName = nextName.trim()
    if (!source || !trimmedName || trimmedName === source.name) {
      return
    }
    setActiveSourceActionId(sourceId)
    try {
      await library.renameSource(sourceId, trimmedName)
      setEditingSourceId(null)
      setSourceFeedbackMessage(t('sources.action.renameSuccess'))
      view.bumpDataVersion()
    } catch (error) {
      setSourceFeedbackMessage(t('sources.action.renameFailed', { error: error instanceof Error ? error.message : String(error) }))
    } finally {
      setActiveSourceActionId(null)
    }
  }

  const handleRescanSource = async (sourceId: string) => {
    const source = library.summary.sources.find((item) => item.id === sourceId)
    if (!source) {
      return
    }
    if (source.sourceKind === 'apple_photos') {
      await handleConnectApplePhotos()
      await library.refreshAll()
      view.bumpDataVersion()
      return
    }
    if (source.status !== 'online') {
      setSourceFeedbackMessage(source.status === 'offline' ? t('sources.sourceOffline') : t('sources.sourceUnavailable'))
      return
    }
    setSourceFeedbackMessage(null)
    setActiveSourceActionId(sourceId)
    library.setIsScanning(true)
    library.setScanProgress({
      status: 'scanning',
      rootPath: source.rootPath,
      sourceId: source.id,
      discoveredCount: 0,
      indexedCount: 0,
      thumbnailReadyCount: 0,
      thumbnailFailedCount: 0,
      skippedCount: 0,
      currentFile: null,
      errorMessage: null,
    })

    try {
      const result = await scanPhotoSource(source.rootPath)
      if (!result) throw new Error('Rescan command returned no result')
      await library.refreshAll()
      setSourceFeedbackMessage(t('sources.action.rescanSuccess'))
      view.bumpDataVersion()
    } catch (error) {
      console.error('Rescan error:', error)
      setSourceFeedbackMessage(t('sources.action.rescanFailed', { error: error instanceof Error ? error.message : String(error) }))
    } finally {
      setActiveSourceActionId(null)
      library.setIsScanning(false)
    }
  }

  const handleRelinkSource = async (sourceId: string) => {
    const source = library.summary.sources.find((item) => item.id === sourceId)
    if (!source) {
      return
    }
    setSourceFeedbackMessage(null)
    const path = await pickPhotoFolder()
    if (!path) {
      setSourceFeedbackMessage(t('sources.action.cancelled'))
      return
    }

    setActiveSourceActionId(sourceId)
    library.setIsScanning(true)
    library.setScanProgress({
      status: 'scanning',
      rootPath: path,
      sourceId: source.id,
      discoveredCount: 0,
      indexedCount: 0,
      thumbnailReadyCount: 0,
      thumbnailFailedCount: 0,
      skippedCount: 0,
      currentFile: null,
      errorMessage: null,
    })

    try {
      const result = await relinkPhotoSource(source.id, path)
      if (!result) throw new Error('Relink command returned no result')
      await library.refreshAll()
      setSourceFeedbackMessage(t('sources.action.relinkSuccess'))
      view.bumpDataVersion()
    } catch (error) {
      console.error('Relink error:', error)
      setSourceFeedbackMessage(t('sources.action.relinkFailed', { error: error instanceof Error ? error.message : String(error) }))
    } finally {
      setActiveSourceActionId(null)
      library.setIsScanning(false)
    }
  }

  const handleDeleteSource = async (sourceId: string, sourceName?: string) => {
    const source = library.summary.sources.find((item) => item.id === sourceId)
    const displayName = sourceName ?? source?.name
    if (!source || !displayName) {
      setSourceFeedbackMessage(t('sources.action.deleteFailed', { error: 'Source not found' }))
      return
    }
    const confirmKey = source.sourceKind === 'apple_photos'
      ? 'sources.disconnectConfirm'
      : 'sources.deleteConfirm'
    if (!window.confirm(t(confirmKey, { name: displayName }))) return

    setSourceFeedbackMessage(null)
    setActiveSourceActionId(sourceId)
    try {
      await library.removeSource(sourceId)
      setEditingSourceId((current) => current === sourceId ? null : current)
      selection.setSelectedPhoto(null)
      if (view.filter?.type === 'folder' && view.filter.sourceId === sourceId) {
        view.setFilter(null)
      }
      setSourceFeedbackMessage(t(source.sourceKind === 'apple_photos'
        ? 'sources.action.disconnectSuccess'
        : 'sources.action.deleteSuccess'))
      view.bumpDataVersion()
    } catch (error) {
      setSourceFeedbackMessage(t('sources.action.deleteFailed', { error: error instanceof Error ? error.message : String(error) }))
    } finally {
      setActiveSourceActionId(null)
    }
  }

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
      ? t('nav.recentlyAdded')
      : view.filter?.type === 'favorites'
        ? t('nav.favorites')
        : view.filter?.type === 'hidden'
          ? t('nav.hidden')
          : view.filter?.type === 'source-favorites'
            ? `${view.filter.sourceName} · ${t('nav.favorites')}`
            : view.filter?.type === 'source-collection'
            ? `${view.filter.collectionName} · Apple Photos`
          : view.filter?.type === 'album'
            ? (albumsState.albums.find((a) => view.filter?.type === 'album' && a.id === view.filter.albumId)?.name ?? 'Album')
            : view.filter?.type === 'tag'
              ? `Tag: ${view.filter.tagName}`
              : view.filter?.type === 'label'
                ? `${view.filter.labelKind}: ${view.filter.labelName}`
              : view.filter?.type === 'person'
                ? (view.filter.displayName ?? `Person · ${view.filter.personId.slice(0, 6)}`)
                : view.filter?.type === 'sources'
                  ? t('sources.title')
                : view.filter?.type === 'view'
                ? view.filter.viewId.charAt(0).toUpperCase() + view.filter.viewId.slice(1)
                : view.filter?.type === 'explore'
                  ? t('nav.explore')
                  : view.filter?.type === 'settings'
                    ? t('nav.settings')
                    : activeFolder?.folderPath
                      ? activeFolder.folderPath
                      : (activeSource?.name ?? t('nav.allPhotos'))

  const filterActive = Object.keys(view.smartFilter).some(
    (k) => (view.smartFilter as Record<string, unknown>)[k] !== undefined,
  )
  const isPeopleSelected = view.filter?.type === 'view' && view.filter.viewId === 'people'
  const isReorganizeSelected = view.filter?.type === 'view' && view.filter.viewId === 'reorganize'
  const isContentRecognitionSelected = view.filter?.type === 'view' && view.filter.viewId === 'content'
  const isExploreLabelsSelected = view.filter?.type === 'explore'
  const isSourcesSelected = view.filter?.type === 'sources'
  const isTasksSelected = view.filter?.type === 'tasks'
  const isSettingsSelected = view.filter?.type === 'settings'
  const rightPanelVisible = !(
    isPeopleSelected ||
    isContentRecognitionSelected ||
    isReorganizeSelected ||
    isExploreLabelsSelected ||
    isSourcesSelected ||
    isTasksSelected ||
    isSettingsSelected
  )
  const rightPanelCollapsed = rightPanelVisible && rightCollapsed
  const contextPhoto = selection.selectionMode ? hoveredPhoto ?? selection.selectedPhoto : selection.selectedPhoto
  return (
    <I18nProvider value={locale}>
    <div
      className="app-shell"
      style={
        {
          '--left-rail-w': `${leftRailSize.width}px`,
          '--right-panel-w': `${rightPanelSize.width}px`,
        } as React.CSSProperties
      }
    >
      <div
        className={`workspace-grid${leftCollapsed ? ' workspace-grid--left-collapsed' : ''}${
          rightPanelVisible ? '' : ' workspace-grid--right-hidden'
        }${rightPanelCollapsed ? ' workspace-grid--right-collapsed' : ''}`}
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
          onSelectSourceFavorites={(sourceId, sourceName) => handleSelectFilter({ type: 'source-favorites', sourceId, sourceName })}
          sourceCollections={applePhotosCollections}
          onSelectSourceCollection={(collection) => handleSelectFilter({ type: 'source-collection', sourceId: collection.sourceId, collectionId: collection.id, collectionName: collection.name })}
          onSelectFolder={handleSelectFilter}
          onSelectSources={handleSelectSources}
          onAddSource={handleOpenAddSourceFlow}
          onRenameSource={(sourceId) => {
            handleStartEditingSource(sourceId)
          }}
          onDeleteSource={(sourceId) => {
            void handleDeleteSource(sourceId)
          }}
          onSelectView={handleSelectComingSoonView}
          onSelectExplore={handleSelectExplore}
          onSelectSettings={handleSelectSettings}
          onSelectTasks={handleSelectTasks}
          activeTaskCount={backgroundTasks.summary.active}
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
            tabIndex={0}
            aria-orientation="vertical"
            aria-label="Resize left sidebar"
            aria-valuemin={leftRailSize.min}
            aria-valuemax={leftRailSize.max}
            aria-valuenow={leftRailSize.width}
            aria-valuetext={`${leftRailSize.width} pixels`}
            onPointerDown={(e) => leftRailSize.onPointerDown(e, 1)}
            onKeyDown={leftRailSize.onKeyDown}
            onDoubleClick={() => leftRailSize.setWidth(240)}
          />
        )}
        <Suspense fallback={<main className="workspace-view-loading" role="status">Loading view…</main>}>
        {isSimilarReviewSelected ? (
          <SimilarReviewView
            cards={similarReview.cards}
            photosById={similarReview.photosById}
            activeCardId={similarReview.activeCard?.id ?? null}
            onSelectCard={(cardId) => {
              similarReview.setActiveCardId(cardId)
              selection.setSelectedPhoto(null)
            }}
            selectedPhotoId={selection.selectedPhoto?.id ?? null}
            onSelectPhoto={selection.setSelectedPhoto}
            selectionMode={selection.selectionMode}
            selectedIds={selection.selectedIds}
            onToggleSelectedId={selection.toggleSelected}
            onClearSelection={selection.clearSelected}
            onZoomPhotos={(photos, index) => similarReview.setViewerState({ photos, index })}
            embeddingStats={similarReview.embeddingStats}
            thresholdCosine={similarReview.thresholdCosine}
            onThresholdChange={similarReview.setThresholdCosine}
            onRunPhotoEmbed={similarReview.runPhotoEmbeddingScan}
            embeddingsLoaded={similarReview.embeddingsLoaded}
            embeddingsBusy={similarReview.embeddingsBusy}
            onApplyDecisions={similarReview.applyDecisions}
            decisionsBusy={similarReview.decisionsBusy}
            showQuality={photoQuality.enabled}
          />
        ) : isPeopleSelected ? (
          <PeopleView
            runBackgroundTask={backgroundTasks.runBackgroundTask}
            sources={library.summary.sources}
            onSelectPerson={(personId, displayName) =>
              handleSelectFilter({ type: 'person', personId, displayName })
            }
          />
        ) : isContentRecognitionSelected ? (
          <ContentRecognitionView
            runBackgroundTask={backgroundTasks.runBackgroundTask}
            sources={library.summary.sources}
            onSelectLabel={(label) =>
              handleSelectFilter({
                type: 'label',
                labelId: label.id,
                labelName: label.name,
                labelKind: label.kind,
              })
            }
          />
        ) : isReorganizeSelected ? (
          <ReorganizeView
            onPickTargetRoot={pickPhotoFolder}
            sources={library.summary.sources}
            runBackgroundTask={backgroundTasks.runBackgroundTask}
            onExecuted={async () => {
              await library.refreshAll()
              view.bumpDataVersion()
            }}
          />
        ) : isExploreLabelsSelected ? (
          <LabelsView
            onSelectLabel={(label) =>
              handleSelectFilter({
                type: 'label',
                labelId: label.id,
                labelName: label.name,
                labelKind: label.kind,
              })
            }
          />
        ) : isSourcesSelected ? (
          <SourcesView
            sources={library.summary.sources}
            editingSourceId={editingSourceId}
            scanProgress={library.scanProgress}
            isScanning={library.isScanning}
            activeSourceActionId={activeSourceActionId}
            feedbackMessage={sourceFeedbackMessage}
            onAddFolderSource={() => {
              void handleAddFolderSource()
            }}
            onStartEditingSource={handleStartEditingSource}
            onCancelEditingSource={() => setEditingSourceId(null)}
            onRenameSource={(sourceId, newName) => {
              void handleRenameSource(sourceId, newName)
            }}
            onRelinkSource={(sourceId) => handleRelinkSource(sourceId)}
            onRescanSource={(sourceId) => handleRescanSource(sourceId)}
            onDeleteSource={(sourceId, sourceName) => {
              void handleDeleteSource(sourceId, sourceName)
            }}
            onOpenSourceFolder={openSourceFolder}
            onSelectSource={(sourceId) => {
              setEditingSourceId(null)
              selection.setSelectedPhoto(null)
              view.setFilter({ type: 'folder', sourceId, folderPath: '' })
            }}
            applePhotosStatus={applePhotosStatus}
            applePhotosBusy={applePhotosBusy}
            onConnectApplePhotos={handleConnectApplePhotos}
          />
        ) : isTasksSelected ? (
          <BackgroundTasksView
            tasks={backgroundTasks.tasks}
            onClearCompleted={backgroundTasks.clearCompleted}
            onRunQualityScan={() => void handleRunPhotoQuality()}
            photoQualityEnabled={photoQuality.enabled}
            onRunSimilarScan={() => void similarReview.runPhotoEmbeddingScan()}
            onRunPeopleScan={() => void handleRunPeoplePipeline()}
            onRunContentScan={() => void handleRunContentRecognition()}
          />
        ) : isSettingsSelected ? (
          <SettingsView
            themes={appearance.themes}
            activeThemeId={appearance.themeId}
            onThemeChange={appearance.setThemeId}
            languages={locale.languages}
            activeLanguageId={locale.languageId}
            onLanguageChange={locale.setLanguageId}
            photoQualityEnabled={photoQuality.enabled}
            onPhotoQualityChange={photoQuality.setEnabled}
          />
        ) : (
          <PhotoSurface
            filter={view.filter}
            title={photoViewTitle}
            displayMode={view.displayMode}
            onDisplayModeChange={view.setDisplayMode}
            dataVersion={view.dataVersion}
            selectedPhotoId={selection.selectedPhoto?.id ?? null}
            searchQuery={view.searchQuery}
            smartFilter={view.smartFilter}
            filterPanelOpen={view.filterPanelOpen}
            filterOptions={library.filterOptions}
            onSmartFilterChange={view.setSmartFilter}
            onCloseFilterPanel={() => view.setFilterPanelOpen(false)}
            onSelectPhoto={selection.setSelectedPhoto}
            onHoverPhoto={setHoveredPhoto}
            selectionMode={selection.selectionMode}
            onToggleSelectionMode={selection.toggleSelectionMode}
            selectedIds={selection.selectedIds}
            selectionScope={selection.selectionScope}
            onToggleSelectedId={selection.toggleSelected}
            onClearSelection={selection.clearSelected}
            onSetSelectedIds={selection.setSelectedIds}
            showQuality={photoQuality.enabled}
            originalPaths={applePhotosOriginalPaths}
            onOriginalPathsLoaded={(paths) => {
              setApplePhotosOriginalPaths((current) => ({ ...current, ...paths }))
            }}
          />
        )}
        </Suspense>
        {rightPanelVisible && !rightCollapsed && (
          <div
            className="workspace-grid__resizer"
            role="separator"
            tabIndex={0}
            aria-orientation="vertical"
            aria-label="Resize right panel"
            aria-valuemin={rightPanelSize.min}
            aria-valuemax={rightPanelSize.max}
            aria-valuenow={rightPanelSize.width}
            aria-valuetext={`${rightPanelSize.width} pixels`}
            onPointerDown={(e) => rightPanelSize.onPointerDown(e, -1)}
            onKeyDown={rightPanelSize.onKeyDown}
            onDoubleClick={() => rightPanelSize.setWidth(280)}
          />
        )}
        {rightPanelVisible && (
        <ContextPanel
          librarySummary={library.summary}
          selectedPhoto={contextPhoto}
          activeSource={activeSource}
          editingSourceId={editingSourceId}
          activeSourceActionId={activeSourceActionId}
          isScanningSource={library.isScanning && library.scanProgress?.sourceId === activeSource?.id}
          onToggleFavorite={handleToggleFavorite}
          onToggleHidden={handleToggleHidden}
          albums={albumsState.albums}
          currentAlbumId={view.filter?.type === 'album' ? view.filter.albumId : undefined}
          onAddToAlbum={handleAddToAlbum}
          onRemoveFromAlbum={handleRemoveFromAlbum}
          onCreateAlbum={albumsState.create}
          onSetPhotoTags={handleSetPhotoTags}
          onRevealInFinder={handleRevealInFinder}
          onLoadApplePhotosOriginal={async (photoId) => {
            const path = await downloadApplePhotosOriginal(photoId)
            if (path) setApplePhotosOriginalPaths((current) => ({ ...current, [photoId]: path }))
            return path
          }}
          onLoadApplePhotosOriginals={async (photoIds) => {
            const result = await downloadApplePhotosOriginals(photoIds)
            if (result.paths.length > 0) {
              setApplePhotosOriginalPaths((current) => ({
                ...current,
                ...Object.fromEntries(result.paths.map(({ photoId, path }) => [photoId, path])),
              }))
            }
            return result
          }}
          selectedIds={selection.selectedIds}
          selectionScope={selection.selectionScope}
          onBatchFavorite={handleBatchFavorite}
          onBatchHide={handleBatchHide}
          onBatchAddTags={handleBatchAddTags}
          onBatchAddToAlbum={handleBatchAddToAlbum}
          onBatchRemoveFromAlbum={async (albumId, photoIds) => {
            await albumsState.removeBatch(albumId, photoIds)
            view.bumpDataVersion()
          }}
          onStartEditingSource={handleStartEditingSource}
          onCancelEditingSource={() => setEditingSourceId(null)}
          onRenameSource={(sourceId, newName) => {
            void handleRenameSource(sourceId, newName)
          }}
          onRelinkSource={(sourceId) => handleRelinkSource(sourceId)}
          onRescanSource={(sourceId) => handleRescanSource(sourceId)}
          onDeleteSource={(sourceId, sourceName) => {
            void handleDeleteSource(sourceId, sourceName)
          }}
          collapsed={rightCollapsed}
          onToggleCollapse={() => setRightCollapsed((v) => !v)}
          similarReviewMode={isSimilarReviewSelected}
          showQuality={photoQuality.enabled}
          searchQuery={view.searchQuery}
          onSearchChange={handleSearchChange}
          filterActive={filterActive}
          onToggleFilter={view.toggleFilterPanel}
          similarReviewInspector={similarReview.inspector}
        />
        )}
      </div>
      <FunctionDock>
        {isSimilarReviewSelected ? (
          <div className="function-dock__slider">
            <span className="function-dock__label">分组窗口</span>
            <input
              type="range"
              min={1000}
              max={300000}
              step={1000}
              value={Math.max(1000, Math.min(300000, similarReview.windowMs))}
              onChange={(event) => similarReview.setWindowMs(Number.parseInt(event.target.value, 10))}
              aria-label="Group window"
            />
            <span className="function-dock__value">
              {similarReview.windowMs < 60000
                ? `${Math.round(similarReview.windowMs / 1000)}s`
                : `${Math.round(similarReview.windowMs / 60000)}min`}
            </span>
          </div>
        ) : null}
      </FunctionDock>
      {similarReview.viewerState && (
        <PhotoViewer
          photos={similarReview.viewerState.photos}
          initialIndex={similarReview.viewerState.index}
          onClose={() => similarReview.setViewerState(null)}
        />
      )}
    </div>
    </I18nProvider>
  )
}
