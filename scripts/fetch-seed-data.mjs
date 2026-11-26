import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pinyin } from 'pinyin-pro'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(__dirname, '../resources/seed-data')

const ARAMHEX_BASES = [
  'https://raw.githubusercontent.com/czgreat/aramhex-data/main',
  'https://cdn.jsdelivr.net/gh/czgreat/aramhex-data@main'
]

const RARITY_FIX = {
  '2078': 'gold'
}

const KEY_MAP = { '1': 'Q', '2': 'W', '3': 'E', '4': 'R' }

async function fetchJsonWithFallback(urls, headers = {}) {
  let lastErr = null
  for (const url of urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(25000), headers })
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
      return await res.json()
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr
}

function pyIndex(text) {
  const cleaned = String(text || '').replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '')
  if (!cleaned) return { full: '', initials: '' }
  return {
    full: pinyin(cleaned, { toneType: 'none', type: 'array' }).join('').toLowerCase(),
    initials: pinyin(cleaned, { pattern: 'first', toneType: 'none', type: 'array' })
      .join('')
      .toLowerCase()
  }
}

function cleanAugmentDesc(rawDesc, dataValues = {}) {
  if (!rawDesc) return ''
  let text = rawDesc
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/?[^>]+>/g, '')

  text = text.replace(/@([A-Za-z0-9_]+)(\*100)?@/g, (_, key, mult100) => {
    const rawVal = dataValues[key]
    const val = Array.isArray(rawVal) ? rawVal[0] : rawVal
    if (typeof val === 'number') {
      const num = mult100 ? val * 100 : val
      return Number.isInteger(num) ? String(num) : Number(num.toFixed(1)).toString()
    }
    return ''
  })

  // Clean Riot inline icon tokens (%i:scaleCrit%, etc.) and leftover @Var@ placeholders
  text = text
    .replace(/%i:[A-Za-z0-9_]+%/g, '')
    .replace(/%%/g, '%')
    .replace(/@[A-Za-z0-9_.*+-]+@/g, '一定')
  return text.replace(/\s+/g, ' ').trim()
}

function extractItemBrief(itemDesc = '', plaintext = '') {
  if (plaintext && plaintext.trim().length >= 4) return plaintext.trim()
  const lines = String(itemDesc)
    .split(/[\r\n]+/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length === 0) return ''

  // Separate stat lines (like "400生命值") from passive effect lines
  const statLines = lines.filter((l) => /^\d+%?\s*[\u4e00-\u9fa5]+$/.test(l))
  const effectLines = lines.filter(
    (l) => !/^\d+%?\s*[\u4e00-\u9fa5]+$/.test(l) && l.length >= 6
  )

  if (effectLines.length > 0) {
    const firstSentence = effectLines[0].split(/[。；]/)[0]
    return firstSentence.length > 44 ? `${firstSentence.slice(0, 42)}…` : firstSentence
  }
  return statLines.slice(0, 3).join(' · ')
}

function inferTags(name, desc, displayTags = []) {
  const combined = `${name} ${desc}`
  const tags = new Set()
  if (/暴击|珠光|无尽/.test(combined) || displayTags.includes('kCriticalStrike')) tags.add('crit')
  if (/灼烧|燃烧|炼狱|火|持续伤害|腐蚀/.test(combined)) tags.add('burn')
  if (/治疗|回复|全能吸血|生命偷取|续航/.test(combined) || displayTags.includes('kHealing'))
    tags.add('heal')
  if (/护盾/.test(combined)) tags.add('shield')
  if (/技能急速|冷却|刷新|缩减|尤里卡/.test(combined) || displayTags.includes('kCooldown'))
    tags.add('haste')
  if (
    !/巨人杀手|杀手/.test(name) &&
    (/歌利亚|泰坦|坚韧|双抗|护甲|魔抗|心之钢|不灭|星界躯体|坦克|最大生命值提高/.test(combined) ||
      displayTags.includes('kTank'))
  ) {
    tags.add('tank')
  }
  if (
    /攻击速度|普攻|攻击特效|双刀|射程|瞄准镜|巨人杀手/.test(combined) ||
    displayTags.includes('kAttackSpeed')
  ) {
    tags.add('onhit')
  }
  if (
    /移动速度|冲刺|雪球|位移|闪现|隐身|家园卫士|急急小子/.test(combined) ||
    displayTags.includes('kMovement')
  ) {
    tags.add('mobility')
  }
  return tags.size > 0 ? [...tags] : ['general']
}

