# Frontend Development Guidelines

Gala is a React/TypeScript frontend hosted by Vite or Tauri. These guidelines describe the current source layout and behavior-preserving development rules. Read the relevant guide before changing its layer; source files and tests named in each guide are the evidence behind the conventions.

| Guide | Scope | Status |
|-------|-------|--------|
| [Directory Structure](./directory-structure.md) | Module ownership, test layout and command boundaries | Documented from current source |
| [Component Guidelines](./component-guidelines.md) | Component patterns, props and composition | Template; not yet populated |
| [Hook Guidelines](./hook-guidelines.md) | Hook lifecycle and fetching patterns | Template; not yet populated |
| [State Management](./state-management.md) | State ownership, refresh paths and persistence | Documented from current source |
| [Quality Guidelines](./quality-guidelines.md) | Verification commands, cleanup evidence and review rules | Documented from current source |
| [Type Safety](./type-safety.md) | DTO ownership, nullability and runtime validation limits | Documented from current source |

Keep these documents in English and update them when a verified convention changes. Template entries are pending work, not established project rules. Do not copy generic template claims into implementation requirements without checking the code.
