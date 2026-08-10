/**
 * 상위노출 조사 — 「상위에 올라가서 **유지되고 있는** 글은 어떻게 썼나」를 반복해서 재고,
 * 앱의 기준(SPECS · INFO_MIN · PROMO_MAX …)이 아직 맞는지 점검한다.
 *
 * ─── 왜 만들었나 ──────────────────────────────────────────────────────────
 *
 * 회원이 말했다 — "이벤트 문구는 줄이지 않아. 내가 정보성을 넣어야겠다고 판단한 건 요즘
 * 네이버가 단순 홍보글보다 정보성이 섞여야 올려보내준다고 생각했기 때문이야. 하지만 그
 * 판단이 틀렸다면, 내가 메인으로 잡고 있는 키워드에서 상위노출하고 **유지하고 있는**
 * 블로그들을 분석해서 계속 분석하고 업데이트하는 게 좋을 것 같아."
 *
 * 맞는 말이었고, 실제로 그렇게 재보니 앱 기준 두 개가 틀려 있었다 (홍보 상한 3 → 6,
 * 정보 하한 4 → 5). 그 조사를 손으로 하지 않게 만든 것이 이 스크립트다.
 *
 * ─── 어떻게 쓰나 ──────────────────────────────────────────────────────────
 *
 *   npm run study:collect     # 지금 순위를 재서 study/runs/<날짜>.json 에 저장
 *   npm run study:analyze     # 쌓인 런을 전부 합쳐 기준을 점검
 *
 * collect 를 **주에 한 번씩 반복**하는 것이 이 도구의 핵심이다. 한 번 재면 「그날 1위」만
 * 알 수 있고, 여러 번 재야 「올라갔다 사라지는 글」과 「계속 위에 있는 글」이 갈린다.
 * 유지하는 글만 골라서 기준을 잡아야 우리가 따라할 대상이 맞다.
 *
 * ─── 설계에서 신경 쓴 것 ───────────────────────────────────────────────────
 *
 *  ① **앱이 쓰는 함수로 잰다.** countSignals · parsePostMetrics · endingOf 를 lib/ 에서
 *     그대로 불러온다 (complib.mjs 로 임시 컴파일). 조사와 검수가 다른 자로 세면
 *     "기준을 실측으로 잡았다"는 말이 거짓이 된다.
 *  ② **본문을 커밋하지 않는다.** 런 파일에는 측정값과 제목만 남긴다 — 남의 글이고,
 *     저장소가 수십 MB 로 불어난다. 본문 원본은 study/.cache/ 에 두고 gitignore 한다.
 *  ③ **자동으로 lib/ 를 고치지 않는다.** analyze 는 「기준 제안」을 출력하고 끝낸다.
 *     숫자가 바뀌면 근거 주석과 테스트도 같이 손대야 해서, 그 판단은 사람이 한다.
 *  ④ **표본 오차 안이면 「유지」라고 말한다.** 95% 구간이 겹치면 제안하지 않는다 —
 *     11편 표본으로 잡았던 기준이 141편에서 뒤집힌 게 이 도구를 만든 이유다.
 *
 * 새 의존성은 없다 (node 내장 fetch + tsc).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { compileLib, repoRoot } from './complib.mjs'

/*
 * node 의 내장 fetch 는 HTTPS_PROXY 를 자동으로 쓰지 않는다 (curl 과 다르다).
 * 프록시 환경에서 조용히 전부 실패하는 것을 막으려고, 필요하면 스스로 다시 띄운다.
 */
if (!process.env.NODE_USE_ENV_PROXY && (process.env.HTTPS_PROXY || process.env.https_proxy)) {
  const r = spawnSync(process.execPath, [new URL(import.meta.url).pathname, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, NODE_USE_ENV_PROXY: '1' },
  })
  process.exit(r.status ?? 1)
}

const STUDY = join(repoRoot, 'study')
const RUNS = join(STUDY, 'runs')
const CACHE = join(STUDY, '.cache')
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

const LIB_TARGETS = [
  'lib/analysis/content.ts',
  'lib/analysis/cutline.ts',
  'lib/analysis/factors.ts',
  'lib/analysis/study.ts',
  'lib/naver/blogpost.ts',
  'lib/writing/checker.ts',
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}

/*
 * 통계와 판정 규칙은 lib/analysis/study.ts 에 있다 (wilson · mergeRuns · boundaryScan ·
 * verdictFor). 여기 두면 타입 검사도 테스트도 닿지 않는데, 그 규칙이 틀리면 앱의 모든
 * 기준이 틀린 방향으로 움직인다. 이 파일은 「받아오기」와 「보여주기」만 한다.
 */
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0)
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '-')
/** 오늘 날짜 (offsetDays 만큼 뒤로) — YYYY-MM-DD */
const today = (offsetDays = 0) =>
  new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10)

