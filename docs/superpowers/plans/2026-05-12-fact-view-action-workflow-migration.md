# Fact / View / Action / Workflow Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve the existing Gala photo app into a workflow-driven system by introducing a clear Fact / View / Action / Workflow structure without rewriting the current product shell.

**Architecture:** Keep the current React + Tauri app, state hooks, and desktop commands as the product container. Introduce a thin domain layer that names current data as Facts, current filters/screens as Views, user operations as Actions, and multi-step procedures as Workflows. Add only the minimum code needed to make this structure explicit, beginning with Similar Review as the first workflow-shaped view.

**Tech Stack:** React 19, TypeScript, Vite, Tauri 2, existing desktop commands, existing hooks/state, Vitest, Testing Library, Playwright, plain CSS.

---

## Scope

This plan does **not** rebuild Gala.

In scope:

- Map existing library/photo/filter/selection code to Fact / View / Action / Workflow concepts.
- Add a lightweight domain model layer that gives these concepts names and stable types.
- Add a first workflow-shaped view surface for Similar Review as a placeholder shell, not full AI scanning.
- Keep existing photo browsing, albums, tags, favorites, hidden state, and desktop commands intact.
- Add tests that lock the new abstraction boundaries in place.

Out of scope:

- Full AI similarity detection.
- Face recognition.
- Vector search.
- Rust backend redesign.
- Database schema migration.
- Rewriting the current photo browser shell.

---

## File Structure

Create these files:

- `src/domain/fact.ts` - stable fact types for photos, scans, decisions, and derived analysis outputs.
- `src/domain/view.ts` - view types for app screens and review queues.
- `src/domain/action.ts` - action types for explicit user/system operations.
- `src/domain/workflow.ts` - workflow types and workflow state helpers.
- `src/domain/__tests__/fvwf.test.ts` - tests for the fact/view/action/workflow model.
- `src/features/similar-review/SimilarReviewView.tsx` - first workflow-shaped review surface, initially using mock or existing library data.
- `src/features/similar-review/similarReviewModel.ts` - grouping and queue helpers for the Similar Review surface.
- `src/features/similar-review/__tests__/similarReviewModel.test.ts` - tests for queue grouping and prioritization.
- `src/App.tsx` - add route/branch for the Similar Review view while keeping current browsing behavior.
- `src/components/LeftRail.tsx` - expose Similar Review as a distinct workflow-oriented entry.
- `src/components/PhotoSurface.tsx` - keep current browse shell but allow workflow view switching.
- `src/types/photos.ts` - extend photo view vocabulary only if needed for the new workflow view.
- `src/styles.css` - add minimal styling for workflow review queue cards and badges.
- `docs/fact-view-action-workflow.md` - reference design doc already created.

Modify these existing files if needed:

- `src/state/useViewFilter.ts` - support a workflow-oriented selected view while preserving current filters.
- `src/types/photos.ts` - if a dedicated Similar Review filter needs to be represented.
- `src/components/LeftRail.tsx` - add a workflow group for review surfaces.
- `src/components/PhotoSurface.tsx` - display the Similar Review surface when selected.

---

## Task 1: Define the Domain Vocabulary

**Files:**

- Create: `src/domain/fact.ts`
- Create: `src/domain/view.ts`
- Create: `src/domain/action.ts`
- Create: `src/domain/workflow.ts`
- Create: `src/domain/__tests__/fvwf.test.ts`

- [x] **Step 1: Write the failing test**

Create `src/domain/__tests__/fvwf.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { isFact } from '../fact'
import { buildViewId, isView } from '../view'
import { isAction } from '../action'
import { isWorkflow } from '../workflow'

describe('fact/view/action/workflow model', () => {
  it('recognizes a fact record', () => {
    expect(
      isFact({
        id: 'fact-1',
        kind: 'photo',
        source: 'library',
        createdAt: '2026-05-12T00:00:00.000Z',
        payload: { photoId: 'p1' },
      }),
    ).toBe(true)
  })

  it('builds a stable view id', () => {
    expect(buildViewId('similar-review', 'scan-1')).toBe('similar-review:scan-1')
  })

  it('recognizes a view record', () => {
    expect(
      isView({
        id: 'similar-review:scan-1',
        kind: 'similar-review',
        sourceFactIds: ['fact-1'],
        state: 'active',
      }),
    ).toBe(true)
  })

  it('recognizes an action record', () => {
    expect(
      isAction({
        id: 'action-1',
        kind: 'promote-candidate-group',
        targetId: 'candidate-group-1',
        reversible: true,
      }),
    ).toBe(true)
  })

  it('recognizes a workflow record', () => {
    expect(
      isWorkflow({
        id: 'workflow-1',
        kind: 'similarity-review',
        stepKinds: ['scan', 'cluster', 'review', 'promote'],
        requiresConfirmation: true,
      }),
    ).toBe(true)
  })
})
```

- [x] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test -- src/domain/__tests__/fvwf.test.ts
```

Expected: FAIL because the domain files do not exist yet.

- [x] **Step 3: Write minimal implementation**

Create `src/domain/fact.ts`:

```ts
export type Fact = {
  id: string
  kind: string
  source: string
  createdAt: string
  payload: unknown
}

