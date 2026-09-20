import { useI18n } from '../../state/useLocale'
import type { AppearanceTheme, AppearanceThemeId } from '../../types/appearance'
import type { LanguageId, LanguageOption } from '../../types/locale'

type SettingsViewProps = {
  themes: AppearanceTheme[]
  activeThemeId: AppearanceThemeId
  onThemeChange: (themeId: AppearanceThemeId) => void
  languages: LanguageOption[]
  activeLanguageId: LanguageId
  onLanguageChange: (languageId: LanguageId) => void
  photoQualityEnabled: boolean
  onPhotoQualityChange: (enabled: boolean) => void
}

export function SettingsView({
  themes,
  activeThemeId,
  onThemeChange,
  languages,
  activeLanguageId,
  onLanguageChange,
  photoQualityEnabled,
  onPhotoQualityChange,
}: SettingsViewProps) {
  const { t } = useI18n()

  return (
    <main className="settings-view" aria-label={t('settings.title')}>
      <header className="settings-view__header">
        <div>
          <p className="settings-view__eyebrow">{t('settings.preferences')}</p>
          <h1>{t('settings.title')}</h1>
        </div>
      </header>

      <section className="settings-panel" aria-labelledby="appearance-title">
        <div className="settings-panel__intro">
          <p className="settings-view__eyebrow">{t('settings.appearance')}</p>
          <h2 id="appearance-title">{t('settings.colorStyle')}</h2>
          <p>{t('settings.colorDescription')}</p>
        </div>

        <div className="theme-grid" role="radiogroup" aria-label={t('settings.colorAria')}>
          {themes.map((theme) => {
            const active = theme.id === activeThemeId
            return (
              <button
                key={theme.id}
                type="button"
                role="radio"
                aria-checked={active}
                className={`theme-card${active ? ' theme-card--active' : ''}`}
                onClick={() => onThemeChange(theme.id)}
              >
                <span className="theme-card__preview" aria-hidden="true">
                  {theme.swatches.map((swatch, index) => (
                    <span
                      key={`${swatch}-${index}`}
                      className={`theme-card__preview-color theme-card__preview-color--${index + 1}`}
                      style={{ background: swatch }}
                    />
                  ))}
                </span>
                <span className="theme-card__body">
                  <strong>{theme.name}</strong>
                  <span>{theme.description}</span>
                </span>
                <span className="theme-card__check" aria-hidden="true">{active ? '✓' : ''}</span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="settings-panel" aria-labelledby="quality-title">
        <div className="settings-panel__intro">
          <p className="settings-view__eyebrow">Photo Quality</p>
          <h2 id="quality-title">Photo Quality analysis</h2>
          <p>When enabled, Gala computes quality scores and shows them on photo cards. It is off by default to avoid background CPU usage.</p>
        </div>
        <button
          type="button"
          className={`settings-toggle${photoQualityEnabled ? ' settings-toggle--active' : ''}`}
          role="switch"
          aria-checked={photoQualityEnabled}
          onClick={() => onPhotoQualityChange(!photoQualityEnabled)}
        >
          <span className="settings-toggle__track"><span /></span>
          <span>{photoQualityEnabled ? 'On' : 'Off'}</span>
        </button>
      </section>

      <section className="settings-panel" aria-labelledby="language-title">
        <div className="settings-panel__intro">
          <p className="settings-view__eyebrow">{t('settings.language')}</p>
          <h2 id="language-title">{t('settings.languageTitle')}</h2>
          <p>{t('settings.languageDescription')}</p>
        </div>

        <div className="language-grid" role="radiogroup" aria-label={t('settings.languageAria')}>
          {languages.map((language) => {
            const active = language.id === activeLanguageId
            return (
              <button
                key={language.id}
                type="button"
                role="radio"
                aria-checked={active}
                className={`language-card${active ? ' language-card--active' : ''}`}
                onClick={() => onLanguageChange(language.id)}
              >
                <span className="language-card__body">
                  <strong>{language.nativeName}</strong>
                  <span>{language.englishName}</span>
                </span>
                <span className="theme-card__check" aria-hidden="true">{active ? '✓' : ''}</span>
              </button>
            )
          })}
        </div>
      </section>
    </main>
  )
}
