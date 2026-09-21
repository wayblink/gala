# Hook Guidelines

Custom hooks use the `use` prefix and return a typed object. `useViewFilter` owns filter/search/display state; `useLibrary` owns library summary and scan-progress subscription; `useBackgroundTasks` owns durable task refresh and mutation helpers.

Keep provider calls in `src/desktop/` and call them from hooks or feature workflows. Effects that subscribe to Tauri events must return cleanup functions and tolerate browser preview mode where no listener exists.

Do not treat hooks as singleton stores. Two calls have separate state unless the hook is backed by an explicit context such as `I18nProvider`. Preserve refresh/version triggers when refactoring async hooks.

Example pattern:

```tsx
useEffect(() => {
  let active = true
  void getLibrarySummary().then((next) => {
    if (active) setSummary(next)
  })
  return () => { active = false }
}, [dataVersion])
```

Tests should cover loading, browser fallback, cleanup and refresh after a mutation.

> How hooks are used in this project.

---

## Overview

<!--
Document your project's hook conventions here.

Questions to answer:
- What custom hooks do you have?
- How do you handle data fetching?
- What are the naming conventions?
- How do you share stateful logic?
-->

(To be filled by the team)

---

## Custom Hook Patterns

<!-- How to create and structure custom hooks -->

(To be filled by the team)

---

## Data Fetching

<!-- How data fetching is handled (React Query, SWR, etc.) -->

(To be filled by the team)

---

## Naming Conventions

<!-- Hook naming rules (use*, etc.) -->

(To be filled by the team)

---

## Common Mistakes

<!-- Hook-related mistakes your team has made -->

(To be filled by the team)
