import { useCallback, useEffect, useState } from 'react'
import { AnalysisScopeSelector } from '../../components/explore/AnalysisScopeSelector'
import { useI18n } from '../../state/useLocale'
import { analysisRequest } from '../../desktop/capability'
import { getLabels, materializeContentLabels } from '../../desktop/photos'
import type { RunBackgroundTask } from '../../types/backgroundTasks'
import type { AnalysisScope } from '../../types/analysisScope'
import { analysisScopePayload, analysisScopeToRequest, defaultAnalysisScope } from '../../types/analysisScope'
import type { LibrarySource } from '../../types/library'
import type { Label } from '../../types/photos'

type ContentRecognitionViewProps = {
  runBackgroundTask: RunBackgroundTask
  onSelectLabel: (label: Label) => void
  sources?: LibrarySource[]
}

function sourceLabel(createdBy: string) {
  if (createdBy === 'macos.vision.classify.v1') return 'macOS Vision'
  if (createdBy === 'user') return 'User'
  return createdBy
}

export function ContentRecognitionView({ runBackgroundTask, onSelectLabel, sources = [] }: ContentRecognitionViewProps) {
  const { t } = useI18n()
  const [subjects, setSubjects] = useState<Label[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [scope, setScope] = useState<AnalysisScope>(() => defaultAnalysisScope())

  const refresh = useCallback(async () => {
    setLoading(true)
    setSubjects(await getLabels('subject'))
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const currentScopeLabel = scope.kind === 'source' ? scope.sourceName : t('scope.allLibrary')

  const handleScan = async () => {
    setRunning(true)
    setStatus(null)
    try {
      await runBackgroundTask(
        {
          kind: 'content',
          title: t('content.taskTitle'),
          description: t('content.taskDescription'),
          operationPayload: {
            capability: 'content.classify',
            provider: 'macos.vision.classify.v1',
            ...analysisScopePayload(scope),
            config: { maxLabels: 8, minConfidence: 0.2, materializeConfidence: 0.35 },
          },
        },
        async (update) => {
          update({ progressLabel: t('content.classifying'), detail: t('content.scopeDetail', { scope: currentScopeLabel }) })
          const run = await analysisRequest({
            capability: 'content.classify',
            ...analysisScopeToRequest(scope),
            priority: 0,
            force: false,
            config: { maxLabels: 8, minConfidence: 0.2 },
          })
          update({
            progressLabel: t('content.writingLabels'),
            detail: `${run.photos_done} classified · ${run.photos_failed} failed · ${run.photos_skipped} skipped`,
          })
          const materialized = await materializeContentLabels(0.35, scope.kind === 'source' ? scope.sourceId : undefined)
          const result = `${materialized.labelsWritten} labels across ${materialized.photosProcessed} photos`
          update({ result })
          return { run, materialized }
        },
      )
      setStatus(t('content.updated', { scope: currentScopeLabel }))
      await refresh()
    } catch (error) {
      setStatus(t('content.scanFailed', { error: String(error) }))
    } finally {
      setRunning(false)
    }
  }

  const handleSync = async () => {
    setRunning(true)
    setStatus(null)
    try {
      const result = await materializeContentLabels(0.35, scope.kind === 'source' ? scope.sourceId : undefined)
      setStatus(t('content.synced', { labels: result.labelsWritten, photos: result.photosProcessed, scope: currentScopeLabel }))
      await refresh()
    } catch (error) {
      setStatus(t('content.syncFailed', { error: String(error) }))
    } finally {
      setRunning(false)
    }
  }

  return (
    <main className="labels-view content-view" aria-label={t('content.title')}>
      <header className="labels-view__header">
        <div>
          <p className="eyebrow">{t('explore.eyebrow')}</p>
          <h2>{t('content.title')}</h2>
        </div>
        <div className="labels-view__actions">
          <AnalysisScopeSelector value={scope} sources={sources} onChange={setScope} disabled={running} />
          <button type="button" onClick={handleScan} disabled={running}>
            {running ? t('content.scanning') : t('content.scan')}
          </button>
          <button type="button" onClick={handleSync} disabled={running}>
            {t('content.syncExisting')}
          </button>
          <button type="button" onClick={() => void refresh()} disabled={running || loading}>
            {t('content.refresh')}
          </button>
        </div>
      </header>

      {status ? <p className="labels-view__status">{status}</p> : null}

      {loading ? (
        <div className="labels-view__empty">{t('content.loading')}</div>
      ) : subjects.length === 0 ? (
        <div className="labels-view__empty">
          {t('content.empty')}
        </div>
      ) : (
        <section className="labels-view__group">
          <div className="labels-view__group-header">
            <h3>{t('content.subjects')}</h3>
            <span>{t('content.labelsCount', { count: subjects.length })}</span>
          </div>
          <div className="labels-view__grid">
            {subjects.map((label) => (
              <button className="labels-view__card" key={label.id} type="button" onClick={() => onSelectLabel(label)}>
                <span className="labels-view__card-title">{label.name}</span>
                <span className="labels-view__card-meta">
                  {label.photoCount.toLocaleString()} photos · {sourceLabel(label.createdBy)}
                </span>
                <span className="labels-view__card-kind">subject</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </main>
  )
}
