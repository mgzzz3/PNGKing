export type AnalyticsValue = string | number | boolean
export type AnalyticsParams = Record<string, AnalyticsValue | undefined>

interface GtagWindow extends Window {
  gtag?: (command: 'event', eventName: string, params?: Record<string, AnalyticsValue>) => void
}

export type ImportSource = 'drop' | 'file_picker'

export function trackEvent(eventName: string, params: AnalyticsParams = {}) {
  if (typeof window === 'undefined') return
  const gtag = (window as GtagWindow).gtag
  if (!gtag) return

  const definedParams = Object.fromEntries(
    Object.entries(params).filter((entry): entry is [string, AnalyticsValue] => entry[1] !== undefined),
  )
  gtag('event', eventName, definedParams)
}

export function fileFormat(file: Pick<File, 'type' | 'name'>) {
  const mimeSubtype = file.type.split('/')[1]?.toLowerCase()
  if (mimeSubtype === 'jpeg') return 'jpg'
  if (mimeSubtype) return mimeSubtype
  return file.name.split('.').pop()?.toLowerCase() || 'unknown'
}

export function formatsSummary(files: Array<Pick<File, 'type' | 'name'>>) {
  return [...new Set(files.map(fileFormat))].sort().join(',') || 'none'
}

export function bytesToKilobytes(bytes: number) {
  return Math.round(bytes / 1024)
}

export function savingPercent(originalSize: number, optimizedSize: number) {
  if (!originalSize) return 0
  return Math.max(0, Math.round((1 - optimizedSize / originalSize) * 100))
}
