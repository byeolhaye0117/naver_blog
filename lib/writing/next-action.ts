/**
 * "지금 무엇을 해야 하는가" 를 하나로 정한다.
 *
 * 대시보드가 할 일 5~6개를 같은 무게로 늘어놓으면, 볼 때마다 무엇을 먼저 할지
 * 사용자가 다시 판단해야 한다. 이 앱은 순서가 정해진 도구다 —
 * 지점 등록 → 키워드 고르기 → 글쓰기 → 검수 → 발행 → 순위 추적.
 * 그래서 순서에서 막힌 첫 지점을 찾아 그것만 크게 보여주고, 나머지는 접어 둔다.
 */
import type { Post, RankTarget, Store } from '@/lib/types'
import { autoDraftAlert, isAutoDraft } from './autodraft'

export type ActionTone = 'good' | 'warn' | 'bad'

/**
 * 고쳐 쓰기에 넘길 항목 목록.
 *
 * **여기로 옮겼다** (2026-08-11). 라우트 안에 있어서 테스트가 없었고, 그 안에서 버그가
 * 났다 — 회원이 "제목에 갑자기 홍보가 안 들어가"라고 했을 때 원인의 절반이 이것이었다.
 * 걸린 항목을 가중치 순으로 6개만 넘기니 `titlePromo` 가 본문 항목들에 밀려 아예 전달되지
 * 않았고, 모델은 제목 문제를 들은 적이 없으니 고칠 수도 없었다.
 *
 * 규칙은 셋이다.
 *   ① **수정필요를 먼저.** 점수 상한을 푸는 것은 수정필요뿐이다.
 *   ② **힌트를 함께.** 「지금 2회 / 기준 5회」만으로는 어디에 넣을지 모른다.
 *   ③ **개수를 자른다.** 한 번에 다 고치라고 하면 아무것도 못 고친다 — 실제로 9개를
 *      넘겼을 때 모델이 이미 맞던 것을 깨뜨렸다.
 *
 * 그리고 **제목은 따로 센다.** 제목은 본문과 다른 칸이라 고쳐도 본문 항목을 깨지 않으니
 * ③의 제한에 넣을 이유가 없다. 다만 제목 한 줄에 네 가지를 동시에 시키는 것도 무리라
 * 3개까지만 넘긴다.
 *
 * ── 수정필요가 있으면 그것만 보낸다 (2026-09-01 회원 지적) ──────
 * 회원: "9개에서 7개로 줄긴했는데 7에서 더 고쳐지지 않아 다시 점검해줘."
 *
 * 프로덕션에서 새 홍보글을 뽑아 두 번 돌려 보고 원인을 봤다.
 *
 *   1회차  수정필요 5 → 1 · 남은 항목 12 → 9   (여기까지는 잘 준다)
 *   2회차  「고친 글이 채점에서 졌습니다 — 원래 글 1·79점 / 고친 글 2·79점」
 *
 * **모델이 하나를 고치고 다른 하나를 깼다.** 여섯 항목을 한꺼번에 받으면 그렇게 된다.
 * 고친 글의 수정필요가 늘어나니 라우트가 원래 글을 두고, 눌러도 아무 일이 없다.
 * ③의 「9개는 무리다」가 6개에서도 똑같이 일어난 것이다.
 *
 * 그래서 **수정필요가 하나라도 있으면 그것만 보낸다.** 점수 상한을 푸는 것은 수정필요뿐이고
 * (주의는 남아도 발행할 수 있다), 항목이 적을수록 곁가지를 덜 깬다. 주의만 남았을 때는
 * 예전처럼 주의를 보낸다.
 *
 * ── 상한 밖 주의는 아예 안 갔다 ─────────────────────────────
 * 같은 실측에서 「본문 글자수」·「얼버무리는 수량」·「문단 쪼개기」가 목록 밖에 있었다 —
 * 여섯 자리를 다른 항목이 먼저 차지해서 **한 번도 전달되지 않았다.** 눌러도 안 고쳐지는
 * 것이 당연하다. `round` 를 받아 주의 항목의 창을 밀어 준다 — 다시 누르면 다음 것들이 간다.
 */
