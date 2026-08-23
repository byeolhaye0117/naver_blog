'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { AutoDraftPlan, AutoDraftRun } from '@/lib/types'
import { INFO_TOPICS, autoDraftStatus, normalizePlan, planSummary } from '@/lib/writing/autodraft'
import { Badge, btnGhost, btnPrimary, inputClass } from '@/components/ui'

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
}: {
  runs?: AutoDraftRun[]
  today: string
  hasTodayDraft: boolean
  /** 회원이 정해 둔 것 (2026-08-23) */
  plan?: AutoDraftPlan
  /** 고를 수 있는 키워드 — 순위 추적 + 지점 지역 키워드 */
  keywordPool: string[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const status = autoDraftStatus(runs, today, hasTodayDraft)

  // 설정은 화면에서 고치는 동안 임시로 들고 있다가 「저장」에서 한 번에 보낸다
  const [plan, setPlan] = useState<AutoDraftPlan>(() => normalizePlan(savedPlan))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)
  const [newTopic, setNewTopic] = useState('')
  const [qKeyword, setQKeyword] = useState('')
  const [qTopic, setQTopic] = useState('')

  /** 고를 수 있는 주제 — 기본 목록 + 회원이 직접 적어 넣은 것 */
  const topicPool = [...INFO_TOPICS, ...(plan.topics ?? []).filter((t) => !INFO_TOPICS.includes(t))]

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
      setPlan(normalizePlan(data.plan))
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
        **무엇으로 쓰는지를 접힌 채로도 한 줄 보여준다** (2026-08-23 회원 요청으로 설정이
        생겼다). 설정을 열어 체크박스를 세어 보지 않아도 「지금 무엇으로 돌고 있나」를 알 수
        있어야 한다 — 안 그러면 고른 것이 지켜지고 있는지 확인할 방법이 없다.
      */}
      <details className="bd mt-3 border-t pt-3">
        <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-[12px] font-bold select-none">
          무엇으로 쓸지 정하기
          <span className="muted font-semibold">{planSummary(plan)}</span>
        </summary>

        <div className="mt-3 space-y-4">
          {/* ── 켜고 끄기 ── */}
          <label className="flex items-center gap-2 text-[12.5px] font-semibold">
            <input
              type="checkbox"
              checked={plan.off !== true}
              onChange={(e) => setPlan((p) => ({ ...p, off: !e.target.checked }))}
              className="size-4"
            />
            매일 새벽 5시에 정보글 초안 한 편 쓰기
          </label>

          {/* ── ① 예약: 다음에 쓸 것을 직접 지정 ── */}
          <section>
            <h3 className="text-[12.5px] font-bold">① 다음에 쓸 것 지정하기</h3>
            <p className="muted mt-0.5 mb-2 text-[11px] leading-relaxed">
              여기 줄 세운 것부터 위에서 하나씩 씁니다. 한 편 성공하면 목록에서 빠집니다 — 실패한 날에는 그대로
              남아 다음 날 다시 시도합니다. 비워두면 아래 ②·③ 범위 안에서 돌아가며 씁니다.
            </p>
            {(plan.queue ?? []).length > 0 && (
              <ol className="mb-2 space-y-1.5">
                {(plan.queue ?? []).map((q, i) => (
                  <li key={`${q.keyword}|${q.topic}`} className="panel flex items-center gap-2 rounded-xl px-3 py-2">
                    <span className="tnum muted text-[11px] font-bold">{i + 1}</span>
                    <span className="min-w-0 flex-1 text-[12px] leading-snug">
                      <b>{q.keyword}</b> · {q.topic}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setPlan((p) => ({
                          ...p,
                          queue: (p.queue ?? []).filter((x) => !(x.keyword === q.keyword && x.topic === q.topic)),
                        }))
                      }
                      className="muted rounded-lg px-2 py-1 text-[11px] font-semibold hover:text-rose-600"
                    >
                      빼기
                    </button>
                  </li>
                ))}
              </ol>
            )}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <select value={qKeyword} onChange={(e) => setQKeyword(e.target.value)} className={inputClass}>
                <option value="">키워드 고르기</option>
                {keywordPool.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
              <select value={qTopic} onChange={(e) => setQTopic(e.target.value)} className={inputClass}>
                <option value="">주제 고르기</option>
                {topicPool.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!qKeyword || !qTopic}
                onClick={() => {
                  setPlan((p) => ({ ...p, queue: [...(p.queue ?? []), { keyword: qKeyword, topic: qTopic }] }))
                  setQKeyword('')
                  setQTopic('')
                }}
                className={`${btnGhost} !py-2.5 !text-[12px]`}
              >
                줄 세우기
              </button>
            </div>
          </section>

          {/* ── ② 키워드 범위 ── */}
          <section>
            <h3 className="text-[12.5px] font-bold">② 쓸 키워드 고르기</h3>
            <p className="muted mt-0.5 mb-2 text-[11px] leading-relaxed">
              고른 것 안에서만 돌아가며 씁니다. 아무것도 안 고르면 순위 추적에 등록한 키워드 전부를 씁니다.
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

          {/* ── ③ 주제 범위 ── */}
          <section>
            <h3 className="text-[12.5px] font-bold">③ 쓸 주제 고르기</h3>
            <p className="muted mt-0.5 mb-2 text-[11px] leading-relaxed">
              아무것도 안 고르면 기본 {INFO_TOPICS.length}개를 전부 씁니다. 원하시는 주제를 직접 적어 넣어도 됩니다.
            </p>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {topicPool.map((t) => {
                const on = (plan.topics ?? []).includes(t)
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggle('topics', t)}
                    className={`rounded-full border px-3 py-1.5 text-[11.5px] font-semibold transition ${
                      on ? 'bg-brand-600 border-brand-600 text-white' : 'bd hover:bg-slate-500/8'
                    }`}
                  >
                    {t}
                  </button>
                )
              })}
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <input
                value={newTopic}
                onChange={(e) => setNewTopic(e.target.value)}
                placeholder="직접 적기 — 예: 어깨가 자주 뭉칠 때"
                className={inputClass}
              />
              <button
                type="button"
                disabled={!newTopic.trim()}
                onClick={() => {
                  const t = newTopic.trim()
                  setPlan((p) => ({ ...p, topics: [...(p.topics ?? []), t] }))
                  setNewTopic('')
                }}
                className={`${btnGhost} !py-2.5 !text-[12px]`}
              >
                주제 더하기
              </button>
            </div>
          </section>

          <div className="bd flex flex-wrap items-center gap-2 border-t pt-3">
            <button
              type="button"
              disabled={saving}
              onClick={() => save(plan)}
              className={`${btnPrimary} !px-4 !py-2.5 !text-[12.5px]`}
            >
              {saving ? '저장 중…' : '설정 저장'}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => save({ off: false, keywords: [], topics: [], queue: [] })}
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
