import { deflate, inflate } from 'pako'
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

  it('losslessly recompresses inefficient PNG image data', () => {
    const scanlines = new Uint8Array(16_384).fill(0)
    const storedImageData = deflate(scanlines, { level: 0 })
    const source = concat(
      [137, 80, 78, 71, 13, 10, 26, 10],
      pngChunk('IHDR', new Array(13).fill(0)),
      pngChunk('IDAT', [...storedImageData]),
      pngChunk('IEND'),
    )

    const result = optimizeImage(source, 'image/png')
    const idatOffset = new TextDecoder('latin1').decode(result.bytes).indexOf('IDAT')
    const idatLength = new DataView(result.bytes.buffer, result.bytes.byteOffset + idatOffset - 4, 4).getUint32(0)
    const optimizedImageData = result.bytes.slice(idatOffset + 4, idatOffset + 4 + idatLength)

    expect(result.bytes.byteLength).toBeLessThan(source.byteLength)
    expect(inflate(optimizedImageData)).toEqual(scanlines)
  })

  it('converts truecolor PNGs to an adaptive indexed palette for substantially smaller files', () => {
    const width = 256
    const height = 256
    const scanlines = new Uint8Array(height * (width * 4 + 1))
    let state = 0x12345678
    for (let row = 0; row < height; row += 1) {
      const rowOffset = row * (width * 4 + 1)
      for (let column = 0; column < width; column += 1) {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0
        const offset = rowOffset + 1 + column * 4
        scanlines[offset] = (state >>> 16) & 0xf8
        scanlines[offset + 1] = (state >>> 8) & 0xf8
        scanlines[offset + 2] = state & 0xf8
        scanlines[offset + 3] = 255
      }
    }
    const header = [...u32be(width), ...u32be(height), 8, 6, 0, 0, 0]
    const source = concat(
      [137, 80, 78, 71, 13, 10, 26, 10],
      pngChunk('IHDR', header),
      pngChunk('IDAT', [...deflate(scanlines, { level: 9 })]),
      pngChunk('IEND'),
    )

    const result = optimizeImage(source, 'image/png')
    const output = new TextDecoder('latin1').decode(result.bytes)
    const headerOffset = output.indexOf('IHDR')

    expect(result.bytes.byteLength).toBeLessThan(source.byteLength * 0.55)
    expect(result.bytes[headerOffset + 4 + 9]).toBe(3)
    expect(output).toContain('PLTE')
  })

  it('keeps animated PNG image data on the lossless path', () => {
    const width = 2
    const height = 1
    const scanlines = new Uint8Array([0, 255, 0, 0, 255, 0, 255, 0, 255])
    const header = [...u32be(width), ...u32be(height), 8, 6, 0, 0, 0]
    const source = concat(
      [137, 80, 78, 71, 13, 10, 26, 10],
      pngChunk('IHDR', header),
      pngChunk('acTL', [...u32be(1), ...u32be(0)]),
      pngChunk('IDAT', [...deflate(scanlines, { level: 0 })]),
      pngChunk('IEND'),
    )

    const result = optimizeImage(source, 'image/png')
    const output = new TextDecoder('latin1').decode(result.bytes)
    const headerOffset = output.indexOf('IHDR')

    expect(result.bytes[headerOffset + 4 + 9]).toBe(6)
    expect(output).not.toContain('PLTE')
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
