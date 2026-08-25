'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { AutoDraftPlan, AutoDraftRun } from '@/lib/types'
import { INFO_TOPICS, autoDraftStatus, normalizePlan, planSummary } from '@/lib/writing/autodraft'
import { Badge, btnGhost, btnPrimary } from '@/components/ui'
import TopicExplorer from '@/components/TopicExplorer'
import DayAssign from '@/components/DayAssign'

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
  plan: savedPlan,
  keywordPool,
  settingsOpen = false,
}: {
  runs?: AutoDraftRun[]
  today: string
  hasTodayDraft: boolean
  /** 회원이 정해 둔 것 (2026-08-23) */
  plan?: AutoDraftPlan
  /** 고를 수 있는 키워드 — 순위 추적 + 지점 지역 키워드 */
  keywordPool: string[]
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
  const status = autoDraftStatus(runs, today, hasTodayDraft)

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
  const [dayOpen, setDayOpen] = useState(false)
  const same = (a: AutoDraftPlan, b: AutoDraftPlan) =>
    JSON.stringify([a.off === true, a.keywords ?? [], a.topics ?? [], a.days ?? []]) ===
    JSON.stringify([b.off === true, b.keywords ?? [], b.topics ?? [], b.days ?? []])
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
                <dd>{stored.off ? '꺼둠 — 자동으로 쓰지 않습니다' : '매일 새벽 5시에 한 편'}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="muted w-11 shrink-0 font-semibold">키워드</dt>
                <dd>
                  {stored.keywords?.length
                    ? `${stored.keywords.join(' · ')} (${stored.keywords.length}개)`
                    : '고른 것 없음 — 순위 추적 키워드 전부를 씁니다'}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="muted w-11 shrink-0 font-semibold">날짜</dt>
                <dd>
                  {stored.days?.length
                    ? stored.days.map((d) => `${d.date.slice(5)} ${d.topic}`).join(' · ')
                    : '따로 정한 날 없음 — 범위 안에서 알아서 돕니다'}
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
            매일 새벽 5시에 정보글 초안 한 편 쓰기
          </label>

          {/* ── ① 키워드 ── */}
          <section>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h3 className="text-[13px] font-bold">① 쓸 키워드</h3>
              <Badge tone={plan.keywords?.length ? 'good' : 'default'}>
                {plan.keywords?.length ? `${plan.keywords.length}개 고름` : '전부'}
              </Badge>
            </div>
            <p className="muted mb-2 text-[11px] leading-relaxed">
              고른 것 안에서만 돌아가며 씁니다. 하나도 안 고르면 순위 추적에 등록한 키워드 전부를 씁니다.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {keywordPool.map((k) => {
                const on = (plan.keywords ?? []).includes(k)
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => toggle('keywords', k)}
                    className={`rounded-full border px-3 py-1.5 text-[11.5px] font-semibold transition ${
                      on ? 'bg-brand-600 border-brand-600 text-white' : 'bd hover:bg-slate-500/8'
                    }`}
                  >
                    {k}
                  </button>
                )
              })}
              {keywordPool.length === 0 && (
                <p className="muted text-[11.5px]">순위 추적에 등록한 키워드가 없습니다.</p>
              )}
            </div>
          </section>

          {/* ── ② 주제 — 탐색기에서 담은 것만 ── */}
          <section>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h3 className="text-[13px] font-bold">② 쓸 주제</h3>
              <Badge tone={plan.topics?.length ? 'good' : 'default'}>
                {plan.topics?.length ? `${plan.topics.length}개 담음` : '기본 주제'}
              </Badge>
            </div>
            <p className="muted mb-2 text-[11px] leading-relaxed">
              아래 탐색에서 담은 주제만 씁니다. 하나도 안 담으면 기본 주제 {INFO_TOPICS.length}개를 씁니다.
            </p>

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

          {/* ── ③ 날짜별로 콕 집어 정하기 ── */}
          <section>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h3 className="text-[13px] font-bold">③ 날짜별로 정하기</h3>
              <Badge tone={plan.days?.length ? 'good' : 'default'}>
                {plan.days?.length ? `${plan.days.length}일 정함` : '없음'}
              </Badge>
            </div>
            <p className="muted mb-2 text-[11px] leading-relaxed">
              「이 날은 꼭 이걸」이 있을 때만 쓰세요. 안 정한 날은 위 ①·② 범위 안에서 알아서 돌아갑니다.
            </p>

            {(plan.days ?? []).length > 0 && (
              <ul className="mb-2 space-y-1.5">
                {(plan.days ?? []).map((d) => (
                  <li key={d.date} className="panel flex items-center gap-2 rounded-xl px-3 py-2">
                    <span className="tnum text-[11.5px] font-bold">{d.date.slice(5).replace('-', '/')}</span>
                    <span className="min-w-0 flex-1 text-[12px] leading-snug">
                      <b>{d.keyword}</b> · {d.topic}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setPlan((p) => ({ ...p, days: (p.days ?? []).filter((x) => x.date !== d.date) }))
                      }
                      className="muted rounded-lg px-2 py-1 text-[11px] font-semibold hover:text-rose-600"
                    >
                      빼기
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {dayOpen ? (
              <div className="bd rounded-xl border px-3.5 py-3">
                <DayAssign
                  plan={plan}
                  keywordPool={keywordPool}
                  today={today}
                  onPick={(day) => {
                    setPlan((p) => ({
                      ...p,
                      days: [...(p.days ?? []).filter((x) => x.date !== day.date), day].sort((a, b) =>
                        a.date.localeCompare(b.date)
                      ),
                    }))
                    setDayOpen(false)
                  }}
                  onCancel={() => setDayOpen(false)}
                />
              </div>
            ) : (
              <button type="button" onClick={() => setDayOpen(true)} className={`${btnGhost} !px-3 !py-2 !text-[12px]`}>
                날짜 골라서 정하기
              </button>
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
              onClick={() => save({ off: false, keywords: [], topics: [], days: [] })}
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
