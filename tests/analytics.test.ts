import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  bytesToKilobytes,
  fileFormat,
  formatsSummary,
  savingPercent,
  trackEvent,
} from '../src/utils/analytics'

describe('analytics helpers', () => {
  beforeEach(() => {
    vi.stubGlobal('window', globalThis)
  })

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'gtag')
    vi.unstubAllGlobals()
  })

  it('sends only defined, privacy-safe event parameters to gtag', () => {
    const gtag = vi.fn()
    Object.assign(window, { gtag })

    trackEvent('file_import', {
      accepted_count: 2,
      import_source: 'drop',
      target_kb: undefined,
    })

    expect(gtag).toHaveBeenCalledWith('event', 'file_import', {
      accepted_count: 2,
      import_source: 'drop',
    })
  })

  it('normalizes formats and computes compact numeric metrics', () => {
    const png = new File(['png'], 'first.PNG', { type: 'image/png' })
    const jpeg = new File(['jpg'], 'second.jpeg', { type: 'image/jpeg' })

    expect(fileFormat(jpeg)).toBe('jpg')
    expect(formatsSummary([png, jpeg, png])).toBe('jpg,png')
    expect(bytesToKilobytes(1536)).toBe(2)
    expect(savingPercent(1000, 625)).toBe(38)
  })
})
