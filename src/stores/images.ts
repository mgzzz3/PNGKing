import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { optimizeImage } from '@/utils/imageOptimizer'
import { formatSaving } from '@/utils/format'

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

  function addFiles(files: File[]) {
    const existing = new Set(items.value.map(({ file }) => fileKey(file)))
    const accepted: ImageItem[] = []
    const rejected: File[] = []
    for (const file of files) {
      if (!SUPPORTED_TYPES.has(file.type)) {
        rejected.push(file)
        continue
      }
      if (existing.has(fileKey(file))) continue
      existing.add(fileKey(file))
      accepted.push({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
        status: 'queued',
        optimizedSize: file.size,
        removedMetadata: 0,
      })
    }
    items.value.push(...accepted)
    const acceptedIds = new Set(accepted.map((item) => item.id))
    for (const item of items.value.filter(({ id }) => acceptedIds.has(id))) void processItem(item)
    return { accepted: accepted.length, rejected }
  }

  async function processItem(item: ImageItem) {
    const version = (processingVersions.get(item.id) ?? 0) + 1
    processingVersions.set(item.id, version)
    item.status = 'processing'
    item.error = undefined
    item.result = undefined
    item.estimatedSize = undefined
    try {
      const settings = targetSize.value
        ? { strength: compressionStrength.value, targetSize: targetSize.value }
        : { strength: compressionStrength.value }
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
      return true
    } catch (error) {
      if (processingVersions.get(item.id) !== version) return false
      item.estimatedSize = undefined
      item.status = 'error'
      item.error = error instanceof Error ? error.message : '处理失败'
      return false
    }
  }

  function formatSize(bytes: number) {
    if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  async function reprocessAll() {
    return Promise.all(items.value.map((item) => processItem(item)))
  }

  function removeItem(id: string) {
    const index = items.value.findIndex((item) => item.id === id)
    if (index < 0) return
    processingVersions.set(id, (processingVersions.get(id) ?? 0) + 1)
    const removed = items.value.splice(index, 1)
    const item = removed[0]
    if (item) {
      undoStack.value.push({ items: [item], indexes: [index] })
      redoStack.value = []
    }
  }

  function clearAll() {
    if (!items.value.length) return
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
    return true
  }

  function redo() {
    const entry = redoStack.value.pop()
    if (!entry) return false
    const removedIds = new Set(entry.items.map((item) => item.id))
    items.value = items.value.filter((item) => !removedIds.has(item.id))
    undoStack.value.push(entry)
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
