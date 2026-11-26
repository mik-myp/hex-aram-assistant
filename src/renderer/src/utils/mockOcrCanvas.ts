import type { AugmentMeta } from '@shared/types'

/**
 * Generates a realistic 3-card Hextech Augment selection screenshot DataURL on an HTML5 Canvas.
 * Used in Simulator mode on macOS/offline so users can verify the real Tesseract Chinese OCR +
 * fuzzy dictionary matching pipeline end-to-end without needing a running Windows LoL match!
 */
export function renderSimulatedThreeCardsDataUrl(cards: AugmentMeta[]): string {
  const canvas = document.createElement('canvas')
  canvas.width = 1280
  canvas.height = 460
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  // Dark background provides high contrast similar to in-game Hextech selection modal
  ctx.fillStyle = '#090E17'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const cardWidth = 340
  const cardHeight = 320
  const gap = 48
  const startX = Math.round((canvas.width - (cardWidth * 3 + gap * 2)) / 2)
  const startY = 70

  cards.slice(0, 3).forEach((card, idx) => {
    const x = startX + idx * (cardWidth + gap)
    const y = startY

    ctx.fillStyle = '#111A2B'
    ctx.fillRect(x, y, cardWidth, cardHeight)

    ctx.strokeStyle =
      card.rarity === 'prismatic' ? '#C084FC' : card.rarity === 'gold' ? '#D4AF37' : '#94A3B8'
    ctx.lineWidth = 3
    ctx.strokeRect(x, y, cardWidth, cardHeight)

    // Crisp Chinese title in the exact card title zone
    ctx.fillStyle = '#FFFFFF'
    ctx.font = 'bold 34px "PingFang SC", "Microsoft YaHei", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(card.name, x + cardWidth / 2, y + 135)

    // Rarity subtitle
    ctx.fillStyle = '#CBD5E1'
    ctx.font = '20px "PingFang SC", "Microsoft YaHei", sans-serif'
    const rarityLabel =
      card.rarity === 'prismatic' ? '棱彩强化' : card.rarity === 'gold' ? '黄金强化' : '白银强化'
    ctx.fillText(rarityLabel, x + cardWidth / 2, y + 205)
  })

  return canvas.toDataURL('image/png')
}