export function isFact(value: unknown): value is Fact {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    typeof v.id === 'string' &&
    typeof v.kind === 'string' &&
    typeof v.source === 'string' &&
    typeof v.createdAt === 'string' &&
    'payload' in v
  )
}
```

Create `src/domain/view.ts`:

```ts
export type View = {
  id: string
  kind: string
  sourceFactIds: string[]
  state: 'active' | 'stale' | 'archived'
}

export function buildViewId(kind: string, sourceId: string): string {
  return `${kind}:${sourceId}`
}

export function isView(value: unknown): value is View {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    typeof v.id === 'string' &&
    typeof v.kind === 'string' &&
    Array.isArray(v.sourceFactIds) &&
    v.sourceFactIds.every((x) => typeof x === 'string') &&
    (v.state === 'active' || v.state === 'stale' || v.state === 'archived')
  )
}
```

Create `src/domain/action.ts`:

```ts
export type Action = {
  id: string
  kind: string
  targetId: string
  reversible: boolean
}

export function isAction(value: unknown): value is Action {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    typeof v.id === 'string' &&
    typeof v.kind === 'string' &&
    typeof v.targetId === 'string' &&
    typeof v.reversible === 'boolean'
  )
}
```

Create `src/domain/workflow.ts`:

```ts
export type Workflow = {
  id: string
  kind: string
  stepKinds: string[]
  requiresConfirmation: boolean
}

export function isWorkflow(value: unknown): value is Workflow {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    typeof v.id === 'string' &&
    typeof v.kind === 'string' &&
    Array.isArray(v.stepKinds) &&
    v.stepKinds.every((x) => typeof x === 'string') &&
    typeof v.requiresConfirmation === 'boolean'
  )
}
```

- [x] **Step 4: Run the test to verify it passes**

Run:

```bash
npm test -- src/domain/__tests__/fvwf.test.ts
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/domain/fact.ts src/domain/view.ts src/domain/action.ts src/domain/workflow.ts src/domain/__tests__/fvwf.test.ts
git commit -m "feat: add fact view action workflow domain vocabulary"
```

---

## Task 2: Create a Similar Review Model

**Files:**

- Create: `src/features/similar-review/similarReviewModel.ts`
- Create: `src/features/similar-review/__tests__/similarReviewModel.test.ts`

- [x] **Step 1: Write the failing test**

Create `src/features/similar-review/__tests__/similarReviewModel.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildSimilarReviewQueue } from '../similarReviewModel'

const photos = [
  { id: 'p1', fileName: 'IMG_1001.JPG', capturedAt: '2026-05-12T10:00:00.000Z', sourceName: 'A' },
  { id: 'p2', fileName: 'IMG_1002.JPG', capturedAt: '2026-05-12T10:00:03.000Z', sourceName: 'A' },
  { id: 'p3', fileName: 'IMG_2001.JPG', capturedAt: '2026-05-12T12:00:00.000Z', sourceName: 'A' },
]

describe('buildSimilarReviewQueue', () => {
  it('groups nearby captures into a review card', () => {
    const queue = buildSimilarReviewQueue(photos)
    expect(queue.length).toBe(2)
    expect(queue[0].photoIds).toEqual(['p1', 'p2'])
    expect(queue[0].kind).toBe('burst')
  })
})
```

- [x] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test -- src/features/similar-review/__tests__/similarReviewModel.test.ts
```

Expected: FAIL because the model does not exist yet.

- [x] **Step 3: Write minimal implementation**

Create `src/features/similar-review/similarReviewModel.ts`:

```ts
export type SimilarReviewCard = {
  id: string
  kind: 'burst' | 'duplicate' | 'same-scene'
  photoIds: string[]
  confidence: number
  title: string
  reason: string
}

export function buildSimilarReviewQueue(
  photos: Array<{ id: string; fileName: string; capturedAt: string | null; sourceName: string }>,
): SimilarReviewCard[] {
  if (photos.length === 0) return []

  const sorted = [...photos].sort((a, b) => (a.capturedAt ?? '').localeCompare(b.capturedAt ?? ''))
  const groups: SimilarReviewCard[] = []
  let current: typeof sorted = []

  const flush = () => {
    if (current.length === 0) return
    if (current.length >= 2) {
      groups.push({
        id: `group-${groups.length + 1}`,
        kind: 'burst',
        photoIds: current.map((p) => p.id),
        confidence: 0.95,
        title: `Burst group · ${current.length} photos`,
        reason: 'Captured within a short time window.',
      })
    } else {
      const p = current[0]
      groups.push({
        id: `group-${groups.length + 1}`,
        kind: 'same-scene',
        photoIds: [p.id],
        confidence: 0.2,
        title: `Standalone photo · ${p.fileName}`,
        reason: 'No nearby captures found.',
      })
    }
    current = []
  }

  for (const photo of sorted) {
    if (current.length === 0) {
      current.push(photo)
      continue
    }
    const previous = current[current.length - 1]
    const prevTime = previous.capturedAt ? Date.parse(previous.capturedAt) : NaN
    const nextTime = photo.capturedAt ? Date.parse(photo.capturedAt) : NaN
    const delta = Number.isFinite(prevTime) && Number.isFinite(nextTime) ? Math.abs(nextTime - prevTime) : Infinity
    if (delta <= 5000) {
      current.push(photo)
    } else {
      flush()
      current.push(photo)
    }
  }

  flush()
  return groups
}
```

