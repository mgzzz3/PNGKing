import { deflate, inflate } from 'pako'

export interface OptimizationOptions {
  strength?: number
  targetSize?: number
}

export interface OptimizationResult {
  bytes: Uint8Array
  removedMetadata: number
  targetReached?: boolean
  smallestSize?: number
}

const DEFAULT_STRENGTH = 6
const STRENGTH_COLORS = [256, 256, 224, 192, 160, 128, 96, 64, 32, 16]
const TARGET_PALETTE_SIZES = [256, 224, 192, 160, 128, 96, 64, 48, 32, 24, 16, 12, 8, 4, 2]

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


interface QuantizedColor {
  red: number
  green: number
  blue: number
  alpha: number
  count: number
}

interface ColorBox {
  colors: QuantizedColor[]
  score: number
}

function decodePngPixels(data: Uint8Array, width: number, height: number, channels: number): Uint8Array | undefined {
  const rowLength = width * channels
  if (data.length !== height * (rowLength + 1)) return undefined
  const pixels = new Uint8Array(width * height * channels)
  let previous = new Uint8Array(rowLength)

  for (let rowIndex = 0; rowIndex < height; rowIndex += 1) {
    const inputOffset = rowIndex * (rowLength + 1)
    const outputOffset = rowIndex * rowLength
    const filterType = data[inputOffset]
    if (filterType === undefined || filterType > 4) return undefined
    const current = pixels.subarray(outputOffset, outputOffset + rowLength)

    for (let index = 0; index < rowLength; index += 1) {
      const left = index >= channels ? current[index - channels]! : 0
      const above = previous[index] ?? 0
      const upperLeft = index >= channels ? previous[index - channels]! : 0
      let predictor = 0
      if (filterType === 1) predictor = left
      else if (filterType === 2) predictor = above
      else if (filterType === 3) predictor = Math.floor((left + above) / 2)
      else if (filterType === 4) predictor = paethPredictor(left, above, upperLeft)
      current[index] = ((data[inputOffset + 1 + index] ?? 0) + predictor) & 0xff
    }
    previous = current
  }

  return pixels
}

function colorBox(colors: QuantizedColor[]): ColorBox {
  let minRed = 255
  let minGreen = 255
  let minBlue = 255
  let minAlpha = 255
  let maxRed = 0
  let maxGreen = 0
  let maxBlue = 0
  let maxAlpha = 0
  let population = 0
  for (const color of colors) {
    minRed = Math.min(minRed, color.red)
    minGreen = Math.min(minGreen, color.green)
    minBlue = Math.min(minBlue, color.blue)
    minAlpha = Math.min(minAlpha, color.alpha)
    maxRed = Math.max(maxRed, color.red)
    maxGreen = Math.max(maxGreen, color.green)
    maxBlue = Math.max(maxBlue, color.blue)
    maxAlpha = Math.max(maxAlpha, color.alpha)
    population += color.count
  }
  const range = Math.max(maxRed - minRed, maxGreen - minGreen, maxBlue - minBlue, (maxAlpha - minAlpha) * 2)
  return { colors, score: range * Math.sqrt(population) }
}

function splitColorBox(box: ColorBox): [ColorBox, ColorBox] | undefined {
  if (box.colors.length < 2) return undefined
  const channels = ['red', 'green', 'blue', 'alpha'] as const
  let splitChannel: typeof channels[number] = 'red'
  let largestRange = -1
  for (const channel of channels) {
    let minimum = 255
    let maximum = 0
    for (const color of box.colors) {
      minimum = Math.min(minimum, color[channel])
      maximum = Math.max(maximum, color[channel])
    }
    const range = (maximum - minimum) * (channel === 'alpha' ? 2 : 1)
    if (range > largestRange) {
      largestRange = range
      splitChannel = channel
    }
  }

  const sorted = [...box.colors].sort((left, right) => left[splitChannel] - right[splitChannel])
  const population = sorted.reduce((sum, color) => sum + color.count, 0)
  let cumulative = 0
  let splitIndex = 1
  for (; splitIndex < sorted.length; splitIndex += 1) {
    cumulative += sorted[splitIndex - 1]!.count
    if (cumulative >= population / 2) break
  }
  return [colorBox(sorted.slice(0, splitIndex)), colorBox(sorted.slice(splitIndex))]
}

