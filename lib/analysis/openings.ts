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

/*
 * ── 이름을 고쳤다 (2026-08-20) ─────────────────────────────────
 *
 * 앞 판은 shut 을 「굳은 자리」로 적었다. 그런데 10일치 기록으로 재보니 그 자리들도
 * **1페이지가 주당 11편씩 갈리고 있었다** (쌍용동 헬스장·두정동 헬스장 각각 9일에 14편).
 * 「굳은 자리」는 「못 들어간다」로 읽히는데 실측은 그 반대였고, 그 이름 때문에 회원이
 * 우회로를 권고받았다. 회원이 거절한 것이 맞다.
 *
 * 이 등급이 실제로 재는 것은 **「갓 올라온 글이 1페이지에 있나」** 하나다. 그러니 이름도
 * 그렇게 적는다. 「들어갈 수 있나」는 자리 회전(lib/analysis/turnover.ts)이 답한다.
 */
export const OPENING_LABEL: Record<OpeningTier, string> = {
  'open-quiet': '갓 쓴 글이 바로 올라옴 · 경쟁도 적음',
  open: '갓 쓴 글이 바로 올라옴',
  quiet: '경쟁은 적지만 올라오는 데 시간 걸림',
  shut: '올라오는 데 시간 걸림',
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
  /**
   * store  — 지점에 저장된 지역 키워드 (표에 올라가는 줄)
   * detour — 굳은 자리를 우회하려고 함께 재본 세부 의도 키워드 (표 대신 우회로로 보여준다)
   *
   * 없으면 'store' 다 — 이 항목을 만들기 전 기록은 전부 지점 키워드였다.
   */
  kind?: 'store' | 'detour'
}

/**
 * 키워드에서 동네 이름을 뽑는다 — 「천안 두정동 헬스장」 → 두정동, 「쌍용동PT」 → 쌍용동.
 *
 * 우회로를 찾을 때 **같은 동네인지**가 유일한 조건이다. 다른 동네의 열린 키워드를 권하면
 * 우리 지점과 상관없는 글을 쓰게 된다.
 */
export function areaOf(keyword: string): string | null {
  const m = /([가-힣]{2,10}?(?:동|읍|면))/.exec(keyword ?? '')
  return m ? m[1] : null
}

/**
 * **굳은 자리로 들어가는 문** — 같은 동네에서 지금 열려 있는 세부 의도 키워드.
 *
 * ── 왜 이 방식인가 (2026-08-20 실측) ─────────────────────────
 * 회원 요청: "굳은 키워드도 돌파할 수 있는 방법을 알아주면 좋겠어." 그래서 굳은 자리 6개와
 * 열린 자리 5개의 1페이지를 30위까지 열어 홀더의 블로그 크기를 쟀다.
 *
 * **블로그 크기로는 갈리지 않았다.** 굳은 자리 1페이지에 누적 314명·396명·503명·769명
 * 블로그가 앉아 있었고(열린 자리는 271~10,597명), 두 집단의 크기가 겹쳤다. 「작아서 못
 * 들어간다」는 설명은 실측에서 틀렸다.
 *
 * 갈린 것은 **1페이지 글의 나이**였다 — 등급 높은 자리는 1~7일 글이 1페이지에 있고, 낮은
 * 자리는 가장 어린 글이 8~38일이다.
 *
 * ── 여기서 한 번 틀렸다 (같은 날 고침) ──────────────────────
 * 나는 그 다음 문장을 이렇게 적었다: 「새 글이 1페이지로 못 올라오는 상태다.」 **틀렸다.**
 * 회원이 "우회하고 싶지 않다"고 해서 10일치 기록으로 회전을 세어보니 그 자리들도 1페이지가
 * 주당 11편씩 갈리고 있었다 (lib/analysis/turnover.ts). 바로 안 올라올 뿐 몇 주 뒤에
 * 올라온다 — 진입 나이 중간값 36일, 빠른 쪽 9~12일.
 *
 * 그래서 이 목록의 뜻을 바꿨다. **우회로가 아니다** — 같은 head 키워드도 계속 노려도 된다.
 * 이건 **같은 글로 더 빨리 오르는 자리**다: 「성정동 여성전용」(발행 56편)보다
 * 「성정동 여성전용 헬스장」(28편)이 경쟁이 적고, 「쌍용동 헬스장」(433편) 옆의
 * 「쌍용동 여성전용 헬스장」은 26편이다. 지어낸 우회로가 아니라 같은 함수로 잰 값이다.
 */
export function detoursFor(shut: OpeningRow, rows: OpeningRow[], max = 3): OpeningRow[] {
  if (shut.tier !== 'shut' && shut.tier !== 'quiet') return []
  const area = areaOf(shut.keyword)
  if (!area) return []
  const flat = (s: string) => s.replace(/\s+/g, '')
  return rows
    .filter(
      (r) =>
        (r.tier === 'open-quiet' || r.tier === 'open') &&
        flat(r.keyword) !== flat(shut.keyword) &&
        areaOf(r.keyword) === area
    )
    /*
     * 발행량이 적은 문을 먼저 권한다. 7일 이내 편수가 많은 쪽을 먼저 권해봤는데, 발행량이
     * 400편인 자리가 위로 올라왔다 — 지금 열려 있어도 우리가 들어갈 자리는 아니다.
     */
    .sort((a, b) => (a.recent30 ?? Infinity) - (b.recent30 ?? Infinity) || b.fresh - a.fresh)
    .slice(0, max)
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
