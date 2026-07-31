/**
 * 네이버 검색 결과를 붙여넣은 텍스트에서 글 제목(과 있으면 날짜)을 뽑아낸다.
 *
 * 검색 API 를 못 쓰는 경우(신규 발급 제한 등) 상위노출 분석을 살리는 입력 경로다.
 * 붙여넣은 텍스트는 기기·화면마다 순서와 잡음이 다르므로 **완벽하게 파싱하려 하지 않는다.**
 * 1차로 걸러 "한 줄에 제목 하나" 형태로 만들어 사용자에게 보여주고 직접 고치게 한다.
 * 그래서 이 함수의 목표는 정확성이 아니라 "손볼 양을 줄이는 것"이다.
 */

export interface PastedItem {
  title: string
  /** YYYY-MM-DD (알아낸 경우만) */
  date: string | null
  /** 블로거명으로 추정되는 줄 (알아낸 경우만) */
  blogger: string | null
}

export interface PasteResult {
  items: PastedItem[]
  /** 제목이 아니라고 판단해 버린 줄 수 */
  dropped: number
}

/** 2026.07.28. / 2026. 7. 28. / 2026-07-28 / 2026/07/28 */
const ABS_DATE = /(20\d{2})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})\s*\.?/
/** 3일 전 / 어제 / 2시간 전 / 방금 전 */
const REL_DATE = /^(방금\s*전|어제|그저께|\d+\s*(초|분|시간|일|주|개월|달|년)\s*전)$/

/** 제목일 리 없는 줄 — 네이버 검색 화면의 UI 텍스트·부가 정보 */
const NOISE = [
  /^(블로그|카페|뉴스|이미지|동영상|지식iN|인플루언서|VIEW|통합검색|웹사이트)$/,
  /^(관련도순|최신순|정확도순|옵션|기간|영역|더보기|접기|펼치기|전체)$/,
  /^(공유|신고|저장|스크랩|댓글|공감|조회)/,
  /^(광고|AD|파워링크|비즈사이트|플레이스)$/,
  /^(이전|다음|맨위로|검색결과|검색어)/,
  /^\d+\s*(건|개|페이지)$/,
  /^[·•\-–—|/\\]+$/,
]

