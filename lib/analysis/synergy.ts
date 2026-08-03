import { POST_TYPE_LABEL } from '../types'
import type { KeywordMetric, PostType } from '@/lib/types'

/**
 * 키워드 시너지 — "이 키워드랑 이 키워드는 한 글에 같이 넣으면 이득" 을 판정한다.
 *
 * 왜 필요한가. 조합 생성기는 후보를 24개 만들어 주지만, 그중 무엇을 **한 글에 묶을지**는
 * 알려주지 않았다. 글 한 편에 넣을 수 있는 키워드는 메인 1 + 서브 2 (편집기 구조이자
 * 검수기 기준)인데, 어떤 셋을 고르느냐에 따라 한 편으로 검색어 3개를 잡기도 하고
 * 세 편을 써도 하나도 못 잡기도 한다.
 *
 * 판정 근거는 세 가지다 — 전부 네이버가 실제로 문서를 보는 방식에서 나온다.
 *  1) **지역**이 다르면 절대 같이 쓰지 않는다. 한 글에 여러 동네를 넣으면 지역 신호가
 *     흐려져 둘 다 밀린다. 지점별로 글을 나눠야 한다.
 *  2) **포함 관계**면 가장 강하다. "쌍용동 헬스장" ⊂ "쌍용동 헬스장 가격" 이면 제목
 *     하나로 두 검색어를 동시에 만족시킨다.
 *  3) **글 유형**이 다르면 나눈다. 후기글 키워드를 홍보글에 섞으면 화자가 무너지고
 *     (센터가 자기 후기를 쓰는 꼴), 정보 키워드를 홍보글에 섞으면 검색 의도가 어긋난다.
 *
 * 여기 있는 함수는 전부 순수 함수다 — 네트워크를 타지 않고 테스트로 고정된다.
 */

export interface IntentMeta {
  /** 지역명 뒤에 붙는 의도 (INTENT_SUFFIXES 와 같은 표기) */
  suffix: string
  /** 같은 의도군 — 같은 군끼리는 네이버가 사실상 같은 문서로 답한다 */
  family: string
  /** 이 키워드로 써야 하는 글 유형 */
  postType: PostType
  /** 이 키워드를 검색한 사람이 원하는 것 */
  want: string
  /** 지점이 이 조건을 만족해야 쓸 수 있는 키워드 (거짓이 되면 안 된다) */
  needs?: 'open24' | 'womenOnly'
}

/**
 * 의도별 성격표.
 *
 * lib/analysis/keyword.ts 의 INTENT_SUFFIXES · suffixesForStore 가 만드는 접미사를
 * 전부 덮는다. 새 접미사를 추가하면 여기에도 한 줄 넣어야 한다 (테스트가 확인한다).
 */
export const INTENT_META: IntentMeta[] = [
  { suffix: '헬스장', family: 'gym', postType: 'promo', want: '동네에서 다닐 헬스장을 고르는 중' },
  {
    suffix: '피트니스',
    family: 'gym',
    postType: 'promo',
    want: '동네 헬스장을 고르는 중 (헬스장과 같은 뜻으로 검색한다)',
  },
  {
    suffix: '헬스장 추천',
    family: 'gym',
    postType: 'promo',
    want: '어디가 좋은지 남의 판단을 듣고 싶다',
  },
  { suffix: 'PT', family: 'pt', postType: 'promo', want: '개인 지도를 받을 곳을 찾는 중' },
  { suffix: '헬스장 가격', family: 'price', postType: 'promo', want: '얼마인지 먼저 알고 싶다' },
  {
    suffix: '24시 헬스장',
    family: 'hours',
    postType: 'promo',
    want: '늦은 밤·새벽에도 갈 수 있는 곳',
    needs: 'open24',
  },
  {
    suffix: '헬스장 새벽',
    family: 'hours',
    postType: 'promo',
    want: '출근 전 새벽에 운동할 곳',
    needs: 'open24',
  },
  {
    suffix: '헬스장 주말',
    family: 'hours',
    postType: 'promo',
    want: '주말에도 문을 여는 곳',
    needs: 'open24',
  },
  {
    suffix: '여성전용 헬스장',
    family: 'women',
    postType: 'promo',
    want: '남성 시선 없이 운동할 공간',
    needs: 'womenOnly',
  },
  {
    suffix: '여성전용 PT',
    family: 'women',
    postType: 'promo',
    want: '여성 전용으로 개인 지도를 받을 곳',
    needs: 'womenOnly',
  },
  {
    suffix: '헬스장 후기',
    family: 'review',
    postType: 'review',
    want: '실제 다녀온 사람의 말을 듣고 싶다',
  },
  { suffix: '헬스 초보', family: 'beginner', postType: 'info', want: '처음인데 무엇부터 할지 모른다' },
  { suffix: '다이어트', family: 'diet', postType: 'info', want: '살을 빼는 방법을 찾는 중' },
]

