/*
 * ─── 회원이 넣은 이벤트가 본문에 남았는지 (2026-09-02 회원 지적) ──────────────
 *
 * 회원: "후기글에 이벤트 정보를 넣어놨는데 인식하지 못하고 멋대로 작성해."
 *
 * **프로덕션에 저장된 후기글로 재봤다.** 회원이 넣은 값은 이랬다:
 *
 *   공동구매 이벤트 / 3개월 99,000원
 *   혼자 등록할시 네이버 사전예약 한정 7일서비스
 *   2인 동반 등록시 15일 서비스 / 3인 동반 등록시 30일 서비스
 *   네이버 5,000원 할인 쿠폰 다운로드 가능
 *
 * 나온 글에 남은 것은 「3개월 99,000원」과 「쿠폰」 **둘뿐**이었다. 7일·15일·30일도,
 * 2인·3인 조건도, 5,000원도, 공동구매도, 사전예약도 전부 사라졌다 — 그 자리에
 * 「함께 등록하는 인원에 따라 서비스 기간이 더 붙는다고 했습니다」 한 줄이 있었다.
 * 그런데 검수는 **98점 · 수정필요 0** 이었다. `event-hook` 은 첫 구간에 「혜택 낱말 +
 * 제한 낱말」이 있는지만 보기 때문에, **회원이 적은 값과 다른 이벤트를 지어내도 통과한다.**
 *
 * 이 파일은 회원이 적은 것 중 **숫자와 이름**만 뽑아 본문에 남았는지 견준다.
 *
 * **헛짚으면 고칠 수 없는 항목이 된다** — 이 저장소에서 여러 번 겪은 일이라, 말이 조금
 * 달라져도 같은 것으로 본다: 「99,000원」과 「9만 9천 원」, 「30일」과 「한 달」,
 * 「2인」과 「두 명」은 같은 조각이다.
 */

export type FactKind = 'money' | 'span' | 'people' | 'month' | 'word'

export interface EventFact {
  kind: FactKind
  /** 회원이 적은 그대로 — 화면에 이 말로 보여준다 */
  label: string
  /** 본문에 이 중 하나라도 있으면 반영된 것으로 본다 (띄어쓰기는 무시하고 견준다) */
  accepts: string[]
  /** 금액은 글자가 아니라 값으로 견준다 (99,000 = 99000 = 9.9만) */
  value?: number
}

const flat = (s: string) => s.replace(/\s+/g, '')

/** 한글 수사 — 「두 명」·「세 달」처럼 쓰는 쪽도 같은 것으로 본다 */
const KOR_COUNT: Record<number, string> = { 1: '한', 2: '두', 3: '세', 4: '네', 5: '다섯', 6: '여섯' }

/*
 * ─── 금액 ────────────────────────────────────────────────────────────────
 * 「원」이 붙은 것만 금액으로 본다. 전화번호·연도가 금액으로 잡히면 고칠 수 없는 항목이 된다.
 */
/*
 * **읽은 자리는 지우고 다음 꼴을 본다.** 「9만 9천 원」을 만 단위로 읽은 뒤 그 자리에서
 * 「9천 원」을 또 읽으면 없는 금액(9,000원)이 생긴다. 그래서 큰 단위부터 읽고 지운다.
 *
 * 「N만」에 「원」을 꼭 요구하지 않는 것은 회원이 「3개월 9.9만」이라고만 적을 수 있기
 * 때문이고, 대신 「3만 명」처럼 돈이 아닌 자리는 뒤 낱말로 걸러낸다.
 */
const MONEY_STEPS: { re: RegExp; pick: (g: (string | undefined)[]) => number | null }[] = [
  {
    re: /(\d+(?:\.\d+)?)\s*만\s*(?:(\d+)\s*천\s*)?원?(?!\s*(?:명|분|개|장|회|평))/g,
    pick: (g) => Number(g[0]) * 10000 + (g[1] ? Number(g[1]) * 1000 : 0),
  },
  // 「5천 원」·「5천원」 — 프로덕션이 실제로 이렇게 썼다 (2026-09-02)
  { re: /(\d+(?:\.\d+)?)\s*천\s*원/g, pick: (g) => Number(g[0]) * 1000 },
  {
    re: /(\d[\d,]*)\s*원/g,
    pick: (g) => {
      const v = Number(String(g[0]).replace(/,/g, ''))
      return v >= 1000 ? v : null
    },
  },
]

export function moneyValues(text: string): number[] {
  const out: number[] = []
  let rest = text ?? ''
  for (const step of MONEY_STEPS) {
    rest = rest.replace(step.re, (...args) => {
      const groups = args.slice(1, args.length - 2) as (string | undefined)[]
      const v = step.pick(groups)
      if (v != null && Number.isFinite(v)) out.push(Math.round(v))
      return ' '
    })
  }
  return [...new Set(out)]
}

