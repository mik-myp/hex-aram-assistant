import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateSync } from 'node:zlib'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SEED_PATH = resolve(__dirname, '../resources/seed-data/seed-bundle.json')
const OUT_PATH = resolve(__dirname, '../resources/seed-data/augment-icon-fingerprints.json')
const FP_SIZE = 16

function paethPredictor(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  if (pb <= pc) return b
  return c
}

/**
 * Minimal zero-dependency 8-bit PNG -> RGBA decoder supporting colorType 0/2/3/4/6 & all 5 PNG filters.
 */
function decodePngToRgba(buf) {
  if (buf.length < 33 || buf.readUInt32BE(0) !== 0x89504e47) {
    throw new Error('Not a valid PNG')
  }
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  let palette = null
  let trns = null
  const idatChunks = []

  let pos = 8
  while (pos + 12 <= buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString('ascii', pos + 4, pos + 8)
    const dataStart = pos + 8
    const dataEnd = dataStart + len
    if (dataEnd > buf.length) break
    const chunk = buf.subarray(dataStart, dataEnd)

    if (type === 'IHDR') {
      width = chunk.readUInt32BE(0)
      height = chunk.readUInt32BE(4)
      bitDepth = chunk[8]
      colorType = chunk[9]
      if (bitDepth !== 8 || chunk[12] !== 0) {
        throw new Error(`Unsupported PNG bitDepth=${bitDepth} interlace=${chunk[12]}`)
      }
    } else if (type === 'PLTE') {
      palette = chunk
    } else if (type === 'tRNS') {
      trns = chunk
    } else if (type === 'IDAT') {
      idatChunks.push(chunk)
    } else if (type === 'IEND') {
      break
    }
    pos = dataEnd + 4
  }

  const bppMap = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }
  const bpp = bppMap[colorType]
  if (!bpp || width <= 0 || height <= 0) {
    throw new Error(`Unsupported PNG format colorType=${colorType} ${width}x${height}`)
  }

  const raw = inflateSync(Buffer.concat(idatChunks))
  const stride = width * bpp
  const recon = new Uint8Array(height * stride)

  let inOff = 0
  for (let y = 0; y < height; y++) {
    const filter = raw[inOff++]
    const rowOff = y * stride
    const prevOff = (y - 1) * stride
    for (let x = 0; x < stride; x++) {
      const xVal = raw[inOff++]
      const a = x >= bpp ? recon[rowOff + x - bpp] : 0
      const b = y > 0 ? recon[prevOff + x] : 0
      const c = y > 0 && x >= bpp ? recon[prevOff + x - bpp] : 0
      let val = xVal
      if (filter === 1) val = (xVal + a) & 0xff
      else if (filter === 2) val = (xVal + b) & 0xff
      else if (filter === 3) val = (xVal + ((a + b) >> 1)) & 0xff
      else if (filter === 4) val = (xVal + paethPredictor(a, b, c)) & 0xff
      recon[rowOff + x] = val
    }
  }

  const rgba = new Uint8Array(width * height * 4)
  for (let i = 0, p = 0; i < width * height; i++, p += 4) {
    if (colorType === 6) {
      rgba[p] = recon[p]
      rgba[p + 1] = recon[p + 1]
      rgba[p + 2] = recon[p + 2]
      rgba[p + 3] = recon[p + 3]
    } else if (colorType === 2) {
      const s = i * 3
      rgba[p] = recon[s]
      rgba[p + 1] = recon[s + 1]
      rgba[p + 2] = recon[s + 2]
      rgba[p + 3] = 255
    } else if (colorType === 4) {
      const s = i * 2
      rgba[p] = recon[s]
      rgba[p + 1] = recon[s]
      rgba[p + 2] = recon[s]
      rgba[p + 3] = recon[s + 1]
    } else if (colorType === 0) {
      const g = recon[i]
      rgba[p] = g
      rgba[p + 1] = g
      rgba[p + 2] = g
      rgba[p + 3] = 255
    } else if (colorType === 3 && palette) {
      const idx = recon[i]
      rgba[p] = palette[idx * 3] || 0
      rgba[p + 1] = palette[idx * 3 + 1] || 0
      rgba[p + 2] = palette[idx * 3 + 2] || 0
      rgba[p + 3] = trns && idx < trns.length ? trns[idx] : 255
    }
  }

  return { width, height, rgba }
}

function extract16x16Silhouette(rgba, width, height) {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rgba[(y * width + x) * 4 + 3] > 24) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX <= minX || maxY <= minY) {
    minX = 0
    minY = 0
    maxX = width - 1
    maxY = height - 1
  }

  const side = Math.max(maxX - minX + 1, maxY - minY + 1)
  const cropSide = side * 1.12
  const cx = (minX + maxX + 1) / 2
  const cy = (minY + maxY + 1) / 2
  const x0 = cx - cropSide / 2
  const y0 = cy - cropSide / 2
  const step = cropSide / FP_SIZE
  const out = Buffer.alloc(FP_SIZE * FP_SIZE)

  for (let gy = 0; gy < FP_SIZE; gy++) {
    const sy0 = Math.max(0, Math.floor(y0 + gy * step))
    const sy1 = Math.min(height, Math.max(sy0 + 1, Math.ceil(y0 + (gy + 1) * step)))
    for (let gx = 0; gx < FP_SIZE; gx++) {
      const sx0 = Math.max(0, Math.floor(x0 + gx * step))
      const sx1 = Math.min(width, Math.max(sx0 + 1, Math.ceil(x0 + (gx + 1) * step)))
      let acc = 0
      let cnt = 0
      for (let py = sy0; py < sy1; py++) {
        for (let px = sx0; px < sx1; px++) {
          const i = (py * width + px) * 4
          const a = rgba[i + 3] / 255
          acc += (0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]) * a
          cnt++
        }
      }
      out[gy * FP_SIZE + gx] = cnt > 0 ? Math.min(255, Math.round(acc / cnt)) : 0
    }
  }
  return out
}

async function main() {
  const bundle = JSON.parse(await readFile(SEED_PATH, 'utf-8'))
  const augments = Object.values(bundle.augments || {})
  const queue = augments.filter((a) => a.iconUrl)
  const entries = {}
  let ok = 0
  let failed = 0

  console.log(`Building 16x16 silhouette fingerprints for ${queue.length} augments...`)
  const workers = Array.from({ length: 16 }, async () => {
    while (queue.length > 0) {
      const aug = queue.shift()
      if (!aug) break
      try {
        const res = await fetch(aug.iconUrl, { signal: AbortSignal.timeout(12000) })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const buf = Buffer.from(await res.arrayBuffer())
        const { width, height, rgba } = decodePngToRgba(buf)
        const fp = extract16x16Silhouette(rgba, width, height)
        entries[aug.id] = fp.toString('base64')
        ok++
      } catch (err) {
        failed++
        console.warn(`  [SKIP] ${aug.id} (${aug.name}): ${err instanceof Error ? err.message : err}`)
      }
    }
  })

  await Promise.all(workers)
  const sortedEntries = {}
  for (const id of Object.keys(entries).sort((a, b) => Number(a) - Number(b))) {
    sortedEntries[id] = entries[id]
  }

  const payload = { version: 1, size: FP_SIZE, entries: sortedEntries }
  const json = JSON.stringify(payload)
  await writeFile(OUT_PATH, json, 'utf-8')
  console.log(
    `✓ Built ${OUT_PATH} (${(Buffer.byteLength(json) / 1024).toFixed(1)} KB) — ${ok} ok, ${failed} failed.`
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
