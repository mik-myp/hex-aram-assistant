import type {
  AiSettings,
  AiToneStyle,
  HeroRole,
  HudDensityMode,
  OcrEngineMode,
  OverlayOpacityMode,
  PlaystyleMode,
  UiFontScale,
  UserPreferences
} from './types'

export const CURRENT_CONFIG_SCHEMA_VERSION = 2

const VALID_ROLES = new Set<HeroRole>(['mage', 'marksman', 'tank', 'fighter', 'assassin', 'support'])
const VALID_OPACITY = new Set<OverlayOpacityMode>(['solid', 'glass', 'clear'])
const VALID_DENSITY = new Set<HudDensityMode>(['detailed', 'compact'])
const VALID_FONT_SCALE = new Set<UiFontScale>(['normal', 'comfortable', 'large'])
const VALID_PLAYSTYLE = new Set<PlaystyleMode>(['steady', 'counter', 'team', 'yolo', 'torment'])
const VALID_OCR_MODE = new Set<OcrEngineMode>(['auto', 'tesseract'])
const VALID_TONE = new Set<AiToneStyle>(['concise', 'witty', 'beginner'])

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  schemaVersion: CURRENT_CONFIG_SCHEMA_VERSION,
  uiFontScale: 'comfortable',
  preferredRoles: [],
  favoriteHeroIds: [],
  favoriteAugmentIds: [],
  blacklistedAugmentIds: [],
  overlayOpacity: 'solid',
  hudScale: 1,
  hudDensity: 'detailed',
  enableBenchBadges: true,
  enableThreePickBadges: true,
  enableFountainStrip: true,
  defaultPlaystyle: 'steady',
  autoSyncDataOnBoot: true,
  restoreClipboardAfterCopy: false,
  ocrEngineMode: 'auto',
  onboardingDismissed: false,
  autoOcrOnMilestone: true,
  minimizeToTray: true,
  releaseMainOnMatch: true,
  launchAtLogin: false,
  badgePosition: 'top',
  autoHideWhenUnfocused: true,
  excludeHudFromCapture: true,
  hudOffsetX: 0,
  hudOffsetY: 0
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  enabled: true,
  providerName: 'DeepSeek 官方',
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: '',
  model: 'deepseek-chat',
  toneStyle: 'concise',
  shortcutOverlay: 'Alt+H',
  shortcutOcr: 'Alt+S',
  shortcutCycleMindset: 'Alt+M'
}

function clampFinite(val: unknown, min: number, max: number, fallback: number): number {
  const num = typeof val === 'number' ? val : Number(val)
  if (!Number.isFinite(num)) return fallback
  return Math.min(max, Math.max(min, num))
}

function asBool(val: unknown, fallback: boolean): boolean {
  return typeof val === 'boolean' ? val : fallback
}

function asCleanString(val: unknown, fallback: string, maxLen = 256): string {
  if (typeof val !== 'string') return fallback
  return val.trim().slice(0, maxLen)
}

/**
 * Schema-safe sanitizer & migrator for `UserPreferences`.
 * Guarantees upgrades from v0.2/v0.3 or malformed JSON never crash the renderer or main process.
 */
