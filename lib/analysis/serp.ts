import type { SerpAnalysis, SerpItem } from '@/lib/types'
import { stripTags, type RawBlogItem } from '../naver/search'

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

function parsePostdate(s: string): { iso: string; ageDays: number } {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(s ?? '')
  if (!m) return { iso: '', ageDays: 0 }
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const ageDays = Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000))
  return { iso: `${m[1]}-${m[2]}-${m[3]}`, ageDays }
}

/** 공백 무시 부분일치 — "쌍용동 헬스장" 이 "쌍용동헬스장" 으로 쓰인 제목도 잡는다 */
function looseIndexOf(haystack: string, needle: string): number {
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
    return {
      rank: i + 1,
      title,
      link: r.link,
      description: stripTags(r.description),
      bloggerName: stripTags(r.bloggername),
      bloggerLink: r.bloggerlink,
      postdate: iso,
      ageDays,
      titleLength: title.length,
      keywordPos: looseIndexOf(title, keyword),
      // 상호명·지점명이 제목에 그대로 들어간 글은 업체 공식 블로그인 경우가 많다
      isOfficialBlog: /헬스|피트니스|짐|GYM|fitness/i.test(stripTags(r.bloggername)),
    }
  })

  const n = items.length || 1
  const withKeyword = items.filter((i) => i.keywordPos >= 0)
  const front = withKeyword.filter((i) => i.keywordPos <= 6)
  const fresh = items.filter((i) => i.ageDays > 0 && i.ageDays <= 30)

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

  const bloggerCount = new Map<string, number>()
  for (const item of items) {
    bloggerCount.set(item.bloggerName, (bloggerCount.get(item.bloggerName) ?? 0) + 1)
  }
  const repeatBloggers = Array.from(bloggerCount.entries())
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }))

  const avgTitleLength = Math.round(items.reduce((s, i) => s + i.titleLength, 0) / n)
  const avgAgeDays = Math.round(items.reduce((s, i) => s + i.ageDays, 0) / n)
  const keywordInTitleRate = Math.round((withKeyword.length / n) * 100)
  const keywordFrontRate = Math.round((front.length / n) * 100)
  const freshWithin30dRate = Math.round((fresh.length / n) * 100)

  const stats = {
    avgTitleLength,
    keywordInTitleRate,
    keywordFrontRate,
    avgAgeDays,
    freshWithin30dRate,
    commonTokens,
    repeatBloggers,
  }

  return {
    keyword,
    total,
    items,
    stats,
    prescription: prescribe(keyword, stats, total),
    mock,
  }
}

/** 분석 결과를 "그래서 어떻게 써야 하는지" 문장으로 번역 */
function prescribe(
  keyword: string,
  s: SerpAnalysis['stats'],
  total: number
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

  if (s.freshWithin30dRate >= 50) {
    out.push(
      `최근 30일 이내 글이 ${s.freshWithin30dRate}% — 최신성이 강하게 작동하는 키워드입니다. 지금 쓰면 진입 기회가 있고, 밀리면 빠르게 빠집니다.`
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

  out.push(
    `누적 발행량 ${total.toLocaleString()}건. 본문은 2,000자 이상(정보가 알차면 2,500자)으로, 직접 촬영 이미지 5장 이상, 30초~3분 영상 1개를 넣으세요.`
  )

  return out
}
