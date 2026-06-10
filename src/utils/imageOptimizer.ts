import { deflate, inflate } from 'pako'

export interface OptimizationResult {
  bytes: Uint8Array
  removedMetadata: number
}

const PNG_SIGNATURE_LENGTH = 8
const PNG_REMOVABLE = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME'])
const JPEG_REMOVABLE = new Set([0xe1, 0xed, 0xfe])

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length))
}

function concat(parts: Uint8Array[]): Uint8Array {
  const size = parts.reduce((sum, part) => sum + part.length, 0)
  const output = new Uint8Array(size)
  let offset = 0
  for (const part of parts) {
    output.set(part, offset)
    offset += part.length
  }
  return output
}

interface PngChunk {
  type: string
  data: Uint8Array
  bytes: Uint8Array
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

function createPngChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(data.length + 12)
  const view = new DataView(chunk.buffer)
  view.setUint32(0, data.length)
  for (let index = 0; index < 4; index += 1) chunk[4 + index] = type.charCodeAt(index)
  chunk.set(data, 8)
  view.setUint32(data.length + 8, crc32(chunk.subarray(4, data.length + 8)))
  return chunk
}

function paethPredictor(left: number, above: number, upperLeft: number): number {
  const estimate = left + above - upperLeft
  const leftDistance = Math.abs(estimate - left)
  const aboveDistance = Math.abs(estimate - above)
  const upperLeftDistance = Math.abs(estimate - upperLeft)
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left
  return aboveDistance <= upperLeftDistance ? above : upperLeft
}

function refilterPngScanlines(data: Uint8Array, header?: Uint8Array): Uint8Array {
  if (!header || header.length !== 13 || header[12] !== 0) return data
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength)
  const width = view.getUint32(0)
  const height = view.getUint32(4)
  const bitDepth = header[8] ?? 0
  const colorType = header[9] ?? 0
  const channels = new Map([[0, 1], [2, 3], [3, 1], [4, 2], [6, 4]]).get(colorType)
  if (!width || !height || !channels || !bitDepth) return data

  const rowLength = Math.ceil(width * channels * bitDepth / 8)
  const bytesPerPixel = Math.max(1, Math.ceil(channels * bitDepth / 8))
  if (data.length !== height * (rowLength + 1)) return data

  const output = new Uint8Array(data.length)
  let previous = new Uint8Array(rowLength)
  for (let rowIndex = 0; rowIndex < height; rowIndex += 1) {
    const inputOffset = rowIndex * (rowLength + 1)
    const filterType = data[inputOffset] ?? 0
    const filtered = data.subarray(inputOffset + 1, inputOffset + 1 + rowLength)
    const current = new Uint8Array(rowLength)

    for (let index = 0; index < rowLength; index += 1) {
      const left = index >= bytesPerPixel ? current[index - bytesPerPixel]! : 0
      const above = previous[index] ?? 0
      const upperLeft = index >= bytesPerPixel ? previous[index - bytesPerPixel]! : 0
      const value = filtered[index] ?? 0
      if (filterType === 0) current[index] = value
      else if (filterType === 1) current[index] = (value + left) & 0xff
      else if (filterType === 2) current[index] = (value + above) & 0xff
      else if (filterType === 3) current[index] = (value + Math.floor((left + above) / 2)) & 0xff
      else if (filterType === 4) current[index] = (value + paethPredictor(left, above, upperLeft)) & 0xff
      else return data
    }

    let bestType = 0
    let bestScore = Number.POSITIVE_INFINITY
    let bestRow = current
    for (let candidateType = 0; candidateType <= 4; candidateType += 1) {
      const candidate = new Uint8Array(rowLength)
      let score = 0
      for (let index = 0; index < rowLength; index += 1) {
        const left = index >= bytesPerPixel ? current[index - bytesPerPixel]! : 0
        const above = previous[index] ?? 0
        const upperLeft = index >= bytesPerPixel ? previous[index - bytesPerPixel]! : 0
        let predictor = 0
        if (candidateType === 1) predictor = left
        else if (candidateType === 2) predictor = above
        else if (candidateType === 3) predictor = Math.floor((left + above) / 2)
        else if (candidateType === 4) predictor = paethPredictor(left, above, upperLeft)
        const value = ((current[index] ?? 0) - predictor) & 0xff
        candidate[index] = value
        score += Math.abs(value < 128 ? value : value - 256)
      }
      if (score < bestScore) {
        bestType = candidateType
        bestScore = score
        bestRow = candidate
      }
    }

    output[inputOffset] = bestType
    output.set(bestRow, inputOffset + 1)
    previous = current
  }
  return output
}

