# Type Safety

## Compiler and Type Ownership

`tsconfig.json` enables TypeScript `strict`, `isolatedModules`, `allowJs: false` and `noEmit`. `npm run build` runs the TypeScript build before Vite. Shared library/photo DTOs live in `src/types/`; feature-specific models stay with their feature, and props may remain local to a component.

Use `import type` for type-only imports and explicit return types on desktop adapters. Preserve distinctions between nullable and optional fields: `TimelinePhoto.capturedAt` is `string | null`, while `logicalId` can be absent or null. The older `PhotoItem` in `src/types.ts` is a separate presentation shape, not an alias for `TimelinePhoto`.

## Boundary Validation

`invoke<T>()` supplies a compile-time expectation; it does not validate a native response at runtime. The project has no installed runtime schema library. Catching an invocation failure and returning an empty list is an error fallback, **not** validation of a successful payload. Match Rust command serialization when changing DTOs and add explicit checks where an external or persisted value needs validation.

Existing validation example: `isThemeId` in `src/state/useAppearance.ts` checks a localStorage string against `APPEARANCE_THEMES` before treating it as `AppearanceThemeId`. Prefer a guard like this over `saved as AppearanceThemeId`.

## Narrowing and Nullability

`PhotoFilter` is a discriminated union in `src/types/photos.ts`. Narrow by its `type` before reading variant fields, as in the timeline adapter:

```ts
const sourceId = filter?.type === 'folder' ? filter.sourceId : null
const folderPath = filter?.type === 'folder' ? filter.folderPath : null
```

Do not replace this with an unchecked cast to a folder filter. Model an unavailable thumbnail as `Promise<string | null>` and a timeline as `Promise<TimelinePhoto[]>`; avoid broad `any` results that erase consumer checks. For caught unknown values that must be rethrown as errors, preserve an existing `Error` or explicitly convert it, as source scanning does with `error instanceof Error ? error : new Error(String(error))`.

## Review Checklist

- Reuse the owner type instead of duplicating DTO fields in consumers.
- Keep command argument casing, optional/default arguments and null handling aligned with native commands and adapter tests.
- Do not treat casts or generic type arguments as runtime validation.
- Narrow unions before field access; preserve null/undefined distinctions and error semantics during refactoring.
