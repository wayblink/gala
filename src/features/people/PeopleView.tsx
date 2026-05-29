import { useEffect, useState } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import {
  analysisClusterFaces,
  analysisEmbedFaces,
  analysisRequest,
  capabilitiesList,
  facesList,
  facesSummary,
  personsList,
  setPersonName,
} from '../../desktop/capability'
import type {
  CapabilityDescriptor,
  Face,
  FaceSummary,
  Person,
} from '../../desktop/capability'

const EMPTY_SUMMARY: FaceSummary = {
  total_faces: 0,
  photos_with_faces: 0,
  unassigned_faces: 0,
  faces_with_embedding: 0,
}

export function PeopleView({
  onSelectPerson,
}: {
  onSelectPerson?: (personId: string, displayName: string | null) => void
}) {
  const [providers, setProviders] = useState<CapabilityDescriptor[]>([])
  const [detecting, setDetecting] = useState(false)
  const [embedding, setEmbedding] = useState(false)
  const [clustering, setClustering] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)
  const [persons, setPersons] = useState<Person[]>([])
  const [faces, setFaces] = useState<Face[]>([])
  const [stats, setStats] = useState<FaceSummary>(EMPTY_SUMMARY)

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

  const handleRunDetection = async () => {
    setDetecting(true)
    setSummary(null)
    try {
      const run = await analysisRequest({
        capability: 'face.detect',
        scope_kind: 'all',
        priority: 0,
        force: false,
      })
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
      const run = await analysisEmbedFaces()
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
      const run = await analysisClusterFaces()
      setSummary(
        `Cluster · ${run.faces_loaded} faces → ${run.persons_created} persons`,
      )
      await refresh()
    } catch (err) {
      setSummary(`Error: ${String(err)}`)
    } finally {
      setClustering(false)
    }
  }

  const visionDetect = providers.find((p) => p.provider_id === 'macos.vision.v1')
  const visionEmbed = providers.find((p) => p.provider_id === 'macos.vision.embed.v1')
  const pendingEmbeds = Math.max(0, stats.total_faces - stats.faces_with_embedding)
  const canCluster = stats.faces_with_embedding > 0

  return (
    <div className="people-view">
      <div className="people-view__header">
        <div>
          <h2>People</h2>
          <p className="people-view__subtitle">
            {visionDetect && visionEmbed
              ? 'Powered by macOS Vision (face.detect + face.embed via Neural Engine) · HNSW clustering'
              : visionDetect
                ? `Powered by ${visionDetect.provider_id} (face.detect only)`
                : 'No face provider registered'}
          </p>
        </div>
        <div className="people-view__actions">
          <button onClick={handleRunDetection} disabled={busy}>
            {detecting ? 'Detecting…' : '1. Detect faces'}
          </button>
          <button
            onClick={handleGenerateEmbeddings}
            disabled={busy || pendingEmbeds === 0}
            title={pendingEmbeds === 0 ? 'All faces already embedded' : `${pendingEmbeds} faces pending`}
          >
            {embedding ? 'Embedding…' : `2. Embed${pendingEmbeds ? ` (${pendingEmbeds})` : ''}`}
          </button>
          <button onClick={handleCluster} disabled={busy || !canCluster}>
            {clustering ? 'Clustering…' : '3. Cluster'}
          </button>
          <button onClick={() => void refresh()} disabled={busy}>
            Refresh
          </button>
        </div>
      </div>

      <div className="people-view__stats">
        <div className="people-view__stat">
          <span className="people-view__stat-value">{persons.length}</span>
          <span className="people-view__stat-label">persons</span>
        </div>
        <div className="people-view__stat">
          <span className="people-view__stat-value">{stats.total_faces}</span>
          <span className="people-view__stat-label">faces</span>
        </div>
        <div className="people-view__stat">
          <span className="people-view__stat-value">{stats.photos_with_faces}</span>
          <span className="people-view__stat-label">photos</span>
        </div>
        <div className="people-view__stat">
          <span className="people-view__stat-value">{stats.faces_with_embedding}</span>
          <span className="people-view__stat-label">embedded</span>
        </div>
      </div>

      {summary && <div className="people-view__summary">{summary}</div>}

      {persons.length > 0 ? (
        <section className="people-view__section">
          <h3 className="people-view__section-title">People</h3>
          <div className="people-view__persons">
            {persons.map((p) => (
              <PersonCard
                key={p.id}
                person={p}
                onClick={onSelectPerson ? () => onSelectPerson(p.id, p.display_name) : undefined}
                onRename={async (next) => {
                  await setPersonName(p.id, next)
                  await refresh()
                }}
              />
            ))}
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
              <FaceTile key={face.id} face={face} />
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
}: {
  person: Person
  onClick?: () => void
  onRename?: (name: string | null) => Promise<void> | void
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
          // Commit if anything actually changed; otherwise just close.
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
  const className = `person-card${interactive ? ' person-card--clickable' : ''}${editing ? ' person-card--editing' : ''}`
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

function FaceTile({ face }: { face: Face }) {
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
      </div>
      <figcaption className="face-tile__caption">
        <span className="face-tile__name">{face.file_name ?? face.photo_id}</span>
        <span className="face-tile__conf">{Math.round(face.confidence * 100)}%</span>
      </figcaption>
    </figure>
  )
}