function optimizePng(bytes: Uint8Array): OptimizationResult {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10]
  if (bytes.length < PNG_SIGNATURE_LENGTH || signature.some((byte, index) => bytes[index] !== byte)) {
    return { bytes, removedMetadata: 0 }
  }

  const chunks: PngChunk[] = []
  let offset = PNG_SIGNATURE_LENGTH
  let reachedEnd = false

  while (offset + 12 <= bytes.length) {
    const dataLength = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0)
    const chunkLength = dataLength + 12
    if (offset + chunkLength > bytes.length) return { bytes, removedMetadata: 0 }
    const type = ascii(bytes, offset + 4, 4)
    chunks.push({
      type,
      data: bytes.slice(offset + 8, offset + 8 + dataLength),
      bytes: bytes.slice(offset, offset + chunkLength),
    })
    offset += chunkLength
    if (type === 'IEND') {
      reachedEnd = true
      break
    }
  }

  if (!reachedEnd) return { bytes, removedMetadata: 0 }

  const removedMetadata = chunks.filter((chunk) => PNG_REMOVABLE.has(chunk.type)).length
  const retainedChunks = chunks.filter((chunk) => !PNG_REMOVABLE.has(chunk.type))
  const metadataOptimized = concat([
    bytes.slice(0, PNG_SIGNATURE_LENGTH),
    ...retainedChunks.map((chunk) => chunk.bytes),
  ])
  let best = metadataOptimized.length < bytes.length ? metadataOptimized : bytes

  const imageData = retainedChunks.filter((chunk) => chunk.type === 'IDAT').map((chunk) => chunk.data)
  if (imageData.length) {
    try {
      const inflated = inflate(concat(imageData))
      const header = retainedChunks.find((chunk) => chunk.type === 'IHDR')?.data
      const recompressedData = deflate(refilterPngScanlines(inflated, header), { level: 9 })
      const recompressedChunks: Uint8Array[] = []
      let wroteImageData = false
      for (const chunk of retainedChunks) {
        if (chunk.type === 'IDAT') {
          if (!wroteImageData) {
            recompressedChunks.push(createPngChunk('IDAT', recompressedData))
            wroteImageData = true
          }
        } else {
          recompressedChunks.push(chunk.bytes)
        }
      }
      const recompressed = concat([bytes.slice(0, PNG_SIGNATURE_LENGTH), ...recompressedChunks])
      if (recompressed.length < best.length) best = recompressed
    } catch {
      // Invalid or unsupported image data still benefits from safe metadata removal.
    }
  }

  return { bytes: best, removedMetadata: best === bytes ? 0 : removedMetadata }
}

function optimizeJpeg(bytes: Uint8Array): OptimizationResult {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return { bytes, removedMetadata: 0 }
  const parts = [bytes.slice(0, 2)]
  let offset = 2
  let removedMetadata = 0

  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== 0xff) return { bytes, removedMetadata: 0 }
    const marker = bytes[offset + 1]
    if (marker === undefined) break
    if (marker === 0xda || marker === 0xd9) {
      parts.push(bytes.slice(offset))
      return { bytes: removedMetadata ? concat(parts) : bytes, removedMetadata }
    }
    if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(bytes.slice(offset, offset + 2))
      offset += 2
      continue
    }
    if (offset + 4 > bytes.length) return { bytes, removedMetadata: 0 }
    const segmentLength = (bytes[offset + 2]! << 8) | bytes[offset + 3]!
    const end = offset + 2 + segmentLength
    if (segmentLength < 2 || end > bytes.length) return { bytes, removedMetadata: 0 }
    if (JPEG_REMOVABLE.has(marker)) removedMetadata += 1
    else parts.push(bytes.slice(offset, end))
    offset = end
  }

  return { bytes, removedMetadata: 0 }
}

