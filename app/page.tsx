import Link from 'next/link'
import { readDB } from '@/lib/store'
import { keyStatus } from '@/lib/naver/client'
import { balanceReport, cadenceReport } from '@/lib/writing/rotation'
import { buildRankViews, isFirstPage, rankLabel } from '@/lib/analysis/rank'
import { checkPost } from '@/lib/writing/checker'
import { POST_STATUS_LABEL, POST_TYPE_LABEL } from '@/lib/types'
import { PageHeader } from '@/components/AppShell'
import { Badge, Card, Empty, Progress, Stat } from '@/components/ui'
import StorageNotice from '@/components/StorageNotice'

export const dynamic = 'force-dynamic'

export default async function Dashboard() {
  const db = await readDB()
  const keys = keyStatus()
  const balance = balanceReport(db.posts)
  const cadence = cadenceReport(db.posts)
  const views = buildRankViews(db.rankTargets, db.rankSnapshots, db.posts)

  const published = db.posts.filter((p) => p.status === 'published')
  const drafts = db.posts.filter((p) => p.status !== 'published')
  const firstPage = views.filter((v) => isFirstPage(v.current))
  const risen = views.filter((v) => v.delta !== null && v.delta > 0)
  const fallen = views.filter((v) => v.delta !== null && v.delta < 0)

  const recent = [...db.posts]
    .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
    .slice(0, 5)

  const todo: { text: string; href: string; tone: 'good' | 'warn' | 'bad' }[] = []
  if (!keys.search) {
    todo.push({
      text: '네이버 검색 API 키를 넣으면 상위노출 분석·순위 추적이 실제 데이터로 동작합니다 (발급 안내 보기)',
      href: '/deploy',
      tone: 'warn',
    })
  }
  if (!keys.searchAd) {
    todo.push({
      text: '검색광고 API 키를 넣으면 키워드 월간 검색량을 실제 값으로 볼 수 있습니다 (발급 안내 보기)',
      href: '/deploy',
      tone: 'warn',
    })
  }
  todo.push({ text: balance.message, href: '/write', tone: balance.level })
  todo.push({ text: cadence.message, href: '/posts', tone: cadence.level })
  if (drafts.length) {
    todo.push({
      text: `검수 대기 중인 초안 ${drafts.length}편이 있습니다`,
      href: '/posts',
      tone: 'warn',
    })
  }
  if (fallen.length) {
    todo.push({
      text: `순위가 떨어진 키워드 ${fallen.length}개 — 밀린 이유를 상위노출 분석으로 확인하세요`,
      href: '/rank',
      tone: 'bad',
    })
  }
  if (!db.rankTargets.length && published.length) {
    todo.push({ text: '발행한 글을 순위 추적에 등록해두면 변동을 매일 기록할 수 있습니다', href: '/rank', tone: 'warn' })
  }

  return (
    <>
      <PageHeader
        title="대시보드"
        desc="블로그 단위로 관리해야 상위노출이 유지됩니다. 글 하나가 아니라 발행 균형·주기·순위를 함께 봅니다."
      />

      <StorageNotice />

      <div className="mb-5 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        <Stat label="발행 완료" value={`${published.length}편`} hint={`초안·검수중 ${drafts.length}편`} />
        <Stat
          label="정보 : 홍보"
          value={balance.ratio}
          hint="권장 2 : 1"
          tone={balance.level === 'good' ? 'good' : balance.level === 'warn' ? 'warn' : 'bad'}
        />
        <Stat
          label="1페이지 진입"
          value={`${firstPage.length}개`}
          hint={`추적 ${views.length}개 중`}
          tone={firstPage.length ? 'good' : 'default'}
        />
        <Stat
          label="순위 변동"
          value={`↑${risen.length} ↓${fallen.length}`}
          hint="직전 조회 대비"
          tone={fallen.length > risen.length ? 'bad' : risen.length ? 'good' : 'default'}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="지금 할 일" subtitle="블로그 지수를 지키는 데 가장 먼저 필요한 순서입니다">
          <ul className="space-y-2.5">
            {todo.map((t, i) => (
              <li key={i}>
                <Link href={t.href} className="flex items-start gap-2.5 group">
                  <Badge tone={t.tone === 'good' ? 'good' : t.tone === 'warn' ? 'warn' : 'bad'}>
                    {t.tone === 'good' ? '양호' : t.tone === 'warn' ? '확인' : '조치'}
                  </Badge>
                  <span className="text-[13px] leading-relaxed group-hover:underline">{t.text}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>

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
      </div>

      <Card
        className="mt-4"
        title="네이버 랭킹 로직 요약"
        subtitle="이 앱의 모든 검수 기준이 여기서 나옵니다"
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
            <div key={x.t} className="bd rounded-lg border p-3">
              <h3 className="text-[13px] font-bold">{x.t}</h3>
              <p className="muted mt-1.5 text-[12px] leading-relaxed">{x.d}</p>
            </div>
          ))}
        </div>
      </Card>
    </>
  )
}
