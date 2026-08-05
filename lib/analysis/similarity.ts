/**
 * 유사문서 판독 — 내 글이 상위 글과 얼마나 그대로 겹치는지.
 *
 * **왜 필요한가.** 상위노출 분석은 "상위권이 쓰는 말" 을 알려준다. 그 말을 참고하다
 * 보면 문장까지 따라 쓰게 되는데, 네이버는 다른 문서와 많이 겹치는 글을 원본으로
 * 취급하지 않는다. 그러면 아무리 잘 써도 검색에 안 걸린다. AI 로 초안을 쓰는 경로가
 * 있으니 더 위험하다 — 같은 지시문으로 쓰면 남이 쓴 문장과 비슷해질 수 있다.
 *
 * **말할 수 있는 것과 없는 것.** 네이버가 유사문서로 판정하는 기준값은 공개돼 있지
 * 않다. 그래서 "몇 % 넘으면 걸린다" 는 말은 하지 않는다. 여기서 재는 것은 딱 하나 —
 * **내 글의 어느 만큼이 상위 글에도 글자 그대로 있는지.** 그리고 겹치는 구절을 그대로
 * 보여준다. 숫자보다 그 구절이 실제로 고칠 것을 알려준다.
 *
 * 겹치는 게 늘 문제인 것은 아니다. 지점 주소·전화번호·영업시간처럼 사실이라서
 * 같아야 하는 문구는 어쩔 수 없다. 그래서 판정하지 않고 보여주기만 한다.
 */

/**
 * 비교 단위 — 글자 n-그램.
 *
 * 한국어는 어절 경계가 흔들려서(띄어쓰기 차이) 단어 단위로 비교하면 같은 문장을
 * 다르다고 본다. 그래서 공백을 지운 글자 사슬로 비교한다.
 *
 * 14 자로 잡은 이유: 더 짧으면 "운동을 시작하려고" 같은 흔한 말이 걸려 겹침이
 * 부풀고, 더 길면 조사 한 글자만 바꿔도 놓친다.
 */
export const SHINGLE = 14
/** 이만큼 이어서 겹치면 화면에 구절로 보여준다 */
export const RUN_MIN = 25
/** 이만큼도 안 되는 글은 재지 않는다 — 짧은 글은 겹침 비율이 튄다 */
export const MIN_LENGTH = 300

interface Norm {
  /** 공백·기호를 뺀 비교용 글자열 */
  clean: string
  /** clean[i] 가 원문 몇 번째 글자였는지 — 겹친 구절을 원문 그대로 보여주려고 */
  map: number[]
}

export function normalizeForCompare(text: string): Norm {
  const clean: string[] = []
  const map: number[] = []
  const s = text ?? ''
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (/[가-힣a-zA-Z0-9]/.test(ch)) {
      clean.push(ch.toLowerCase())
      map.push(i)
    }
  }
  return { clean: clean.join(''), map }
}

export function shingleSet(clean: string, n = SHINGLE): Set<string> {
  const out = new Set<string>()
  for (let i = 0; i + n <= clean.length; i++) out.add(clean.slice(i, i + n))
  return out
}

export interface SimilarityHit {
  url: string
  /** 내 글의 몇 %가 이 글에도 그대로 있는지 */
  overlap: number
  /** 그대로 겹치는 구절 (긴 것부터, 원문 표기 그대로) */
  samples: string[]
}

/**
 * 내 글 하나와 상대 글 하나를 견준다 (순수 함수 — 테스트 대상).
 *
 * 방향이 중요하다. 분모는 **내 글**이다 — "내 글의 어느 만큼이 남의 글에도 있나" 를
 * 물어야 고칠 곳이 나온다. 반대로 재면 남의 긴 글에 내 짧은 글이 묻혀 늘 낮게 나온다.
 */
export function compareOne(mine: string, theirs: string, url: string): SimilarityHit | null {
  const a = normalizeForCompare(mine)
  const b = normalizeForCompare(theirs)
  const total = a.clean.length - SHINGLE + 1
  if (total <= 0 || b.clean.length < SHINGLE) return null

  const theirShingles = shingleSet(b.clean)
  const marked: boolean[] = new Array(total)
  let hits = 0
  for (let i = 0; i < total; i++) {
    const on = theirShingles.has(a.clean.slice(i, i + SHINGLE))
    marked[i] = on
    if (on) hits++
  }

  // 이어진 표시를 구절로 묶는다 (겹치는 자리를 눈으로 보여주려고)
  const samples: { len: number; text: string }[] = []
  let start = -1
  for (let i = 0; i <= total; i++) {
    const on = i < total && marked[i]
    if (on && start < 0) start = i
    if (!on && start >= 0) {
      const from = a.map[start]
      const to = a.map[Math.min(i - 1 + SHINGLE - 1, a.map.length - 1)]
      const len = i - 1 + SHINGLE - start
      if (len >= RUN_MIN) samples.push({ len, text: mine.slice(from, to + 1).trim() })
      start = -1
    }
  }

  return {
    url,
    overlap: Math.round((hits / total) * 1000) / 10,
    samples: samples
      .sort((x, y) => y.len - x.len)
      .slice(0, 3)
      .map((s) => s.text),
  }
}

