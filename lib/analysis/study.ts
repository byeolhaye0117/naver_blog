/**
 * 상위노출 조사의 **판정 규칙** — 「이 기준을 바꿔야 하나」를 정하는 부분.
 *
 * 수집은 스크립트가 하고(scripts/study.mjs), 판정은 여기 있다. 이유가 있다:
 * 이 규칙이 틀리면 앱의 모든 기준이 틀린 방향으로 움직인다. 그래서 타입 검사와
 * 테스트가 닿는 자리에 둔다 (scripts/checks.mjs 의 [70]번 묶음).
 *
 * **이 파일이 있는 이유.** 11편을 세서 잡은 기준 하나가 141편에서 뒤집혔다
 * (「홍보 표현이 많으면 내려간다」 → 관계 없음). 표본이 작을 때 눈에 보이는 차이는
 * 대부분 표본 오차다. 그래서 판정은 **겹치면 아무 말도 하지 않는 쪽**으로 만들었다.
 */
/**
 * 정확한 중간값.
 *
 * cutline.ts 의 median 을 쓰지 않는다 — 그쪽은 「목표 글자수 1,900자」처럼 사람이 기억할
 * 값을 만드는 함수라서 짝수 개일 때 정수로 반올림한다. 조사에는 그 반올림이 해롭다.
 *
 *   순위:   2위와 3위를 오간 글의 중간값은 2.5 여야 한다. 3 으로 올리면 「3위 안」 경계에
 *           걸리는 글이 통째로 밀린다.
 *   톤 비율: 1,000자당 0.36개 같은 값이 전부 0 이나 1 로 뭉개진다. 실제로 그랬다 —
 *           리포트의 7위 이하 칸이 1.00 · 1.00 · 9.00 처럼 죄다 정수로 나왔다.
 */
export function exactMedian(xs: number[]): number {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** 한 번의 조사에서 글 하나 (scripts/study.mjs 가 만들어 study/runs/<날짜>.json 에 넣는다) */
export interface StudyPost {
  url: string
  blogId: string
  title: string
  /** 키워드 → 그 키워드에서의 순위 */
  ranks: Record<string, number>
  chars: number
  images: number
  videos: number
  paras: number
  longestPara: number
  avgPara: number
  info: number
  promo: number
  experience: number
  infoFound: string[]
  promoFound: string[]
  topEnding: string
  topEndingShare: number
}

export interface StudyRun {
  date: string
  keywords: string[]
  top: number
  posts: StudyPost[]
}

export interface MergedPost extends StudyPost {
  /** 런별 (날짜, 최고순위) */
  history: { date: string; best: number }[]
  runs: number
  /** 런별 최고순위의 **중간값** — 하루의 우연을 기준으로 삼지 않기 위해 */
  best: number
  firstBest: number
  lastBest: number
  /** 나온 런 전부에서 3위 안이었나 — 이것이 「유지」다 */
  held: boolean
}

/**
 * Wilson 95% 신뢰구간.
 *
 * 「10편 중 5편이 1~3위 = 50%」를 그대로 믿지 않게 해준다 (실제 구간은 24~76%).
 * 단순 정규근사(p ± 1.96·√(p(1-p)/n))는 편수가 적으면 구간이 0 밖으로 나가서 못 쓴다.
 */
export function wilson(hit: number, n: number): [number, number] {
  if (n <= 0) return [0, 1]
  const z = 1.96
  const p = hit / n
  const d = 1 + (z * z) / n
  const c = p + (z * z) / (2 * n)
  const s = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))
  return [Math.max(0, (c - s) / d), Math.min(1, (c + s) / d)]
}

/**
 * 여러 런을 글 단위로 합친다.
 *
 * 같은 글이 여러 런에 나오면 순위의 **중간값**을 대표값으로 쓴다. 우리가 따라하려는
 * 대상은 「그날 1위」가 아니라 「계속 위에 있는 글」이기 때문이다. 측정값(글자수·정보
 * 종류 등)은 **가장 최근 런의 것**을 쓴다 — 글이 그 사이 수정되었을 수 있다.
 */
