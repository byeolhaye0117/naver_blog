import type { Post, Store } from '@/lib/types'
import { stripGuides } from './templates'
import { parseBody, splitSentences } from './checker'

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
  tags: string
  checklist: { label: string; detail?: string }[]
}

/** 붙여넣을 본문의 한 덩어리 */
export interface BodyBlock {
  kind: 'heading' | 'para'
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
export const LINE_MIN = 14
export const LINE_MAX = 30
/** 이만큼도 안 남으면 끊지 않는다 (한두 낱말만 다음 줄로 떨어지는 것을 막는다) */
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

/** 문장 하나를 마디에서 끊어 줄들로 만든다 (낱말은 자르지 않는다) */
export function clauseLines(sentence: string): string[] {
  const words = sentence.trim().split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let cur = ''
  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    // 넘칠 낱말은 **붙이기 전에** 다음 줄로 내린다 (붙인 뒤 끊으면 그 줄이 상한을 넘는다)
    const joined = cur ? `${cur} ${w}` : w
    if (cur && joined.length > LINE_MAX) {
      lines.push(cur)
      cur = w
    } else {
      cur = joined
    }
    const rest = words.slice(i + 1).join(' ')
    /*
     * 따옴표가 열린 채로는 끊지 않는다.
     *
     * 「"작년에도 이맘때 등록하려고 / 하셨죠?" 하면」처럼 인용 한복판이 갈리면 누가 한 말인지
     * 눈으로 안 잡힌다. 회원이 손으로 고칠 때도 인용은 통째로 한 줄에 뒀다.
     */
    const inQuote = ((cur.match(/["“”]/g) ?? []).length % 2) === 1
    // 마디 끝이면 끊는다 — 남은 게 한두 낱말뿐이면 그냥 데리고 간다
    if (rest && !inQuote && cur.length >= LINE_MIN && breakable(w) && rest.length >= ORPHAN_MIN) {
      lines.push(cur)
      cur = ''
    }
  }
  if (cur) lines.push(cur)
  return lines
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

/** 정리된 본문을 소제목·문단으로 쪼갠다 (이미지·영상 지시문은 버린다) */
export function toBlocks(cleaned: string): BodyBlock[] {
  const blocks: BodyBlock[] = []
  let buf: string[] = []
  const flush = () => {
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
    const heading = line.match(/^##+\s*(.+)$/)
    if (heading) {
      flush()
      blocks.push({ kind: 'heading', groups: [[heading[1].trim()]] })
      continue
    }
    buf.push(line)
  }
  flush()
  return blocks
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
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
  const para = (groups: string[][]) =>
    groups
      .map((g) => `<p style="font-size:16px;line-height:1.9;margin:0 0 26px;">${g.map(esc).join('<br />')}</p>`)
      .join('\n')

  const heading = (text: string) =>
    style === 'bold'
      ? `<h3 style="font-size:19px;font-weight:700;line-height:1.6;margin:34px 0 14px;">${esc(text)}</h3>`
      : [
          `<hr style="${RULE}margin:40px 0 0;" />`,
          `<blockquote style="border:0;margin:0;padding:22px 0 20px;font-size:19px;font-weight:700;line-height:1.6;">${esc(text)}</blockquote>`,
          `<hr style="${RULE}margin:0 0 28px;" />`,
        ].join('\n')

  return blocks.map((b) => (b.kind === 'heading' ? heading(b.groups[0]?.[0] ?? '') : para(b.groups))).join('\n')
}

/**
 * 글자만 붙여넣을 때의 본문 — 덩어리 안은 줄바꿈, 덩어리 사이는 빈 줄.
 *
 * 소제목 위아래에 구분선 글자(───)를 넣는다. 서식이 안 넘어가는 환경에서도 소제목 자리가
 * 눈에 보이고, 네이버에서 그 줄을 지우고 구분선 서식을 넣기만 하면 된다.
 */
export function blocksToText(blocks: BodyBlock[], rule = true): string {
  return blocks
    .map((b) =>
      b.kind === 'heading' && rule
        ? `───────────────\n${b.groups[0]?.[0] ?? ''}\n───────────────`
        : b.groups.map((g) => g.join('\n')).join('\n\n')
    )
    .join('\n\n')
}

export function buildCopyPackage(post: Post, store?: Store): CopyPackage {
  const cleaned = stripGuides(post.body)
  const parsed = parseBody(cleaned)

  // 이미지 지시문과 소제목 마크업을 뺀 본문
  const body = cleaned
    .split(/\r?\n/)
    .filter((l) => !/^\s*\[(?:이미지|영상)\s*:?[^\]]*\]\s*$/.test(l))
    .map((l) => l.replace(/^\s*##+\s*/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  const blocks = toBlocks(cleaned)

  const localKw = post.localKeyword || post.mainKeyword
  const imagePlan = parsed.images.map((desc, i) => ({
    order: i + 1,
    slot: i === 0 ? '대표이미지 (제목 바로 아래)' : `${parsed.headings[i - 1] ?? `${i}번째 구간`} 바로 위`,
    description: desc || '(설명 없음)',
    fileName: `${slug(localKw)}-${String(i + 1).padStart(2, '0')}.jpg`,
    altText: i === 0 ? `${post.mainKeyword} 대표 이미지` : `${localKw} ${desc || '시설'}`.slice(0, 60),
  }))

  const tags = post.tags.map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' ')

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
    { label: `해시태그 ${post.tags.length}개 입력`, detail: '8~12개 권장' },
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
