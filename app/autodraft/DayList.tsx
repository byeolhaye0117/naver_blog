'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { AutoDraftPlan } from '@/lib/types'
import type { AutoDraftDay } from '@/lib/writing/autodraft'
import { Badge } from '@/components/ui'

/**
 * **날짜별 목록 — 무엇을 썼고 앞으로 무엇을 쓰나** (2026-08-24 회원 요청).
 *
 * "이거는 매일 달라질거야 그래서 날짜별로 목록이 보이게 만들어달란 소리였어."
 *
 * ── 여기서 주제를 고치지 않는다 (2026-08-25 회원 지적) ──────────
 * "내가 주제 계속 확정하는거 아니라 했잖아. 근데 왜 또 주제 고르라고 나오는거야."
 *
 * 한동안 예정 줄마다 「이 날 바꾸기」를 달아 주제를 정하게 했다. 그게 회원이 싫다고 한
 * 바로 그것이다 — 날짜마다 확정하게 만들면 손으로 쓰는 것과 같아진다. 무엇을 쓸지는
 * 설정의 ①② 범위를 보고 앱이 정한다.
 *
 * 이 화면에서 날짜를 두고 할 수 있는 일은 **그 날 쉬기(삭제)와 되돌리기**뿐이다.
 */
export default function DayList({
  days,
  plan,
  today,
  emptyNote,
}: {
  days: AutoDraftDay[]
  plan?: AutoDraftPlan
  today: string
  emptyNote: string
}) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  /*
   * 앱이 그날그날 고른 날과, 설정에서 **미리 채워 둔** 날을 구별한다. 미리 채운 날은 설정을
   * 바꿔도 그대로 나가므로 그 표시가 없으면 「왜 안 바뀌지」가 된다 (2026-08-25).
   */
  const filledDates = new Set((plan?.days ?? []).map((d) => d.date))

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
      router.refresh()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '저장하지 못했습니다.')
    }
    setSaving(false)
  }

  /*
   * **앞날은 「건너뛰기」로 뺀다** (2026-08-24 회원 요청: "이거 삭제기능 만들어줘").
   *
   * 예정 줄은 계산해서 만든 것이라 지울 실체가 없다 — 지우면 다음에 화면을 열 때 다시
   * 생긴다. 그래서 **그 날은 쓰지 않는다고 적어 둔다.** 자동 초안을 통째로 끄면 그 다음
   * 날도 안 쓰니, 날짜 하나만 빼는 자리가 따로 있어야 한다.
   */
  const skipDay = (date: string) => {
    /*
     * **물어보고 지운다** (2026-08-24 회원 요청: "삭제하겠습니까? 물어서 삭제될 수 있게").
     * 한 번 누르면 바로 사라지는 자리라, 잘못 누르면 그 날 글이 안 나온다.
     */
    if (!confirm(`${date} 예정을 삭제할까요?\n\n그날은 자동으로 쓰지 않습니다. 목록 위쪽의 「다시 쓰기」로 되돌릴 수 있습니다.`)) return
    return save({ ...plan, skip: [...new Set([...(plan?.skip ?? []), date])] })
  }

  const unskipDay = (date: string) =>
    save({ ...plan, skip: (plan?.skip ?? []).filter((d) => d !== date) })

  /*
   * **지난 줄은 기록을 지운다.** 실패로 어지러운 날이 며칠 쌓이면 목록이 안 읽힌다.
   * 글은 지우지 않는다 — 그건 발행 관리에서 한다.
   */
  async function removeRun(date: string) {
    if (!confirm(`${date} 기록을 삭제할까요?\n\n그날 쓴 글은 지워지지 않습니다 — 기록 줄만 사라집니다.`)) return
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch('/api/autodraft/runs', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? '지우지 못했습니다.')
      router.refresh()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '지우지 못했습니다.')
    }
    setSaving(false)
  }

  const skipped = (plan?.skip ?? []).filter((d) => d >= today)
  /*
   * **지난 것과 앞으로 것을 가른다** (2026-08-25).
   *
   * 회원: "엥? 25일부터 다시 생겼는데? 지금 작성된 목록 외에는 모두 삭제해줘."
   *
   * 예정 줄은 **저장된 것이 아니라 계산해서 그리는 것**이라 지워도 화면을 열 때 다시
   * 생긴다. 회원은 그걸 세 번 지웠다 — 지울 수 없는 것을 계속 지우게 만든 것이 잘못이다.
   *
   * 회원이 이 화면에서 보려던 것은 **실제로 쓴 것**이다. 예정은 「그래서 내일은 뭘 쓰지」를
   * 확인할 때만 필요하므로 접어 둔다.
   */
  const written = days.filter((d) => d.when === 'past' || d.ok !== undefined)
  const upcoming = days.filter((d) => !(d.when === 'past' || d.ok !== undefined))

  if (days.length === 0 && skipped.length === 0)
    return <p className="muted py-10 text-center text-[13px] leading-relaxed">{emptyNote}</p>

  return (
    <>
      {msg && <p className="mb-2 text-[12px] font-semibold text-rose-600">{msg}</p>}
      {/*
        **건너뛴 날을 안 보여주면 되돌릴 수 없다.** 지운 것처럼 사라지면 「내가 뺐나 원래
        없었나」도 구별이 안 된다. 흐리게 남겨 두고 되돌리는 버튼을 붙인다.
      */}
      {skipped.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {[...skipped]
            .sort()
            .map((d) => (
              <li key={d} className="flex items-center gap-2 rounded-xl border border-dashed border-rose-500/30 bg-rose-500/5 px-3.5 py-2">
                <span className="tnum text-[11.5px] font-bold">{d.slice(5).replace('-', '/')}</span>
                <span className="flex-1 text-[11.5px] font-semibold text-rose-700 dark:text-rose-300">
                  삭제함 — 이 날은 쓰지 않습니다
                </span>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => unskipDay(d)}
                  className="rounded-lg px-2 py-1 text-[11px] font-semibold underline disabled:opacity-50"
                >
                  다시 쓰기
                </button>
              </li>
            ))}
        </ul>
      )}

      {written.length === 0 && (
        <p className="muted mb-2 text-[12.5px] leading-relaxed">
          아직 쓴 글이 없습니다. 매일 새벽 5시에 한 편씩 쓰고, 쓴 날은 여기에 쌓입니다.
        </p>
      )}

      <ul className="space-y-2">
        {written.map((d) => {
          return (
            <li
              key={d.date}
              className={`rounded-xl px-3.5 py-3 ${d.when === 'upcoming' ? 'bd border border-dashed' : 'panel'}`}
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

              {/*
                아직 안 쓴 날은 「그 날 쉬기」만 할 수 있다. 이미 쓴 날은 손댈 것이 없다 —
                지난 일을 고치는 칸을 두면 「고쳤는데 왜 글이 그대로지」가 된다.
              */}
              {d.when !== 'past' && !d.postId && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {/*
                    **「삭제」로 부른다** (2026-08-24 회원 지적: "이날 안쓰기 누르면 삭제는
                    되는데 잘 표시가 나지 않아. 그냥 삭제로 버튼 바꿔주고").

                    「이 날 안 쓰기」는 무슨 일이 일어나는지 설명하는 말이라 버튼처럼 안
                    읽혔다. 회색 밑줄 글씨라 더 그랬다. 실제로 하는 일은 그 줄을 지우는
                    것이므로 그대로 「삭제」라고 쓰고, 지우는 버튼처럼 보이게 한다.

                    속으로는 여전히 「쓰지 않는다」고 적어 두는 것이다 — 예정 줄은 계산해서
                    만든 것이라 지울 실체가 없고, 그래야 되돌릴 수도 있다.
                  */}
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => skipDay(d.date)}
                    className="ml-auto rounded-xl border border-rose-500/40 px-2.5 py-1.5 text-[11px] font-bold text-rose-600 transition hover:bg-rose-500/10 disabled:opacity-50 dark:text-rose-300"
                  >
                    삭제
                  </button>
                </div>
              )}

              {/* 지난 줄은 기록을 지운다 (글은 그대로 둔다) */}
              {d.when === 'past' && (
                <div className="mt-2 flex">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => removeRun(d.date)}
                    className="ml-auto rounded-xl border border-rose-500/40 px-2.5 py-1.5 text-[11px] font-bold text-rose-600 transition hover:bg-rose-500/10 disabled:opacity-50 dark:text-rose-300"
                  >
                    삭제
                  </button>
                </div>
              )}

            </li>
          )
        })}
      </ul>

      {/*
        **예정은 접어 둔다.** 저장된 것이 아니라 계산해서 그리는 줄이라 지울 수 없는데,
        펼쳐 두면 회원이 계속 지우려 하게 된다 (실제로 세 번 그랬다). 「내일은 뭘 쓰지」를
        확인할 때만 펼치면 된다.
      */}
      {upcoming.length > 0 && (
        <details className="bd mt-3 rounded-xl border border-dashed px-3.5 py-2.5">
          <summary className="cursor-pointer text-[12px] font-bold select-none">
            앞으로 쓸 예정 {upcoming.length}일 보기
            <span className="muted ml-2 font-semibold">
              — 아직 안 쓴 것입니다. 설정을 바꾸면 달라집니다
            </span>
          </summary>
          <ul className="mt-2 space-y-2">
            {upcoming.map((d) => (
              <li key={d.date} className="bd rounded-xl border border-dashed px-3.5 py-3">
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                  <span className="tnum text-[12px] font-bold">{d.date.slice(5).replace('-', '/')}</span>
                  {d.when === 'today' && <Badge tone="info">오늘</Badge>}
                  {filledDates.has(d.date) && <Badge tone="good">미리 채워둠</Badge>}
                </div>
                <p className="text-[13px] leading-snug font-semibold">
                  {d.keyword} <span className="muted font-medium">· {d.topic}</span>
                </p>
                <div className="mt-2 flex">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => skipDay(d.date)}
                    className="ml-auto rounded-xl border border-rose-500/40 px-2.5 py-1.5 text-[11px] font-bold text-rose-600 transition hover:bg-rose-500/10 disabled:opacity-50 dark:text-rose-300"
                  >
                    삭제
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  )
}
