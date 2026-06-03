import { useEffect, useMemo, useState } from 'react'
import {
  APPEARANCE_THEMES,
  DEFAULT_APPEARANCE_THEME,
} from '../types/appearance'
import type { AppearanceThemeId } from '../types/appearance'

const STORAGE_KEY = 'gala:appearance-theme'

const isThemeId = (value: string | null): value is AppearanceThemeId =>
  !!value && APPEARANCE_THEMES.some((theme) => theme.id === value)

export function useAppearance() {
  const [themeId, setThemeIdState] = useState<AppearanceThemeId>(() => {
    if (typeof window === 'undefined') return DEFAULT_APPEARANCE_THEME
    const saved = typeof window.localStorage?.getItem === 'function'
      ? window.localStorage.getItem(STORAGE_KEY)
      : null
    return isThemeId(saved) ? saved : DEFAULT_APPEARANCE_THEME
  })

  useEffect(() => {
    document.documentElement.dataset.theme = themeId
    if (typeof window.localStorage?.setItem === 'function') {
      window.localStorage.setItem(STORAGE_KEY, themeId)
    }
  }, [themeId])

  const theme = useMemo(
    () => APPEARANCE_THEMES.find((item) => item.id === themeId) ?? APPEARANCE_THEMES[0],
    [themeId],
  )

  return {
    theme,
    themeId,
    themes: APPEARANCE_THEMES,
    setThemeId: setThemeIdState,
  }
}
