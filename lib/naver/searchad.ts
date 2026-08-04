import crypto from 'node:crypto'
import { getKeys, hasAdKeys, seededRandom, NaverApiError } from './client'

/**
 * 네이버 검색광고 키워드도구 — 월간 검색량·경쟁정도.
 * 검색 API(개발자센터)와는 완전히 다른 자격증명을 쓴다.
 */

export interface AdKeywordRow {
  keyword: string
  monthlyPc: number
  monthlyMobile: number
  monthlySearch: number
  /** 낮음 / 중간 / 높음 */
  compIdx?: string
  /**
   * 이 키워드에 붙은 광고 개수(평균 노출 광고수).
   *
   * 왜 보나. 광고가 많이 붙은 키워드는 통합검색 위쪽을 파워링크·플레이스가 차지해서
   * **블로그 자리가 아래로 밀린다.** 검색량이 같아도 광고 5개짜리 키워드는 블로그로
   * 들어오는 유입이 확 준다. 상업성 판정에 쓴다.
   */
  adDepth?: number
  /** 광고 클릭률(%) — 상업적 의도가 강한 키워드일수록 높다 */
  ctrPc?: number
  ctrMobile?: number
  mock: boolean
}

const BASE = 'https://api.searchad.naver.com'
const PATH = '/keywordstool'

