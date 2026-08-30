/**
 * **본문에서 순서대로 나오는 핵심 문구를 뽑는다** (2026-08-28 회원 요청).
 *
 * "정보글 작성하면 본문에 첫째, 둘째 같은 순서로 나오는 핵심 문구를 발행패키지에서 따로
 * 추려주면 좋겠어."
 *
 * ── 왜 파일을 따로 뒀나 (2026-08-30) ─────────────────────────
 * 회원: "문장이 제대로 안나왔어 어떤 글이든 오류가 없이 뽑아 낼 수 있게 점검해서 업데이트해줘."
 *
 * 뽑는 쪽을 아무리 고쳐도 **본문에 첫 항목 표시가 없으면** 첫 항목은 나올 수 없다. 그래서
 * 검수(`checker.ts`)가 같은 규칙으로 본문을 보고 「첫 항목이 없다」고 말해야 하는데,
 * `export.ts` 는 이미 `checker.ts` 를 부르고 있어서 거꾸로 부르면 순환이 된다.
 * 규칙을 두 벌 적는 것은 이 저장소가 반복해서 데인 일이라(「한쪽만 고친 것」), 규칙을
 * 여기 한 벌만 두고 양쪽이 부른다.
 */

/**
 * 본문에서 **순서대로 나오는 핵심 문구**를 뽑는다 (2026-08-28 회원 요청).
 *
 * ── 무엇을 뽑나 ────────────────────────────────────────────
 * 「첫째」·「둘째」·「첫 번째」·「첫 단계」·「①」·「1)」·「1.」·「1단계」로 **시작하는** 마디다.
 * 문장 가운데 나온 「첫째」는 순서를 매기는 말이 아닐 때가 많아서 안 잡는다.
 *
 * ── 「첫 단계」를 놓쳤다 (2026-08-28 회원 지적) ─────────────────
 * "첫번째는 어디가고 두번째부터 나오는거야?"
 *
 * 실제 글을 받아 보니 본문이 이렇게 쓰여 있었다:
 *   **첫 단계**는 워밍업입니다 … / **두 번째**는 큰 근육부터 … / 세 번째 … / 네 번째 …
 *
 * 첫 항목만 「단계」이고 나머지는 「번째」였다. 우리 목록에는 「1단계」처럼 **숫자**가 붙은
 * 것만 있어서 「첫 단계」가 빠졌고, 그래서 두 번째부터 나왔다. 이제 「첫·두·세…」에
 * 「번째」든 「단계」든 붙으면 같이 본다.
 *
 * (표현이 섞인 것 자체는 글 쪽 문제라 지시문에서도 막았다 — 순서는 한 가지 말로 통일한다.)
 *
 * ── 마디로 자른다 ──────────────────────────────────────────
 * 한 문단에 「첫째, … 둘째, …」가 이어 붙는 경우가 흔하다. 그래서 줄이 아니라 **표시가
 * 나오는 자리마다** 잘라서, 다음 표시(또는 줄 끝)까지를 한 항목으로 본다.
 *
 * ── 길면 자른다 ────────────────────────────────────────────
 * 추려 놓은 것이 문단만큼 길면 추린 뜻이 없다. 첫 문장까지만 남기고, 그래도 길면 100자에서
 * 끊는다 (끊었으면 「…」을 붙여 **잘렸다는 것을 숨기지 않는다**).
 */
/**
 * **어디서든 순서 표시로 인정하는 것** — 「첫째」·「①」·「1)」·「1단계」.
 *
 * 이 꼴들은 순서를 매기는 데 말고는 잘 쓰이지 않아서, 한 문단에 「첫째, … 둘째, …」로
 * 이어 붙어 있어도 마디로 잘라 낼 수 있다 (실제로 그렇게 쓰인 글이 흔하다).
 */
