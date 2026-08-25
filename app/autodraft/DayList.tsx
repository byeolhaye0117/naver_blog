'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { AutoDraftPlan } from '@/lib/types'
import { INFO_TOPICS, type AutoDraftDay } from '@/lib/writing/autodraft'
import { Badge, btnGhost, inputClass } from '@/components/ui'

/**
 * **날짜별 목록 — 보고, 그 날 것을 직접 정한다** (2026-08-24 회원 요청).
 *
 * "하나의 주제를 계속 쓰고 싶지 않아 날짜 설정해서 날짜별로 설정할 수 있게 해줘."
 *
 * 범위만 정하면(키워드·주제) 앱이 알아서 돌리는데, 고른 주제가 하나뿐이면 매일 같은 주제가
 * 나온다. 그렇다고 **매일 하나씩 지정하게 만들면 손으로 쓰는 것과 같아진다** — 그래서
 * 예정 줄에서 **바꾸고 싶은 날만** 고치게 한다. 안 고친 날은 지금처럼 알아서 돌아간다.
 *
 * 고친 값은 그 자리에서 저장한다. 「설정 저장」을 또 누르게 하면 어느 버튼이 무엇을
 * 저장하는지 회원이 판단해야 한다.
 */
export default function DayList({
  days,
  plan,
  keywordPool,
  emptyNote,
}: {
  days: AutoDraftDay[]
  plan?: AutoDraftPlan
  keywordPool: string[]
  emptyNote: string
}) {
  const router = useRouter()
  const [editing, setEditing] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [kw, setKw] = useState('')
  const [topic, setTopic] = useState('')

  /** 고를 수 있는 주제 — 담은 것이 있으면 그것, 없으면 기본 목록 */
  const topicPool = plan?.topics?.length ? plan.topics : INFO_TOPICS
  const fixedDates = new Set((plan?.days ?? []).map((d) => d.date))

  async function save(next: AutoDraftPlan) {
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch('/api/autodraft/plan', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? '저장하지 못했습니다.')
      setEditing(null)
      router.refresh()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '저장하지 못했습니다.')
    }
    setSaving(false)
  }

  const setDay = (date: string, keyword: string, t: string) =>
    save({
      ...plan,
      days: [...(plan?.days ?? []).filter((d) => d.date !== date), { date, keyword, topic: t }],
    })

  const clearDay = (date: string) =>
    save({ ...plan, days: (plan?.days ?? []).filter((d) => d.date !== date) })

  if (days.length === 0) return <p className="muted py-10 text-center text-[13px] leading-relaxed">{emptyNote}</p>

  return (
    <>
      {msg && <p className="mb-2 text-[12px] font-semibold text-rose-600">{msg}</p>}
      <ul className="space-y-2">
        {days.map((d) => {
          const fixed = fixedDates.has(d.date)
          const open = editing === d.date
          return (
            <li
              key={d.date}
              className={`rounded-xl px-3.5 py-3 ${d.when === 'upcoming' ? 'bd border border-dashed' : 'panel'}`}
            >
              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                <span className="tnum text-[12px] font-bold">{d.date.slice(5).replace('-', '/')}</span>
                {d.when === 'today' && <Badge tone="info">오늘</Badge>}
                {d.when === 'upcoming' && <Badge tone="default">예정</Badge>}
                {/* 알아서 도는 날과 내가 정한 날을 구별한다 */}
                {fixed && d.when !== 'past' && <Badge tone="good">직접 정함</Badge>}
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

              {/*
                이미 쓴 날은 못 바꾼다 — 지난 일을 고치는 칸을 두면 「고쳤는데 왜 글이
                그대로지」가 된다. 오늘도 아직 안 썼으면 바꿀 수 있다.
              */}
              {d.when !== 'past' && !d.postId && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {!open && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(d.date)
                        setKw(d.keyword)
                        setTopic(d.topic)
                      }}
                      className={`${btnGhost} !px-2.5 !py-1.5 !text-[11px]`}
                    >
                      이 날 바꾸기
                    </button>
                  )}
                  {fixed && !open && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => clearDay(d.date)}
                      className="muted rounded-lg px-2 py-1 text-[11px] font-semibold underline disabled:opacity-50"
                    >
                      자동으로 되돌리기
                    </button>
                  )}
                </div>
              )}

              {open && (
                <div className="mt-2 space-y-2">
                  <select value={kw} onChange={(e) => setKw(e.target.value)} className={inputClass}>
                    {keywordPool.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                  <select value={topicPool.includes(topic) ? topic : ''} onChange={(e) => setTopic(e.target.value)} className={inputClass}>
                    <option value="">직접 적기</option>
                    {topicPool.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  {/* 담은 주제에 없는 것도 쓸 수 있어야 한다 — 그 날만 다른 이야기를 하고 싶을 때 */}
                  <input
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="이 날 쓸 주제"
                    className={inputClass}
                  />
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      disabled={saving || !kw.trim() || !topic.trim()}
                      onClick={() => setDay(d.date, kw.trim(), topic.trim())}
                      className="bg-brand-600 rounded-xl px-3 py-2 text-[11.5px] font-bold text-white disabled:opacity-50"
                    >
                      {saving ? '저장 중…' : '이 날로 저장'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(null)}
                      className="muted rounded-lg px-2 py-1 text-[11px] font-semibold underline"
                    >
                      취소
                    </button>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
}
