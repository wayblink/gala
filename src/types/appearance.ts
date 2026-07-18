export type AppearanceThemeId =
  | 'archive'
  | 'graphite'
  | 'midnight'
  | 'sage'
  | 'paper'
  | 'glacier'
  | 'mint'
  | 'coral'
  | 'cyan'

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
    id: 'archive',
    name: 'Archive Amber',
    description: 'Warm darkroom blacks with amber accents.',
    swatches: ['#171615', '#2f2d2a', '#f4efe6', '#c9974d', '#35b6b4'],
    colors: { primary: '#c9974d', info: '#35b6b4', success: '#78a85a', warning: '#e0b84a', danger: '#d66b5d', onPrimary: '#17130f' },
  },
  {
    id: 'graphite',
    name: 'Graphite Neutral',
    description: 'Lower saturation, cooler neutral editing surface.',
    swatches: ['#111316', '#30363d', '#f1f3f5', '#2997ff', '#ff5a67'],
    colors: { primary: '#2997ff', info: '#58c7f3', success: '#47c98b', warning: '#f2c94c', danger: '#ff5a67', onPrimary: '#071522' },
  },
  {
    id: 'midnight',
    name: 'Midnight Blue',
    description: 'Deep blue-black UI for evening curation.',
    swatches: ['#0b1020', '#1f2a44', '#eef5ff', '#78a6d8', '#d86bce'],
    colors: { primary: '#78a6d8', info: '#46c8e8', success: '#64c894', warning: '#f0bd5b', danger: '#ed6f8f', onPrimary: '#0b1020' },
  },
  {
    id: 'sage',
    name: 'Sage Museum',
    description: 'Muted green-gray palette with brass highlights.',
    swatches: ['#111713', '#2e3a31', '#f1f3e8', '#b3a167', '#ef765d'],
    colors: { primary: '#b3a167', info: '#58a9b5', success: '#83b85e', warning: '#e3b84e', danger: '#ef765d', onPrimary: '#111713' },
  },
  {
    id: 'paper',
    name: 'Warm Paper',
    description: 'Light contact-sheet style for daylight review.',
    swatches: ['#f4efe6', '#221e1a', '#ffffff', '#9a6a2f', '#486f7b'],
    colors: { primary: '#9a6a2f', info: '#287a9b', success: '#4f7f42', warning: '#b47712', danger: '#b5473a', onPrimary: '#ffffff' },
  },
  {
    id: 'glacier',
    name: 'Glacier Blue',
    description: 'Crisp ice-white surfaces with vivid blue accents.',
    swatches: ['#f5f5f7', '#1d1d1f', '#ffffff', '#0066cc', '#3ecf8e'],
    colors: { primary: '#0066cc', info: '#078eae', success: '#16845a', warning: '#b56b00', danger: '#d92d4f', onPrimary: '#ffffff' },
  },
  {
    id: 'mint',
    name: 'Mint Lime',
    description: 'Fresh mint surfaces with bright citrus highlights.',
    swatches: ['#fafafa', '#171717', '#ffffff', '#3ecf8e', '#ffdb13'],
    colors: { primary: '#16a66a', info: '#007f9b', success: '#4d8e18', warning: '#a96c00', danger: '#d9384d', onPrimary: '#071a11' },
  },
  {
    id: 'coral',
    name: 'Coral Daylight',
    description: 'Clean pearl surfaces with lively coral accents.',
    swatches: ['#fff8f6', '#4e202a', '#ffffff', '#f0445c', '#078eae'],
    colors: { primary: '#f0445c', info: '#078eae', success: '#3e8a55', warning: '#a96800', danger: '#c82042', onPrimary: '#ffffff' },
  },
  {
    id: 'cyan',
    name: 'Clear Cyan',
    description: 'Deep clean teal with bright water-blue details.',
    swatches: ['#071d24', '#efffff', '#10414d', '#24d6e5', '#ff7184'],
    colors: { primary: '#24d6e5', info: '#45a9ff', success: '#69d28b', warning: '#ffd34e', danger: '#ff7184', onPrimary: '#04242b' },
  },
]

export const DEFAULT_APPEARANCE_THEME: AppearanceThemeId = 'archive'