function moneyLabel(v: number): string {
  return `${v.toLocaleString('en-US')}원`
}

/*
 * ─── 기간 ────────────────────────────────────────────────────────────────
 * 「3개월」·「7일」·「2주」. 「8월」은 여기가 아니라 아래 `month` 로 간다.
 */
const SPAN_RE = /(\d+)\s*(개월|달|주일|주|일)/g

function spanAccepts(n: number, unit: string): string[] {
  const out = new Set<string>()
  if (unit === '개월' || unit === '달') {
    out.add(`${n}개월`).add(`${n}달`)
    if (KOR_COUNT[n]) out.add(`${KOR_COUNT[n]}달`).add(`${KOR_COUNT[n]}개월`)
    out.add(`${n * 30}일`)
  } else if (unit === '주' || unit === '주일') {
    out.add(`${n}주`).add(`${n}주일`).add(`${n * 7}일`)
    if (n === 1) out.add('일주일').add('한주')
  } else {
    out.add(`${n}일`)
    if (n === 7) out.add('일주일').add('1주').add('한주')
    if (n === 15) out.add('보름')
    if (n % 7 === 0) out.add(`${n / 7}주`).add(`${n / 7}주일`)
    if (n % 30 === 0) {
      const m = n / 30
      out.add(`${m}개월`).add(`${m}달`)
      if (KOR_COUNT[m]) out.add(`${KOR_COUNT[m]}달`)
    }
  }
  return [...out]
}

/*
 * ─── 인원 ────────────────────────────────────────────────────────────────
 * 「2인 동반」·「선착순 30명」·「혼자 등록할시」. 방문객은 「둘이 같이 하면」이라고 쓴다.
 */
const PEOPLE_RE = /(\d+)\s*(인|명)/g
const ALONE_RE = /혼자|1인|개인/

/*
 * **「50분까지만 받습니다」는 조건이 살아 있는 말이다.** 「분」은 사람을 높여 세는 말이라
 * 회원이 「선착순 50명」이라고 적어도 글에서는 「50분」으로 쓰는 쪽이 자연스럽다 — 여기서
 * 걸면 잘 쓴 글을 고치라고 하게 된다.
 *
 * 대신 「30분 운동」처럼 시간을 뜻하는 「분」까지 인원으로 인정될 수는 있다. 그러려면
 * **회원이 적은 인원 수와 본문의 시간이 같은 숫자**여야 하는 드문 경우이고, 그때 손해는
 * 「너무 관대하다」쪽이다. **헛짚어서 못 고치는 항목이 되는 것보다 낫다.**
 */
function peopleAccepts(n: number): string[] {
  const out = new Set<string>([`${n}인`, `${n}명`, `${n}분`])
  if (KOR_COUNT[n]) out.add(`${KOR_COUNT[n]}명`).add(`${KOR_COUNT[n]}사람`)
  if (n === 1) out.add('혼자').add('개인')
  /*
   * **「함께 등록」을 2인으로 쳐주면 안 된다** — 회원이 지적한 그 글이 「함께 등록하는
   * 인원에 따라 서비스 기간이 더 붙는다」였다. 인원이 몇인지 없는 말이라 조건이 사라진
   * 것이고, 그걸 통과시키면 이 검사가 있으나 마나다. 「둘이」·「두 명」처럼 **수가 있는
   * 말**만 같은 것으로 본다.
   */
  if (n === 2) out.add('둘이')
  if (n === 3) out.add('셋이')
  return [...out]
}

/*
 * ─── 마감 달 ─────────────────────────────────────────────────────────────
 * 「8월 무료이용」의 8월. 「3개월」의 「개월」과 헷갈리지 않게 앞에 숫자만 오는 꼴만 본다.
 */
const MONTH_RE = /(?<![개\d])(\d{1,2})\s*월(?![일급])/g

/*
 * ─── 이름이 붙은 혜택 ────────────────────────────────────────────────────
 *
 * **아무 낱말이나 넣지 않는다.** 「서비스」·「할인」·「혜택」처럼 어느 글에나 있는 말을
 * 넣으면 본문이 이미 통과하거나, 반대로 억지로 끼우게 된다. 회원이 적었을 때 **읽는
 * 사람이 알아야 할 물건·조건의 이름**만 본다.
 */
/*
 * **「이 말이 있으면 조각이 된다」와 「이 말이면 반영된 것으로 본다」는 다르다.**
 * 「사전예약 한정」한 줄을 두고 사전예약과 한정을 각각 조각으로 세면 같은 것을 두 번
 * 요구하게 된다. 그래서 조각을 만드는 말(`trigger`)과 그것을 채우는 말(`accepts`)을
 * 나눠 둔다 — 회원이 「선착순」이라고 썼으면 본문은 「인원을 정해뒀다」로 받아도 된다.
 */
