import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useImagesStore } from '../src/stores/images'

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

  it('shows an estimate while processing and stops when a target is unreachable', async () => {
    vi.useFakeTimers()
    const store = useImagesStore()
    store.targetSize = 1
    const file = new File([minimalPng], 'tiny-target.png', { type: 'image/png' })

    store.addFiles([file])
    await Promise.resolve()
    await Promise.resolve()

    expect(store.items[0]?.status).toBe('processing')
    expect(store.items[0]?.estimatedSize).toBeGreaterThan(1)

    await vi.advanceTimersByTimeAsync(100)

    expect(store.items[0]?.status).toBe('error')
    expect(store.items[0]?.result).toBeUndefined()
    expect(store.items[0]?.error).toContain('无法压缩到目标大小')
    vi.useRealTimers()
  })

})
