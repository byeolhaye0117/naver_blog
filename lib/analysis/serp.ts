import type { SerpAnalysis, SerpItem } from '@/lib/types'
import { stripTags, type RawBlogItem } from '../naver/search'
import type { PastedItem } from './paste'
import { cutlineLine, type Cutline } from './cutline'

/** 조사·상투어 — 제목 공통 토큰 집계에서 뺀다 */
const STOPWORDS = new Set([
  '그리고', '하지만', '그래서', '있는', '없는', '하는', '되는', '위한', '대한', '같은', '너무',
  '정말', '진짜', '많이', '조금', '이런', '그런', '저런', '여기', '거기', '오늘', '어제', '내가',
  '제가', '저는', '나는', '것들', '것이', '수가', '분들', '분이', '경우', '때는', '정리', '입니다',
  '있어요', '했어요', '해봤어요', '봤습니다',
])

const PARTICLES = [
  '으로써', '으로서', '에서는', '까지', '부터', '보다', '에서', '으로', '이라', '라고', '한테',
  '에게', '와의', '과의', '으로', '만큼', '조차', '마저', '이나', '나마',
  '은', '는', '이', '가', '을', '를', '에', '의', '도', '로', '과', '와', '만', '요',
]

/** 어절에서 후행 조사를 떼어낸다 (완벽할 필요는 없고 집계 노이즈만 줄이면 된다) */
function stem(word: string): string {
  for (const p of PARTICLES) {
    if (word.length > p.length + 1 && word.endsWith(p)) return word.slice(0, -p.length)
  }
  return word
}

function tokenize(text: string): string[] {
  return text
    .replace(/[^0-9A-Za-z가-힣\s]/g, ' ')
    .split(/\s+/)
    .map((w) => stem(w))
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w))
}

/** 검색 API 의 postdate (YYYYMMDD) */
function parsePostdate(s: string): { iso: string; ageDays: number } {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(s ?? '')
  if (!m) return { iso: '', ageDays: 0 }
  return { iso: `${m[1]}-${m[2]}-${m[3]}`, ageDays: ageOf(Number(m[1]), Number(m[2]), Number(m[3])) }
}

/** 붙여넣기에서 온 YYYY-MM-DD */
function parseIsoDate(s: string | null | undefined): { iso: string; ageDays: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((s ?? '').trim())
  if (!m) return { iso: '', ageDays: 0 }
  return { iso: m[0], ageDays: ageOf(Number(m[1]), Number(m[2]), Number(m[3])) }
}

function ageOf(y: number, mo: number, d: number): number {
  return Math.max(0, Math.floor((Date.now() - new Date(y, mo - 1, d).getTime()) / 86400000))
}

/** 공백 무시 부분일치 — "쌍용동 헬스장" 이 "쌍용동헬스장" 으로 쓰인 제목도 잡는다 */
export function looseIndexOf(haystack: string, needle: string): number {
  const flatNeedle = needle.replace(/\s+/g, '')
  if (!flatNeedle) return -1

  const map: number[] = []
  let flat = ''
  for (let i = 0; i < haystack.length; i++) {
    if (/\s/.test(haystack[i])) continue
    flat += haystack[i]
    map.push(i)
  }
  const idx = flat.indexOf(flatNeedle)
  return idx === -1 ? -1 : map[idx]
}

/** 검색 API 응답 분석 */
export function analyzeSerp(
  keyword: string,
  raw: RawBlogItem[],
  total: number,
  mock: boolean,
  limit = 15
): SerpAnalysis {
  const items: SerpItem[] = raw.slice(0, limit).map((r, i) => {
    const title = stripTags(r.title)
    const { iso, ageDays } = parsePostdate(r.postdate)
    const bloggerName = stripTags(r.bloggername)
    return {
      rank: i + 1,
      title,
      link: r.link,
      description: stripTags(r.description),
      bloggerName,
      bloggerLink: r.bloggerlink,
      postdate: iso,
      ageDays,
      titleLength: title.length,
      keywordPos: looseIndexOf(title, keyword),
      // 상호명·지점명이 제목에 그대로 들어간 글은 업체 공식 블로그인 경우가 많다
      isOfficialBlog: /헬스|피트니스|짐|GYM|fitness/i.test(bloggerName),
    }
  })

  return buildAnalysis(keyword, items, total, mock, 'api')
}