export function fixList(
  items: { id: string; level: string; label: string; value: string; target: string; hint?: string; weight: number }[],
  risks: { term: string; category: string; fix: string }[] = [],
  /** 몇 번째로 누르는가 — 주의 항목의 창을 밀어 상한 밖 항목도 차례가 오게 한다 */
  round = 0
): string[] {
  const rank = (level: string) => (level === 'fail' ? 0 : 1)
  const order = <T extends { level: string; weight: number }>(list: T[]) =>
    [...list].sort((a, b) => rank(a.level) - rank(b.level) || b.weight - a.weight)
  const all = items.filter((i) => i.level !== 'pass')
  /*
   * 수정필요가 있으면 그것만 — 없으면 주의를 본다. 섞어 보내면 모델이 곁가지를 깨서
   * 고친 글이 채점에서 진다 (위 주석의 실측).
   */
  const hasFail = all.some((i) => i.level === 'fail')
  const pending = hasFail ? all.filter((i) => i.level === 'fail') : all
  const titles = order(pending.filter((i) => i.id.startsWith('title'))).slice(0, 3)
  const restAll = order(pending.filter((i) => !i.id.startsWith('title')))
  /*
   * 주의만 남았을 때는 창을 밀어 준다 — 상한(6) 밖 항목이 영원히 안 가는 것을 막는다.
   * 수정필요는 밀지 않는다: 그건 전부 보내야 하는 것이고, 애초에 여섯을 넘는 일이 드물다.
   */
  const shift = hasFail || restAll.length <= 6 ? 0 : (((Math.trunc(round) % restAll.length) + restAll.length) % restAll.length)
  const rest = [...restAll.slice(shift), ...restAll.slice(0, shift)].slice(0, 6)
  const lines = [...titles, ...rest].map((i) => {
    const head = `[${i.level === 'fail' ? '수정필요' : '주의'}] ${i.label}: 지금 ${i.value} / 기준 ${i.target}`
    return i.hint ? `${head}\n  → ${i.hint}` : head
  })
  // 위험 표현은 항목 수와 무관하게 전부 넘긴다 — 하나라도 남으면 발행할 수 없다
  return lines.concat(risks.map((x) => `[위험 표현] "${x.term}" (${x.category}) — ${x.fix}`))
}

export interface NextAction {
  id: string
  /** 명령형 한 줄 — 무엇을 하는지 */
  title: string
  /** 왜 지금 이것인지 한 줄 */
  why: string
  href: string
  /** 버튼 글자 */
  cta: string
  tone: ActionTone
}

export interface ActionInput {
  stores: Store[]
  posts: Post[]
  rankTargets: RankTarget[]
  /**
   * 순위가 직전 조회보다 떨어진 키워드.
   *
   * **개수만 받다가 목록으로 바꿨다** (2026-08-23). 회원: "밀린키워드 분석을 원해서
   * 상위노출분석을 눌렀는데 정작 분석 창이 아니라 상위 노출 키워드 분석탭으로 가고 있어."
   *
   * 개수만 알면 링크를 `/serp` 로밖에 못 건다. 그러면 빈 입력칸이 뜨고, **앱이 이미 아는
   * 키워드를 회원이 다시 타이핑해야 한다.** 어느 키워드가 밀렸는지까지 받아야 분석을
   * 바로 띄울 수 있다 (`/serp?keyword=…` 는 열자마자 스스로 분석한다).
   */
  fallen: { keyword: string }[]
  /**
   * 발행 2주가 지났는데 1페이지 밖인 항목 — 진단이 준비돼 있다는 뜻이다.
   *
   * 크론이 밤에 진단해 처방까지 저장해 두는데, 순위 화면에 들어가지 않으면 그 사실을
   * 모른다. 대시보드에서 먼저 알려준다.
   */
  stuck: { keyword: string; rank: number | null; days: number }[]
  /** 발행 균형 (정보 : 홍보) 판정 */
  balance: { level: ActionTone; ratio: string; info: number; promo: number; review: number }
  /** 발행 주기 판정 */
  cadence: { level: ActionTone; last14: number }
  keys: { search: boolean; searchAd: boolean }
  /** 오늘 날짜 (YYYY-MM-DD) — 밖에서 받는다. 안에서 만들면 테스트가 시각에 흔들린다 */
  today?: string
  /** 자동 초안 실행 기록 — 실패를 알리려면 필요하다 (2026-08-23) */
  autoDraftRuns?: { date: string; ok: boolean; error?: string }[]
}

/** 부족한 글 유형 하나 — 무엇을 쓸지까지 정해 준다 */
function missingType(b: ActionInput['balance']): { type: string; label: string } {
  // 정보글이 홍보글의 2배가 되어야 한다. 모자란 쪽을 고른다.
  if (b.info < b.promo * 2) return { type: 'info', label: '정보글' }
  if (b.review === 0) return { type: 'review', label: '후기글' }
  return { type: 'promo', label: '홍보글' }
}

/**
 * 우선순위대로 할 일을 만든다. 첫 번째가 "지금 할 일" 이고 나머지는 접어서 보여준다.
 * 항목이 없을 수는 없다 — 다 잘 돌아가고 있으면 다음 글감을 고르는 것이 할 일이다.
 */