function optimizeWebp(bytes: Uint8Array): OptimizationResult {
  if (bytes.length < 12 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') {
    return { bytes, removedMetadata: 0 }
  }
  const chunks: Uint8Array[] = []
  let offset = 12
  let removedMetadata = 0
  let removedExif = false
  let removedXmp = false

  while (offset + 8 <= bytes.length) {
    const type = ascii(bytes, offset, 4)
    const size = new DataView(bytes.buffer, bytes.byteOffset + offset + 4, 4).getUint32(0, true)
    const chunkLength = 8 + size + (size % 2)
    if (offset + chunkLength > bytes.length) return { bytes, removedMetadata: 0 }
    if (type === 'EXIF' || type === 'XMP ') {
      removedMetadata += 1
      removedExif ||= type === 'EXIF'
      removedXmp ||= type === 'XMP '
    } else {
      const chunk = bytes.slice(offset, offset + chunkLength)
      chunks.push(chunk)
    }
    offset += chunkLength
  }

  if (!removedMetadata) return { bytes, removedMetadata: 0 }
  const extendedHeader = chunks.find((chunk) => ascii(chunk, 0, 4) === 'VP8X')
  if (extendedHeader && extendedHeader.length >= 9) {
    if (removedExif) extendedHeader[8] = extendedHeader[8]! & ~0b00001000
    if (removedXmp) extendedHeader[8] = extendedHeader[8]! & ~0b00000100
  }
  const body = concat([bytes.slice(8, 12), ...chunks])
  const header = new Uint8Array(8)
  header.set([82, 73, 70, 70])
  new DataView(header.buffer).setUint32(4, body.length, true)
  return { bytes: concat([header, body]), removedMetadata }
}

function optimizeGif(bytes: Uint8Array): OptimizationResult {
  if (bytes.length < 13 || !ascii(bytes, 0, 6).startsWith('GIF8')) return { bytes, removedMetadata: 0 }
  const packed = bytes[10] ?? 0
  const globalTableSize = packed & 0x80 ? 3 * 2 ** ((packed & 0x07) + 1) : 0
  let offset = 13 + globalTableSize
  const parts = [bytes.slice(0, offset)]
  let removedMetadata = 0

  const readSubBlocksEnd = (start: number) => {
    let cursor = start
    while (cursor < bytes.length) {
      const size = bytes[cursor] ?? 0
      cursor += 1
      if (size === 0) return cursor
      cursor += size
    }
    return -1
  }

  while (offset < bytes.length) {
    const marker = bytes[offset]
    if (marker === 0x3b) {
      parts.push(bytes.slice(offset, offset + 1))
      break
    }
    if (marker === 0x21) {
      const label = bytes[offset + 1]
      const end = readSubBlocksEnd(offset + 2)
      if (end < 0) return { bytes, removedMetadata: 0 }
      const isXmp = label === 0xff && ascii(bytes, offset + 3, 11) === 'XMP DataXMP'
      if (label === 0xfe || isXmp) removedMetadata += 1
      else parts.push(bytes.slice(offset, end))
      offset = end
      continue
    }
    if (marker === 0x2c) {
      if (offset + 10 > bytes.length) return { bytes, removedMetadata: 0 }
      const localPacked = bytes[offset + 9] ?? 0
      const localTableSize = localPacked & 0x80 ? 3 * 2 ** ((localPacked & 0x07) + 1) : 0
      const dataStart = offset + 11 + localTableSize
      const end = readSubBlocksEnd(dataStart)
      if (end < 0) return { bytes, removedMetadata: 0 }
      parts.push(bytes.slice(offset, end))
      offset = end
      continue
    }
    return { bytes, removedMetadata: 0 }
  }
  return { bytes: removedMetadata ? concat(parts) : bytes, removedMetadata }
}

export function optimizeImage(bytes: Uint8Array, mimeType: string): OptimizationResult {
  if (mimeType === 'image/png') return optimizePng(bytes)
  if (mimeType === 'image/jpeg') return optimizeJpeg(bytes)
  if (mimeType === 'image/webp') return optimizeWebp(bytes)
  if (mimeType === 'image/gif') return optimizeGif(bytes)
  return { bytes, removedMetadata: 0 }
}
