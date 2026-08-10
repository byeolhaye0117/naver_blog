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
  /** 모바일에서 읽히도록 문장 단위로 줄을 끊은 본문 (화면의 기본값) */
  bodyMobile: string
  /** 서식을 함께 붙여넣기 위한 HTML — 소제목이 굵고 큰 글씨로 들어간다 */
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
  /** 모바일에서 읽히도록 끊은 줄들 (소제목은 언제나 한 줄) */
  lines: string[]
}

/**
 * 모바일에서 한 줄로 둘 글자수 상한.
 *
 * **가독성 판단이지 순위 규칙이 아니다.** 실측(160편)에서 문단 **길이 자체는** 순위와
 * 무관했다 (1~3위 중간값 142자 · 4~6위 154자). 다만 **덩어리로 쓴 글은 불리했다** —
 * 문단 3~5개 5편 중 1~3위 0%, 문단 10개 이상은 35~36%, 가장 긴 문단이 본문의 40%를
 * 넘는 4편도 1~3위 0%였다.
 *
 * 네이버 에디터에 줄바꿈이 있는 글을 붙이면 줄마다 문단이 하나씩 생긴다. 그래서 이 상한은
 * 「문단이 많고 가장 긴 문단이 짧은」 쪽 — 실측에서 유리했던 쪽 — 으로 글을 옮긴다.
 * 회원이 모바일로 붙여넣고 「문단 정리가 안 된다」고 한 것이 이걸 만든 이유다.
 */
export const MOBILE_LINE_MAX = 80

function slug(s: string): string {
  return s
    .replace(/\s+/g, '-')
    .replace(/[^0-9A-Za-z가-힣-]/g, '')
    .slice(0, 40)
}

/** 한 문장이 상한보다 길면 쉼표·줄표에서 끊는다 (낱말 중간에서 끊지 않는다) */
function breakLong(sentence: string): string[] {
  const out: string[] = []
  let rest = sentence.trim()
  while (rest.length > MOBILE_LINE_MAX) {
    const head = rest.slice(0, MOBILE_LINE_MAX)
    let cut = Math.max(head.lastIndexOf(', '), head.lastIndexOf(' — '), head.lastIndexOf('; '))
    if (cut < MOBILE_LINE_MAX * 0.4) cut = head.lastIndexOf(' ')
    // 끊을 자리가 없으면 그냥 둔다 — 낱말을 자르면 읽기가 더 나빠진다
    if (cut < MOBILE_LINE_MAX * 0.4) break
    out.push(rest.slice(0, cut + 1).trim())
    rest = rest.slice(cut + 1).trim()
  }
  if (rest) out.push(rest)
  return out
}

/**
 * 문단 하나를 모바일에서 읽히는 줄들로 끊는다.
 *
 * 문장을 자르지 않는다 — 검수가 쓰는 `splitSentences` 로 쪼갠 뒤, 상한 안에 들어가는
 * 만큼만 다시 붙인다. 한 문장씩 무조건 끊으면 짧은 문장이 이어질 때 전단지처럼 읽힌다.
 */
export function mobileLines(paragraph: string): string[] {
  const text = paragraph.trim()
  if (!text) return []
  const sentences = splitSentences(text)
  const pieces = (sentences.length ? sentences : [text]).flatMap(breakLong)
  const lines: string[] = []
  for (const p of pieces) {
    const last = lines[lines.length - 1]
    if (last && last.length + 1 + p.length <= MOBILE_LINE_MAX) lines[lines.length - 1] = `${last} ${p}`
    else lines.push(p)
  }

  /*
   * 글자가 하나라도 사라졌으면 원문을 그대로 돌려준다.
   *
   * `splitSentences` 는 길이 1 이하 조각을 버린다 (어미 통계에서는 맞는 처리다). 여기서는
   * 발행할 본문을 만들므로 한 글자도 없어져선 안 된다 — 못 끊는 게 지우는 것보다 낫다.
   */
  const squash = (s: string) => s.replace(/\s+/g, '')
  return squash(lines.join(' ')) === squash(text) ? lines : [text]
}

/** 정리된 본문을 소제목·문단으로 쪼갠다 (이미지·영상 지시문은 버린다) */
export function toBlocks(cleaned: string): BodyBlock[] {
  const blocks: BodyBlock[] = []
  let buf: string[] = []
  const flush = () => {
    const joined = buf.join(' ').trim()
    buf = []
    if (joined) blocks.push({ kind: 'para', lines: mobileLines(joined) })
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
      blocks.push({ kind: 'heading', lines: [heading[1].trim()] })
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

/**
 * 서식을 함께 붙여넣기 위한 HTML.
 *
 * 회원 요청 — 「소제목은 붙여넣으면 자동으로 인식되게」. 네이버는 글쓰기 API 를 주지 않으니
 * 우리가 쓸 수 있는 통로는 클립보드 하나다. 글자만 복사하면 소제목이 본문과 똑같은 줄로
 * 붙지만, `text/html` 을 같이 담으면 **굵고 큰 글씨로** 붙는다.
 *
 * 다만 네이버 에디터가 이걸 자기 「소제목」 컴포넌트로 바꿔주는지는 에디터 버전에 따라
 * 다르다. 확인할 방법이 없으므로 **된다고 적지 않는다** — 화면에도 「붙인 뒤 소제목 줄을
 * 확인하세요」로 적어둔다. h3 안에 굵기·크기를 직접 박아두는 것도 그래서다. 태그가 벗겨져도
 * 최소한 굵고 큰 글씨는 남는다.
 */
export function blocksToHtml(blocks: BodyBlock[]): string {
  return blocks
    .map((b) =>
      b.kind === 'heading'
        ? `<h3 style="font-size:19px;font-weight:700;line-height:1.6;margin:34px 0 14px;">${esc(b.lines[0] ?? '')}</h3>`
        : `<p style="font-size:16px;line-height:1.9;margin:0 0 26px;">${b.lines.map(esc).join('<br />')}</p>`
    )
    .join('\n')
}

/** 모바일용 본문 — 문단 안은 줄바꿈, 문단 사이는 빈 줄 */
export function blocksToText(blocks: BodyBlock[]): string {
  return blocks.map((b) => b.lines.join('\n')).join('\n\n')
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
