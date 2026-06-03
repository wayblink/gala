import { useEffect, useState } from 'react'
import { AnalysisScopeSelector } from '../../components/explore/AnalysisScopeSelector'
import { useI18n } from '../../state/useLocale'
import { convertFileSrc } from '@tauri-apps/api/core'
import {
  analysisClusterFaces,
  analysisEmbedFaces,
  analysisRequest,
  capabilitiesList,
  facesList,
  facesSummary,
  mergePersons,
  personsList,
  setPersonHidden,
  setPersonName,
  splitFaceToNewPerson,
} from '../../desktop/capability'
import type {
  CapabilityDescriptor,
  Face,
  FaceSummary,
  Person,
} from '../../desktop/capability'
import type { RunBackgroundTask } from '../../types/backgroundTasks'
import type { AnalysisScope } from '../../types/analysisScope'
import { analysisScopePayload, analysisScopeToRequest, defaultAnalysisScope } from '../../types/analysisScope'
import type { LibrarySource } from '../../types/library'

const EMPTY_SUMMARY: FaceSummary = {
  total_faces: 0,
  photos_with_faces: 0,
  unassigned_faces: 0,
  faces_with_embedding: 0,
}

export function PeopleView({
  onSelectPerson,
  runBackgroundTask,
  sources = [],
}: {
  onSelectPerson?: (personId: string, displayName: string | null) => void
  runBackgroundTask?: RunBackgroundTask
  sources?: LibrarySource[]
}) {
  const { t } = useI18n()
  const [providers, setProviders] = useState<CapabilityDescriptor[]>([])
  const [detecting, setDetecting] = useState(false)
  const [embedding, setEmbedding] = useState(false)
  const [clustering, setClustering] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)
  const [persons, setPersons] = useState<Person[]>([])
  const [faces, setFaces] = useState<Face[]>([])
  const [stats, setStats] = useState<FaceSummary>(EMPTY_SUMMARY)
  const [mergeMode, setMergeMode] = useState(false)
  const [mergeSelection, setMergeSelection] = useState<string[]>([])
  const [scope, setScope] = useState<AnalysisScope>(() => defaultAnalysisScope())

  const runTask: RunBackgroundTask = runBackgroundTask ?? (async (_spec, runner) => runner(() => undefined))

  const refresh = async () => {
    try {
      const [nextPersons, nextFaces, nextSummary] = await Promise.all([
        personsList(60),
        facesList(60),
        facesSummary(),
      ])
      setPersons(nextPersons)
      setFaces(nextFaces)
      setStats(nextSummary)
    } catch (err) {
      console.error('Failed to refresh:', err)
    }
  }

  useEffect(() => {
    void capabilitiesList().then(setProviders)
    void refresh()
  }, [])

  const busy = detecting || embedding || clustering
  const currentScopeLabel = scope.kind === 'source' ? scope.sourceName : t('scope.allLibrary')

  const handleRunDetection = async () => {
    setDetecting(true)
    setSummary(null)
    try {
      const run = await runTask(
        {
          kind: 'people',
          title: 'Detect faces',
          description: `face.detect over ${currentScopeLabel}`,
          operationPayload: { command: 'analysisRequest', capability: 'face.detect', ...analysisScopePayload(scope) },
        },
        async (update) => {
          update({ progressLabel: t('people.detecting'), detail: t('content.scopeDetail', { scope: currentScopeLabel }) })
          const result = await analysisRequest({
            capability: 'face.detect',
            ...analysisScopeToRequest(scope),
            priority: 0,
            force: false,
          })
          update({ result: `${result.photos_done} done · ${result.photos_failed} failed · ${result.photos_skipped} skipped` })
          return result
        },
      )
      setSummary(
        `Detect ${run.job_id.slice(0, 8)}… ${run.outcome} · ` +
          `${run.photos_done} done, ${run.photos_failed} failed, ${run.photos_skipped} skipped`,
      )
      await refresh()
    } catch (err) {
      setSummary(`Error: ${String(err)}`)
    } finally {
      setDetecting(false)
    }
  }

  const handleGenerateEmbeddings = async () => {
    setEmbedding(true)
    setSummary(null)
    try {
      const run = await runTask(
        {
          kind: 'people',
          title: 'Embed faces',
          description: `Generate face embeddings for ${currentScopeLabel}`,
          operationPayload: {
            command: 'analysisEmbedFaces',
            limit: null,
            ...analysisScopePayload(scope),
          },
        },
        async (update) => {
          update({ progressLabel: t('people.embedding'), detail: `${pendingEmbeds} faces pending · ${currentScopeLabel}` })
          const result = await analysisEmbedFaces(undefined, scope.kind === 'source' ? scope.sourceId : undefined)
          update({ result: `${result.faces_embedded} embedded · ${result.faces_failed} failed · ${result.faces_skipped} skipped` })
          return result
        },
      )
      setSummary(
        `Embed · ${run.photos_processed} photos · ${run.faces_embedded} embedded, ` +
          `${run.faces_failed} failed, ${run.faces_skipped} skipped`,
      )
      await refresh()
    } catch (err) {
      setSummary(`Error: ${String(err)}`)
    } finally {
      setEmbedding(false)
    }
  }

  const handleCluster = async () => {
    setClustering(true)
    setSummary(null)
    try {
      const run = await runTask(
        { kind: 'people', title: 'Cluster people', description: 'Group embedded faces into people', operationPayload: { command: 'analysisClusterFaces' } },
        async (update) => {
          update({ progressLabel: 'Clustering people…', detail: `${stats.faces_with_embedding} embedded faces available` })
          const result = await analysisClusterFaces()
          update({ result: `${result.persons_created} new persons · ${result.persons_existing} reused` })
          return result
        },
      )
      setSummary(
        `Cluster · ${run.faces_loaded} faces → ${run.persons_created} new persons, ${run.persons_existing} reused`,
      )
      await refresh()
    } catch (err) {
      setSummary(`Error: ${String(err)}`)
    } finally {
      setClustering(false)
    }
  }

  const handleTogglePersonInMerge = (id: string) => {
    setMergeSelection((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const handleCommitMerge = async () => {
    if (mergeSelection.length < 2) return
    const [target, ...sources] = mergeSelection
    setSummary(null)
    try {
      let total = 0
      for (const source of sources) {
        total += await mergePersons(source, target)
      }
      setSummary(`Merged ${sources.length} person(s) into target · ${total} face(s) moved`)
      setMergeSelection([])
      setMergeMode(false)
      await refresh()
    } catch (err) {
      setSummary(`Error: ${String(err)}`)
    }
  }

  const handleHidePerson = async (personId: string, hidden: boolean) => {
    setSummary(null)
    try {
      await setPersonHidden(personId, hidden)
      await refresh()
    } catch (err) {
      setSummary(`Error: ${String(err)}`)
    }
  }

  const handleRenamePerson = async (personId: string, name: string | null) => {
    setSummary(null)
    try {
      await setPersonName(personId, name)
      await refresh()
    } catch (err) {
      setSummary(`Error: ${String(err)}`)
    }
  }

  const handleSplitFace = async (faceId: string) => {
    setSummary(null)
    try {
      const newId = await splitFaceToNewPerson(faceId)
      setSummary(`Split face → new person ${newId.slice(0, 6)}`)
      await refresh()
    } catch (err) {
      setSummary(`Error: ${String(err)}`)
    }
  }

  const pendingEmbeds = Math.max(0, stats.total_faces - stats.faces_with_embedding)
  const canCluster = stats.faces_with_embedding > 0
  const canMerge = mergeSelection.length >= 2

  return (
    <div className="people-view">
      <div className="people-view__header">
        <div>
          <h2>{t('people.title')}</h2>
        </div>
        <div className="people-view__actions">
          <AnalysisScopeSelector value={scope} sources={sources} onChange={setScope} disabled={busy} />
          <button onClick={handleRunDetection} disabled={busy}>
            {detecting ? t('people.detecting') : t('people.detect')}
          </button>
          <button
            onClick={handleGenerateEmbeddings}
            disabled={busy || pendingEmbeds === 0}
            title={pendingEmbeds === 0 ? 'All faces already embedded in current global stats' : `${pendingEmbeds} faces pending globally`}
          >
            {embedding ? t('people.embedding') : `${t('people.embed')}${pendingEmbeds ? ` (${pendingEmbeds})` : ''}`}
          </button>
          <button onClick={handleCluster} disabled={busy || !canCluster}>
            {clustering ? t('people.clustering') : t('people.cluster')}
          </button>
          <button onClick={() => void refresh()} disabled={busy}>
            Refresh
          </button>
        </div>
      </div>

      <div className="people-view__stats">
        <div className="people-view__stat">
          <span className="people-view__stat-value">{persons.length}</span>
          <span className="people-view__stat-label">{t('people.persons')}</span>
        </div>
        <div className="people-view__stat">
          <span className="people-view__stat-value">{stats.total_faces}</span>
          <span className="people-view__stat-label">{t('people.faces')}</span>
        </div>
        <div className="people-view__stat">
          <span className="people-view__stat-value">{stats.photos_with_faces}</span>
          <span className="people-view__stat-label">{t('people.photos')}</span>
        </div>
        <div className="people-view__stat">
          <span className="people-view__stat-value">{stats.faces_with_embedding}</span>
          <span className="people-view__stat-label">{t('people.embedded')}</span>
        </div>
      </div>

      {summary && <div className="people-view__summary">{summary}</div>}

      {persons.length > 0 ? (
        <section className="people-view__section">
          <div className="people-view__section-head">
            <h3 className="people-view__section-title">People</h3>
            {mergeMode ? (
              <div className="people-view__merge-bar">
                <span>
                  {mergeSelection.length === 0
                    ? 'Pick the target person first, then the ones to merge into it'
                    : mergeSelection.length === 1
                      ? '1 selected · target locked. Pick at least one to merge.'
                      : `${mergeSelection.length} selected · target is the first one`}
                </span>
                <button onClick={() => void handleCommitMerge()} disabled={!canMerge}>
                  Merge {mergeSelection.length > 1 ? `(${mergeSelection.length - 1} → 1)` : ''}
                </button>
                <button
                  onClick={() => {
                    setMergeMode(false)
                    setMergeSelection([])
                  }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                className="people-view__section-action"
                onClick={() => setMergeMode(true)}
                disabled={persons.length < 2}
              >
                Merge…
              </button>
            )}
          </div>
          <div className="people-view__persons">
            {persons.map((p) => {
              const selectedIdx = mergeSelection.indexOf(p.id)
              return (
                <PersonCard
                  key={p.id}
                  person={p}
                  onClick={
                    mergeMode
                      ? () => handleTogglePersonInMerge(p.id)
                      : onSelectPerson
                        ? () => onSelectPerson(p.id, p.display_name)
                        : undefined
                  }
                  onRename={mergeMode ? undefined : (next) => handleRenamePerson(p.id, next)}
                  onToggleHidden={mergeMode ? undefined : () => handleHidePerson(p.id, true)}
                  mergeBadge={
                    mergeMode
                      ? selectedIdx === -1
                        ? null
                        : selectedIdx === 0
                          ? 'target'
                          : 'merge'
                      : null
                  }
                />
              )
            })}
          </div>
        </section>
      ) : null}

      {faces.length === 0 ? (
        <div className="people-view__empty">
          <p>
            No faces detected yet. Add a photo source via the left rail, scan it, then run
            <strong> Detect → Embed → Cluster</strong>.
          </p>
        </div>
      ) : (
        <section className="people-view__section">
          <h3 className="people-view__section-title">All faces</h3>
          <div className="people-view__grid">
            {faces.map((face) => (
              <FaceTile key={face.id} face={face} onSplit={() => void handleSplitFace(face.id)} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function PersonCard({
  person,
  onClick,
  onRename,
  onToggleHidden,
  mergeBadge,
}: {
  person: Person
  onClick?: () => void
  onRename?: (name: string | null) => Promise<void> | void
  onToggleHidden?: () => Promise<void> | void
  mergeBadge?: 'target' | 'merge' | null
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(person.display_name ?? '')
  const [saving, setSaving] = useState(false)
  const src = person.rep_thumbnail_path ? convertFileSrc(person.rep_thumbnail_path) : null
  const hasBbox =
    person.rep_bbox_x != null &&
    person.rep_bbox_y != null &&
    person.rep_bbox_w != null &&
    person.rep_bbox_h != null
  const overlayStyle: React.CSSProperties = hasBbox
    ? {
        left: `${(person.rep_bbox_x ?? 0) * 100}%`,
        top: `${(person.rep_bbox_y ?? 0) * 100}%`,
        width: `${(person.rep_bbox_w ?? 0) * 100}%`,
        height: `${(person.rep_bbox_h ?? 0) * 100}%`,
      }
    : {}
  const label = person.display_name ?? `Person · ${person.id.slice(0, 6)}`

  const beginEdit = () => {
    setDraft(person.display_name ?? '')
    setEditing(true)
  }
  const cancelEdit = () => setEditing(false)
  const commitEdit = async () => {
    if (!onRename) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      const trimmed = draft.trim()
      await onRename(trimmed.length === 0 ? null : trimmed)
    } finally {
      setSaving(false)
      setEditing(false)
    }
  }

  const photoBlock = (
    <>
      {src ? <img src={src} alt={label} /> : <span className="person-card__placeholder" />}
      {hasBbox && <span className="person-card__bbox" style={overlayStyle} />}
      {mergeBadge && (
        <span
          className={`person-card__merge-badge person-card__merge-badge--${mergeBadge}`}
          aria-hidden
        >
          {mergeBadge === 'target' ? 'TARGET' : '+'}
        </span>
      )}
      {onRename && !editing && (
        <button
          type="button"
          className="person-card__edit-btn"
          aria-label={`Rename ${label}`}
          title="Rename"
          onClick={(e) => {
            e.stopPropagation()
            beginEdit()
          }}
        >
          ✎
        </button>
      )}
      {onToggleHidden && (
        <button
          type="button"
          className="person-card__hide-btn"
          aria-label={`Hide ${label}`}
          title="Hide person"
          onClick={(e) => {
            e.stopPropagation()
            void onToggleHidden()
          }}
        >
          ⊘
        </button>
      )}
    </>
  )

  const captionBlock = editing ? (
    <span
      className="person-card__caption"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <input
        type="text"
        className="person-card__rename-input"
        autoFocus
        value={draft}
        disabled={saving}
        placeholder="Name this person"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            void commitEdit()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            cancelEdit()
          }
        }}
        onBlur={() => {
          const trimmed = draft.trim()
          const current = person.display_name ?? ''
          if (trimmed !== current) {
            void commitEdit()
          } else {
            cancelEdit()
          }
        }}
      />
      <span className="person-card__meta">
        {person.face_count} {person.face_count === 1 ? 'face' : 'faces'} · {person.photo_count}{' '}
        {person.photo_count === 1 ? 'photo' : 'photos'}
      </span>
    </span>
  ) : (
    <>
      <span className="person-card__name">{label}</span>
      <span className="person-card__meta">
        {person.face_count} {person.face_count === 1 ? 'face' : 'faces'} · {person.photo_count}{' '}
        {person.photo_count === 1 ? 'photo' : 'photos'}
      </span>
    </>
  )

  const interactive = Boolean(onClick) && !editing
  const className = `person-card${interactive ? ' person-card--clickable' : ''}${editing ? ' person-card--editing' : ''}${mergeBadge ? ' person-card--merge-selected' : ''}`
  if (!interactive) {
    return (
      <figure className={className} title={label}>
        <div className="person-card__photo">{photoBlock}</div>
        <figcaption className="person-card__caption">{captionBlock}</figcaption>
      </figure>
    )
  }
  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      aria-label={`View photos of ${label}`}
      title={label}
    >
      <span className="person-card__photo">{photoBlock}</span>
      <span className="person-card__caption">{captionBlock}</span>
    </button>
  )
}

function FaceTile({ face, onSplit }: { face: Face; onSplit?: () => void }) {
  const src = face.thumbnail_path ? convertFileSrc(face.thumbnail_path) : null
  const overlayStyle: React.CSSProperties = {
    left: `${face.bbox_x * 100}%`,
    top: `${face.bbox_y * 100}%`,
    width: `${face.bbox_w * 100}%`,
    height: `${face.bbox_h * 100}%`,
  }
  const hasEmbedding = Boolean(face.embedding_dim)
  const hasPerson = Boolean(face.person_id)
  return (
    <figure className="face-tile" title={face.file_name ?? face.photo_id}>
      <div className="face-tile__photo">
        {src ? <img src={src} alt={face.file_name ?? face.photo_id} /> : <span className="face-tile__placeholder" />}
        <span className="face-tile__bbox" style={overlayStyle} />
        {hasPerson && <span className="face-tile__person-badge" title="assigned to a person">●</span>}
        {hasEmbedding && !hasPerson && (
          <span className="face-tile__embed-badge" title="embedding ready">★</span>
        )}
        {hasPerson && onSplit && (
          <button
            type="button"
            className="face-tile__split-btn"
            aria-label="Split into own person"
            title="Split into own person"
            onClick={(e) => {
              e.stopPropagation()
              onSplit()
            }}
          >
            ⤴
          </button>
        )}
      </div>
      <figcaption className="face-tile__caption">
        <span className="face-tile__name">{face.file_name ?? face.photo_id}</span>
        <span className="face-tile__conf">{Math.round(face.confidence * 100)}%</span>
      </figcaption>
    </figure>
  )
}