const HARD_MARK = /(첫째|둘째|셋째|넷째|다섯째|여섯째|일곱째|[①②③④⑤⑥⑦⑧⑨⑩]|\d+\s*단계|\d+[).](?!\d))/
/**
 * **줄 맨 앞에서만 순서 표시로 보는 것** — 「두 번째 단계는」·「첫 단계는」.
 *
 * ── 왜 나눴나 (2026-08-30 회원 지적: "문장이 제대로 안나왔어") ──
 * 회원이 실제로 뽑은 카드가 이랬다:
 *
 *   ① 두 번째 단계는 인클라인이나 디클라인처럼 각도를 바꾼 덤벨 프레스입니다.
 *   ② 첫 번째에서 쓰지 않은 각도를 골라서 3~4세트, 8~12회 반복으로 넣어주세요.
 *
 * ②는 항목이 아니다. ①의 **설명 문장**인데, 앞 항목을 가리키려고 「첫 번째에서」라고
 * 쓴 것뿐이다. 그런데 그 앞이 마침표라서 「문장이 끝난 다음」 조건을 통과해 버렸고,
 * 그 바람에 ①은 설명을 통째로 빼앗겨 빈 줄이 됐다.
 *
 * 「두 번째」·「첫 번째」는 **일상 명사구**다 — 「첫 번째에서」·「방식이 첫 번째입니다」처럼
 * 문장 속에서 앞을 가리키는 데 흔히 쓴다. 그래서 이 꼴만은 **줄 맨 앞**을 요구한다.
 * 순서를 매기는 글은 항목을 줄 맨 앞에서 시작하므로 잃는 것이 없다.
 */
const SOFT_MARK = /((?:첫|한|두|세|네|다섯|여섯|일곱)\s*(?:번째|단계))/
/** 두 꼴을 합친 것 — 「이 줄이 표시로 시작하나」를 볼 때 쓴다 */
const KEY_POINT_MARK = new RegExp(`(${HARD_MARK.source}|${SOFT_MARK.source}) *`)

/** 한글 수사 → 숫자. 「첫 번째」가 몇 번인지 알아야 빠진 자리를 짚을 수 있다 */
const KO_NUM: Record<string, number> = {
  첫: 1, 한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6, 일곱: 7,
  첫째: 1, 둘째: 2, 셋째: 3, 넷째: 4, 다섯째: 5, 여섯째: 6, 일곱째: 7,
}
const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩'

/**
 * **본문이 스스로 매긴 번호**를 읽는다.
 *
 * 화면이 1·2·3… 을 새로 매겨 버리면 본문이 2부터 시작해도 ①로 보인다 — 회원 눈에는
 * 멀쩡한 목록인데 정작 글에는 첫 항목이 없는 것이다. 읽어 낸 번호를 그대로 들고 다녀야
 * 「①이 빠졌다」고 말할 수 있다. 못 읽으면 `undefined` 다 (0 으로 지어내지 않는다).
 */
export function markNumber(mark: string): number | undefined {
  const m = (mark ?? '').trim()
  if (!m) return undefined
  const c = CIRCLED.indexOf(m[0])
  if (c >= 0) return c + 1
  const digits = /^(\d+)/.exec(m)
  if (digits) return Number(digits[1])
  const ko = /^(첫째|둘째|셋째|넷째|다섯째|여섯째|일곱째)/.exec(m) ?? /^(첫|한|두|세|네|다섯|여섯|일곱)/.exec(m)
  return ko ? KO_NUM[ko[1]] : undefined
}

export interface KeyPoint {
  /** 본문에 적힌 문구 그대로 */
  text: string
  /** 그 밑에 딸린 설명 — 다음 표시(또는 소제목·이미지)를 만날 때까지 */
  detail?: string
  /** 본문이 스스로 매긴 번호 (「두 번째」면 2). 못 읽으면 없다 */
  n?: number
  /**
   * 몇 번째 묶음인가 — **번호가 되돌아가면 새 목록이 시작된 것으로 본다**.
   *
   * 한 글에 순서 목록이 둘 이상 있는 것은 정상이다. 회원이 보내온 글에도 「실제로 어떻게
   * 배치하면 될까」 아래에 1·2·3 이 있고, 「고를 때 기준」 아래에 또 1·2 가 있었다.
   * 묶음을 구분하지 않으면 그 둘이 1·2·3·2 로 이어져 **번호가 되돌아간 것처럼** 보인다.
   *
   * **소제목으로 나누지 않는다.** 실제 글에는 질문마다 소제목을 달고 그 아래에서 1·2·3
   * 을 이어 가는 글도 있었다 (「갱년기다이어트」 글이 그랬다) — 소제목마다 끊으면 그
   * 목록이 한 항목짜리 묶음 셋으로 조각난다. 번호가 늘어나는 동안은 한 목록으로 본다.
   */
  group: number
}

