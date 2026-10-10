export type AppearanceThemeId = 'light' | 'dark'

export type AppearanceTheme = {
  id: AppearanceThemeId
  name: string
  description: string
  swatches: [string, string, string, string, string]
  colors: {
    primary: string
    info: string
    success: string
    warning: string
    danger: string
    onPrimary: string
  }
}

export const APPEARANCE_THEMES: AppearanceTheme[] = [
  {
    id: 'light',
    name: 'Light',
    description: 'Bright neutral canvas for daylight focus.',
    swatches: ['#ffffff', '#f7f7f6', '#0a0a0a', '#4f5bd5', '#e5e5e3'],
    colors: {
      primary: '#4f5bd5',
      info: '#0ea5e9',
      success: '#16a34a',
      warning: '#d97706',
      danger: '#dc2626',
      onPrimary: '#ffffff',
    },
  },
  {
    id: 'dark',
    name: 'Dark',
    description: 'Deep neutral workbench for low-light focus.',
    swatches: ['#121212', '#1a1a1a', '#fafafa', '#6d7cff', '#2a2a2a'],
    colors: {
      primary: '#6d7cff',
      info: '#38bdf8',
      success: '#4ade80',
      warning: '#fbbf24',
      danger: '#f87171',
      onPrimary: '#ffffff',
    },
  },
]

export const DEFAULT_APPEARANCE_THEME: AppearanceThemeId = 'light'
