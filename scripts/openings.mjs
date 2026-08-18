/**
 * **지금 뚫릴 만한 키워드 찾기.**
 *
 * 회원 요청 (2026-08-18): 「지점 4곳의 지역 키워드 전부를 7일 이내 진입 기준으로 재서
 * 지금 뚫릴 만한 키워드 순위표를 만들어줘.」
 *
 *     npm run keywords:openings -- --url=https://<앱주소>
 *
 * ── 왜 이 세 숫자인가 ─────────────────────────────────────────
 * 2026-08-18 실측(천안·아산 14개 키워드 · 1페이지 140편)에서 **글의 형태로는 갈리지
 * 않았다** — 7일 이내 진입 글과 31일 이상 글의 글자수·이미지·정보/홍보/경험 낱말이 사실상
 * 같았다. 갈린 것은 **블로그 힘**이었다(누적 방문자 중간값 110,721 대 36,175).
 *
 * 블로그 힘은 글 한 편으로 못 바꾼다. 그래서 바꿀 수 있는 것 — **어느 키워드를 잡느냐** —
 * 를 잰다. 등급은 두 숫자로만 나눈다 (tier 주석 참고):
 *
 *   ① 7일 이내 진입 편수  1페이지에 갓 올라온 글이 실제로 있나 = 그 자리가 지금 열려 있나
 *   ② 최근 30일 발행량    경쟁하는 글이 몇 편인가
 *
 * 「1페이지 최소 블로그 크기」도 함께 재서 보여주지만 등급에는 넣지 않는다 — 우리 누적
 * 방문자(27만)가 지금 힘(오늘 4명·1페이지 진입 0%)을 대변하지 못하기 때문이다.
 *
 * **점수 하나로 뭉개지 않는다.** 숫자를 그대로 보여주고 등급만 붙인다 — 가중치를 지어내면
 * 근거 없는 순위가 되고, 회원이 왜 그런지 확인할 수 없다.
 */
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { writeFileSync } from 'node:fs'
import { compileLib, repoRoot } from './complib.mjs'

const LIBS = ['lib/naver/blogsection.ts', 'lib/naver/blogstat.ts', 'lib/analysis/keyword.ts']

function argOf(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : undefined
}

/** 오늘 기준 나이(일) */
function ageOf(date, today) {
  const t = Date.parse(date)
  return Number.isNaN(t) ? null : Math.round((today - t) / 86400000)
}

function median(list) {
  const s = list.filter((x) => x !== null && x !== undefined).sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : null
}

/** 경쟁이 적다고 볼 경계 — 최근 30일 발행량 (competitionOf 의 LOW 300보다 훨씬 좁게 본다) */
const QUIET = 100

/**
 * 등급 — **잰 것만으로 나눈다.**
 *
 * 처음에는 「1페이지 최소 블로그가 우리보다 작으면 문턱이 낮다」로 나눴는데, 그러면 거의 모든
 * 키워드가 같은 칸에 들어갔다 — 우리 블로그 누적이 27만이라 최소 블로그보다 늘 크다. 그런데
 * 우리 **오늘 방문자는 4명**이고 1페이지 진입률은 0%다. 즉 누적 방문자는 지금 힘을 대변하지
 * 못한다. 대변하지 못하는 숫자로 등급을 나누면 없는 근거를 만드는 셈이다.
 *
 * 그래서 실제로 갈리는 두 축만 쓴다:
 *   ① 7일 이내 진입이 있었나 — 그 자리가 **지금** 열려 있다는 증거
 *   ② 최근 30일 발행량이 적은가 — 경쟁 자체가 적은가
 * 「1페이지 최소 블로그 크기」는 등급에 넣지 않고 참고 칸으로만 보여준다.
 */
function tier(o) {
  const quiet = o.recent30 !== null && o.recent30 <= QUIET
  if (o.fresh7 > 0 && quiet) return { label: '지금 열려 있고 경쟁도 적음', rank: 0 }
  if (o.fresh7 > 0) return { label: '지금 열려 있음', rank: 1 }
  if (quiet) return { label: '경쟁은 적지만 자리 굳음', rank: 2 }
  return { label: '굳은 자리', rank: 3 }
}

