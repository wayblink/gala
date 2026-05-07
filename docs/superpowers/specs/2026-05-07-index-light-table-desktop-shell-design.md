# Index Light Table Desktop Shell Design

Date: 2026-05-07
Status: approved design direction, pending implementation plan
Product: Memory Table / Photo View Engine

## Summary

The V0 default desktop shell is **Index Light Table**: a warm, matte, three-region photo workspace for browsing indexed local photos without changing original files.

The design should prove the core product thesis on first use:

> My photos stayed where they were, but the app gave me new ways to see them.

The opening screen after a source is added should not feel like a setup wizard, cloud album, or file manager. It should feel like a working light table where the center surface belongs to photos, the left rail maps possible views, and the right panel explains what the user is seeing.

## Visual Direction

Index Light Table is a restrained darkroom interface:

- Warm dark matte chrome.
- Luminous photo cells as the primary color source.
- Amber for active view and primary action only.
- Blue for source or metadata information.
- Red only for missing or destructive states.
- Editorial titles for views.
- Monospace metadata for counts, dates, paths, and EXIF.

The product should feel calm and trustworthy, but not generic. The main distinction is the contrast between quiet app chrome and dense photographic surfaces.

## Default Layout

The V0 desktop shell uses a persistent three-region structure:

```text
Top Bar
  App name / current view / count / search / density / filters / add source

Left Rail
  Library / Views / Sources / Explore / scan status

Photo Surface
  Timeline groups / photo grid / selected cell state / density modes

Context Panel
  View explanation / source safety / selected photo context / actions
```

Recommended desktop proportions:

- Top bar: 56px tall.
- Left rail: 180-200px wide.
- Right context panel: 220-260px wide.
- Photo surface: flexible center region, always the largest visual mass.
- Minimum practical desktop width: 1120px.

The rails are persistent in V0 desktop because the product depends on orientation, source state, and explanations. They should be compact enough that photos still dominate.

## Top Bar

The top bar orients the current browsing surface.

Required content:

- Product name: `Memory Table`.
- Current view title: for example, `Timeline: All Photos`.
- Count and range: for example, `18,426 photos · 2009-2026`.
- Source summary: for example, `3 sources online`.
- Search entry.
- Density control.
- Filter entry.
- Add Source action.

Behavior:

- The current view title is more prominent than the app name.
- Search is visible but visually quiet.
- Add Source remains visible because sources are the system boundary.
- Active filters appear near the current view metadata.
- Counts, dates, and source summaries use monospaced numerals.

## Left Rail

The left rail is a view library, not a folder tree.

Required groups:

- Library: All Photos, Recently Added, Favorites, Hidden.
- Views: Timeline, Places, People, Memories, Similar, Custom Views.
- Sources: local folders, external drives, network volumes, offline sources.
- Explore: Same Day in Past Years, Forgotten Photos, Similar Light, Trips.
- Settings access.

Behavior:

- Active item uses amber text and a quiet left marker.
- Counts are optional and right-aligned in mono.
- Online source uses a moss status dot.
- Offline source uses muted text and a muted dot.
- Missing source uses archive red and a short label.
- Folder paths must not become the primary navigation metaphor.
- Scan status can live at the bottom of the rail so users understand indexing progress without leaving the surface.

## Photo Surface

The photo surface is the product's largest visual mass.

Default mode:

- Timeline grouped by year, month, and day.
- Each group has an editorial heading and a small metadata row.
- Photo cells preserve aspect ratio where possible.
- Standard grid gap is 8-10px; dense mode may use 6px.
- Square or subtly rounded photo cells use a 4px radius.

Required states:

- Selected photo cell with amber outline or inset marker.
- Missing original badge when source is online but file path is gone.
- Offline original badge when source is offline but cached thumbnail remains.
- Skeleton cells matching final thumbnail shapes during scan or cache generation.
- Empty date fallback group for photos without captured date.

Behavior:

- Timeline grouping matters more than masonry packing.
- Hover may reveal actions, but selection affordance cannot depend on hover alone.
- Users can start browsing while scanning continues.
- View switching should feel like sliding or moving across a table, using transform and opacity rather than decorative animation.

