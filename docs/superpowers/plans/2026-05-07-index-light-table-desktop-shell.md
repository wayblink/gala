# Index Light Table Desktop Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a runnable Vite/React/TypeScript desktop shell prototype for the approved Index Light Table design.

**Architecture:** Start with a focused frontend-only app using static mock data. Keep the app shell split into small presentation components: top bar, left rail, photo surface, context panel, and status primitives. Defer SQLite, scanning, thumbnail generation, and real file access until the visual shell is verified.

**Tech Stack:** Vite, React, TypeScript, CSS modules or plain CSS, Vitest, Testing Library, Playwright, lucide-react.

---

## Scope

This plan implements the approved default desktop shell from:

- `docs/superpowers/specs/2026-05-07-index-light-table-desktop-shell-design.md`

In scope:

- Scaffold a minimal frontend project.
- Render the Index Light Table shell with mock data.
- Implement top bar, left rail, photo surface, context panel, and key status primitives.
- Add unit tests for data grouping and shell content.
- Add Playwright visual smoke tests for desktop and narrow layout behavior.
- Run the app locally and visually inspect the shell.

Out of scope:

- SQLite schema implementation.
- Real source scanning.
- Real thumbnail generation.
- Native desktop packaging.
- Real file picker integration.
- AI-generated views.
- Face recognition, vector search, or map browsing.

## File Structure

Create these files:

- `package.json` - scripts and dependencies.
- `index.html` - Vite entry document.
- `tsconfig.json` - TypeScript project config.
- `tsconfig.node.json` - Vite config TypeScript config.
- `vite.config.ts` - Vite and Vitest config.
- `playwright.config.ts` - browser smoke test config.
- `src/main.tsx` - React entrypoint.
- `src/App.tsx` - app composition only.
- `src/App.test.tsx` - shell rendering tests.
- `src/test/setup.ts` - Vitest DOM matcher setup.
- `src/data/mockLibrary.ts` - static sources, nav, photos, timeline groups, and selected photo.
- `src/data/timeline.ts` - grouping helpers for timeline data.
- `src/data/timeline.test.ts` - timeline grouping tests.
- `src/types.ts` - shared frontend-only types.
- `src/styles.css` - global tokens, layout, component styling, responsive rules.
- `src/components/TopBar.tsx` - app name, current view, search, density, filters, add source.
- `src/components/LeftRail.tsx` - Library, Views, Sources, Explore, scan status.
- `src/components/PhotoSurface.tsx` - timeline groups and photo cells.
- `src/components/ContextPanel.tsx` - view explanation, source safety, selected photo.
- `src/components/StatusDot.tsx` - online/offline/missing status dot.
- `src/components/PhotoCell.tsx` - photo thumbnail placeholder and selected/offline/missing states.
- `src/components/__tests__/PhotoCell.test.tsx` - status and selected-state rendering tests.
- `tests/shell.spec.ts` - Playwright shell smoke tests.

Do not modify existing untracked product docs unless a later task explicitly updates documentation.

## Task 1: Scaffold the Frontend Project

**Files:**

- Create: `package.json`
- Create: `index.html`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/test/setup.ts`
- Create: `src/styles.css`

- [ ] **Step 1: Create project scripts and dependencies**

Create `package.json`:

```json
{
  "name": "gala",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "build": "tsc -b && vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test"
  },
  "dependencies": {
    "lucide-react": "^1.14.0",
    "react": "^19.2.6",
    "react-dom": "^19.2.6"
  },
  "devDependencies": {
    "@playwright/test": "^1.59.1",
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.2",
    "@testing-library/user-event": "^14.6.1",
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^6.0.1",
    "jsdom": "^29.1.1",
    "typescript": "^6.0.3",
    "vite": "^8.0.11",
    "vitest": "^4.1.5"
  }
}
```

- [ ] **Step 2: Create Vite entry files**

Create `index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Memory Table</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

Create minimal `src/App.tsx`:

```tsx
export default function App() {
  return <main className="app-shell">Memory Table</main>
}
```

