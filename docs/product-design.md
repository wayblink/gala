# Product Design: Non-Destructive Photo View Engine

## Summary

This desktop application helps photography enthusiasts browse, rediscover, and organize large local photo libraries through generated views. It does not change the original folder structure. Instead, it builds an index and generates multiple ways to see the same photos.

The product should feel less like a file manager and more like a memory light table: calm, visual, and personal, while still precise enough for serious photo browsing.

## Target Users

Primary users are photography enthusiasts with large local libraries from phones, cameras, drones, external drives, and old folders.

They want:

- Better ways to revisit forgotten photos.
- Fast browsing across many years of images.
- Views based on time, place, people, camera, color, similarity, and memory.
- Confidence that the app will not move, rename, delete, or rewrite originals.

They do not necessarily need:

- Professional RAW editing.
- Multi-user studio workflows.
- Cloud-first sync.
- Heavy digital asset management.

## Product Positioning

The product is a view engine above local photos.

It is not:

- A Lightroom replacement.
- A cloud album.
- A Finder or Explorer skin.
- A destructive photo organizer.

It is:

- A local-first photo browser.
- A non-destructive indexer.
- A strategy-driven view generator.
- A rediscovery surface for personal photo history.

## Design Principles

### 1. Non-Destructive by Default

The app never changes the physical location of original photos in V0.

Allowed:

- Read image files.
- Generate thumbnails and previews in the app cache.
- Store metadata and references in the local index.
- Save views as references to photo IDs.

Not allowed:

- Move originals.
- Rename originals.
- Delete originals.
- Rewrite original metadata.

### 2. Views Over Folders

Folders are sources, not the primary product metaphor.

A user may add a folder from disk, but the main product experience should be built around views:

- Timeline.
- Places.
- People.
- Memories.
- Similar photos.
- Custom views.

### 3. Every Automatic View Must Explain Itself

A generated view should answer: "Why am I seeing these photos?"

Example:

```text
This view contains 42 photos.
They were mostly captured between 2023-10-02 and 2023-10-06.
The location clusters around Kyoto.
18 photos contain night scenes, and 12 were previously favorited.
```

This keeps AI and rule-generated views trustworthy.

### 4. AI Suggests, Users Stay in Control

AI can generate labels, memories, groupings, explanations, and view suggestions.

AI must not silently:

- Delete photos.
- Move files.
- Override user-created views.
- Treat low-confidence inference as fact.

### 5. The Photo Surface Is the Product

The interface should prioritize viewing photos, not managing a database. Controls should support browsing, filtering, saving, and understanding views without competing with the images.

## Core Concepts

```text
Photo Source
  -> Photo Index
    -> View Strategy
      -> View Instance
        -> Photo Surface
```

### Photo Source

A location that contains original image files.

Examples:

- Local folder.
- External drive.
- Network volume.
- Imported phone export folder.

### Photo Index

A local structured index of photo references and derived metadata.

It stores:

- File path references.
- File fingerprints.
- EXIF metadata.
- Thumbnail references.
- Places.
- People.
- Tags.
- AI or rule-generated signals.

### View Strategy

A rule, query, or model-driven process that builds a view from the index.

Examples:

- Timeline strategy.
- Place strategy.
- Camera strategy.
- Memory strategy.
- Similarity strategy.
- Manual strategy.

### View Instance

A specific generated result from a strategy.

Examples:

- "Japan, October 2024".
- "Same day in past years".
- "Summer evenings".
- "Photos from X100V".
- "Similar light".

### Photo Surface

The UI where a user browses and acts on photos and views.

It supports:

- Timeline browsing.
- Contact sheet scanning.
- Focus viewing.
- View explanations.
- Saving generated views.
- Jumping between related views.

## V0 Information Architecture

