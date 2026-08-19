/**
 * 플레이스 리뷰 — 붙여넣기 → 분석 → 인용.
 *
 * 회원 요청 — "홍보성 글에 플레이스 관련 헬스 및 피티 리뷰를 분석해서 신뢰성을 줄 수 있게
 * 작성해주면 좋겠어. **실제 리뷰인 거지.** 링크도 첨부해서."
 *
 * ─── 왜 붙여넣기인가 ────────────────────────────────────────
 *
 * 플레이스 리뷰는 자동으로 못 읽는다. 같은 이유가 이미 확인돼 있다 (lib/naver/place.ts) —
 * m.place·pcmap-api·map v5 가 서버 IP 를 429/캡차로 막는다. 통합검색 HTML 에는 리뷰 본문이
 * 없다. 그래서 SERP 에서 이미 쓰는 방식(「붙여넣어 분석」)을 그대로 쓴다.
 *
 * ─── 왜 「실제 리뷰인 거지」가 이 파일의 핵심인가 ──────────────
 *
 * AI 에게 「리뷰에서 이런 말이 많다」를 시키면 없는 리뷰를 만들어낸다. 그건 문체 문제가
 * 아니라 **표시광고법 위반**이다 (거짓·과장 광고). 그래서 두 가지를 코드로 막는다:
 *
 *   1. 지시문은 **붙여넣은 리뷰 안의 문장만** 인용하게 한다 (prompt.ts).
 *   2. 검수는 본문에서 **리뷰라고 붙여 쓴 인용**을 찾아 원본에 있는지 대조한다
 *      (`verifyReviewQuotes` → checker 의 `review-honesty`). 없으면 즉시수정이다.
 *
 * 상담 대화 인용("제 시간에 문 여는 데가 없어요")은 리뷰가 아니므로 대조 대상이 아니다 —
 * 그래서 「리뷰라고 붙여 쓴 것」만 골라낸다. 낱말이 아니라 **주장**을 보는 것이다.
 */

export interface PlaceReview {
  text: string
  /**
   * text  — 방문자가 쓴 문장 (인용 가능)
   * tag   — 네이버가 주는 선택형 키워드 리뷰 (「시설이 깨끗해요」). 주제는 세지만 인용하지 않는다.
   */
  kind: 'text' | 'tag'
}

export interface ReviewTheme {
  /** 사람이 읽는 주제 이름 */
  label: string
  /** 이 주제를 말한 리뷰 수 */
  count: number
  /** 전체 리뷰 중 비율 (0~1) */
  share: number
  /** 실제로 걸린 낱말 (지시문에 그대로 넣어 근거를 보여준다) */
  words: string[]
}

export interface ReviewAnalysis {
  /** 인용 가능한 리뷰 수 */
  count: number
  /** 선택형 키워드 리뷰 수 */
  tagCount: number
  themes: ReviewTheme[]
  /** 그대로 인용할 만한 문장 (주제가 겹치지 않게 고른다) */
  quotes: string[]
  /** 리뷰가 아니라고 보고 버린 줄 수 */
  dropped: number
}

/**
 * 헬스장·PT 리뷰에서 반복되는 주제.
 *
 * **순위 기준이 아니다.** 리뷰에서 무엇이 반복되는지 세는 사전이고, 그 결과는 글에 쓸
 * 「무엇을 강조할까」를 정하는 데만 쓴다. 낱말은 실제 헬스장 리뷰에 나오는 말로 골랐다.
 */
const THEMES: { label: string; words: string[] }[] = [
  { label: '청결·관리', words: ['깨끗', '청결', '정리', '위생', '냄새', '관리가', '쾌적'] },
  { label: '자세 코칭', words: ['자세', '잡아주', '봐주', '교정', '알려주', '가르쳐'] },
  { label: '친절·부담 없음', words: ['친절', '편하게', '부담', '눈치', '배려', '세심'] },
  { label: '시간대·24시간', words: ['새벽', '24시', '늦게', '밤에', '아침', '언제든', '시간대'] },
  { label: '기구·머신', words: ['기구', '머신', '랙', '덤벨', '벤치', '유산소', '종류가'] },
  { label: '대기 없음', words: ['대기', '붐비', '기다리', '여유', '한산', '겹치'] },
  { label: '샤워·부대시설', words: ['샤워', '라커', '탈의', '수건', '주차', '드라이'] },
  { label: 'PT·트레이너', words: ['PT', '피티', '트레이너', '선생님', '쌤', '수업', '프로그램'] },
  { label: '가격', words: ['가격', '저렴', '합리적', '가성비', '금액', '할인'] },
  { label: '몸 변화', words: ['체중', '빠졌', '근육', '변화', '감량', '늘었'] },
  { label: '위치·접근성', words: ['가까', '근처', '위치', '역에서', '주변', '동네'] },
]

