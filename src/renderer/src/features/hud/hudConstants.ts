import type { OverlayOpacityMode, PlaystyleMode } from '@shared/types'

export const PLAYSTYLE_MODES: Array<{ key: PlaystyleMode; short: string; tip: string }> = [
  { key: 'steady', short: '⚖️ 稳健', tip: '综合高胜率核心与局势克制，求稳上分' },
  { key: 'counter', short: '🎯 针对', tip: '专治敌方人头大爹、重装坦克与强回血' },
  { key: 'team', short: '🤝 团队', tip: '缺前排补肉、全队偏AP自动转物理/减抗' },
  { key: 'yolo', short: '🔥 独爽', tip: '只顾自己爽！无视防守拉满核弹/暴击伤害上限' },
  { key: 'torment', short: '😈 折磨', tip: '无限灼烧减速或叠肉回血，不死恶心流' }
]

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
