export type LanguageId = 'en' | 'zh-Hans'

export type LanguageOption = {
  id: LanguageId
  nativeName: string
  englishName: string
}

export const DEFAULT_LANGUAGE: LanguageId = 'en'

export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { id: 'en', nativeName: 'English', englishName: 'English' },
  { id: 'zh-Hans', nativeName: '简体中文', englishName: 'Chinese (Simplified)' },
]
