import Link from 'next/link'
import { readDB } from '@/lib/store'
import { keyStatus } from '@/lib/naver/client'
import { STALE_DAYS, balanceReport, cadenceReport, freshnessReport } from '@/lib/writing/rotation'
import { buildRankViews, isFirstPage, rankLabel } from '@/lib/analysis/rank'
import { checkPost } from '@/lib/writing/checker'
import { POST_STATUS_LABEL, POST_TYPE_LABEL } from '@/lib/types'
import { Badge, Card, Empty, IconTile, Progress, Stat, btnPrimary, inputClass } from '@/components/ui'
import {
  IconArrowRight,
  IconBalance,
  IconChart,
  IconDoc,
  IconPencil,
  IconSearch,
  IconSpark,
  IconTarget,
  IconTrend,
} from '@/components/icons'
import { nextActions } from '@/lib/writing/next-action'
import { shouldDiagnose } from '@/lib/analysis/diagnose'
import { poolStoredRuns } from '@/lib/analysis/factors'
import StorageNotice from '@/components/StorageNotice'

export const dynamic = 'force-dynamic'

export default async function Dashboard() {
  const db = await readDB()
  const keys = keyStatus()
  const balance = balanceReport(db.posts)
  const cadence = cadenceReport(db.posts)
  // 최신성은 관찰소에서 가장 센 신호였다 (6회 중 5회 유리, 거꾸로 0회) — 지점별로 따로 본다
  const freshness = freshnessReport(db.posts, db.stores)
  const staleStores = freshness.filter((f) => f.stale)
  // 검수 점수도 관찰을 반영한다 — 근거가 없거나 거꾸로인 항목은 비중이 내려간다
  const evidence = poolStoredRuns(db.factorRuns)
  const views = buildRankViews(db.rankTargets, db.rankSnapshots, db.posts)

  const published = db.posts.filter((p) => p.status === 'published')
  const drafts = db.posts.filter((p) => p.status !== 'published')
  const firstPage = views.filter((v) => isFirstPage(v.current))
  const risen = views.filter((v) => v.delta !== null && v.delta > 0)
  const fallen = views.filter((v) => v.delta !== null && v.delta < 0)

  const recent = [...db.posts]
    .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
    .slice(0, 5)

  const actions = nextActions({
    stores: db.stores,
    posts: db.posts,
    rankTargets: db.rankTargets,
    fallenCount: fallen.length,
    // 발행 2주가 지났는데 1페이지 밖인 것 — 크론이 밤에 진단해 처방을 만들어 둔다
    stuck: views
      .filter((v) => {
        const days = v.publishedAt
          ? Math.floor((Date.now() - Date.parse(v.publishedAt)) / 86400000)
          : null
        return days !== null && shouldDiagnose(v.current, days)
      })
      .map((v) => ({
        keyword: v.target.keyword,
        rank: v.current,
        days: Math.floor((Date.now() - Date.parse(v.publishedAt!)) / 86400000),
      })),
    balance,
    cadence,
    keys,
  })
  const [now, ...later] = actions

  /** 이 앱의 진행 순서 — 지금 어디까지 왔는지 보여준다 */
  const steps = [
    { label: '지점', href: '/stores', done: db.stores.length > 0 },
    { label: '키워드', href: '/keywords', done: db.posts.some((p) => p.mainKeyword) },
    { label: '작성', href: '/write', done: db.posts.length > 0 },
    { label: '발행', href: '/posts', done: published.length > 0 },
    { label: '순위', href: '/rank', done: db.rankTargets.length > 0 },
  ]
  const stepNow = steps.findIndex((s) => !s.done)

  /** 무엇을 쓸지 바로 고르는 자리 — 홈에서 한 번에 시작하게 */
  const quick = [
    { type: 'info', label: '정보글', why: '검색 유입·신뢰도' },
    { type: 'promo', label: '홍보글', why: '방문 상담 유도' },
    { type: 'review', label: '후기글', why: '제3자 시선' },
  ]

  return (
    <>
      <p className="eyebrow mb-3">대시보드 · 글 하나가 아니라 블로그 단위로 봅니다</p>

      <StorageNotice />

      {/* ─── 지금 할 일 (화면에서 가장 센 것 하나) ─── */}
      <section
        className={`${now.tone === 'bad' ? 'hero-warn' : 'hero'} card-lg relative mb-3.5 overflow-hidden rounded-[26px] border-0 p-5 sm:p-7`}
      >
        {/* 넓은 화면에서 오른쪽이 비어 보이지 않게 두는 장식 — 내용은 없다 */}
        <span
          aria-hidden
          className="pointer-events-none absolute -top-6 -right-6 hidden size-52 text-white/10 sm:block"
        >
          <IconSpark />
        </span>

        <div className="relative flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/18 px-2.5 py-1 text-[10.5px] font-extrabold tracking-[0.08em] backdrop-blur-sm">
            <span className="block size-3.5">
              <IconSpark />
            </span>
            지금 할 일
          </span>
          {later.length > 0 && (
            <span className="text-[11.5px] font-bold text-white/65">그 뒤로 {later.length}개</span>
          )}
        </div>

        <h1 className="relative mt-3.5 text-[24px] leading-[1.25] font-extrabold tracking-[-0.04em] sm:text-[31px]">
          {now.title}
        </h1>
        <p className="relative max-w-xl mt-2.5 text-[13px] leading-relaxed text-white/80">{now.why}</p>

        <Link
          href={now.href}
          className="text-brand-700 relative mt-5 inline-flex items-center gap-2 rounded-[15px] bg-white px-5 py-3.5 text-[14px] font-extrabold shadow-[0_10px_24px_-10px_rgb(0_0_0/.45)] transition active:scale-[.98]"
        >
          {now.cta}
          <span className="block size-[17px]">
            <IconArrowRight />
          </span>
        </Link>

        {later.length > 0 && (
          <details className="mt-5 border-t border-white/15 pt-3.5">
            <summary className="cursor-pointer text-[12px] font-bold text-white/75 select-none">
              나머지 할 일 {later.length}개 보기
            </summary>
            <ul className="mt-3 space-y-2.5">
              {later.map((a) => (
                <li key={a.id}>
                  <Link href={a.href} className="group flex items-start gap-2.5">
                    <span className="mt-0.5 shrink-0 rounded-full bg-white/18 px-2 py-0.5 text-[10px] font-extrabold">
                      {a.tone === 'bad' ? '조치' : a.tone === 'warn' ? '확인' : '양호'}
                    </span>
                    <span className="min-w-0 text-[12.5px] leading-relaxed">
                      <b className="font-bold group-hover:underline">{a.title}</b>
                      <span className="text-white/65"> — {a.why}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {/* ─── 키워드 바로 분석 + 무엇을 쓸지 ─── */}
      <div className="card mb-3.5 rounded-[22px] p-3.5 sm:p-4">
        <form action="/serp" className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <span className="muted pointer-events-none absolute top-1/2 left-3.5 block size-[18px] -translate-y-1/2">
              <IconSearch />
            </span>
            <input
              name="keyword"
              placeholder="키워드로 바로 분석"
              aria-label="분석할 키워드"
              className={`${inputClass} pl-11`}
            />
          </div>
          <button type="submit" className={btnPrimary}>
            <span className="block size-[17px] sm:hidden">
              <IconChart />
            </span>
            <span className="hidden sm:inline">분석</span>
          </button>
        </form>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="muted mr-0.5 text-[11.5px] font-bold">바로 쓰기</span>
          {quick.map((q) => (
            <Link
              key={q.type}
              href={`/write?type=${q.type}`}
              className="bd surface hover:bg-slate-500/8 inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-[12px] font-bold transition"
            >
              <span className="block size-[14px] opacity-60">
                <IconPencil />
              </span>
              {q.label}
              <span className="muted font-semibold">{q.why}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* ─── 어디까지 왔는지 ─── */}
      <nav aria-label="진행 단계" className="card mb-3.5 rounded-[22px] px-2 py-3.5 sm:px-4">
        <ol className="flex items-start">
          {steps.map((s, i) => {
            const current = i === stepNow
            const line = (side: 'l' | 'r') => {
              const filled = side === 'l' ? i <= stepNow || steps[i - 1]?.done : i < stepNow
              return (
                <span
                  aria-hidden
                  className={`h-[2px] flex-1 rounded-full ${
                    (side === 'l' && i === 0) || (side === 'r' && i === steps.length - 1)
                      ? 'opacity-0'
                      : filled
                        ? 'bg-brand-500/35'
                        : 'bg-slate-500/15'
                  }`}
                />
              )
            }
            return (
              <li key={s.label} className="min-w-0 flex-1">
                <Link
                  href={s.href}
                  aria-current={current ? 'step' : undefined}
                  className="group flex flex-col items-center gap-1.5"
                >
                  <span className="flex w-full items-center">
                    {line('l')}
                    <span
                      className={`tnum flex size-7 shrink-0 items-center justify-center rounded-full text-[11.5px] font-extrabold transition ${
                        current
                          ? 'bg-brand-600 text-white shadow-[0_6px_14px_-6px_var(--color-brand-600)]'
                          : s.done
                            ? 'bg-brand-500/15 text-brand-700 dark:text-brand-100'
                            : 'surface muted bd border'
                      }`}
                    >
                      {s.done ? '✓' : i + 1}
                    </span>
                    {line('r')}
                  </span>
                  <span
                    className={`truncate text-[11px] font-bold sm:text-[12px] ${
                      current ? 'text-brand-700 dark:text-brand-100' : s.done ? '' : 'muted'
                    }`}
                  >
                    {s.label}
                  </span>
                </Link>
              </li>
            )
          })}
        </ol>
      </nav>

      <div className="mb-3.5 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        <Stat
          label="발행 완료"
          value={`${published.length}편`}
          hint={`초안·검수중 ${drafts.length}편`}
          icon={<IconDoc />}
          iconTone="blue"
        />
        <Stat
          label="정보 : 홍보"
          value={balance.ratio}
          hint="권장 2 : 1"
          tone={balance.level === 'good' ? 'good' : balance.level === 'warn' ? 'warn' : 'bad'}
          icon={<IconBalance />}
          iconTone="violet"
        />
        <Stat
          label="1페이지 진입"
          value={`${firstPage.length}개`}
          hint={`추적 ${views.length}개 중`}
          tone={firstPage.length ? 'good' : 'default'}
          icon={<IconTarget />}
          iconTone="brand"
        />
        <Stat
          label="순위 변동"
          value={`↑${risen.length} ↓${fallen.length}`}
          hint="직전 조회 대비"
          tone={fallen.length > risen.length ? 'bad' : risen.length ? 'good' : 'default'}
          icon={<IconTrend />}
          iconTone="gold"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card
          title="발행 균형 · 주기"
          subtitle="정보글이 키운 신뢰도를 홍보글이 수확하는 구조입니다. 홍보글만 연속 발행하면 상업성 과다 신호가 쌓입니다."
        >
          <div className="space-y-4">
            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="text-[13px] font-semibold">최근 발행 구성</span>
                <span className="tnum muted text-xs">
                  정보 {balance.info} · 홍보 {balance.promo} · 후기 {balance.review}
                </span>
              </div>
              <div className="flex h-2.5 gap-[2px] overflow-hidden rounded-full">
                {balance.info > 0 && (
                  <div
                    className="bg-[#2a78d6] dark:bg-[#3987e5]"
                    style={{ flex: balance.info }}
                    title={`정보글 ${balance.info}편`}
                  />
                )}
                {balance.promo > 0 && (
                  <div
                    className="bg-[#eb6834] dark:bg-[#d95926]"
                    style={{ flex: balance.promo }}
                    title={`홍보글 ${balance.promo}편`}
                  />
                )}
                {balance.review > 0 && (
                  <div
                    className="bg-[#1baf7a] dark:bg-[#199e70]"
                    style={{ flex: balance.review }}
                    title={`후기글 ${balance.review}편`}
                  />
                )}
                {!balance.info && !balance.promo && !balance.review && (
                  <div className="w-full bg-slate-500/15" />
                )}
              </div>
              <div className="muted mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                <span className="inline-flex items-center gap-1">
                  <i className="inline-block size-2 rounded-full bg-[#2a78d6] dark:bg-[#3987e5]" /> 정보글
                </span>
                <span className="inline-flex items-center gap-1">
                  <i className="inline-block size-2 rounded-full bg-[#eb6834] dark:bg-[#d95926]" /> 홍보글
                </span>
                <span className="inline-flex items-center gap-1">
                  <i className="inline-block size-2 rounded-full bg-[#1baf7a] dark:bg-[#199e70]" /> 후기글
                </span>
              </div>
              <p className="mt-2 text-[12px] leading-relaxed">{balance.message}</p>
            </div>

            <div className="bd border-t pt-3.5">
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="text-[13px] font-semibold">발행 주기</span>
                <span className="tnum muted text-xs">최근 2주 {cadence.last14}편</span>
              </div>
              <Progress
                value={(cadence.last14 / 6) * 100}
                tone={cadence.level === 'good' ? 'good' : cadence.level === 'warn' ? 'warn' : 'bad'}
              />
              <p className="mt-2 text-[12px] leading-relaxed">{cadence.message}</p>
            </div>
          </div>
        </Card>

        <Card
          title="최근 글"
          subtitle="점수는 이 앱의 검수 기준(키워드·분량·저품질 위험) 통과율입니다"
          right={
            <Link href="/posts" className="muted text-xs font-semibold hover:underline">
              전체 보기
            </Link>
          }
        >
          {recent.length === 0 ? (
            <Empty>
              아직 작성한 글이 없습니다.{' '}
              <Link href="/write" className="text-brand-600 dark:text-brand-100 font-semibold underline">
                글 작성으로 이동
              </Link>
            </Empty>
          ) : (
            <ul className="space-y-3">
              {recent.map((p) => {
                const store = db.stores.find((s) => s.id === p.storeId)
                const result = checkPost({
                  type: p.type,
                  title: p.title,
                  body: p.body,
                  mainKeyword: p.mainKeyword,
                  subKeywords: p.subKeywords,
                  localKeyword: p.localKeyword,
                  tags: p.tags,
                  legalName: store?.legalName,
                  womenOnly: store?.womenOnly,
                  sponsorship: p.sponsorship ?? 'unset',
                  eventText: p.eventText,
                  // 요청 반영 검사 (2026-08-19)
                  request: p.request,
                  placeReviews: store?.placeReviews,
                  placeId: store?.placeId,
                  evidence,
                })
                return (
                  <li key={p.id}>
                    <Link href={`/write?id=${p.id}`} className="group block">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-semibold group-hover:underline">
                            {p.title || '(제목 없음)'}
                          </p>
                          <p className="muted mt-0.5 truncate text-[11px]">
                            {POST_TYPE_LABEL[p.type]} · {store?.name ?? '지점 미지정'} ·{' '}
                            {p.mainKeyword || '키워드 미지정'}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <Badge tone={p.status === 'published' ? 'good' : p.status === 'reviewed' ? 'info' : 'default'}>
                            {POST_STATUS_LABEL[p.status]}
                          </Badge>
                          <div
                            className={`tnum mt-1 text-xs font-bold ${
                              result.score >= 85
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : result.score >= 65
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            {result.score}점
                          </div>
                        </div>
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        <Card
          title="순위 요약"
          subtitle="발행한 글이 실제로 몇 위인지"
          right={
            <Link href="/rank" className="muted text-xs font-semibold hover:underline">
              추적 관리
            </Link>
          }
        >
          {views.length === 0 ? (
            <Empty>
              추적 중인 키워드가 없습니다.{' '}
              <Link href="/rank" className="text-brand-600 dark:text-brand-100 font-semibold underline">
                등록하기
              </Link>
            </Empty>
          ) : (
            <ul className="space-y-2.5">
              {views.slice(0, 6).map((v) => (
                <li key={v.target.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-[13px]">{v.target.keyword}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    {v.delta !== null && v.delta !== 0 && (
                      <span
                        className={`tnum text-[11px] font-bold ${
                          v.delta > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {v.delta > 0 ? `▲ ${v.delta}` : `▼ ${Math.abs(v.delta)}`}
                      </span>
                    )}
                    <Badge tone={isFirstPage(v.current) ? 'good' : v.current === null ? 'default' : 'warn'}>
                      {rankLabel(v.current)}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/*
          지점별 최신성.

          관찰소 6회(상위 글 60편)에서 최신성이 +0.63 으로 가장 셌고 거꾸로 나온 적이
          한 번도 없다. 그래서 「무엇을 쓸까」보다 「어느 지점이 비었나」가 먼저인 경우가
          많다 — 발행 주기 카드는 회사 전체 페이스라 지점 하나가 3주째 비어 있어도 초록이다.
        */}
        <Card
          title="지점별 최신성"
          subtitle={`관찰 6회에서 최신성이 가장 센 신호였습니다 (유리 5회 · 거꾸로 0회). ${STALE_DAYS}일 넘게 빈 지점을 먼저 채우세요.`}
          right={
            <Link href="/stores" className="muted text-xs font-semibold hover:underline">
              지점 관리
            </Link>
          }
        >
          {freshness.length === 0 ? (
            <Empty>
              등록된 지점이 없습니다.{' '}
              <Link href="/stores" className="text-brand-600 dark:text-brand-100 font-semibold underline">
                지점 등록
              </Link>
            </Empty>
          ) : (
            <>
              <ul className="space-y-2.5">
                {freshness.map((f) => (
                  <li key={f.storeId} className="flex items-center justify-between gap-3">
                    <Link
                      href={`/write?store=${encodeURIComponent(f.storeId)}`}
                      className="min-w-0 truncate text-[13px] font-semibold hover:underline"
                    >
                      {f.storeName}
                    </Link>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="tnum muted text-[11px]">
                        {f.lastPublished ?? '발행 없음'}
                      </span>
                      <Badge tone={f.stale ? (f.days === null ? 'bad' : 'warn') : 'good'}>
                        {f.days === null ? '없음' : `${f.days}일 전`}
                      </Badge>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[12px] leading-relaxed">
                {staleStores.length ? staleStores[0].message : freshness[0].message}
              </p>
            </>
          )}
        </Card>
      </div>

      <Card
        className="mt-4"
        title="네이버 랭킹 로직 요약"
        subtitle="네이버가 공개한 설명과 업계 통설입니다 — 우리가 직접 잰 것은 상위노출 분석 화면의 관찰소에 있고, 둘이 어긋나면 관찰 쪽을 따릅니다"
        right={
          <Link href="/guide" className="muted text-xs font-semibold hover:underline">
            전체 가이드
          </Link>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            {
              t: 'C-Rank — 출처 신뢰도',
              d: '문서가 아니라 블로그 자체를 평가합니다. 한 주제로 꾸준히 쌓은 블로그가 상위에 갑니다. 카테고리는 2~3개 이내로 집중하세요.',
            },
            {
              t: 'D.I.A. / D.I.A.+ — 문서 품질',
              d: '직접 경험과 검색 의도 부합을 봅니다. 키워드 횟수보다 패턴을 보고, 영상 삽입에 가산점이 있습니다.',
            },
            {
              t: '에어서치 · 스마트블록',
              d: '검색어를 의도 단위로 쪼개 블록별로 노출합니다. 제목에 메인 키워드 + 세부 의도를 함께 담으면 진입에 유리합니다.',
            },
          ].map((x) => (
            <div key={x.t} className="surface bd rounded-xl border p-3.5">
              <h3 className="text-[13px] font-bold">{x.t}</h3>
              <p className="muted mt-1.5 text-[12px] leading-relaxed">{x.d}</p>
            </div>
          ))}
        </div>
      </Card>
    </>
  )
}