// ─── 수집 ────────────────────────────────────────────────────────────────
const strip = (h) =>
  h
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*$/, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()

/**
 * 스마트에디터 본문을 구성요소 순서대로 쪼갠다.
 *
 * 문단 구조를 재려면 경계가 필요하다. 평문으로 합쳐버리면 「한 문단 300자」 같은 기준을
 * 다시 검증할 수 없다. 구성요소는 `se-component se-<타입>` 으로 표시된다.
 */
function splitComponents(html) {
  const start = html.indexOf('se-main-container')
  if (start < 0) return null
  const end = html.indexOf('post_footer', start)
  const body = html.slice(start, end > 0 ? end : undefined)
  const re = /se-component\s+se-([a-zA-Z]+)/g
  const marks = []
  let m
  while ((m = re.exec(body))) marks.push({ type: m[1], at: m.index })
  return marks.map((mk, i) => {
    const chunk = body.slice(mk.at, i + 1 < marks.length ? marks[i + 1].at : undefined)
    const text = strip(chunk)
    return { type: mk.type, chars: text.replace(/\s/g, '').length, text }
  })
}

async function fetchSerp(keyword, top) {
  const u =
    `https://section.blog.naver.com/ajax/SearchList.naver?countPerPage=${top}` +
    `&currentPage=1&keyword=${encodeURIComponent(keyword)}&orderBy=sim&type=post`
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(u, {
        headers: { 'User-Agent': UA, Referer: 'https://section.blog.naver.com/Search/Post.naver' },
        signal: AbortSignal.timeout(20000),
      })
      const t = await r.text()
      const d = JSON.parse(t.slice(t.indexOf('{')))
      const list = d?.result?.searchList ?? []
      // 항목 키는 domainIdOrBlogId · postUrl 이다 (blogId 가 아니다 — 여기서 한 번 틀렸다)
      return list.slice(0, top).map((p, i) => ({
        rank: i + 1,
        url: String(p.postUrl ?? `https://blog.naver.com/${p.domainIdOrBlogId}/${p.logNo}`),
        blogId: String(p.domainIdOrBlogId ?? ''),
        title: String(p.noTagTitle ?? p.title ?? '').replace(/<[^>]+>/g, ''),
      }))
    } catch {
      await sleep(1500 * (attempt + 1))
    }
  }
  return []
}

/**
 * 캐시를 며칠까지 재사용할지 (기본 0 = 오늘 받은 것만).
 *
 * **캐시가 영구적이면 측정값이 굳는다.** 실제로 그랬다 — 사흘 전에 받아둔 본문이 그대로
 * 재사용돼서, 그동안 글이 수정됐어도 옛 수치가 계속 나올 상태였다. 순위(SERP)는 매번 새로
 * 받으니 순위 변화는 보이는데 내용은 안 변하는, 조용히 어긋나는 조사가 된다.
 *
 * 그래서 기본은 「오늘 받은 것만 재사용」이다. 같은 날 여러 번 돌릴 때만 캐시가 듣고,
 * 주에 한 번 돌리는 정상 사용에서는 매번 새로 받는다. `--cache-days=N` 으로 늘릴 수 있다.
 */
const CACHE_DAYS = Number(arg('cache-days', '0'))

function cacheFresh(path) {
  if (!existsSync(path)) return false
  // 받아온 날이 「오늘 − CACHE_DAYS」보다 뒤면 재사용한다 (기본 0 = 오늘 것만)
  const stamped = new Date(statSync(path).mtimeMs).toISOString().slice(0, 10)
  return stamped >= today(-Math.max(CACHE_DAYS, 0))
}

async function fetchHtml(url, postViewUrl) {
  const pv = postViewUrl(url)
  if (!pv) return null
  const key = pv.replace(/[^A-Za-z0-9]+/g, '_').slice(-120)
  const cached = join(CACHE, `${key}.html`)
  if (cacheFresh(cached)) return readFileSync(cached, 'utf8')
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(pv, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(25000) })
      if (!r.ok) throw new Error(String(r.status))
      const html = await r.text()
      writeFileSync(cached, html)
      return html
    } catch {
      await sleep(1500 * (attempt + 1))
    }
  }
  return null
}

