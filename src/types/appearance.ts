export type AppearanceThemeId = 'archive' | 'graphite' | 'midnight' | 'sage' | 'paper'

export type AppearanceTheme = {
  id: AppearanceThemeId
  name: string
  description: string
  swatches: [string, string, string]
}

export const APPEARANCE_THEMES: AppearanceTheme[] = [
  {
    id: 'archive',
    name: 'Archive Amber',
    description: 'Warm darkroom blacks with amber accents.',
    swatches: ['#171615', '#38342f', '#c9974d'],
  },
  {
    id: 'graphite',
    name: 'Graphite Neutral',
    description: 'Lower saturation, cooler neutral editing surface.',
    swatches: ['#111316', '#30363d', '#a7b0ba'],
  },
  {
    id: 'midnight',
    name: 'Midnight Blue',
    description: 'Deep blue-black UI for evening curation.',
    swatches: ['#0b1020', '#1f2a44', '#78a6d8'],
  },
  {
    id: 'sage',
    name: 'Sage Museum',
    description: 'Muted green-gray palette with brass highlights.',
    swatches: ['#111713', '#2e3a31', '#b3a167'],
  },
  {
    id: 'paper',
    name: 'Warm Paper',
    description: 'Light contact-sheet style for daylight review.',
    swatches: ['#f4efe6', '#d8cdbb', '#9a6a2f'],
  },
]

export const DEFAULT_APPEARANCE_THEME: AppearanceThemeId = 'archive'