function computeTier(smoothedWr, pickRate, allHeroWrSorted) {
  const idx = allHeroWrSorted.findIndex((w) => smoothedWr >= w)
  const pct = idx === -1 ? 1 : idx / Math.max(1, allHeroWrSorted.length)
  const adjusted = pct - (pickRate > 0.01 ? 0.03 : 0)
  if (adjusted <= 0.12) return 'T0'
  if (adjusted <= 0.30) return 'T1'
  if (adjusted <= 0.62) return 'T2'
  if (adjusted <= 0.85) return 'T3'
  return 'T4'
}

async function fetchHeroMlolExtras(heroIds) {
  const extras = new Map()
  const queue = [...heroIds]
  const workers = Array.from({ length: 16 }, async () => {
    while (queue.length > 0) {
      const hid = queue.shift()
      if (!hid) break
      try {
        const res = await fetch(
          `https://mlol.qt.qq.com/go/battle_info/odp_proxy/fuwen_hero_rank?championid=${hid}`,
          {
            headers: { Referer: 'https://101.qq.com/' },
            signal: AbortSignal.timeout(8000)
          }
        )
        if (!res.ok) continue
        const data = await res.json()
        const fv = data?.data?._fieldValues
        if (!fv) continue
        const firstVal = Object.values(fv)[0]
        if (typeof firstVal !== 'string') continue
        const inner = JSON.parse(firstVal)

        let skillOrder = ''
        if (inner.skill_json) {
          const skObj = JSON.parse(inner.skill_json)
          const qwe = skObj?.['1']?.qwe || ''
          const parts = qwe
            .split('&')
            .map((k) => KEY_MAP[k])
            .filter(Boolean)
          if (parts.length >= 2) {
            skillOrder = `主${parts[0]} · 副${parts[1]}`
          }
        }

        const topShoes = []
        if (typeof inner.itemshoes === 'string' && inner.itemshoes.length > 0) {
          for (const seg of inner.itemshoes.split('#')) {
            const [itemId, pickStr, winStr] = seg.split('$')
            const pickRate = Number(pickStr)
            const winRate = Number(winStr)
            if (itemId && pickRate >= 0.03 && !Number.isNaN(winRate)) {
              topShoes.push({
                itemId,
                pickRate: Number(pickRate.toFixed(4)),
                winRate: Number(winRate.toFixed(4))
              })
            }
          }
          topShoes.sort((a, b) => b.pickRate - a.pickRate)
        }

        extras.set(hid, { skillOrder, topShoes: topShoes.slice(0, 2) })
      } catch {
        // Non-fatal fallback
      }
    }
  })
  await Promise.all(workers)
  return extras
}

