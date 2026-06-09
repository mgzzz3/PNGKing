export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** unitIndex
  return `${Number(value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1))} ${units[unitIndex]}`
}

export function formatSaving(original: number, optimized: number): number {
  if (original <= 0 || optimized >= original) return 0
  return Math.round(((original - optimized) / original) * 100)
}

export function optimizedFilename(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot > 0 ? `${filename.slice(0, dot)}.min${filename.slice(dot)}` : `${filename}.min`
}