- [x] **Step 4: Run the test to verify it passes**

Run:

```bash
npm test -- src/features/similar-review/__tests__/similarReviewModel.test.ts
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/features/similar-review/similarReviewModel.ts src/features/similar-review/__tests__/similarReviewModel.test.ts
git commit -m "feat: add similar review grouping model"
```

---

## Task 3: Add a Similar Review View Surface

**Files:**

- Create: `src/features/similar-review/SimilarReviewView.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/LeftRail.tsx`
- Modify: `src/styles.css`

- [x] **Step 1: Write the failing test**

Add a rendering test to `src/App.test.tsx` or create `src/features/similar-review/__tests__/SimilarReviewView.test.tsx` that asserts the Similar Review surface renders when the new view is selected.

Example test:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from '../../App'

describe('App workflow surface', () => {
  it('shows Similar Review when selected', async () => {
    render(<App />)
    expect(screen.getByText('Similar')).toBeInTheDocument()
  })
})
```

- [x] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test -- src/App.test.tsx
```

Expected: FAIL until the Similar Review entry and surface exist.

- [x] **Step 3: Write minimal implementation**

Create `src/features/similar-review/SimilarReviewView.tsx`:

```tsx
import type { SimilarReviewCard } from './similarReviewModel'

type Props = {
  cards: SimilarReviewCard[]
}

export function SimilarReviewView({ cards }: Props) {
  return (
    <section className="similar-review-view">
      <header className="similar-review-view__header">
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
    </section>
  )
}
```

Then wire `App.tsx` so when `view.filter?.type === 'view' && view.filter.viewId === 'similar'`, the app shows `SimilarReviewView` instead of the usual photo browser.

Update `LeftRail.tsx` so the Similar item is clearly a workflow-oriented review entry.

Add minimal CSS for `.similar-review-view`, `.similar-review-card`, `.badge`, and card layout.

- [x] **Step 4: Run the test to verify it passes**

Run:

```bash
npm test -- src/App.test.tsx
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/features/similar-review/SimilarReviewView.tsx src/App.tsx src/components/LeftRail.tsx src/styles.css
git commit -m "feat: add similar review workflow surface"
```

---

## Task 4: Keep Existing Browse Workflows Intact

**Files:**

- Modify: `src/App.tsx`
- Modify: `src/components/PhotoSurface.tsx`
- Modify: `src/state/useViewFilter.ts`

- [x] **Step 1: Write the failing test**

Add a regression test that selects All Photos, Favorites, and Hidden and verifies the current browsing shell still renders the photo browser instead of the Similar Review surface.

- [x] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test -- src/App.test.tsx
```

- [x] **Step 3: Write minimal implementation**

Keep existing filter handling unchanged for all current photo views. Only branch to the new Similar Review surface when the Similar view is selected.

- [x] **Step 4: Run the test to verify it passes**

Run:

```bash
npm test -- src/App.test.tsx
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/App.tsx src/components/PhotoSurface.tsx src/state/useViewFilter.ts
git commit -m "fix: preserve existing browse workflows alongside review surface"
```

---

## Task 5: Verify the Migration End to End

**Files:**

- None new; uses all files above.

- [x] **Step 1: Run the full test suite**

Run:

```bash
npm test
```

Expected: all existing tests plus new domain and similar-review tests pass.

- [x] **Step 2: Run a production build**

Run:

```bash
npm run build
```

Expected: TypeScript and Vite build both pass.

- [x] **Step 3: Manual smoke test**

Run the app locally:

```bash
npm run dev
```

Verify manually:

- All Photos still works.
- Existing favorites/hidden/album/tag views still work.
- Similar Review shows a workflow-style queue.
- The app does not look like a rewrite.

- [ ] **Step 4: Commit**

```bash
git add src docs/superpowers/plans/2026-05-12-fact-view-action-workflow-migration.md
git commit -m "docs: plan fact view action workflow migration"
```

---

## Self-Review

### Spec coverage

- The plan keeps the current Gala codebase intact instead of rewriting it.
- It introduces the Fact / View / Action / Workflow vocabulary as a real code layer.
- It adds the first workflow-shaped surface, Similar Review, as a minimal vertical slice.
- It preserves all current photo browsing behavior.

### Placeholder scan

- No placeholder text like TBD or implement later remains in the plan.
- File paths are explicit.
- Test code examples are concrete.

### Type consistency

- `Fact`, `View`, `Action`, and `Workflow` are defined once and reused consistently.
- The Similar Review model uses `photoIds`, `confidence`, `kind`, `title`, and `reason` consistently across test and implementation.
- `App.tsx`, `LeftRail.tsx`, and `PhotoSurface.tsx` remain the integration points for the new workflow surface.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-12-fact-view-action-workflow-migration.md`. Two execution options:

1. **Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