function sign(timestamp: string, method: string, path: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${method}.${path}`).digest('base64')
}

/** "< 10" 같은 값이 오므로 숫자로 정규화한다 */
function toNum(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    if (v.includes('<')) return 5
    const n = parseInt(v.replace(/[^0-9]/g, ''), 10)
    return Number.isNaN(n) ? 0 : n
  }
  return 0
}

/**
 * 힌트 키워드로 조회. 최대 5개까지 한 번에 넣을 수 있다.
 * 반환값 첫 번째 묶음은 요청한 키워드 자체, 나머지는 연관 키워드다.
 */
export async function keywordTool(hints: string[]): Promise<AdKeywordRow[]> {
  const clean = hints.map((h) => h.replace(/\s+/g, '')).filter(Boolean).slice(0, 5)
  if (!clean.length) return []

  if (!hasAdKeys()) return mockKeywordTool(hints)

  const { adApiKey, adSecret, adCustomerId } = getKeys()
  const timestamp = String(Date.now())
  const signature = sign(timestamp, 'GET', PATH, adSecret!)
  const url = `${BASE}${PATH}?hintKeywords=${encodeURIComponent(clean.join(','))}&showDetail=1`

  const res = await fetch(url, {
    headers: {
      'X-Timestamp': timestamp,
      'X-API-KEY': adApiKey!,
      'X-Customer': adCustomerId!,
      'X-Signature': signature,
    },
    cache: 'no-store',
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new NaverApiError(
      `검색광고 API 오류 (${res.status}). ${body.slice(0, 200)}`,
      res.status
    )
  }

  const json = (await res.json()) as {
    keywordList?: Array<{
      relKeyword: string
      monthlyPcQcCnt: unknown
      monthlyMobileQcCnt: unknown
      compIdx?: string
      /** 평균 노출 광고수 */
      plAvgDepth?: unknown
      monthlyAvePcCtr?: unknown
      monthlyAveMobileCtr?: unknown
    }>
  }

  return (json.keywordList ?? []).map((r) => {
    const pc = toNum(r.monthlyPcQcCnt)
    const mo = toNum(r.monthlyMobileQcCnt)
    return {
      keyword: r.relKeyword,
      monthlyPc: pc,
      monthlyMobile: mo,
      monthlySearch: pc + mo,
      compIdx: r.compIdx,
      adDepth: toRate(r.plAvgDepth),
      ctrPc: toRate(r.monthlyAvePcCtr),
      ctrMobile: toRate(r.monthlyAveMobileCtr),
      mock: false,
    }
  })
}

/**
 * 소수점이 있는 값 (클릭률·평균 광고수).
 *
 * **없는 값은 반드시 undefined 로 돌려준다.** Number('') 은 0 이므로 순진하게 쓰면
 * 필드가 아예 안 온 키워드가 "광고 0개" 로 보인다 — 그러면 광고 6개짜리 키워드와
 * 구분이 안 되는 것보다 더 나쁘게, 광고가 없다고 **거짓말**을 하게 된다.
 */
export function toRate(v: unknown): number | undefined {
  if (v === null || v === undefined) return undefined
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^0-9.]/g, ''))
  if (!Number.isFinite(n)) return undefined
  // "" · "-" 처럼 숫자가 한 글자도 없던 값
  if (typeof v !== 'number' && !/[0-9]/.test(String(v))) return undefined
  return Math.round(n * 100) / 100
}

/**
 * 같은 키워드 행을 하나로 합친다.
 *
 * 힌트를 5개씩 나눠 여러 번 부르면(조합 24개 채점) **요청한 키워드가 다른 묶음의
 * 연관 키워드 목록에도 들어 있는** 경우가 생긴다. 그러면 같은 줄이 두 번 담긴다 —
 * 실측: 쌍용동·봉명동 22개를 채점했더니 봉명동헬스장·봉명동PT·봉명동24시헬스장이
 * 두 번씩 나와 24행이 됐다. 화면에서도 그대로 두 줄로 보였다.
 *
 * 띄어쓰기만 다른 것도 같은 키워드다 ("봉명동 헬스장" = "봉명동헬스장").
 */
export function dedupeAdRows(rows: AdKeywordRow[]): AdKeywordRow[] {
  const seen = new Map<string, AdKeywordRow>()
  for (const r of rows) {
    const key = r.keyword.replace(/\s+/g, '')
    const prev = seen.get(key)
    // 검색량을 읽은 행을 우선한다 (같은 키워드가 목업·실측으로 섞여 올 때)
    if (!prev || (prev.monthlySearch === 0 && r.monthlySearch > 0)) seen.set(key, r)
  }
  return Array.from(seen.values())
}

/** 특정 키워드 하나의 검색량. 목록에서 정확히 일치하는 행을 찾고, 없으면 첫 행을 쓴다. */
export async function keywordVolume(keyword: string): Promise<AdKeywordRow> {
  const rows = await keywordTool([keyword])
  const flat = keyword.replace(/\s+/g, '')
  const exact = rows.find((r) => r.keyword.replace(/\s+/g, '') === flat)
  if (exact) return { ...exact, keyword }
  if (rows.length) return { ...rows[0], keyword }
  return { keyword, monthlyPc: 0, monthlyMobile: 0, monthlySearch: 0, mock: true }
}

// ─── 목업 ──────────────────────────────────────────────────────

const RELATED_SUFFIX = ['가격', '추천', '후기', 'PT', '24시', '여성전용', '비용', '위치', '주말', '새벽']

export function mockKeywordTool(hints: string[]): AdKeywordRow[] {
  const rows: AdKeywordRow[] = []

  for (const hint of hints.slice(0, 5)) {
    const rnd = seededRandom(`ad:${hint}`)
    // 지역+업종 키워드는 보통 수백~수천, 일반 정보 키워드는 더 크게 잡는다.
    const isLocal = /동|구|시|역|읍|면/.test(hint)
    const base = isLocal ? 200 + rnd() * 4200 : 800 + rnd() * 24000
    const mobileShare = 0.62 + rnd() * 0.28
    const total = Math.round(base / 10) * 10
    const mo = Math.round((total * mobileShare) / 10) * 10

    rows.push({
      keyword: hint,
      monthlyPc: total - mo,
      monthlyMobile: mo,
      monthlySearch: total,
      compIdx: total > 8000 ? '높음' : total > 2000 ? '중간' : '낮음',
      // 목업도 광고 지표를 채운다 — compIdx 와 같은 성격의 값이고, 이 행은 화면에서
      // 계속 「샘플」로 표시된다. 비워두면 키 없이 써보는 사람은 기능 자체를 못 본다.
      adDepth: Math.round(rnd() * 70) / 10,
      ctrPc: Math.round(rnd() * 400) / 100,
      ctrMobile: Math.round(rnd() * 600) / 100,
      mock: true,
    })

    for (const suffix of RELATED_SUFFIX) {
      // 연관 키워드는 원 키워드의 8~40% 수준 — 실제 롱테일 낙폭에 맞춘 값
      const r2 = seededRandom(`ad:${hint}:${suffix}`)
      const t2 = Math.round((total * (0.08 + r2() * 0.32)) / 10) * 10
      if (t2 < 10) continue
      const m2 = Math.round((t2 * (0.6 + r2() * 0.3)) / 10) * 10
      rows.push({
        keyword: `${hint} ${suffix}`,
        monthlyPc: Math.max(0, t2 - m2),
        monthlyMobile: m2,
        monthlySearch: t2,
        compIdx: t2 > 8000 ? '높음' : t2 > 2000 ? '중간' : '낮음',
        adDepth: Math.round(r2() * 60) / 10,
        ctrPc: Math.round(r2() * 400) / 100,
        ctrMobile: Math.round(r2() * 600) / 100,
        mock: true,
      })
    }
  }

  return rows.sort((a, b) => b.monthlySearch - a.monthlySearch)
}
