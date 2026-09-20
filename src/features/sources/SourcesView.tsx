import { Fragment, useEffect, useState } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { useI18n } from '../../state/useLocale'
import { isTauriAvailable } from '../../desktop/tauri'
import { CloseIcon, DeleteIcon, EditIcon, FolderIcon, RelinkIcon, RescanIcon } from './SourceIcons'
import type { ApplePhotosStatus, LibrarySource, ScanProgress } from '../../types/library'

type SourcesViewProps = {
  sources: LibrarySource[]
  editingSourceId?: string | null
  scanProgress?: ScanProgress | null
  isScanning?: boolean
  activeSourceActionId?: string | null
  feedbackMessage?: string | null
  onAddFolderSource?: () => void
  onAddSource?: () => void
  onStartEditingSource: (sourceId: string) => void
  onCancelEditingSource: () => void
  onRenameSource: (sourceId: string, newName: string) => Promise<void> | void
  onRelinkSource: (sourceId: string) => Promise<void> | void
  onRescanSource: (sourceId: string) => Promise<void> | void
  onDeleteSource: (sourceId: string, sourceName: string) => void
  onOpenSourceFolder: (rootPath: string) => Promise<void> | void
  onSelectSource?: (sourceId: string) => void
  applePhotosStatus?: ApplePhotosStatus | null
  applePhotosBusy?: boolean
  onConnectApplePhotos?: () => Promise<void> | void
}

const processedCount = (scanProgress: ScanProgress | null | undefined) =>
  (scanProgress?.thumbnailReadyCount ?? 0) + (scanProgress?.thumbnailFailedCount ?? 0)

const sourcePreviewUrl = (path: string) => isTauriAvailable()
  ? convertFileSrc(path)
  : `/@fs${path}`

