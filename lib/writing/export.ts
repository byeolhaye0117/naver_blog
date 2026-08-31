import type { Post, Store } from '@/lib/types'
import { stripGuides } from './templates'
import { parseBody, splitSentences } from './checker'
import { placeReviewUrl } from '../analysis/reviews'
import { keyPointFlaws, keyPointsOf, type KeyPoint } from './keypoints'

/**
 * 복사용 패키지.
 *
 * 네이버는 블로그 글쓰기 공식 API를 제공하지 않는다. 그래서 발행은 사람이 직접
 * 네이버 에디터에 붙여넣는 방식이고, 이 함수는 그때 필요한 것들을 순서대로 만들어준다.
 */

export interface CopyPackage {
  title: string
  /** 안내문·이미지 지시문을 뺀 순수 본문 — 문단 하나가 한 줄이다 */
  body: string
  /** 모바일에서 읽히도록 마디에서 줄을 끊은 본문 (화면의 기본값) */
  bodyMobile: string
  /** 서식을 함께 붙여넣기 위한 HTML — 줄바꿈·구분선·인용구가 들어간다 */
  bodyHtml: string
  /** 본문을 소제목·문단으로 쪼갠 것 (원래 순서) */
  blocks: BodyBlock[]
  /** 이미지 몇 번째 자리에 무엇을 올려야 하는지 */
  imagePlan: { order: number; slot: string; description: string; fileName: string; altText: string }[]
  /**
   * `#태그 #태그` 한 줄 — **보여주기용이다. 태그 칸에 붙이면 한 덩어리가 된다.**
   *
   * 태그 칸은 `#` 도 공백도 **글자로** 받는다. 그래서 이 형태를 붙이면 통째로 태그 하나가
   * 된다 (회원이 실제로 겪었다: `#쌍용동헬스장,MTO피트니…`). 붙여넣기용은 아래 `tagsPlain`.
   */
  tags: string
  /**
   * 태그 칸에 붙이는 형태 — `#` 없이, 공백 없이, 쉼표로만.
   *
   * ── 실측: 네이버 태그 칸은 한 번에 안 받는다 (2026-08-26) ─────
   * 회원이 세 가지를 직접 붙여 보고 알려줬다. **전부 한 덩어리로 들어갔다.**
   *   ① `#쌍용동헬스장 #MTO피트니스쌍용점 …`  (# + 공백)
   *   ② `#쌍용동헬스장, #MTO피트니스 쌍용점, …` (# + 쉼표 + 공백)
   *   ③ `쌍용동헬스장,쌍용동헬스장PT,…`        (**순수 쉼표** — "순수 쉼표도 안나눠져")
   *
   * 그러니 이건 우리가 담는 글자의 문제가 아니라 **입력칸의 성격**이다. 네이버 「태그 편집」은
   * Enter 로 한 개씩 확정하는 칩 칸이고, 붙여넣기는 키 입력이 아니라서 확정되지 않는다.
   * (회원이 예로 든 유튜브 태그 칸은 쉼표를 읽는 글자 칸이라 나뉜다 — 도구가 아니라 칸이
   * 다른 것이다.)
   *
   * **그래서 「한 번에 붙이기」 버튼을 다시 만들지 않는다.** 세 번 만들고 세 번 다 회원이
   * 안 된다고 했다. 이 값은 「무엇이 복사되는지」를 화면에 보여주고, 한 덩어리로 들어가도
   * 그 자리에서 손으로 고칠 수 있게 두는 용도로만 쓴다.
   *
   * 우리 페이지에서 네이버 입력칸에 키를 대신 눌러줄 수는 없다 — 그건 계정 자동화이고
   * 이 앱이 처음부터 하지 않기로 한 영역이다.
   */
  tagsPlain: string
  /** 하나씩 붙여넣을 수 있게 정리한 태그 (공백 제거 · 중복 제거) */
  tagList: string[]
  /** 우리가 손본 태그 (무엇을 왜 바꿨는지 화면에 보여준다) */
  tagFixes: { from: string; to: string }[]
  /**
   * **본문에서 순서대로 나오는 핵심 문구** (2026-08-28 회원 요청).
   *
   * "정보글 작성하면 본문에 첫째, 둘째 같은 순서로 나오는 핵심 문구를 발행패키지에서
   * 따로 추려주면 좋겠어."
   *
   * 「첫째」·「둘째」·「①」·「1)」로 시작하는 마디를 순서 그대로 뽑는다. 정보글은 순서가
   * 곧 뼈대라, 그것만 모아 두면 **요약 상자·댓글 고정·다음 글 소재**로 그대로 쓸 수 있다.
   *
   * **지어내지 않는다** — 본문에 없는 것은 안 나온다. 없으면 빈 배열이고 화면도 그 칸을
   * 만들지 않는다.
   *
   * ── 부연설명까지 함께 (2026-08-28 회원 추가 요청) ─────────────
   * "아니 문구만 나오면 안되고 그 밑에 부연설명도 같이 나오게 해줘."
   *
   * 첫 문장만 남기니 「두 번째는 큰 근육부터 순서대로 갑니다」로 끝나서, 정작 **무엇을 어떻게
   * 하라는지가 잘려 나갔다.** 순서만 있고 알맹이가 없으면 요약으로 쓸 수가 없다.
   * 그래서 표시가 붙은 첫 문장은 `text`, 그 뒤에 딸린 설명은 `detail` 로 함께 준다.
   *
   * ── 그리고 **끝까지** (2026-08-28, 같은 날 다시) ────────────────
   * "내용이 전체적으로 안나와 핵심 문구와 관련된 전체 문장이 나오게 해줘."
   *
   * 그 다음 판은 「다음 한 문단까지, 220자까지」였다. 설명이 여러 문단에 걸쳐 있으면 앞쪽만
   * 나오고 뒤가 잘렸다 — 화면에 「…자료를 보면」에서 끊긴 줄이 그것이다. 이제 **다음 순서
   * 표시(또는 소제목·이미지)를 만날 때까지** 이어 붙이고, 길이로는 자르지 않는다.
   */
  keyPoints: KeyPoint[]
  /** 뽑아낸 목록이 어긋난 자리 — 비어 있으면 성한 목록이다 (2026-08-30) */
  keyPointFlaws: string[]
  checklist: { label: string; detail?: string }[]
}

/** 네이버 태그 한 개 최대 글자수 (넘으면 잘리지 않고 경고만 한다) */
export const TAG_MAX_LEN = 25
/** 네이버 태그 최대 개수 */
export const TAG_MAX_COUNT = 30

