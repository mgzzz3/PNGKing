import { describe, expect, it } from 'vitest'
import { formatBytes, formatSaving } from '../src/utils/format'

describe('format helpers', () => {
  it('formats byte values for human reading', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB')
  })

  it('never reports a negative saving', () => {
    expect(formatSaving(100, 60)).toBe(40)
    expect(formatSaving(100, 120)).toBe(0)
    expect(formatSaving(0, 0)).toBe(0)
  })
})
