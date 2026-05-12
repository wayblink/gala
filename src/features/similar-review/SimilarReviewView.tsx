import type { SimilarReviewCard } from './similarReviewModel'

type Props = {
  cards: SimilarReviewCard[]
}

export function SimilarReviewView({ cards }: Props) {
  return (
    <main className="similar-review-view" aria-label="Similar review workflow">
      <header className="similar-review-view__header">
        <p className="similar-review-view__eyebrow">Workflow</p>
        <h1>Similar Review</h1>
        <p>Review candidate groups before they become durable logical groups.</p>
      </header>

      <div className="similar-review-view__cards">
        {cards.map((card) => (
          <article className="similar-review-card" key={card.id}>
            <div className="similar-review-card__meta">
              <span className="badge">{card.kind}</span>
              <span>{card.photoIds.length} photos</span>
              <span>{Math.round(card.confidence * 100)}% confidence</span>
            </div>
            <h2>{card.title}</h2>
            <p>{card.reason}</p>
          </article>
        ))}
      </div>
    </main>
  )
}
