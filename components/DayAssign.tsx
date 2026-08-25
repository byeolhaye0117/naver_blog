'use client'

import { useState } from 'react'
import type { AutoDraftPlan } from '@/lib/types'
import { INFO_TOPICS } from '@/lib/writing/autodraft'
import { btnGhost, inputClass } from '@/components/ui'
import TopicExplorer from '@/components/TopicExplorer'

/**
 * **날짜 하나를 골라 그 날 쓸 것을 정한다** (2026-08-24 회원 요청).
 *
 * "내말은 애초에 여기를 날짜 선택해서 주제를 선택하고 싶단 거야. 그리고 날짜별 목록에서
 * 주제나 키워드 바꾸면 목록이 안나와. 목록 나와서 하게 해주고 주제는 주제탐색기도 하게 해줘."
 *
 * ── 「목록이 안 나온다」의 원인 ─────────────────────────────
 * 고를 수 있는 주제를 **담은 것만**으로 뒀다. 회원이 담은 주제가 하나뿐이라(키토다이어트)
 * 고르는 칸에 한 줄만 떴다 — 고를 수 있는 목록이 아니었다. 담은 것 + 기본 목록을 **함께**
 * 보여주고, 그래도 없으면 탐색기에서 찾아 쓰게 한다.
 *
 * ── 왜 저장하지 않고 넘겨주나 ───────────────────────────────
 * 부르는 쪽 사정이 다르다. 설정 화면은 다른 칸과 함께 「설정 저장」에서 한 번에 보내고,
 * 날짜별 목록은 그 자리에서 바로 저장한다. 여기서 저장까지 하면 설정 화면에서 고치던
 * 다른 값이 덮인다.
 */
export default function DayAssign({
  plan,
  keywordPool,
  /** 날짜가 정해져 있으면 (날짜별 목록의 그 줄) 날짜 칸을 만들지 않는다 */
  fixedDate,
  today,
  onPick,
  onCancel,
}: {
  plan?: AutoDraftPlan
  keywordPool: string[]
  fixedDate?: string
  today: string
  onPick: (day: { date: string; keyword: string; topic: string }) => void
  onCancel?: () => void
}) {
  const existing = fixedDate ? plan?.days?.find((d) => d.date === fixedDate) : undefined
  const [date, setDate] = useState(fixedDate ?? today)
  const [keyword, setKeyword] = useState(existing?.keyword ?? keywordPool[0] ?? '')
  const [topic, setTopic] = useState(existing?.topic ?? '')

  /*
   * **담은 주제 + 기본 주제를 함께 보여준다.** 담은 것만 보여주면 하나 담았을 때 고를 게
   * 없다 — 회원이 「목록이 안나와」라고 한 자리가 여기다.
   */
  const topicPool = [...new Set([...(plan?.topics ?? []), ...INFO_TOPICS])]

  return (
    <div className="space-y-2">
      {!fixedDate && (
        <label className="block">
          <span className="muted mb-1 block text-[11px] font-semibold">날짜</span>
          <input
            type="date"
            value={date}
            min={today}
            onChange={(e) => setDate(e.target.value)}
            className={inputClass}
          />
        </label>
      )}

      <label className="block">
        <span className="muted mb-1 block text-[11px] font-semibold">키워드</span>
        <select value={keyword} onChange={(e) => setKeyword(e.target.value)} className={inputClass}>
          <option value="">고르기</option>
          {keywordPool.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="muted mb-1 block text-[11px] font-semibold">주제</span>
        <select
          value={topicPool.includes(topic) ? topic : ''}
          onChange={(e) => e.target.value && setTopic(e.target.value)}
          className={inputClass}
        >
          <option value="">고르기 (또는 아래에 직접 적기)</option>
          {topicPool.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <input
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        placeholder="직접 적거나, 아래 탐색에서 고르세요"
        className={inputClass}
      />

      {/*
        **탐색기도 여기서 쓴다.** 목록에 없는 주제를 쓰고 싶을 때 다른 화면으로 갔다 오게
        하면 정하던 날짜를 잃는다. 접어 두는 이유는 다른 자리와 같다 — 결과 열두 줄이
        펼쳐지면 아래 저장 버튼이 화면 밖으로 밀린다.
      */}
      <details className="bd rounded-xl border px-3.5 py-2.5">
        <summary className="cursor-pointer text-[12px] font-bold select-none">
          주제 탐색 — 실제로 검색되는 것에서 고르기
        </summary>
        <TopicExplorer
          picked={topic ? [topic] : []}
          onPick={(t) => setTopic(t)}
          pickLabel="이 주제로"
          pickedLabel="고름"
        />
      </details>

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          disabled={!date || !keyword.trim() || !topic.trim()}
          onClick={() => onPick({ date, keyword: keyword.trim(), topic: topic.trim() })}
          className="bg-brand-600 rounded-xl px-3 py-2 text-[11.5px] font-bold text-white disabled:opacity-50"
        >
          이 날로 정하기
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className={`${btnGhost} !px-2.5 !py-1.5 !text-[11px]`}>
            취소
          </button>
        )}
      </div>
    </div>
  )
}