export interface SimilarityReport {
  /** 겹침이 큰 순서 */
  hits: SimilarityHit[]
  /** 가장 많이 겹친 글 */
  worst: SimilarityHit | null
  /** 몇 편과 견줬는지 */
  compared: number
  /** 사람에게 하는 한 줄 */
  headline: string
  /** 겹침이 커서 손봐야 하는지 */
  needsWork: boolean
}

/**
 * 임계값은 실측으로 잡았다 ("쌍용동 헬스장" 상위 5편, 2026-08).
 *
 * 서로 베끼지 않은 상위 글끼리 견주면 **0.1~3.9%** 가 나왔다. 그 3.9% 마저도 겹치는
 * 구절이 「미녀와야수짐 봉명점 … 충청남도 천안시 서북구 봉명로 35」처럼 주소·상호였다 —
 * 사실이라서 같은 문구다. 같은 글의 본문을 앞뒤만 바꿔 베낀 초안은 97.8% 였다.
 *
 * 즉 정상 범위와 베낀 범위 사이가 아주 넓다. 그래서 10% 를 「한 번 보라」, 25% 를
 * 「문장을 따라 쓴 흔적」으로 잡았다 — 정상 글이 걸리지 않을 만큼 위에 둔 값이다.
 */
export const OVERLAP_HIGH = 25
/** 이 위로는 한 번 살펴볼 값 */
export const OVERLAP_SOME = 10

export function compareWithTop(
  mine: string,
  tops: { url: string; text: string }[]
): SimilarityReport | null {
  const clean = normalizeForCompare(mine).clean
  // 짧은 글은 재지 않는다 — 비율이 튀어서 없는 문제를 만들어낸다
  if (clean.length < MIN_LENGTH) return null

  const hits = tops
    .map((t) => compareOne(mine, t.text, t.url))
    .filter((h): h is SimilarityHit => h !== null)
    .sort((a, b) => b.overlap - a.overlap)

  if (!hits.length) return null
  const worst = hits[0]
  const needsWork = worst.overlap >= OVERLAP_HIGH

  let headline: string
  if (needsWork) {
    headline = `상위 글 한 편과 ${worst.overlap}% 가 글자 그대로 겹칩니다 — 아래 구절을 내 말로 다시 쓰세요.`
  } else if (worst.overlap >= OVERLAP_SOME) {
    headline = `가장 많이 겹치는 글과 ${worst.overlap}% 입니다. 아래 구절만 확인해 보세요 — 주소·영업시간처럼 어차피 같아야 하는 문구라면 그대로 둬도 됩니다.`
  } else {
    headline = `상위 ${hits.length}편과 견줬고, 가장 많이 겹치는 것도 ${worst.overlap}% 입니다. 따라 쓴 흔적은 없습니다.`
  }

  return { hits, worst, compared: hits.length, headline, needsWork }
}

// ─── 내 글끼리 (지점 간) ────────────────────────────────────────

/**
 * **내 글끼리 겹치는지 본다 — 특히 지점이 다른 글끼리.**
 *
 * 이걸 안 보고 있었다. 유사문서 방어 장치가 셋 다 딴 곳을 보고 있었다 —
 * `compareWithTop` 은 **경쟁 상위 글**만, `adviseRotation` 과 AI 지시문의 참고 글은
 * **같은 지점** 것만 봤다. 그래서 지점 4곳에 같은 글을 지점명만 바꿔 올리면 경고가
 * 하나도 뜨지 않았다.
 *
 * 실측(2026-08-05, 홍보글 1편을 지점명·지역명·전화만 바꿔 4벌 만들어 이 파일의
 * `compareOne` 으로 재봄):
 *   지점명만 바꿈                 → **90.4%** 겹침, 876자 연속 동일
 *   + 가장 긴 「해결」 단락 새로 씀 → **54.6%** (그래도 기준 초과)
 *
 * 즉 부분 수정으로는 안 내려간다. 그래서 **초안을 쓰는 동안** 알려줘야 한다 —
 * 다 쓰고 나서 「대부분 다시 쓰세요」는 조치가 아니다.
 *
 * 네트워크를 쓰지 않는다. 내 글은 이미 화면에 있으므로 즉시 잰다.
 */