export function sanitizeUserPreferences(raw: unknown): UserPreferences {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}

  const preferredRoles = Array.isArray(src.preferredRoles)
    ? Array.from(
        new Set(
          src.preferredRoles.filter(
            (r): r is HeroRole => typeof r === 'string' && VALID_ROLES.has(r as HeroRole)
          )
        )
      )
    : [...DEFAULT_USER_PREFERENCES.preferredRoles]

  const favoriteHeroIds = Array.isArray(src.favoriteHeroIds)
    ? Array.from(
        new Set(
          src.favoriteHeroIds
            .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
            .map((id) => id.trim())
        )
      ).slice(0, 200)
    : [...DEFAULT_USER_PREFERENCES.favoriteHeroIds]

  const favoriteAugmentIds = Array.isArray(src.favoriteAugmentIds)
    ? Array.from(
        new Set(
          src.favoriteAugmentIds
            .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
            .map((id) => id.trim())
        )
      ).slice(0, 120)
    : []
  const favAugSet = new Set(favoriteAugmentIds)
  const blacklistedAugmentIds = Array.isArray(src.blacklistedAugmentIds)
    ? Array.from(
        new Set(
          src.blacklistedAugmentIds
            .filter(
              (id): id is string =>
                typeof id === 'string' && id.trim().length > 0 && !favAugSet.has(id.trim())
            )
            .map((id) => id.trim())
        )
      ).slice(0, 120)
    : []

  const overlayOpacity =
    typeof src.overlayOpacity === 'string' && VALID_OPACITY.has(src.overlayOpacity as OverlayOpacityMode)
      ? (src.overlayOpacity as OverlayOpacityMode)
      : DEFAULT_USER_PREFERENCES.overlayOpacity

  const hudDensity =
    typeof src.hudDensity === 'string' && VALID_DENSITY.has(src.hudDensity as HudDensityMode)
      ? (src.hudDensity as HudDensityMode)
      : DEFAULT_USER_PREFERENCES.hudDensity

  const uiFontScale =
    typeof src.uiFontScale === 'string' && VALID_FONT_SCALE.has(src.uiFontScale as UiFontScale)
      ? (src.uiFontScale as UiFontScale)
      : DEFAULT_USER_PREFERENCES.uiFontScale

  const defaultPlaystyle =
    typeof src.defaultPlaystyle === 'string' &&
    VALID_PLAYSTYLE.has(src.defaultPlaystyle as PlaystyleMode)
      ? (src.defaultPlaystyle as PlaystyleMode)
      : DEFAULT_USER_PREFERENCES.defaultPlaystyle

  const ocrEngineMode =
    typeof src.ocrEngineMode === 'string' && VALID_OCR_MODE.has(src.ocrEngineMode as OcrEngineMode)
      ? (src.ocrEngineMode as OcrEngineMode)
      : DEFAULT_USER_PREFERENCES.ocrEngineMode

  const badgePosition =
    src.badgePosition === 'bottom' || src.badgePosition === 'top'
      ? src.badgePosition
      : DEFAULT_USER_PREFERENCES.badgePosition

  const hudScale = Number(
    clampFinite(src.hudScale, 0.8, 1.3, DEFAULT_USER_PREFERENCES.hudScale).toFixed(2)
  )
  const hudOffsetX = Number(
    clampFinite(src.hudOffsetX, -8, 8, DEFAULT_USER_PREFERENCES.hudOffsetX).toFixed(1)
  )
  const hudOffsetY = Number(
    clampFinite(src.hudOffsetY, -8, 8, DEFAULT_USER_PREFERENCES.hudOffsetY).toFixed(1)
  )

  return {
    schemaVersion: CURRENT_CONFIG_SCHEMA_VERSION,
    uiFontScale,
    preferredRoles,
    favoriteHeroIds,
    favoriteAugmentIds,
    blacklistedAugmentIds,
    overlayOpacity,
    hudScale,
    hudDensity,
    enableBenchBadges: asBool(src.enableBenchBadges, DEFAULT_USER_PREFERENCES.enableBenchBadges),
    enableThreePickBadges: asBool(
      src.enableThreePickBadges,
      DEFAULT_USER_PREFERENCES.enableThreePickBadges
    ),
    enableFountainStrip: asBool(
      src.enableFountainStrip,
      DEFAULT_USER_PREFERENCES.enableFountainStrip
    ),
    defaultPlaystyle,
    autoSyncDataOnBoot: asBool(src.autoSyncDataOnBoot, DEFAULT_USER_PREFERENCES.autoSyncDataOnBoot),
    restoreClipboardAfterCopy: asBool(
      src.restoreClipboardAfterCopy,
      DEFAULT_USER_PREFERENCES.restoreClipboardAfterCopy
    ),
    ocrEngineMode,
    onboardingDismissed: asBool(
      src.onboardingDismissed,
      DEFAULT_USER_PREFERENCES.onboardingDismissed
    ),
    autoOcrOnMilestone: asBool(src.autoOcrOnMilestone, DEFAULT_USER_PREFERENCES.autoOcrOnMilestone),
    minimizeToTray: asBool(src.minimizeToTray, DEFAULT_USER_PREFERENCES.minimizeToTray),
    releaseMainOnMatch: asBool(src.releaseMainOnMatch, true),
    launchAtLogin: asBool(src.launchAtLogin, false),
    badgePosition,
    autoHideWhenUnfocused: asBool(
      src.autoHideWhenUnfocused,
      DEFAULT_USER_PREFERENCES.autoHideWhenUnfocused
    ),
    excludeHudFromCapture: asBool(src.excludeHudFromCapture, true),
    hudOffsetX,
    hudOffsetY
  }
}