/**
 * 뽑아낸 목록이 **성한지** 본다 — 첫 항목부터 하나씩 이어지나.
 *
 * 회원 요청 (2026-08-30): "어떤 글이든 오류가 없이 뽑아 낼 수 있게."
 *
 * 뽑는 쪽을 아무리 고쳐도 **본문에 첫 항목이 없으면** 첫 항목은 나올 수 없다. 실제 글이
 * 그랬다 — 1단계를 「제가 이 순서에서 가장 먼저 강조하고 싶은 부분은」이라고 써서 순서
 * 표시가 아예 없었고, 그래서 카드가 「두 번째 단계는」부터 시작했다.
 *
 * 그런 글은 **조용히 반쪽짜리 목록을 보여주는 대신 무엇이 어긋났는지 말한다.** 고치는
 * 것은 본문이고(검수의 `key-point-order` 가 그 일을 한다), 여기서는 알아보기만 한다.
 */
export function keyPointFlaws(points: KeyPoint[]): string[] {
  const out: string[] = []
  const groups = new Map<number, KeyPoint[]>()
  for (const p of points) groups.set(p.group, [...(groups.get(p.group) ?? []), p])
  for (const list of groups.values()) {
    const ns = list.map((p) => p.n)
    if (ns.some((n) => n === undefined)) continue
    const nums = ns as number[]
    /*
     * **한 항목짜리 묶음도 본다.** 「둘째는 보충제를 같이 쓰는 방법이에요」가 혼자 떠
     * 있던 글이 실제로 있었다 — 첫째가 순서 표시 없이 쓰여서 짝을 잃은 것이다.
     */
    if (nums[0] !== 1) out.push(`${nums[0]}번부터 시작합니다 — 앞 항목에 순서 표시가 없습니다`)
    for (let i = 1; i < nums.length; i++) {
      if (nums[i] === nums[i - 1]) out.push(`${nums[i]}번이 두 번 나옵니다`)
      else if (nums[i] !== nums[i - 1] + 1) out.push(`${nums[i - 1]}번 다음이 ${nums[i]}번입니다 — 사이가 비었습니다`)
    }
  }
  return [...new Set(out)]
}

/**
 * 세기 전에 **굵게 표시만 떼어 낸다** — 「\*\*첫 번째 단계는\*\* …」이 줄 맨 앞으로 오게.
 *
 * 순서 표시를 굵게 쓰는 글이 흔한데, 별표가 앞에 남아 있으면 「줄 맨 앞」 조건에 걸려
 * 항목이 통째로 빠진다. 검수와 발행 패키지가 **같은 글자**를 보게 하려고 여기 둔다.
 */
export function bodyForKeyPoints(body: string): string {
  return (body ?? '').replace(/\*\*/g, '')
}

