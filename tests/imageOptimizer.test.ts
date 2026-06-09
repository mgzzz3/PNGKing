import { describe, expect, it } from 'vitest'
import { optimizeImage } from '../src/utils/imageOptimizer'

const concat = (...parts: number[][]) => new Uint8Array(parts.flat())
const ascii = (value: string) => [...value].map((char) => char.charCodeAt(0))
const u32be = (value: number) => [value >>> 24, value >>> 16, value >>> 8, value].map((v) => v & 0xff)

function pngChunk(type: string, data: number[] = []) {
  return [...u32be(data.length), ...ascii(type), ...data, 0, 0, 0, 0]
}

describe('optimizeImage', () => {
  it('removes safe PNG metadata while retaining display and image chunks', () => {
    const source = concat(
      [137, 80, 78, 71, 13, 10, 26, 10],
      pngChunk('IHDR', new Array(13).fill(0)),
      pngChunk('iCCP', [1, 2, 3]),
      pngChunk('tEXt', ascii('Author\0PNGKing')),
      pngChunk('IDAT', [9, 8, 7]),
      pngChunk('IEND'),
    )

    const result = optimizeImage(source, 'image/png')

    expect(new TextDecoder('latin1').decode(result.bytes)).not.toContain('tEXt')
    expect(new TextDecoder('latin1').decode(result.bytes)).toContain('iCCP')
    expect(new TextDecoder('latin1').decode(result.bytes)).toContain('IDAT')
    expect(result.removedMetadata).toBe(1)
  })

  it('removes JPEG EXIF/comment segments without touching scan data', () => {
    const source = concat(
      [0xff, 0xd8],
      [0xff, 0xe1, 0x00, 0x08, ...ascii('Exif'), 0, 0],
      [0xff, 0xfe, 0x00, 0x05, ...ascii('abc')],
      [0xff, 0xda, 0x00, 0x02, 1, 2, 3, 0xff, 0xd9],
    )

    const result = optimizeImage(source, 'image/jpeg')

    expect([...result.bytes]).toEqual([0xff, 0xd8, 0xff, 0xda, 0, 2, 1, 2, 3, 0xff, 0xd9])
    expect(result.removedMetadata).toBe(2)
  })

  it('returns unsupported files unchanged', () => {
    const source = new Uint8Array([1, 2, 3])
    const result = optimizeImage(source, 'image/avif')
    expect(result.bytes).toBe(source)
    expect(result.removedMetadata).toBe(0)
  })
})
