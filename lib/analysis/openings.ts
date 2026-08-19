/**
 * **지금 뚫릴 만한 자리인가** — 키워드를 고르는 판단.
 *
 * ── 왜 만들었나 (2026-08-18) ────────────────────────────────
 * 회원 제안: "7일 이내 7% 정도가 상위노출되는데 왜 노출되는지 분석해서 그에 맞는 글쓰기를
 * 할 수 있게 업데이트해보는 건 어떨까?"
 *
 * 그래서 재봤다 (천안·아산 14개 키워드 · 1페이지 140편 · 7일 이내 8편 / 31일 이상 86편).
 * **글의 형태로는 갈리지 않았다** — 글자수(1,649 대 1,711) · 이미지(14 대 18) · 정보 낱말
 * (6 대 7) · 홍보 낱말(3 대 3) · 경험 낱말(3 대 4)이 사실상 같았다. 갈린 것은 **블로그 힘**
 * 이었다(누적 방문자 중간값 110,721 대 36,175).
 *
 * 블로그 힘은 글 한 편으로 못 바꾼다. 그래서 「7일에 뜨는 글쓰기 규칙」은 만들지 않았다 —
 * 측정에 없는 규칙을 지시문에 더하면 검수와 싸운다. 대신 **바꿀 수 있는 것**을 잰다:
 * 어느 키워드를 잡느냐.
 *
 * ── 등급은 잰 것만으로 나눈다 ───────────────────────────────
 * 처음엔 「1페이지 최소 블로그가 우리보다 작으면 문턱이 낮다」로 나눴는데 거의 모든 키워드가
 * 같은 칸에 들어갔다 — 우리 누적이 27만이라 늘 크다. 그런데 우리 오늘 방문자는 4명이고
 * 1페이지 진입률은 0%다. **누적 방문자는 지금 힘을 대변하지 못한다.** 대변하지 못하는 숫자로
 * 등급을 나누면 없는 근거를 만드는 셈이라 등급에서 뺐다.
 *
 * 남은 두 축만 쓴다:
 *   ① 7일 이내 진입이 있었나 — 그 자리가 **지금** 열려 있다는 증거
 *   ② 최근 30일 발행량이 적은가 — 경쟁 자체가 적은가
 */

/** 「갓 올라온 글」의 경계 */
export const FRESH_DAYS = 7

/**
 * 경쟁이 적다고 볼 경계 — 최근 30일 발행량.
 *
 * `competitionOf` 의 낮음 경계(300)보다 훨씬 좁게 본다. 300편은 「경쟁이 낮다」가 아니라
 * 「해볼 만하다」 수준이고, 여기서 찾는 것은 **거의 빈 자리**다. 실측에서 용곡동 PT 22편 ·
 * 용곡동 여성전용 28편처럼 두 자리 수인 키워드가 실제로 하루 만에 뚫렸다.
 */
export const QUIET_MAX = 100

export type OpeningTier = 'open-quiet' | 'open' | 'quiet' | 'shut'

export const OPENING_LABEL: Record<OpeningTier, string> = {
  'open-quiet': '지금 열려 있고 경쟁도 적음',
  open: '지금 열려 있음',
  quiet: '경쟁은 적지만 자리 굳음',
  shut: '굳은 자리',
}

/** 표에서 위에 오는 순서 (작을수록 위) */
export const OPENING_ORDER: Record<OpeningTier, number> = {
  'open-quiet': 0,
  open: 1,
  quiet: 2,
  shut: 3,
}

export interface OpeningInput {
  /** 1페이지 글들의 나이(일). 날짜를 모르는 항목은 넣지 않는다 */
  ages: number[]
  /** 최근 30일 발행량. 모르면 null */
  recent30: number | null
}

export interface Opening {
  tier: OpeningTier
  label: string
  /** 7일 이내 글 수 */
  fresh: number
  /** 가장 어린 글의 나이 */
  youngest: number | null
  /** 나이 중간값 */
  medianAge: number | null
  recent30: number | null
  /** 왜 이 등급인지 한 줄 */
  why: string
}

function median(list: number[]): number | null {
  const s = [...list].sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : null
}

