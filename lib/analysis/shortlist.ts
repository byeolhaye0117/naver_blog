import type { PostType } from '@/lib/types'
import { pairSynergy, splitKeyword, subValue } from './synergy'
import { adPressureOf, tradeDrop } from './keyword'

/**
 * 후보를 추려낸다 — 「키워드가 너무 많다」에 대한 답.
 *
 * **왜 필요한가.** 조합 46개 + 실제 검색어 26개면 72줄이다. 채점은 한 번에 24개까지고,
 * 무엇보다 사람이 72개를 보고 고를 수 없다. 회원이 그대로 말했다 — "지금 키워드가 너무
 * 많으니까 자주 검색하는 것, 시너지 나는 것, 경쟁이 안 센 것을 선별해줬으면 좋겠어."
 *
 * **여기서 알 수 있는 것과 없는 것.** 이 단계는 검색광고 API 검색량만 받은 상태다
 * (발행량 조회는 키워드당 1~2콜이라 72개를 다 재면 너무 오래 걸린다). 그래서
 *   - 「자주 찾는지」 → 월 검색량으로 **잰다**
 *   - 「궁합이 맞는지」 → 지역·의도로 **잰다** (네트워크 필요 없음)
 *   - 「경쟁이 센지」  → **아직 모른다.** 블로그 발행량은 채점해야 나온다.
 * 그래서 경쟁률을 짐작해서 채우지 않고, 광고 수만 참고로 곁들인다. 경쟁률은 추려낸
 * 것들을 채점할 때 확정된다.
 */

/** 이보다 작으면 추천에 넣지 않는다 — 1위를 해도 유입이 거의 없다 */
export const SHORTLIST_MIN_SEARCH = 100
/** 한 지역에서 만들 축(메인)의 최대 개수 */
const HEADS_PER_AREA = 2
/**
 * 두 번째 축은 이만큼은 돼야 세운다.
 *
 * 실측에서 「쌍용동헬스」(월 120)가 두 번째 축으로 잡혔다 — 첫 축의 서브 자리가 이미
 * 차서 밀려 올라온 것이다. 월 120회짜리로 글을 한 편 더 쓰라는 말이 되므로 막는다.
 */
const SECOND_HEAD_MIN = 300
/** 축 하나에 얹을 서브 최대 개수 (글 한 편 = 메인 1 + 서브 2) */
const SUBS_PER_HEAD = 2

export interface ShortlistCandidate {
  keyword: string
  monthlySearch: number
  adDepth?: number
  /** 회원이 직접 넣었거나 조합으로 만든 말인지, 자동완성에서 온 말인지 */
  fromNaver?: boolean
}

export interface ShortlistPick {
  keyword: string
  monthlySearch: number
  adDepth?: number
  /** 이 글에서 맡을 자리 */
  role: 'main' | 'sub'
  /** 서브면 어느 메인에 얹는지 */
  under?: string
  /** 왜 골랐는지 */
  why: string
  area: string
  postType: PostType
}

export interface Shortlist {
  picked: ShortlistPick[]
  /** 왜 뺐는지 — 그냥 사라지면 추리기가 지나친지 알 수 없다 */
  skipped: { keyword: string; why: string }[]
  /** 후보가 몇 개였는지 */
  considered: number
}

/**
 * 검색량 + 궁합으로 추린다.
 *
 * 고르는 방식은 세트 만들기와 같다 — 지역별로 가장 많이 찾는 말을 축으로 세우고,
 * 그 축에 얹어서 검색어를 하나 더 잡을 수 있는 말을 붙인다. 한 편으로 두세 검색어를
 * 잡는 조합이 낱개 키워드 열 개보다 낫다.
 */