const flat = (s: string) => s.replace(/\s+/g, '').toUpperCase()

const META_BY_FLAT = new Map(INTENT_META.map((m) => [flat(m.suffix), m]))

/** 동/읍/면으로 끝나는 동네 이름. 경계가 있는 쪽을 먼저 보고, 없으면 붙어 있는 것도 본다 */
const AREA_BOUNDED = /([가-힣]{2,10}?(?:동|읍|면))(?=[\s,·/()[\]]|$)/
const AREA_LOOSE = /([가-힣]{2,6}?(?:동|읍|면))/

export interface KeywordParts {
  /** 지역명 ("쌍용동"). 지역이 없는 정보 키워드는 빈 문자열 */
  area: string
  /** 지역명을 뗀 나머지 ("헬스장 가격") */
  intent: string
  /** 아는 의도면 성격표, 모르면 undefined */
  meta?: IntentMeta
}

/**
 * 키워드를 지역 + 의도로 쪼갠다.
 *
 * 알고 있는 지역 목록을 주면 그중 가장 긴 것을 쓴다 ("천안 쌍용동" 처럼 겹칠 때
 * "쌍용동" 이 아니라 긴 쪽을 골라야 남는 의도가 정확하다). 목록이 없으면 동/읍/면 규칙으로 찾는다.
 */
export function splitKeyword(keyword: string, areas: string[] = []): KeywordParts {
  const k = keyword.trim()
  const fk = flat(k)

  let area = ''
  for (const a of areas) {
    const t = a.trim()
    if (!t) continue
    if (fk.includes(flat(t)) && t.length > area.length) area = t
  }
  if (!area) {
    const m = AREA_BOUNDED.exec(k) ?? AREA_LOOSE.exec(k)
    if (m) area = m[1]
  }

  let intent = k
  if (area) {
    // 조합 생성기는 "쌍용동 헬스장" 처럼 그대로 붙여 만들므로 대개 여기서 걸린다
    intent = k.includes(area) ? k.replace(area, ' ').replace(/\s+/g, ' ').trim() : ''
    // 띄어쓰기가 달라 그대로 못 떼면 공백을 무시하고 뗀다 (표시용 문자열은 못 살린다)
    if (!intent) intent = fk.replace(flat(area), '')
  }

  return { area, intent, meta: META_BY_FLAT.get(flat(intent)) }
}

export type Strength = 'strong' | 'ok' | 'split' | 'never'

export interface Synergy {
  strength: Strength
  /** 0~100. 세트에 넣을 순서를 정하는 데만 쓴다 */
  score: number
  why: string
}

/**
 * 메인 키워드에 서브 키워드를 얹었을 때의 궁합.
 *
 * 방향이 있다 — `pairSynergy(a, b)` 는 "a 를 메인으로 쓰는 글에 b 를 서브로 넣어도 되나"다.
 * 넓은 키워드가 좁은 키워드 안에 들어 있는 경우와 그 반대는 판정이 다르다.
 */