/** 순수 함수 — 테스트 대상 */
export function openingOf({ ages, recent30 }: OpeningInput): Opening {
  const dated = ages.filter((a) => Number.isFinite(a))
  const fresh = dated.filter((a) => a <= FRESH_DAYS).length
  const youngest = dated.length ? Math.min(...dated) : null
  const quiet = recent30 !== null && recent30 <= QUIET_MAX
  const tier: OpeningTier = fresh > 0 ? (quiet ? 'open-quiet' : 'open') : quiet ? 'quiet' : 'shut'

  /*
   * 왜 이 등급인지 숫자로 말한다. 등급만 보여주면 회원이 확인할 수 없고, 확인할 수 없는
   * 판단은 믿을 근거가 없다.
   */
  const n = (v: number | null) => (v === null ? '?' : v.toLocaleString())
  const why =
    fresh > 0
      ? `1페이지에 발행 ${FRESH_DAYS}일 이내 글이 ${fresh}편 있습니다 (가장 어린 글 ${n(youngest)}일)${
          quiet ? ` · 최근 30일 발행 ${n(recent30)}편으로 경쟁도 적습니다` : ` · 다만 최근 30일 발행이 ${n(recent30)}편입니다`
        }`
      : `1페이지에 발행 ${FRESH_DAYS}일 이내 글이 없습니다 (가장 어린 글 ${n(youngest)}일)${
          quiet
            ? ` · 최근 30일 발행은 ${n(recent30)}편뿐이라 경쟁은 적습니다`
            : ` · 최근 30일 발행 ${n(recent30)}편으로 경쟁도 셉니다`
        }`

  return {
    tier,
    label: OPENING_LABEL[tier],
    fresh,
    youngest,
    medianAge: median(dated),
    recent30,
    why,
  }
}

/** 나이(일) 계산 — 날짜를 못 읽으면 null */
export function ageDaysOf(date: string | null | undefined, now: number): number | null {
  const t = Date.parse((date ?? '').trim())
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.round((now - t) / 86400000))
}

export interface OpeningRow extends Opening {
  keyword: string
  /** 이 키워드를 쓰는 지점 이름들 */
  stores: string[]
  /** 1페이지에서 날짜를 읽은 글 수 — 근거 개수 */
  dated: number
  /** 잰 글 수 */
  sampled: number
}

/**
 * 남겨둘 측정 기록 수 — 매일 한 번이면 2주치.
 *
 * 자리가 열리고 닫히는 것을 보려면 어제 값이 있어야 한다. 다만 무한정 쌓으면 저장소가
 * 커지므로 상한을 둔다 (studyRuns 와 같은 방식).
 */
export const OPENING_RUNS_KEEP = 14

/** 지난번과 비교해 이 키워드가 어떻게 됐나 */
export type OpeningChange = 'opened' | 'shut' | 'same' | 'new'

export const CHANGE_LABEL: Record<OpeningChange, string> = {
  opened: '새로 열림',
  shut: '닫힘',
  same: '그대로',
  new: '처음 잼',
}

/**
 * **어제와 무엇이 달라졌나.**
 *
 * 매일 재는 이유가 이것이다 — 같은 표를 매일 다시 그리는 게 목적이면 손으로 눌러도 된다.
 * 값이 있는 것은 **자리가 열린 날을 놓치지 않는 것**이고, 그건 어제 값과 비교해야 나온다.
 *
 * 등급 순서(OPENING_ORDER)로만 본다 — 7일 이내 편수가 1편에서 2편으로 늘어난 것까지
 * 「달라졌다」고 알리면 매일 전부가 달라진 것으로 나와서 알림이 의미를 잃는다.
 */
export function openingChanges(
  prev: { keyword: string; tier: OpeningTier }[] | null | undefined,
  next: { keyword: string; tier: OpeningTier }[]
): Map<string, OpeningChange> {
  const out = new Map<string, OpeningChange>()
  const before = new Map((prev ?? []).map((r) => [r.keyword, r.tier]))
  for (const r of next) {
    const was = before.get(r.keyword)
    if (was === undefined) {
      out.set(r.keyword, 'new')
      continue
    }
    const from = OPENING_ORDER[was]
    const to = OPENING_ORDER[r.tier]
    out.set(r.keyword, to < from ? 'opened' : to > from ? 'shut' : 'same')
  }
  return out
}

/** 표 순서 — 등급 → 7일 이내 많은 순 → 발행량 적은 순 */
export function sortOpenings(rows: OpeningRow[]): OpeningRow[] {
  return [...rows].sort(
    (a, b) =>
      OPENING_ORDER[a.tier] - OPENING_ORDER[b.tier] ||
      b.fresh - a.fresh ||
      (a.recent30 ?? Infinity) - (b.recent30 ?? Infinity) ||
      a.keyword.localeCompare(b.keyword)
  )
}