async function main() {
  console.log('1/5 Fetching latest.json & index.json from aramhex-data...')
  const [latest, indexManifest] = await Promise.all([
    fetchJsonWithFallback(ARAMHEX_BASES.map((b) => `${b}/latest.json`)),
    fetchJsonWithFallback(ARAMHEX_BASES.map((b) => `${b}/index.json`)).catch(() => ({
      datasets: []
    }))
  ])
  const patchPath = latest.path
  console.log(`   -> Patch ${latest.patch} (${patchPath}, seq=${latest.seq}, matches=${latest.matches})`)

  const fetchPatchFile = (file) =>
    fetchJsonWithFallback(ARAMHEX_BASES.map((b) => `${b}/${patchPath}/${file}`))

  console.log('2/5 Fetching stats tables, Tencent kiwi_augments, items.js, and CDragon...')
  const [
    rawHeroes,
    rawAugments,
    rawHeroAugments,
    rawCoreBuilds,
    rawHeroItems,
    rawHeroAugmentItems,
    rawHeroSpells,
    rawItemMeta,
    gtimgHeroList,
    gtimgKiwiAugments,
    gtimgItemsJs,
    cdragonCherry,
    cdragonArenaZh
  ] = await Promise.all([
    fetchPatchFile('heroes.json'),
    fetchPatchFile('augments.json'),
    fetchPatchFile('hero_augments.json'),
    fetchPatchFile('core_builds.json'),
    fetchPatchFile('hero_items.json'),
    fetchPatchFile('hero_augment_items.json'),
    fetchPatchFile('hero_spells.json'),
    fetchPatchFile('item_metadata.json'),
    fetchJsonWithFallback(['https://game.gtimg.cn/images/lol/act/img/js/heroList/hero_list.js']),
    fetchJsonWithFallback(['https://game.gtimg.cn/images/lol/act/img/js/kiwi/kiwi_augments.json']),
    fetchJsonWithFallback(['https://game.gtimg.cn/images/lol/act/img/js/items/items.js']),
    fetchJsonWithFallback([
      'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/zh_cn/v1/cherry-augments.json'
    ]),
    fetchJsonWithFallback(['https://raw.communitydragon.org/latest/cdragon/arena/zh_cn.json'])
  ])

  console.log('3/5 Fetching Q/W/E skill max orders & top boots for 173 champions...')
  const heroExtras = await fetchHeroMlolExtras(Object.keys(rawHeroes))
  console.log(`   -> Enriched ${heroExtras.size}/${Object.keys(rawHeroes).length} champions with skill orders & boots`)

  console.log('4/5 Indexing champions, 100% complete augments, items with 1-line briefs...')
  const gtimgById = new Map()
  for (const h of gtimgHeroList.hero || []) {
    gtimgById.set(String(h.heroId), h)
  }

  const kiwiById = new Map()
  const kiwiByName = new Map()
  for (const k of gtimgKiwiAugments || []) {
    kiwiById.set(String(k.augmentID), k)
    if (k.name_cn) kiwiByName.set(k.name_cn.trim(), k)
  }

  const gtItemById = new Map()
  for (const it of gtimgItemsJs?.items || []) {
    gtItemById.set(String(it.itemId), it)
  }

  const cherryById = new Map()
  const cherryByName = new Map()
  for (const c of cdragonCherry || []) {
    cherryById.set(String(c.id), c)
    if (c.nameTRA) cherryByName.set(c.nameTRA.trim(), c)
  }

  const arenaById = new Map()
  const arenaByName = new Map()
  const arenaByApi = new Map()
  for (const a of cdragonArenaZh?.augments || []) {
    arenaById.set(String(a.id), a)
    if (a.name) arenaByName.set(a.name.trim(), a)
    if (a.apiName) arenaByApi.set(a.apiName.toLowerCase(), a)
  }

  const augments = {}
  let missingDescCount = 0
  for (const [id, info] of Object.entries(rawAugments)) {
    const name = info.name
    const kiwi = kiwiById.get(id) || kiwiByName.get(name)
    const cherry = cherryById.get(id) || cherryByName.get(name)
    const strippedApi = cherry?.augmentNameId
      ? cherry.augmentNameId.replace(/^ARAM_/i, '').toLowerCase()
      : ''
    const arena =
      arenaById.get(id) ||
      arenaByName.get(name) ||
      (strippedApi ? arenaByApi.get(strippedApi) : undefined)

    let iconUrl = ''
    if (cherry?.augmentLargeIconPath) {
      const rel = cherry.augmentLargeIconPath.replace(/^\/lol-game-data\/assets\//i, '').toLowerCase()
      iconUrl = `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/${rel}`
    } else if (arena?.iconLarge) {
      iconUrl = `https://raw.communitydragon.org/latest/game/${arena.iconLarge.toLowerCase()}`
    }

    const rawDescSource =
      arena?.desc || kiwi?.tooltip || kiwi?.desc || cherry?.summaryDescription || ''
    const desc = cleanAugmentDesc(rawDescSource, arena?.dataValues || {})
    if (!desc) missingDescCount++

    const py = pyIndex(name)
    const dTags = cherry?.augmentDisplayTags || []
    const rarity = RARITY_FIX[id] || info.rarity

    augments[id] = {
      id,
      name,
      rarity,
      desc:
        desc ||
        `${rarity === 'prismatic' ? '棱彩阶' : rarity === 'gold' ? '黄金阶' : '白银阶'}海斗专属强化符文`,
      iconUrl,
      tags: inferTags(name, desc, dTags),
      pinyinFull: py.full,
      pinyinInitials: py.initials
    }
  }
  console.log(`   -> Augments missing detailed text: ${missingDescCount}/${Object.keys(augments).length}`)

  const tempHeroWr = Object.values(rawHeroes)
    .map((h) => (h.wins + 150) / (h.games + 300))
    .sort((a, b) => b - a)

  const heroes = {}
  for (const [id, h] of Object.entries(rawHeroes)) {
    const gt = gtimgById.get(id)
    const ex = heroExtras.get(id)
    const alias = gt?.alias || `Hero${id}`
    const roles = (gt?.roles || ['fighter']).filter(Boolean)
    const atk = Number(gt?.attack || 5)
    const mag = Number(gt?.magic || 5)
    const def = Number(gt?.defense || 5)
    let damageType = 'MIXED'
    if (roles.includes('tank') && def >= 7 && mag < 8 && atk < 8) damageType = 'TANK'
    else if (mag >= atk + 3) damageType = 'AP'
    else if (atk >= mag + 2) damageType = 'AD'

    const smoothedWinRate = Number(((h.wins + 150) / (h.games + 300)).toFixed(5))
    const kw = gt?.keywords || `${h.name},${h.title},${alias}`
    const py = pyIndex(`${h.name}${h.title}`)

    heroes[id] = {
      id,
      alias,
      name: h.name,
      title: h.title,
      roles,
      damageType,
      avatarUrl: `https://game.gtimg.cn/images/lol/act/img/champion/${alias}.png`,
      games: h.games,
      wins: h.wins,
      winRate: h.win_rate,
      smoothedWinRate,
      pickRate: h.pick_rate,
      rank: h.rank,
      tier: computeTier(smoothedWinRate, h.pick_rate, tempHeroWr),
      skillOrder: ex?.skillOrder || undefined,
      topShoes: ex?.topShoes?.length ? ex.topShoes : undefined,
      pinyinFull: `${py.full},${kw.toLowerCase()}`,
      pinyinInitials: py.initials
    }
  }

  const items = {}
  for (const [id, im] of Object.entries(rawItemMeta)) {
    const gtIt = gtItemById.get(id)
    const fullDesc = String(gtIt?.item_desc || '').trim()
    const brief = extractItemBrief(fullDesc, gtIt?.plaintext || '')
    items[id] = {
      id,
      name: im.name,
      iconUrl: im.icon || `https://game.gtimg.cn/images/lol/act/img/item/${id}.png`,
      category: im.category || 'other',
      types: im.types || [],
      totalGold: im.total || Number(gtIt?.total || 0),
      brief,
      fullDesc
    }
  }

  const heroAugments = {}
  for (const [heroId, augMap] of Object.entries(rawHeroAugments)) {
    heroAugments[heroId] = Object.entries(augMap)
      .filter(([, st]) => st.games >= 15)
      .map(([augId, st]) => [augId, st.games, st.wins, st.low_sample ? 1 : 0])
  }

  const coreBuilds = {}
  for (const [heroId, list] of Object.entries(rawCoreBuilds)) {
    coreBuilds[heroId] = (list || []).slice(0, 3).map((b) => ({
      items: b.items,
      ordered: Boolean(b.ordered),
      games: b.games,
      winRate: Number((b.win ?? b.wins / Math.max(1, b.games)).toFixed(4)),
      pickRate: Number((b.pick ?? 0).toFixed(4))
    }))
  }

  const heroItems = {}
  for (const [heroId, itemMap] of Object.entries(rawHeroItems)) {
    heroItems[heroId] = Object.entries(itemMap)
      .filter(
        ([itemId, st]) =>
          st.games >= 80 && items[itemId] && !(items[itemId].types || []).includes('Boots')
      )
      .sort((a, b) => b[1].games - a[1].games)
      .slice(0, 18)
      .map(([itemId, st]) => [itemId, st.games, st.wins])
  }

  const heroAugmentItems = {}
  for (const [heroId, augMap] of Object.entries(rawHeroAugmentItems)) {
    const sub = {}
    for (const [augId, obj] of Object.entries(augMap)) {
      if (!obj.items || obj.items.length === 0) continue
      const top = obj.items
        .slice(0, 3)
        .map((it) => [String(it.item), it.name || items[it.item]?.name || '', it.games, it.wins])
      if (top.length > 0) sub[augId] = top
    }
    if (Object.keys(sub).length > 0) heroAugmentItems[heroId] = sub
  }

  const heroSpells = {}
  for (const [heroId, spMap] of Object.entries(rawHeroSpells)) {
    heroSpells[heroId] = Object.entries(spMap)
      .filter(([, st]) => st.games >= 30)
      .sort((a, b) => b[1].games - a[1].games)
      .slice(0, 3)
      .map(([combo, st]) => [combo, st.games, st.wins])
  }

  const availableDatasets = (indexManifest.datasets || []).slice(0, 4).map((ds) => ({
    id: `${ds.patch}-${ds.mode}`,
    patch: ds.patch,
    mode: ds.mode,
    modeLabel: ds.mode_label || (ds.mode === 'normal' ? '常规' : ds.mode),
    path: ds.path,
    bandsAvailable: Boolean(ds.bands),
    activeBand: 'all',
    matchesValid: ds.matches_detail?.valid || ds.matches || 0
  }))

  const bundle = {
    meta: {
      patch: latest.patch,
      mode: latest.mode,
      modeLabel: latest.mode_label || '常规',
      activeBand: 'all',
      bandsAvailable: Boolean(latest.bands),
      seq: latest.seq,
      matchesValid: latest.matches,
      snapshotAt: latest.snapshot_at,
      sourceRepo: 'https://github.com/czgreat/aramhex-data',
      license: 'CC BY-NC 4.0',
      syncedAt: new Date().toISOString(),
      fromSource: 'bundled',
      availableDatasets
    },
    heroes,
    augments,
    items,
    heroAugments,
    coreBuilds,
    heroItems,
    heroAugmentItems,
    heroSpells
  }

  await mkdir(OUT_DIR, { recursive: true })
  const outPath = resolve(OUT_DIR, 'seed-bundle.json')
  const jsonStr = JSON.stringify(bundle)
  await writeFile(outPath, jsonStr, 'utf-8')
  const mb = (Buffer.byteLength(jsonStr) / 1024 / 1024).toFixed(2)
  console.log(
    `5/5 Wrote ${outPath} (${mb} MB) — ${Object.keys(heroes).length} heroes, ${Object.keys(augments).length} augments, ${Object.keys(items).length} items.`
  )
}

main().catch((err) => {
  console.error('Failed to build seed bundle:', err)
  process.exit(1)
})