export function buildShortlist(
  candidates: ShortlistCandidate[],
  opts: {
    areas?: string[]
    /**
     * 시·군 이름. 지역을 쪼갤 때 함께 넘긴다.
     *
     * 안 넘기면 「천안헬스장」이 지역 없는 말로 읽혀 의도(헬스장)를 못 알아본다.
     * 그러면 「천안다이어트」(정보글)가 「천안헬스장」(홍보글) 서브로 붙는다 — 실측에서
     * 그렇게 나왔다. 시를 넘기면 area=천안 / intent=다이어트 로 갈려 글 유형이 갈린다.
     */
    cities?: string[]
    store?: { open24?: boolean; womenOnly?: boolean }
    limit?: number
  } = {}
): Shortlist {
  const limit = opts.limit ?? 12
  const areas = [
    ...(opts.areas?.map((a) => a.trim()).filter(Boolean) ??
      Array.from(new Set(candidates.map((c) => splitKeyword(c.keyword).area).filter(Boolean)))),
    ...(opts.cities?.map((c) => c.trim()).filter(Boolean) ?? []),
  ]

  const skipped: { keyword: string; why: string }[] = []

  // 같은 말이 조합·자동완성 양쪽에서 오므로 합친다 (띄어쓰기만 다른 것도 같은 말)
  const byFlat = new Map<string, ShortlistCandidate>()
  for (const c of candidates) {
    const key = c.keyword.replace(/\s+/g, '')
    const prev = byFlat.get(key)
    if (!prev || prev.monthlySearch < c.monthlySearch) byFlat.set(key, c)
  }

  const rows = Array.from(byFlat.values()).map((c) => ({
    c,
    parts: splitKeyword(c.keyword, areas),
  }))

  const usable = rows.filter(({ c, parts }) => {
    // 업종부터 본다 — 「쌍용동필라테스」가 검색량 500 으로 추천에 뽑혔던 자리다
    const trade = tradeDrop(c.keyword)
    if (trade) {
      skipped.push({ keyword: c.keyword, why: trade })
      return false
    }
    if (c.monthlySearch <= 0) {
      skipped.push({ keyword: c.keyword, why: '검색량을 읽지 못했습니다.' })
      return false
    }
    if (c.monthlySearch < SHORTLIST_MIN_SEARCH) {
      skipped.push({
        keyword: c.keyword,
        why: `월 ${c.monthlySearch.toLocaleString()}회 — 1위를 해도 유입이 거의 없습니다.`,
      })
      return false
    }
    const needs = parts.meta?.needs
    if (needs && opts.store) {
      if (needs === 'open24' && opts.store.open24 === false) {
        skipped.push({ keyword: c.keyword, why: '이 지점은 24시간 운영이 아닙니다.' })
        return false
      }
      if (needs === 'womenOnly' && opts.store.womenOnly === false) {
        skipped.push({ keyword: c.keyword, why: '이 지점은 여성전용이 아닙니다.' })
        return false
      }
    }
    return true
  })

  // 지역별로 나눈다 (지역이 다른 키워드는 한 글에 못 들어간다)
  const groups = new Map<string, typeof usable>()
  for (const r of usable) {
    const key = r.parts.area || ''
    const list = groups.get(key) ?? []
    list.push(r)
    groups.set(key, list)
  }

  /*
   * 내 동네를 먼저, 시 광역을 나중에.
   *
   * 검색량으로만 줄을 세우면 「천안」 묶음(합계 5,050회)이 「쌍용동」보다 위에 온다.
   * 그런데 천안 급 키워드는 발행량이 포화라 우리가 이기기 어렵고, 우리가 실제로 먹을 수
   * 있는 판은 동네다. 지점 글이 우리 무기이므로 동네를 위에 둔다.
   */
  const cityKeys = new Set((opts.cities ?? []).map((c) => c.trim()).filter(Boolean))
  const rank = (key: string) => (!key ? 2 : cityKeys.has(key) ? 1 : 0)
  const order = Array.from(groups.entries()).sort((a, b) => {
    const d = rank(a[0]) - rank(b[0])
    if (d !== 0) return d
    const sum = (list: typeof usable) => list.reduce((n, r) => n + r.c.monthlySearch, 0)
    return sum(b[1]) - sum(a[1])
  })

  const picked: ShortlistPick[] = []
  const used = new Set<string>()

  const adTail = (adDepth?: number) => {
    const p = adPressureOf(adDepth)
    if (p === 'light') return ` 광고도 ${Math.round((adDepth as number) * 10) / 10}개뿐이라 블로그가 위에 옵니다.`
    if (p === 'heavy') return ` 다만 광고가 ${Math.round((adDepth as number) * 10) / 10}개 붙습니다.`
    return ''
  }

  for (const [area, list] of order) {
    for (let h = 0; h < HEADS_PER_AREA; h++) {
      if (picked.length >= limit) break
      const left = list.filter((r) => !used.has(r.c.keyword))
      if (!left.length) break

      const head = [...left].sort((x, y) => y.c.monthlySearch - x.c.monthlySearch)[0]
      // 두 번째 축이 너무 작으면 세우지 않는다 (SECOND_HEAD_MIN 주석 참고)
      if (h > 0 && head.c.monthlySearch < SECOND_HEAD_MIN) break
      used.add(head.c.keyword)
      const postType = head.parts.meta?.postType ?? 'promo'

      picked.push({
        keyword: head.c.keyword,
        monthlySearch: head.c.monthlySearch,
        adDepth: head.c.adDepth,
        role: 'main',
        area,
        postType,
        why:
          (area
            ? `월 ${head.c.monthlySearch.toLocaleString()}회 — ${area}에서 ${h === 0 ? '가장' : '그다음으로'} 많이 찾는 말입니다.`
            : `월 ${head.c.monthlySearch.toLocaleString()}회 — 지역을 안 붙이고 찾는 말입니다.`) +
          adTail(head.c.adDepth),
      })

      // 그 축에 얹어서 검색어를 더 잡을 수 있는 말 (검색량 × 궁합)
      const subs = list
        .filter((r) => !used.has(r.c.keyword))
        .filter((r) => r.c.monthlySearch <= head.c.monthlySearch)
        .map((r) => ({ r, s: pairSynergy(head.c.keyword, r.c.keyword, areas) }))
        .filter(({ s }) => s.strength === 'strong' || s.strength === 'ok')
        .sort((x, y) => subValue(y.r.c, y.s) - subValue(x.r.c, x.s))
        .slice(0, SUBS_PER_HEAD)

      for (const { r, s } of subs) {
        if (picked.length >= limit) break
        used.add(r.c.keyword)
        picked.push({
          keyword: r.c.keyword,
          monthlySearch: r.c.monthlySearch,
          adDepth: r.c.adDepth,
          role: 'sub',
          under: head.c.keyword,
          area,
          postType,
          why:
            s.strength === 'strong'
              ? `월 ${r.c.monthlySearch.toLocaleString()}회 — 「${head.c.keyword}」 제목에 한 단어만 더 붙이면 같이 잡힙니다.`
              : `월 ${r.c.monthlySearch.toLocaleString()}회 — 「${head.c.keyword}」 글에 한 단락으로 얹으면 검색어를 하나 더 잡습니다.`,
        })
      }
    }
  }

  // 자리가 없어 못 담은 것도 이유를 남긴다 (「나쁜 키워드」와 구별해야 한다)
  for (const r of usable) {
    if (used.has(r.c.keyword)) continue
    skipped.push({
      keyword: r.c.keyword,
      why: '나쁜 키워드는 아니지만 이번 추천 자리에 밀렸습니다 (검색량이나 궁합이 위 것들보다 낮습니다).',
    })
  }

  return { picked, skipped, considered: byFlat.size }
}

/** 추천 묶음을 한 줄로 — 몇 편으로 검색어 몇 개를 잡는지 */
export function shortlistHeadline(list: Shortlist): string {
  const mains = list.picked.filter((p) => p.role === 'main').length
  const reach = list.picked.reduce((n, p) => n + p.monthlySearch, 0)
  if (!list.picked.length) return '추천할 만한 키워드를 찾지 못했습니다.'
  return `후보 ${list.considered}개에서 ${list.picked.length}개를 골랐습니다 — 글 ${mains}편으로 월 ${reach.toLocaleString()}회 검색을 노립니다. 경쟁률은 채점하면 확정됩니다.`
}