/**
 * 네이버 검색 화면에서 직접 붙여넣은 결과 분석.
 *
 * 검색 API 를 못 쓰는 경우의 입력 경로다. 날짜·블로거명은 붙여넣기에 없을 수 있으므로
 * **모르는 값을 0으로 채워 계산하지 않는다** — 아는 항목만 세고, 근거가 모자란 항목은
 * 처방에서 아예 빼서 "평균 0일" 같은 잘못된 결론이 나오지 않게 한다.
 */
export function analyzePastedSerp(
  keyword: string,
  pasted: (PastedItem & { url?: string })[],
  total: number,
  limit = 30,
  source: 'paste' | 'section' = 'paste',
  /** 상위 글 본문을 실제로 재서 만든 커트라인 (있으면 일반 규격 대신 이걸 쓴다) */
  cutline?: Cutline | null
): SerpAnalysis {
  const items: SerpItem[] = pasted.slice(0, limit).map((p, i) => {
    const title = p.title.trim()
    const { iso, ageDays } = parseIsoDate(p.date)
    const bloggerName = p.blogger?.trim() ?? ''
    return {
      rank: i + 1,
      title,
      link: p.url ?? '',
      description: '',
      bloggerName,
      bloggerLink: '',
      postdate: iso,
      ageDays,
      titleLength: title.length,
      keywordPos: looseIndexOf(title, keyword),
      isOfficialBlog: bloggerName ? /헬스|피트니스|짐|GYM|fitness/i.test(bloggerName) : false,
    }
  })

  // 붙여넣은 값도, 섹션 검색에서 읽어온 값도 실제 화면 기준이므로 샘플(mock)이 아니다
  return buildAnalysis(keyword, items, total, false, source, cutline)
}

function buildAnalysis(
  keyword: string,
  items: SerpItem[],
  total: number,
  mock: boolean,
  source: SerpAnalysis['source'],
  cutline?: Cutline | null
): SerpAnalysis {
  const n = items.length || 1
  const withKeyword = items.filter((i) => i.keywordPos >= 0)
  const front = withKeyword.filter((i) => i.keywordPos <= 6)
  const dated = items.filter((i) => i.postdate)
  const fresh = dated.filter((i) => i.ageDays <= 30)

  const tokenCount = new Map<string, number>()
  const flatKeyword = keyword.replace(/\s+/g, '')
  const keywordParts = new Set(tokenize(keyword))
  for (const item of items) {
    // 같은 제목 안 중복은 1회로 센다
    for (const t of new Set(tokenize(item.title))) {
      if (keywordParts.has(t) || flatKeyword.includes(t)) continue
      tokenCount.set(t, (tokenCount.get(t) ?? 0) + 1)
    }
  }
  const commonTokens = Array.from(tokenCount.entries())
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([token, count]) => ({ token, count }))

  // 이름을 모르는 항목끼리 한 덩어리로 묶여 "빈 이름이 5개 선점" 처럼 보이면 안 된다
  const named = items.filter((i) => i.bloggerName)
  const bloggerCount = new Map<string, number>()
  for (const item of named) {
    bloggerCount.set(item.bloggerName, (bloggerCount.get(item.bloggerName) ?? 0) + 1)
  }
  const repeatBloggers = Array.from(bloggerCount.entries())
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }))

  const stats = {
    avgTitleLength: Math.round(items.reduce((s, i) => s + i.titleLength, 0) / n),
    keywordInTitleRate: Math.round((withKeyword.length / n) * 100),
    keywordFrontRate: Math.round((front.length / n) * 100),
    // 날짜를 아는 항목만으로 계산한다 (모르는 항목을 0일로 넣으면 평균이 망가진다)
    avgAgeDays: dated.length
      ? Math.round(dated.reduce((s, i) => s + i.ageDays, 0) / dated.length)
      : 0,
    freshWithin30dRate: dated.length ? Math.round((fresh.length / dated.length) * 100) : 0,
    datedCount: dated.length,
    bloggerKnownCount: named.length,
    commonTokens,
    repeatBloggers,
  }

  return {
    keyword,
    total,
    items,
    stats,
    prescription: prescribe(keyword, stats, total, source, cutline),
    cutline: cutline ?? undefined,
    mock,
    source,
  }
}

/** 최신성을 말하려면 날짜를 아는 항목이 최소 이만큼은 있어야 한다 */
const DATED_MIN = 4

