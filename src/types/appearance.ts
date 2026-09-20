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
    description: 'Warm darkroom black with copper and teal edges.',
    swatches: ['#17110f', '#2a211b', '#f7efe4', '#d08a34', '#46c3c8'],
    colors: {
      primary: '#d08a34',
      info: '#46c3c8',
      success: '#8ac95e',
      warning: '#f0c44b',
      danger: '#e06b5d',
      onPrimary: '#1a1209',
    },
  },
  {
    id: 'graphite',
    name: 'Graphite Neutral',
    description: 'Cool slate panels with electric blue and rose signals.',
    swatches: ['#10141a', '#232a33', '#eef2f7', '#4c9dff', '#ff6b75'],
    colors: {
      primary: '#4c9dff',
      info: '#6dd3f2',
      success: '#50d693',
      warning: '#f3c84f',
      danger: '#ff6b75',
      onPrimary: '#071522',
    },
  },
  {
    id: 'midnight',
    name: 'Midnight Blue',
    description: 'Indigo-black surfaces with sky, violet, and cyan accents.',
    swatches: ['#0a1224', '#18233e', '#eef3ff', '#86b4ff', '#5ad8ff'],
    colors: {
      primary: '#86b4ff',
      info: '#5ad8ff',
      success: '#6fd29a',
      warning: '#f7c65c',
      danger: '#f06d95',
      onPrimary: '#0a1224',
    },
  },
  {
    id: 'sage',
    name: 'Sage Museum',
    description: 'Forest-gray panels with brass and terracotta contrast.',
    swatches: ['#101813', '#213228', '#f1f4ea', '#c0a85a', '#ef7357'],
    colors: {
      primary: '#c0a85a',
      info: '#60b0b7',
      success: '#87bc59',
      warning: '#e4b94b',
      danger: '#ef7357',
      onPrimary: '#101813',
    },
  },
  {
    id: 'paper',
    name: 'Warm Paper',
    description: 'Airy daylight canvas with deep ink and rust accents.',
    swatches: ['#f7f0e4', '#efe4d3', '#201a16', '#8f5f28', '#2f7ea0'],
    colors: {
      primary: '#8f5f28',
      info: '#2f7ea0',
      success: '#4f8443',
      warning: '#b97810',
      danger: '#bd4c3d',
      onPrimary: '#fffaf2',
    },
  },
  {
    id: 'glacier',
    name: 'Glacier Blue',
    description: 'Icy light surfaces with cobalt, teal, and green cues.',
    swatches: ['#eff7ff', '#dfeeff', '#0f3156', '#0066cc', '#188fbb'],
    colors: {
      primary: '#0066cc',
      info: '#188fbb',
      success: '#1d8a62',
      warning: '#b26a00',
      danger: '#d82b56',
      onPrimary: '#ffffff',
    },
  },
  {
    id: 'mint',
    name: 'Mint Lime',
    description: 'Deep teal workbench with vivid mint and citrus contrast.',
    swatches: ['#071d16', '#124539', '#ecfff4', '#16a66a', '#ffdb13'],
    colors: {
      primary: '#16a66a',
      info: '#007f9b',
      success: '#4d8e18',
      warning: '#a96c00',
      danger: '#d9384d',
      onPrimary: '#071a11',
    },
  },
  {
    id: 'coral',
    name: 'Coral Daylight',
    description: 'Blush paper tones with coral, slate, and aqua contrast.',
    swatches: ['#fff7f4', '#fde9e4', '#4e202a', '#f0445c', '#0b8fb0'],
    colors: {
      primary: '#f0445c',
      info: '#0b8fb0',
      success: '#3e8a55',
      warning: '#a96800',
      danger: '#c82042',
      onPrimary: '#ffffff',
    },
  },
  {
    id: 'cyan',
    name: 'Clear Cyan',
    description: 'Aqua-black contrast with bright water and rose signals.',
    swatches: ['#061b22', '#0b2c39', '#efffff', '#24d6e5', '#ff7184'],
    colors: {
      primary: '#24d6e5',
      info: '#45a9ff',
      success: '#69d28b',
      warning: '#ffd34e',
      danger: '#ff7184',
      onPrimary: '#04242b',
    },
  },
]

export const DEFAULT_APPEARANCE_THEME: AppearanceThemeId = 'archive'
