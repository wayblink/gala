import type { ComingSoonViewId } from '../types/photos'

type ComingSoonViewProps = {
  viewId: ComingSoonViewId | 'explore'
  title: string
}

const descriptions: Record<ComingSoonViewProps['viewId'], { blurb: string; milestone: string }> = {
  people: {
    blurb: 'Faces grouped into people you recognize.',
    milestone: 'Available as an on-device analysis workflow.',
  },
  content: {
    blurb: 'On-device recognition for subjects, scenes, and objects.',
    milestone: 'Available as an Explore strategy backed by the unified label layer.',
  },
  similar: {
    blurb: 'Near-duplicates and look-alikes, surfaced without deleting anything.',
    milestone: 'Available as a review workflow with visual embeddings.',
  },
  reorganize: {
    blurb: 'Rebuild a physical folder tree from custom rules.',
    milestone: 'Scan a plan, compare before/after, then execute after confirmation.',
  },
  explore: {
    blurb: 'A place to discover connections between your photos.',
    milestone: 'Placeholder. The discovery surface will land alongside V1 views.',
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