/** 리뷰일 리 없는 줄 — 플레이스 화면의 UI·부가 정보 */
const NOISE = [
  /^(방문자\s*리뷰|블로그\s*리뷰|리뷰|영수증|예약|저장|공유|길찾기|전화|더보기|접기|신고)$/,
  /^(팔로우|팔로워|이웃추가|답글|좋아요|반응|사진|영상|메뉴|가격표)/,
  /^\d+\s*(개|건|번째|명|월|일|년)?$/,
  /^\d{1,2}\/\d{1,2}(\([월화수목금토일]\))?$/,
  /^20\d{2}[.\-/\s]/,
  /^(방문일|방문\s*\d|예약\s*·|영수증\s*·|인증)/,
  /^[·•\-–—|/\\★☆]+$/,
  /^(월|화|수|목|금|토|일)$/,
]

/** 짧은 줄이 리뷰이려면 서술어로 끝난다 (닉네임 걸러내기) */
const SHORT_TAIL = /(요|다|음|움|굿|최고|짱)$/

function normalize(s: string): string {
  return s.replace(/\s+/g, '').toLowerCase()
}

/**
 * 붙여넣은 리뷰 화면에서 리뷰 문장을 뽑는다.
 *
 * paste.ts 와 같은 태도다 — **완벽하게 파싱하려 하지 않는다.** 화면마다 순서와 잡음이
 * 다르므로, 목표는 정확성이 아니라 「손볼 양을 줄이는 것」이다. 결과를 화면에 보여주고
 * 회원이 직접 지우거나 고칠 수 있게 한다.
 */
export function parsePastedReviews(raw: string): { reviews: PlaceReview[]; dropped: number } {
  const reviews: PlaceReview[] = []
  const seen = new Set<string>()
  let dropped = 0

  for (const line of (raw ?? '').split(/\r?\n/)) {
    const t = line.trim().replace(/^["“”'·•\-]+|["“”']+$/g, '').trim()
    if (!t) continue
    if (t.length < 4 || NOISE.some((re) => re.test(t))) {
      dropped++
      continue
    }
    const key = normalize(t)
    if (seen.has(key)) {
      dropped++
      continue
    }
    seen.add(key)
    /*
     * 12자 미만은 `tag` 로 둔다. 네이버 선택형 키워드 리뷰(「시설이 깨끗해요」)와 방문자가
     * 쓴 짧은 한마디를 낱말로 구분하려 해봤는데, 「깨끗하고 친절해서 좋았어요」처럼 둘 다에
     * 걸리는 문장이 많았다. 어차피 12자 미만은 인용해도 근거가 안 되므로 길이로 가른다 —
     * 주제 세기에는 둘 다 쓴다.
     *
     * 다만 **짧은 줄은 서술어로 끝나야 남긴다.** 닉네임(「헬스빌런」)이 4자 이상이라 그냥
     * 통과하던 것을 이걸로 걸렀다. 닉네임은 서술어로 끝나지 않고, 「친절해요」 같은 진짜
     * 한마디는 끝난다. 완벽하지는 않으니 화면에서 줄마다 지울 수 있게 해뒀다.
     */
    const short = t.length < 12
    if (short && !SHORT_TAIL.test(t)) {
      dropped++
      continue
    }
    reviews.push({ text: t, kind: short ? 'tag' : 'text' })
  }
  return { reviews, dropped }
}

/** 인용문 길이 — 너무 짧으면 근거가 안 되고, 너무 길면 본문이 리뷰로 채워진다 */
const QUOTE_MIN = 18
const QUOTE_MAX = 90

/**
 * 인용 후보 — 리뷰 원문과, 긴 리뷰에서 잘라낸 문장.
 *
 * 실제 예약 리뷰는 대부분 90자를 넘는다. 원문만 후보로 두면 리뷰 20편을 모아도 인용문이
 * **한 줄**밖에 나오지 않았다 (쌍용점 데이터로 직접 세어 봤다). 그러면 「실제 리뷰를 인용해서
 * 신뢰를 준다」는 목적이 리뷰를 모을수록 오히려 비어버린다.
 *
 * 문장 단위로 자른 것은 **원문의 부분 문자열**이므로 review-honesty 대조(양방향 부분
 * 문자열)를 그대로 통과한다 — 말을 바꾸는 게 아니라 긴 리뷰에서 한 문장만 떼는 것이다.
 */
function quoteCandidates(texts: PlaceReview[]): string[] {
  const out: string[] = []
  for (const r of texts) {
    out.push(r.text)
    if (r.text.length <= QUOTE_MAX) continue
    for (const piece of r.text.split(/(?<=[.!?…])\s+|\n+/)) {
      const t = piece.trim()
      if (t && t.length <= QUOTE_MAX) out.push(t)
    }
  }
  return out
}

/**
 * 리뷰에서 반복되는 주제와 인용할 문장을 뽑는다.
 *
 * 「분석해서」의 실체는 이것이다 — 몇 명이 같은 말을 했는지. 「깨끗하다」가 12편 중 7편에
 * 나왔다면 그건 우리가 고른 강점이 아니라 **손님들이 고른 강점**이고, 글에서 그 순서대로
 * 쓰는 것이 신뢰를 만든다.
 */
export function analyzeReviews(reviews: PlaceReview[], dropped = 0): ReviewAnalysis {
  const texts = reviews.filter((r) => r.kind === 'text')
  const all = reviews

  const themes: ReviewTheme[] = []
  for (const th of THEMES) {
    const hit = all.filter((r) => th.words.some((w) => normalize(r.text).includes(normalize(w))))
    if (!hit.length) continue
    const words = th.words.filter((w) => hit.some((r) => normalize(r.text).includes(normalize(w))))
    themes.push({
      label: th.label,
      count: hit.length,
      share: all.length ? hit.length / all.length : 0,
      words,
    })
  }
  themes.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))

  /*
   * 인용문은 **주제가 겹치지 않게** 고른다. 같은 얘기 세 줄을 인용하면 리뷰가 세 개라도
   * 근거는 하나다. 길이는 18~90자 — 너무 짧으면 근거가 안 되고, 너무 길면 본문이 리뷰로
   * 채워진다.
   */
  const quotes: string[] = []
  const usedThemes = new Set<string>()
  /*
   * 90자 안에서는 **긴 것부터** 고른다. 짧은 순으로 고르면 「친절하고 잘 설명해주세요!」처럼
   * 어느 헬스장에나 붙는 스무 자짜리가 뽑히는데, 그건 인용해도 근거가 되지 않는다.
   * 근거가 되는 문장은 무엇을 어떻게 해줬는지가 들어 있고, 그건 길이로 걸러진다.
   */
  const candidates = quoteCandidates(texts).sort((a, b) => b.length - a.length)
  for (const pass of [1, 2]) {
    for (const text of candidates) {
      if (quotes.length >= 4) break
      const len = text.length
      if (len < QUOTE_MIN || len > QUOTE_MAX) continue
      if (quotes.some((q) => normalize(q).includes(normalize(text)) || normalize(text).includes(normalize(q)))) continue
      const mine = THEMES.filter((th) => th.words.some((w) => normalize(text).includes(normalize(w)))).map(
        (th) => th.label
      )
      if (!mine.length) continue
      // 1차는 새 주제만, 2차는 남은 자리를 채운다
      if (pass === 1 && mine.every((m) => usedThemes.has(m))) continue
      mine.forEach((m) => usedThemes.add(m))
      quotes.push(text)
    }
  }

  return {
    count: texts.length,
    tagCount: all.length - texts.length,
    themes,
    quotes,
    dropped,
  }
}

