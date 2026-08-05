/**
 * 랭킹 요인 관찰소 — 「네이버가 무엇을 보고 띄워주는가」를 우리 판에서 직접 재서 갱신한다.
 *
 * **왜 필요한가.** 네이버는 순위 기준을 공개하지 않는다. 업계에는 「지수」·「C-Rank」·
 * 「D.I.A.」 같은 말이 돌지만 어느 것도 확인할 수 없고, 기준은 조용히 바뀐다. 그래서
 * 남의 설명을 외우는 대신 **우리 키워드의 상위 글을 재서 순위와 무엇이 같이 움직이는지**
 * 보고, 그것을 주기적으로 다시 잰다.
 *
 * 실측으로 시작한 계기 (2026-08-05, 「쌍용동 헬스장」 상위 5편):
 *   순위     1 hyoni2_   2 pnpgym   3 rlawnstjs43   4 527mood      5 jojoreview
 *   등급     semi1      semi2      semi1           **partial**    **optimal1**
 *   경과일   7일        10일       10일            42일           13일
 *   본문     2,197자    1,422자    1,203자         2,568자        2,346자
 * 등급이 가장 높은 블로그가 5위, 가장 낮은 블로그가 4위였다. 즉 **블로그 지수 순서로
 * 줄을 세우지 않는다.** 순위와 가장 비슷하게 움직인 것은 최신성이었다.
 *
 * **이 모듈이 할 수 있는 말과 못 하는 말.**
 *  - 할 수 있다: "우리 판에서 이 신호가 순위와 이만큼 같이 움직였다 (표본 N편)"
 *  - 못 한다: "네이버가 이 신호를 쓴다" — 같이 움직이는 것과 원인은 다르다. 상위 글이
 *    최신인 것은 최신이라서 올라간 것일 수도, 요즘 사람들이 그 주제로 많이 써서일 수도 있다.
 * 그래서 결과에는 항상 표본 수를 붙이고, 표본이 적으면 「단정할 수 없다」고 적는다.
 */

/** 두 날짜(YYYY-MM-DD) 사이의 일수 — 순수 함수라 여기 둔다 */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
  return Math.round(Math.abs(b - a) / 86400000)
}

/** 이만큼은 돼야 순위와의 관계를 말해본다 */
export const MIN_SAMPLE = 5
/** 이 이상이면 「뚜렷하다」 (표본이 작을 때는 이래도 우연일 수 있다) */
export const STRONG = 0.7
/** 이 이상이면 「약한 경향」 */
export const WEAK = 0.4

export interface FactorSample {
  /** 1 이 가장 위 */
  rank: number
  /** 발행 후 경과일. null = 날짜를 못 읽음 */
  ageDays: number | null
  /** 공백 뺀 본문 글자수. null = 본문을 못 읽음 */
  charCount: number | null
  imageCount: number | null
  videoCount: number | null
  titleLength: number
  /** 제목에서 메인 키워드가 시작되는 위치 (-1 = 없음) */
  keywordPos: number
  /**
   * 본문에 든 신호 종류 수 (lib/analysis/content.ts). null = 본문을 못 읽음.
   *
   * 회원 질문에서 나온 항목이다 — "시설·이벤트 안내만으로는 잘 안 띄어주는 것 같다."
   * 한 번 세보고 검수 기준까지 만들었으니, 그 기준이 계속 맞는지 매일 다시 재야 한다.
   */
  infoWords: number | null
  promoWords: number | null
  experienceWords: number | null
  /**
   * 공감 수. null = 못 읽음 (0 과 구별한다).
   *
   * 우리 지역 키워드는 「인기글」 블록으로 나오니 반응이 자리를 만든다고 짐작하기 쉽다.
   * 재보니 아니었다 — 봉명동은 공감 81개가 4위, 49개가 6위였다 (reaction.ts 주석).
   */
  likes: number | null
}

export type FactorKey =
  | 'age'
  | 'chars'
  | 'images'
  | 'videos'
  | 'titleLength'
  | 'keywordFront'
  | 'info'
  | 'promo'
  | 'experience'
  | 'likes'

export const FACTOR_LABEL: Record<FactorKey, string> = {
  age: '최신성',
  chars: '본문 분량',
  images: '이미지 수',
  videos: '영상 수',
  titleLength: '제목 길이',
  keywordFront: '제목 앞쪽에 키워드',
  info: '정보 요소 (읽는 사람이 가져갈 것)',
  promo: '홍보 요소 (파는 말)',
  experience: '경험 요소 (겪은 사람만 쓰는 말)',
  likes: '공감 수',
}