export function SourcesView({
  sources,
  editingSourceId = null,
  scanProgress = null,
  isScanning = false,
  activeSourceActionId = null,
  feedbackMessage = null,
  onAddFolderSource,
  onAddSource,
  onStartEditingSource,
  onCancelEditingSource,
  onRenameSource,
  onRelinkSource,
  onRescanSource,
  onDeleteSource,
  onOpenSourceFolder,
  onSelectSource,
  applePhotosStatus = null,
  applePhotosBusy = false,
  onConnectApplePhotos,
}: SourcesViewProps) {
  const { t } = useI18n()
  const [draftName, setDraftName] = useState('')
  const [locationSourceId, setLocationSourceId] = useState<string | null>(null)
  const [addSourceOpen, setAddSourceOpen] = useState(false)
  const activeScanSourceId = scanProgress?.sourceId ?? null
  const activeScanSource = activeScanSourceId ? sources.find((source) => source.id === activeScanSourceId) : null
  const totalDiscovered = scanProgress?.discoveredCount ?? 0
  const scanLabel = scanProgress ? t(`sources.scanStep.${scanProgress.status}`) : null
  const sourceActionsBusy = activeSourceActionId !== null || isScanning
  const applePhotosSources = sources.filter((source) => source.sourceKind === 'apple_photos')
  const applePhotosConnected = applePhotosSources.length > 0
  const localFolderSources = sources.filter((source) => source.sourceKind !== 'apple_photos')

  useEffect(() => {
    if (!editingSourceId) {
      setDraftName('')
      return
    }

    const source = sources.find((item) => item.id === editingSourceId)
    setDraftName(source?.name ?? '')
  }, [editingSourceId, sources])

  return (
    <main className="sources-view" aria-label={t('sources.title')} aria-busy={sourceActionsBusy}>
      <header className="sources-view__header">
        <div>
          <h1>{t('sources.title')}</h1>
        </div>
        <div className="sources-view__header-actions">
          <button className="sources-view__add" type="button" disabled={sourceActionsBusy} onClick={() => setAddSourceOpen(true)}>
            + {t('sources.add')}
          </button>
        </div>
      </header>

      {addSourceOpen ? (
        <div className="source-type-dialog-backdrop" role="presentation" onClick={() => setAddSourceOpen(false)}>
          <section className="source-type-dialog" role="dialog" aria-modal="true" aria-labelledby="source-type-title" onClick={(event) => event.stopPropagation()}>
            <div className="source-type-dialog__header">
              <div><h2 id="source-type-title">{t('sources.chooseType')}</h2><p>{t('sources.chooseTypeDescription')}</p></div>
              <button type="button" aria-label={t('sources.closeLocation')} onClick={() => setAddSourceOpen(false)}><CloseIcon /></button>
            </div>
            <button type="button" className="source-type-option" onClick={() => { setAddSourceOpen(false); (onAddFolderSource ?? onAddSource)?.() }} disabled={!onAddFolderSource && !onAddSource}>
              <FolderIcon /><span><strong>{t('sources.localFolderType')}</strong><small>{t('sources.localFolderTypeDescription')}</small></span>
            </button>
            <button
              type="button"
              className="source-type-option"
              disabled={!onConnectApplePhotos || applePhotosBusy || applePhotosConnected}
              onClick={() => {
                if (applePhotosConnected) return
                setAddSourceOpen(false)
                void onConnectApplePhotos?.()
              }}
            >
              <span className="source-type-option__photos">◎</span>
              <span>
                <strong>{t('sources.applePhotosType')}</strong>
                <small>{applePhotosConnected
                  ? t('sources.applePhotosAlreadyConnected')
                  : applePhotosBusy ? t('sources.photosConnecting') : t('sources.applePhotosTypeDescription')}</small>
              </span>
            </button>
          </section>
        </div>
      ) : null}

      {feedbackMessage ? <div className="sources-feedback" role="status">{feedbackMessage}</div> : null}
      {applePhotosStatus?.message ? <div className="sources-photos-status" role="status">{applePhotosStatus.message}</div> : null}

      {scanProgress && activeScanSource ? (
        <section className="sources-scan" aria-label={t('sources.scanningStatus')}>
          <div className="sources-scan__header">
            <div>
              <p className="sources-view__eyebrow">{t('sources.scanningStatus')}</p>
              <h2>{activeScanSource.name}</h2>
            </div>
            <span className={`sources-scan__badge sources-scan__badge--${scanProgress.status}`}>
              {scanLabel}
            </span>
          </div>
          <p className="sources-scan__counts">
            {t('sources.scanCounts', {
              processed: processedCount(scanProgress),
              total: totalDiscovered,
            })}
          </p>
          {scanProgress.currentFile ? (
            <p className="sources-scan__detail">{t('sources.currentFile', { file: scanProgress.currentFile })}</p>
          ) : null}
          {scanProgress.errorMessage ? (
            <p className="sources-scan__detail sources-scan__detail--error">
              {t('sources.scanError', { error: scanProgress.errorMessage })}
            </p>
          ) : null}
        </section>
      ) : null}
      {applePhotosSources.length > 0 ? (
        <div className="sources-type-heading">
          <h2>Apple Photos</h2>
          <p>{t('sources.photosAvailable')} · {t('sources.photoCount', { count: applePhotosSources.reduce((sum, source) => sum + source.photoCount, 0) })}</p>
        </div>
      ) : null}
      <section className="sources-panel">
        <div className="sources-list" role="list">
          {sources.length === 0 ? (
            <div className="sources-empty">
              <p>{t('sources.empty')}</p>
              <button className="sources-empty__action" type="button" onClick={() => setAddSourceOpen(true)}>
                + {t('sources.emptyAction')}
              </button>
            </div>
          ) : (
            [...applePhotosSources, ...localFolderSources].map((source, sourceIndex) => {
              const isEditing = source.id === editingSourceId
              const trimmedDraft = draftName.trim()
              const unchanged = trimmedDraft === source.name
              const isActiveSource = activeSourceActionId === source.id || activeScanSourceId === source.id
              const isScanningThisSource = isScanning && activeScanSourceId === source.id

              return (
                <Fragment key={source.id}>
                {sourceIndex === applePhotosSources.length && localFolderSources.length > 0 ? (
                  <div className="sources-type-heading sources-type-heading--list" key="local-folders-heading">
                    <h2>{t('sources.localFolders')}</h2>
                  </div>
                ) : null}
                <article className={`source-card${isActiveSource ? ' source-card--active' : ''}`} key={source.id} role="listitem">
                  <div className="source-card__preview" aria-hidden="true">
                    {(source.previewPaths ?? []).slice(0, 4).map((previewPath, index) => (
                      <img
                        key={`${previewPath}-${index}`}
                        src={sourcePreviewUrl(previewPath)}
                        alt=""
                        onError={(event) => { event.currentTarget.hidden = true }}
                      />
                    ))}
                    {!(source.previewPaths ?? []).length ? <FolderIcon /> : null}
                  </div>
                  <div className="source-card__meta">
                    <p className={`source-card__status source-card__status--${source.status}`}>
                      {source.sourceKind === 'apple_photos'
                        ? source.status === 'online' ? t('sources.photosAvailable') : t('sources.photosUnavailable')
                        : source.status === 'online' ? t('sources.folderAvailable') : t('sources.folderUnavailable')}
                    </p>
                    {isEditing ? (
                      <form
                        className="source-card__edit"
                        onSubmit={(event) => {
                          event.preventDefault()
                          if (!trimmedDraft || unchanged) {
                            return
                          }
                          void onRenameSource(source.id, trimmedDraft)
                        }}
                      >
                        <label className="source-card__label" htmlFor={`source-name-${source.id}`}>
                          {t('sources.nameLabel')}
                        </label>
                        <input
                          autoFocus
                          className="source-card__input"
                          id={`source-name-${source.id}`}
                          type="text"
                          value={draftName}
                          onChange={(event) => setDraftName(event.target.value)}
                        />
                        <div className="source-card__actions source-card__actions--editing">
                          <button type="submit" disabled={sourceActionsBusy || !trimmedDraft || unchanged}>
                            {t('sources.save')}
                          </button>
                          <button type="button" onClick={onCancelEditingSource}>
                            {t('sources.cancel')}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <button
                      type="button"
                      className="source-card__name-link"
                      onClick={() => onSelectSource?.(source.id)}
                    >
                      <h3>{source.name}</h3>
                    </button>
                        <p>{t('sources.photoCount', { count: source.photoCount })}</p>
                      </>
                    )}
                    {source.sourceKind !== 'apple_photos' ? <button
                      type="button"
                      className="source-card__location-link"
                      aria-label={t('sources.showLocation')}
                      onClick={() => setLocationSourceId(source.id)}
                    >
                      <FolderIcon />
                      {t('sources.pathLabel')}
                    </button> : null}
                    {source.status !== 'online' ? (
                      <p className="source-card__availability-warning" role="note">
                        {source.status === 'offline' ? t('sources.sourceOffline') : t('sources.sourceUnavailable')}
                      </p>
                    ) : null}
                    {source.sourceKind !== 'apple_photos' && locationSourceId === source.id ? (
                      <div className="source-location-popover" role="dialog" aria-label={t('sources.locationDialog')}>
                        <div className="source-location-popover__header">
                          <strong>{t('sources.locationDialog')}</strong>
                          <button type="button" className="source-location-popover__close" aria-label={t('sources.closeLocation')} onClick={() => setLocationSourceId(null)}>
                            <CloseIcon />
                          </button>
                        </div>
                        <code>{source.rootPath}</code>
                        <button
                          type="button"
                          className="source-location-popover__open"
                          disabled={source.status !== 'online'}
                          onClick={() => void onOpenSourceFolder(source.rootPath)}
                        >
                          <FolderIcon />
                          {t('sources.openInFinder')}
                        </button>
                      </div>
                    ) : null}
                  </div>
                  {!isEditing ? (
                    <div className="source-card__actions">
                      {source.sourceKind !== 'apple_photos' ? (
                        <button type="button" className="source-card__action" disabled={sourceActionsBusy} onClick={() => onStartEditingSource(source.id)}>
                          <EditIcon /> {t('sources.edit')}
                        </button>
                      ) : null}
                      {source.sourceKind !== 'apple_photos' ? <button type="button" className="source-card__action" disabled={sourceActionsBusy} onClick={() => void onRelinkSource(source.id)}>
                        <RelinkIcon /> {t('sources.relink')}
                      </button> : null}
                      <button type="button" className="source-card__action" disabled={sourceActionsBusy || source.status !== 'online'} onClick={() => void onRescanSource(source.id)}>
                        <RescanIcon /> {source.sourceKind === 'apple_photos'
                          ? applePhotosBusy ? t('sources.syncingApplePhotos') : t('sources.syncApplePhotosShort')
                          : isScanningThisSource ? t('sources.rescanning') : t('sources.rescan')}
                      </button>
                      <button
                        type="button"
                        className="source-card__action source-card__action--danger"
                        disabled={sourceActionsBusy}
                        onClick={() => onDeleteSource(source.id, source.name)}
                      >
                        <DeleteIcon /> {source.sourceKind === 'apple_photos' ? t('sources.disconnect') : t('sources.delete')}
                      </button>
                    </div>
                  ) : null}
                </article>
                </Fragment>
              )
            })
          )}
        </div>
      </section>
    </main>
  )
}