export function keyPointsOf(body: string): KeyPoint[] {
  const out: KeyPoint[] = []
  const lines = (body ?? '').split('\n').map((l) => l.trim())
  /** 본문이 아닌 줄 — 소제목·이미지 지시문 */
  const skip = (l: string) => !l || l.startsWith('#') || l.startsWith('[')
  /** 그 줄이 순서 표시로 시작하나 */
  const startsWithMark = (l: string) => new RegExp(`^${KEY_POINT_MARK.source}`).test(l)
  /*
   * **번호가 되돌아가면 묶음이 바뀐다.** 한 글에 순서 목록이 둘 이상 있는 것은 정상이고,
   * 그 둘을 한 줄로 이으면 1·2·3·2 처럼 번호가 되돌아간 것으로 보인다.
   */
  let group = 0
  let prevN: number | undefined

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]
    if (skip(line)) continue

    /*
     * 그 줄 안에서 표시가 나오는 자리를 모두 찾는다.
     *   · 「첫째」·「①」·「1)」 — **줄 맨 앞이거나 문장이 끝난 다음**이면 표시로 본다.
     *   · 「두 번째」·「첫 단계」 — **줄 맨 앞일 때만** 표시로 본다 (2026-08-30).
     * 「셋째 주에는」처럼 문장 가운데 든 말은 어느 쪽도 순서가 아니다.
     */
    const marks: { at: number; len: number; n: number | undefined }[] = []
    const re = new RegExp(KEY_POINT_MARK.source, 'g')
    let m: RegExpExecArray | null
    while ((m = re.exec(line))) {
      const before = line.slice(0, m.index).trim()
      const atLineStart = before === ''
      const soft = new RegExp(`^${SOFT_MARK.source}`).test(m[0])
      if (atLineStart || (!soft && /[.!?]$/.test(before)))
        marks.push({ at: m.index, len: m[0].length, n: markNumber(m[0]) })
    }
    for (let i = 0; i < marks.length; i++) {
      const chunk = line.slice(marks[i].at, marks[i + 1]?.at ?? line.length).trim()
      if (!chunk) continue
      /*
       * **표시 자체의 마침표에서 끊지 않는다** (2026-08-30).
       *
       * 「1. 폭식 시간 2시간 전 미리 먹기 — …」에서 문장 끝을 맨 앞부터 찾으면 표시인
       * 「1.」이 먼저 걸린다. 그래서 화면에 문구가 **「1.」 한 글자**로만 떴다 — 회원이
       * 본 카드가 그것이다. 표시를 지나친 자리부터 문장 끝을 찾는다.
       */
      const head = chunk.slice(0, marks[i].len)
      const rest = chunk.slice(marks[i].len)
      const firstRest = rest.match(/^[\s\S]*?[.!?](?=\s|$)/)?.[0] ?? rest
      const first = (head + firstRest).trim()
      const parts = [rest.slice(firstRest.length).trim()]
      /*
       * ─── 관련된 내용을 **끝까지** 가져온다 (2026-08-28 회원 요청) ──────────
       *
       * "내용이 전체적으로 안나와 핵심 문구와 관련된 전체 문장이 나오게 해줘."
       *
       * 앞 판은 ①같은 줄에 설명이 없을 때만 ②다음 한 문단까지만 봤다. 그래서 설명이
       * 여러 문단에 걸쳐 있으면 앞쪽만 나오고 뒤가 잘렸다 — 화면에 「…자료를 보면」에서
       * 끊긴 줄이 그것이다.
       *
       * 이제 **다음 순서 표시(또는 소제목·이미지)를 만날 때까지** 이어 붙인다. 그 경계가
       * 곧 「이 항목에 딸린 내용」의 끝이다. 길이로 자르지 않는다 — 회원이 원한 것이 전체
       * 문장이고, 임의로 끊으면 또 「내용이 안 나온다」가 된다.
       */
      if (i === marks.length - 1) {
        for (let k = li + 1; k < lines.length; k++) {
          const next = lines[k]
          if (!next) continue
          if (skip(next) || startsWithMark(next)) break
          parts.push(next)
          li = k
        }
      }
      const detail = parts.filter(Boolean).join('\n')
      const n = marks[i].n
      if (n !== undefined && prevN !== undefined && n <= prevN) group++
      if (n !== undefined) prevN = n
      out.push({ text: trimPoint(first), detail: detail || undefined, n, group })
    }
  }
  return out
}


function trimPoint(chunk: string, max = 100): string {
  if (chunk.length <= max) return chunk
  return `${chunk.slice(0, max).trim()}…`
}