/**
 * 태그 하나를 네이버가 받는 형태로 정리한다.
 *
 * **공백이 들어간 태그는 안 먹힌다.** 회원이 「#MTO피트니스 쌍용점」이 든 목록을 붙여넣고
 * 태그가 안 걸린다고 했다 — 태그 안의 공백은 태그를 끊는 자리라서, 「MTO피트니스」와
 * 「쌍용점」으로 갈리거나 아예 버려진다. 그래서 태그 안의 공백은 **붙여** 쓴다
 * (「쌍용동 헬스장」 → 「쌍용동헬스장」). 검수도 이미 공백을 뺀 형태로 태그를 맞춰본다.
 *
 * 한글·영문·숫자·밑줄만 남긴다. 가운뎃점·마침표 같은 기호는 태그에서 지운다.
 */
export function normalizeTag(raw: string): string {
  return (raw ?? '')
    .replace(/^#+/, '')
    .replace(/\s+/g, '')
    .replace(/[^0-9A-Za-z가-힣ㄱ-ㅎㅏ-ㅣ_]/g, '')
}

/** 붙여넣을 본문의 한 덩어리 */
export interface BodyBlock {
  /** rule = 구분선 (모델이 `---` 로 써 놓은 줄) */
  kind: 'heading' | 'para' | 'rule'
  /** 빈 줄로 나뉘는 덩어리들. 덩어리 안의 줄은 줄바꿈으로 붙는다 (소제목은 [[한 줄]]) */
  groups: string[][]
}

/**
 * 줄을 끊는 길이.
 *
 * 회원이 손으로 고친 결과물을 기준으로 잡았다 — 한 줄이 **15~25자**, 이어지는 마디에서
 * 끊고, 두세 줄마다 빈 줄. 처음엔 80자로 끊었는데 그건 데스크톱 기준이었고, 모바일에서는
 * 그 한 줄이 화면 세 줄이 되어 여전히 덩어리로 보였다.
 *
 * **가독성 판단이지 순위 규칙이 아니다.** 실측(160편)에서 문단 **길이 자체는** 순위와
 * 무관했다 (1~3위 중간값 142자 · 4~6위 154자). 다만 **덩어리로 쓴 글은 불리했다** —
 * 문단 3~5개 5편 중 1~3위 0%, 문단 10개 이상은 35~36%, 가장 긴 문단이 본문의 40%를
 * 넘는 4편도 1~3위 0%였다. 끊어 붙이면 그 유리했던 쪽으로 간다.
 */
/*
 * ─── 글자수가 아니라 **너비**로 잰다 (2026-08-31 회원 요청) ──────────
 *
 * 회원: "모바일 한줄에 들어가는 글자수를 확인해서 줄바꿈을 다시 점검해주면 좋겠어."
 *
 * 회원이 실제로 붙여넣은 화면을 받아 한 줄씩 재봤다. 이 글(post_0uojwyob2l)에서
 * **줄이 넘친 것과 안 넘친 것**이 이렇게 갈렸다 (한글 한 자를 1 로 본 너비):
 *
 *   넘쳤다  24.70  오늘은 여자근육량늘리기에 대해 정리해 보려고 합니다.   ← 「니다.」만 다음 줄로
 *   안 넘침 22.72  부위별로 어떤 순서·자세로 접근하면 되는지입니다.
 *   안 넘침 22.68  제가 이 글에서 정리해 드릴 건 여자근육량늘리기와
 *   안 넘침 21.58  '이러다 다리만 두꺼워지는 거 아니야?' 하는 걱정
 *
 * **글자수로는 이걸 가를 수 없다.** 넘친 줄이 29자인데 안 넘친 줄도 27~28자다.
 * 한글은 한 자가 네모 하나를 다 쓰고 공백·마침표·영문은 그 절반도 안 되기 때문이다 —
 * 공백이 많은 줄은 글자수가 같아도 훨씬 짧다. 그래서 너비로 잰다.
 */
const CHAR_WIDTH = { hangul: 1, latin: 0.5, digit: 0.55, space: 0.28, other: 0.3 }
/** 한글·한자·전각 기호는 네모 하나를 다 쓴다 */
const FULL_WIDTH_RE = /[가-힣ㄱ-ㅎㅏ-ㅣ一-鿿ぁ-ヿ！-～]/

/**
 * 한 줄의 **너비** — 한글 한 자를 1 로 본다.
 *
 * `**` 는 서식으로 바뀌어 사라지므로 세지 않는다 (강조가 든 줄만 짧게 끊기던 원인이었다).
 *
 * 정확한 픽셀 값이 아니라 **비율 어림**이다. 폰트·기기·글자 크기 설정에 따라 실제 폭은
 * 달라지므로, 아래 상한에 여유를 두는 쪽으로 쓴다.
 */
export function lineWidth(s: string): number {
  let w = 0
  for (const ch of (s ?? '').replace(/\*\*/g, '')) {
    if (FULL_WIDTH_RE.test(ch)) w += CHAR_WIDTH.hangul
    else if (ch === ' ') w += CHAR_WIDTH.space
    else if (ch >= '0' && ch <= '9') w += CHAR_WIDTH.digit
    else if (/[A-Za-z]/.test(ch)) w += CHAR_WIDTH.latin
    else w += CHAR_WIDTH.other
  }
  return w
}

/**
 * 줄 상한 — **한글 기준 23자쯤.**
 *
 * 위에서 잰 값으로는 회원 기기의 한 줄이 22.72 와 24.70 사이에서 끊긴다. 그 안쪽으로
 * 잡되 딱 붙이지는 않는다 — 기기와 글자 크기 설정에 따라 폭이 달라지고, 줄이 조금 짧은
 * 것은 눈에 안 띄지만 「니다.」만 다음 줄로 넘어가는 것은 바로 보인다.
 */
export const LINE_MAX = 23
/** 이 너비는 채우고 나서 끊는다 — 너무 이르게 끊으면 줄이 토막난다 */
export const LINE_MIN = 12
/**
 * **쉼표 뒤에서는 더 짧아도 끊는다** (2026-08-31 회원 요청: "가독성 좋게 좀더 바꿔줘").
 *
 * 쉼표는 마디가 끝나는 가장 또렷한 자리다. 그런데 `LINE_MIN` 을 그대로 적용하면
 * 「잘못 알려진 부분과,」(8.9)가 짧아서 못 끊고 다음 마디와 한 줄로 붙는다 —
 * 「… 부분과, 부위별로 어떤 순서·자세로」처럼 두 마디가 한 줄에 섞인다.
 */
const COMMA_MIN = 8
/**
 * 이만큼도 안 남으면 끊지 않는다 — 한두 낱말만 다음 줄로 떨어지는 것을 막는다.
 *
 * 2026-08-31 에 6 → 8 로 올렸다. 6 으로는 「자극을 확실히 주는 방식으로」 / 「바꿔야
 * 합니다.」(6.6)가 통과했는데, 회원이 짚은 것이 바로 그 모양이다 — 마지막 줄에 서술어만
 * 덜렁 남는 것.
 */
const ORPHAN_MIN = 8
/** 빈 줄 없이 이어 붙일 최대 줄 수 · 문장 수 */
const GROUP_MAX_LINES = 4
const GROUP_MAX_SENTENCES = 2

function slug(s: string): string {
  return s
    .replace(/\s+/g, '-')
    .replace(/[^0-9A-Za-z가-힣-]/g, '')
    .slice(0, 40)
}

/**
 * 이 낱말 뒤에서 줄을 끊어도 되는가.
 *
 * 글자수로만 끊으면 「제가 8월 들어서 꼭 여쭤보는 / 게 있어요」처럼 마디 중간에서
 * 잘린다. 회원이 손으로 고칠 때는 **이어지는 마디 끝**에서 끊었다 — 쉼표, 연결어미
 * (~고 ~며 ~면 ~다가 ~서), 조사(~한테 ~까지 ~부터).
 *
 * 낱말만 보는 판정이라 「순서」처럼 ~서로 끝나는 명사에서도 끊길 수 있다. 그건 줄이
 * 조금 짧아지는 정도의 문제이고, 마디 중간에서 잘리는 것보다 낫다.
 */
function breakable(word: string): boolean {
  if (/[,·;:]$/.test(word)) return true
  const w = word.replace(/["'”’\)\]】]+$/, '')
  return /(?:고|며|면|서|야|다가|는데|지만|니까|든지|한지|는지|인지|을지|까지|부터|한테|에게|에서|으로|처럼|보다|라며|자며|거나|어도|아도|해도)$/.test(w)
}

/**
 * **줄 맨 앞에 홀로 올 수 없는 말** (2026-08-31 회원 요청).
 *
 * 회원: "가독성 좋게 좀더 바꿔줘. 예를들어 정리해는 보려고 합니다랑 한문장이면 좋을거
 * 같아. 이런식으로 다듬어줘."
 *
 * 회원이 본 화면이 이랬다:
 *
 *   오늘은 여자근육량늘리기에 대해 정리해
 *   보려고 합니다.
 *
 * 「정리해 보려고 합니다」는 **한 덩어리로 읽히는 말**인데 그 한복판이 갈렸다. 너비만
 * 보고 낱말 단위로 끊으니 그렇게 된다 — 마디 끝을 찾는 `breakable` 도 「보려고」의 「고」를
 * 좋은 자리로 보므로 도움이 안 된다 (「보려고」 뒤에 붙는 「합니다」가 혼자 남는다).
 *
 * ── 무엇을 붙이나 ────────────────────────────────────────────
 * **혼자서는 뜻이 서지 않는 말**이다. 세 갈래뿐이다:
 *   ① 종결 서술어만 남은 것 — 「합니다」·「입니다」·「됩니다」
 *   ② 보조용언 — 「보려고」·「주세요」·「드립니다」·「않습니다」
 *   ③ 의존명사 — 「것」·「건」·「게」·「수」·「데」·「때문에」
 * 여기에 「~와/과」 뒤에 붙어 한 덩어리가 되는 「관련해서」·「함께」를 더했다.
 *
 * **낱말 전체가 목록에 있을 때만** 붙인다 (앞자리만 맞으면 안 된다) — 「보고」를 앞자리로
 * 잡으면 「보고서」가 딸려 붙는다.
 *
 * 이건 **가독성 판단이다.** 순위와 재본 적 없다. 다만 회원이 눈으로 짚은 것이고, 붙여서
 * 나쁠 일은 없다 (줄이 길어지면 그 앞에서 끊긴다).
 */
const GLUE_TO_PREV = new Set([
  // ① 종결 서술어만 남은 것
  '합니다', '한다', '해요', '해서', '했습니다', '했어요', '하죠', '하시면', '하세요',
  '입니다', '이다', '예요', '이에요', '였습니다', '아닙니다', '아니에요',
  '됩니다', '된다', '되는지', '되는지입니다', '되면', '되고', '돼요', '될까요', '되어',
  '있습니다', '있어요', '있고', '있는', '있을', '있으니', '있어서', '있어', '있죠', '있는데',
  '없습니다', '없어요', '없는', '없어서', '없어', '없죠', '없는데',
  '같아요', '같습니다', '같은', '맞습니다', '맞아요', '좋습니다', '좋아요', '편합니다', '편해요',
  // ② 보조용언
  '보다', '보고', '보게', '보려고', '보세요', '보시면', '보면', '봅니다', '봤습니다',
  '주세요', '주시면', '줍니다', '주면', '주고', '드립니다', '드릴', '드려', '드리고', '드릴게요',
  '싶습니다', '싶어요', '싶은', '싶고', '않습니다', '않아요', '않고', '않는', '않으면', '마세요',
  '버려', '버렸습니다', '둡니다', '두고', '놓고', '놨습니다', '가세요', '오세요',
  // ③ 의존명사 — 혼자서는 뜻이 없다
  '것', '것이', '것을', '것은', '건', '게', '거', '수', '수가', '줄', '바', '데', '뿐',
  '채', '만큼', '대로', '듯', '척', '양', '정도', '때문', '때문에', '따름', '터', '셈',
  // ④ 「~와/과」 뒤에서 한 덩어리가 되는 말
  '관련해서', '관련된', '관련하여', '함께', '같이', '달리', '비슷하게', '마찬가지로',
])

/** 낱말 뒤에 붙은 문장부호를 떼고 본다 — 「합니다.」도 「합니다」다 */
function gluesToPrev(word: string): boolean {
  return GLUE_TO_PREV.has(word.replace(/[.,!?;:)\]}"'”’…·]+$/u, ''))
}

/**
 * 낱말을 **함께 읽히는 묶음**으로 뭉친다 — 줄은 이 묶음 사이에서만 끊는다.
 *
 * 묶음 하나가 상한보다 넓어지는 경우도 있다 (「여자근육량늘리기와 관련해서」). 그때는
 * 그 묶음이 한 줄을 다 쓰게 되는데, 어정쩡하게 갈리는 것보다 낫다.
 */
export function readingChunks(words: string[]): string[] {
  const out: string[] = []
  for (const w of words) {
    if (out.length && gluesToPrev(w)) out[out.length - 1] += ` ${w}`
    else out.push(w)
  }
  return out
}

/**
 * 문장 하나를 마디에서 끊어 줄들로 만든다 (낱말은 자르지 않는다).
 *
 * **낱말이 아니라 「함께 읽히는 묶음」 단위로 끊는다** (2026-08-31 — `GLUE_TO_PREV` 주석).
 * 줄을 묶음 목록으로 들고 다니는 이유는 아래 `unorphan` 에 있다 — 낱말로 돌려주면 거기서
 * 묶음이 다시 갈린다 (실제로 「배치하는 게」가 「배치하는」 / 「게 기본입니다.」로 갈렸다).
 */
export function clauseLines(sentence: string): string[] {
  const chunks = readingChunks(sentence.trim().split(/\s+/).filter(Boolean))
  const lines: string[][] = []
  let cur: string[] = []
  const widthOf = (parts: string[]) => lineWidth(parts.join(' '))

  for (let i = 0; i < chunks.length; i++) {
    const w = chunks[i]
    // 넘칠 묶음은 **붙이기 전에** 다음 줄로 내린다 (붙인 뒤 끊으면 그 줄이 상한을 넘는다)
    if (cur.length && widthOf([...cur, w]) > LINE_MAX) {
      lines.push(cur)
      cur = [w]
    } else {
      cur.push(w)
    }
    const rest = chunks.slice(i + 1).join(' ')
    const text = cur.join(' ')
    /*
     * 따옴표가 열린 채로는 끊지 않는다.
     *
     * 「"작년에도 이맘때 등록하려고 / 하셨죠?" 하면」처럼 인용 한복판이 갈리면 누가 한 말인지
     * 눈으로 안 잡힌다. 회원이 손으로 고칠 때도 인용은 통째로 한 줄에 뒀다.
     */
    const inQuote = ((text.match(/["“”]/g) ?? []).length % 2) === 1
    /*
     * **굵게 표시가 열린 채로도 끊지 않는다.**
     *
     * 회원이 붙여넣은 결과에 별표가 그대로 박혀 있었다:
     *   **대한비만학회가 일반인 홈페이지 자료에서
     *   밝힌 내용을 보면**, 운동은 …
     * 줄바꿈이 `**` 짝 사이를 갈랐고, 서식으로 바꾸는 자리에서는 한 줄씩만 보니 짝을 못
     * 찾아 별표가 살아남았다. 따옴표와 같은 처리를 해야 한다.
     */
    const inBold = ((text.match(/\*\*/g) ?? []).length % 2) === 1
    /*
     * 마디 끝이면 끊는다 — 남은 게 한두 낱말뿐이면 그냥 데리고 간다.
     * 묶음의 **마지막 낱말**로 본다 (「정리해 보려고 합니다」의 판정은 「합니다」로 한다).
     */
    const tail = w.split(' ').pop() as string
    const min = /[,·;:]$/.test(tail) ? COMMA_MIN : LINE_MIN
    if (rest && !inQuote && !inBold && lineWidth(text) >= min && breakable(tail) && lineWidth(rest) >= ORPHAN_MIN) {
      lines.push(cur)
      cur = []
    }
  }
  if (cur.length) lines.push(cur)
  return unorphan(lines).map((parts) => parts.join(' '))
}

/**
 * **마지막 줄이 토막이면 앞 줄에서 묶음을 하나 내려 준다** (2026-08-31).
 *
 * 상한을 낮추자 「… 정리해 보려고」 / 「합니다.」처럼 마지막 줄에 네 글자만 남는 줄이
 * 생겼다. 회원이 처음 보내온 화면에서 눈에 걸린 것이 바로 그 모양이다 — 넘쳐서 갈린
 * 것이든 우리가 끊은 것이든, 보는 사람에게는 같은 흠이다.
 *
 * 마디 끝에서 끊는 길에는 이미 `ORPHAN_MIN` 이 있는데, **상한을 넘겨 어쩔 수 없이
 * 갈리는 길**에는 없었다. 그 자리를 여기서 메운다.
 *
 * **낱말이 아니라 묶음을 내린다.** 낱말로 내리면 「배치하는 게」의 「게」만 떨어져서
 * 「게 기본입니다.」로 줄이 시작한다 — 고치려던 것과 똑같은 흠이 다시 생긴다.
 *
 * 내렸다가 짝이 갈리면(`**` 강조가 두 줄로) 되돌린다 — 별표가 글에 박히는 것이 짧은
 * 줄보다 나쁘다.
 */
function unorphan(lines: string[][]): string[][] {
  const out = lines.map((l) => [...l])
  for (let i = 0; i < 3; i++) {
    if (out.length < 2) break
    const last = out[out.length - 1]
    if (lineWidth(last.join(' ')) >= ORPHAN_MIN) break
    const prev = out[out.length - 2]
    if (prev.length < 2) break
    const moved = prev[prev.length - 1]
    const nextLine = [moved, ...last]
    const odd = (t: string) => ((t.match(/\*\*/g) ?? []).length % 2) === 1
    const prevText = prev.slice(0, -1).join(' ')
    const nextText = nextLine.join(' ')
    // 짝이 갈리거나 상한을 넘으면 손대지 않는다
    if (odd(prevText) || odd(nextText) || lineWidth(nextText) > LINE_MAX) break
    prev.pop()
    out[out.length - 1] = nextLine
  }
  return out
}

/**
 * 문단 하나를 「빈 줄로 나뉘는 덩어리들」로 만든다.
 *
 * 회원이 손으로 고친 글은 두세 줄마다 빈 줄이 있었다. 한 문장이 길어서 네 줄이 되면
 * 그 문장 하나가 한 덩어리다.
 */
export function mobileGroups(paragraph: string): string[][] {
  const text = paragraph.trim()
  if (!text) return []
  const sentences = splitSentences(text)
  const list = sentences.length ? sentences : [text]

  const groups: string[][] = []
  let cur: string[] = []
  let sentences_in = 0
  for (const s of list) {
    const lines = clauseLines(s)
    if (cur.length && (sentences_in >= GROUP_MAX_SENTENCES || cur.length + lines.length > GROUP_MAX_LINES)) {
      groups.push(cur)
      cur = []
      sentences_in = 0
    }
    cur.push(...lines)
    sentences_in++
  }
  if (cur.length) groups.push(cur)

  /*
   * 글자가 하나라도 사라졌으면 원문을 그대로 돌려준다.
   *
   * `splitSentences` 는 길이 1 이하 조각을 버린다 (어미 통계에서는 맞는 처리다). 여기서는
   * 발행할 본문을 만들므로 한 글자도 없어져선 안 된다 — 못 끊는 게 지우는 것보다 낫다.
   */
  const squash = (s: string) => s.replace(/\s+/g, '')
  return squash(groups.flat().join(' ')) === squash(text) ? groups : [[text]]
}

/**
 * 마크다운 구분선 줄인가 — `---` · `***` · `___` · `- - -`.
 *
 * 회원이 붙여넣은 결과에 `---` 가 글자로 박혀 있었다. 모델이 마크다운 습관으로 쓴 것이고,
 * 우리는 소제목(`##`)과 이미지 지시문만 처리했으니 그대로 문단이 되어 나갔다.
 */
export function isRuleLine(line: string): boolean {
  return /^\s*(?:-\s*){3,}$|^\s*(?:\*\s*){3,}$|^\s*(?:_\s*){3,}$/.test(line)
}

/** `**` 를 잠깐 치워둘 자리표 — 굵게는 서식으로 살릴 것이라 여기서 건드리면 안 된다 */
const BOLD_KEEP = ' B '

/**
 * 네이버가 못 읽는 마크다운을 글자로 풀어놓는다 (순수 함수 — 테스트 대상).
 *
 * 회원 지적 — "아직도 마크다운 같은데 복사 붙여넣기 하면 제대로 반영이 안 돼."
 * 우리가 서식으로 살릴 수 있는 것은 **소제목(`##`)·굵게(`**`)·구분선** 세 개뿐이다.
 * 나머지 마크다운은 네이버에서 **글자로 박힌다.** 그래서 여기서 사람이 읽는 모양으로 푼다:
 *
 *   ![대체글](주소) → 버린다 (이미지는 회원이 직접 올린다)
 *   [글자](주소)     → 글자 (주소)
 *   `코드`          → 코드
 *   *기울임*        → 기울임        (밑줄 `_` 은 건드리지 않는다 — 아이디에 들어간다)
 *   > 인용          → 인용
 *   - 목록          → · 목록
 */
export function inlineMarkdown(line: string): string {
  let s = line.replace(/\*\*/g, BOLD_KEEP)
  s = s.replace(/!\[[^\]\n]*\]\([^)\n]*\)/g, '')
  s = s.replace(/\[([^\]\n]+)\]\(([^)\n]+)\)/g, '$1 ($2)')
  s = s.replace(/`{1,3}([^`\n]+)`{1,3}/g, '$1')
  // 한쪽만 있는 별표는 그대로 둔다 (곱하기·각주로 쓴 것일 수 있다)
  s = s.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?;:]|$)/g, '$1$2')
  s = s.replace(/^\s*>\s?/, '')
  s = s.replace(/^\s*[-*+]\s+/, '· ')
  return s.split(BOLD_KEEP).join('**').trim()
}

/** 목록으로 쓴 줄인가 — `- ` · `* ` · `+ ` 로 시작하는 줄 */
function isListLine(line: string): boolean {
  return /^\s*[-*+]\s+\S/.test(line) && !isRuleLine(line)
}

/** 정리된 본문을 소제목·문단·구분선으로 쪼갠다 (이미지·영상 지시문은 버린다) */
export function toBlocks(cleaned: string): BodyBlock[] {
  const blocks: BodyBlock[] = []
  let buf: string[] = []
  /*
   * 목록 줄은 따로 모은다.
   *
   * 안 그러면 줄들이 한 문단으로 뭉쳐서 가운뎃점이 줄 한복판에 붙는다 — 실제로 이렇게 나왔다:
   *   · 유산소 15분부터 시작하세요 ·
   *   세 세트 사이에는 호흡만 고르세요
   * 사람이 네이버에 목록을 쓸 때는 빈 줄 없이 **한 줄에 한 항목**이다. 그대로 만든다.
   */
  let listBuf: string[] = []
  const flushList = () => {
    if (!listBuf.length) return
    const lines = listBuf.flatMap((item) => clauseLines(item))
    listBuf = []
    blocks.push({ kind: 'para', groups: [lines] })
  }
  const flush = () => {
    flushList()
    const joined = buf.join(' ').trim()
    buf = []
    if (joined) blocks.push({ kind: 'para', groups: mobileGroups(joined) })
  }

  for (const raw of cleaned.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || /^\[(?:이미지|영상)\s*:?[^\]]*\]$/.test(line)) {
      flush()
      continue
    }
    if (isListLine(line)) {
      // 앞에 흐르던 문단이 있으면 먼저 닫는다 (목록은 그 문단에 섞이지 않는다)
      const joined = buf.join(' ').trim()
      buf = []
      if (joined) blocks.push({ kind: 'para', groups: mobileGroups(joined) })
      listBuf.push(inlineMarkdown(line))
      continue
    }
    flushList()
    // 구분선을 문단으로 만들지 않는다 — 서식으로 바꿔서 낸다
    if (isRuleLine(line)) {
      flush()
      // 소제목 위아래 구분선과 겹치지 않게 (인용구 소제목이 이미 선을 두 줄 낸다)
      if (blocks[blocks.length - 1]?.kind !== 'rule') blocks.push({ kind: 'rule', groups: [] })
      continue
    }
    const heading = line.match(/^#+\s*(.+)$/)
    if (heading) {
      flush()
      blocks.push({ kind: 'heading', groups: [[inlineMarkdown(heading[1].trim())]] })
      continue
    }
    const text = inlineMarkdown(line)
    if (text) buf.push(text)
  }
  flush()
  // 맨 앞·맨 뒤 구분선은 버린다 (글 시작과 끝에 선만 남는다)
  while (blocks[0]?.kind === 'rule') blocks.shift()
  while (blocks[blocks.length - 1]?.kind === 'rule') blocks.pop()
  return blocks
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * 굵게 표시를 서식으로 바꾼다 (`**말**` → `<strong>말</strong>`).
 *
 * 회원 지적 — "**이 붙은 게 있어. 이게 아마 서식 굵은 글자 같은데 복사 붙여넣기 할 때
 * 반영이 안 돼." 반영이 안 되는 게 맞았다. 우리는 소제목(`##`)과 이미지 지시문만 처리하고
 * 별표는 그대로 내보냈다 — 네이버는 별표를 서식으로 안 읽으니 별표가 글에 박힌 채 발행된다.
 *
 * **반드시 이스케이프 뒤에** 부른다. 순서가 바뀌면 우리가 넣은 태그의 꺾쇠까지 escape 된다.
 */
function bold(escaped: string): string {
  return escaped.replace(BOLD_PAIR, '<strong>$1</strong>')
}

/**
 * 굵게 짝을 찾는 정규식 — **줄바꿈을 넘어간다.**
 *
 * `[^*\n]` 로 두었더니 줄바꿈으로 갈린 짝을 못 찾아 별표가 글에 박혀 나갔다 (회원 캡처).
 * 줄 단위가 아니라 **덩어리 단위**로 걸어야 한다. 길이를 300자로 묶어 둔 것은, 짝이 안
 * 맞는 별표 하나 때문에 글 전체가 한 덩어리로 묶여 사라지는 일을 막기 위해서다.
 */
const BOLD_PAIR = /\*\*([^*]{1,300}?)\*\*/g

/** 글자만 붙여넣을 때는 별표를 지운다 — 서식이 아니라 글자로 박히기 때문이다 */
export function stripBold(s: string): string {
  return (s ?? '').replace(BOLD_PAIR, '$1')
}

/** 소제목을 어떤 서식으로 낼지 */
export type HeadingStyle = 'quote' | 'bold'

const RULE = 'border:0;border-top:1px solid #dddddd;'

/**
 * 서식을 함께 붙여넣기 위한 HTML.
 *
 * 회원 요청 — 「붙여넣으면 줄바꿈·구분선·인용구가 자동으로 들어가게」. 네이버는 글쓰기
 * API 를 주지 않으니 우리가 쓸 수 있는 통로는 클립보드 하나다. `text/html` 을 함께 담으면
 * 서식이 같이 넘어간다 (h3 로 낸 소제목이 굵고 큰 글씨로 붙는 것은 회원 화면에서 확인됐다).
 *
 * 그래서 회원이 손으로 만들던 모양을 그대로 낸다:
 *
 *   구분선 → `<hr>`  ·  소제목 → `<blockquote>`  ·  줄바꿈 → `<br>`  ·  덩어리 → `<p>`
 *
 * **네이버가 이걸 자기 「구분선」·「인용구」 컴포넌트로 바꿔주는지는 확인할 방법이 없다.**
 * 그래서 태그에만 기대지 않고 선·굵기·여백을 인라인으로 박는다 — 컴포넌트로 안 바뀌어도
 * **보이는 모양은 남는다.** 인용구의 큰 따옴표 기호는 네이버 자기 스타일(라인&따옴표)에서만
 * 나오므로 우리가 만들 수 없다. 화면에 「원하면 그 줄에서 인용구 스타일만 바꾸세요」로 적어둔다.
 *
 * `bold` 는 도망갈 구멍이다. 붙여넣기가 이상하게 되는 환경에서 예전 모양(h3)으로 돌아갈 수 있게.
 */
export function blocksToHtml(blocks: BodyBlock[], style: HeadingStyle = 'quote'): string {
  /*
   * ─── 줄마다 문단 하나로 낸다 (2026-08-31 회원 지적) ────────────────
   *
   * 회원: "서식 복사해서 블로그에 붙여넣기 하면 줄바꿈이 안된채로 와."
   *
   * 앞 판은 덩어리 하나를 `<p>` 하나로 내고 그 안의 줄바꿈을 `<br />` 로 넣었다. 문법으로는
   * 맞는 HTML 인데, **네이버 에디터에는 「문단 안 줄바꿈」이라는 자리가 없다** — 붙여넣기를
   * 받으면 문단 단위로 자기 컴포넌트를 만들고 `<br>` 은 버린다. 그래서 우리가 애써 끊어
   * 놓은 줄이 다시 한 덩어리로 붙어 버렸다.
   *
   * 그래서 **줄 하나 = 문단 하나**로 낸다. 버려질 수 있는 표시(`<br>`)에 기대지 않고
   * 확실히 남는 표시(블록 요소)만 쓴다.
   *
   * **빈 줄도 문단으로 낸다.** 덩어리 사이 간격을 여태 `margin:0 0 26px` 로 줬는데, 네이버는
   * 붙여넣기에서 인라인 스타일을 떼는 경우가 많다 — 그러면 간격이 통째로 사라진다. 빈 문단
   * (`&nbsp;`)은 글자가 있으므로 지워지지 않고, 스타일이 살아 있든 없든 같은 모양이 된다.
   * 그래서 아래 여백 값은 0 으로 두고 간격은 빈 문단만으로 만든다 (둘 다 쓰면 두 배가 된다).
   */
  const LINE = 'font-size:16px;line-height:1.9;margin:0;'
  const out: string[] = []
  const blank = () => out.push(`<p style="${LINE}">&nbsp;</p>`)

  const para = (groups: string[][]) => {
    groups.forEach((g, i) => {
      if (i) blank()
      /*
       * **굵게 짝은 줄을 붙인 뒤에 찾는다.** 줄마다 따로 찾으면 줄바꿈으로 갈린 짝을
       * 놓친다 (그래서 별표가 글에 박혀 나간 적이 있다). 찾은 뒤에 다시 줄로 자르고,
       * 자르는 자리를 강조가 넘어가면 줄마다 닫고 다시 연다 — 문단을 넘는 태그는
       * 붙여넣기에서 깨진다.
       */
      for (const line of splitKeepingBold(bold(g.map((l) => esc(l)).join(LINE_SPLIT))))
        out.push(`<p style="${LINE}">${line}</p>`)
    })
  }

  const heading = (text: string) => {
    if (style === 'bold') {
      out.push(`<h3 style="font-size:19px;font-weight:700;line-height:1.6;margin:0;">${bold(esc(text))}</h3>`)
      return
    }
    /*
     * 인용구는 그대로 `<blockquote>` 다 — 블록 요소라 줄바꿈 문제와 상관이 없고,
     * 화면의 「구분선 + 인용구」라는 이름도 그 말대로여야 한다.
     */
    out.push(`<hr style="${RULE}margin:0;" />`)
    out.push(
      `<blockquote style="border:0;margin:0;padding:0;font-size:19px;font-weight:700;line-height:1.6;">${bold(esc(text))}</blockquote>`
    )
    out.push(`<hr style="${RULE}margin:0;" />`)
  }

  blocks.forEach((b, i) => {
    // 블록 사이에도 빈 줄 — 글자만 복사(blocksToText)와 같은 모양이 되게 한다
    if (i) blank()
    if (b.kind === 'heading') heading(b.groups[0]?.[0] ?? '')
    else if (b.kind === 'rule') out.push(`<hr style="${RULE}margin:0;" />`)
    else para(b.groups)
  })

  return out.join('\n')
}

/** 줄을 붙일 때 쓰는 임시 표시 — 본문에 나올 수 없는 글자여야 한다 */
const LINE_SPLIT = '\u0000'

/**
 * 붙여 둔 줄을 다시 자른다 — **강조가 자리를 넘어가면 줄마다 닫고 다시 연다.**
 *
 * `<strong>` 이 문단 두 개에 걸치면 붙여넣기에서 태그가 깨진다 (한쪽만 열린 채 남는다).
 * 그래서 자르는 자리에서 닫고 다음 줄에서 다시 여는 쪽을 택했다 — 보이는 모양은 같다.
 */
function splitKeepingBold(joined: string): string[] {
  let open = false
  return joined.split(LINE_SPLIT).map((piece) => {
    const head = open ? '<strong>' : ''
    const opens = (piece.match(/<strong>/g) ?? []).length
    const closes = (piece.match(/<\/strong>/g) ?? []).length
    open = (open ? 1 : 0) + opens - closes > 0
    return `${head}${piece}${open ? '</strong>' : ''}`
  })
}

/**
 * 글자만 붙여넣을 때의 본문 — 덩어리 안은 줄바꿈, 덩어리 사이는 빈 줄.
 *
 * 소제목 위아래에 구분선 글자(───)를 넣는다. 서식이 안 넘어가는 환경에서도 소제목 자리가
 * 눈에 보이고, 네이버에서 그 줄을 지우고 구분선 서식을 넣기만 하면 된다.
 */
export function blocksToText(blocks: BodyBlock[], rule = true): string {
  return stripBold(
    blocks
      .map((b) =>
        b.kind === 'rule'
          ? '───────────────'
          : b.kind === 'heading' && rule
            ? `───────────────\n${b.groups[0]?.[0] ?? ''}\n───────────────`
            : b.kind === 'heading'
              ? (b.groups[0]?.[0] ?? '')
              : b.groups.map((g) => g.join('\n')).join('\n\n')
      )
      .join('\n\n')
  )
}

export function buildCopyPackage(post: Post, store?: Store): CopyPackage {
  const cleaned = stripGuides(post.body)
  const parsed = parseBody(cleaned)

  /*
   * 이미지 지시문·소제목 마크업·구분선·나머지 마크다운을 뺀 본문.
   *
   * 이 값이 「그대로 복사」의 내용이다. 여기에 마크다운이 남으면 네이버에 글자로 박힌다 —
   * 회원이 `---` 와 `**` 가 박힌 화면을 두 번 캡처해 보냈다.
   */
  const bodyRaw = cleaned
    .split(/\r?\n/)
    .filter((l) => !/^\s*\[(?:이미지|영상)\s*:?[^\]]*\]\s*$/.test(l) && !isRuleLine(l))
    .map((l) => inlineMarkdown(l.replace(/^\s*#+\s*/, '')))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  // 「그대로」로 붙여넣을 때도 별표는 글자로 박힌다 — 여기서도 뗀다
  const body = stripBold(bodyRaw)

  /*
   * **핵심 문구를 뽑을 때는 소제목 마크업이 살아 있어야 한다** (2026-08-28 회원 지적:
   * "세번째가 왜 이렇게 길어").
   *
   * 위 `body` 는 붙여넣기용이라 `##` 를 떼어 낸다. 그걸 그대로 훑었더니 소제목이 그냥
   * 문단으로 보여서, 세 번째 항목이 **「흔히 하는 실수들」·「오늘부터 시작한다면」까지
   * 통째로 삼켰다.** 항목 하나가 글의 절반이 됐다.
   *
   * 그래서 여기서는 `##`·`[이미지: …]` 를 남긴 판을 따로 만든다 — 그 줄들이 「여기서
   * 멈춰라」는 표시다. 인라인 마크업(**굵게**)만 떼어 화면에 별표가 박히지 않게 한다.
   */
  const bodyForPoints = cleaned
    .split(/\r?\n/)
    .map((l) => (/^\s*#+\s/.test(l) ? l : stripBold(inlineMarkdown(l))))
    .join('\n')
  const points = keyPointsOf(bodyForPoints)

  const blocks = toBlocks(cleaned)
  const reviewUrl = placeReviewUrl(store?.placeId)

  const localKw = post.localKeyword || post.mainKeyword
  const imagePlan = parsed.images.map((desc, i) => ({
    order: i + 1,
    slot: i === 0 ? '대표이미지 (제목 바로 아래)' : `${parsed.headings[i - 1] ?? `${i}번째 구간`} 바로 위`,
    description: desc || '(설명 없음)',
    fileName: `${slug(localKw)}-${String(i + 1).padStart(2, '0')}.jpg`,
    altText: i === 0 ? `${post.mainKeyword} 대표 이미지` : `${localKw} ${desc || '시설'}`.slice(0, 60),
  }))

  /*
   * 태그를 정리해서 세 가지 형태로 낸다.
   *
   * 예전에는 `#` 만 붙여 한 줄로 줬는데, 그대로 네이버 태그 칸에 붙이면 안 걸린다.
   * 태그 칸은 한 칸에 하나씩 넣는 곳이고, 공백이 든 태그는 거기서 끊긴다.
   */
  const tagFixes: { from: string; to: string }[] = []
  const tagsClean: string[] = []
  for (const raw of post.tags) {
    const clean = normalizeTag(raw)
    if (!clean) continue
    if (clean !== raw.replace(/^#+/, '')) tagFixes.push({ from: raw.replace(/^#+/, ''), to: clean })
    // 공백을 붙이면 중복이 생길 수 있다 (「쌍용동 헬스장」 + 「쌍용동헬스장」)
    if (!tagsClean.includes(clean)) tagsClean.push(clean)
  }
  /*
   * **겹치는 태그를 빼던 것을 껐다** (2026-08-26 회원 요청: "이거 두개는 삭제해줘" — 화면의
   * 「겹치는 태그를 뺐습니다」 안내를 가리켰다).
   *
   * 한때 「쌍용동」처럼 긴 태그(「쌍용동헬스장」)에 통째로 들어 있는 것을 뺐다. 그 안내를
   * 지우면서 **빼는 것도 함께 껐다** — 안내만 지우고 빼기를 남기면 회원이 넣은 태그가
   * 조용히 사라진다. 이 저장소는 조용히 잘라내는 것을 하지 않는다.
   */
  const tagList = tagsClean
  const tags = tagList.map((t) => `#${t}`).join(' ')
  const tagsPlain = tagList.join(',')

  const checklist: { label: string; detail?: string }[] = [
    { label: '제목을 붙여넣고 30~40자인지 확인', detail: `현재 ${post.title.length}자` },
    {
      label: '대표이미지부터 순서대로 업로드',
      detail: `총 ${parsed.images.length}장 · 가로 800~1,200px · 500KB 이내 · 직접 촬영 원본만 (재사용 금지)`,
    },
    { label: '이미지 파일명·대체텍스트에 지역 키워드 넣기', detail: '아래 이미지 배치표의 파일명을 그대로 쓰면 됩니다' },
    {
      label: '본문은 「서식 포함 복사」로 붙여넣기',
      detail:
        '소제목이 굵고 큰 글씨로 함께 붙습니다. 붙인 뒤 소제목 줄을 눌러 네이버 「소제목」 서식으로 잡혀 있는지 한 번만 확인하세요 — 에디터 버전에 따라 일반 글씨로 붙을 수 있습니다',
    },
    /*
     * 모바일 확인을 체크리스트에 넣은 이유 — 회원이 데스크톱에서 만든 글을 모바일로 붙여넣고
     * 「문단 정리·가독성이 떨어진다」고 했다. 발행 전에 한 번 보게 하는 줄이 없었다.
     */
    {
      label: '모바일 미리보기로 문단 확인',
      detail:
        '한 덩어리로 보이는 문단이 있으면 그 자리에서 줄을 끊으세요. 문단 3~5개인 글은 관찰 160편에서 1~3위가 한 편도 없었고, 문단 10개 이상은 35%였습니다',
    },
    {
      label: '짧은 영상 1개 삽입 (10~20초)',
      detail: '관찰 6회 중 영상이 있는 글이 위에 있었다 — 유리 2 · 거꾸로 0. 편집 없이 세로로 찍은 것도 된다',
    },
    /*
     * 맞춤법을 사람 손으로 한 번 더 보게 한다.
     *
     * 앱에 검사 기능을 붙였지만 공식 API 가 아니라 자주 막힌다 (lib/naver/speller.ts).
     * 막혔을 때 이 줄이 없으면 아무도 안 본 채로 발행된다.
     */
    {
      label: '맞춤법·띄어쓰기 확인',
      detail:
        '작성 화면의 「맞춤법 · 띄어쓰기」로 먼저 보고, 「못 읽음」이 뜨면 네이버 맞춤법 검사기(검색창에 "맞춤법검사기")에 본문을 직접 붙여넣으세요. 상호명·기구 이름은 엉뚱한 제안이 나오므로 그대로 바꾸지 마세요',
    },
    /*
     * 태그 붙여넣기 방법을 적는다 — 회원이 `#태그 #태그` 한 줄을 태그 칸에 붙이고
     * 「태그가 안 먹힌다」고 했다. 태그 칸은 한 칸에 하나씩 넣는 곳이다.
     */
    {
      label: `해시태그 ${tagList.length}개 — 「태그 편집」 칸에 하나씩 붙이고 Enter`,
      detail:
        '태그 카드에서 태그를 눌러 복사한 뒤 붙이고 Enter 를 반복하세요. 네이버 태그 칸은 한 번에 여러 개를 받지 않습니다 (쉼표·줄바꿈 모두 확인했습니다). 태그 안에 공백이 있으면 거기서 끊기니 붙여 씁니다',
    },
    /*
     * 정보글은 팩트가 우선이다 (회원 요청 2026-08-10). 검수가 「연구에 따르면」과 효과 수치는
     * 잡지만, **틀린 사실**은 기계가 못 잡는다 — 발행 전에 사람이 한 번 봐야 하는 자리다.
     */
    ...(post.type === 'info'
      ? [
          {
            label: '숫자와 단정 문장 한 번 더 확인',
            detail:
              '시간·세트·분량처럼 우리가 안내하는 값은 맞는지, 「~합니다」로 단정한 문장이 정말 그런지 보세요. 확인이 안 되는 문장은 지우는 게 낫습니다 — 정보글은 이 블로그의 신뢰를 쌓으려고 쓰는 글입니다',
          },
        ]
      : []),
    /*
     * 리뷰 링크는 발행 전에 사람이 한 번 열어봐야 한다 — 플레이스 주소는 업체가 이전하거나
     * 리뷰 탭 구조가 바뀌면 죽는다. 죽은 링크가 붙은 「실제 리뷰」는 없는 리뷰와 같아진다.
     */
    ...(reviewUrl && post.body.includes(reviewUrl)
      ? [
          {
            label: '플레이스 리뷰 링크가 열리는지 확인',
            detail: `${reviewUrl} — 인용한 문장이 그 화면에 실제로 보이는지까지 보세요. 링크가 죽으면 「실제 리뷰」가 확인 불가가 됩니다`,
          },
        ]
      : []),
    {
      label: '네이버 지도 위치 첨부',
      detail: store ? `${store.legalName} — ${store.location}` : '플레이스 연결로 지역 신호 확보',
    },
    { label: '발행 후 서치어드바이저에 색인 요청', detail: 'searchadvisor.naver.com → 웹페이지 수집 요청' },
    {
      label: '발행 후 24시간 내 자연 유입 확보',
      detail: '지인 공유는 괜찮지만 품앗이·매크로 공감/댓글은 절대 금지 (조작 트래픽 판정)',
    },
    { label: '제목을 그대로 검색해 노출되는지 확인', detail: '안 나오면 검색누락 — 발행을 늦추고 정보성 글로 회복 운영' },
    { label: '이 앱의 순위 추적에 (키워드 + 발행 URL) 등록', detail: '순위 변동을 매일 기록해둘 수 있습니다' },
  ]

  // 이벤트는 끝난다. 지난 조건이 발행된 글에 남아 있으면 신뢰를 잃으니 발행 전에 짚어준다.
  if (post.eventText) {
    checklist.unshift({
      label: '이벤트 조건·마감일이 지금도 맞는지 확인',
      detail: post.eventText.replace(/\s+/g, ' ').slice(0, 90),
    })
  }

  if (post.type === 'review' && post.sponsorship === 'sponsored') {
    checklist.unshift({
      label: '대가성(협찬) 표기 확인 — 법적 의무',
      detail: '본문 도입부 명시 + #협찬후기 또는 #광고 태그',
    })
  }

  return {
    title: post.title,
    body,
    bodyMobile: blocksToText(blocks),
    bodyHtml: blocksToHtml(blocks),
    blocks,
    imagePlan,
    tags,
    tagsPlain,
    tagList,
    tagFixes,
    keyPoints: points,
    keyPointFlaws: keyPointFlaws(points),
    checklist,
  }
}



/** 발행 기록 한 줄 (post-log.md 형식) — 스킬과 대화로 주고받을 때 쓴다 */
export function postLogLine(post: Post, store?: Store): string {
  const date = (post.publishedAt ?? post.createdAt).slice(0, 10)
  const typeLabel = post.type === 'promo' ? '[홍보글]' : post.type === 'info' ? '[정보글]' : '[후기글]'
  const headings = Array.from(post.body.matchAll(/^\s*##+\s*(.+)$/gm))
    .map((m) => m[1].trim())
    .join(' / ')

  const parts = [date, store?.name ?? post.storeId, typeLabel]

  if (post.type === 'info') {
    parts.push(`정보KW:${post.mainKeyword}`, `지역KW:${post.localKeyword ?? '-'}`)
    if (post.format) parts.push(`형식${post.format.slice(0, 2)}`)
    if (post.topicGroup) parts.push(`소재${post.topicGroup.slice(0, 1)}`)
  } else {
    parts.push(post.mainKeyword)
    if (post.introType) parts.push(`도입${post.introType.slice(0, 2)}`)
    if (post.angle) parts.push(`앵글:${post.angle}`)
    if (post.type === 'review') {
      parts.push(post.sponsorship === 'sponsored' ? '협찬' : post.sponsorship === 'own' ? '내돈내산' : '대가성미지정')
    }
  }

  parts.push(`소제목: ${headings || '-'}`)
  return parts.join(' | ')
}

/**
 * 핵심 문구는 `keypoints.ts` 로 옮겼다 (2026-08-30) — **검수도 같은 규칙을 봐야** 하는데
 * checker 가 여기(export)를 부르면 서로 부르는 꼴이 된다. 부르던 자리를 바꾸지 않으려고
 * 여기서 다시 내보낸다.
 */
export { keyPointsOf, keyPointFlaws, markNumber, type KeyPoint } from './keypoints'