export function mergeRuns(runs: StudyRun[]): MergedPost[] {
  const byUrl = new Map<string, StudyPost & { history: { date: string; best: number }[] }>()
  for (const run of runs) {
    for (const p of run.posts) {
      const ranks = Object.values(p.ranks)
      if (!ranks.length) continue
      const best = Math.min(...ranks)
      const prev = byUrl.get(p.url)
      const history = prev ? prev.history : []
      byUrl.set(p.url, { ...p, history })
      history.push({ date: run.date, best })
    }
  }
  return [...byUrl.values()].map((p) => {
    const bests = p.history.map((h) => h.best)
    return {
      ...p,
      runs: p.history.length,
      best: exactMedian(bests),
      firstBest: bests[0],
      lastBest: bests[bests.length - 1],
      held: p.history.length >= 2 && bests.every((b) => b <= 3),
    }
  })
}

/** 기준 하나를 점검할 때 필요한 것 */
export interface Standard {
  id: string
  label: string
  /** 고칠 파일과 상수 이름 — 리포트가 이걸 그대로 보여준다 */
  where: string
  /** 하한(min)인가 상한(max)인가 */
  kind: 'min' | 'max'
  /** 지금 앱이 쓰는 값 */
  current: number
  /** 시험해 볼 경계 후보 */
  candidates: number[]
}

export interface BoundaryRow {
  c: number
  /** 한쪽이 너무 적어서 아무 말도 할 수 없는 경계 */
  skip: boolean
  good: number
  bad: number
  goodHit: number
  badHit: number
  goodRate: number
  badRate: number
  gap: number
  /** 95% 구간이 안 겹칠 때만 true — 이것이 「갈렸다」의 정의다 */
  separated: boolean
}

export interface BoundaryScan {
  rows: BoundaryRow[]
  /** 구간이 갈린 경계 중 차이가 가장 큰 것 (없으면 null) */
  pick: BoundaryRow | null
}

/** 한쪽이 이 편수 미만인 경계로는 판정하지 않는다 */
export const MIN_SIDE = 5
/** 대상이 이 편수 미만이면 그 항목 자체를 판정하지 않는다 */
export const MIN_SAMPLE = 20

/**
 * 경계 후보마다 「이쪽 vs 저쪽」의 1~3위 비율을 재서, 가장 크게 갈리는 곳을 찾는다.
 *
 * `separated` 가 핵심이다 — 이쪽의 95% 구간 하한이 저쪽의 상한보다 커야 「갈렸다」고
 * 본다. 평균만 비교하면 편수 6편짜리 우연이 기준을 흔든다.
 */
export function boundaryScan<T extends { best: number }>(
  rows: T[],
  value: (r: T) => number,
  std: Pick<Standard, 'kind' | 'candidates'>
): BoundaryScan {
  const out: BoundaryRow[] = []
  for (const c of std.candidates) {
    const good = rows.filter((r) => (std.kind === 'min' ? value(r) >= c : value(r) <= c))
    const bad = rows.filter((r) => (std.kind === 'min' ? value(r) < c : value(r) > c))
    if (good.length < MIN_SIDE || bad.length < MIN_SIDE) {
      out.push({
        c,
        skip: true,
        good: good.length,
        bad: bad.length,
        goodHit: 0,
        badHit: 0,
        goodRate: 0,
        badRate: 0,
        gap: 0,
        separated: false,
      })
      continue
    }
    const goodHit = good.filter((r) => r.best <= 3).length
    const badHit = bad.filter((r) => r.best <= 3).length
    const [goodLo] = wilson(goodHit, good.length)
    const [, badHi] = wilson(badHit, bad.length)
    out.push({
      c,
      skip: false,
      good: good.length,
      bad: bad.length,
      goodHit,
      badHit,
      goodRate: goodHit / good.length,
      badRate: badHit / bad.length,
      gap: goodHit / good.length - badHit / bad.length,
      separated: goodLo > badHi,
    })
  }
  const usable = out.filter((o) => !o.skip && o.separated)
  return { rows: out, pick: usable.sort((a, b) => b.gap - a.gap)[0] ?? null }
}

export type Verdict = 'insufficient' | 'keep' | 'confirmed' | 'stricter' | 'change'

