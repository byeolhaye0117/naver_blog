import { NextResponse } from 'next/server'
import { mutate, readDB } from '@/lib/store'
import { topBlogPosts } from '@/lib/naver/blogsection'
import { parsePostMetrics, parsePostTitle, postViewUrl } from '@/lib/naver/blogpost'
import { countSignals, countCta } from '@/lib/analysis/content'
import { splitSentences, endingOf } from '@/lib/writing/checker'
import {
  BODY_MAX_AGE_DAYS,
  BODY_BUDGET_PER_RUN,
  STUDY_RUNS_KEEP,
  STUDY_POSTS_KEEP,
  studyKeywords,
  measurementAgeDays,
} from '@/lib/analysis/study'
import type { StudyPostCache } from '@/lib/types'
/*
 * 조사 키워드는 저장소 최상단의 `study/keywords.json` 이 원본이다. 런타임에 파일로 읽으면
 * 배포 번들에 안 실릴 수 있어서 **들여와서** 쓴다 (tsconfig 의 resolveJsonModule).
 */
import STUDY_CONFIG from '@/study/keywords.json'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * 상위노출 조사를 **하루에 하나씩 쌓는다.**
 *
 * 회원이 물었다 — "일주일 뒤까지 모으지 않아도 하루씩 모이게 할 수 있지 않아?"
 * 된다. 「유지하고 있는 글」을 가리는 데 필요한 것은 런 **개수**가 아니라 **기간**이고,
 * 하루씩 쌓으면 이 주면 14개 런이 14일을 덮는다. 손으로 주에 한 번 돌리는 것보다 촘촘하고,
 * 「올라갔다 사라지는 글」과 「계속 위에 있는 글」이 훨씬 빨리 갈린다.
 *
 * ─── 왜 순위와 본문을 나눠 받나 ──────────────────────────────────────────
 *
 * 키워드 22개 × 상위 10편이면 매일 본문 160편을 읽어야 하는데, 그건 함수 한 번에 들어가지
 * 않는다 (로컬에서 2~4분 걸렸다). 그런데 **순위는 매일 바뀌고 본문은 거의 안 바뀐다.**
 *
 *   순위: 키워드마다 목록 1콜 = 22콜. 매일 전부 새로 받는다 (싸다).
 *   본문: 측정값이 7일 넘게 묵은 것만 다시 받는다. 한 번에 최대 60편.
 *
 * 그래서 순위 이력은 **매일 빠짐없이** 남고, 본문 측정값은 며칠에 걸쳐 갱신된다.
 * 유지 판정은 순위 이력으로 하므로 이 구분이 판정을 흐리지 않는다.
 *
 * 못 받은 본문 편수는 응답에 적어 돌려준다 — 조용히 줄이면 「전부 쟀다」로 읽힌다.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim()
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 401 })
    }
  }

  const db = await readDB()
  const today = new Date().toISOString().slice(0, 10)
  const runs = db.studyRuns ?? []

  // 오늘 것이 이미 있으면 다시 쌓지 않는다 (크론이 두 번 불려도 하루 하나)
  if (runs.some((r) => r.date === today)) {
    return NextResponse.json({ ok: true, skipped: '오늘 런이 이미 있습니다.', date: today })
  }

  const keywords = studyKeywords(db, STUDY_CONFIG.keywords)
  if (!keywords.length) {
    return NextResponse.json({ ok: false, error: '조사할 키워드가 없습니다.' }, { status: 400 })
  }

  const TOP = 10

  // ① 순위 — 매일 전부 새로 받는다
  const ranks = new Map<string, { blogId: string; serpTitle: string; ranks: Record<string, number> }>()
  const missedKeywords: string[] = []
  for (const kw of keywords) {
    const { items } = await topBlogPosts(kw, TOP)
    if (!items.length) {
      missedKeywords.push(kw)
      continue
    }
    items.forEach((p, i) => {
      const url = p.url
      if (!url) return
      if (!ranks.has(url)) {
        // 블로그 아이디는 URL 에서 뽑는다 (섹션 응답은 blogger 표시명만 준다)
        const blogId = url.match(/blog\.naver\.com\/([A-Za-z0-9_-]+)/i)?.[1] ?? ''
        ranks.set(url, { blogId, serpTitle: p.title ?? '', ranks: {} })
      }
      ranks.get(url)!.ranks[kw] = i + 1
    })
  }

  // ② 본문 — 묵은 것만, 예산 안에서
  const cache = new Map((db.studyPosts ?? []).map((p) => [p.url, p]))
  const stale = [...ranks.keys()].filter((url) => {
    const hit = cache.get(url)
    return !hit || measurementAgeDays(hit.measuredAt, today) >= BODY_MAX_AGE_DAYS
  })
  const toFetch = stale.slice(0, BODY_BUDGET_PER_RUN)
  const deferred = stale.length - toFetch.length

  const fresh: StudyPostCache[] = []
  for (const url of toFetch) {
    const metrics = await measureOne(url)
    if (metrics) fresh.push({ url, measuredAt: today, metrics })
  }
  for (const p of fresh) cache.set(p.url, p)

  // ③ 런 하나로 합친다 — 측정값이 없는 글은 순위만 남기지 않고 아예 뺀다
  const posts = [...ranks.entries()]
    .map(([url, meta]) => {
      const hit = cache.get(url)
      if (!hit) return null
      return { url, blogId: meta.blogId, ranks: meta.ranks, ...hit.metrics }
    })
    .filter(Boolean)

  await mutate((d) => {
    d.studyRuns = [...(d.studyRuns ?? []), { date: today, keywords, top: TOP, posts }].slice(-STUDY_RUNS_KEEP)
    /*
     * 캐시는 지금 순위에 보이는 글 + 최근에 잰 글만 남긴다. 순위에서 사라진 글의
     * 측정값을 영원히 들고 있을 필요는 없다 — 다시 올라오면 그때 재면 된다.
     */
    d.studyPosts = [...cache.values()]
      .sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))
      .slice(0, STUDY_POSTS_KEEP)
  })

  return NextResponse.json({
    ok: true,
    date: today,
    keywords: keywords.length,
    posts: posts.length,
    bodiesFetched: fresh.length,
    // 줄인 것은 반드시 말한다 — 조용히 줄이면 「전부 쟀다」로 읽힌다
    bodiesDeferred: deferred,
    missedKeywords,
    totalRuns: Math.min(runs.length + 1, STUDY_RUNS_KEEP),
  })
}