function normalizeDate(line: string): string | null {
  const m = ABS_DATE.exec(line)
  if (m) {
    const [, y, mo, d] = m
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  const rel = line.trim()
  if (!REL_DATE.test(rel)) return null

  const now = new Date()
  const days =
    rel.includes('어제') ? 1
    : rel.includes('그저께') ? 2
    : (() => {
        const n = parseInt(rel.replace(/[^0-9]/g, ''), 10)
        if (Number.isNaN(n)) return 0
        if (/초|분|시간/.test(rel)) return 0
        if (/주/.test(rel)) return n * 7
        if (/개월|달/.test(rel)) return n * 30
        if (/년/.test(rel)) return n * 365
        return n
      })()

  const d = new Date(now.getTime() - days * 86400000)
  return d.toISOString().slice(0, 10)
}

function isNoise(line: string): boolean {
  const t = line.trim()
  if (!t) return true
  if (t.length < 6) return true
  if (/^https?:\/\//.test(t)) return true
  if (/^(blog|m|search)\.naver\.com/i.test(t)) return true
  if (NOISE.some((re) => re.test(t))) return true
  // 검색 결과의 본문 발췌는 잘려서 "..." 로 끝난다
  if (/(\.\.\.|…)$/.test(t)) return true
  // 숫자·기호가 대부분인 줄 (예: "1-10 / 2,345건", "2026. 7. 28. 조회 132")
  const letters = (t.match(/[가-힣A-Za-z]/g) ?? []).length
  if (letters < 4) return true
  // 날짜만 있는 줄
  if (normalizeDate(t) && t.replace(ABS_DATE, '').replace(/[.\s]/g, '').length === 0) return true
  if (REL_DATE.test(t)) return true
  return false
}

/** 제목으로 보이는가 — 한글이나 영문이 있고 어느 정도 길이가 되는 줄 */
function looksLikeTitle(line: string): boolean {
  const t = line.trim()
  if (t.length < 8) return false
  if (!/[가-힣A-Za-z]/.test(t)) return false
  // 온점으로 끝나는 긴 문장은 본문 요약일 가능성이 큼
  if (t.length > 60) return false
  return true
}

/** 공백 무시 부분일치 */
function flatIncludes(line: string, flatNeedle: string): boolean {
  return flatNeedle ? line.replace(/\s+/g, '').includes(flatNeedle) : false
}

/**
 * 붙여넣은 텍스트 파싱.
 *
 * `제목 | 2026-07-28` 형태로 직접 정리해 넣은 줄도 받는다 (분석 전 편집 단계에서 쓰기 좋게).
 *
 * 키워드를 함께 주면 블로거명 줄을 제목과 구분할 수 있다. 검색 결과에서 블로거명은
 * 제목 바로 위에 짧게 붙고, 상위 노출된 제목에는 검색 키워드가 거의 항상 들어 있다.
 * 그래서 "키워드 없는 짧은 줄 + 바로 뒤에 키워드 든 줄" 은 (블로거명, 제목) 짝으로 본다.
 */
export function parsePastedSerp(raw: string, keyword = ''): PasteResult {
  const lines = raw.split(/\r?\n/).map((l) => l.trim())
  const items: PastedItem[] = []
  let dropped = 0

  // 1) 명시적으로 "제목 | 날짜" 로 적은 줄이 하나라도 있으면 그 형식만 신뢰한다
  const explicit = lines.filter((l) => l.includes('|'))
  if (explicit.length >= 2) {
    for (const line of lines) {
      if (!line) continue
      if (!line.includes('|')) {
        if (looksLikeTitle(line)) items.push({ title: line, date: null, blogger: null })
        else dropped++
        continue
      }
      const [t, rest = ''] = line.split('|')
      const title = t.trim()
      if (!title) {
        dropped++
        continue
      }
      items.push({ title, date: normalizeDate(rest.trim()), blogger: null })
    }
    return { items, dropped }
  }

  // 2) 화면에서 그대로 긁어온 덩어리 — 제목 줄을 고르고 근처 날짜를 붙인다
  const dateAt = new Map<number, string>()
  lines.forEach((l, i) => {
    const d = normalizeDate(l)
    if (d) dateAt.set(i, d)
  })

  const flatKeyword = keyword.replace(/\s+/g, '')
  const usable = lines.map((l) => !isNoise(l))
  const hasKeyword = lines.map((l) => flatIncludes(l, flatKeyword))
  const isTitle = lines.map((l, i) => usable[i] && looksLikeTitle(l))

  // 제목 인덱스 → 블로거명 인덱스
  const bloggerFor = new Map<number, number>()
  if (flatKeyword) {
    lines.forEach((l, i) => {
      if (!usable[i] || hasKeyword[i] || l.length > 16) return
      for (let step = 1; step <= 2; step++) {
        const j = i + step
        if (j >= lines.length) break
        if (isTitle[j] && hasKeyword[j]) {
          bloggerFor.set(j, i) // 더 가까운 줄이 나중에 덮어쓴다
          break
        }
        if (isTitle[j]) break // 다른 제목이 먼저 오면 이 줄은 그 제목 것이 아니다
      }
    })
  }
  const consumed = new Set(bloggerFor.values())

  lines.forEach((line, i) => {
    if (consumed.has(i)) return // 버린 게 아니라 블로거명으로 쓴 줄
    if (!isTitle[i]) {
      dropped++
      return
    }
    // 앞뒤 3줄 안에서 가장 가까운 날짜를 가져온다
    let date: string | null = null
    for (let step = 1; step <= 3 && !date; step++) {
      date = dateAt.get(i + step) ?? dateAt.get(i - step) ?? null
    }
    const b = bloggerFor.get(i)
    items.push({ title: line, date, blogger: b === undefined ? null : lines[b] })
  })

  return { items, dropped }
}

/** 편집 단계에서 보여줄 텍스트 — 한 줄에 "제목 | 날짜 | 블로거" */
export function toEditableText(items: PastedItem[]): string {
  return items
    .map((i) => [i.title, i.date ?? '', i.blogger ?? ''].join(' | ').replace(/(\s*\|\s*)+$/, ''))
    .join('\n')
}

/**
 * 편집을 마친 목록을 읽는다.
 *
 * 이건 파싱이 아니라 **확정된 입력을 읽는 것**이다. 사용자가 눈으로 보고 고친 목록이므로
 * "제목 같지 않다"는 이유로 줄을 버리지 않는다. 순서 = 순위로 그대로 쓴다.
 */
export function parseEditedList(raw: string): PastedItem[] {
  const out: PastedItem[] = []
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue
    const [t = '', d = '', b = ''] = line.split('|')
    const title = t.trim()
    if (!title) continue
    out.push({
      title,
      date: normalizeDate(d.trim()),
      blogger: b.trim() || null,
    })
  }
  return out
}

/**
 * 검색 결과에 표시되는 총 건수를 뽑는다 — 경쟁률 계산에 쓰는 발행량.
 * 예: "블로그 1-10 / 2,345건", "총 12,345건", "2,345건"
 */
export function parseTotalCount(raw: string): number | null {
  const m = raw.match(/([\d,]{2,})\s*건/)
  if (!m) return null
  const n = parseInt(m[1].replace(/,/g, ''), 10)
  return Number.isFinite(n) && n > 0 ? n : null
}
