import Link from 'next/link'
import { readDB } from '@/lib/store'
import { PageHeader } from '@/components/AppShell'
import { Badge, Card, Empty } from '@/components/ui'
import { hasTodayAutoDraft, isAutoDraft } from '@/lib/writing/autodraft'
import AutoDraftPanel from '../posts/AutoDraftPanel'

export const dynamic = 'force-dynamic'

/**
 * **자동 작성 — 한 화면에 모은다** (2026-08-24 회원 요청).
 *
 * "어디 있는지 모르겠으니까 자동작성 탭을 하나 만들어서 볼수 있게 해줘."
 *
 * 그동안 이 기능은 발행 관리 화면의 접이식 칸 안에 있었다. 매일 도는 기능인데 **찾아
 * 들어가야 하는 자리**에 있었던 것이 문제였다 — 회원이 「저장된 내용 어디서 봐야해」라고
 * 물은 것도 같은 이유다.
 *
 * 여기서 세 가지를 한 화면에 놓는다:
 *   ① 지금 어떤 상태인가 · 무엇으로 쓸지 설정 (AutoDraftPanel)
 *   ② 자동으로 쓴 글 목록 — 실제로 나온 결과
 *   ③ 실행 기록 — 언제 돌았고 성공했는지, 실패했으면 왜인지
 */
export default async function AutoDraftPage() {
  const db = await readDB()
  const today = new Date().toISOString().slice(0, 10)
  const autoPosts = db.posts
    .filter(isAutoDraft)
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
  const runs = db.autoDraftRuns ?? []

  return (
    <>
      <PageHeader
        title="자동 작성"
        desc="매일 새벽 5시에 정보글 초안을 한 편 써 둡니다. 무엇으로 쓸지 여기서 정하고, 실제로 나온 글과 실행 기록도 여기서 봅니다. 발행 버튼은 회원님이 누르셔야 합니다 — 네이버는 자동 발행을 열어두지 않습니다."
      />

      <AutoDraftPanel
        runs={db.autoDraftRuns}
        today={today}
        hasTodayDraft={hasTodayAutoDraft(db.posts, today)}
        plan={db.autoDraftPlan}
        /*
         * 고를 수 있는 키워드 — 순위 추적에 등록한 것이 먼저다 (회원이 「이걸로 올라가고
         * 싶다」고 적어둔 목록이라 자동 글이 그 밖으로 나가지 않는다). 지점의 지역 키워드도
         * 함께 보여준다 — 아직 순위 추적을 안 걸었어도 고를 수 있어야 한다.
         */
        keywordPool={[
          ...new Set(
            [...db.rankTargets.map((t) => t.keyword), ...db.stores.flatMap((s) => s.localKeywords ?? [])]
              .map((k) => k.trim())
              .filter(Boolean)
          ),
        ]}
      />

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card
          title="자동으로 쓴 글"
          subtitle="여기 있는 글은 아직 초안입니다. 열어서 사진을 넣고 회원님이 발행하시면 됩니다."
        >
          {autoPosts.length === 0 ? (
            <Empty>아직 자동으로 쓴 글이 없습니다. 위에서 「지금 한 편 쓰기」를 눌러 바로 만들어 볼 수 있습니다.</Empty>
          ) : (
            <ul className="space-y-2">
              {autoPosts.slice(0, 12).map((p) => (
                <li key={p.id} className="panel rounded-xl px-3.5 py-3">
                  <div className="mb-1 flex flex-wrap items-center gap-1.5">
                    <Badge
                      tone={p.status === 'published' ? 'good' : p.status === 'reviewed' ? 'info' : 'default'}
                    >
                      {p.status === 'published' ? '발행완료' : p.status === 'reviewed' ? '검수완료' : '초안'}
                    </Badge>
                    <span className="muted text-[11px] font-semibold">{(p.createdAt ?? '').slice(0, 10)}</span>
                  </div>
                  <Link href={`/write?id=${p.id}`} className="block text-[13.5px] font-semibold hover:underline">
                    {p.title || '(제목 없음)'}
                  </Link>
                  <p className="muted mt-0.5 text-[11px]">
                    {p.mainKeyword || '키워드 미지정'} · {p.autoTopic ?? '주제 미상'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="실행 기록"
          subtitle="성공이든 실패든 남깁니다. 조용히 실패하는 자동화는 없는 것보다 나쁩니다 — 준비된 줄 알고 기다리게 되니까요."
        >
          {runs.length === 0 ? (
            <Empty>아직 실행 기록이 없습니다.</Empty>
          ) : (
            <ul className="space-y-2">
              {runs.slice(0, 12).map((r) => (
                <li key={r.at} className="panel rounded-xl px-3.5 py-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={r.ok ? 'good' : 'bad'}>{r.ok ? '성공' : '실패'}</Badge>
                    <span className="muted tnum text-[11px] font-semibold">{r.date}</span>
                    {r.manual && <Badge tone="default">직접 실행</Badge>}
                    {typeof r.score === 'number' && <Badge tone="info">{r.score}점</Badge>}
                  </div>
                  <p className="mt-1 text-[12px] leading-relaxed">
                    {r.ok ? (
                      <>
                        「{r.keyword}」 · {r.topic}
                        {r.postId && (
                          <>
                            {' '}
                            <Link href={`/write?id=${r.postId}`} className="text-brand-600 dark:text-brand-100 font-semibold underline">
                              글 열기
                            </Link>
                          </>
                        )}
                      </>
                    ) : (
                      <span className="text-rose-700 dark:text-rose-300">{r.error ?? '이유가 기록되지 않았습니다'}</span>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}