async function main() {
  const url = argOf('url')
  if (!url) {
    console.error('앱 주소가 필요합니다 — npm run keywords:openings -- --url=https://<앱주소>')
    process.exit(1)
  }
  const myId = argOf('blog') ?? 'sulliha8277'
  const top = Number(argOf('top') ?? 10)

  const c = compileLib(LIBS, 'nbm-open-')
  const require = createRequire(import.meta.url)
  const bs = require(`${join(c.outDir, 'lib')}/naver/blogsection.js`)
  const st = require(`${join(c.outDir, 'lib')}/naver/blogstat.js`)

  // 지점 정보는 앱에서 그대로 받아온다 (씨앗과 어긋나면 엉뚱한 키워드를 잰다)
  const res = await fetch(`${url.replace(/\/+$/, '')}/api/stores`, { headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`${url}/api/stores → HTTP ${res.status}`)
  const json = await res.json()
  const stores = Array.isArray(json) ? json : json.stores

  /** 키워드 → 어느 지점 것인지 (겹치면 여러 지점) */
  const owners = new Map()
  for (const s of stores) {
    for (const k of s.localKeywords ?? []) {
      const key = k.trim()
      if (!key) continue
      if (!owners.has(key)) owners.set(key, [])
      owners.get(key).push(s.name)
    }
  }
  const keywords = [...owners.keys()]

  const mine = await st.fetchBlogStat(myId).catch(() => null)
  const myVisitors = mine?.totalVisitors ?? 0
  console.log(`우리 블로그 ${myId} — 누적 ${myVisitors.toLocaleString()}명 · 이웃 ${(mine?.buddies ?? 0).toLocaleString()} · 글 ${(mine?.postCount ?? 0).toLocaleString()}편`)
  console.log(`키워드 ${keywords.length}개를 잽니다 (상위 ${top}편 + 발행량 + 1페이지 블로그 크기)\n`)

  const today = Date.now()
  const statCache = new Map()
  async function visitorsOf(blogId) {
    if (!blogId) return null
    if (statCache.has(blogId)) return statCache.get(blogId)
    const s = await st.fetchBlogStat(blogId).catch(() => null)
    const v = s?.totalVisitors ?? null
    statCache.set(blogId, v)
    await new Promise((r) => setTimeout(r, 200))
    return v
  }

  const out = []
  for (const keyword of keywords) {
    const page = await bs.topBlogPosts(keyword, top).catch(() => ({ items: [] }))
    const recent = await bs.recentBlogCount(keyword).catch(() => ({ count: null }))
    const ages = []
    const sizes = []
    let fresh7 = 0
    let freshest = null
    for (const it of page.items) {
      const age = it.date ? ageOf(it.date, today) : null
      if (age !== null) {
        ages.push(age)
        if (age <= 7) {
          fresh7++
          if (!freshest || age < freshest.age) freshest = { age, title: it.title ?? '', url: it.url }
        }
      }
      const blogId = (it.url ?? '').replace(/^https?:\/\/(m\.)?blog\.naver\.com\//, '').split('/')[0]
      const v = await visitorsOf(blogId)
      if (v !== null) sizes.push({ blogId, v })
    }
    const minBlog = sizes.length ? sizes.reduce((a, b) => (a.v <= b.v ? a : b)) : null
    const o = {
      keyword,
      stores: owners.get(keyword),
      sampled: page.items.length,
      dated: ages.length,
      fresh7,
      youngest: ages.length ? Math.min(...ages) : null,
      medianAge: median(ages),
      recent30: recent.count ?? null,
      minVisitors: minBlog?.v ?? null,
      minBlogId: minBlog?.blogId ?? null,
      freshest,
    }
    o.tier = tier(o)
    out.push(o)
    process.stderr.write(`  ${keyword} — 7일 ${fresh7}편 · 문턱 ${minBlog ? minBlog.v.toLocaleString() : '?'}\n`)
    await new Promise((r) => setTimeout(r, 250))
  }

  out.sort(
    (a, b) =>
      a.tier.rank - b.tier.rank ||
      b.fresh7 - a.fresh7 ||
      (a.recent30 ?? Infinity) - (b.recent30 ?? Infinity) ||
      (a.minVisitors ?? Infinity) - (b.minVisitors ?? Infinity)
  )

  const n = (v) => (v === null || v === undefined ? '—' : v.toLocaleString())
  console.log('\n| 등급 | 키워드 | 지점 | 7일 이내 | 가장 어린 글 | 나이 중간값 | 최근 30일 발행 | 1페이지 최소 블로그 |')
  console.log('|---|---|---|---|---|---|---|---|')
  for (const o of out) {
    console.log(
      `| ${o.tier.label} | ${o.keyword} | ${o.stores.join('·')} | ${o.fresh7}편 | ${n(o.youngest)}일 | ${n(o.medianAge)}일 | ${n(o.recent30)}편 | ${n(o.minVisitors)}명 (${o.minBlogId ?? '?'}) |`
    )
  }

  const open = out.filter((o) => o.tier.rank === 0)
  if (open.length) {
    console.log('\n=== 지금 노려볼 만한 자리의 최신 진입 글 ===')
    for (const o of open) {
      if (o.freshest) console.log(`  ${o.keyword} — ${o.freshest.age}일차: ${o.freshest.title.slice(0, 50)}`)
    }
  }

  const path = join(repoRoot, 'study/openings.json')
  writeFileSync(path, JSON.stringify({ blog: { id: myId, visitors: myVisitors }, measuredAt: new Date().toISOString(), rows: out }, null, 2))
  console.log(`\n원자료: ${path}`)
  c.cleanup()
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e))
  process.exit(1)
})
