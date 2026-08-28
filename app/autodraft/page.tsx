import { readDB } from '@/lib/store'
import { PageHeader } from '@/components/AppShell'
import { Card } from '@/components/ui'
import {
  autoDraftDays,
  hasTodayAutoDraft,
  normalizePlan,
  perDayOf,
  plannedAssignments,
  seoulToday,
  todayAutoDraftCount,
} from '@/lib/writing/autodraft'
import AutoDraftPanel from '../posts/AutoDraftPanel'
import DayList from './DayList'

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
  // 회원이 말하는 「오늘」은 한국 시간의 오늘이다 (2026-08-26 — UTC 로 세서 하루씩 밀렸다)
  const today = seoulToday()
  /*
   * **앞날은 회원이 채워 둔 날만** (2026-08-25 회원 지적: "나는 하루씩만 설정하고 싶다고.
   * 근데 왜 자꾸 그 후의 일정까지 설정되게 하는거야!").
   *
   * 예전에는 로테이션을 앞으로 돌려 이레치를 그렸다. 참고용이라고 적어 뒀지만 **줄로 서
   * 있는 것은 정해진 일정으로 읽힌다** — 하루만 채웠는데 닷새가 더 잡혀 있으니 당연하다.
   */
  /*
   * **쉬기로 한 날은 앞날에 넣지 않는다** (2026-08-26). 화면에 08/26 이 「삭제함 — 이 날은
   * 쓰지 않습니다」와 「미리 채워둠」으로 **동시에** 떴다. 크론은 쉬는 날을 먼저 보므로 그 날은
   * 실제로 안 쓴다 — 「채워뒀다」고 적어두면 거짓말이다.
   */
  const plan = normalizePlan(db.autoDraftPlan)
  /*
   * 채워 둔 날에 **어떤 키워드가 나갈지도 함께 센다** (2026-08-26 회원 요청: "키워드도
   * 보이게 해줘"). 키워드는 그 날 아침에 정해지지만 규칙이 있어 미리 셀 수 있다 — 다만
   * 그 사이에 손으로 정보글을 쓰면 달라지므로 화면이 「예상」이라고 적는다.
   */
  const planned = plannedAssignments({ plan, posts: db.posts, from: today })
  const days = autoDraftDays({ runs: db.autoDraftRuns, planned, today })

  return (
    <>
      <PageHeader
        title="자동 작성"
        desc="매일 새벽 5시부터 정보글 초안을 써 둡니다 (하루 편수는 아래에서 정합니다 — 5·6·7시에 한 편씩). 무엇으로 쓸지 여기서 정하고, 실제로 나온 글과 실행 기록도 여기서 봅니다. 발행 버튼은 회원님이 누르셔야 합니다 — 네이버는 자동 발행을 열어두지 않습니다."
      />

      <AutoDraftPanel
        runs={db.autoDraftRuns}
        today={today}
        hasTodayDraft={hasTodayAutoDraft(db.posts, today)}
        // 오늘 몇 편 썼고 몇 편이 목표인가 — 상태 줄이 그것을 말한다 (2026-08-28)
        perDay={{ wrote: todayAutoDraftCount(db.posts, today), want: perDayOf(db.autoDraftPlan) }}
        plan={db.autoDraftPlan}
        // 이 화면 전체가 자동 작성이다 — 설정을 접어 둘 이유가 없다 (2026-08-24)
        settingsOpen
      />

      {/*
        **날짜별 한 목록** (2026-08-24 회원 요청).

        "이거는 매일 달라질거야 그래서 날짜별로 목록이 보이게 만들어달란 소리였어."

        지난 기록과 **회원이 채워 둔 앞날**을 한 목록에 둔다 — 따로 두면 「어제 건 어디
        있지」를 두 번 찾는다. 채우지 않은 날은 여기 없다 (2026-08-25).
      */}
      <Card
        title="날짜별 목록"
        subtitle="지금까지 쓴 것과, 위에서 채워 두신 날입니다. 채우지 않은 날은 여기 나오지 않습니다 — 그 날이 되면 앱이 그날그날 골라 씁니다."
      >
        <DayList
          days={days}
          plan={db.autoDraftPlan}
          today={today}
          emptyNote={
            db.autoDraftPlan?.off
              ? '자동 초안을 꺼두셨습니다. 위에서 다시 켜면 매일 새벽에 한 편씩 씁니다.'
              : '아직 쓴 글도, 채워 두신 날도 없습니다. 매일 새벽 5시부터 한 편씩 쓰고, 쓴 날은 여기에 쌓입니다.'
          }
        />
      </Card>

    </>
  )
}
