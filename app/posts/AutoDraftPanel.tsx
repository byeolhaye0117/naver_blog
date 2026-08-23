'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { AutoDraftRun } from '@/lib/types'
import { autoDraftStatus } from '@/lib/writing/autodraft'
import { Badge, btnGhost } from '@/components/ui'

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
}: {
  runs?: AutoDraftRun[]
  today: string
  hasTodayDraft: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const status = autoDraftStatus(runs, today, hasTodayDraft)

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
    </div>
  )
}
