import { BackgroundTasksView } from './components/BackgroundTasksView'
import { ContextPanel } from './components/ContextPanel'
import { LeftRail } from './components/LeftRail'
import { PhotoSurface } from './components/PhotoSurface'
import { PhotoViewer } from './components/PhotoViewer'
import { TopBar } from './components/TopBar'
import { SimilarReviewView } from './features/similar-review/SimilarReviewView'
import { ContentRecognitionView } from './features/explore/ContentRecognitionView'
import { LabelsView } from './features/explore/LabelsView'
import { PeopleView } from './features/people/PeopleView'
import { ReorganizeView } from './features/reorganize/ReorganizeView'
import { SettingsView } from './features/settings/SettingsView'
import { SourcesView } from './features/sources/SourcesView'
import {
  analysisClusterFaces,
  analysisEmbedFaces,
  analysisRequest,
} from './desktop/capability'
import { getTimelinePhotos, materializeContentLabels } from './desktop/photos'
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
import { useAppearance } from './state/useAppearance'
import { useLibrary } from './state/useLibrary'
import { I18nProvider, useLocaleState } from './state/useLocale'
import { useResizable } from './state/useResizable'
import { useBackgroundTasks } from './state/useBackgroundTasks'
import { useSelection } from './state/useSelection'
import { useTags } from './state/useTags'
import { useViewFilter } from './state/useViewFilter'
import { useSimilarReviewWorkflow } from './features/similar-review/useSimilarReviewWorkflow'
import type { ComingSoonViewId, PhotoFilter } from './types/photos'
import { useState } from 'react'
import { relinkPhotoSource } from './desktop/library'

export default function App() {
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null)
  const [activeSourceActionId, setActiveSourceActionId] = useState<string | null>(null)
  const [sourceFeedbackMessage, setSourceFeedbackMessage] = useState<string | null>(null)

  const appearance = useAppearance()
  const locale = useLocaleState()
  const { t } = locale
  const library = useLibrary()
  const backgroundTasks = useBackgroundTasks()
  const albumsState = useAlbums()
  const tagsState = useTags()
  const selection = useSelection()
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
  const handleStartAddSourceFlow = async () => {
    setEditingSourceId(null)
    view.setFilter({ type: 'sources' })
    selection.setSelectedPhoto(null)
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
    await library.renameSource(sourceId, trimmedName)
    setEditingSourceId(null)
    setActiveSourceActionId(null)
    setSourceFeedbackMessage(t('sources.action.renameSuccess'))
    view.bumpDataVersion()
  }

  const handleRescanSource = async (sourceId: string) => {
    const source = library.summary.sources.find((item) => item.id === sourceId)
    if (!source) {
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
      if (result) {
        await library.refreshAll()
        setSourceFeedbackMessage(t('sources.action.rescanSuccess'))
        view.bumpDataVersion()
      }
    } catch (error) {
      console.error('Rescan error:', error)
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
      if (result) {
        await library.refreshAll()
        setSourceFeedbackMessage(t('sources.action.relinkSuccess'))
        view.bumpDataVersion()
      }
    } catch (error) {
      console.error('Relink error:', error)
    } finally {
      setActiveSourceActionId(null)
      library.setIsScanning(false)
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
        windowMs={similarReview.windowMs}
        onWindowChange={similarReview.setWindowMs}
      />
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
          onSelectFolder={handleSelectFilter}
          onSelectSources={handleSelectSources}
          onAddSource={() => {
            void handleStartAddSourceFlow()
          }}
          onRenameSource={(sourceId) => {
            handleStartEditingSource(sourceId)
          }}
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
            aria-orientation="vertical"
            aria-label="Resize left sidebar"
            onPointerDown={(e) => leftRailSize.onPointerDown(e, 1)}
            onDoubleClick={() => leftRailSize.setWidth(240)}
          />
        )}
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
            onAddSource={() => {
              void handleStartAddSourceFlow()
            }}
            onStartEditingSource={handleStartEditingSource}
            onCancelEditingSource={() => setEditingSourceId(null)}
            onRenameSource={(sourceId, newName) => {
              void handleRenameSource(sourceId, newName)
            }}
            onRelinkSource={(sourceId) => handleRelinkSource(sourceId)}
            onRescanSource={(sourceId) => handleRescanSource(sourceId)}
            onDeleteSource={(sourceId, sourceName) => {
              if (window.confirm(t('sources.deleteConfirm', { name: sourceName }))) {
                setSourceFeedbackMessage(null)
                setActiveSourceActionId(sourceId)
                void library.removeSource(sourceId).then(() => {
                  setActiveSourceActionId(null)
                  setSourceFeedbackMessage(t('sources.action.deleteSuccess'))
                  view.bumpDataVersion()
                })
              }
            }}
          />
        ) : isTasksSelected ? (
          <BackgroundTasksView
            tasks={backgroundTasks.tasks}
            onClearCompleted={backgroundTasks.clearCompleted}
            onRunQualityScan={() => void handleRunPhotoQuality()}
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
        {rightPanelVisible && !rightCollapsed && (
          <div
            className="workspace-grid__resizer"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize right panel"
            onPointerDown={(e) => rightPanelSize.onPointerDown(e, -1)}
            onDoubleClick={() => rightPanelSize.setWidth(280)}
          />
        )}
        {rightPanelVisible && (
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
          similarReviewInspector={similarReview.inspector}
        />
        )}
      </div>
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