export function nextActions(input: ActionInput): NextAction[] {
  const { stores, posts, rankTargets, stuck, balance, cadence, keys } = input
  const fallen = (input.fallen ?? []).filter((f) => f.keyword?.trim())
  const out: NextAction[] = []

  const drafts = posts.filter((p) => p.status === 'draft')
  const reviewed = posts.filter((p) => p.status === 'reviewed')
  const published = posts.filter((p) => p.status === 'published')

  /*
   * **오늘 자동으로 쓴 정보글을 맨 위에 올린다** (2026-08-21, 회원 요청으로 매일 초안이
   * 생긴다). 아래 「초안 N편」에 섞여 있으면 **어제 것과 구별이 안 되고**, 그러면 매일
   * 준비해 두는 의미가 없다 — 오늘 것을 오늘 올려야 발행 간격이 붙는다.
   *
   * 오늘 날짜는 밖에서 받는다. 안에서 new Date() 를 부르면 테스트가 시각에 따라 흔들린다.
   */
  const todayAuto = drafts.find((p) => isAutoDraft(p) && (p.createdAt ?? '').slice(0, 10) === input.today)

  /*
   * **자동 초안이 실패했으면 그것부터 알린다** (2026-08-23). 회원이 "안뜨는데? 제대로 하고
   * 있는거 맞아?"라고 물었을 때, 화면에는 아무 흔적이 없어서 실패했는지 안 돌았는지조차
   * 알 수 없었다. 조용히 실패하는 자동화는 없는 것보다 나쁘다 — 준비된 줄 알고 기다린다.
   *
   * **오늘 초안이 이미 있으면 알리지 않는다.** 글이 눈앞에 있는데 「실패했습니다」가 같이
   * 뜨면 어느 쪽이 맞는지 회원이 판단해야 한다.
   */
  const alert = input.today && !todayAuto ? autoDraftAlert(input.autoDraftRuns, input.today) : null
  if (alert) {
    out.push({
      id: 'auto-draft-failed',
      title: alert.level === 'bad' ? '오늘 자동 초안이 만들어지지 않았습니다' : '자동 초안이 멈춘 것 같습니다',
      why: `${alert.text} 「자동 작성」 화면에서 「지금 한 편 쓰기」로 직접 돌려보실 수 있습니다.`,
      href: '/autodraft',
      cta: '자동 작성 열기',
      tone: alert.level === 'bad' ? 'bad' : 'warn',
    })
  }
  if (todayAuto) {
    out.push({
      id: 'auto-draft',
      title: '오늘 정보글 초안이 준비됐습니다',
      why: `「${todayAuto.mainKeyword}」 · ${todayAuto.autoTopic ?? '주제 미상'} — 사진만 넣으면 올릴 수 있습니다. 발행은 회원님이 누르셔야 합니다 (네이버는 자동 발행을 열어두지 않습니다).`,
      href: `/write?id=${todayAuto.id}`,
      cta: '오늘 초안 열기',
      tone: 'warn',
    })
  }

  if (!stores.length) {
    out.push({
      id: 'store',
      title: '지점 정보를 먼저 등록하세요',
      why: '상호명·동네·강점이 있어야 글에 지어내지 않고 쓸 수 있습니다.',
      href: '/stores',
      cta: '지점 등록',
      tone: 'bad',
    })
  }

  if (stores.length && !posts.length) {
    out.push({
      id: 'first-keyword',
      title: '노려볼 키워드를 고르세요',
      why: '검색량은 있고 새 글은 적은 자리(황금 키워드)부터 써야 1페이지에 갑니다. 지점 버튼 한 번이면 후보가 나옵니다.',
      href: '/keywords',
      cta: '키워드 조사 열기',
      tone: 'warn',
    })
  }

  // 오늘 자동 초안은 위에서 따로 냈다 — 같은 글을 두 줄이 가리키지 않게 뺀다
  // todayAuto 가 없으면 거르지 않는다 — id 가 없는 글끼리 undefined === undefined 로 걸러지면
  // 초안이 통째로 사라진다 (테스트가 잡았다)
  const otherDrafts = todayAuto ? drafts.filter((p) => p.id !== todayAuto.id) : drafts
  if (otherDrafts.length) {
    out.push({
      id: 'draft',
      title: `초안 ${otherDrafts.length}편을 검수해 마무리하세요`,
      why: '검수 점수 85점을 넘기면 발행해도 좋은 상태입니다. 저품질 위험 표현도 이때 걸러집니다.',
      href: '/posts',
      cta: '초안 열기',
      tone: 'warn',
    })
  }

  if (reviewed.length) {
    out.push({
      id: 'reviewed',
      title: `검수 끝난 ${reviewed.length}편을 발행하세요`,
      why: '발행 패키지를 열면 제목·본문·태그를 순서대로 복사해 그대로 올릴 수 있습니다.',
      href: '/posts',
      cta: '발행 패키지 만들기',
      tone: 'warn',
    })
  }

  if (published.length && !rankTargets.length) {
    out.push({
      id: 'rank',
      title: '발행한 글을 순위 추적에 등록하세요',
      why: '등록해두면 그 키워드에서 오르는지 밀리는지가 날짜별로 쌓입니다.',
      href: '/rank',
      cta: '순위 추적 등록',
      tone: 'warn',
    })
  }

  // 밀린 것보다 먼저 본다 — "왜 안 올라오나" 에 대한 답이 이미 준비돼 있다
  if (stuck.length) {
    const w = stuck[0]
    out.push({
      id: 'stuck',
      title: `「${w.keyword}」 진단 결과가 준비됐습니다`,
      why: `발행 ${w.days}일째 ${w.rank === null ? '순위 밖' : `${w.rank}위`} — 1페이지 밖입니다. 상위 글 본문까지 재서 무엇을 고쳐야 하는지 정리해 두었습니다${stuck.length > 1 ? ` (다른 ${stuck.length - 1}개도 함께)` : ''}.`,
      href: '/rank',
      cta: '무엇을 고쳐야 하나 보기',
      tone: 'warn',
    })
  }

  if (fallen.length) {
    /*
     * **키워드를 링크에 실어 보낸다.** `/serp?keyword=…` 는 열자마자 스스로 분석을 돌린다
     * (SerpAnalyzer 의 autoRan). 키워드 없이 보내면 빈 입력칸만 뜨고, 회원은 앱이 이미
     * 아는 키워드를 다시 타이핑해야 한다 — 「분석 창이 아니라 키워드 분석 탭으로 간다」는
     * 지적이 정확히 이것이었다. 앱 안의 다른 「상위노출 분석」 링크는 전부 키워드를 싣고
     * 있었고 여기만 빠져 있었다.
     */
    const first = fallen[0].keyword.trim()
    out.push({
      id: 'fallen',
      title: `밀린 키워드 ${fallen.length}개의 원인을 확인하세요`,
      why: `「${first}」부터 봅니다 — 지금 그 자리를 차지한 글들의 제목·최신성·소재를 보면 무엇이 부족했는지 나옵니다${fallen.length > 1 ? ` (나머지 ${fallen.length - 1}개는 순위 화면에서 이어서 볼 수 있습니다)` : ''}.`,
      href: `/serp?keyword=${encodeURIComponent(first)}`,
      cta: `「${first}」 분석 열기`,
      tone: 'bad',
    })
  }

  if (posts.length && balance.level !== 'good') {
    const m = missingType(balance)
    out.push({
      id: 'balance',
      title: `${m.label}을 한 편 쓰세요`,
      why: `지금 정보 : 홍보 = ${balance.ratio} 입니다. 홍보글만 쌓이면 상업성 과다로 블로그 전체가 눌립니다 (권장 2 : 1).`,
      href: `/write?type=${m.type}`,
      cta: `${m.label} 쓰기`,
      tone: balance.level,
    })
  }

  if (posts.length && cadence.level !== 'good') {
    out.push({
      id: 'cadence',
      title: '다음 글 주제를 고르세요',
      why: `최근 2주 ${cadence.last14}편입니다. 주 2~3회 페이스가 유지돼야 블로그 지수가 올라갑니다.`,
      href: '/keywords',
      cta: '키워드 조사 열기',
      tone: cadence.level,
    })
  }

  if (!keys.searchAd) {
    out.push({
      id: 'ad-key',
      title: '검색광고 API 키를 넣으세요',
      why: '월간 검색량이 실제 값으로 바뀝니다. 지금은 샘플 값이라 키워드 등급을 믿을 수 없습니다.',
      href: '/deploy',
      cta: '발급 안내 보기',
      tone: 'warn',
    })
  }

  // 막힌 곳이 없으면 — 다음 글감을 고르는 것이 할 일이다
  if (!out.length) {
    out.push({
      id: 'next',
      title: '다음 키워드를 고르세요',
      why: '지금 막힌 것은 없습니다. 같은 페이스로 다음 글을 준비하면 됩니다.',
      href: '/keywords',
      cta: '키워드 조사 열기',
      tone: 'good',
    })
  }

  return out
}