/**
 * 판정.
 *
 *   insufficient — 표본이 모자라다. 아무 말도 하지 않는다.
 *   keep         — 어느 경계에서도 구간이 갈리지 않았다. 지금 값을 유지한다.
 *   confirmed    — 데이터가 가리키는 경계가 지금 값과 같다.
 *   stricter     — 데이터의 절벽보다 **안전한 쪽**에 기준이 있다. 틀린 게 아니다.
 *   change       — 기준이 절벽의 **위험한 쪽**에 있다. 고쳐야 한다.
 *
 * `stricter` 를 따로 두는 이유가 있다. 하한 항목에서 이 도구가 찾는 것은 「이 아래로
 * 내려가면 확실히 불리한 지점」(절벽)이다. 예를 들어 글자수 절벽이 1,200자에 있다고 해서
 * 목표를 1,200자로 내리라는 뜻이 아니다 — 우리 기준(1,750자)은 절벽 위쪽, 즉 안전한
 * 자리에 있다. 「제안: 1750 → 1200」이라고 말하면 도구가 앱을 나쁜 쪽으로 끌고 간다.
 */
export function verdictFor(
  current: number,
  scan: BoundaryScan,
  sampleSize: number,
  kind: 'min' | 'max'
): Verdict {
  if (sampleSize < MIN_SAMPLE) return 'insufficient'
  if (!scan.pick) return 'keep'
  if (scan.pick.c === current) return 'confirmed'
  // 하한은 클수록 엄격하고, 상한은 작을수록 엄격하다
  const stricter = kind === 'min' ? current > scan.pick.c : current < scan.pick.c
  return stricter ? 'stricter' : 'change'
}

// ─── 매일 쌓기 (app/api/cron/study) ─────────────────────────────────────────

/**
 * 본문 측정값을 며칠까지 재사용할지.
 *
 * **순위는 매일 바뀌고 본문은 거의 안 바뀐다.** 그래서 순위(SERP)만 매일 전부 받고, 본문은
 * 묵은 것만 다시 받는다. 이 구분이 없으면 매일 160편을 다시 읽어야 하는데 함수 한 번에
 * 들어가지 않는다 (로컬에서 2~4분).
 *
 * 7일로 둔 이유: 글이 수정되는 일은 드물지만 아예 안 보면 옛 수치가 굳는다 (로컬 캐시에서
 * 실제로 그랬다). 순위 이력은 매일 온전하므로 유지 판정은 이 값에 영향을 받지 않는다.
 */
export const BODY_MAX_AGE_DAYS = 7

/** 한 번의 크론에서 새로 읽을 본문 수 상한 — 넘치면 다음 날로 미룬다 (응답에 편수를 적는다) */
export const BODY_BUDGET_PER_RUN = 60

/** 저장해 둘 런 수 (하루 하나면 두 달) */
export const STUDY_RUNS_KEEP = 60

/** 저장해 둘 글 측정값 수 — 순위에서 사라진 글은 밀려 나간다 */
export const STUDY_POSTS_KEEP = 600

/** 측정한 날로부터 며칠 지났나 */
export function measurementAgeDays(measuredAt: string, today: string): number {
  const a = Date.parse(`${measuredAt}T00:00:00Z`)
  const b = Date.parse(`${today}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.POSITIVE_INFINITY
  return Math.max(0, Math.round((b - a) / 86_400_000))
}

/**
 * 조사할 키워드를 정한다.
 *
 * `study/keywords.json` 의 목록을 그대로 쓴다. **그 파일을 여기서 들여오지는 않는다** —
 * lib/ 이 저장소 최상단 데이터 파일에 매달리면 계층이 꼬이고, 테스트 컴파일에서도 걸린다.
 * 파일을 읽어 넘기는 일은 부르는 쪽(app/api/cron/study)이 한다.
 *
 * 목록이 비어 있으면 앱이 아는 키워드로 물러선다 — 순위를 추적 중인 키워드와 지점 지역
 * 키워드다. 크론이 조용히 아무것도 안 하는 것보다 낫다.
 */
export function studyKeywords(
  db: {
    rankTargets?: { keyword: string }[]
    stores?: { localKeywords?: string[] }[]
  },
  configured: unknown[] = []
): string[] {
  const fromFile = configured.map((k) => String(k).trim()).filter(Boolean)
  if (fromFile.length) return fromFile
  return Array.from(
    new Set([
      ...(db.rankTargets ?? []).map((t) => t.keyword),
      ...(db.stores ?? []).flatMap((s) => s.localKeywords ?? []),
    ])
  ).filter(Boolean)
}
