import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { DEFAULT_LANGUAGE, LANGUAGE_OPTIONS } from '../types/locale'
import type { LanguageId } from '../types/locale'

const STORAGE_KEY = 'gala:language'

type TranslationValue = string
type TranslationDict = Record<string, TranslationValue>

type TranslateOptions = Record<string, string | number>

type LocaleState = {
  languageId: LanguageId
  languages: typeof LANGUAGE_OPTIONS
  setLanguageId: (languageId: LanguageId) => void
  t: (key: string, options?: TranslateOptions) => string
}

const en: TranslationDict = {
  'app.brand': 'Memory Table',
  'nav.library': 'Library',
  'nav.allPhotos': 'All Photos',
  'nav.recentlyAdded': 'Recently Added',
  'nav.recentlyAdded.fixed': 'Recently Added',
  'nav.favorites': 'Favorites',
  'nav.hidden': 'Hidden',
  'nav.explore': 'Explore',
  'nav.people': 'People',
  'nav.content': 'Content',
  'nav.labels': 'Labels',
  'nav.arrange': 'Arrange',
  'nav.similarReview': 'Similar Review',
  'nav.reorganize': 'Reorganize',
  'nav.sources': 'Sources',
  'nav.albums': 'Albums',
  'nav.tags': 'Tags',
  'nav.noSources': 'No sources',
  'nav.newAlbum': 'New album',
  'nav.backgroundTasks': 'Background Tasks',
  'nav.settings': 'Settings',
  'top.search': 'Search',
  'top.searchPhotos': 'Search photos',
  'top.displayMode': 'Display mode',
  'top.thumbnailTable': 'Thumbnail table',
  'top.list': 'List',
  'top.gallery': 'Gallery',
  'top.enterSelection': 'Enter selection mode',
  'top.exitSelection': 'Exit selection mode',
  'top.select': 'Select',
  'top.doneSelecting': 'Done selecting',
  'top.openFilters': 'Open filters',
  'top.smartFilters': 'Smart filters',
  'top.groupWindow': 'Group window',
  'settings.preferences': 'Preferences',
  'settings.title': 'Settings',
  'settings.subtitle': 'Tune Gala for the way you review: start with appearance and language, then add source and performance controls later.',
  'settings.appearance': 'Appearance',
  'settings.colorStyle': 'Color style',
  'settings.colorDescription': 'Choose a visual tone for the entire workspace. The choice is saved locally on this machine.',
  'settings.colorAria': 'Appearance color style',
  'settings.language': 'Language',
  'settings.languageTitle': 'Display language',
  'settings.languageDescription': 'Choose the language used by Gala. This setting is saved locally on this machine.',
  'settings.languageAria': 'Display language',
  'tasks.operations': 'Operations',
  'tasks.title': 'Background Tasks',
  'tasks.subtitle': 'Long-running scans and file operations stay visible here while you keep browsing.',
  'tasks.scanSimilar': 'Scan Similar',
  'tasks.scanPeople': 'Scan People',
  'tasks.scanContent': 'Scan Content',
  'tasks.clearFinished': 'Clear finished',
  'tasks.active': 'active',
  'tasks.complete': 'complete',
  'tasks.paused': 'paused',
  'tasks.failed': 'failed',
  'tasks.emptyTitle': 'No background tasks yet',
  'tasks.emptyBody': 'Run Similar, People, Content, or Reorganize scans to see their durable plan and execution history here.',
  'tasks.taskList': 'Task list',
  'scope.label': 'Scope',
  'scope.allLibrary': 'All Library',
  'explore.eyebrow': 'Explore',
  'content.title': 'Content Recognition',
  'content.subtitle': 'On-device image classification turns scenes and objects into subject labels. Results are stored in the same label layer as People and manual tags, with source metadata kept separate.',
  'content.scan': 'Scan Content',
  'content.scanning': 'Scanning…',
  'content.syncExisting': 'Sync Existing Results',
  'content.refresh': 'Refresh',
  'content.loading': 'Loading subject labels…',
  'content.empty': 'No content labels yet. Run a content scan for the selected scope to classify photos into subjects such as animals, buildings, landscapes, food, and objects.',
  'content.subjects': 'Recognized Subjects',
  'content.labelsCount': '{count} labels',
  'content.updated': 'Content labels updated for {scope}',
  'content.synced': 'Synced {labels} labels across {photos} photos · {scope}',
  'content.scanFailed': 'Scan failed: {error}',
  'content.syncFailed': 'Sync failed: {error}',
  'content.classifying': 'Classifying photos…',
  'content.writingLabels': 'Writing subject labels…',
  'content.scopeDetail': 'Scope: {scope}',
  'content.taskTitle': 'Scan Content Recognition',
  'content.taskDescription': 'Classify photos into subject labels for Explore',
  'people.title': 'People',
  'people.noProvider': 'No face provider registered',
  'people.detect': '1. Detect faces',
  'people.detecting': 'Detecting…',
  'people.embed': '2. Embed',
  'people.embedding': 'Embedding…',
  'people.cluster': '3. Cluster',
  'people.clustering': 'Clustering…',
  'people.refresh': 'Refresh',
  'people.persons': 'persons',
  'people.faces': 'faces',
  'people.photos': 'photos',
  'people.embedded': 'embedded',
  'people.poweredFull': 'Powered by macOS Vision (face.detect + face.embed via Neural Engine) · HNSW clustering',
  'people.faceDetectOnly': 'Powered by {provider} (face.detect only)',
  'labels.title': 'Labels',
  'labels.subtitle': 'One label layer for people, system discoveries, and manual tags. Source and kind keep them separated without creating parallel storage concepts.',
  'labels.syncPeople': 'Sync People Labels',
  'labels.syncing': 'Syncing…',
  'labels.refresh': 'Refresh',
  'labels.loading': 'Loading labels…',
  'labels.empty': 'No labels yet. Run People scanning or add manual tags to photos, then refresh this view.',
  'labels.people': 'People',
  'labels.subjects': 'Subjects',
  'labels.manualTags': 'Manual Tags',
}