```text
App
├── Library
│   ├── All Photos
│   ├── Recently Added
│   ├── Favorites
│   └── Hidden
│
├── Views
│   ├── Timeline
│   ├── Places
│   ├── People
│   ├── Memories
│   ├── Similar
│   └── Custom Views
│
├── Sources
│   ├── Local Folders
│   ├── External Drives
│   └── Offline Sources
│
├── Explore
│   ├── Same Day in Past Years
│   ├── Forgotten Photos
│   ├── Similar Light
│   └── Trips
│
└── Settings
    ├── Sources
    ├── Indexing
    ├── AI Strategies
    └── Privacy
```

## Main Desktop Layout

```text
┌────────────────────────────────────────────────────────────┐
│ Top Bar: current view / search / import / filters / density │
├───────────────┬──────────────────────────────┬─────────────┤
│ Left Rail     │ Photo Surface                │ Context     │
│               │                              │ Panel       │
│ Library       │ Timeline / Grid / Moment     │             │
│ Views         │ Contact Sheet / Map / Focus  │ EXIF        │
│ Sources       │                              │ View Reason │
│ Explore       │                              │ Actions     │
└───────────────┴──────────────────────────────┴─────────────┘
```

### Left Rail

The left rail is a view library, not just a folder tree.

Primary sections:

- Library.
- Views.
- Sources.
- Explore.
- Settings.

### Photo Surface

The center area is the main product surface.

V0 surface modes:

- Timeline view.
- Contact sheet view.
- Focus viewer.
- Saved view surface.

Future surface modes:

- Map table.
- Moment clusters.
- Similar light exploration.
- Compare view.

### Context Panel

The right panel explains the current photo or view.

For a photo:

- EXIF.
- Path.
- Date.
- Location.
- Camera.
- Tags.
- Related views.

For a generated view:

- Strategy name.
- Explanation.
- Confidence.
- Groups.
- Save/refresh actions.

## V0 User Flows

### Add First Source

```text
Open app
  -> Add local folder
    -> App explains non-destructive indexing
      -> Scan starts
        -> Timeline appears
```

### Browse Timeline

```text
Open Library
  -> Timeline
    -> Year/month/day groups
      -> Open photo
        -> Move through filmstrip
```

### Save a Generated View

```text
Open Memories
  -> App generates view
    -> User reads explanation
      -> User saves view
        -> View appears under Custom Views
```

### Handle Offline Drive

```text
External drive indexed
  -> Drive disconnected
    -> Source marked offline
      -> Thumbnails remain visible
        -> Original unavailable state shown in focus viewer
```

## V0 View Types

### Timeline

Groups photos by captured date.

Requirements:

- Year/month/day grouping.
- Missing date fallback.
- Density switch.
- Fast scroll for large libraries.

### Places

Groups photos by GPS and inferred places.

Requirements:

- Store GPS metadata.
- Cluster nearby photos.
- Allow unknown place state.
- Avoid map-first dependency in V0.

### People

V0 should reserve the IA and schema, but automatic face recognition is not required.

Requirements:

- Manual person labels allowed.
- Future face clustering can attach to the same model.

### Memories

Generated views similar in spirit to iPhone memories.

V0 can use simple signals:

- Time range.
- Location cluster.
- Favorites.
- Tags.
- Similar colors.
- Camera session.

### Similar

Groups visually or contextually similar photos.

V0 can start with lightweight signals:

- Captured near the same time.
- Same dimensions or aspect ratio.
- Similar dominant colors.
- Same camera/lens.

Future versions can add embeddings.

### Custom Views

Saved views created by users.

Types:

- Manual photo collection.
- Saved filter.
- Saved generated view.

## Visual Direction

Working name: **Memory Table**.

The product should feel like a quiet light table for memory, not a database.

Recommended system direction:

- Warm dark surfaces.
- Matte panels.
- Paper-like text colors.
- Amber highlight for memory moments.
- Square or subtly rounded photo cells.
- Motion that feels like moving across a table or filmstrip.

Initial palette:

- Ink 950: `#171615`.
- Ink 900: `#201F1D`.
- Ink 800: `#2A2825`.
- Stone 500: `#8E887E`.
- Paper 200: `#D8D0C2`.
- Paper 100: `#EEE6D8`.
- Amber Dust: `#C9974D`.
- Lake Blue: `#527C8E`.
- Archive Red: `#9D4B3F`.

