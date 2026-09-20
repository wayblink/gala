import { useI18n } from '../state/useLocale'
import type { BackgroundTask } from '../types/backgroundTasks'

const formatTime = (iso?: string | null) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

type BackgroundTasksViewProps = {
  tasks: BackgroundTask[]
  onClearCompleted?: () => void
  onRunSimilarScan?: () => void
  onRunPeopleScan?: () => void
  onRunContentScan?: () => void
  onRunQualityScan?: () => void
  photoQualityEnabled?: boolean
}

export function BackgroundTasksView({
  tasks,
  onClearCompleted,
  onRunSimilarScan,
  onRunPeopleScan,
  onRunContentScan,
  onRunQualityScan,
  photoQualityEnabled = false,
}: BackgroundTasksViewProps) {
  const { t } = useI18n()
  const activeCount = tasks.filter((task) => task.status === 'queued' || task.status === 'running').length
  const completedCount = tasks.filter((task) => task.status === 'succeeded').length
  const failedCount = tasks.filter((task) => task.status === 'failed').length
  const pausedCount = tasks.filter((task) => task.status === 'paused').length

  return (
    <main className="task-view" aria-label={t('tasks.title')}>
      <header className="task-view__header">
        <div>
          <p className="task-view__eyebrow">{t('tasks.operations')}</p>
          <h1>{t('tasks.title')}</h1>
        </div>
        <div className="task-view__actions">
          <button type="button" onClick={onRunQualityScan} disabled={!photoQualityEnabled}>{t('tasks.scanQuality')}</button>
          <button type="button" onClick={onRunSimilarScan}>{t('tasks.scanSimilar')}</button>
          <button type="button" onClick={onRunPeopleScan}>{t('tasks.scanPeople')}</button>
          <button type="button" onClick={onRunContentScan}>{t('tasks.scanContent')}</button>
          <button type="button" onClick={onClearCompleted} disabled={completedCount + failedCount === 0}>
{t('tasks.clearFinished')}
          </button>
        </div>
      </header>

      <section className="task-view__stats" aria-label="Task status summary">
        <div><strong>{activeCount}</strong><span>{t('tasks.active')}</span></div>
        <div><strong>{completedCount}</strong><span>{t('tasks.complete')}</span></div>
        <div><strong>{pausedCount}</strong><span>{t('tasks.paused')}</span></div>
        <div><strong>{failedCount}</strong><span>{t('tasks.failed')}</span></div>
      </section>

      {tasks.length === 0 ? (
        <section className="task-view__empty">
          <h2>{t('tasks.emptyTitle')}</h2>
          <p>{t('tasks.emptyBody')}</p>
        </section>
      ) : (
        <section className="task-list" aria-label={t('tasks.taskList')}>
          {tasks.map((task) => (
            <article className={`task-card task-card--${task.status}`} key={task.id}>
              <div className="task-card__main">
                <span className={`task-card__status-dot task-card__status-dot--${task.status}`} />
                <div>
                  <p className="task-card__kind">{task.kind}</p>
                  <h2>{task.title}</h2>
                  {task.description ? <p>{task.description}</p> : null}
                  {task.detail ? <p className="task-card__detail">{task.detail}</p> : null}
                  {task.result ? <p className="task-card__result">{task.result}</p> : null}
                  {task.error ? <p className="task-card__error">{task.error}</p> : null}
                </div>
              </div>
              <div className="task-card__meta">
                <span>{task.progressLabel ?? task.status}</span>
                <span>{formatTime(task.startedAt)} → {formatTime(task.completedAt)}</span>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  )
}