const WORD_GROUPS: { trigger: string[]; accepts: string[] }[] = [
  { trigger: ['쿠폰'], accepts: ['쿠폰'] },
  { trigger: ['락커', '라커', '사물함'], accepts: ['락커', '라커', '사물함'] },
  { trigger: ['운동복', '헬스복'], accepts: ['운동복', '헬스복'] },
  { trigger: ['수건', '타월'], accepts: ['수건', '타월'] },
  { trigger: ['주차'], accepts: ['주차'] },
  { trigger: ['인바디'], accepts: ['인바디', '체성분'] },
  { trigger: ['PT', '피티'], accepts: ['PT', '피티', '퍼스널'] },
  { trigger: ['체험'], accepts: ['체험', '체험권', '하루권'] },
  { trigger: ['공동구매', '공구'], accepts: ['공동구매', '공구'] },
  { trigger: ['사전예약'], accepts: ['사전예약', '미리예약'] },
  { trigger: ['선착순'], accepts: ['선착순', '인원제한', '인원을정', '자리가정', '한정', '정해둔인원'] },
]

/** 회원이 넣은 이벤트에서 본문에 남아야 할 조각을 뽑는다 */
export function eventFacts(eventText: string): EventFact[] {
  const src = eventText ?? ''
  if (!src.trim()) return []
  const facts: EventFact[] = []
  const seen = new Set<string>()
  const push = (f: EventFact) => {
    const key = `${f.kind}:${f.label}`
    if (seen.has(key)) return
    seen.add(key)
    facts.push(f)
  }

  for (const v of moneyValues(src)) push({ kind: 'money', label: moneyLabel(v), accepts: [], value: v })

  for (const m of src.matchAll(SPAN_RE)) {
    const n = Number(m[1])
    if (!Number.isFinite(n) || n <= 0) continue
    push({ kind: 'span', label: `${n}${m[2]}`, accepts: spanAccepts(n, m[2]) })
  }

  for (const m of src.matchAll(PEOPLE_RE)) {
    const n = Number(m[1])
    // 「30명」까지는 조건이고, 그보다 큰 수는 회원 수·평수 같은 소개말일 때가 많다
    if (!Number.isFinite(n) || n <= 0 || n > 100) continue
    push({ kind: 'people', label: `${n}${m[2]}`, accepts: peopleAccepts(n) })
  }
  if (ALONE_RE.test(src)) push({ kind: 'people', label: '혼자(1인)', accepts: peopleAccepts(1) })

  for (const m of src.matchAll(MONTH_RE)) {
    const n = Number(m[1])
    if (!Number.isFinite(n) || n < 1 || n > 12) continue
    /*
     * 「8월 등록분」을 글에서 「이번 달 안에 시작하시는 분까지」로 쓰는 것은 조건을
     * 뺀 것이 아니다 — 같은 마감을 다른 말로 적은 것이다. 그래서 함께 인정한다.
     */
    push({ kind: 'month', label: `${n}월`, accepts: [`${n}월`, '이번달', '이달', '금월'] })
  }

  for (const group of WORD_GROUPS) {
    // 회원이 실제로 쓴 말을 이름으로 보여준다 (「선착순」이라 적었으면 그 말로 알려준다)
    const written = group.trigger.find((w) => flat(src).includes(flat(w)))
    if (written) push({ kind: 'word', label: written, accepts: group.accepts })
  }

  return facts
}

/** 이 조각이 본문에 남았나 */
export function factInBody(fact: EventFact, body: string): boolean {
  if (fact.kind === 'money') return moneyValues(body).includes(fact.value ?? -1)
  const f = flat(body)
  return fact.accepts.some((a) => f.includes(flat(a)))
}

/**
 * 본문에서 빠진 조각. 이것이 비어 있어야 「회원이 넣은 대로 나왔다」고 말할 수 있다.
 */
export function missingFacts(eventText: string, body: string): EventFact[] {
  return eventFacts(eventText).filter((f) => !factInBody(f, body))
}

/**
 * 숫자로 적힌 조건(금액·기간·인원·마감 달)과 이름뿐인 혜택을 나눈다.
 *
 * **숫자가 빠진 것은 즉시수정이다** — 회원이 직접 적어 넣은 값이라 우리가 줄이거나 바꿀
 * 여지가 없다. 이름만 빠진 것은 주의로 둔다 (「공동구매」를 방문객이 그 이름으로 부르지
 * 않을 수는 있다).
 */
export function isHardFact(fact: EventFact): boolean {
  return fact.kind !== 'word'
}