function createPalette(pixels: Uint8Array, channels: number, maximumColors = 256) {
  const histogram = new Map<number, QuantizedColor>()
  for (let offset = 0; offset < pixels.length; offset += channels) {
    const alpha = channels === 4 ? pixels[offset + 3]! : 255
    const red = alpha === 0 ? 0 : pixels[offset]!
    const green = alpha === 0 ? 0 : pixels[offset + 1]!
    const blue = alpha === 0 ? 0 : pixels[offset + 2]!
    const key = ((red >> 3) << 14) | ((green >> 3) << 9) | ((blue >> 3) << 4) | (alpha >> 4)
    const existing = histogram.get(key)
    if (existing) {
      const count = existing.count + 1
      existing.red += (red - existing.red) / count
      existing.green += (green - existing.green) / count
      existing.blue += (blue - existing.blue) / count
      existing.alpha += (alpha - existing.alpha) / count
      existing.count = count
    } else {
      histogram.set(key, { red, green, blue, alpha, count: 1 })
    }
  }

  const boxes = [colorBox([...histogram.values()])]
  while (boxes.length < maximumColors) {
    boxes.sort((left, right) => right.score - left.score)
    const index = boxes.findIndex((box) => box.colors.length > 1)
    if (index < 0) break
    const split = splitColorBox(boxes[index]!)
    if (!split) break
    boxes.splice(index, 1, ...split)
  }

  const palette = boxes.map((box) => {
    let population = 0
    let red = 0
    let green = 0
    let blue = 0
    let alpha = 0
    for (const color of box.colors) {
      population += color.count
      red += color.red * color.count
      green += color.green * color.count
      blue += color.blue * color.count
      alpha += color.alpha * color.count
    }
    return {
      red: Math.round(red / population),
      green: Math.round(green / population),
      blue: Math.round(blue / population),
      alpha: Math.round(alpha / population),
    }
  })

  const lookup = new Map<number, number>()
  for (const [key, color] of histogram) {
    let bestIndex = 0
    let bestDistance = Number.POSITIVE_INFINITY
    for (let index = 0; index < palette.length; index += 1) {
      const candidate = palette[index]!
      const redDistance = color.red - candidate.red
      const greenDistance = color.green - candidate.green
      const blueDistance = color.blue - candidate.blue
      const alphaDistance = color.alpha - candidate.alpha
      const distance = redDistance * redDistance * 2 + greenDistance * greenDistance * 4
        + blueDistance * blueDistance + alphaDistance * alphaDistance * 4
      if (distance < bestDistance) {
        bestDistance = distance
        bestIndex = index
      }
    }
    lookup.set(key, bestIndex)
  }

  return { palette, lookup }
}

function quantizePng(chunks: PngChunk[], inflated: Uint8Array, maximumColors: number): Uint8Array | undefined {
  const headerChunk = chunks.find((chunk) => chunk.type === 'IHDR')
  if (!headerChunk || headerChunk.data.length !== 13 || chunks.some((chunk) => chunk.type === 'acTL')) return undefined
  const header = headerChunk.data
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength)
  const width = view.getUint32(0)
  const height = view.getUint32(4)
  const bitDepth = header[8]
  const colorType = header[9]
  const interlace = header[12]
  if (!width || !height || bitDepth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6)) return undefined

  const channels = colorType === 6 ? 4 : 3
  const pixels = decodePngPixels(inflated, width, height, channels)
  if (!pixels) return undefined
  const { palette, lookup } = createPalette(pixels, channels, maximumColors)
  if (!palette.length) return undefined

  const scanlines = new Uint8Array(height * (width + 1))
  for (let row = 0; row < height; row += 1) {
    const scanlineOffset = row * (width + 1)
    const pixelOffset = row * width * channels
    scanlines[scanlineOffset] = 0
    for (let column = 0; column < width; column += 1) {
      const offset = pixelOffset + column * channels
      const alpha = channels === 4 ? pixels[offset + 3]! : 255
      const red = alpha === 0 ? 0 : pixels[offset]!
      const green = alpha === 0 ? 0 : pixels[offset + 1]!
      const blue = alpha === 0 ? 0 : pixels[offset + 2]!
      const key = ((red >> 3) << 14) | ((green >> 3) << 9) | ((blue >> 3) << 4) | (alpha >> 4)
      scanlines[scanlineOffset + column + 1] = lookup.get(key) ?? 0
    }
  }

  const paletteData = new Uint8Array(palette.length * 3)
  const alphaData = new Uint8Array(palette.length)
  let lastTransparent = -1
  palette.forEach((color, index) => {
    paletteData[index * 3] = color.red
    paletteData[index * 3 + 1] = color.green
    paletteData[index * 3 + 2] = color.blue
    alphaData[index] = color.alpha
    if (color.alpha !== 255) lastTransparent = index
  })

  const indexedHeader = header.slice()
  indexedHeader[9] = 3
  const compressed = deflate(refilterPngScanlines(scanlines, indexedHeader), { level: 9 })
  const incompatibleChunks = new Set(['IDAT', 'PLTE', 'tRNS', 'hIST', 'bKGD', 'sBIT'])
  const output: Uint8Array[] = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])]
  let wrotePalette = false
  for (const chunk of chunks) {
    if (chunk.type === 'IHDR') {
      output.push(createPngChunk('IHDR', indexedHeader))
      continue
    }
    if (chunk.type === 'IDAT' && !wrotePalette) {
      output.push(createPngChunk('PLTE', paletteData))
      if (lastTransparent >= 0) output.push(createPngChunk('tRNS', alphaData.slice(0, lastTransparent + 1)))
      output.push(createPngChunk('IDAT', compressed))
      wrotePalette = true
      continue
    }
    if (!incompatibleChunks.has(chunk.type)) output.push(chunk.bytes)
  }
  return wrotePalette ? concat(output) : undefined
}