Recommended typography:

- UI: Alegreya Sans.
- Editorial/view titles: Literata.
- EXIF/data: IBM Plex Mono.

## V0 Desktop Experience

The first useful screen after adding a source should feel like a working light table, not a setup wizard or file browser. The user should immediately see photos, understand the current view, and see that originals are only being referenced.

### Primary Screen: Timeline Light Table

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Memory Table        Timeline: All Photos            Search     Add Source    │
│                     18,426 photos · 2009-2026       Density    Filters       │
├──────────────────┬────────────────────────────────────────────┬──────────────┤
│ Library          │ 2026                                       │ View Context │
│  All Photos      │ ┌────┐ ┌────┐ ┌────────┐ ┌────┐ ┌────┐     │ Strategy     │
│  Recently Added  │ │    │ │    │ │        │ │    │ │    │     │ Timeline     │
│  Favorites       │ └────┘ └────┘ └────────┘ └────┘ └────┘     │              │
│                  │ May 7                                      │ Why visible  │
│ Views            │ ┌────┐ ┌────────┐ ┌────┐ ┌────┐            │ Grouped by    │
│  Timeline        │ │    │ │        │ │    │ │    │            │ captured date │
│  Places          │ └────┘ └────────┘ └────┘ └────┘            │              │
│  Memories        │                                            │ Source state  │
│  Similar         │ 2025                                       │ 3 online      │
│                  │ ┌────────┐ ┌────┐ ┌────┐ ┌────────┐        │ 1 offline     │
│ Sources          │ │        │ │    │ │    │ │        │        │              │
│  Mac Photos      │ └────────┘ └────┘ └────┘ └────────┘        │ Actions      │
│  X100V Drive     │                                            │ Save View     │
│  Archive SSD     │                                            │ Explain       │
└──────────────────┴────────────────────────────────────────────┴──────────────┘
```

Screen priorities:

1. Photos are the largest visual mass.
2. The active view title is always visible.
3. Source safety is visible without shouting.
4. Right-side context explains either the selected photo or the generated view.
5. Folders appear under Sources, but never become the main navigation metaphor.

### First-Run Source Flow

The first run should make the non-destructive guarantee unavoidable.

```text
┌────────────────────────────────────────────────────────────┐
│ Add a photo source                                         │
│                                                            │
│ Choose a folder or drive. Memory Table will read photos,   │
│ build thumbnails, and keep originals exactly where they are.│
│                                                            │
│ [Choose Folder]                                            │
│                                                            │
│ What happens next                                          │
│ - Originals stay in place                                  │
│ - Thumbnails go into the app cache                         │
│ - Views are saved as references                            │
│ - You can remove this source from the app later             │
└────────────────────────────────────────────────────────────┘
```

Avoid legalistic copy. The guarantee should read like a promise, not a permission dialog.

### Focus Viewer

Opening a photo shifts the center surface from contact sheet to focus mode while keeping the left rail and context panel stable.

```text
┌──────────────────┬────────────────────────────────────────────┬──────────────┐
│ Views            │                                            │ Photo        │
│ Timeline         │              selected photo                │ DSCF4281.RAF  │
│ Memories         │                                            │              │
│ Similar          │                                            │ Captured     │
│                  │                                            │ Oct 4, 2024  │
│ Filmstrip        │ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐              │ Camera       │
│                  │ └──┘ └──┘ └──┘ └──┘ └──┘ └──┘              │ X100V        │
│                  │                                            │              │
│                  │                                            │ Related      │
│                  │                                            │ Kyoto Nights │
└──────────────────┴────────────────────────────────────────────┴──────────────┘
```

Rules:

- The selected photo sits on a matte surface with no decorative frame.
- The filmstrip is functional, not ornamental.
- EXIF and path information use monospaced numerals.
- Missing original and offline source states appear in the context panel and on the image surface.

### Generated View Explanation

Every generated view needs an explanation block that is concise enough to scan.

```text
Kyoto Nights
42 photos · generated from Timeline + Place + Light signals