/** 글 하나를 앱이 쓰는 함수로 측정한다 (조사와 검수가 같은 자를 쓰게) */
async function measureOne(url: string): Promise<Record<string, unknown> | null> {
  const pv = postViewUrl(url)
  if (!pv) return null
  try {
    const res = await fetch(pv, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) return null
    const html = await res.text()
    const m = parsePostMetrics(html)
    if (!m || m.charCount < 300) return null

    const signals = countSignals(m.text)
    const endings: Record<string, number> = {}
    for (const s of splitSentences(m.text)) {
      const e = endingOf(s)
      endings[e] = (endings[e] ?? 0) + 1
    }
    const sentenceCount = Object.values(endings).reduce((a, b) => a + b, 0)
    const topEnding = Object.entries(endings).sort((a, b) => b[1] - a[1])[0]
    const per1k = (n: number) => (m.charCount ? Number(((n / m.charCount) * 1000).toFixed(2)) : 0)
    const cnt = (re: RegExp) => (m.text.match(re) ?? []).length
    const title = parsePostTitle(html)

    /*
     * 문단 구조는 담지 않는다.
     *
     * 문단 경계를 세려면 se-component 를 순서대로 쪼개야 하고, 그 코드는 조사 스크립트에만
     * 있다 (scripts/study.mjs). 크론에서까지 두 벌로 들고 있으면 두 곳이 어긋난다.
     * 문단 기준은 이미 세 표본에서 「유지」로 나왔으니 매일 다시 잴 급함이 없다 —
     * 필요하면 로컬에서 `npm run study:collect` 로 문단까지 재면 된다.
     */
    return {
      title: title || '',
      chars: m.charCount,
      images: m.imageCount,
      videos: m.videoCount,
      info: signals.info,
      promo: signals.promo,
      experience: signals.experience,
      infoFound: signals.infoFound,
      promoFound: signals.promoFound,
      cta: countCta(m.text).count,
      topEnding: topEnding ? topEnding[0] : '',
      topEndingShare: sentenceCount ? Math.round((topEnding[1] / sentenceCount) * 100) : 0,
      visitorVoice:
        /후기|내돈내산|체험/.test(title) ||
        /다녀왔|다녀온|가봤더니|등록했어요|등록하고 왔|상담을 받아봤|내돈내산|체험단/.test(m.text),
      tone: {
        bang: per1k(cnt(/!/g)),
        emoji: per1k(cnt(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu)),
        firstPerson: per1k(cnt(/제가|저는|저도|저희/g)),
        colloquial: per1k(cnt(/거든요|더라고요|더라구요|는데요|니까요/g)),
        emotion: per1k(cnt(/솔직히|걱정|고민|마음|뿌듯|아쉽|막막|힘드|응원/g)),
        question: per1k(cnt(/\?/g)),
        quotes: cnt(/[“”"][^“”"\n]{6,80}[“”"]/g),
        endingMix: Object.fromEntries(
          Object.entries(endings).map(([k, v]) => [k, sentenceCount ? Number((v / sentenceCount).toFixed(3)) : 0])
        ),
      },
    }
  } catch {
    return null
  }
}
