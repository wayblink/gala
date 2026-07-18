---
version: alpha
name: Gala Contrast Studio
description: Supabase-inspired functional contrast with Apple-inspired surface hierarchy for Gala's desktop workspace.

colors:
  emerald: "#3ecf8e"
  emerald-deep: "#24b47e"
  action-blue: "#0066cc"
  action-blue-focus: "#0071e3"
  ink: "#171717"
  canvas: "#ffffff"
  canvas-soft: "#f5f5f7"
  canvas-night: "#1c1c1c"
  hairline: "#dfdfdf"
  coral: "#ff5a67"
  cyan: "#24d6e5"
  yellow: "#ffdb13"

rounded:
  control: 8px
  preview: 12px
  panel: 18px
  full: 9999px

spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  xxl: 32px
---

## Visual Theme & Atmosphere

Gala uses Supabase's technical clarity and Apple utility surfaces rather than copying either marketing site. Neutral canvas and ink establish hierarchy. Color is reserved for actions, selection, state, and data differentiation. Each appearance theme must contain at least two visibly different chromatic accents.

## Color Palette & Roles

- `{colors.emerald}` is the Supabase-derived positive/action color and appears with dark text on light fills.
- `{colors.action-blue}` is the Apple-derived navigation and focus color.
- `{colors.coral}`, `{colors.cyan}`, and `{colors.yellow}` are secondary signal colors, never substitutes for body text.
- Light themes alternate `{colors.canvas}` and `{colors.canvas-soft}` surfaces; dark themes use `{colors.canvas-night}` with lifted panels.
- A theme preview always shows five roles in order: canvas, navigation, raised surface, primary action, secondary signal.

## Typography Rules

Use the existing Gala type hierarchy. UI labels use system sans at medium weight; technical metadata keeps the existing system mono. Letter spacing remains 0 except existing uppercase micro labels.

## Component Stylings

Theme cards use an Apple-derived 18px outer radius, a thin hairline, and restrained elevation. Their preview is a miniature product surface rather than a stripe swatch: canvas, navigation rail, floating content pane, primary action, and secondary status dot. Active state uses the current theme's primary accent and must remain recognizable without relying on color alone.

Buttons, custom selects, and range controls continue to use theme tokens. Native select popovers and native range thumbs are not allowed. Focus uses the current primary action color with a visible outer ring.

## Layout Principles

Use an 8px base rhythm with 12px and 24px composition gaps. Settings panels remain open and readable, with one level of container and no nested decorative cards. Theme cards are the repeated selectable items and may be framed.

## Depth & Elevation

Default cards are flat with a 1px hairline. Selected or hovered cards may use a subtle level-one shadow. Large settings panels use a soft Apple-style shadow only to separate them from the workspace background. No decorative gradients.

## Do's and Don'ts

- Do combine neutral surfaces with contrasting functional accents.
- Do preserve clear light/dark surface hierarchy.
- Do use exact Supabase emerald `#3ecf8e` and Apple action blue `#0066cc` where those roles apply.
- Don't represent a theme with three neighboring shades of one hue.
- Don't tint every surface with the primary accent.
- Don't use color alone for selected state; retain the check icon and border.
- Don't add decorative gradients, oversized radii, or nested cards.

## Responsive Behavior

Theme cards use auto-fit columns on desktop and remain at least 230px wide. At narrow widths, settings panels become one column and previews retain fixed dimensions so their internal hierarchy does not shift.