Why this view exists
- 31 photos were captured between Oct 2 and Oct 6, 2024.
- Most locations cluster near Kyoto.
- 18 photos are night scenes.
- 12 photos were previously favorited.

Confidence: High
[Save View] [Refresh] [Show Rules]
```

The explanation should never pretend low-confidence inference is fact. Use language like "likely", "appears", or "clustered around" when the system is not certain.

## Visual System

Working name: **Memory Table**.

The interface should feel like a quiet table covered in photographic contact sheets. The product is calm, but not generic. The distinctive gesture is the contrast between warm matte chrome and luminous photo cells.

### Design Thesis

A warm darkroom workspace for local photo memory: matte, quiet, archival, and trustworthy.

The one thing users should remember:

> My photos stayed where they were, but the app gave me new ways to see them.

Every visual decision should reinforce that promise. The app should not look like cloud storage, enterprise asset management, or an AI gallery toy.

### Color Tokens

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
}
```

Usage:

- `--ink-950`: app background.
- `--ink-900`: navigation and top bar.
- `--ink-850`: photo surface.
- `--ink-800`: raised panels.
- `--paper-100`: primary text.
- `--paper-200`: secondary headings.
- `--stone-500`: muted labels and inactive nav.
- `--amber-dust`: selected view, saved state, memory highlights.
- `--lake-blue`: source and metadata accents.
- `--archive-red`: destructive or missing-file states only.
- `--success-moss`: completed scans and online source states.

Color rules:

- Amber is the only default action accent.
- Blue is informational, not primary.
- Red is never decorative.
- Large text on dark surfaces should use paper tones, not pure white.
- Photo thumbnails provide most of the color; UI chrome should stay restrained.

### Typography

- **UI and navigation:** Alegreya Sans.
- **View titles and memory names:** Literata.
- **EXIF, paths, counts, timestamps:** IBM Plex Mono.

Type scale:

| Token | Size | Line height | Use |
| --- | ---: | ---: | --- |
| Display | 40px | 44px | Empty states, first-run promise |
| H1 | 28px | 34px | Current view title |
| H2 | 20px | 26px | Panel title, year group |
| Body | 16px | 24px | Explanations, setup copy |
| Small | 13px | 18px | Labels, metadata |
| Micro | 11px | 14px | Dense EXIF labels only |

Rules:

- Never use system-ui as the primary product font.
- Keep body copy at 16px or larger except dense metadata.
- Use tabular numerals for counts, dates, and EXIF values.
- View titles may feel editorial; controls should stay plain and legible.

### Spacing and Shape

- Base unit: 4px.
- Standard rhythm: 8, 12, 16, 24, 32, 48.
- App chrome density: compact.
- Reading and explanation density: comfortable.
- Photo grid gap: 6px in dense mode, 10px in standard mode, 16px in spacious mode.
- Panel padding: 16px compact, 24px standard.
- Border radius: 4px for photo cells, 8px for controls, 12px for panels.

Rules:

- Photo cells should be square or subtly rounded, never bubbly.
- Cards are not decoration. Use panels only for persistent regions or selectable saved views.
- Nested radius should be smaller than outer panel radius.
- Distinct sections need more spacing than related controls.

### Motion

Motion should feel like moving a contact sheet across a table.

- View switch: 180-240ms opacity + slight horizontal slide.
- Photo open: 220-320ms scale from thumbnail position into focus surface.
- Filmstrip navigation: 120-180ms translate.
- Scan progress: calm pulse or progress bar, never a celebratory animation.
- Save view: brief amber state change and confirmation text.

Rules:

- Respect reduced motion.
- Avoid transition-all.
- Animate transform and opacity only unless there is a specific layout reason.
- Motion explains spatial movement; it should not add personality unrelated to photos.

## Component Behavior

### Left Rail

The left rail is the user's map of possible views.

Required groups:

