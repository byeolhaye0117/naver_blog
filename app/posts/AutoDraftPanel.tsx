'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { AutoDraftPlan, AutoDraftRun } from '@/lib/types'
import {
  AUTO_DRAFT_MAX_PER_DAY,
  INFO_TOPICS,
  autoDraftStatus,
  normalizePlan,
  perDayOf,
  planSummary,
  rerollTopic,
} from '@/lib/writing/autodraft'
import { Badge, btnGhost, btnPrimary, inputClass } from '@/components/ui'
import TopicExplorer from '@/components/TopicExplorer'

/**
 * **매일 정보글 초안 — 지금 어떤 상태인가, 그리고 직접 한 편 쓰기.**
 *
 * 이 화면이 없던 동안 회원이 물었다: "안뜨는데? 제대로 하고 있는거 맞아?" 그때 크론은
 * 돌다가 실패했는데 화면에는 아무 흔적이 없었다. **조용히 실패하는 자동화는 없는 것보다
 * 나쁘다** — 회원은 글이 준비된 줄 알고 기다린다.
 *
 * 그래서 여기서 두 가지를 한다. ① 마지막 실행이 언제 어떻게 끝났는지 늘 보여준다.
 * ② 실패한 날 기다리지 않고 **지금 한 편** 돌릴 수 있게 한다.
 */
