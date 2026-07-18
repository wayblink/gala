import { useEffect, useState } from 'react'
import { useI18n } from '../../state/useLocale'
import type { LibrarySource, ScanProgress } from '../../types/library'

type SourcesViewProps = {
  sources: LibrarySource[]
  editingSourceId?: string | null
  scanProgress?: ScanProgress | null
  isScanning?: boolean
  activeSourceActionId?: string | null
  feedbackMessage?: string | null
  onAddSource: () => void
  onStartEditingSource: (sourceId: string) => void
  onCancelEditingSource: () => void
  onRenameSource: (sourceId: string, newName: string) => Promise<void> | void
  onRelinkSource: (sourceId: string) => Promise<void> | void
  onRescanSource: (sourceId: string) => Promise<void> | void
  onDeleteSource: (sourceId: string, sourceName: string) => void
}

const processedCount = (scanProgress: ScanProgress | null | undefined) =>
  (scanProgress?.thumbnailReadyCount ?? 0) + (scanProgress?.thumbnailFailedCount ?? 0)

export function SourcesView({
  sources,
  editingSourceId = null,
  scanProgress = null,
  isScanning = false,
  activeSourceActionId = null,
  feedbackMessage = null,
  onAddSource,
  onStartEditingSource,
  onCancelEditingSource,
  onRenameSource,
  onRelinkSource,
  onRescanSource,
  onDeleteSource,
}: SourcesViewProps) {
  const { t } = useI18n()
  const [draftName, setDraftName] = useState('')
  const activeScanSourceId = scanProgress?.sourceId ?? null
  const activeScanSource = activeScanSourceId ? sources.find((source) => source.id === activeScanSourceId) : null
  const totalDiscovered = scanProgress?.discoveredCount ?? 0
  const scanLabel = scanProgress ? t(`sources.scanStep.${scanProgress.status}`) : null

  useEffect(() => {
    if (!editingSourceId) {
      setDraftName('')
      return
    }

    const source = sources.find((item) => item.id === editingSourceId)
    setDraftName(source?.name ?? '')
  }, [editingSourceId, sources])

  return (
    <main className="sources-view" aria-label={t('sources.title')}>
      <header className="sources-view__header">
        <div>
          <p className="sources-view__eyebrow">Library</p>
          <h1>{t('sources.title')}</h1>
          <p className="sources-view__sub">{t('sources.subtitle')}</p>
        </div>
        <button className="sources-view__add" type="button" onClick={onAddSource}>
          + {t('sources.add')}
        </button>
      </header>

      {feedbackMessage ? <div className="sources-feedback" role="status">{feedbackMessage}</div> : null}

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

      <section className="sources-panel">
        <div className="sources-panel__intro">
          <p className="sources-view__eyebrow">Overview</p>
          <h2>{t('sources.listTitle')}</h2>
          <p>{t('sources.listDescription')}</p>
        </div>

        <div className="sources-list" role="list">
          {sources.length === 0 ? (
            <div className="sources-empty">
              <p>{t('sources.empty')}</p>
              <button className="sources-empty__action" type="button" onClick={onAddSource}>
                + {t('sources.emptyAction')}
              </button>
            </div>
          ) : (
            sources.map((source) => {
              const isEditing = source.id === editingSourceId
              const trimmedDraft = draftName.trim()
              const unchanged = trimmedDraft === source.name
              const isActiveSource = activeSourceActionId === source.id || activeScanSourceId === source.id
              const isScanningThisSource = isScanning && activeScanSourceId === source.id

              return (
                <article className={`source-card${isActiveSource ? ' source-card--active' : ''}`} key={source.id} role="listitem">
                  <div className="source-card__meta">
                    <p className="source-card__status">{source.status}</p>
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
                          <button type="submit" disabled={!trimmedDraft || unchanged}>
                            {t('sources.save')}
                          </button>
                          <button type="button" onClick={onCancelEditingSource}>
                            {t('sources.cancel')}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <h3>{source.name}</h3>
                        <p>{t('sources.photoCount', { count: source.photoCount })}</p>
                      </>
                    )}
                    <p className="source-card__path-label">{t('sources.pathLabel')}</p>
                    <code>{source.rootPath}</code>
                  </div>
                  {!isEditing ? (
                    <div className="source-card__actions">
                      <button type="button" onClick={() => onStartEditingSource(source.id)}>
                        {t('sources.edit')}
                      </button>
                      <button type="button" onClick={() => void onRelinkSource(source.id)}>
                        {t('sources.relink')}
                      </button>
                      <button type="button" disabled={isScanningThisSource} onClick={() => void onRescanSource(source.id)}>
                        {isScanningThisSource ? t('sources.rescanning') : t('sources.rescan')}
                      </button>
                      <button type="button" onClick={() => onDeleteSource(source.id, source.name)}>
                        {t('sources.delete')}
                      </button>
                    </div>
                  ) : null}
                </article>
              )
            })
          )}
        </div>
      </section>
    </main>
  )
}