/** 값이 클수록 상위여야 「유리」인지, 작을수록 상위여야 「유리」인지 */
const BIGGER_IS_BETTER: Record<FactorKey, boolean> = {
  age: false, // 경과일이 작을수록(최신) 상위이면 최신성이 유리
  chars: true,
  images: true,
  videos: true,
  titleLength: true,
  keywordFront: false, // 위치 숫자가 작을수록(앞쪽) 상위이면 유리
  info: true,
  // 홍보 요소는 **적을수록** 유리하다는 게 실측 결과다. 그래도 부호를 뒤집지 않고
  // 값이 클수록 유리한 것으로 두면, 화면에 음수로 나와 「많으면 불리」가 그대로 읽힌다.
  promo: true,
  experience: true,
  likes: true,
}

function valueOf(s: FactorSample, key: FactorKey): number | null {
  switch (key) {
    case 'age':
      return s.ageDays
    case 'chars':
      return s.charCount
    case 'images':
      return s.imageCount
    case 'videos':
      return s.videoCount
    case 'titleLength':
      return s.titleLength
    case 'keywordFront':
      // 제목에 아예 없으면 「맨 뒤보다 더 나쁨」으로 두지 않고 표본에서 뺀다
      return s.keywordPos < 0 ? null : s.keywordPos
    case 'info':
      return s.infoWords
    case 'promo':
      return s.promoWords
    case 'experience':
      return s.experienceWords
    case 'likes':
      return s.likes
  }
}

/**
 * 스피어만 순위 상관 (순수 함수 — 테스트 대상).
 *
 * 값 자체가 아니라 **순서**만 본다. 본문 글자수처럼 단위가 다른 값들을 같은 자에 놓고
 * 비교할 수 있고, 값 하나가 튀어도(2만 자짜리 글 한 편) 결과가 뒤집히지 않는다.
 */
export function spearman(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length)
  if (n < 3) return null

  const rankOf = (arr: number[]): number[] => {
    const idx = arr.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0])
    const out = new Array<number>(arr.length)
    let i = 0
    while (i < idx.length) {
      // 같은 값은 평균 순위를 준다 (동점을 앞뒤로 몰면 상관이 거짓으로 커진다)
      let j = i
      while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++
      const avg = (i + j) / 2 + 1
      for (let k = i; k <= j; k++) out[idx[k][1]] = avg
      i = j + 1
    }
    return out
  }

  const rx = rankOf(xs.slice(0, n))
  const ry = rankOf(ys.slice(0, n))
  const mx = rx.reduce((a, b) => a + b, 0) / n
  const my = ry.reduce((a, b) => a + b, 0) / n
  let num = 0
  let dx = 0
  let dy = 0
  for (let i = 0; i < n; i++) {
    num += (rx[i] - mx) * (ry[i] - my)
    dx += (rx[i] - mx) ** 2
    dy += (ry[i] - my) ** 2
  }
  // 한쪽 값이 전부 같으면 관계를 말할 수 없다 (0 으로 답하면 "관계 없음" 이라는 거짓)
  if (dx === 0 || dy === 0) return null
  return Math.round((num / Math.sqrt(dx * dy)) * 100) / 100
}

export interface FactorResult {
  key: FactorKey
  label: string
  /**
   * 순위(1이 위)와 그 신호의 스피어만 상관. null = 못 잼.
   * 부호를 그대로 두지 않고 「유리한 방향」으로 바꿔 담는다 — advantage 를 보라.
   */
  rho: number | null
  /**
   * 유리한 방향으로 뒤집은 값. +면 「그 신호가 상위와 같이 간다」.
   * 예) 최신성 +0.9 = 최신 글이 위에 있다 / 본문 분량 -0.5 = 긴 글이 오히려 아래
   */
  advantage: number | null
  /** 몇 편으로 계산했나 */
  n: number
  strength: 'strong' | 'weak' | 'none' | 'unknown'
  note: string
}

function strengthOf(advantage: number | null, n: number): FactorResult['strength'] {
  if (advantage === null || n < MIN_SAMPLE) return 'unknown'
  const a = Math.abs(advantage)
  if (a >= STRONG) return 'strong'
  if (a >= WEAK) return 'weak'
  return 'none'
}