export default function AutoDraftPanel({
  runs,
  today,
  hasTodayDraft,
  perDay,
  plan: savedPlan,
  settingsOpen = false,
}: {
  runs?: AutoDraftRun[]
  today: string
  hasTodayDraft: boolean
  /** 오늘 몇 편 썼나 · 몇 편이 목표인가 (2026-08-28) */
  perDay?: { wrote: number; want: number }
  /** 회원이 정해 둔 것 (2026-08-23) */
  plan?: AutoDraftPlan
  /**
   * 설정을 펼친 채로 열까.
   *
   * 자동 작성 화면(/autodraft)에서는 **펼쳐 둔다** — 그 화면 전체가 이 기능이라 접어 둘
   * 이유가 없다. 회원이 접힌 줄만 보고 물었다 (2026-08-24): "저장한 목록이 안나오는데?"
   */
  settingsOpen?: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const status = autoDraftStatus(runs, today, hasTodayDraft, perDay)

  /*
   * **저장본과 편집본을 따로 든다** (2026-08-24).
   *
   * 회원 질문: "저장된 내용 수정하거나 삭제 확인하고 싶으면 어디서 봐야해?" 화면에 편집 중인
   * 값만 있으면 **「이게 저장된 건가, 내가 방금 누른 건가」를 구별할 수 없다.** 칩을 눌러
   * 뺐는데 저장을 안 하고 나가면 그대로 남아 있는데도 뺀 줄 안다.
   *
   * 그래서 저장본을 따로 들고, 둘이 다르면 화면이 「아직 저장 안 됨」이라고 말한다.
   */
  const [stored, setStored] = useState<AutoDraftPlan>(() => normalizePlan(savedPlan))
  const [plan, setPlan] = useState<AutoDraftPlan>(() => normalizePlan(savedPlan))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)
  const [fillFrom, setFillFrom] = useState(today)
  const [filling, setFilling] = useState(false)
  const [fillMsg, setFillMsg] = useState<string | null>(null)
  const same = (a: AutoDraftPlan, b: AutoDraftPlan) =>
    JSON.stringify([a.off === true, a.keywords ?? [], a.topics ?? [], a.days ?? [], a.skip ?? []]) ===
    JSON.stringify([b.off === true, b.keywords ?? [], b.topics ?? [], b.days ?? [], b.skip ?? []])
  const dirty = !same(plan, stored)

  /**
   * 주제 하나를 목록에 더한다 — **더하면서 곧바로 켠다.**
   *
   * 더하기만 하고 꺼진 채로 두면 회원은 담은 줄 알지만 실제로는 안 쓰인다 (고른 것이 없으면
   * 기본 10개 전부를 쓰는 규칙이라 티도 안 난다). 탐색기에서 담을 때도 같은 함수를 쓴다.
   */
  const addTopic = (raw: string) =>
    setPlan((p) => {
      const t = raw.replace(/\s+/g, ' ').trim()
      if (!t || (p.topics ?? []).includes(t)) return p
      return { ...p, topics: [...(p.topics ?? []), t] }
    })

  const toggle = (key: 'keywords' | 'topics', value: string) =>
    setPlan((p) => {
      const cur = p[key] ?? []
      return { ...p, [key]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value] }
    })

  async function save(next: AutoDraftPlan) {
    setSaving(true)
    setSaved(null)
    try {
      const res = await fetch('/api/autodraft/plan', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? '저장하지 못했습니다.')
      const fresh = normalizePlan(data.plan)
      setPlan(fresh)
      setStored(fresh)
      setSaved('저장했습니다. 내일 새벽부터 이 설정으로 씁니다.')
      router.refresh()
    } catch (e) {
      setSaved(e instanceof Error ? e.message : '저장하지 못했습니다.')
    }
    setSaving(false)
  }

  /**
   * **날짜만 받아 그 날들 주제를 채운다** — 회원은 주제를 고르지 않는다 (2026-08-25).
   *
   * 로테이션은 지금까지 쓴 글을 봐야 하므로 서버에서 계산한다. 받아온 것은 편집본에만 넣고
   * 저장은 아래 「설정 저장」에서 한다 — 여기서 바로 저장하면 고치던 다른 값이 덮인다.
   */
  async function fill() {
    setFilling(true)
    setFillMsg(null)
    try {
      const res = await fetch('/api/autodraft/fill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        /*
         * **고른 날 하루만** — 회원이 정하지 않은 날까지 잡아두지 않는다 (2026-08-25).
         * 다만 하루 편수만큼 채운다 (2026-08-28) — 두 편으로 정해 놓고 한 줄만 채우면
         * 나머지 한 편은 그날 아침 로테이션이 아무거나 고르게 된다.
         */
        body: JSON.stringify({ plan, from: fillFrom, count: perDayOf(plan) }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? '주제를 정하지 못했습니다.')
      const filled: { date: string; topic: string }[] = data?.days ?? []
      if (!filled.length)
        throw new Error('쓸 주제가 없어 정하지 못했습니다 — ①에서 주제를 담아 주세요.')
      /*
       * **채운 날은 쉬는 날에서 뺀다** (2026-08-26). 예전에 「삭제」로 뺐던 날을 다시 채우면
       * 두 곳에 같은 날짜가 남아 화면에 「이 날은 쓰지 않습니다」와 「미리 채워둠」이 함께
       * 떴다. 크론은 쉬는 날을 먼저 보므로 실제로는 안 쓰인다 — 나중에 한 일이 이긴다.
       */
      setPlan((p) => ({
        ...p,
        // 그 날에 이미 있던 줄은 새로 채운 것으로 갈아끼운다 (하루 여러 줄이 될 수 있다)
        days: [...(p.days ?? []).filter((x) => !filled.some((n) => n.date === x.date)), ...filled].sort(
          (a, b) => a.date.localeCompare(b.date)
        ),
        skip: (p.skip ?? []).filter((d) => !filled.some((n) => n.date === d)),
      }))
      setFillMsg(
        `${filled[0].date} 은 ${filled.map((f) => `「${f.topic}」`).join(' · ')}${
          filled.length > 1 ? ` (${filled.length}편)` : ''
        }으로 채웠습니다. 아래 「설정 저장」을 눌러야 반영됩니다.`
      )
    } catch (e) {
      setFillMsg(e instanceof Error ? e.message : '주제를 정하지 못했습니다.')
    }
    setFilling(false)
  }

  async function runNow() {
    setBusy(true)
    setMsg('쓰는 중입니다… 2~4분 걸립니다. 이 화면을 닫지 마세요.')
    try {
      const res = await fetch('/api/cron/draft', { method: 'POST' })
      const data = await res.json().catch(() => null)
      if (data?.saved) setMsg(`「${data.keyword}」 · ${data.topic} — ${data.score ?? '?'}점으로 저장했습니다.`)
      else setMsg(data?.skipped ?? data?.error ?? '쓰지 못했습니다.')
      router.refresh()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '쓰지 못했습니다.')
    }
    setBusy(false)
  }

  return (
    <div className="panel mb-4 rounded-xl px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={status.level}>매일 정보글 초안</Badge>
        <p className="muted min-w-0 flex-1 text-[12px] leading-relaxed">{status.text}</p>
        {status.canRun && (
          <button type="button" onClick={runNow} disabled={busy} className={`${btnGhost} !px-3 !py-2 !text-[12px]`}>
            {busy ? '쓰는 중…' : '지금 한 편 쓰기'}
          </button>
        )}
      </div>
      {msg && <p className="mt-2 text-[12px] leading-relaxed font-semibold">{msg}</p>}
      {/*
        발행까지 자동으로 해주는 것으로 오해하면 회원이 안 올리고 기다린다. 한 줄로 못 박는다.
        (네이버 블로그 글쓰기 API 는 없어졌고, 로그인 대행은 계정이 위험해진다.)
      */}
      <p className="muted mt-2 text-[11px] leading-relaxed">
        초안까지가 자동입니다. 사진을 넣고 발행 버튼을 누르는 것은 회원님이 하셔야 합니다 — 네이버는 자동 발행을
        열어두지 않습니다.
      </p>

      {/*
        **무엇으로 쓰는지를 접힌 채로도 한 줄 보여준다.** 설정을 열어 칩을 세어 보지 않아도
        「지금 무엇으로 돌고 있나」를 알 수 있어야 한다 — 안 그러면 고른 것이 지켜지는지
        확인할 방법이 없다.

        예약(「다음에 쓸 것 지정하기」) 칸은 회원 요청으로 뺐다 (2026-08-24). 매일 하나씩
        지정하게 하면 결국 손으로 쓰는 것과 같아진다 — 한 번 정해두면 손대지 않아도 되는
        것이 이 기능의 값이다.
      */}
      <details open={settingsOpen} className="bd mt-3 border-t pt-3">
        <summary className="flex cursor-pointer flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] font-bold select-none">
          무엇으로 쓸지 정하기
          <span className="muted text-[11.5px] font-semibold">{planSummary(plan)}</span>
        </summary>

        <div className="mt-3.5 space-y-5">
          {/*
            **지금 저장된 것을 맨 위에 보여준다** (2026-08-24).

            회원 질문: "저장된 내용 수정하거나 삭제 확인하고 싶으면 어디서 봐야해?" 여태
            저장된 값은 편집 칩에 섞여만 있었고, 그 칩들은 탐색 결과 아래에 파묻혀 있었다.
            **무엇이 저장돼 있는지 한 곳에서 보여야** 수정도 삭제도 할 수 있다.
          */}
          <section className="bd rounded-xl border px-3.5 py-3">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <h3 className="text-[12.5px] font-bold">지금 저장된 설정</h3>
              {dirty ? (
                <Badge tone="warn">아직 저장 안 됨</Badge>
              ) : (
                <Badge tone="good">저장됨</Badge>
              )}
              {dirty && (
                <button
                  type="button"
                  onClick={() => setPlan(stored)}
                  className="muted ml-auto rounded-lg px-2 py-1 text-[11px] font-semibold underline"
                >
                  되돌리기
                </button>
              )}
            </div>
            <dl className="space-y-1 text-[11.5px] leading-relaxed">
              <div className="flex gap-2">
                <dt className="muted w-11 shrink-0 font-semibold">상태</dt>
                <dd>
                  {stored.off
                    ? '꺼둠 — 자동으로 쓰지 않습니다'
                    : `매일 새벽 5시부터 ${perDayOf(stored)}편`}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="muted w-11 shrink-0 font-semibold">주제</dt>
                <dd>
                  {stored.topics?.length
                    ? `${stored.topics.join(' · ')} (${stored.topics.length}개)`
                    : `담은 것 없음 — 기본 주제 ${INFO_TOPICS.length}개를 씁니다`}
                </dd>
              </div>
              {/*
                **날짜 줄을 되살린다** (2026-08-25 회원 지적: "지금 저장된 설정에서 날짜가
                있어서 같은 주제로 매일 돌지 않게 해줘야해").

                여기 날짜가 안 보이면 회원은 「그래서 내일도 어제와 같은 걸 쓰나」를 알 수 없다.
                서른 줄을 늘어놓으면 그것대로 못 읽으니 앞의 셋만 적고 나머지는 개수로 줄인다.
              */}
              <div className="flex gap-2">
                <dt className="muted w-11 shrink-0 font-semibold">날짜</dt>
                <dd>
                  {stored.days?.length
                    ? `${stored.days
                        .slice(0, 3)
                        .map((d) => `${d.date.slice(5)} ${d.topic}`)
                        .join(' · ')}${stored.days.length > 3 ? ` 외 ${stored.days.length - 3}일` : ''}`
                    : '채워둔 날 없음 — 그날그날 앱이 골라 씁니다'}
                </dd>
              </div>
              {(stored.skip ?? []).length > 0 && (
                <div className="flex gap-2">
                  <dt className="muted w-11 shrink-0 font-semibold">쉬는 날</dt>
                  <dd>{(stored.skip ?? []).map((d) => d.slice(5)).join(' · ')}</dd>
                </div>
              )}
              <div className="flex gap-2">
                {/* 08-28: 조연이라고 이름을 붙인다 — 제목을 여는 말은 위 「주제」다 */}
                <dt className="muted w-11 shrink-0 font-semibold">지역</dt>
                <dd>
                  {stored.keywords?.length
                    ? `${stored.keywords.join(' · ')} (${stored.keywords.length}개) — 조연`
                    : '고른 것 없음 — 순위 추적 키워드 전부를 씁니다'}
                </dd>
              </div>
            </dl>
            <p className="muted mt-2 text-[11px] leading-relaxed">
              아래에서 고친 뒤 <b>「설정 저장」</b>을 눌러야 반영됩니다. 지우려면 칩을 다시 눌러 빼거나
              <b> 「전부 지우고 자동으로」</b>를 누르세요.
            </p>
          </section>

          <label className="flex items-center gap-2.5 text-[12.5px] font-semibold">
            <input
              type="checkbox"
              checked={plan.off !== true}
              onChange={(e) => setPlan((p) => ({ ...p, off: !e.target.checked }))}
              className="size-4 shrink-0"
            />
            매일 새벽 5시부터 정보글 초안 쓰기
          </label>

          {/*
            **하루 몇 편** (2026-08-28 회원 요청: "하루에 여러편 작성할 수 있게해줘").

            한 번에 몰아 쓰지 않는다 — 한 편에 생성 1회 + 고쳐 쓰기 최대 3회가 들고 함수
            실행 한도가 300초라, 두세 편을 한 번에 쓰면 한도를 넘겨 **아무것도 저장되지
            않는다.** 그래서 크론을 새벽 5·6·7시로 세 번 돌리고 한 번에 한 편씩 쓴다.
            상한(3)이 크론 시각 수와 같아야 하는 이유다.
          */}
          <section>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h3 className="text-[13px] font-bold">하루 몇 편</h3>
              <Badge tone="default">{perDayOf(plan)}편</Badge>
            </div>
            <p className="muted mb-2 text-[11px] leading-relaxed">
              새벽 <b>5시 · 6시 · 7시</b>에 한 편씩 씁니다 — 두 편이면 5시·6시, 세 편이면 7시까지입니다.
              한 번에 몰아 쓰지 않는 이유는 한 편에 검수·고쳐 쓰기까지 몇 분이 걸려서, 몰아 쓰면
              시간이 넘쳐 <b>한 편도 저장되지 않기</b> 때문입니다.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: AUTO_DRAFT_MAX_PER_DAY }, (_, i) => i + 1).map((n) => {
                const on = perDayOf(plan) === n
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPlan((p) => ({ ...p, perDay: n }))}
                    className={`rounded-full border px-3 py-1.5 text-[11.5px] font-semibold transition ${
                      on ? 'bg-brand-600 border-brand-600 text-white' : 'bd hover:bg-slate-500/8'
                    }`}
                  >
                    하루 {n}편
                  </button>
                )
              })}
            </div>
          </section>

          {/* ── ① 주제 = 정보글 메인 키워드 (탐색기에서 담은 것만) ── */}
          <section>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              {/* 08-28: 이것이 곧 정보글 메인 키워드다 — 그래서 ①로 올렸다 (아래 ② 주석 참고) */}
              <h3 className="text-[13px] font-bold">① 쓸 주제 (= 정보글 메인 키워드)</h3>
              <Badge tone={plan.topics?.length ? 'good' : 'default'}>
                {plan.topics?.length ? `${plan.topics.length}개 담음` : '기본 주제'}
              </Badge>
            </div>
            <p className="muted mb-2 text-[11px] leading-relaxed">
              <b>담은 주제가 그대로 제목을 엽니다</b> — 정보글의 메인 키워드가 이것입니다.
              아래 탐색에서 담은 주제만 씁니다. 하나도 안 담으면 기본 주제 {INFO_TOPICS.length}개를 씁니다.
              <b> 어느 날 어느 주제를 쓸지는 앱이 정합니다</b> — 담은 것 안에서 오래 안 쓴 순서로 돌아가므로
              날마다 다른 글이 나옵니다.
            </p>

            {/*
              **하나만 담으면 매일 같은 주제가 나온다** (2026-08-25).

              회원이 「키토다이어트」 하나만 담아두고 물었다: "주제가 매번 같은게 나와."
              담긴 것 안에서 도는 규칙이라 하나뿐이면 돌 곳이 없다 — 화면이 그 자리에서
              말해줘야 한다. 안 그러면 규칙을 아는 사람만 알 수 있다.
            */}
            {(plan.topics ?? []).length === 1 && (
              <p className="mb-2 rounded-xl border border-amber-500/40 bg-amber-500/8 px-3 py-2 text-[11.5px] leading-relaxed font-semibold text-amber-800 dark:text-amber-200">
                주제를 하나만 담으셨습니다 — 이러면 <b>매일 같은 주제</b>가 나옵니다. 날마다 다르게 하려면 몇 개 더
                담으시거나, 담은 것을 모두 빼서 기본 주제 {INFO_TOPICS.length}개로 돌리세요.
              </p>
            )}

            {/*
              담은 것을 위에 모아 보여준다 — 탐색 결과 안에 섞여 있으면 「내가 뭘 골랐더라」를
              스크롤해서 찾아야 한다.
            */}
            {(plan.topics ?? []).length > 0 && (
              <ul className="mb-2.5 flex flex-wrap gap-1.5">
                {(plan.topics ?? []).map((t) => (
                  <li key={t}>
                    <button
                      type="button"
                      onClick={() => toggle('topics', t)}
                      title="빼기"
                      className="bg-brand-600 border-brand-600 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11.5px] font-semibold text-white"
                    >
                      {t}
                      <span aria-hidden className="opacity-70">
                        ×
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/*
              **탐색은 접어 둔다.** 결과 열두 줄이 펼쳐지면 위의 「저장된 설정」과 아래의
              「설정 저장」 버튼이 화면 밖으로 밀려난다 — 회원이 "저장된 내용 어디서 봐야해"
              라고 물은 것이 그 상태였다.
            */}
            <details className="bd rounded-xl border px-3.5 py-2.5">
              <summary className="cursor-pointer text-[12px] font-bold select-none">
                주제 탐색 — 실제로 검색되는 것에서 고르기
              </summary>
              <TopicExplorer picked={plan.topics ?? []} onPick={addTopic} />
            </details>
          </section>

          {/*
            **② 지역 키워드 칸을 없앴다** (2026-08-28 회원 요청: "아예 이 칸을 없앨래").

            08-27 에 정보글 메인 키워드가 주제(정보성 검색어)로 바뀌면서 이 칸의 말들
            (「성정동 헬스장」·「쌍용동PT」)은 조연이 됐다. 08-28 오전에 이름과 순서를
            바로잡았는데, 회원이 그 다음 말이 이것이다 — 조연이면 자동 초안 설정에 칸을
            둘 이유가 없다.

            **계산에서도 뺐다** (lib/writing/autodraft.ts). 화면만 지우고 안에서 계속 고르면
            저장된 옛 목록으로 조용히 돌아간다 — 이 저장소가 반복해서 겪은 「한쪽만 고친 것」이다.
            그래서 자동 초안의 로테이션은 이제 **주제 하나로만** 돈다.

            손으로 쓰는 화면(app/write)의 「지역 키워드 (조연)」 칸은 그대로다 — 없앤 것은
            자동 초안 설정이다.
          */}

          {/*
            ── ③ 날짜별 주제 — 날짜는 회원이, 주제는 앱이 (2026-08-25) ──────────

            회원이 두 번 말했다. "내가 주제 계속 확정하는거 아니라 했잖아"와 "날짜 선택하는게
            있어야해." 서로 어긋난 요구가 아니다 — **누가 주제를 정하느냐**만 다르다.

            그래서 이 칸에는 주제를 적는 자리도, 고르는 목록도, 탐색기도 없다. 날짜와 며칠치만
            고르면 로테이션이 날마다 다른 주제를 채운다.
          */}
          <section>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h3 className="text-[13px] font-bold">③ 날짜별 주제</h3>
              <Badge tone={plan.days?.length ? 'good' : 'default'}>
                {plan.days?.length ? `${plan.days.length}일 채워둠` : '없음'}
              </Badge>
            </div>
            <p className="muted mb-2 text-[11px] leading-relaxed">
              <b>한 번에 고른 날 하루만 채웁니다.</b> 주제는 앱이 넣으니 고르거나 적으실 것은 없습니다. 마음에 안
              들면 「다른 주제로」를 누르면 앱이 다른 것으로 바꿉니다. 여러 날을 정하고 싶으시면 날짜를 바꿔 다시
              누르시면 됩니다. <b>채우지 않은 날은 잡히지 않습니다</b> — 그 날이 되면 앱이 그날그날 골라 씁니다.
            </p>

            <div className="mb-2 flex flex-wrap items-end gap-2">
              <label className="block w-[9.5rem]">
                <span className="muted mb-1 block text-[11px] font-semibold">언제부터</span>
                <input
                  type="date"
                  value={fillFrom}
                  min={today}
                  onChange={(e) => setFillFrom(e.target.value)}
                  className={inputClass}
                />
              </label>
              {/*
                **「며칠치」 칸은 뺐다** (2026-08-25 회원 지적: "나는 하루씩만 설정하고 싶다고.
                근데 왜 자꾸 그 후의 일정까지 설정되게 하는거야!"). 한 번에 하루만 채운다 —
                여러 날을 정하고 싶으면 날짜를 바꿔 다시 누르면 된다.
              */}
              <button
                type="button"
                disabled={filling || !fillFrom}
                onClick={fill}
                className={`${btnGhost} !px-3 !py-2 !text-[12px]`}
              >
                {filling ? '정하는 중…' : '이 날 주제 채우기'}
              </button>
            </div>
            {fillMsg && <p className="mb-2 text-[11.5px] leading-relaxed font-semibold">{fillMsg}</p>}

            {(plan.days ?? []).length > 0 ? (
              <ul className="space-y-1.5">
                {/*
                  **한 날짜에 줄이 여러 개일 수 있다** (2026-08-28 회원 요청: "하루에 여러편
                  작성할 수 있게해줘"). 열쇠와 버튼을 날짜만으로 잡으면 두 줄이 같은 열쇠를
                  쓰고, 누른 줄이 아니라 그 날 첫 줄이 바뀐다.
                */}
                {(plan.days ?? []).map((d, i) => (
                  <li key={`${d.date}|${d.topic}`} className="panel flex flex-wrap items-center gap-2 rounded-xl px-3 py-2">
                    <span className="tnum text-[11.5px] font-bold">
                      {d.date.slice(5).replace('-', '/')}
                      {/* 같은 날 두 줄이면 몇 편째인지 적는다 — 안 적으면 같은 날이 두 번 뜬 줄 안다 */}
                      {(plan.days ?? []).filter((x) => x.date === d.date).length > 1 && (
                        <span className="muted ml-1 font-semibold">
                          {(plan.days ?? []).slice(0, i + 1).filter((x) => x.date === d.date).length}편째
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1 text-[12px] leading-snug font-semibold">{d.topic}</span>
                    {/*
                      목록을 열어 고르게 하면 결국 「주제 고르라고 나온다」로 돌아간다.

                      **바꿀 것이 없으면 그렇다고 말한다** — 담은 주제가 하나뿐이면 눌러도
                      그대로다. 조용히 아무 일도 안 하면 회원은 버튼이 고장 난 줄 안다.
                    */}
                    <button
                      type="button"
                      onClick={() => {
                        setPlan((p) => {
                          const next = rerollTopic(p, d.date, d.topic)
                          const before = new Set((p.days ?? []).map((x) => `${x.date}|${x.topic}`))
                          const after = next.days?.find((x) => !before.has(`${x.date}|${x.topic}`))?.topic
                          setFillMsg(
                            !after
                              ? '담아 두신 주제가 하나뿐이라 바꿀 것이 없습니다 — ①에서 몇 개 더 담아주세요.'
                              : `${d.date} 을 「${after}」으로 바꿨습니다. 아래 「설정 저장」을 눌러야 반영됩니다.`
                          )
                          return next
                        })
                      }}
                      className="bd rounded-lg border px-2 py-1 text-[11px] font-semibold hover:bg-slate-500/8"
                    >
                      다른 주제로 ↻
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        // 그 날 전체가 아니라 **이 줄만** 뺀다 (2026-08-28)
                        setPlan((p) => ({
                          ...p,
                          days: (p.days ?? []).filter((x) => !(x.date === d.date && x.topic === d.topic)),
                        }))
                      }
                      className="muted rounded-lg px-2 py-1 text-[11px] font-semibold hover:text-rose-600"
                    >
                      빼기
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted text-[11.5px] leading-relaxed">
                아직 채운 날이 없습니다. 위에서 날짜를 고르고 채우기 버튼을 누르세요 — 하루만 정하셔도 됩니다.
              </p>
            )}
          </section>

          <div className="bd flex flex-wrap items-center gap-2 border-t pt-3.5">
            <button
              type="button"
              disabled={saving}
              onClick={() => save(plan)}
              className={`${btnPrimary} !px-4 !py-2.5 !text-[12.5px]`}
            >
              {saving ? '저장 중…' : dirty ? '설정 저장 (바뀐 것 있음)' : '설정 저장'}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => save({ off: false, keywords: [], topics: [], days: [], skip: [] })}
              className={`${btnGhost} !px-3 !py-2.5 !text-[12px]`}
            >
              전부 지우고 자동으로
            </button>
            {saved && <span className="text-[12px] font-semibold">{saved}</span>}
          </div>
        </div>
      </details>
    </div>
  )
}
