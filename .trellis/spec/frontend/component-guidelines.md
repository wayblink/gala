# Component Guidelines

Shared components receive explicit props and keep data loading in `src/desktop/` or `src/state/`. `PhotoCard` renders a `TimelinePhoto`; `PhotoSurface` owns paging, filtering and selection orchestration; feature views such as `ReorganizeView` own feature-local workflow state.

Use semantic controls and accessible labels. Existing examples use `aria-label` for photo surfaces and icon buttons, `ThemedSelect` for themed selects, and real buttons for actions. Do not put Tauri `invoke` calls in reusable UI components.

Prefer small render helpers when a component has repeated visual units. Preserve callback ownership: a child reports intent (`onSelect`, `onOpen`, `onExecute`) and the parent performs mutations.

Tests should assert user-visible behavior with Testing Library roles and labels. Use `findBy*`/`waitFor` when a command or state refresh is asynchronous.

> How components are built in this project.

---

## Overview

<!--
Document your project's component conventions here.

Questions to answer:
- What component patterns do you use?
- How are props defined?
- How do you handle composition?
- What accessibility standards apply?
-->

(To be filled by the team)

---

## Component Structure

<!-- Standard structure of a component file -->

(To be filled by the team)

---

## Props Conventions

<!-- How props should be defined and typed -->

(To be filled by the team)

---

## Styling Patterns

<!-- How styles are applied (CSS modules, styled-components, Tailwind, etc.) -->

(To be filled by the team)

---

## Accessibility

<!-- A11y requirements and patterns -->

(To be filled by the team)

---

## Common Mistakes

<!-- Component-related mistakes your team has made -->

(To be filled by the team)