const zhHans: TranslationDict = {
  'app.brand': '记忆桌',
  'nav.library': '图库',
  'nav.allPhotos': '全部照片',
  'nav.recentlyAdded': '最近添加',
  'nav.recentlyAdded.fixed': '最近添加',
  'nav.favorites': '收藏',
  'nav.hidden': '隐藏',
  'nav.explore': '探索',
  'nav.people': '人物',
  'nav.content': '内容',
  'nav.labels': '标签',
  'nav.arrange': '整理',
  'nav.similarReview': '相似照片',
  'nav.reorganize': '重整',
  'nav.sources': '来源',
  'nav.albums': '相册',
  'nav.tags': '手工标签',
  'nav.noSources': '暂无来源',
  'nav.newAlbum': '新建相册',
  'nav.backgroundTasks': '后台任务',
  'nav.settings': '设置',
  'top.search': '搜索',
  'top.searchPhotos': '搜索照片',
  'top.displayMode': '显示模式',
  'top.thumbnailTable': '缩略图',
  'top.list': '列表',
  'top.gallery': '画廊',
  'top.enterSelection': '进入选择模式',
  'top.exitSelection': '退出选择模式',
  'top.select': '选择',
  'top.doneSelecting': '完成选择',
  'top.openFilters': '打开筛选',
  'top.smartFilters': '智能筛选',
  'top.groupWindow': '分组窗口',
  'settings.preferences': '偏好',
  'settings.title': '设置',
  'settings.subtitle': '调整 Gala 的使用方式：先从外观和语言开始，之后再加入来源与性能控制。',
  'settings.appearance': '外观',
  'settings.colorStyle': '色彩风格',
  'settings.colorDescription': '为整个工作区选择视觉风格。该选择会保存在本机。',
  'settings.colorAria': '外观色彩风格',
  'settings.language': '语言',
  'settings.languageTitle': '显示语言',
  'settings.languageDescription': '选择 Gala 使用的界面语言。该设置会保存在本机。',
  'settings.languageAria': '显示语言',
  'tasks.operations': '操作',
  'tasks.title': '后台任务',
  'tasks.subtitle': '耗时扫描和文件操作会显示在这里，你可以继续浏览照片。',
  'tasks.scanSimilar': '扫描相似',
  'tasks.scanPeople': '扫描人物',
  'tasks.scanContent': '扫描内容',
  'tasks.clearFinished': '清理完成项',
  'tasks.active': '进行中',
  'tasks.complete': '已完成',
  'tasks.paused': '已暂停',
  'tasks.failed': '失败',
  'tasks.emptyTitle': '暂无后台任务',
  'tasks.emptyBody': '运行相似、人物、内容或重整扫描后，可在这里看到可持久化的计划与执行历史。',
  'tasks.taskList': '任务列表',
  'scope.label': '范围',
  'scope.allLibrary': '全部图库',
  'explore.eyebrow': '探索',
  'content.title': '内容识别',
  'content.subtitle': '使用本机图像分类把场景和物体转成主题标签。结果会存入与人物、手工标签相同的 Label 层，并保留来源元数据。',
  'content.scan': '扫描内容',
  'content.scanning': '扫描中…',
  'content.syncExisting': '同步已有结果',
  'content.refresh': '刷新',
  'content.loading': '正在加载主题标签…',
  'content.empty': '还没有内容标签。请先对选定范围运行内容扫描，将照片分类为动物、建筑、风景、食物、物体等主题。',
  'content.subjects': '已识别主题',
  'content.labelsCount': '{count} 个标签',
  'content.updated': '已更新 {scope} 的内容标签',
  'content.synced': '已同步 {photos} 张照片中的 {labels} 个标签 · {scope}',
  'content.scanFailed': '扫描失败：{error}',
  'content.syncFailed': '同步失败：{error}',
  'content.classifying': '正在分类照片…',
  'content.writingLabels': '正在写入主题标签…',
  'content.scopeDetail': '范围：{scope}',
  'content.taskTitle': '扫描内容识别',
  'content.taskDescription': '将照片分类为 Explore 可用的主题标签',
  'people.title': '人物',
  'people.noProvider': '没有可用的人脸识别提供方',
  'people.detect': '1. 检测人脸',
  'people.detecting': '检测中…',
  'people.embed': '2. 嵌入',
  'people.embedding': '嵌入中…',
  'people.cluster': '3. 聚类',
  'people.clustering': '聚类中…',
  'people.refresh': '刷新',
  'people.persons': '人物',
  'people.faces': '人脸',
  'people.photos': '照片',
  'people.embedded': '已嵌入',
  'people.poweredFull': '由 macOS Vision 驱动（face.detect + face.embed，经 Neural Engine）· HNSW 聚类',
  'people.faceDetectOnly': '由 {provider} 驱动（仅 face.detect）',
  'labels.title': '标签',
  'labels.subtitle': '人物、系统发现和手工标签共用同一个 Label 层；通过来源和类型区分语义，不再创建平行存储概念。',
  'labels.syncPeople': '同步人物标签',
  'labels.syncing': '同步中…',
  'labels.refresh': '刷新',
  'labels.loading': '正在加载标签…',
  'labels.empty': '还没有标签。请先运行人物扫描或给照片添加手工标签，然后刷新此页。',
  'labels.people': '人物',
  'labels.subjects': '主题',
  'labels.manualTags': '手工标签',
}

