/**
 * **회원이 써달라고 한 내용이 글에 실제로 들어갔는가.**
 *
 * ── 왜 만들었나 (2026-08-19) ────────────────────────────────
 * 회원이 요청과 결과를 나란히 보여줬다.
 *
 *   요청: "24시 내용 빼주고 지금 PT를 등록해야하는 이유, PT 를 추천드리는 사람들,
 *          PT등록할때 망설이는 점 (효과, 가격, 트레이너가 안맞을까봐) 을 해결하는 방식으로"
 *   결과: 24시는 빠졌지만(✓) 본문 소제목이 「등록을 망설이게 만드는 세 가지」·
 *          「다이어트 시작하는 첫 달」·「이런 환경에서 진행됩니다」·「자세와 시설 관리」…
 *          → **「추천드리는 사람들」은 아예 없고, 「지금 등록해야 하는 이유」도 없다.**
 *          요청에 없던 다이어트 5가지 팁이 한 구간을 차지했다.
 *
 * 원인은 분명하다. 이 앱은 요청을 **거르는 말**로만 읽고 있었다(`excludedWords`) —
 * 「빼달라」는 지켰지만 「써달라」는 골격(7단계 고정 구조)에 밀렸다. 골격이 「3단계는 운동
 * 정보」라고 정해두면 모델은 요청과 무관한 다이어트 팁을 거기 채운다.
 *
 * 그래서 두 가지를 한다.
 *   1) 지시문에서 **요청이 소제목을 정한다**고 못 박는다 (골격은 분량 배분만).
 *   2) **검수가 확인한다.** 지시문만으로는 안 붙는다는 것을 이 앱에서 이미 여러 번 배웠다
 *      (`titlePromo`·`event-hook` 둘 다 지시문에 있었는데 안 나와서 검사를 만들었다).
 */

/** 「빼달라」 쪽 문장을 알아보는 말 — rotation.ts 의 NEGATION 과 같은 뜻 */
const NEGATION =
  /(빼|제외|말고|없이|(?:넣|쓰|언급하|다루|강조하)지\s*(?:마|말)|안\s*넣|안\s*나오게|피해|지워|삭제|생략)/

/** 요청을 항목으로 자르는 자리 */
const SPLIT = /[,\n·、]|그리고|그리구|및\s|또한/

/**
 * 항목이 아니라 문장 장식인 말. 이것만 남으면 항목으로 세지 않는다.
 *
 * 「~을 해결하는 방식으로 글을 작성해줘」의 뒤쪽처럼, 요청의 마무리 문구가 항목으로
 * 잡히면 있지도 않은 주제를 요구하는 셈이 된다.
 */
const TAIL =
  /^(글|본문|내용|작성|작성해|작성해줘|써줘|써|부탁|해줘|해주세요|방식|방식으로|형태로|식으로|위주로|중심으로|느낌으로|정도|이렇게|그렇게)$/

/**
 * 조사·어미를 떼서 낱말을 맨몸으로 만든다.
 *
 * **떼고 나서 두 글자가 안 되면 떼지 않는다.** 「효과」의 「과」를 조사로 보고 떼면 「효」가
 * 되어 낱말이 사라진다 — 실제로 회원 요청의 「효과」가 그렇게 사라졌다. 두 글자 낱말이
 * 조사로 끝나는 것처럼 보이는 경우가 흔하다 (효과·결과·문의·회의·사과…).
 */
function bare(word: string): string {
  const strip = (s: string, re: RegExp) => {
    const cut = s.replace(re, '')
    return cut.length >= 2 ? cut : s
  }
  return strip(
    strip(word, /(으로|로서|로써|로|에서|에게|에|와|과|랑|이랑|보다|처럼|까지|부터|마다|조차|밖에)$/),
    /(은|는|을|를|이|가|도|만|의|께|여|랑)$/
  )
}

/**
 * 항목에서 **찾아볼 낱말**을 고른다.
 *
 * 「PT 를 추천드리는 사람들」 → [PT, 추천, 사람]. 조사와 존대 어미를 떼고, 두 글자 이상만
 * 남긴다. 「드리는」·「하는」 같은 기능어는 버린다 — 본문에 있어도 아무 뜻이 없다.
 */
const FUNC =
  /^(하는|되는|드리는|드릴|주는|주시는|있는|없는|같은|이런|저런|그런|무슨|어떤|해야|해야하는|해야할|할때|때|것|점|들|중|안|더|좀|잘|또|및|등|위|아래|관련|부분|얘기|이야기|언급)$/