function noteFor(key: FactorKey, advantage: number | null, n: number): string {
  const label = FACTOR_LABEL[key]
  if (advantage === null) {
    return `${label} — 잴 수 없었습니다 (값을 읽은 글이 ${n}편뿐이거나 전부 같은 값이었습니다).`
  }
  if (n < MIN_SAMPLE) {
    return `${label} — 표본이 ${n}편뿐이라 판정하지 않았습니다.`
  }
  const s = strengthOf(advantage, n)
  const dir = advantage > 0 ? '같이' : '거꾸로'
  if (s === 'none') {
    return `${label} — 순위와 이렇다 할 관계가 안 보입니다 (${advantage}, 표본 ${n}편).`
  }
  const how = s === 'strong' ? '뚜렷하게' : '약하게'
  if (advantage > 0) {
    const what: Record<FactorKey, string> = {
      age: '최신 글이 위에 있습니다',
      chars: '긴 글이 위에 있습니다',
      images: '이미지가 많은 글이 위에 있습니다',
      videos: '영상이 있는 글이 위에 있습니다',
      titleLength: '제목이 긴 글이 위에 있습니다',
      keywordFront: '제목 앞쪽에 키워드를 둔 글이 위에 있습니다',
      info: '읽는 사람이 가져갈 정보가 많은 글이 위에 있습니다',
      promo: '홍보 표현이 많은 글이 위에 있습니다',
      experience: '경험을 쓴 글이 위에 있습니다',
      likes: '공감이 많은 글이 위에 있습니다',
    }
    return `${label} — ${how} ${what[key]} (${advantage}, 표본 ${n}편).`
  }
  const opposite: Record<FactorKey, string> = {
    age: '오래된 글이 오히려 위에 있습니다',
    chars: '짧은 글이 오히려 위에 있습니다',
    images: '이미지가 적은 글이 오히려 위에 있습니다',
    videos: '영상이 없는 글이 오히려 위에 있습니다',
    titleLength: '제목이 짧은 글이 오히려 위에 있습니다',
    keywordFront: '키워드를 뒤에 둔 글이 오히려 위에 있습니다',
    info: '정보가 적은 글이 오히려 위에 있습니다',
    promo: '홍보 표현이 적은 글이 위에 있습니다 (많이 넣을수록 아래로 갑니다)',
    experience: '경험을 덜 쓴 글이 오히려 위에 있습니다',
    likes: '공감이 적은 글이 오히려 위에 있습니다 (공감 늘리기로는 순위가 안 올라갑니다)',
  }
  return `${label} — ${how} ${dir} 갑니다: ${opposite[key]} (${advantage}, 표본 ${n}편).`
}

export const FACTOR_KEYS: FactorKey[] = [
  'age',
  'chars',
  'images',
  'videos',
  'titleLength',
  'keywordFront',
  'info',
  'promo',
  'experience',
  'likes',
]

/** 상위 글 표본에서 신호별 관계를 잰다 (순수 함수 — 테스트 대상) */
export function measureFactors(samples: FactorSample[]): FactorResult[] {
  return FACTOR_KEYS.map((key) => {
    const pairs = samples
      .map((s) => [s.rank, valueOf(s, key)] as const)
      .filter((p): p is readonly [number, number] => typeof p[1] === 'number')
    const rho = spearman(
      pairs.map((p) => p[0]),
      pairs.map((p) => p[1])
    )
    /*
     * 부호 정리. rho 는 「순위 숫자」와의 상관이라 그대로 읽으면 헷갈린다 —
     * 순위 숫자가 작을수록 위이므로, 신호가 클 때 상위면 rho 가 음수로 나온다.
     * 그래서 「유리한 방향」으로 뒤집어 담는다.
     */
    const advantage =
      rho === null ? null : Math.round((BIGGER_IS_BETTER[key] ? -rho : rho) * 100) / 100
    const n = pairs.length
    return {
      key,
      label: FACTOR_LABEL[key],
      rho,
      advantage,
      n,
      strength: strengthOf(advantage, n),
      note: noteFor(key, advantage, n),
    }
  })
}

export interface FactorObservation {
  keyword: string
  /** YYYY-MM-DD */
  date: string
  sampled: number
  results: FactorResult[]
}

export function buildObservation(
  keyword: string,
  date: string,
  samples: FactorSample[]
): FactorObservation {
  return { keyword, date, sampled: samples.length, results: measureFactors(samples) }
}

// ─── 여러 관찰을 모아 보기 ──────────────────────────────────────

export interface PooledFactor {
  key: FactorKey
  label: string
  /** 관찰들의 평균 (표본 수로 가중) */
  advantage: number | null
  /** 몇 번의 관찰에서 잴 수 있었나 */
  runs: number
  /** 그 관찰들의 표본 합계 */
  samples: number
  /** 뚜렷하게 유리하게 나온 관찰 수 / 뚜렷하게 거꾸로 나온 관찰 수 */
  agree: number
  disagree: number
  note: string
}