/** 플레이스 리뷰 페이지 주소 — 글에 첨부할 링크 */
export function placeReviewUrl(placeId?: string): string | null {
  const id = placeId?.trim().replace(/[^0-9]/g, '')
  return id ? `https://m.place.naver.com/place/${id}/review/visitor` : null
}

export interface QuoteCheck {
  quote: string
  /** 붙여넣은 리뷰에 있는 문장인가 */
  ok: boolean
}

/** 본문의 인용 앞뒤에 이 말이 있으면 「리뷰라고 붙여 쓴 인용」으로 본다 */
const ATTRIBUTION = /리뷰|후기|플레이스|별점|평점/

/**
 * 본문에서 **리뷰라고 붙여 쓴 인용**을 찾아 원본과 대조한다.
 *
 * 왜 모든 인용을 보지 않는가 — 홍보글은 상담 대화도 인용한다 ("제 시간에 문 여는 데가
 * 없어요"). 그건 리뷰가 아니므로 대조 대상이 아니고, 전부 대조하면 멀쩡한 글이 걸린다.
 * 그래서 인용 앞뒤 40자에 「리뷰·후기·플레이스·별점·평점」이 있는 것만 본다.
 *
 * 대조는 공백을 지우고 부분 문자열로 본다. 리뷰를 그대로 옮기면서 말줄임(…)이나 조사만
 * 다듬는 일이 흔한데, 그걸 위반으로 잡으면 아무도 인용을 못 한다. 양방향으로 본다 —
 * 인용이 리뷰 안에 있거나, 리뷰가 인용 안에 있으면 통과다.
 */
export function verifyReviewQuotes(body: string, reviews: PlaceReview[]): QuoteCheck[] {
  const hay = reviews.map((r) => normalize(r.text))
  const out: QuoteCheck[] = []
  const text = body ?? ''
  const re = /["“]([^"”\n]{6,140})["”]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const quote = m[1].trim()
    const from = Math.max(0, m.index - 40)
    const context = text.slice(from, Math.min(text.length, m.index + m[0].length + 40))
    if (!ATTRIBUTION.test(context)) continue
    const q = normalize(quote).replace(/[.…·,~!?]/g, '')
    const ok = hay.some((h) => {
      const clean = h.replace(/[.…·,~!?]/g, '')
      return clean.includes(q) || q.includes(clean)
    })
    out.push({ quote, ok })
  }
  return out
}
