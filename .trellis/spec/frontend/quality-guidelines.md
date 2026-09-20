# Quality Guidelines

## Verification Commands

The source of truth is `package.json` and the test configuration files.

| Command | What it verifies |
|---------|------------------|
| `npm run test` | Vitest in jsdom; includes `src/**/*.test.{ts,tsx}` |
| `npm run build` | `tsc -b` followed by Vite production build |
| `npm run e2e` | Playwright browser behavior at desktop and narrow viewports |
| `npm run quality` | Tests, build and browser tests in sequence |

There is currently no lint script or configured coverage threshold. Do not report either as passed without adding and running the corresponding tooling. For Rust changes, also run `cargo check --manifest-path src-tauri/Cargo.toml` and relevant Rust tests; browser tests do not exercise native commands.

## Testing Changed Behavior

Before changing a shared boundary, specify its expected behavior in focused tests where practical. For desktop adapters, cover command names/arguments, Tauri rejection behavior, and browser fallback without calling `invoke`. Preserve deliberate differences between returning `null`/`[]` and propagating an error; a generic wrapper must not silently normalize them.

Use existing examples in `src/desktop/photos.test.ts`, `src/desktop/library.test.ts`, `src/state/useSelection.test.tsx` and `src/components/__tests__/PhotoSurface.test.tsx`. Vitest cleanup in `src/test/setup.ts` resets React, the mutable browser library and `window.__TAURI_INTERNALS__`; keep tests independent of previous mock mutations.

Run focused tests first, then the full frontend tests and build. UI changes also need relevant browser checks. Dropdowns and sliders must match the active theme, including open menus, tracks, thumbs and interaction states; inspect affected pages across themes rather than relying only on jsdom assertions. Existing `ThemedSelect.tsx` and `tests/theme-semantics.spec.ts` provide starting points.

## Review Rules

- Verify dead-code candidates with reference searches **and** compilation/tests or entry-point inspection. Public exports, command registration and test-only uses need explicit consideration.
- Inspect the existing working-tree diff before editing and compare against that baseline afterward; never revert unrelated changes as cleanup.
- Keep command invocation inside `src/desktop/`. Existing UI imports of `convertFileSrc` are asset conversion, not command invocation.
- Use explicit adapter return types and preserve browser fallbacks. Do not add broad `any` DTOs or routine logs containing photo paths/payloads.
- Test user-observable behavior and failure paths, not source formatting or helper implementation details.
- Record deferred architectural changes separately from completed cleanup; passing tests alone is not evidence that an unreferenced public interface can be removed.