## Context Panel

The context panel answers two questions:

1. What am I looking at?
2. Why is it here?

For a view, show:

- Strategy name.
- Explanation.
- Confidence when generated.
- Source safety summary.
- Active filters.
- Save, refresh, and explain actions where relevant.

For a selected photo, show:

- File name.
- Captured date.
- Source and source state.
- Path.
- Camera and lens.
- Dimensions.
- Related views.

Priority:

- Source safety appears above raw technical trivia.
- Explanations are concise and scannable.
- Low-confidence inference must use language such as "likely", "appears", or "clustered around".
- Raw EXIF should use progressive disclosure.

## Primary Screen Anatomy

The approved hierarchy is:

1. Current view title and photo count in the top bar.
2. Timeline photo surface in the center.
3. Active Library/View/Sources map in the left rail.
4. View explanation and source safety in the right panel.
5. Actions such as Save View, Refresh, Explain, Add Source.

This hierarchy was chosen over a more emotional memory-first shell and a metadata-heavy inspection shell. Memory-first treatment should be used for generated views. Inspection-heavy treatment should be used for focus viewer.

## Component Rules

Buttons:

- Primary action uses amber fill with dark text.
- Secondary action uses ink surface, paper text, and subtle border.
- Icon buttons should be used for density, filters, and navigation when implementation includes an icon system.

Navigation:

- Active state is amber text plus a left marker.
- Avoid large pill states that make the rail feel like a settings menu.
- Source rows include status dots.

Photo cells:

- Radius: 4px.
- Selection: amber outline or inset marker.
- Missing state: archive red badge or corner marker.
- Offline state: muted badge, distinct from missing.

Panels:

- Radius: 12px only for persistent panels or contained status blocks.
- Avoid decorative card nesting.
- Borders should be low contrast and structural.

Text:

- View titles use an editorial serif.
- Navigation and body use a humanist sans.
- Metadata uses mono.
- Body copy is at least 16px in normal reading areas; dense metadata can be 11-13px.

## Responsive Behavior

V0 is desktop-first, but the shell should degrade intentionally.

Large desktop:

- Three regions visible.
- Wider photo grid.
- Context panel persistent.

Medium desktop:

- Keep three regions.
- Reduce rail and context width before reducing photo cell size.
- Hide nonessential counts in the left rail if space is tight.

Narrow tablet or small window:

- Left rail may collapse to icon-plus-tooltip rail.
- Context panel becomes a slide-over or bottom inspector.
- Photo surface remains primary.

Mobile is not a primary V0 target. If a mobile view is needed, it should be a browsing companion, not a squeezed desktop layout.

## Interaction Flows Covered By This Shell

Add first source:

- Empty state explains that originals stay in place.
- After choosing a folder, scan status appears in the left rail.
- Timeline appears as soon as the first indexed batch is ready.

Browse timeline:

- User scans grouped photo cells.
- Current year/month/day is visible.
- Selection updates the context panel.

Save generated view:

- Generated view uses the same shell.
- Context panel explains why the view exists.
- Save action creates a custom view reference, not copied files.

Source goes offline:

- Source row changes to offline.
- Cached thumbnails remain visible.
- Context panel says originals are unavailable until the drive reconnects.

Photo missing:

- Missing is shown only when the source is online and the file path no longer exists.
- Missing and offline states must remain visually and verbally distinct.

## Acceptance Criteria

- Photos are the largest visual mass on desktop.
- The current view title and count are always visible.
- The user can tell the app is referencing sources, not reorganizing folders.
- The user can distinguish offline source from missing photo.
- Every generated view has an explanation area in the right panel.
- The default shell does not look like cloud storage, a file manager, or a generic SaaS dashboard.
- The shell can support timeline browsing, focus viewer entry, saved generated views, and scan progress without changing layout model.

## Validation Notes

This design was validated as a browser-based static mockup in the brainstorming companion at `http://localhost:63822` during the design session.

No production frontend code exists yet, so there was no responsive browser QA, automated accessibility audit, or implementation test run. Those checks belong in the implementation plan once a frontend surface exists.
