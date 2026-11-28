import type { OverlayOpacityMode } from '@shared/types'

export const TEN_BENCH_TEST_IDS = ['10', '223', '54', '222', '36', '14', '67', '238', '16', '51']

export function resolveTopPillSurface(
  opacityMode: OverlayOpacityMode,
  isHighlighted: boolean
): string {
  if (opacityMode === 'clear') {
    return 'bg-[#070B12]/66 border-white/25 opacity-95'
  }
  if (opacityMode === 'glass') {
    return 'bg-[#09101D]/84 border-[#C8AA6E]/45 opacity-95'
  }
  return isHighlighted
    ? 'bg-[#09101D]/95 border-[#C8AA6E]/55 opacity-100'
    : 'bg-[#09101D]/68 border-white/15 opacity-82'
}

export function resolveFountainSurface(opacityMode: OverlayOpacityMode): string {
  if (opacityMode === 'clear') return 'bg-[#070B12]/72 border-[#C8AA6E]/35'
  if (opacityMode === 'glass') return 'bg-[#09101D]/86 border-[#C8AA6E]/45'
  return 'bg-[#09101D]/95 border-[#C8AA6E]/45'
}

export function resolveBenchBadgeSurface(
  opacityMode: OverlayOpacityMode,
  isHot: boolean
): string {
  if (opacityMode === 'clear') {
    return isHot ? 'bg-[#071B26]/72 border-[#0AC8B9]' : 'bg-[#070B12]/66 border-white/20'
  }
  if (opacityMode === 'glass') {
    return isHot
      ? 'bg-[#07202E]/86 border-[#0AC8B9]'
      : 'bg-[#090F1A]/84 border-white/25'
  }
  return isHot
    ? 'bg-[#07202E]/95 border-[#0AC8B9] shadow-[0_0_12px_rgba(10,200,185,0.28)]'
    : 'bg-[#090F1A]/94 border-white/25'
}