/** 분석 결과를 "그래서 어떻게 써야 하는지" 문장으로 번역 */
function prescribe(
  keyword: string,
  s: SerpAnalysis['stats'],
  total: number,
  source: SerpAnalysis['source'],
  cutline?: Cutline | null
): string[] {
  const out: string[] = []

  const lo = Math.max(28, s.avgTitleLength - 4)
  const hi = Math.min(40, Math.max(s.avgTitleLength + 4, 34))
  out.push(
    `제목은 ${lo}~${hi}자로 맞추세요. 상위 글 평균이 ${s.avgTitleLength}자입니다 (모바일 표시 한계는 약 35자).`
  )

  if (s.keywordFrontRate >= 60) {
    out.push(
      `상위 글 ${s.keywordFrontRate}%가 "${keyword}"를 제목 맨 앞쪽에 둡니다. 앞 7자 안에 넣으세요.`
    )
  } else if (s.keywordInTitleRate >= 60) {
    out.push(
      `상위 글 ${s.keywordInTitleRate}%가 제목에 "${keyword}"를 넣지만 위치는 자유롭습니다. 앞쪽 배치가 여전히 유리합니다.`
    )
  } else {
    out.push(
      `제목에 "${keyword}"를 정확히 넣은 글이 ${s.keywordInTitleRate}%뿐입니다. 정확히 넣기만 해도 차별점이 됩니다.`
    )
  }

  // 근거(날짜)가 모자라면 최신성은 말하지 않는다. 모르는 것을 0일로 채워
  // "평균 0일" 같은 결론을 내는 것보다, 무엇이 빠졌는지 알려주는 편이 낫다.
  if (s.datedCount < DATED_MIN) {
    out.push(
      source === 'paste'
        ? `날짜가 확인된 글이 ${s.datedCount}개뿐이라 최신성은 판단하지 않았습니다. 각 줄을 "제목 | 2026-07-28" 형태로 날짜까지 채우면 최신성 압박과 진입 타이밍까지 읽어드립니다.`
        : `날짜를 알 수 있는 글이 ${s.datedCount}개뿐이라 최신성은 판단하지 않았습니다.`
    )
  } else if (s.freshWithin30dRate >= 50) {
    out.push(
      `날짜가 확인된 ${s.datedCount}개 중 최근 30일 이내가 ${s.freshWithin30dRate}% — 최신성이 강하게 작동하는 키워드입니다. 지금 쓰면 진입 기회가 있고, 밀리면 빠르게 빠집니다.`
    )
  } else if (s.avgAgeDays > 200) {
    out.push(
      `상위 글 평균 나이가 ${s.avgAgeDays}일입니다. 오래된 글이 버티는 자리라 최신 글로 밀어내기 좋습니다 — 대신 정보량이 상위 글보다 확실히 많아야 합니다.`
    )
  } else {
    out.push(`상위 글 평균 나이 ${s.avgAgeDays}일 — 최신성 압박은 보통 수준입니다.`)
  }

  if (s.commonTokens.length) {
    const top = s.commonTokens.slice(0, 5).map((t) => t.token).join(', ')
    out.push(
      `상위 제목에 반복되는 말: ${top}. 검색하는 사람이 실제로 알고 싶은 게 이쪽이라는 신호이니 소제목에 반영하세요.`
    )
  }

  if (s.repeatBloggers.length) {
    const worst = s.repeatBloggers[0]
    out.push(
      `"${worst.name}" 블로그가 상위에 ${worst.count}개를 차지하고 있습니다. 이 키워드는 특정 블로그가 선점한 상태라 세부 의도를 붙여 우회하는 편이 빠릅니다.`
    )
  }

  // 상위 글을 실제로 재봤으면 그 값이 기준이다. 일반 규격은 못 읽었을 때만 쓴다 —
  // 실측하면 키워드마다 판이 다르다 ("쌍용동 헬스장" 1위는 2,223자·이미지 17장).
  const body = cutline
    ? cutlineLine(cutline)
    : '본문은 2,000자 이상(정보가 알차면 2,500자)으로, 직접 촬영 이미지 5장 이상, 30초~3분 영상 1개를 넣으세요.'
  out.push(
    total > 0
      ? `이 키워드로 최근 30일에 새 글 ${total.toLocaleString()}개가 올라왔습니다. ${body}`
      : `${body} (발행량 자동 조회가 막혀 경쟁 규모는 함께 보지 못했습니다.)`
  )

  return out
}
