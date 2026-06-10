import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { optimizeImage } from '@/utils/imageOptimizer'
import { formatSaving } from '@/utils/format'
import {
  bytesToKilobytes,
  fileFormat,
  formatsSummary,
  savingPercent,
  trackEvent,
  type ImportSource,
} from '@/utils/analytics'

export type ImageStatus = 'queued' | 'processing' | 'done' | 'error'
export type SortKey = 'name' | 'size' | 'saving'

export interface ImageItem {
  id: string
  file: File
  previewUrl: string
  status: ImageStatus
  result?: Blob | undefined
  optimizedSize: number
  estimatedSize?: number | undefined
  removedMetadata: number
  error?: string | undefined
  importSource: ImportSource
}

interface UndoEntry {
  items: ImageItem[]
  indexes: number[]
}

const SUPPORTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

export const useImagesStore = defineStore('images', () => {
  const items = ref<ImageItem[]>([])
  const undoStack = ref<UndoEntry[]>([])
  const redoStack = ref<UndoEntry[]>([])
  const sortKey = ref<SortKey>('name')
  const isDownloading = ref(false)
  const compressionStrength = ref(6)
  const targetSize = ref(0)
  const processingVersions = new Map<string, number>()

  const totalOriginal = computed(() => items.value.reduce((sum, item) => sum + item.file.size, 0))
  const totalOptimized = computed(() => items.value.reduce((sum, item) => sum + (item.estimatedSize ?? item.optimizedSize ?? item.file.size), 0))
  const totalSaving = computed(() => formatSaving(totalOriginal.value, totalOptimized.value))
  const completedCount = computed(() => items.value.filter((item) => item.status === 'done').length)
  const failedCount = computed(() => items.value.filter((item) => item.status === 'error').length)
  const sortedItems = computed(() => [...items.value].sort((a, b) => {
    if (sortKey.value === 'size') return b.file.size - a.file.size
    if (sortKey.value === 'saving') return formatSaving(b.file.size, b.optimizedSize) - formatSaving(a.file.size, a.optimizedSize)
    return a.file.name.localeCompare(b.file.name, 'zh-CN')
  }))

  function fileKey(file: File) {
    return `${file.name}:${file.size}:${file.lastModified}`
  }

  function addFiles(files: File[], source: ImportSource = 'file_picker') {
    const existing = new Set(items.value.map(({ file }) => fileKey(file)))
    const accepted: ImageItem[] = []
    const rejected: File[] = []
    let duplicateCount = 0
    for (const file of files) {
      if (!SUPPORTED_TYPES.has(file.type)) {
        rejected.push(file)
        continue
      }
      if (existing.has(fileKey(file))) {
        duplicateCount += 1
        continue
      }
      existing.add(fileKey(file))
      accepted.push({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
        status: 'queued',
        optimizedSize: file.size,
        removedMetadata: 0,
        importSource: source,
      })
    }
    items.value.push(...accepted)
    const acceptedIds = new Set(accepted.map((item) => item.id))
    for (const item of items.value.filter(({ id }) => acceptedIds.has(id))) void processItem(item)
    trackEvent('file_import', {
      import_source: source,
      selected_count: files.length,
      accepted_count: accepted.length,
      rejected_count: rejected.length,
      duplicate_count: duplicateCount,
      selected_kb: bytesToKilobytes(files.reduce((sum, file) => sum + file.size, 0)),
      file_formats: formatsSummary(files),
      queue_count: items.value.length,
    })
    return { accepted: accepted.length, rejected, duplicateCount }
  }

  async function processItem(item: ImageItem, reason: 'initial' | 'settings_change' = 'initial') {
    const startedAt = Date.now()
    const version = (processingVersions.get(item.id) ?? 0) + 1
    processingVersions.set(item.id, version)
    item.status = 'processing'
    item.error = undefined
    item.result = undefined
    item.estimatedSize = undefined
    const settings = targetSize.value
      ? { strength: compressionStrength.value, targetSize: targetSize.value }
      : { strength: compressionStrength.value }
    try {
      const source = new Uint8Array(await item.file.arrayBuffer())
      const optimized = optimizeImage(source, item.file.type, settings)
      if (processingVersions.get(item.id) !== version) return false
      item.estimatedSize = optimized.targetReached === false ? optimized.smallestSize : optimized.bytes.byteLength
      await new Promise<void>((resolve) => window.setTimeout(resolve, 80))
      if (processingVersions.get(item.id) !== version) return false
      if (optimized.targetReached === false) {
        item.status = 'error'
        item.optimizedSize = item.file.size
        item.error = `无法压缩到目标大小，最小约 ${formatSize(optimized.smallestSize ?? item.file.size)}`
        trackOptimization(item, 'target_unreachable', reason, startedAt, settings, optimized.smallestSize)
        return false
      }
      const useOptimized = optimized.bytes.byteLength < source.byteLength
      item.result = useOptimized
        ? new Blob([optimized.bytes as BlobPart], { type: item.file.type })
        : item.file
      item.optimizedSize = item.result.size
      item.estimatedSize = undefined
      item.removedMetadata = useOptimized ? optimized.removedMetadata : 0
      item.status = 'done'
      trackOptimization(item, 'success', reason, startedAt, settings)
      return true
    } catch (error) {
      if (processingVersions.get(item.id) !== version) return false
      item.estimatedSize = undefined
      item.status = 'error'
      item.error = error instanceof Error ? error.message : '处理失败'
      trackOptimization(item, 'processing_error', reason, startedAt, settings)
      return false
    }
  }

  function trackOptimization(
    item: ImageItem,
    outcome: 'success' | 'target_unreachable' | 'processing_error',
    reason: 'initial' | 'settings_change',
    startedAt: number,
    settings: { strength: number; targetSize?: number },
    smallestSize?: number,
  ) {
    const resultSize = item.result?.size ?? smallestSize ?? item.file.size
    trackEvent('optimization_result', {
      outcome,
      processing_reason: reason,
      import_source: item.importSource,
      file_format: fileFormat(item.file),
      original_kb: bytesToKilobytes(item.file.size),
      result_kb: bytesToKilobytes(resultSize),
      saving_percent: savingPercent(item.file.size, resultSize),
      compression_mode: settings.targetSize ? 'target_size' : 'strength',
      compression_strength: settings.targetSize ? undefined : settings.strength,
      target_kb: settings.targetSize ? bytesToKilobytes(settings.targetSize) : undefined,
      duration_ms: Date.now() - startedAt,
    })
  }

  function formatSize(bytes: number) {
    if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  async function reprocessAll() {
    return Promise.all(items.value.map((item) => processItem(item, 'settings_change')))
  }

  function removeItem(id: string) {
    const index = items.value.findIndex((item) => item.id === id)
    if (index < 0) return
    processingVersions.set(id, (processingVersions.get(id) ?? 0) + 1)
    const removed = items.value.splice(index, 1)
    const item = removed[0]
    if (item) {
      trackEvent('queue_item_removed', {
        file_format: fileFormat(item.file),
        item_status: item.status,
        queue_count: items.value.length,
      })
      undoStack.value.push({ items: [item], indexes: [index] })
      redoStack.value = []
    }
  }

  function clearAll() {
    if (!items.value.length) return
    trackEvent('queue_cleared', {
      removed_count: items.value.length,
      completed_count: completedCount.value,
      failed_count: failedCount.value,
      file_formats: formatsSummary(items.value.map((item) => item.file)),
    })
    for (const item of items.value) processingVersions.set(item.id, (processingVersions.get(item.id) ?? 0) + 1)
    undoStack.value.push({ items: [...items.value], indexes: items.value.map((_, index) => index) })
    redoStack.value = []
    items.value = []
  }

  function undo() {
    const entry = undoStack.value.pop()
    if (!entry) return false
    entry.items.forEach((item, index) => items.value.splice(entry.indexes[index] ?? items.value.length, 0, item))
    redoStack.value.push(entry)
    trackEvent('queue_history_action', { action: 'undo', affected_count: entry.items.length, queue_count: items.value.length })
    return true
  }

  function redo() {
    const entry = redoStack.value.pop()
    if (!entry) return false
    const removedIds = new Set(entry.items.map((item) => item.id))
    items.value = items.value.filter((item) => !removedIds.has(item.id))
    undoStack.value.push(entry)
    trackEvent('queue_history_action', { action: 'redo', affected_count: entry.items.length, queue_count: items.value.length })
    return true
  }

  function disposeAll() {
    for (const item of items.value) URL.revokeObjectURL(item.previewUrl)
  }

  return {
    items, sortedItems, undoStack, redoStack, sortKey, isDownloading,
    compressionStrength, targetSize,
    totalOriginal, totalOptimized, totalSaving, completedCount, failedCount,
    addFiles, processItem, reprocessAll, removeItem, clearAll, undo, redo, disposeAll,
  }
})
