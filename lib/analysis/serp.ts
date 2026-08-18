import type { SerpAnalysis, SerpItem } from '@/lib/types'
import { stripTags, type RawBlogItem } from '../naver/search'
import type { PastedItem } from './paste'
import { cutlineLine, type Cutline } from './cutline'
import { splitTokens } from './tokens'

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
  cutline?: Cutline | null,
  /** 우리 지점 이름·상호 — 남의 상호와 구분하려고 받는다 */
  myNames: string[] = []
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
  return buildAnalysis(keyword, items, total, false, source, cutline, myNames)
}

function buildAnalysis(
  keyword: string,
  items: SerpItem[],
  total: number,
  mock: boolean,
  source: SerpAnalysis['source'],
  cutline?: Cutline | null,
  myNames: string[] = []
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

  /**
   * 상위권을 층으로 나눠 본다.
   *
   * "상위 15개에 2번 이상 나온 말" 은 뭉툭하다. 1~3위가 **공통으로** 쓴 말은 훨씬
   * 강한 신호이고, 반대로 **상위 10위 안에 한 번도 안 나온 말**은 아직 아무도 안
   * 쓴 자리다(빈틈). 두 목록을 따로 만든다.
   */
  const topN = (n: number) => items.slice(0, n)
  const tokensOf = (list: SerpItem[]) =>
    list.map((i) => new Set(tokenize(i.title).filter((t) => !keywordParts.has(t) && !flatKeyword.includes(t))))

  const top3 = tokensOf(topN(3))
  const sharedTop3 = top3.length
    ? Array.from(top3[0]).filter((t) => top3.every((set) => set.has(t)))
    : []

  const top5 = tokensOf(topN(5))
  const sharedTop5 = top5.length
    ? Array.from(top5[0]).filter((t) => top5.every((set) => set.has(t)))
    : []

  // 상위 10위 안에는 없는데 그 아래에서는 쓰이는 말 = 아직 위쪽이 안 쓴 자리
  const inTop10 = new Set<string>()
  for (const set of tokensOf(topN(10))) for (const t of set) inTop10.add(t)
  const belowOnly = Array.from(tokenCount.entries())
    .filter(([t, c]) => c >= 2 && !inTop10.has(t))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
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
    /*
     * 7일 기준은 30일 기준과 뜻이 다르다. 30일은 「최신성이 작동하는가」이고,
     * 7일은 **「새 글이 지금 뚫고 들어오는가」**다. 발행하고 한 주 안에 1페이지에 올라온
     * 글이 실제로 있는 판이면 우리도 그 자리를 노려볼 수 있고, 한 편도 없으면 그 키워드는
     * 자리가 굳어 있어서 몇 달을 봐야 한다.
     */
    freshWithin7d: dated.filter((i) => i.ageDays <= 7).length,
    youngestAgeDays: dated.length ? Math.min(...dated.map((i) => i.ageDays)) : null,
    datedCount: dated.length,
    bloggerKnownCount: named.length,
    commonTokens,
    ...splitTokensToStats(commonTokens, myNames),
    sharedTop3: splitTokens(sharedTop3.map((token) => ({ token, count: 3 })), myNames).usable,
    sharedTop5: splitTokens(sharedTop5.map((token) => ({ token, count: 5 })), myNames).usable,
    gapTokens: splitTokens(belowOnly, myNames).usable,
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

function splitTokensToStats(
  tokens: { token: string; count: number }[],
  myNames: string[]
): Pick<SerpAnalysis['stats'], 'usableTokens' | 'rivalTokens' | 'otherTradeTokens'> {
  const s = splitTokens(tokens, myNames)
  return { usableTokens: s.usable, rivalTokens: s.rivals, otherTradeTokens: s.otherTrades }
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

  /*
   * **한 주 안에 뚫린 자리가 있나** (2026-08-18 추가).
   *
   * 회원 질문 "보통 며칠이면 상위 노출되냐" 를 실측해보니, 1페이지 60편의 나이 중간값이
   * 35일이고 7일 이내는 7% 였다. 그 7% 를 따로 재보니 **글의 형태로는 안 갈렸다** —
   * 글자수·이미지·정보/홍보/경험 낱말이 오래된 글과 사실상 같았다. 갈린 것은 블로그 힘이고,
   * 그건 글 한 편으로 못 바꾼다.
   *
   * 대신 **바꿀 수 있는 것은 어느 키워드를 고르느냐**다. 그래서 이 줄을 처방에 넣는다 —
   * 한 주 안에 들어온 글이 실제로 있으면 우리도 노려볼 자리가 있다는 뜻이고, 한 편도
   * 없으면 그 키워드는 자리가 굳어 있다.
   */
  if (s.datedCount >= DATED_MIN) {
    if (s.freshWithin7d > 0) {
      out.push(
        `1페이지에 발행 7일 이내 글이 ${s.freshWithin7d}편 있습니다 (가장 어린 글 ${s.youngestAgeDays}일) — 새 글이 지금 뚫고 들어오는 자리입니다. 우리 판 실측에서 1페이지 글의 나이 중간값은 35일, 7일 이내는 7%뿐이었으니 이건 드문 기회입니다.`
      )
    } else {
      out.push(
        `1페이지에 발행 7일 이내 글이 한 편도 없습니다 (가장 어린 글 ${s.youngestAgeDays}일). 자리가 굳어 있어 한 주 안에 올라오길 기대하기 어렵습니다 — 발행량이 더 적은 세부 키워드로 먼저 자리를 잡는 편이 빠릅니다.`
      )
    }
  }

  // 지시에는 쓸 수 있는 말만 넣는다. 남의 상호·다른 종목을 "소제목에 넣으세요" 라고
  // 하면 남의 가게를 홍보하거나 안 하는 걸 한다고 쓰는 글이 된다.
  // 1~3위가 다 쓴 말은 사실상 필수 요소다 — 뭉툭한 "2번 이상" 보다 먼저 말한다
  if (s.sharedTop3?.length) {
    const top = s.sharedTop3.slice(0, 4).map((t) => t.token).join(', ')
    out.push(
      `**상위 1~3위가 모두 쓴 말: ${top}.** 위쪽 세 편이 공통으로 넣었다는 것은 이 키워드에서 사실상 필수 요소라는 뜻입니다 — 제목이나 첫 소제목에 넣으세요.`
    )
  } else if (s.sharedTop5?.length) {
    const top = s.sharedTop5.slice(0, 4).map((t) => t.token).join(', ')
    out.push(`상위 1~5위가 모두 쓴 말: ${top}. 소제목에 반영하세요.`)
  }

  if (s.usableTokens.length) {
    const top = s.usableTokens.slice(0, 5).map((t) => t.token).join(', ')
    out.push(
      `상위 제목에 반복되는 말: ${top}. 검색하는 사람이 실제로 알고 싶은 게 이쪽이라는 신호이니 소제목에 반영하세요.`
    )
  }

  // 위쪽이 아직 안 쓴 말 = 빈틈
  if (s.gapTokens?.length) {
    const gap = s.gapTokens.slice(0, 3).map((t) => t.token).join(', ')
    out.push(
      `상위 10위 안에는 안 나오는데 그 아래에서는 쓰이는 말: ${gap}. 위쪽이 아직 안 다룬 자리이니, 이 각도로 한 편 쓰면 같은 키워드에서 다른 의도로 들어갈 수 있습니다.`
    )
  }

  if (s.rivalTokens.length) {
    const names = s.rivalTokens.slice(0, 3).map((t) => `"${t.token}"`).join(', ')
    out.push(
      /*
       * 「우리도 방문 후기 형태로 맞붙어라」는 후기글에게 할 말이다. 홍보글 지시문으로
       * 넘어가면 제목에 「후기」가 박히고 본문이 방문자 말투가 된다 — 실제로 그랬다.
       * 꺼내 쓸 때 prescriptionForType 이 유형에 맞게 갈아끼우지만, 저장되는 문장 자체도
       * 어느 유형에게 할 말인지 분명히 적는다.
       */
      `상위 제목에 다른 업체 이름(${names})이 반복됩니다 — 그 업체 후기 글이 이 키워드를 먹고 있다는 뜻입니다. **후기글로 맞붙거나**, 홍보·정보글이라면 세부 의도를 붙여 우회하세요. (그 이름을 우리 글에 쓰면 남의 가게를 홍보하는 셈이니 쓰지 마세요.)`
    )
  }

  if (s.otherTradeTokens.length) {
    const names = s.otherTradeTokens.slice(0, 3).map((t) => t.token).join(', ')
    out.push(
      `상위 글에 ${names} 같은 다른 종목이 섞여 있습니다. 우리가 하지 않는 종목이니 글에 넣지 말고, 헬스·PT 쪽 의도로 좁히는 편이 낫습니다.`
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
