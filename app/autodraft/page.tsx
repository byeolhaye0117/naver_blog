import Link from 'next/link'
import { readDB } from '@/lib/store'
import { PageHeader } from '@/components/AppShell'
import { Badge, Card, Empty } from '@/components/ui'
import { autoDraftDays, forecastAutoDrafts, hasTodayAutoDraft } from '@/lib/writing/autodraft'
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
  const keywordPool = [
    ...new Set(
      [...db.rankTargets.map((t) => t.keyword), ...db.stores.flatMap((s) => s.localKeywords ?? [])]
        .map((k) => k.trim())
        .filter(Boolean)
    ),
  ]
  /*
   * 앞으로 이레치를 미리 계산한다. 고르는 규칙이 정해져 있어서 가능하다 (같은 입력이면
   * 같은 답이 나온다). 오늘 것이 이미 있으면 내일부터 — 이미 쓴 날을 「예정」이라고 하면 안 된다.
   */
  const forecast = forecastAutoDrafts({
    plan: db.autoDraftPlan,
    posts: db.posts,
    fallbackKeywords: keywordPool,
    from: today,
    days: 7,
  })
  const days = autoDraftDays({ runs: db.autoDraftRuns, forecast, today })

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
        // 이 화면 전체가 자동 작성이다 — 설정을 접어 둘 이유가 없다 (2026-08-24)
        settingsOpen
        /*
         * 고를 수 있는 키워드 — 순위 추적에 등록한 것이 먼저다 (회원이 「이걸로 올라가고
         * 싶다」고 적어둔 목록이라 자동 글이 그 밖으로 나가지 않는다). 지점의 지역 키워드도
         * 함께 보여준다 — 아직 순위 추적을 안 걸었어도 고를 수 있어야 한다.
         */
        keywordPool={keywordPool}
      />

      {/*
        **날짜별 한 목록** (2026-08-24 회원 요청).

        "이거는 매일 달라질거야 그래서 날짜별로 목록이 보이게 만들어달란 소리였어."

        「지금 저장된 설정」은 범위만 말해준다 (키워드 3개 · 주제 5개). 실제로 쓰이는 조합은
        매일 달라지고, 회원이 알고 싶은 것은 **「그래서 내일은 뭘 쓰지」**다.

        지난 기록과 앞으로 쓸 것을 한 목록에 둔다 — 따로 두면 「어제 건 어디 있지」를 두 번
        찾는다.
      */}
      <Card
        title="날짜별 목록"
        subtitle="앞으로 쓸 것과 지금까지 쓴 것입니다. 예정은 지금 설정 기준이라, 사이에 손으로 정보글을 쓰거나 설정을 바꾸면 달라집니다."
      >
        {days.length === 0 ? (
          <Empty>
            {db.autoDraftPlan?.off
              ? '자동 초안을 꺼두셨습니다. 위에서 다시 켜면 날짜별 예정이 나옵니다.'
              : '쓸 키워드가 없습니다. 순위 추적에 키워드를 등록하거나 위에서 골라주세요.'}
          </Empty>
        ) : (
          <ul className="space-y-2">
            {days.map((d) => (
              <li
                key={d.date}
                className={`rounded-xl px-3.5 py-3 ${
                  d.when === 'upcoming' ? 'bd border border-dashed' : 'panel'
                }`}
              >
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                  <span className="tnum text-[12px] font-bold">{d.date.slice(5).replace('-', '/')}</span>
                  {d.when === 'today' && <Badge tone="info">오늘</Badge>}
                  {d.when === 'upcoming' && <Badge tone="default">예정</Badge>}
                  {d.ok === true && <Badge tone="good">성공</Badge>}
                  {d.ok === false && <Badge tone="bad">실패</Badge>}
                  {d.manual && <Badge tone="default">직접 실행</Badge>}
                  {typeof d.score === 'number' && <Badge tone="info">{d.score}점</Badge>}
                </div>
                <p className="text-[13px] leading-snug font-semibold">
                  {d.keyword} <span className="muted font-medium">· {d.topic}</span>
                </p>
                {d.ok === false && d.error && (
                  <p className="mt-1 text-[11.5px] leading-relaxed text-rose-700 dark:text-rose-300">{d.error}</p>
                )}
                {d.postId && (
                  <Link
                    href={`/write?id=${d.postId}`}
                    className="text-brand-600 dark:text-brand-100 mt-1 inline-block text-[11.5px] font-semibold underline"
                  >
                    그날 쓴 글 열기 →
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

    </>
  )
}