/**
 * 여러 키워드·여러 날짜의 관찰을 하나로 모은다.
 *
 * 키워드 하나의 상위 5~10편으로는 우연을 걸러낼 수 없다. 관찰을 쌓아 **몇 번 중 몇 번
 * 같은 방향이었는지**를 함께 보여준다 — 평균값 하나보다 이게 더 정직하다.
 */
export function poolFactors(runs: FactorObservation[]): PooledFactor[] {
  return FACTOR_KEYS.map((key) => {
    const got = runs
      .map((r) => r.results.find((x) => x.key === key))
      .filter((r): r is FactorResult => Boolean(r) && r!.advantage !== null && r!.n >= MIN_SAMPLE)

    const samples = got.reduce((n, r) => n + r.n, 0)
    const advantage = samples
      ? Math.round((got.reduce((a, r) => a + (r.advantage as number) * r.n, 0) / samples) * 100) /
        100
      : null
    const agree = got.filter((r) => (r.advantage as number) >= WEAK).length
    const disagree = got.filter((r) => (r.advantage as number) <= -WEAK).length

    let note: string
    if (!got.length) {
      note = `${FACTOR_LABEL[key]} — 아직 잴 수 있는 관찰이 없습니다.`
    } else if (advantage !== null && Math.abs(advantage) >= WEAK) {
      note =
        `${FACTOR_LABEL[key]} — 관찰 ${got.length}회 중 ${advantage > 0 ? agree : disagree}회가 같은 방향입니다 ` +
        `(평균 ${advantage}, 표본 합계 ${samples}편).`
    } else {
      note = `${FACTOR_LABEL[key]} — 관찰 ${got.length}회를 모아도 방향이 갈립니다 (유리 ${agree} / 거꾸로 ${disagree}). 순위를 가르는 요인으로 보기 어렵습니다.`
    }

    return { key, label: FACTOR_LABEL[key], advantage, runs: got.length, samples, agree, disagree, note }
  })
}

/**
 * 모은 결과를 한 줄로.
 *
 * 「무엇이 순위를 만드는가」에 답하되, 관찰이 적으면 적다고 먼저 말한다.
 */
export function poolHeadline(pooled: PooledFactor[], runs: FactorObservation[]): string {
  if (!runs.length) {
    return '아직 관찰한 기록이 없습니다. 키워드 하나를 관찰하면 여기에 쌓입니다.'
  }
  const strong = pooled
    .filter((p) => p.advantage !== null && Math.abs(p.advantage) >= WEAK)
    .sort((a, b) => Math.abs(b.advantage as number) - Math.abs(a.advantage as number))

  /*
   * 표본 합계는 **관찰의 글 수**를 더한다.
   * 신호별 samples 를 더하면 같은 글을 신호마다 다시 세서 5편이 55편이 된다
   * (테스트가 잡았다 — 「관찰 2회(상위 글 55편)」).
   */
  const total = runs.reduce((n, r) => n + r.sampled, 0)
  if (!strong.length) {
    return `관찰 ${runs.length}회(상위 글 ${total}편)를 모았지만, 순위와 뚜렷하게 같이 움직인 신호가 없습니다 — 분량·이미지 수 같은 규격을 맞추는 것으로는 순위가 갈리지 않는다는 뜻입니다.`
  }
  const names = strong
    .slice(0, 3)
    .map((p) => `${p.label}(${(p.advantage as number) > 0 ? '+' : ''}${p.advantage})`)
    .join(' · ')
  return `관찰 ${runs.length}회(상위 글 ${total}편) 기준으로 순위와 가장 같이 움직인 것은 ${names} 입니다. 같이 움직이는 것과 원인은 다르므로, 규격으로 삼기보다 「상위권이 실제로 그렇게 쓰고 있다」로 읽으세요.`
}

/**
 * 지수(블로그 등급)로는 순위가 설명되지 않았다는 실측 기록.
 *
 * 화면에 함께 띄운다 — 업계에서 「지수부터 올려야 한다」고 흔히 말하지만, 우리 판에서
 * 재보니 그렇지 않았다. 관찰이 쌓여 반대로 나오면 이 문장을 고쳐야 한다.
 */
export const GRADE_NOTE =
  '블로그 등급(업계에서 말하는 「지수」)으로는 순위가 설명되지 않았습니다. 「쌍용동 헬스장」 상위 5편을 진단해 보니 등급이 가장 높은 블로그(최적1)가 5위, 가장 낮은 블로그(부분 누락)가 4위였습니다. 등급은 순서를 만드는 힘이 아니라 검색에 걸리기 위한 입장권으로 보는 편이 맞습니다 — 색인이 안 되면 무엇을 써도 안 걸립니다.'
