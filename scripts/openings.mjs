/**
 * **지금 뚫릴 만한 키워드 찾기.**
 *
 * 회원 요청 (2026-08-18): 「지점 4곳의 지역 키워드 전부를 7일 이내 진입 기준으로 재서
 * 지금 뚫릴 만한 키워드 순위표를 만들어줘.」
 *
 *     npm run keywords:openings -- --url=https://<앱주소>
 *
 * 판단(등급·나이·정렬)은 `lib/analysis/openings.ts` 를 그대로 쓴다 — **앱 화면의 표와 같은
 * 함수**여야 두 곳이 어긋나지 않는다.
 *
 * ── 왜 이 숫자들인가 ─────────────────────────────────────────
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

const LIBS = ['lib/naver/blogsection.ts', 'lib/naver/blogstat.ts', 'lib/analysis/openings.ts']

function argOf(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : undefined
}

/*
 * 나이 계산·등급·정렬은 **앱과 같은 함수**를 쓴다 (lib/analysis/openings.ts).
 * 여기서 따로 구현하면 화면의 표와 터미널의 표가 조용히 어긋난다 — 이 저장소에서 이미
 * 여러 번 겪은 일이다(스킬과 앱, 지시문과 검수).
 */

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
  const op = require(`${join(c.outDir, 'lib')}/analysis/openings.js`)

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
    let freshest = null
    for (const it of page.items) {
      const age = op.ageDaysOf(it.date, today)
      if (age !== null) {
        ages.push(age)
        if (age <= op.FRESH_DAYS && (!freshest || age < freshest.age)) {
          freshest = { age, title: it.title ?? '', url: it.url }
        }
      }
      // 블로그 크기는 등급에 안 쓰지만, 문턱을 눈으로 보려고 함께 재둔다
      const blogId = (it.url ?? '').replace(/^https?:\/\/(m\.)?blog\.naver\.com\//, '').split('/')[0]
      const v = await visitorsOf(blogId)
      if (v !== null) sizes.push({ blogId, v })
    }
    const minBlog = sizes.length ? sizes.reduce((a, b) => (a.v <= b.v ? a : b)) : null
    const o = {
      ...op.openingOf({ ages, recent30: recent.count ?? null }),
      keyword,
      stores: owners.get(keyword),
      sampled: page.items.length,
      dated: ages.length,
      minVisitors: minBlog?.v ?? null,
      minBlogId: minBlog?.blogId ?? null,
      freshest,
    }
    out.push(o)
    process.stderr.write(`  ${keyword} — 7일 ${o.fresh}편 · 문턱 ${minBlog ? minBlog.v.toLocaleString() : '?'}\n`)
    await new Promise((r) => setTimeout(r, 250))
  }

  const sorted = op.sortOpenings(out)

  const n = (v) => (v === null || v === undefined ? '—' : v.toLocaleString())
  console.log('\n| 등급 | 키워드 | 지점 | 7일 이내 | 가장 어린 글 | 나이 중간값 | 최근 30일 발행 | 1페이지 최소 블로그 |')
  console.log('|---|---|---|---|---|---|---|---|')
  for (const o of sorted) {
    console.log(
      `| ${o.label} | ${o.keyword} | ${o.stores.join('·')} | ${o.fresh}편 | ${n(o.youngest)}일 | ${n(o.medianAge)}일 | ${n(o.recent30)}편 | ${n(o.minVisitors)}명 (${o.minBlogId ?? '?'}) |`
    )
  }

  const open = sorted.filter((o) => o.tier === 'open-quiet')
  if (open.length) {
    console.log('\n=== 지금 노려볼 만한 자리의 최신 진입 글 ===')
    for (const o of open) {
      if (o.freshest) console.log(`  ${o.keyword} — ${o.freshest.age}일차: ${o.freshest.title.slice(0, 50)}`)
    }
  }

  const path = join(repoRoot, 'study/openings.json')
  writeFileSync(path, JSON.stringify({ blog: { id: myId, visitors: myVisitors }, measuredAt: new Date().toISOString(), rows: sorted }, null, 2))
  console.log(`\n원자료: ${path}`)
  c.cleanup()
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e))
  process.exit(1)
})
