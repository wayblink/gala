# State Management

## Ownership

Gala uses React state, effects, callbacks and context; `package.json` does not include a separate state or server-cache library. `App.tsx` instantiates shared hooks and passes values/actions to views. A hook under `src/state/` is reusable code, **not a singleton**: calling it again creates another state instance.

| State | Current owner | Contract |
|-------|---------------|----------|
| Library summary, sources, scan progress | `useLibrary` | Commands go through desktop adapters; refresh after source mutations |
| Albums and tags | `useAlbums`, `useTags` | Fetch on mount and refresh after mutations |
| Filter, search, display mode, data version | `useViewFilter` | `null` means All Photos; changing the filter clears search |
| Selected photo and IDs | `useSelection` | Copy `Set` values; clearing or leaving selection mode clears IDs and scope |
| Language | `I18nProvider` in `useLocale.tsx` | Context provides translation state to descendants |
| Appearance and photo-quality preference | `useAppearance`, `usePhotoQuality` | Persist through dedicated localStorage keys |
| Similar-review workflow | Feature-local `useSimilarReviewWorkflow` | Own photos, embeddings, busy flags and viewer state |

Keep transient UI state in its component. Lift state to the nearest shared owner when multiple views need the same lifecycle; placing a hook in `state/` alone does not share its data.

## Refresh and Derived Values

`useLibrary.refreshAll()` refreshes summary, source folders and filter options together. `useAlbums` performs a mutation and then refreshes the list. `useViewFilter.bumpDataVersion()` is an explicit refresh signal for consumers. Preserve these invalidation paths when moving mutations; do not introduce a second independently maintained source list or count cache.

Compute projections from their owner data. For example, `useSimilarReviewWorkflow` derives cards and photo lookup maps with `useMemo`. Selection updates clone sets before mutating, as in `useSelection.toggleSelected`:

```ts
const next = new Set(prev)
if (next.has(photoId)) next.delete(photoId)
else next.add(photoId)
```

## Persistence and Effects

Preference keys include `gala:appearance-theme` and `gala:photo-quality-enabled`. Preserve existing keys and defaults when reorganizing code. `useAppearance` validates stored IDs against `APPEARANCE_THEMES`; preference readers account for unavailable browser/storage APIs. Treat stored strings as untrusted, not as typed values.

Effects that subscribe to events or start asynchronous work need cleanup and stale-result handling. `useLibrary` tracks mounted state for scan events and stores the unsubscribe callback; review late subscription resolution when changing its lifecycle rather than assuming that a mounted flag releases the listener. Keep command execution and native/browser branching in `src/desktop/`.
