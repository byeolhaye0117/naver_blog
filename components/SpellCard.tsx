'use client'

import { useState } from 'react'
import { Badge, Card } from '@/components/ui'

interface Fix {
  before: string
  after: string
  kind: string
}
interface Report {
  fixes: Fix[]
  checked: number
  failed: number
  skipped?: number
  ours?: number
  headline: string
}

/**
 * 맞춤법·띄어쓰기 검사.
 *
 * 검수 26개 항목에 맞춤법을 보는 게 하나도 없었다. 그런데 이건 **공식 API 가 아니라**
 * 네이버 검색 화면이 쓰는 경로여서 자주 막힌다 (실측: 연속 호출 시 첫 건만 통과).
 * 그래서 「검사 못 한 덩어리」를 숨기지 않고 그대로 보여준다 — 0건과 못 읽음을 섞으면
 * 회원은 맞춤법이 깨끗하다고 믿는다.
 *
 * ─── 쓸 수 없는 제안을 걸러낸다 (2026-08-10) ─────────────────
 *
 * 회원 지적 — "맞춤법 검사를 했는데 오히려 제대로 안 되는 것도 있어."
 * 실제 화면에 이런 게 있었다:
 *
 *   표준어  5시~7시쯤에 → 5시~7시쯤에        원문과 제안이 똑같다
 *   맞춤법  무너진다&quot; → 무너진다&quot;라는  엔티티가 안 풀렸다
 *   띄어쓰기 쌍용동PT까지 → 쌍용동 PT까지      따르면 키워드가 깨진다
 *
 * 앞의 둘은 서버에서 버리고(speller.ts), 세 번째는 우리 낱말 목록으로 뺀다. 남은 것도
 * 회원이 하나씩 「무시」할 수 있게 했다 — 매번 같은 걸 눈으로 넘기게 하면 결국 안 본다.
 */
export default function SpellCard({ text, ignore = [] }: { text: string; ignore?: string[] }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<Report | null>(null)
  /** 회원이 「무시」를 누른 제안 — 이 화면에서만 기억한다 (저장하지 않는다) */
  const [hidden, setHidden] = useState<string[]>([])

  const plainLen = text.replace(/\s/g, '').length
  const tooShort = plainLen < 20

  async function run() {
    setBusy(true)
    setError(null)
    setHidden([])
    try {
      const res = await fetch('/api/spell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, ignore }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '검사에 실패했습니다.')
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : '검사 중 오류가 발생했습니다.')
      setData(null)
    } finally {
      setBusy(false)
    }
  }

  const key = (f: Fix) => `${f.before}→${f.after}`
  const shown = data ? data.fixes.filter((f) => !hidden.includes(key(f))) : []

  const tone = !data
    ? 'default'
    : data.checked === 0
      ? 'default'
      : shown.length
        ? 'warn'
        : data.failed
          ? 'warn'
          : 'good'

  return (
    <Card
      title="맞춤법 · 띄어쓰기"
      subtitle="네이버 맞춤법 검사기로 봅니다. 공식 API 가 아니어서 막히는 경우가 있고, 그때는 「못 읽음」으로 표시합니다"
      right={
        data ? (
          <Badge tone={tone}>
            {data.checked === 0
              ? '못 읽음'
              : shown.length
                ? `${shown.length}건`
                : data.failed
                  ? '일부만 확인'
                  : '깨끗함'}
          </Badge>
        ) : undefined
      }
    >
      <button
        type="button"
        onClick={run}
        disabled={busy || tooShort}
        className="bd w-full rounded-xl border px-3 py-2.5 text-[12.5px] font-semibold transition hover:bg-slate-500/8 disabled:opacity-45"
      >
        {busy ? '검사 중… (덩어리마다 키를 새로 받습니다)' : tooShort ? '본문을 먼저 채워주세요' : '맞춤법 검사'}
      </button>

      {error && (
        <p className="mt-2.5 text-[11.5px] leading-relaxed text-rose-700 dark:text-rose-300">{error}</p>
      )}

      {data && (
        <>
          <p className="mt-3 text-[12.5px] leading-relaxed">{data.headline}</p>

          {shown.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {shown.map((f) => (
                <li key={key(f)} className="flex flex-wrap items-baseline gap-1.5 text-[12px]">
                  <span className="muted rounded bg-slate-500/12 px-1.5 py-0.5 text-[10px] font-bold">
                    {f.kind}
                  </span>
                  <span className="text-rose-700 line-through dark:text-rose-300">{f.before}</span>
                  <span className="muted">→</span>
                  <span className="font-semibold text-emerald-700 dark:text-emerald-300">{f.after}</span>
                  <button
                    type="button"
                    onClick={() => setHidden((h) => [...h, key(f)])}
                    className="muted ml-auto text-[10.5px] font-semibold hover:underline"
                  >
                    무시
                  </button>
                </li>
              ))}
            </ul>
          )}

          {hidden.length > 0 && (
            <p className="muted mt-2 text-[11px]">
              무시한 제안 {hidden.length}건.{' '}
              <button type="button" onClick={() => setHidden([])} className="font-semibold hover:underline">
                되돌리기
              </button>
            </p>
          )}

          {/*
            제안을 그대로 받아들이면 안 되는 경우가 있다 — 상호명·지역명·기구 이름은
            사전에 없어서 검사기가 엉뚱하게 고치라고 한다. 그중 우리가 아는 것은 서버에서
            미리 뺐지만(dropOurWords), 사전에 없는 말은 계속 나온다.
          */}
          <p className="muted mt-3 text-[11px] leading-relaxed">
            <b>키워드는 붙여 씁니다.</b> 「쌍용동PT → 쌍용동 PT」 같은 제안은 따르면 검색어에 안
            걸리므로 미리 뺐습니다. 상호명·기구 이름도 사전에 없어 엉뚱한 제안이 나오는데, 아는
            것은 뺐지만 남는 게 있으면 <b>「무시」</b>를 누르세요. 검사기가 놓치는 것도 있습니다 —
            「낫습니다(더 좋다)」처럼 철자가 맞는 말은 뜻이 틀려도 잡지 못합니다.
          </p>
        </>
      )}
    </Card>
  )
}
