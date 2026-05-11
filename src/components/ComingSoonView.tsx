import type { ComingSoonViewId } from '../types/photos'

type ComingSoonViewProps = {
  viewId: ComingSoonViewId | 'explore' | 'settings'
  title: string
}

const descriptions: Record<ComingSoonViewProps['viewId'], { blurb: string; milestone: string }> = {
  timeline: {
    blurb: 'A chronological memory light table, grouped by month.',
    milestone: 'Available in V0 via All Photos. Standalone Timeline view lands in V1.',
  },
  places: {
    blurb: 'Photos organized by where they were captured.',
    milestone: 'Planned for V1, once GPS clustering is in the capability layer.',
  },
  people: {
    blurb: 'Faces grouped into people you recognize.',
    milestone: 'Planned for V2, once on-device face embeddings ship.',
  },
  memories: {
    blurb: 'Generated moments worth revisiting, with an explanation of why.',
    milestone: 'Planned for V2. Every Memory will explain itself before it appears.',
  },
  similar: {
    blurb: 'Near-duplicates and look-alikes, surfaced without deleting anything.',
    milestone: 'Planned for V1. Non-destructive by design.',
  },
  explore: {
    blurb: 'A place to discover connections between your photos.',
    milestone: 'Placeholder. The discovery surface will land alongside V1 views.',
  },
  settings: {
    blurb: 'Preferences for sources, performance, and privacy.',
    milestone: 'Placeholder. Settings will ship before V0 release.',
  },
}

export function ComingSoonView({ viewId, title }: ComingSoonViewProps) {
  const meta = descriptions[viewId]

  return (
    <main className="photo-surface photo-surface--coming-soon" aria-label={`${title} view`}>
      <div className="coming-soon">
        <p className="coming-soon__eyebrow">Coming soon</p>
        <h2 className="coming-soon__title">{title}</h2>
        <p className="coming-soon__blurb">{meta.blurb}</p>
        <p className="coming-soon__milestone">{meta.milestone}</p>
      </div>
    </main>
  )
}
