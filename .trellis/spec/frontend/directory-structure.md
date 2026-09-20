# Directory Structure

## Current Layout

Gala uses React 19, TypeScript and Vite for its frontend, with a Tauri/Rust backend under `src-tauri/`.

| Path | Responsibility | Example |
|------|----------------|---------|
| `src/main.tsx`, `src/App.tsx` | Mounting, shell composition and cross-view coordination | App owns library, filter and selection hooks |
| `src/components/` | Shared shell and photo presentation | `PhotoSurface.tsx`, `PhotoViewer.tsx`, `ThemedSelect.tsx` |
| `src/features/<feature>/` | Feature views, models and workflows | `similar-review/similarReviewModel.ts`, `useSimilarReviewWorkflow.tsx` |
| `src/state/` | Reusable React hooks and locale context | `useLibrary.ts`, `useSelection.ts`, `useLocale.tsx` |
| `src/desktop/` | Tauri command/event adapters and browser fallbacks | `library.ts`, `photos.ts`, `webMock.ts` |
| `src/types/` | Shared types and related constants | `photos.ts`, `library.ts`, `appearance.ts` |
| `src/domain/` | Domain models and pure calculations | `photoQuality.ts`, `fact.ts` |
| `src/data/` | Mock data and timeline transformations | `mockLibrary.ts`, `photoTimeline.ts` |
| `src/styles.css` | Shared styling and theme rules | Appearance tokens and controls |
| `src/test/setup.ts` | Vitest cleanup and mock reset | Resets browser mock library after each test |
| `tests/` | Playwright browser tests | `shell.spec.ts`, `theme-semantics.spec.ts` |

`src/types.ts` also exists for the older presentation/mock shapes; it is distinct from the command DTOs in `src/types/photos.ts`. Do not interchange `PhotoItem` and `TimelinePhoto` just because both represent photos.

## Placement and Boundaries

Keep feature-only behavior in its feature directory. Shared UI belongs in `components`; reusable state hooks in `state`; pure calculations in `domain` or `data`. Check existing consumers before creating another abstraction.

Tauri command invocation (`invoke`) and event subscription belong in `desktop`; UI consumes the exported adapters. This does **not** prohibit all Tauri imports in components: `PhotoViewer`, `PhotoCard` and `PhotoGallery` use `convertFileSrc` to display assets. Do not document asset URL conversion as an already-centralized adapter.

Use PascalCase component filenames and `use`-prefixed hook names. Tests use `.test.ts` or `.test.tsx`: most are colocated, while component/domain tests and some feature model tests use `__tests__/`. Follow the surrounding module rather than moving tests only for uniformity.