function optimizePng(bytes: Uint8Array, options: OptimizationOptions): OptimizationResult {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10]
  if (bytes.length < PNG_SIGNATURE_LENGTH || signature.some((byte, index) => bytes[index] !== byte)) {
    return { bytes, removedMetadata: 0, targetReached: options.targetSize === undefined || bytes.length <= options.targetSize }
  }

  const chunks: PngChunk[] = []
  let offset = PNG_SIGNATURE_LENGTH
  let reachedEnd = false

  while (offset + 12 <= bytes.length) {
    const dataLength = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0)
    const chunkLength = dataLength + 12
    if (offset + chunkLength > bytes.length) return { bytes, removedMetadata: 0, targetReached: options.targetSize === undefined || bytes.length <= options.targetSize }
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

  if (!reachedEnd) return { bytes, removedMetadata: 0, targetReached: options.targetSize === undefined || bytes.length <= options.targetSize }

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

      const targetSize = options.targetSize
      if (targetSize !== undefined) {
        const candidates = [bytes, metadataOptimized, recompressed]
        for (const maximumColors of TARGET_PALETTE_SIZES) {
          const quantized = quantizePng(retainedChunks, inflated, maximumColors)
          if (quantized) candidates.push(quantized)
        }
        const eligible = candidates.filter((candidate) => candidate.length <= targetSize)
        const smallestSize = Math.min(...candidates.map((candidate) => candidate.length))
        if (!eligible.length) {
          return { bytes, removedMetadata: 0, targetReached: false, smallestSize }
        }
        best = eligible.reduce((closest, candidate) => candidate.length > closest.length ? candidate : closest)
      } else {
        const strength = Math.min(9, Math.max(1, Math.round(options.strength ?? DEFAULT_STRENGTH)))
        const quantized = quantizePng(retainedChunks, inflated, STRENGTH_COLORS[strength]!)
        if (quantized && quantized.length < best.length) best = quantized
      }
    } catch {
      // Invalid or unsupported image data still benefits from safe metadata removal.
    }
  }

  const targetReached = options.targetSize === undefined || best.length <= options.targetSize
  return { bytes: best, removedMetadata: best === bytes ? 0 : removedMetadata, targetReached, smallestSize: best.length }
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

export function optimizeImage(
  bytes: Uint8Array,
  mimeType: string,
  options: OptimizationOptions = {},
): OptimizationResult {
  if (mimeType === 'image/png') return optimizePng(bytes, options)

  let result: OptimizationResult
  if (mimeType === 'image/jpeg') result = optimizeJpeg(bytes)
  else if (mimeType === 'image/webp') result = optimizeWebp(bytes)
  else if (mimeType === 'image/gif') result = optimizeGif(bytes)
  else result = { bytes, removedMetadata: 0 }

  if (options.targetSize === undefined) return { ...result, targetReached: true }
  const candidates = [bytes, result.bytes]
  const eligible = candidates.filter((candidate) => candidate.length <= options.targetSize!)
  return eligible.length
    ? { ...result, bytes: eligible.reduce((closest, candidate) => candidate.length > closest.length ? candidate : closest), targetReached: true }
    : { bytes, removedMetadata: 0, targetReached: false, smallestSize: Math.min(...candidates.map((candidate) => candidate.length)) }
}