export function pairSynergy(main: string, sub: string, areas: string[] = []): Synergy {
  const a = splitKeyword(main, areas)
  const b = splitKeyword(sub, areas)
  const fa = flat(main)
  const fb = flat(sub)

  if (fa === fb) return { strength: 'never', score: 0, why: '같은 키워드입니다.' }

  if (a.area && b.area && flat(a.area) !== flat(b.area)) {
    return {
      strength: 'never',
      score: 0,
      why: `지역이 다릅니다 (${a.area} / ${b.area}) — 한 글에 두 동네를 넣으면 지역 신호가 갈려 둘 다 밀립니다. 지점별로 글을 나누세요.`,
    }
  }

  // 서브가 메인 안에 들어 있다 — 넓은 말을 서브로 얹는 꼴. 글 유형과 무관하게 항상 이득이다
  // (후기글 "쌍용동 헬스장 후기" 에 "쌍용동 헬스장" 을 넣는 경우)
  if (fa.includes(fb)) {
    return {
      strength: 'strong',
      score: 92,
      why: '메인 키워드가 이 말을 이미 품고 있습니다 — 제목 하나로 두 검색어를 같이 잡습니다.',
    }
  }

  const bothKnown = Boolean(a.meta && b.meta)
  const sameType = bothKnown && a.meta!.postType === b.meta!.postType

  if (bothKnown && !sameType) {
    return {
      strength: 'split',
      score: 20,
      why: `글 유형이 다릅니다 (${POST_TYPE_LABEL[a.meta!.postType]} / ${POST_TYPE_LABEL[b.meta!.postType]}) — 한 글에 섞으면 화자와 검색 의도가 어긋나 둘 다 약해집니다. 따로 쓰면 둘 다 상위에 갈 수 있습니다.`,
    }
  }

  // 메인이 서브 안에 들어 있다 — 좁은 확장 키워드. 같은 유형일 때만 얹는다
  if (fb.includes(fa)) {
    return {
      strength: 'strong',
      score: 88,
      why: '메인을 그대로 품은 확장 키워드 — 제목에 한 단어만 더 붙이면 두 검색어를 같이 잡습니다.',
    }
  }

  if (bothKnown && a.meta!.family === b.meta!.family) {
    return {
      strength: 'strong',
      score: 80,
      why: `네이버가 같은 의도로 답하는 말입니다 (${b.meta!.want}) — 본문에 둘 다 쓰면 검색어 두 개를 함께 잡습니다.`,
    }
  }

  if (sameType) {
    return {
      strength: 'ok',
      score: 55,
      why: `같은 ${POST_TYPE_LABEL[a.meta!.postType]} 안에서 자연스럽게 이어집니다 — "${b.intent || sub}" 를 소제목 한 단락으로 넣으세요 (${b.meta!.want}).`,
    }
  }

  return {
    strength: 'ok',
    score: 40,
    why: '한 글에 함께 넣을 수 있습니다 — 본문에서 한 번씩 쓰세요.',
  }
}

export interface SetSub {
  metric: KeywordMetric
  why: string
  strength: 'strong' | 'ok'
}

export interface KeywordSet {
  /** 화면 key 용 */
  id: string
  area: string
  postType: PostType
  main: KeywordMetric
  subs: SetSub[]
  /** 정보글에서 조연으로 쓸 지역 키워드 */
  local: string
  /** 이 세트가 노리는 월 검색 합계 */
  reach: number
  headline: string
  /** 그냥 넘기면 안 되는 조건 */
  warn?: string
}

export interface SetPlan {
  sets: KeywordSet[]
  /** 세트에 넣지 말고 따로 써야 하는 키워드 */
  splits: { keyword: string; postType?: PostType; why: string }[]
  /** 이 지점으로는 쓸 수 없는 키워드 (사실과 달라진다) */
  excluded: { keyword: string; why: string }[]
}

const SETTABLE = new Set(['gold', 'good'])

/**
 * 채점된 키워드에서 "한 글에 묶을 세트" 를 만든다.
 *
 * 메인은 진입 가능한 등급(황금·노려볼 만함) 중 검색량이 가장 큰 것으로 고른다.
 * 서브는 메인보다 작고 궁합이 맞는 것 2개까지 — **경쟁 과열 키워드도 서브로는 쓴다.**
 * 메인으로 세우면 못 이기지만 이미 쓰는 글에 얹는 것은 공짜 기회이기 때문이다.
 */