- [ ] **Step 3: Create TypeScript and Vite config**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["DOM", "DOM.Iterable", "ES2020"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

Create `tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "Node",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts", "playwright.config.ts"]
}
```

Create `vite.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
})
```

Create `src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 4: Create base CSS tokens**

Create `src/styles.css`:

```css
:root {
  --ink-950: #171615;
  --ink-900: #201f1d;
  --ink-850: #24221f;
  --ink-800: #2a2825;
  --ink-700: #38342f;
  --stone-600: #6f695f;
  --stone-500: #8e887e;
  --paper-200: #d8d0c2;
  --paper-100: #eee6d8;
  --amber-dust: #c9974d;
  --lake-blue: #527c8e;
  --archive-red: #9d4b3f;
  --success-moss: #788b5a;
  color: var(--paper-100);
  background: var(--ink-950);
  font-family: "Alegreya Sans", Arial, sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
  background: var(--ink-950);
}

button,
input {
  font: inherit;
}

.app-shell {
  min-height: 100vh;
  background: var(--ink-950);
}
```

- [ ] **Step 5: Install dependencies**

Run:

```bash
npm install
```

Expected: `package-lock.json` is created and install exits successfully.

- [ ] **Step 6: Run initial build**

Run:

```bash
npm run build
```

Expected: TypeScript and Vite build pass.

- [ ] **Step 7: Commit scaffold**

```bash
git add package.json package-lock.json index.html tsconfig.json tsconfig.node.json vite.config.ts src/main.tsx src/App.tsx src/test/setup.ts src/styles.css
git commit -m "feat: scaffold memory table frontend"
```

## Task 2: Add Frontend Data Model and Timeline Grouping

**Files:**

- Create: `src/types.ts`
- Create: `src/data/mockLibrary.ts`
- Create: `src/data/timeline.ts`
- Create: `src/data/timeline.test.ts`

- [ ] **Step 1: Write failing timeline grouping tests**

Create `src/data/timeline.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { groupPhotosByTimeline } from './timeline'
import type { PhotoItem } from '../types'

const photo = (id: string, capturedAt: string | null): PhotoItem => ({
  id,
  fileName: `${id}.RAF`,
  sourceName: 'X100V Drive',
  sourceStatus: 'online',
  status: 'indexed',
  capturedAt,
  importedAt: '2026-05-07T10:00:00Z',
  camera: 'X100V',
  lens: '23mm f/2',
  dimensions: '6240 x 4160',
  color: '#527c8e',
  aspectRatio: '1 / 1',
  relatedViews: ['Kyoto Nights'],
})

describe('groupPhotosByTimeline', () => {
  it('groups photos by year and month label in descending date order', () => {
    const groups = groupPhotosByTimeline([
      photo('older', '2025-10-04T12:00:00Z'),
      photo('newer', '2026-05-07T12:00:00Z'),
    ])

    expect(groups.map((group) => group.year)).toEqual(['2026', '2025'])
    expect(groups[0].monthLabel).toBe('May')
    expect(groups[0].photos[0].id).toBe('newer')
  })

  it('uses imported date fallback for photos without captured date', () => {
    const groups = groupPhotosByTimeline([photo('fallback', null)])

    expect(groups[0].year).toBe('2026')
    expect(groups[0].dateBasis).toBe('imported')
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm test -- src/data/timeline.test.ts
```

Expected: FAIL because `src/data/timeline.ts` and types do not exist.

- [ ] **Step 3: Add shared types**

Create `src/types.ts`:

```ts
export type SourceStatus = 'online' | 'offline' | 'missing'
export type PhotoStatus = 'indexed' | 'missing' | 'offline'

export type NavItem = {
  label: string
  count?: string
  active?: boolean
}

export type SourceItem = {
  name: string
  status: SourceStatus
}

export type PhotoItem = {
  id: string
  fileName: string
  sourceName: string
  sourceStatus: SourceStatus
  status: PhotoStatus
  capturedAt: string | null
  importedAt: string
  camera: string
  lens: string
  dimensions: string
  color: string
  aspectRatio: string
  relatedViews: string[]
}

export type TimelineGroup = {
  key: string
  year: string
  monthLabel: string
  count: number
  dateBasis: 'captured' | 'imported'
  photos: PhotoItem[]
}
```

- [ ] **Step 4: Implement grouping helper**

Create `src/data/timeline.ts`:

```ts
import type { PhotoItem, TimelineGroup } from '../types'

const monthFormatter = new Intl.DateTimeFormat('en', { month: 'long' })

function getTimelineDate(photo: PhotoItem) {
  return new Date(photo.capturedAt ?? photo.importedAt)
}

export function groupPhotosByTimeline(photos: PhotoItem[]): TimelineGroup[] {
  const sorted = [...photos].sort(
    (a, b) => getTimelineDate(b).getTime() - getTimelineDate(a).getTime(),
  )
  const groups = new Map<string, TimelineGroup>()

  for (const photo of sorted) {
    const date = getTimelineDate(photo)
    const year = String(date.getUTCFullYear())
    const month = String(date.getUTCMonth() + 1).padStart(2, '0')
    const key = `${year}-${month}`
    const existing = groups.get(key)

    if (existing) {
      existing.photos.push(photo)
      existing.count += 1
      existing.dateBasis =
        existing.dateBasis === 'imported' || !photo.capturedAt ? 'imported' : 'captured'
      continue
    }

    groups.set(key, {
      key,
      year,
      monthLabel: monthFormatter.format(date),
      count: 1,
      dateBasis: photo.capturedAt ? 'captured' : 'imported',
      photos: [photo],
    })
  }

  return Array.from(groups.values())
}
```

- [ ] **Step 5: Add mock library data**

Create `src/data/mockLibrary.ts` with enough data to exercise all shell states:

```ts
import { groupPhotosByTimeline } from './timeline'
import type { NavItem, PhotoItem, SourceItem } from '../types'

export const libraryItems: NavItem[] = [
  { label: 'All Photos', count: '18k', active: true },
  { label: 'Recently Added', count: '412' },
  { label: 'Favorites', count: '698' },
  { label: 'Hidden' },
]

export const viewItems: NavItem[] = [
  { label: 'Timeline' },
  { label: 'Places' },
  { label: 'People' },
  { label: 'Memories' },
  { label: 'Similar' },
  { label: 'Custom Views' },
]

export const exploreItems: NavItem[] = [
  { label: 'Same Day' },
  { label: 'Forgotten Photos' },
  { label: 'Similar Light' },
  { label: 'Trips' },
]

export const sources: SourceItem[] = [
  { name: 'Mac Photos', status: 'online' },
  { name: 'X100V Drive', status: 'online' },
  { name: 'Archive SSD', status: 'offline' },
  { name: 'Old Export', status: 'missing' },
]

export const photos: PhotoItem[] = [
  {
    id: 'p-001',
    fileName: 'DSCF4281.RAF',
    sourceName: 'X100V Drive',
    sourceStatus: 'online',
    status: 'indexed',
    capturedAt: '2026-05-07T08:30:00Z',
    importedAt: '2026-05-07T10:00:00Z',
    camera: 'X100V',
    lens: '23mm f/2',
    dimensions: '6240 x 4160',
    color: '#c9974d',
    aspectRatio: '1 / 1',
    relatedViews: ['Kyoto Nights', 'Similar Light'],
  },
  {
    id: 'p-002',
    fileName: 'IMG_2044.HEIC',
    sourceName: 'Mac Photos',
    sourceStatus: 'online',
    status: 'indexed',
    capturedAt: '2026-05-07T06:00:00Z',
    importedAt: '2026-05-07T10:00:00Z',
    camera: 'iPhone 16 Pro',
    lens: '24mm',
    dimensions: '4032 x 3024',
    color: '#527c8e',
    aspectRatio: '1 / 1.25',
    relatedViews: ['Lake Morning'],
  },
  {
    id: 'p-003',
    fileName: 'ARCHIVE_1182.JPG',
    sourceName: 'Archive SSD',
    sourceStatus: 'offline',
    status: 'offline',
    capturedAt: '2025-10-04T13:00:00Z',
    importedAt: '2026-05-07T10:00:00Z',
    camera: 'GR III',
    lens: '18.3mm',
    dimensions: '6000 x 4000',
    color: '#8e887e',
    aspectRatio: '1.2 / 1',
    relatedViews: ['Japan 2025'],
  },
  {
    id: 'p-004',
    fileName: 'MISSING_0042.JPG',
    sourceName: 'Old Export',
    sourceStatus: 'missing',
    status: 'missing',
    capturedAt: null,
    importedAt: '2025-10-04T09:00:00Z',
    camera: 'Unknown',
    lens: 'Unknown',
    dimensions: '3000 x 2000',
    color: '#9d4b3f',
    aspectRatio: '1 / 1',
    relatedViews: ['Needs Review'],
  },
]

export const timelineGroups = groupPhotosByTimeline(photos)
export const selectedPhoto = photos[0]
```

- [ ] **Step 6: Run tests**

Run:

```bash
npm test -- src/data/timeline.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit data model**

```bash
git add src/types.ts src/data/mockLibrary.ts src/data/timeline.ts src/data/timeline.test.ts
git commit -m "feat: add mock photo timeline model"
```

## Task 3: Build Shell Components

**Files:**

- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Create: `src/components/StatusDot.tsx`
- Create: `src/components/TopBar.tsx`
- Create: `src/components/LeftRail.tsx`
- Create: `src/components/PhotoCell.tsx`
- Create: `src/components/PhotoSurface.tsx`
- Create: `src/components/ContextPanel.tsx`
- Create: `src/components/__tests__/PhotoCell.test.tsx`
- Create: `src/App.test.tsx`

- [ ] **Step 1: Write failing component tests**

Create `src/components/__tests__/PhotoCell.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PhotoCell } from '../PhotoCell'
import { photos } from '../../data/mockLibrary'

describe('PhotoCell', () => {
  it('marks selected cells accessibly', () => {
    render(<PhotoCell photo={photos[0]} selected />)

    expect(screen.getByRole('button', { name: /selected photo dscf4281/i })).toBeInTheDocument()
  })

  it('shows missing and offline status labels', () => {
    render(<PhotoCell photo={photos[2]} />)
    expect(screen.getByText('Offline')).toBeInTheDocument()

    render(<PhotoCell photo={photos[3]} />)
    expect(screen.getByText('Missing')).toBeInTheDocument()
  })
})
```

Create `src/App.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders the default Index Light Table shell', () => {
    render(<App />)

    expect(screen.getByText('Memory Table')).toBeInTheDocument()
    expect(screen.getByText('Timeline: All Photos')).toBeInTheDocument()
    expect(screen.getByText(/18,426 photos/)).toBeInTheDocument()
    expect(screen.getByText('View Context')).toBeInTheDocument()
    expect(screen.getByText('Source Safety')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm test -- src/App.test.tsx src/components/__tests__/PhotoCell.test.tsx
```

Expected: FAIL because shell components do not exist.

- [ ] **Step 3: Implement `StatusDot`**

Create `src/components/StatusDot.tsx`:

```tsx
import type { SourceStatus } from '../types'

type StatusDotProps = {
  status: SourceStatus
}

export function StatusDot({ status }: StatusDotProps) {
  return <span className={`status-dot status-dot--${status}`} aria-hidden="true" />
}
```

- [ ] **Step 4: Implement `PhotoCell`**

Create `src/components/PhotoCell.tsx`:

```tsx
import type { PhotoItem } from '../types'

type PhotoCellProps = {
  photo: PhotoItem
  selected?: boolean
}

export function PhotoCell({ photo, selected = false }: PhotoCellProps) {
  const unavailableLabel =
    photo.status === 'missing' ? 'Missing' : photo.status === 'offline' ? 'Offline' : null

  return (
    <button
      className={`photo-cell${selected ? ' photo-cell--selected' : ''} ${
        unavailableLabel ? 'photo-cell--unavailable' : ''
      }`}
      style={{ backgroundColor: photo.color, aspectRatio: photo.aspectRatio }}
      aria-label={`${selected ? 'Selected photo ' : 'Photo '}${photo.fileName}`}
    >
      {unavailableLabel ? <span className="photo-cell__badge">{unavailableLabel}</span> : null}
    </button>
  )
}
```

- [ ] **Step 5: Implement `TopBar`**

Create `src/components/TopBar.tsx`:

```tsx
import { Filter, Grid3X3, Plus, Search } from 'lucide-react'

export function TopBar() {
  return (
    <header className="top-bar">
      <div className="top-bar__brand">Memory Table</div>
      <div className="top-bar__view">
        <h1>Timeline: All Photos</h1>
        <p>18,426 photos · 2009-2026 · 3 sources online</p>
      </div>
      <div className="top-bar__actions">
        <label className="search-field">
          <Search size={15} aria-hidden="true" />
          <span className="sr-only">Search photos</span>
          <input placeholder="Search" />
        </label>
        <button className="icon-button" aria-label="Change density">
          <Grid3X3 size={16} />
        </button>
        <button className="icon-button" aria-label="Open filters">
          <Filter size={16} />
        </button>
        <button className="primary-button">
          <Plus size={16} />
          Add Source
        </button>
      </div>
    </header>
  )
}
```

- [ ] **Step 6: Implement `LeftRail`**

Create `src/components/LeftRail.tsx`:

```tsx
import { exploreItems, libraryItems, sources, viewItems } from '../data/mockLibrary'
import { StatusDot } from './StatusDot'

function NavGroup({ title, items }: { title: string; items: typeof libraryItems }) {
  return (
    <section className="rail-group">
      <h2>{title}</h2>
      <div className="rail-list">
        {items.map((item) => (
          <a className={`rail-item${item.active ? ' rail-item--active' : ''}`} href="#" key={item.label}>
            <span>{item.label}</span>
            {item.count ? <span className="rail-item__count">{item.count}</span> : null}
          </a>
        ))}
      </div>
    </section>
  )
}

export function LeftRail() {
  return (
    <aside className="left-rail" aria-label="Photo navigation">
      <NavGroup title="Library" items={libraryItems} />
      <NavGroup title="Views" items={viewItems} />
      <section className="rail-group">
        <h2>Sources</h2>
        <div className="rail-list">
          {sources.map((source) => (
            <a className={`rail-item rail-item--source rail-item--${source.status}`} href="#" key={source.name}>
              <StatusDot status={source.status} />
              <span>{source.name}</span>
            </a>
          ))}
        </div>
      </section>
      <NavGroup title="Explore" items={exploreItems} />
      <section className="scan-card" aria-label="Scan status">
        <span>Scan Status</span>
        <div className="scan-card__bar">
          <span />
        </div>
        <strong>8,912 indexed</strong>
      </section>
    </aside>
  )
}
```

- [ ] **Step 7: Implement `PhotoSurface`**

Create `src/components/PhotoSurface.tsx`:

```tsx
import { selectedPhoto, timelineGroups } from '../data/mockLibrary'
import { PhotoCell } from './PhotoCell'

export function PhotoSurface() {
  return (
    <main className="photo-surface" aria-label="Timeline photo surface">
      {timelineGroups.map((group) => (
        <section className="timeline-group" key={group.key}>
          <div className="timeline-group__header">
            <div>
              <h2>{group.year}</h2>
              <p>
                {group.monthLabel} · {group.count} photos
                {group.dateBasis === 'imported' ? ' · includes imported-date fallback' : ''}
              </p>
            </div>
            <span>Density: Standard</span>
          </div>
          <div className="photo-grid">
            {group.photos.map((photo) => (
              <PhotoCell key={photo.id} photo={photo} selected={photo.id === selectedPhoto.id} />
            ))}
          </div>
        </section>
      ))}
    </main>
  )
}
```

- [ ] **Step 8: Implement `ContextPanel`**

Create `src/components/ContextPanel.tsx`:

```tsx
import { selectedPhoto } from '../data/mockLibrary'

export function ContextPanel() {
  return (
    <aside className="context-panel" aria-label="View context">
      <section>
        <p className="eyebrow">View Context</p>
        <h2>Timeline</h2>
        <p className="mono-muted">Built-in strategy</p>
      </section>
      <section>
        <p className="eyebrow">Why Visible</p>
        <p>
          Photos are grouped by captured date. Items without capture dates use import time and remain marked in the grid.
        </p>
      </section>
      <section>
        <p className="eyebrow">Source Safety</p>
        <ul className="safety-list">
          <li className="is-online">3 sources online</li>
          <li>1 source offline</li>
          <li className="is-missing">1 missing source</li>
        </ul>
      </section>
      <section>
        <p className="eyebrow">Selected Photo</p>
        <h3>{selectedPhoto.fileName}</h3>
        <p className="mono-muted">Oct 4, 2025 · {selectedPhoto.camera}</p>
        <dl className="metadata-list">
          <div>
            <dt>Source</dt>
            <dd>{selectedPhoto.sourceName}</dd>
          </div>
          <div>
            <dt>Lens</dt>
            <dd>{selectedPhoto.lens}</dd>
          </div>
          <div>
            <dt>Size</dt>
            <dd>{selectedPhoto.dimensions}</dd>
          </div>
        </dl>
      </section>
      <div className="context-panel__actions">
        <button className="primary-button">Save View</button>
        <button className="secondary-button">Explain</button>
      </div>
    </aside>
  )
}
```

- [ ] **Step 9: Compose `App`**

Modify `src/App.tsx`:

```tsx
import { ContextPanel } from './components/ContextPanel'
import { LeftRail } from './components/LeftRail'
import { PhotoSurface } from './components/PhotoSurface'
import { TopBar } from './components/TopBar'

export default function App() {
  return (
    <div className="app-shell">
      <TopBar />
      <div className="workspace-grid">
        <LeftRail />
        <PhotoSurface />
        <ContextPanel />
      </div>
    </div>
  )
}
```

- [ ] **Step 10: Add shell CSS**

Extend `src/styles.css` with the app shell styles. Include these required selectors:

```css
.top-bar {
  height: 56px;
  display: grid;
  grid-template-columns: 184px minmax(280px, 1fr) auto;
  align-items: center;
  gap: 20px;
  padding: 0 18px;
  background: var(--ink-900);
  border-bottom: 1px solid var(--ink-700);
}

.top-bar__brand,
.top-bar h1,
.timeline-group h2,
.context-panel h2,
.context-panel h3 {
  font-family: Georgia, "Times New Roman", serif;
}

.top-bar h1 {
  margin: 0;
  font-size: 23px;
  line-height: 24px;
  font-weight: 600;
}

.top-bar p,
.mono-muted,
.rail-item__count,
.timeline-group__header span,
.timeline-group__header p {
  font-family: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
}

.workspace-grid {
  min-height: calc(100vh - 56px);
  display: grid;
  grid-template-columns: minmax(180px, 200px) minmax(0, 1fr) minmax(220px, 260px);
}

.left-rail {
  display: grid;
  align-content: start;
  gap: 22px;
  padding: 18px 14px;
  background: var(--ink-900);
  border-right: 1px solid var(--ink-700);
}

.photo-surface {
  min-width: 0;
  padding: 22px;
  overflow: auto;
  background: var(--ink-850);
}

.context-panel {
  display: grid;
  align-content: start;
  gap: 18px;
  padding: 20px 16px;
  background: var(--ink-800);
  border-left: 1px solid var(--ink-700);
}

.photo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(78px, 1fr));
  gap: 8px;
  align-items: start;
}

.photo-cell {
  position: relative;
  min-height: 72px;
  border: 0;
  border-radius: 4px;
  cursor: pointer;
}

.photo-cell--selected {
  box-shadow: 0 0 0 2px var(--amber-dust), inset 0 0 0 3px var(--ink-850);
}

@media (max-width: 980px) {
  .workspace-grid {
    grid-template-columns: 64px minmax(0, 1fr);
  }

  .context-panel {
    grid-column: 1 / -1;
    border-left: 0;
    border-top: 1px solid var(--ink-700);
  }

  .rail-group h2,
  .rail-item span:not(.status-dot),
  .scan-card {
    display: none;
  }
}
```

Complete the remaining styling for buttons, rail items, status dots, search, badges, and metadata list in the same file.

- [ ] **Step 11: Run tests**

Run:

```bash
npm test -- src/App.test.tsx src/components/__tests__/PhotoCell.test.tsx
```

Expected: PASS.

- [ ] **Step 12: Run build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 13: Commit shell components**

```bash
git add src/App.tsx src/styles.css src/components src/App.test.tsx
git commit -m "feat: build index light table shell"
```

## Task 4: Add Playwright Visual Smoke Tests

**Files:**

- Create: `playwright.config.ts`
- Create: `tests/shell.spec.ts`

- [ ] **Step 1: Create Playwright config**

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  webServer: {
    command: 'npm run dev -- --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 960 } },
    },
    {
      name: 'narrow',
      use: { ...devices['Desktop Chrome'], viewport: { width: 900, height: 960 } },
    },
  ],
})
```

- [ ] **Step 2: Write smoke tests**

Create `tests/shell.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

test('desktop shell keeps photos as largest visual surface', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Timeline: All Photos' })).toBeVisible()
  await expect(page.getByLabel('Timeline photo surface')).toBeVisible()
  await expect(page.getByLabel('Photo navigation')).toBeVisible()
  await expect(page.getByLabel('View context')).toBeVisible()

  const surfaceBox = await page.getByLabel('Timeline photo surface').boundingBox()
  const railBox = await page.getByLabel('Photo navigation').boundingBox()
  const contextBox = await page.getByLabel('View context').boundingBox()

  expect(surfaceBox?.width ?? 0).toBeGreaterThan((railBox?.width ?? 0) + (contextBox?.width ?? 0))
})

test('narrow shell preserves photo surface and moves context below', async ({ page }) => {
  await page.goto('/')

  const surfaceBox = await page.getByLabel('Timeline photo surface').boundingBox()
  const contextBox = await page.getByLabel('View context').boundingBox()

  expect(surfaceBox?.width ?? 0).toBeGreaterThan(500)
  expect((contextBox?.y ?? 0)).toBeGreaterThan(surfaceBox?.y ?? 0)
})
```

- [ ] **Step 3: Run Playwright install if needed**

Run:

```bash
npx playwright install chromium
```

Expected: Chromium browser is installed, or command reports it is already available.

- [ ] **Step 4: Run e2e tests**

Run:

```bash
npm run e2e
```

Expected: both desktop and narrow tests pass.

- [ ] **Step 5: Commit Playwright tests**

```bash
git add playwright.config.ts tests/shell.spec.ts
git commit -m "test: add shell layout smoke tests"
```

## Task 5: Visual QA and Documentation Update

**Files:**

- Modify: `README.md`
- Optionally create: `docs/frontend-shell.md`

- [ ] **Step 1: Start the dev server**

Run:

```bash
npm run dev -- --port 5173
```

Expected: Vite serves the app at `http://127.0.0.1:5173`.

- [ ] **Step 2: Inspect desktop layout in browser**

Open `http://127.0.0.1:5173`.

Check:

- Photos are the largest visual mass.
- Top bar is 56px and keeps current view visible.
- Left rail groups Library, Views, Sources, Explore.
- Context panel shows View Context, Why Visible, Source Safety, Selected Photo.
- Offline and missing states are visually distinct.
- Text does not overlap or clip at 1440x960.

- [ ] **Step 3: Inspect narrow layout in browser**

Set viewport to about `900x960`.

Check:

- Left rail collapses instead of squeezing photo cells too far.
- Context panel moves below or becomes non-obstructive.
- Photo surface remains readable.
- Top bar controls do not overlap.

- [ ] **Step 4: Update README with frontend commands**

Append or update a short development section in `README.md`:

````md
## Frontend Prototype

The Index Light Table shell is a Vite/React prototype for the V0 desktop surface.

```bash
npm install
npm run dev
npm test
npm run build
npm run e2e
```

The prototype uses static mock data. It does not scan local files or modify original photos.
````

Because `README.md` is currently untracked, confirm whether to include the full README in the commit or leave this documentation update for a baseline docs commit.

- [ ] **Step 5: Run final verification**

Run:

```bash
npm test
npm run build
npm run e2e
```

Expected: all checks pass.

- [ ] **Step 6: Commit QA/docs changes**

If `README.md` is approved for inclusion:

```bash
git add README.md
git commit -m "docs: add frontend prototype commands"
```

If `README.md` should remain untouched:

```bash
git status --short
```

Expected: no source changes remain except intentionally untracked project docs and `.superpowers/`.

## Implementation Notes

- Keep this first shell frontend-only. Do not introduce backend or desktop-native APIs.
- Use mock data colors as thumbnail placeholders until real assets exist.
- Do not use gradient backgrounds, decorative blobs, glassmorphism, or oversized SaaS cards.
- Do not hide offline or missing states behind settings.
- Use lucide icons for search, density, filters, and add-source affordances.
- Avoid nested cards. Persistent regions can be panels; individual photo cells are not cards.
- Preserve `.superpowers/` as local brainstorming output and do not commit it.

## Verification Checklist

Before calling implementation complete:

- `npm test` passes.
- `npm run build` passes.
- `npm run e2e` passes.
- Browser inspection at desktop viewport passes.
- Browser inspection at narrow viewport passes.
- Offline source and missing photo states are distinct in the UI.
- Photos remain the largest visual mass on desktop.
- No unrelated untracked docs are committed accidentally.

## Plan Review Note

The writing-plans workflow normally asks for a `plan-document-reviewer` subagent review. This session has a higher-priority tool constraint that subagents may only be used when the user explicitly asks for subagents or parallel agent work, so no reviewer subagent was dispatched while writing this plan.

Manual review performed:

- Checked the plan against the approved design spec.
- Confirmed dependency versions against npm on 2026-05-07.
- Fixed the Vitest setup so Testing Library DOM matchers are available.
- Kept implementation scope frontend-only and excluded scanner/database work.
