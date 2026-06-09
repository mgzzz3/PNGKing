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

function optimizePng(bytes: Uint8Array): OptimizationResult {
  if (bytes.length < PNG_SIGNATURE_LENGTH) return { bytes, removedMetadata: 0 }
  const parts = [bytes.slice(0, PNG_SIGNATURE_LENGTH)]
  let offset = PNG_SIGNATURE_LENGTH
  let removedMetadata = 0

  while (offset + 12 <= bytes.length) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset)
    const dataLength = view.getUint32(0)
    const chunkLength = dataLength + 12
    if (offset + chunkLength > bytes.length) return { bytes, removedMetadata: 0 }
    const type = ascii(bytes, offset + 4, 4)
    if (PNG_REMOVABLE.has(type)) removedMetadata += 1
    else parts.push(bytes.slice(offset, offset + chunkLength))
    offset += chunkLength
    if (type === 'IEND') break
  }

  return { bytes: removedMetadata ? concat(parts) : bytes, removedMetadata }
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