const dictionaries: Record<LanguageId, TranslationDict> = {
  en,
  'zh-Hans': zhHans,
}

const isLanguageId = (value: string | null): value is LanguageId =>
  !!value && LANGUAGE_OPTIONS.some((item) => item.id === value)

function interpolate(template: string, options?: TranslateOptions) {
  if (!options) return template
  return Object.entries(options).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    template,
  )
}

function makeTranslator(languageId: LanguageId) {
  return (key: string, options?: TranslateOptions) => {
    const template = dictionaries[languageId][key] ?? dictionaries.en[key] ?? key
    return interpolate(template, options)
  }
}

const fallbackLocale: LocaleState = {
  languageId: DEFAULT_LANGUAGE,
  languages: LANGUAGE_OPTIONS,
  setLanguageId: () => undefined,
  t: makeTranslator(DEFAULT_LANGUAGE),
}

const I18nContext = createContext<LocaleState>(fallbackLocale)

export function useLocaleState(): LocaleState {
  const [languageId, setLanguageIdState] = useState<LanguageId>(() => {
    if (typeof window === 'undefined') return DEFAULT_LANGUAGE
    const saved = typeof window.localStorage?.getItem === 'function'
      ? window.localStorage.getItem(STORAGE_KEY)
      : null
    return isLanguageId(saved) ? saved : DEFAULT_LANGUAGE
  })

  useEffect(() => {
    document.documentElement.lang = languageId === 'zh-Hans' ? 'zh-Hans' : 'en'
    if (typeof window.localStorage?.setItem === 'function') {
      window.localStorage.setItem(STORAGE_KEY, languageId)
    }
  }, [languageId])

  const t = useMemo(() => makeTranslator(languageId), [languageId])

  return {
    languageId,
    languages: LANGUAGE_OPTIONS,
    setLanguageId: setLanguageIdState,
    t,
  }
}

export function I18nProvider({ value, children }: { value: LocaleState; children: ReactNode }) {
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  return useContext(I18nContext)
}