async function collect(lib) {
  const { parsePostMetrics, parsePostTitle, postViewUrl } = lib.blogpost
  const { countSignals, countCta } = lib.content
  const { splitSentences, endingOf } = lib.checker

  const cfgPath = join(STUDY, 'keywords.json')
  const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'))
  const keywords = (arg('keywords') ? arg('keywords').split(',') : cfg.keywords).map((k) => k.trim()).filter(Boolean)
  const top = Number(arg('top', cfg.top ?? 10))
  if (!keywords.length) throw new Error(`${cfgPath} 에 keywords 가 비어 있습니다.`)

  mkdirSync(RUNS, { recursive: true })
  mkdirSync(CACHE, { recursive: true })

  console.log(`키워드 ${keywords.length}개 × 상위 ${top}편 수집`)
  const serps = {}
  for (const k of keywords) {
    serps[k] = await fetchSerp(k, top)
    console.log(`  ${k}: ${serps[k].length}편`)
    await sleep(400)
  }

  const seen = new Map()
  for (const [kw, list] of Object.entries(serps)) {
    for (const row of list) {
      if (!seen.has(row.url)) seen.set(row.url, { blogId: row.blogId, serpTitle: row.title, ranks: {} })
      seen.get(row.url).ranks[kw] = row.rank
    }
  }
  const urls = [...seen.keys()]
  console.log(
    `\n고유 글 ${urls.length}편 본문 측정 ` +
      (CACHE_DAYS > 0 ? `(캐시 ${CACHE_DAYS}일까지 재사용)` : '(오늘 받은 캐시만 재사용 — 나머지는 새로 받는다)')
  )

  const posts = []
  let done = 0
  const CONC = 4
  await Promise.all(
    Array.from({ length: CONC }, async (_, w) => {
      for (let i = w; i < urls.length; i += CONC) {
        const url = urls[i]
        const html = await fetchHtml(url, postViewUrl)
        done++
        if (done % 20 === 0) console.log(`  ${done}/${urls.length}`)
        if (!html) continue
        const metrics = parsePostMetrics(html)
        if (!metrics) continue
        const comps = splitComponents(html) ?? []
        const texts = comps.filter((c) => c.type === 'text' && c.chars > 0)
        const signals = countSignals(metrics.text)
        const endings = {}
        for (const s of splitSentences(metrics.text)) {
          const e = endingOf(s)
          endings[e] = (endings[e] ?? 0) + 1
        }
        const sentenceCount = Object.values(endings).reduce((s, x) => s + x, 0)
        const topEnding = Object.entries(endings).sort((a, b) => b[1] - a[1])[0]
        const meta = seen.get(url)
        /*
         * 톤 지표.
         *
         * 2026-08-06 측정에서 톤은 순위와 관계가 없었다 (전부 |ρ| ≤ 0.22). 그래도 매 런
         * 기록하는 이유는 회원의 질문이 「요즘」에 대한 것이었기 때문이다 — "요즘 상위
         * 블로그는 감정도 들어가고 친근해진 것 같다." 한 번 재서 아니라고 답하는 것과,
         * 계속 재서 변하는지 보는 것은 다르다. 판이 바뀌면 여기서 먼저 보인다.
         */
        const cnt = (re) => (metrics.text.match(re) ?? []).length
        const per1k = (n) => (metrics.charCount ? Number(((n / metrics.charCount) * 1000).toFixed(2)) : 0)
        const tone = {
          bang: per1k(cnt(/!/g)),
          emoji: per1k(cnt(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu)),
          firstPerson: per1k(cnt(/제가|저는|저도|저희/g)),
          colloquial: per1k(cnt(/거든요|더라고요|더라구요|는데요|니까요/g)),
          emotion: per1k(cnt(/솔직히|걱정|고민|마음|뿌듯|아쉽|막막|힘드|응원/g)),
          question: per1k(cnt(/\?/g)),
          // 회원이 실제로 하는 말을 따옴표로 옮긴 대목
          quotes: cnt(/[“”"][^“”"\n]{6,80}[“”"]/g),
          // 어미 배합 (비중) — 「~습니다」로만 쓴 딱딱한 글을 시간축에서 보려면 필요하다
          endingMix: Object.fromEntries(
            Object.entries(endings).map(([k, v]) => [k, sentenceCount ? Number((v / sentenceCount).toFixed(3)) : 0])
          ),
        }
        posts.push({
          url,
          blogId: meta.blogId,
          title: parsePostTitle(html) || meta.serpTitle,
          ranks: meta.ranks,
          chars: metrics.charCount,
          images: metrics.imageCount,
          videos: metrics.videoCount,
          paras: texts.length,
          longestPara: texts.length ? Math.max(...texts.map((t) => t.chars)) : 0,
          avgPara: texts.length ? Math.round(mean(texts.map((t) => t.chars))) : 0,
          hasMap: comps.some((c) => /map/i.test(c.type)),
          info: signals.info,
          promo: signals.promo,
          experience: signals.experience,
          infoFound: signals.infoFound,
          promoFound: signals.promoFound,
          topEnding: topEnding ? topEnding[0] : '',
          topEndingShare: sentenceCount ? Math.round((topEnding[1] / sentenceCount) * 100) : 0,
          /*
           * 방문자 화자인지. 톤을 비교할 때 이걸로 갈라야 한다 — 후기는 원래 따뜻하고,
           * 섞어서 세면 「업체 글도 후기처럼 쓰라」는 잘못된 결론이 나온다.
           * (판별식은 lib/writing/checker.ts 의 voice 검사와 같은 계열이다)
           */
          visitorVoice:
            /후기|내돈내산|체험/.test(meta.serpTitle) ||
            /다녀왔|다녀온|가봤더니|등록했어요|등록하고 왔|상담을 받아봤|내돈내산|체험단/.test(metrics.text),
          tone,
          /*
           * 상담 유도 횟수 — 이 앱에서 찾은 가장 센 신호라 매 런 다시 재야 한다
           * (lib/analysis/content.ts 의 CTA_WORDS 주석). 앱이 쓰는 countCta 를 그대로 쓴다.
           */
          cta: countCta(metrics.text).count,
          // 본문은 담지 않는다 — 남의 글이고, 커밋하면 저장소가 불어난다
        })
        await sleep(250)
      }
    })
  )

  const date = new Date().toISOString().slice(0, 10)
  const out = join(RUNS, `${date}.json`)
  writeFileSync(out, JSON.stringify({ date, keywords, top, posts }, null, 1))
  console.log(`\n본문 확보 ${posts.length}/${urls.length}편 → study/runs/${date}.json`)
  console.log('다음: npm run study:analyze')
}

// ─── 분석 ────────────────────────────────────────────────────────────────

/**
 * 기준 점검 표.
 *
 * 각 항목마다 「지금 앱이 쓰는 값」과 「데이터가 가리키는 값」을 나란히 낸다.
 * 95% 구간이 겹치면 제안하지 않는다 — 표본 오차를 발견으로 착각하지 않기 위해서다.
 */
function standards(lib) {
  const { INFO_MIN_BY_TYPE, PROMO_MAX_BY_TYPE, CTA_MIN_BY_TYPE } = lib.content
  const { SPECS } = lib.checker
  const { IMAGE_BEST_MIN, IMAGE_BEST_MAX } = lib.cutline
  return [
    {
      id: 'info-min-promo',
      label: '정보 종류 하한 (홍보글)',
      where: 'lib/analysis/content.ts · INFO_MIN_BY_TYPE.promo',
      // 순수 정보글은 빼고, 홍보가 섞인 글끼리 비교한다 (회원이 물은 그 질문)
      subset: (r) => r.promo >= 1,
      subsetLabel: '홍보 표현이 1종류 이상인 글',
      value: (r) => r.info,
      kind: 'min',
      current: INFO_MIN_BY_TYPE.promo,
      candidates: [2, 3, 4, 5, 6, 7, 8],
    },
    {
      id: 'promo-max',
      label: '홍보 종류 상한 (홍보글)',
      where: 'lib/analysis/content.ts · PROMO_MAX_BY_TYPE.promo',
      subset: (r) => r.promo >= 1,
      subsetLabel: '홍보 표현이 1종류 이상인 글',
      value: (r) => r.promo,
      kind: 'max',
      current: PROMO_MAX_BY_TYPE.promo,
      candidates: [2, 3, 4, 5, 6, 7, 8],
    },
    /*
     * **가장 센 신호인데 점검 표에서 빠져 있었다** (2026-08-07 → 08-10 보완).
     * 검수에는 넣고 조사에는 안 넣었으니, 뒤집혀도 알 수 없는 상태였다.
     * 하한 항목이라 `stricter`/`change` 판정이 그대로 붙는다.
     */
    {
      id: 'cta-min-promo',
      label: '상담 유도 횟수 (홍보글)',
      where: 'lib/analysis/content.ts · CTA_MIN_BY_TYPE.promo',
      // 방문자 화자는 뺀다 — 방문객이 상담을 여섯 번 권하면 대가성 광고다
      subset: (r) => r.cta !== undefined && !r.visitorVoice,
      subsetLabel: '방문자 화자가 아닌 글',
      value: (r) => r.cta,
      kind: 'min',
      current: CTA_MIN_BY_TYPE.promo,
      candidates: [1, 2, 3, 4, 6, 8, 10],
    },
    {
      id: 'char-min-promo',
      label: '본문 글자수 하한 (홍보글)',
      where: 'lib/writing/checker.ts · SPECS.promo.charMin',
      subset: () => true,
      subsetLabel: '전체',
      value: (r) => r.chars,
      kind: 'min',
      current: SPECS.promo.charMin,
      candidates: [1200, 1500, 1700, 1750, 2000, 2200],
    },
    {
      id: 'image-min',
      label: '이미지 수 하한',
      where: 'lib/analysis/cutline.ts · IMAGE_BEST_MIN',
      subset: () => true,
      subsetLabel: '전체',
      value: (r) => r.images,
      kind: 'min',
      current: IMAGE_BEST_MIN,
      candidates: [3, 4, 5, 6, 7, 8],
    },
    {
      id: 'image-max',
      label: '이미지 수 상한',
      where: 'lib/analysis/cutline.ts · IMAGE_BEST_MAX',
      subset: () => true,
      subsetLabel: '전체',
      value: (r) => r.images,
      kind: 'max',
      current: IMAGE_BEST_MAX,
      candidates: [8, 10, 12, 15, 20, 30],
    },
    {
      id: 'ending-max',
      label: '최다 어미 비중 상한 (%)',
      where: 'lib/writing/checker.ts · endings 항목',
      subset: (r) => r.topEndingShare > 0,
      subsetLabel: '어미를 잴 수 있던 글',
      value: (r) => r.topEndingShare,
      kind: 'max',
      current: 55,
      candidates: [40, 45, 50, 55, 60, 70],
    },
    {
      id: 'para-max',
      label: '가장 긴 문단 글자수 상한',
      where: 'lib/writing/checker.ts · paraShape 항목',
      subset: (r) => r.longestPara > 0,
      subsetLabel: '문단을 잴 수 있던 글',
      value: (r) => r.longestPara,
      kind: 'max',
      current: 300,
      candidates: [200, 250, 300, 400, 500, 700],
    },
  ]
}

function analyze(lib) {
  const { mergeRuns, boundaryScan, verdictFor, wilson, exactMedian: median, MIN_SAMPLE, MIN_SIDE } = lib.study
  const { spearman } = lib.factors
  const wstr = (hit, n) => {
    const [lo, hi] = wilson(hit, n)
    return `${Math.round(lo * 100)}~${Math.round(hi * 100)}%`
  }

  if (!existsSync(RUNS)) throw new Error('study/runs 가 없습니다. 먼저 npm run study:collect 를 실행하세요.')
  const files = readdirSync(RUNS).filter((f) => f.endsWith('.json')).sort()
  if (!files.length) throw new Error('런이 하나도 없습니다. 먼저 npm run study:collect 를 실행하세요.')
  const runs = files.map((f) => JSON.parse(readFileSync(join(RUNS, f), 'utf8')))
  const rows = mergeRuns(runs).filter((r) => r.chars >= 300)

  const L = []
  const say = (s = '') => {
    L.push(s)
    console.log(s)
  }

  say(`# 상위노출 조사 — 런 ${runs.length}회 (${runs[0].date} ~ ${runs[runs.length - 1].date})`)
  say('')
  say(`글 ${rows.length}편 · 키워드 ${runs[runs.length - 1].keywords.length}개`)
  if (runs.length === 1) {
    say('')
    say('⚠ 런이 1회뿐입니다 — **유지력은 아직 알 수 없습니다.** 지금 결과는 그날의 스냅샷이고,')
    say('  올라갔다 사라지는 글과 계속 위에 있는 글이 섞여 있습니다. 일주일쯤 뒤에')
    say('  `npm run study:collect` 를 한 번 더 돌리면 그때부터 갈라집니다.')
  }

  // ─── 유지 상위권 ─────────────────────────────────────────────
  const held = rows.filter((r) => r.held)
  const repeat = rows.filter((r) => r.runs >= 2)
  say('')
  say('## 유지하고 있는 글')
  if (runs.length === 1) {
    say('  (런 2회 이상부터 나옵니다)')
  } else {
    /*
     * 런 간격이 짧으면 「유지」가 거짓이 된다.
     *
     * 실제로 그랬다 — 컨테이너 시계가 자정을 넘어서 몇 시간 차이인 두 런이 날짜가 다른
     * 파일로 남았고, 리포트는 145편 중 40편을 「매번 3위 안」이라고 불렀다. 몇 시간 동안
     * 순위가 안 바뀐 것은 유지가 아니다. 간격을 재서 말해준다.
     */
    const first = Date.parse(runs[0].date)
    const last = Date.parse(runs[runs.length - 1].date)
    const spanDays = Number.isFinite(first) && Number.isFinite(last) ? (last - first) / 86_400_000 : 0
    if (spanDays < 3) {
      say(`  ⚠ 첫 런과 마지막 런의 간격이 ${spanDays.toFixed(0)}일뿐입니다 — **아래 「유지」는 믿지 마세요.**`)
      say('    몇 시간~하루 사이에 순위가 안 바뀐 것은 유지가 아닙니다. 최소 일주일은 벌려야')
      say('    올라갔다 사라지는 글이 걸러집니다.')
      say('')
    }
    say(`  런 2회 이상 등장 ${repeat.length}편 · 그중 **매번 3위 안이었던 글 ${held.length}편**`)
    const dropped = repeat.filter((r) => r.firstBest <= 3 && r.lastBest > 3)
    const climbed = repeat.filter((r) => r.firstBest > 3 && r.lastBest <= 3)
    say(`  올라갔다 내려간 글 ${dropped.length}편 · 새로 올라온 글 ${climbed.length}편`)
    if (held.length) {
      say('')
      say('  유지 상위권이 실제로 쓴 모양 (중간값):')
      say(`    글자수 ${median(held.map((r) => r.chars))}자 · 이미지 ${median(held.map((r) => r.images))}장 · 문단 ${median(held.map((r) => r.paras))}개 (최장 ${median(held.map((r) => r.longestPara))}자)`)
      say(`    정보 ${median(held.map((r) => r.info))}종류 · 홍보 ${median(held.map((r) => r.promo))}종류 · 최다어미 ${median(held.map((r) => r.topEndingShare))}%`)
      say('')
      for (const r of held.slice(0, 12)) {
        say(`    ${r.blogId.padEnd(18)} 정보${String(r.info).padStart(2)} 홍보${String(r.promo).padStart(2)} ${String(r.chars).padStart(5)}자 이미지${String(r.images).padStart(2)}  ${r.title.slice(0, 34)}`)
      }
    }
    if (dropped.length >= MIN_SIDE) {
      say('')
      say(`  내려간 글과 유지한 글의 차이 (중간값 · 내려간 글 ${dropped.length}편이라 참고만):`)
      say(`    유지 ${held.length}편: 정보 ${median(held.map((r) => r.info))}종류 · 홍보 ${median(held.map((r) => r.promo))}종류 · ${median(held.map((r) => r.chars))}자`)
      say(`    내려감 ${dropped.length}편: 정보 ${median(dropped.map((r) => r.info))}종류 · 홍보 ${median(dropped.map((r) => r.promo))}종류 · ${median(dropped.map((r) => r.chars))}자`)
    }
  }

  // ─── 기준 점검 ───────────────────────────────────────────────
  say('')
  say('## 앱 기준 점검')
  say('  (순위는 런별 최고순위의 **중간값**입니다 — 한 번의 우연을 기준으로 삼지 않기 위해)')
  const findings = []
  for (const std of standards(lib)) {
    const sub = rows.filter(std.subset)
    say('')
    say(`### ${std.label} — 지금 ${std.current} (${std.where})`)
    say(`  대상: ${std.subsetLabel} ${sub.length}편`)
    const scan = boundaryScan(sub, std.value, std)
    const verdict = verdictFor(std.current, scan, sub.length, std.kind)
    const rho = sub.length ? (spearman(sub.map(std.value), sub.map((r) => r.best)) ?? 0) : 0
    if (verdict === 'insufficient') {
      say(`  표본이 ${MIN_SAMPLE}편 미만입니다 — 판정하지 않습니다.`)
      findings.push({ id: std.id, where: std.where, current: std.current, verdict, n: sub.length })
      continue
    }
    for (const t of scan.rows) {
      if (t.skip) {
        say(`  ${String(t.c).padStart(5)} : 한쪽이 ${MIN_SIDE}편 미만 (${t.good}/${t.bad}) — 건너뜀`)
        continue
      }
      const sign = std.kind === 'min' ? '이상' : '이하'
      say(
        `  ${String(t.c).padStart(5)} ${sign} ${String(t.good).padStart(3)}편 1~3위 ${pct(t.goodHit, t.good).padStart(4)} (${wstr(t.goodHit, t.good)})` +
          `  |  나머지 ${String(t.bad).padStart(3)}편 ${pct(t.badHit, t.bad).padStart(4)} (${wstr(t.badHit, t.bad)})` +
          `  차이 ${(t.gap * 100).toFixed(0).padStart(3)}%p${t.separated ? '  ← 구간이 갈림' : ''}`
      )
    }
    say(`  상관 ρ=${rho.toFixed(2)} (음수 = 값이 큰 글이 위)`)
    const pick = scan.pick
    if (verdict === 'keep') {
      say('  → **유지.** 어느 경계에서도 95% 구간이 갈리지 않았습니다 (표본 오차 안).')
    } else if (verdict === 'confirmed') {
      say(`  → **유지.** 데이터가 가리키는 경계(${pick.c})가 지금 기준과 같습니다.`)
    } else if (verdict === 'stricter') {
      say(
        `  → **유지.** 확실히 불리해지는 지점은 ${pick.c} ${std.kind === 'min' ? '아래' : '위'}였습니다 ` +
          `(${pick.c} ${std.kind === 'min' ? '미만' : '초과'} ${Math.round(pick.badRate * 100)}% vs ${Math.round(pick.goodRate * 100)}%). ` +
          `지금 기준 ${std.current} 은 그보다 **안전한 쪽**에 있습니다 — 내리라는 뜻이 아닙니다.`
      )
    } else {
      say(
        `  → **제안: ${std.current} → ${pick.c}.** ${pick.c} ${std.kind === 'min' ? '이상' : '이하'}인 글이 ` +
          `1~3위 ${Math.round(pick.goodRate * 100)}% (${wstr(pick.goodHit, pick.good)}), ` +
          `나머지가 ${Math.round(pick.badRate * 100)}% (${wstr(pick.badHit, pick.bad)}).`
      )
      say(`     ${std.where} 를 고치고, 근거 주석과 scripts/checks.mjs 의 단정문도 같이 옮기세요.`)
    }
    findings.push({
      id: std.id,
      where: std.where,
      current: std.current,
      verdict,
      ...(pick ? { suggested: pick.c } : {}),
      n: sub.length,
      rho: Number(rho.toFixed(2)),
    })
  }

  // ─── 톤 ──────────────────────────────────────────────────────
  /*
   * **순위 기준이 아니다.** 2026-08-06 측정에서 톤 지표는 전부 |ρ| ≤ 0.22 였고 구간이
   * 겹쳤다. 그래서 기준 점검 표(위)에 넣지 않고 여기서 따로 보여준다 — 「제안」을 내지
   * 않고 관찰만 한다. 회원 질문이 「요즘 상위 블로그가 친근해진 것 같다」였으므로,
   * 매 런 다시 재서 판이 정말 그쪽으로 가는지 시간축으로 본다.
   *
   * 방문자 화자를 갈라서 본다 — 후기는 원래 따뜻하고, 섞으면 「업체 글도 후기처럼
   * 쓰라」는 잘못된 결론이 나온다. 우리 홍보·정보글의 비교 대상은 비방문자 글이다.
   */
  const toned = rows.filter((r) => r.tone)
  say('')
  say('## 톤 (순위 기준이 아닙니다 — 관찰만 합니다)')
  if (!toned.length) {
    say('  이 런에는 톤 측정값이 없습니다 (예전 형식의 런). 다시 collect 하면 채워집니다.')
  } else {
    const biz = toned.filter((r) => !r.visitorVoice)
    say(`  대상: 방문자 화자가 아닌 글 ${biz.length}편 (우리 홍보·정보글과 같은 처지) · 방문자 화자 ${toned.length - biz.length}편은 제외`)
    if (biz.length < MIN_SAMPLE) {
      say(`  ${MIN_SAMPLE}편 미만이라 비교하지 않습니다.`)
    } else {
      const bt = biz.filter((r) => r.best <= 3)
      const bb = biz.filter((r) => r.best >= 7)
      say('')
      say('  지표                    1~3위    7위이하    상관ρ   (1,000자당)')
      const METRICS = [
        ['구어체 (거든요/더라고요)', (r) => r.tone.colloquial],
        ['1인칭 (제가/저희)', (r) => r.tone.firstPerson],
        ['감정 낱말', (r) => r.tone.emotion],
        ['질문 (?)', (r) => r.tone.question],
        ['느낌표', (r) => r.tone.bang],
        ['이모지', (r) => r.tone.emoji],
        ['회원 말 인용 (개, 글당)', (r) => r.tone.quotes],
      ]
      let anyReal = false
      for (const [name, f] of METRICS) {
        const rho = spearman(biz.map(f), biz.map((r) => r.best)) ?? 0
        const real = Math.abs(rho) >= 0.3
        if (real) anyReal = true
        say(
          `  ${name.padEnd(24)} ${median(bt.map(f)).toFixed(2).padStart(5)}  ${median(bb.map(f)).toFixed(2).padStart(7)}   ` +
            `${rho.toFixed(2).padStart(6)}${real ? '  ← 관계가 보임' : ''}`
        )
      }
      const mix = (g) => {
        const acc = {}
        let n = 0
        for (const r of g) for (const [k, v] of Object.entries(r.tone.endingMix ?? {})) { acc[k] = (acc[k] ?? 0) + v; n++ }
        return Object.entries(acc).map(([k, v]) => [k, v / (g.length || 1)]).sort((a, b) => b[1] - a[1])
      }
      say('')
      say('  어미 배합  1~3위: ' + mix(bt).map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(' · '))
      say('             7위–: ' + mix(bb).map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(' · '))
      say('')
      if (anyReal) {
        say('  → 관계가 보이는 지표가 있습니다. 톤을 「우리 판단」으로만 두지 말고 다시 검토하세요')
        say('     (lib/ai/prompt.ts 의 TONE 주석 · lib/writing/checker.ts 의 tone 항목).')
      } else {
        say('  → 순위와 관계있는 톤 지표가 없습니다 (전부 |ρ| < 0.3). **톤은 순위를 잃을 걱정 없이**')
        say('     정할 수 있다는 뜻입니다 — 상담 전환에 좋은 쪽으로 고르면 됩니다.')
      }
    }
  }

  // ─── 상위권이 쓰는 말 ────────────────────────────────────────
  const top3 = rows.filter((r) => r.best <= 3)
  const bot = rows.filter((r) => r.best >= 7)
  say('')
  say(`## 상위권이 쓰는 말 (1~3위 ${top3.length}편 vs 7위 이하 ${bot.length}편)`)
  for (const [label, key] of [
    ['정보', 'infoFound'],
    ['홍보', 'promoFound'],
  ]) {
    const share = (group, w) => group.filter((r) => r[key].includes(w)).length / (group.length || 1)
    const words = [...new Set(rows.flatMap((r) => r[key]))]
    const gaps = words
      .map((w) => ({ w, t: share(top3, w), b: share(bot, w) }))
      .sort((a, b) => b.t - b.b - (a.t - a.b))
    say('')
    say(`  ${label} 낱말 — 상위권에 더 많은 순`)
    for (const g of gaps.slice(0, 8))
      say(`    ${g.w.padEnd(10)} 1~3위 ${(g.t * 100).toFixed(0).padStart(3)}% / 7위 이하 ${(g.b * 100).toFixed(0).padStart(3)}%   차이 ${((g.t - g.b) * 100).toFixed(0)}%p`)
  }

  const changes = findings.filter((f) => f.verdict === 'change')
  say('')
  say('## 요약')
  const count = (v) => findings.filter((f) => f.verdict === v).length
  say(
    `  점검 ${findings.length}항목 · 제안 ${changes.length}건 · 확인 ${count('confirmed')}건 · ` +
      `유지 ${count('keep')}건 · 안전한쪽 ${count('stricter')}건 · 표본부족 ${count('insufficient')}건`
  )
  if (changes.length) for (const c of changes) say(`  · ${c.id}: ${c.current} → ${c.suggested}`)
  else say('  지금 기준을 바꿀 근거가 없습니다.')

  const latest = runs[runs.length - 1].date
  writeFileSync(
    join(STUDY, 'findings.json'),
    JSON.stringify({ analyzedAt: latest, runs: runs.length, posts: rows.length, findings }, null, 1)
  )
  writeFileSync(join(STUDY, 'report.md'), L.join('\n') + '\n')
  console.log('\nstudy/findings.json · study/report.md 갱신')
}

// ─── 진입점 ──────────────────────────────────────────────────────────────
const cmd = process.argv[2]
if (!['collect', 'analyze'].includes(cmd)) {
  console.log(`사용법:
  node scripts/study.mjs collect [--keywords="a,b"] [--top=10]
  node scripts/study.mjs analyze

  collect  지금 순위를 재서 study/runs/<날짜>.json 에 저장 (본문은 커밋하지 않음)
  analyze  쌓인 런을 전부 합쳐 앱 기준을 점검 → study/report.md · study/findings.json

  자세한 설명은 study/README.md`)
  process.exit(cmd ? 1 : 0)
}

let compiled
try {
  compiled = compileLib(LIB_TARGETS, 'nbm-study-')
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e))
  process.exit(1)
}
const { createRequire } = await import('node:module')
const nodeRequire = createRequire(import.meta.url)
const req = (p) => nodeRequire(join(compiled.outDir, 'lib', p))
const lib = {
  content: req('analysis/content.js'),
  cutline: req('analysis/cutline.js'),
  factors: req('analysis/factors.js'),
  study: req('analysis/study.js'),
  blogpost: req('naver/blogpost.js'),
  checker: req('writing/checker.js'),
}

try {
  if (cmd === 'collect') await collect(lib)
  else analyze(lib)
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e))
  compiled.cleanup()
  process.exit(1)
}
compiled.cleanup()