- Library.
- Views.
- Sources.
- Explore.
- Settings.

Behavior:

- Active item uses amber text plus a quiet left marker.
- Offline source uses muted text and a small status dot.
- Missing source uses archive red and a short label.
- Counts are optional and should be right-aligned in mono.
- The rail should remain visible in desktop V0.

### Top Bar

The top bar orients the current surface.

Contents:

- App name.
- Current view title.
- Photo count or filtered count.
- Search.
- Add Source.
- Density switch.
- Filter entry point.

Behavior:

- Search should be visually available but not dominate browsing.
- Add Source stays visible because sources are the system boundary.
- Filters should expose active filter chips when applied.

### Photo Grid

The photo grid is a scanning surface.

Rules:

- Use masonry only if it remains predictable; timeline grouping is more important than packing efficiency.
- Preserve aspect ratio where possible.
- Show lightweight skeletons that match final thumbnail shapes.
- Hover reveals actions, but selection affordance must be visible without hover.
- Missing original thumbnails remain visible if cached, with a clear unavailable badge.

### Context Panel

The context panel changes by selection type.

For a view:

- Strategy.
- Explanation.
- Confidence.
- Source states.
- Save and refresh actions.

For a photo:

- File name.
- Captured date.
- Source.
- Path.
- Camera and lens.
- Dimensions.
- Related views.

Rules:

- The panel should answer "what am I looking at?" and "why is it here?"
- Use progressive disclosure for raw EXIF.
- Put source safety states above technical trivia.

## Empty, Loading, and Failure States

### Empty Library

```text
Your photos stay where they are.
Choose a folder or drive. Memory Table will build views from references, thumbnails, and metadata.

[Choose Folder]
```

### Scanning

```text
Scanning Mac Photos
12,480 seen · 8,912 indexed · 143 skipped

You can start browsing while scanning continues.
```

### Offline Source

```text
Archive SSD is offline.
Thumbnails and saved views are still available. Originals will open again when the drive is connected.
```

### Missing Photo

```text
Original file not found.
This source is online, but the file path no longer exists. The cached thumbnail remains in your view.
```

Offline and missing must never collapse into the same message. This distinction is a trust feature.

## Key Interaction Flows

### Add First Source

1. Empty state explains the promise.
2. User chooses a folder or drive.
3. App requests permission if needed.
4. Scan starts in the background.
5. Timeline appears as soon as first batch is indexed.
6. Context panel shows source status and scan progress.

### Save Generated View

1. User opens Memories or Similar.
2. App shows generated view with explanation.
3. User saves the view.
4. Saved view appears under Custom Views.
5. Saved view stores references, not duplicate files.

### Source Goes Offline

1. App detects unavailable volume.
2. Source changes to offline.
3. Timeline keeps thumbnails visible.
4. Focus viewer shows original unavailable.
5. Reconnecting the source restores original access.

## Design Risks and Guardrails

Safe choices:

- Desktop-first three-region layout because photo browsing benefits from persistent navigation, large surface area, and context.
- Warm dark chrome because photos should carry color and the app should recede.
- Mono metadata because serious photo users scan dates, lenses, and paths.

Deliberate risks:

- Editorial view titles with Literata make generated memories feel personal rather than database-like.
- Amber as the only primary accent avoids generic blue SaaS and gives saved memories a physical archive feel.
- The product avoids card mosaics even though dashboards often default to them; the photo surface, not cards, is the product.

Guardrails:

- Do not turn the app into a folder tree.
- Do not make AI suggestions look more certain than they are.
- Do not hide source state behind settings.
- Do not add decorative gradients, blobs, or icon grids.
- Do not use purple as the primary visual identity.

## V0 Success Criteria

V0 is successful if a user can:

- Add a folder of local photos.
- See photos grouped by time without changing file locations.
- Open a photo and inspect its context.
- Save a generated view.
- Understand why an automatic view exists.
- Disconnect a source and still understand what happened.

V0 is not successful if it only becomes a file grid with prettier thumbnails.