export interface MineHit extends SimilarityHit {
  postId: string
  title: string
  /** 그 글이 어느 지점 것인지 (없으면 지점 미지정) */
  storeName?: string
  /** 지점이 다른 글인지 — 다르면 더 위험하다 (같은 내용을 여러 지점에 돌린 신호) */
  otherStore: boolean
}

export interface MineReport {
  hits: MineHit[]
  worst: MineHit
  compared: number
  headline: string
  needsWork: boolean
}

/**
 * 내 초안을 내가 쓴 다른 글들과 견준다 (순수 함수 — 테스트 대상).
 *
 * `myStoreId` 를 주면 「지점이 다른 글」을 따로 표시한다. 같은 지점 안에서 겹치는 것은
 * 자기잠식이고, 지점이 달라도 겹치는 것은 **같은 글을 돌려 쓴 것**이다 — 후자가 더
 * 위험하니 말도 다르게 한다.
 */
export function compareWithMine(
  mine: string,
  others: { id: string; title: string; body: string; storeId?: string; storeName?: string }[],
  myStoreId?: string
): MineReport | null {
  const clean = normalizeForCompare(mine).clean
  if (clean.length < MIN_LENGTH) return null

  const hits = others
    .map((o) => {
      const h = compareOne(mine, o.body, o.id)
      if (!h) return null
      return {
        ...h,
        postId: o.id,
        title: o.title,
        storeName: o.storeName,
        otherStore: Boolean(myStoreId && o.storeId && o.storeId !== myStoreId),
      } as MineHit
    })
    .filter((h): h is MineHit => h !== null)
    .sort((a, b) => b.overlap - a.overlap)

  if (!hits.length) return null
  const worst = hits[0]
  const needsWork = worst.overlap >= OVERLAP_HIGH
  const where = worst.storeName ? `${worst.storeName} 글` : '내 다른 글'

  let headline: string
  if (needsWork && worst.otherStore) {
    headline =
      `${where}과 ${worst.overlap}% 가 글자 그대로 같습니다 — 지점만 바꿔 같은 글을 올리는 형태입니다. ` +
      '지역 키워드가 다른데 본문이 같으면 그 검색 의도에 답하지 못하고, 네이버가 같은 문서로 묶을 위험도 있습니다.'
  } else if (needsWork) {
    headline = `같은 지점의 「${worst.title || '제목 없음'}」과 ${worst.overlap}% 가 글자 그대로 같습니다 — 자기잠식입니다. 도입·소제목·앵글을 바꾸세요.`
  } else if (worst.overlap >= OVERLAP_SOME) {
    headline = `${where}과 ${worst.overlap}% 겹칩니다. 상호명·주소처럼 어차피 같아야 하는 문구라면 그대로 둬도 됩니다.`
  } else {
    headline = `내 글 ${hits.length}편과 견줬고 가장 많이 겹치는 것도 ${worst.overlap}% 입니다 — 서로 다른 글입니다.`
  }

  return { hits, worst, compared: hits.length, headline, needsWork }
}

/**
 * 부분 수정으로는 안 내려간다는 것을 숫자로 알려준다.
 *
 * 「조금 고치면 되겠지」가 가장 흔한 오해다. 실측에서 가장 긴 단락을 통째로 새로 써도
 * 54.6% 였다 — 90.4% 에서 그만큼밖에 안 내려갔다.
 */
export const MINE_CAVEAT =
  '지점명·지역명만 바꾼 글은 실측에서 90.4% 겹쳤고, 가장 긴 단락을 통째로 새로 써도 54.6% 였습니다. 부분 수정으로는 기준 아래로 내려가지 않으니, 겹침이 크면 도입·소제목·앵글부터 다시 잡으세요.'

/** 숫자를 어떻게 읽어야 하는지 — 화면에 함께 띄운다 */
export const SIMILARITY_CAVEAT =
  '네이버가 유사문서로 판정하는 기준값은 공개돼 있지 않습니다. 이 숫자는 「내 글의 어느 만큼이 상위 글에도 글자 그대로 있는지」일 뿐이며, 몇 % 를 넘으면 걸린다는 뜻이 아닙니다. 지점 주소·전화번호처럼 사실이라서 같아야 하는 문구는 겹쳐도 괜찮습니다.'
