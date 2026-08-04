'use client'

import { useState } from 'react'
import { MIN_LENGTH, OVERLAP_HIGH, OVERLAP_SOME } from '@/lib/analysis/similarity'
import { Badge, Card } from '@/components/ui'

interface Hit {
  url: string
  title: string
  overlap: number
  samples: string[]
}

interface Report {
  hits: Hit[]
  worst: Hit | null
  compared: number
  headline: string
  needsWork: boolean
  caveat: string
}

/**
 * 유사문서 판독 — 내 초안이 상위 글과 글자 그대로 얼마나 겹치는지.
 *
 * 버튼을 눌러야 돌아간다. 상위 글 본문을 6편 읽어야 해서 20~30초 걸리므로, 글자를
 * 칠 때마다 돌리면 글쓰기를 방해한다.
 */
export default function SimilarityCard({ keyword, text }: { keyword: string; text: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<Report | null>(null)

  const plainLen = text.replace(/\s/g, '').length
  const tooShort = plainLen < MIN_LENGTH
  const noKeyword = !keyword.trim()

  async function run() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/similarity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword, text }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '판독에 실패했습니다.')
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : '판독 중 오류가 발생했습니다.')
      setData(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card
      title="유사문서 판독"
      subtitle="상위 글을 참고해 쓰다 보면 문장까지 닮게 됩니다. 내 글의 어느 만큼이 상위 글에도 글자 그대로 있는지 봅니다."
      right={
        data?.worst ? (
          <Badge tone={data.needsWork ? 'bad' : data.worst.overlap >= OVERLAP_SOME ? 'warn' : 'good'}>
            최대 {data.worst.overlap}%
          </Badge>
        ) : undefined
      }
    >
      <button
        type="button"
        data-sim="run"
        onClick={run}
        disabled={busy || tooShort || noKeyword}
        className="bg-brand-600 rounded-xl px-3.5 py-2 text-[12.5px] font-bold text-white disabled:opacity-50"
      >
        {busy ? '상위 글을 읽고 있습니다… (20~30초)' : '상위 글과 비교하기'}
      </button>

      {noKeyword && <p className="muted mt-2 text-[11.5px]">메인 키워드를 정하면 비교할 수 있습니다.</p>}
      {!noKeyword && tooShort && (
        <p className="muted mt-2 text-[11.5px] leading-relaxed">
          본문이 {MIN_LENGTH}자(공백 제외)는 넘어야 견줍니다 — 지금 {plainLen}자. 짧은 글은 겹침 비율이
          튀어서 없는 문제를 만들어냅니다.
        </p>
      )}

      {error && (
        <p className="mt-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] leading-relaxed text-rose-700 dark:text-rose-300">
          {error}
        </p>
      )}

      {data && (
        <div className="mt-3 space-y-2.5">
          <p
            className={`rounded-xl border px-3 py-2 text-[12.5px] leading-relaxed ${
              data.needsWork
                ? 'border-rose-500/30 bg-rose-500/10 text-rose-800 dark:text-rose-200'
                : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
            }`}
          >
            {data.headline}
          </p>

          {data.hits.map((h) => (
            <div key={h.url} className="panel bd rounded-xl border px-3 py-2.5">
              <div className="flex items-start gap-2">
                <a
                  href={h.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="min-w-0 flex-1 text-[12px] leading-snug font-semibold hover:underline"
                >
                  {h.title || h.url}
                </a>
                <span
                  className={`tnum shrink-0 text-[12px] font-bold ${
                    h.overlap >= OVERLAP_HIGH
                      ? 'text-rose-600 dark:text-rose-400'
                      : h.overlap >= OVERLAP_SOME
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'muted'
                  }`}
                >
                  {h.overlap}%
                </span>
              </div>
              {h.samples.length > 0 && (
                <ul className="mt-1.5 space-y-1">
                  {h.samples.map((s, i) => (
                    <li
                      key={i}
                      className="bd rounded-lg border border-dashed px-2 py-1.5 text-[11.5px] leading-relaxed"
                    >
                      {s}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}

          {/* 숫자를 어떻게 읽어야 하는지 — 이걸 빼면 "몇 % 넘으면 걸린다" 로 오해한다 */}
          <p className="muted text-[11px] leading-relaxed">{data.caveat}</p>
        </div>
      )}
    </Card>
  )
}