export function sanitizeAiSettings(raw: unknown): AiSettings {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}

  const toneStyle =
    typeof src.toneStyle === 'string' && VALID_TONE.has(src.toneStyle as AiToneStyle)
      ? (src.toneStyle as AiToneStyle)
      : DEFAULT_AI_SETTINGS.toneStyle

  return {
    enabled: asBool(src.enabled, DEFAULT_AI_SETTINGS.enabled),
    providerName:
      asCleanString(src.providerName, DEFAULT_AI_SETTINGS.providerName, 80) ||
      DEFAULT_AI_SETTINGS.providerName,
    baseUrl:
      asCleanString(src.baseUrl, DEFAULT_AI_SETTINGS.baseUrl, 240) || DEFAULT_AI_SETTINGS.baseUrl,
    apiKey: typeof src.apiKey === 'string' ? src.apiKey.trim().slice(0, 260) : '',
    model: asCleanString(src.model, DEFAULT_AI_SETTINGS.model, 120) || DEFAULT_AI_SETTINGS.model,
    toneStyle,
    shortcutOverlay:
      typeof src.shortcutOverlay === 'string'
        ? src.shortcutOverlay.trim().slice(0, 64)
        : DEFAULT_AI_SETTINGS.shortcutOverlay,
    shortcutOcr:
      typeof src.shortcutOcr === 'string'
        ? src.shortcutOcr.trim().slice(0, 64)
        : DEFAULT_AI_SETTINGS.shortcutOcr,
    shortcutCycleMindset:
      typeof src.shortcutCycleMindset === 'string'
        ? src.shortcutCycleMindset.trim().slice(0, 64)
        : DEFAULT_AI_SETTINGS.shortcutCycleMindset
  }
}

export interface ConfigBackupEnvelope {
  app: 'HexBuddy'
  schemaVersion: number
  exportedAt: string
  prefs: UserPreferences
  settings: Omit<AiSettings, 'apiKey'>
}

export function buildConfigBackupJson(prefs: UserPreferences, settings: AiSettings): string {
  const { apiKey: _redacted, ...safeSettings } = sanitizeAiSettings(settings)
  void _redacted
  const payload: ConfigBackupEnvelope = {
    app: 'HexBuddy',
    schemaVersion: CURRENT_CONFIG_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    prefs: sanitizeUserPreferences(prefs),
    settings: safeSettings
  }
  return JSON.stringify(payload, null, 2)
}

export function parseConfigBackupJson(
  jsonText: string,
  existingApiKey: string
): { prefs: UserPreferences; settings: AiSettings } {
  const parsed = JSON.parse(jsonText) as Record<string, unknown>
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('配置文件格式无效')
  }
  const rawPrefs = parsed.prefs ?? parsed
  const rawSettings =
    parsed.settings && typeof parsed.settings === 'object'
      ? (parsed.settings as Record<string, unknown>)
      : {}

  const prefs = sanitizeUserPreferences(rawPrefs)
  const settings = sanitizeAiSettings({
    ...rawSettings,
    apiKey:
      typeof rawSettings.apiKey === 'string' && rawSettings.apiKey.trim()
        ? rawSettings.apiKey
        : existingApiKey
  })
  return { prefs, settings }
}