export function buildKeywordSets(
  metrics: KeywordMetric[],
  opts: {
    areas?: string[]
    /** 어느 지점 글로 쓸지 아는 경우 — 지점 성격과 어긋나는 키워드를 빼낸다 */
    store?: { open24?: boolean; womenOnly?: boolean }
    /** 최대 세트 수 */
    max?: number
  } = {}
): SetPlan {
  const max = opts.max ?? 4
  const areas =
    opts.areas?.map((a) => a.trim()).filter(Boolean) ??
    Array.from(new Set(metrics.map((m) => splitKeyword(m.keyword).area).filter(Boolean)))

  const splits: SetPlan['splits'] = []
  const excluded: SetPlan['excluded'] = []

  const rows = metrics
    .filter((m) => m.monthlySearch > 0)
    .map((m) => ({ m, parts: splitKeyword(m.keyword, areas) }))

  const usable = rows.filter(({ m, parts }) => {
    const needs = parts.meta?.needs
    if (!needs || !opts.store) return true
    if (needs === 'open24' && opts.store.open24 === false) {
      excluded.push({
        keyword: m.keyword,
        why: '이 지점은 24시간 운영이 아닙니다 — 이 키워드로 글을 쓰면 사실과 달라집니다.',
      })
      return false
    }
    if (needs === 'womenOnly' && opts.store.womenOnly === false) {
      excluded.push({
        keyword: m.keyword,
        why: '이 지점은 여성전용이 아닙니다 — 이 키워드로 글을 쓰면 사실과 달라집니다.',
      })
      return false
    }
    return true
  })

  // 지역별로 나눠 세트를 만든다 (지역이 다른 키워드는 애초에 같은 글에 못 들어간다)
  const groups = new Map<string, typeof usable>()
  for (const r of usable) {
    const key = r.parts.area || ''
    const list = groups.get(key) ?? []
    list.push(r)
    groups.set(key, list)
  }

  const sets: KeywordSet[] = []

  for (const [area, list] of groups) {
    const used = new Set<string>()
    let madeHere = 0

    while (madeHere < 2) {
      const left = list.filter((r) => !used.has(r.m.keyword))
      if (left.length < 1) break

      const enterable = left.filter((r) => SETTABLE.has(r.m.grade))
      let warn: string | undefined
      let head = [...enterable].sort((x, y) => y.m.monthlySearch - x.m.monthlySearch)[0]

      if (!head) {
        // 이 지역에 진입 가능한 등급이 하나도 없다. 그래도 손을 놓는 대신 가장 덜 붐비는
        // 키워드를 메인으로 세우고, 왜 어려운지 함께 말해준다.
        if (madeHere > 0) break
        const graded = left.filter((r) => r.m.grade !== 'unknown' && r.m.competition < 900)
        head = [...graded].sort((x, y) => x.m.competition - y.m.competition)[0]
        if (!head) break
        warn =
          '이 지역은 후보 전부가 진입하기 어려운 등급입니다 — 세부 의도를 더 붙이거나(예: "+ 새벽", "+ 초보") 정보글로 블로그 지수를 먼저 올리세요.'
      }

      used.add(head.m.keyword)

      const scored = left
        .filter((r) => r.m.keyword !== head.m.keyword)
        .map((r) => ({ r, s: pairSynergy(head.m.keyword, r.m.keyword, areas) }))

      for (const { r, s } of scored) {
        if (s.strength !== 'split') continue
        if (splits.some((x) => x.keyword === r.m.keyword)) continue
        splits.push({ keyword: r.m.keyword, postType: r.parts.meta?.postType, why: s.why })
      }

      const subs = scored
        .filter(({ s }) => s.strength === 'strong' || s.strength === 'ok')
        // 서브가 메인보다 크면 순서가 뒤바뀐 것이다 — 그 키워드는 다음 세트의 메인이 된다
        .filter(({ r }) => r.m.monthlySearch <= head.m.monthlySearch)
        .sort((x, y) => y.s.score - x.s.score || y.r.m.monthlySearch - x.r.m.monthlySearch)
        .slice(0, 2)
        .map(({ r, s }) => {
          used.add(r.m.keyword)
          return {
            metric: r.m,
            why: s.why,
            strength: s.strength as 'strong' | 'ok',
          }
        })

      const postType = head.parts.meta?.postType ?? 'promo'
      const reach = head.m.monthlySearch + subs.reduce((n, s) => n + s.metric.monthlySearch, 0)

      sets.push({
        id: `${area}:${head.m.keyword}`,
        area,
        postType,
        main: head.m,
        subs,
        local: area,
        reach,
        headline: `${POST_TYPE_LABEL[postType]} 1편으로 ${subs.length + 1}개 검색어 — 합계 월 ${reach.toLocaleString()}회`,
        warn,
      })
      madeHere++
      if (sets.length >= max) break
    }
    if (sets.length >= max) break
  }

  // 황금 키워드를 메인으로 세운 세트를 먼저, 그다음 크기 순
  sets.sort(
    (a, b) =>
      Number(b.main.grade === 'gold') - Number(a.main.grade === 'gold') || b.reach - a.reach
  )

  return { sets, splits, excluded }
}

/** 세트를 그대로 글쓰기 화면으로 넘기는 주소 */
export function writeHrefForSet(set: KeywordSet, storeId?: string): string {
  // URLSearchParams 는 공백을 '+' 로 적는다. 주소창에서 읽기 어렵고 파싱하는 쪽에 따라
  // '+' 가 그대로 남을 수 있어서 %20 이 되는 encodeURIComponent 로 직접 만든다.
  const q: string[] = [`type=${set.postType}`, `main=${encodeURIComponent(set.main.keyword)}`]
  if (set.subs.length) {
    q.push(`subs=${set.subs.map((s) => encodeURIComponent(s.metric.keyword)).join(',')}`)
  }
  if (set.local) q.push(`local=${encodeURIComponent(set.local)}`)
  if (storeId) q.push(`store=${encodeURIComponent(storeId)}`)
  return `/write?${q.join('&')}`
}
