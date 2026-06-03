import { useCallback, useEffect, useMemo, useState } from 'react'
import { getLabels, syncPersonLabels } from '../../desktop/photos'
import { useI18n } from '../../state/useLocale'
import type { Label } from '../../types/photos'

type LabelsViewProps = {
  onSelectLabel: (label: Label) => void
}

function labelSourceName(createdBy: string) {
  if (createdBy === 'user') return 'User'
  if (createdBy === 'face.cluster') return 'People scan'
  if (createdBy === 'rule') return 'Rule'
  return createdBy
}

export function LabelsView({ onSelectLabel }: LabelsViewProps) {
  const { t } = useI18n()
  const labelKindName = (kind: string) => {
    if (kind === 'person') return t('labels.people')
    if (kind === 'subject') return t('labels.subjects')
    if (kind === 'manual') return t('labels.manualTags')
    return kind.replace(/(^|[-_\s])\w/g, (m) => m.toUpperCase())
  }
  const [labels, setLabels] = useState<Label[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setLabels(await getLabels())
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const grouped = useMemo(() => {
    const map = new Map<string, Label[]>()
    for (const label of labels) {
      const list = map.get(label.kind) ?? []
      list.push(label)
      map.set(label.kind, list)
    }
    return Array.from(map.entries())
  }, [labels])

  const handleSyncPeople = async () => {
    setSyncing(true)
    setStatus(null)
    try {
      const count = await syncPersonLabels()
      setStatus(`Synced ${count} people labels`)
      await refresh()
    } catch (error) {
      setStatus(t('content.syncFailed', { error: String(error) }))
    } finally {
      setSyncing(false)
    }
  }

  return (
    <main className="labels-view" aria-label={t('labels.title')}>
      <header className="labels-view__header">
        <div>
          <p className="eyebrow">{t('explore.eyebrow')}</p>
          <h2>{t('labels.title')}</h2>
        </div>
        <div className="labels-view__actions">
          <button type="button" onClick={handleSyncPeople} disabled={syncing}>
            {syncing ? t('labels.syncing') : t('labels.syncPeople')}
          </button>
          <button type="button" onClick={() => void refresh()} disabled={loading || syncing}>
            {t('labels.refresh')}
          </button>
        </div>
      </header>

      {status ? <p className="labels-view__status">{status}</p> : null}

      {loading ? (
        <div className="labels-view__empty">{t('labels.loading')}</div>
      ) : labels.length === 0 ? (
        <div className="labels-view__empty">
          {t('labels.empty')}
        </div>
      ) : (
        <div className="labels-view__groups">
          {grouped.map(([kind, items]) => (
            <section className="labels-view__group" key={kind}>
              <div className="labels-view__group-header">
                <h3>{labelKindName(kind)}</h3>
                <span>{t('content.labelsCount', { count: items.length })}</span>
              </div>
              <div className="labels-view__grid">
                {items.map((label) => (
                  <button
                    className="labels-view__card"
                    key={label.id}
                    type="button"
                    onClick={() => onSelectLabel(label)}
                  >
                    <span className="labels-view__card-title">{label.name}</span>
                    <span className="labels-view__card-meta">
                      {label.photoCount.toLocaleString()} photos · {labelSourceName(label.createdBy)}
                    </span>
                    <span className="labels-view__card-kind">{label.kind}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  )
}