export function topicWords(item: string): string[] {
  const out: string[] = []
  for (const raw of item.match(/[0-9A-Za-z가-힣]+/g) ?? []) {
    const w = bare(raw)
    /*
     * **조사를 뗐더니 한 글자가 되면 버린다.** 앞 판은 원형(「글을」)을 그대로 남겼는데,
     * 그런 낱말은 본문 어디에나 있어서 확인이 무의미하고 항목의 통과 기준만 흐린다.
     * 다만 PT 처럼 영문 약어는 두 글자여도 남긴다.
     */
    const word = /^[A-Za-z]{2,}$/.test(raw) ? raw : w
    if (word.length < 2) continue
    if (FUNC.test(word) || TAIL.test(word)) continue
    if (!out.includes(word)) out.push(word)
  }
  return out
}

export interface RequestedTopic {
  /** 회원이 쓴 그대로 (화면에 보여줄 말) */
  text: string
  /** 본문에서 찾아볼 낱말 */
  words: string[]
}

/**
 * 요청에서 **써달라고 한 항목**을 뽑는다 (순수 함수 — 테스트 대상).
 *
 * 「빼달라」가 든 조각은 버린다 — 그건 `excludedWords` 가 맡는다. 괄호 안의 열거
 * (「(효과, 가격, 트레이너가 안맞을까봐)」)는 **각각 따로** 센다. 회원이 셋을 나열한 것은
 * 셋 다 답해 달라는 뜻이다.
 */
export function requestedTopics(request?: string): RequestedTopic[] {
  const text = (request ?? '').trim()
  if (!text) return []

  /*
   * 괄호를 먼저 펼친다. 「망설이는 점 (효과, 가격, 트레이너가 안맞을까봐)」에서 괄호를
   * 그대로 두면 한 항목으로 뭉쳐서, 효과만 답하고 나머지를 빼먹어도 통과한다.
   */
  /*
   * 요청 끝의 마무리 문구를 먼저 뗀다 — 「… 글을 작성해줘」·「… 써주세요」. 안 떼면 마지막
   * 항목에 붙어서, 있지도 않은 주제(「글을 작성해줘」)를 요구하는 셈이 된다.
   */
  const body = text.replace(/\s*(글|본문)?을?\s*(작성|써|적어|부탁)\S*\s*$/, '').trim()

  const flattened = body.replace(/[（(]([^）)]*)[）)]/g, (_, inner) => `, ${inner}`)

  const out: RequestedTopic[] = []
  for (const piece of flattened.split(SPLIT)) {
    const item = piece.trim().replace(/^[-•*\s]+/, '')
    if (!item) continue
    /*
     * **「빼달라」와 「써달라」가 한 조각에 붙어 있을 수 있다.**
     *
     * 회원 요청이 실제로 그랬다 — 「24시 내용 빼주고 지금 PT를 등록해야하는 이유, …」.
     * 조각 전체를 버리면 「지금 등록해야 하는 이유」까지 함께 사라진다. 실제로 그렇게
     * 사라져서, 회원이 요청한 세 항목 중 하나가 검사에서 아예 안 보였다.
     *
     * 그래서 부정어 **뒤쪽만** 남긴다. 앞쪽(빼달라는 말)은 excludedWords 가 맡는다.
     */
    const neg = NEGATION.exec(item)
    const asked = neg
      ? item.slice((neg.index ?? 0) + neg[0].length).replace(/^\s*(주고|고|주시고|주세요|줘)\s*/, '').trim()
      : item
    if (!asked) continue
    const words = topicWords(asked)
    if (!words.length) continue
    if (out.some((o) => o.text === asked)) continue
    out.push({ text: asked.slice(0, 60), words })
  }
  return out
}

/** 띄어쓰기를 무시하고 찾는다 — 「PT 등록」과 「PT등록」은 같은 말이다 */
function flat(s: string): string {
  return s.replace(/\s+/g, '')
}

export interface Coverage {
  covered: RequestedTopic[]
  missing: RequestedTopic[]
  /** 0~100 */
  rate: number
}

/**
 * 요청 항목이 글에 들어갔는지 본다 (순수 함수 — 테스트 대상).
 *
 * **느슨하게 판정한다.** 항목의 낱말 가운데 **절반 이상**이 글에 있으면 들어간 것으로 본다.
 * 회원은 요청을 그대로 베껴 쓰라고 한 것이 아니라 그 내용을 다뤄 달라고 한 것이므로, 글자
 * 그대로 맞추라고 하면 어색한 글이 나온다. 반대로 하나만 걸려도 통과시키면 「PT」 한 낱말로
 * 모든 항목이 통과해 검사가 아무것도 못 잡는다.
 */
export function coverageOf(topics: RequestedTopic[], text: string): Coverage {
  const hay = flat(text)
  const covered: RequestedTopic[] = []
  const missing: RequestedTopic[] = []
  for (const t of topics) {
    const hits = t.words.filter((w) => hay.includes(flat(w))).length
    // 낱말이 하나뿐인 항목은 그 하나가 있어야 한다
    const need = Math.max(1, Math.ceil(t.words.length / 2))
    ;(hits >= need ? covered : missing).push(t)
  }
  const rate = topics.length ? Math.round((covered.length / topics.length) * 100) : 100
  return { covered, missing, rate }
}
