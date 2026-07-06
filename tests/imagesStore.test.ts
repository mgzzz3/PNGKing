import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useImagesStore, type ImageItem } from '../src/stores/images'

const minimalPng = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10,
  0, 0, 0, 0, 73, 69, 78, 68, 0, 0, 0, 0,
])

describe('images store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('window', globalThis)
  })

  it('updates the reactive queue item when processing finishes', async () => {
    vi.useFakeTimers()
    const store = useImagesStore()
    const file = new File([minimalPng], 'demo.png', { type: 'image/png' })

    store.addFiles([file])
    expect(store.items[0]?.status).toBe('processing')

    await vi.advanceTimersByTimeAsync(100)

    expect(store.items[0]?.status).toBe('done')
    expect(store.completedCount).toBe(1)
    expect(store.items[0]?.result).toBeTruthy()
    vi.useRealTimers()
  })

  it('uses the settings captured when a processing run starts', async () => {
    vi.useFakeTimers()
    const store = useImagesStore()
    let releaseFile: ((value: ArrayBuffer) => void) | undefined
    const delayedFile = {
      name: 'delayed.png',
      size: minimalPng.byteLength,
      type: 'image/png',
      lastModified: 1,
      arrayBuffer: () => new Promise<ArrayBuffer>((resolve) => { releaseFile = resolve }),
    } as File
    const item: ImageItem = {
      id: 'delayed',
      file: delayedFile,
      previewUrl: 'blob:delayed',
      status: 'queued',
      optimizedSize: delayedFile.size,
      removedMetadata: 0,
      importSource: 'file_picker',
    }
    store.items.push(item)

    store.compressionQuality = 100
    const processing = store.processItem(item)
    store.compressionQuality = 0
    releaseFile?.(minimalPng.slice().buffer)
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(100)

    expect(await processing).toBe(true)
    expect(item.status).toBe('done')
    expect(item.error).toBeUndefined()
    vi.useRealTimers()
  })


})
