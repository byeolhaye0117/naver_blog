'use client'

import { useEffect, useState } from 'react'
import { GRADE_NOTE, MIN_SAMPLE, type FactorKey } from '@/lib/analysis/factors'
import { Badge, Card } from '@/components/ui'

interface Pooled {
  key: FactorKey
  label: string
  advantage: number | null
  runs: number
  samples: number
  agree: number
  disagree: number
  note: string
}

interface Summary {
  runs: number
  lastDate: string | null
  keywords: string[]
  pooled: Pooled[]
  headline: string
  recent: { keyword: string; date: string; sampled: number }[]
}

interface Payload extends Summary {
  local: Summary
  reference: Summary
  benchmarkKeywords: string[]
}

interface OneRun {
  keyword: string
  date: string
  sampled: number
  measured: number
  saved: boolean
  note?: string
  results: { key: string; label: string; advantage: number | null; n: number; strength: string; note: string }[]
}

function tone(p: Pooled): 'good' | 'warn' | 'default' {
  if (p.advantage === null) return 'default'
  if (Math.abs(p.advantage) >= 0.7) return 'good'
  if (Math.abs(p.advantage) >= 0.4) return 'warn'
  return 'default'
}

/**
 * 랭킹 요인 관찰소 — 「네이버가 무엇을 보고 띄워주는가」.
 *
 * 남의 설명을 옮겨 적지 않는다. 우리 키워드의 상위 글을 재서 순위와 같이 움직이는 것을
 * 보여주고, 매일 크론이 다시 재서 갱신한다. 그래서 화면에 **언제 잰 값인지**와
 * **표본이 몇 편인지**를 항상 같이 띄운다.
 */
export default function FactorObservatory({ keyword }: { keyword?: string }) {
  const [data, setData] = useState<Payload | null>(null)
  const [kwInput, setKwInput] = useState('')
  const [kwBusy, setKwBusy] = useState(false)
  const [busy, setBusy] = useState(false)
  const [one, setOne] = useState<OneRun | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    try {
      const res = await fetch('/api/factors', { cache: 'no-store' })
      const json = await res.json()
      if (res.ok) setData(json)
    } catch {
      /* 요약을 못 읽어도 관찰 버튼은 쓸 수 있다 */
    }
  }

  useEffect(() => {
    void load()
  }, [])

  /** 참고할 전국 키워드 등록·삭제 */
  async function editBenchmark(payload: { add?: string; remove?: string }) {
    setKwBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/factors', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '저장에 실패했습니다.')
      setKwInput('')
      void load()
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 중 오류가 발생했습니다.')
    } finally {
      setKwBusy(false)
    }
  }

  async function observe() {
    if (!keyword?.trim()) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/factors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '관찰에 실패했습니다.')
      setOne(json)
      void load()
    } catch (e) {
      setError(e instanceof Error ? e.message : '관찰 중 오류가 발생했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card
      title="네이버가 무엇을 보고 띄워주나"
      subtitle="공개된 기준이 없으니 우리 키워드의 상위 글을 직접 재서 봅니다. 매일 자동으로 다시 재서 갱신합니다."
      right={
        data?.local.lastDate ? (
          <Badge tone="default">
            {data.local.lastDate} · 관찰 {data.local.runs}회
          </Badge>
        ) : undefined
      }
    >
      {data && <p className="text-[12.5px] leading-relaxed">{data.local.headline}</p>}

      {data && data.local.pooled.some((p) => p.runs > 0) && (
        <ul className="mt-3 space-y-1.5">
          {data.local.pooled
            .slice()
            .sort((a, b) => Math.abs(b.advantage ?? 0) - Math.abs(a.advantage ?? 0))
            .map((p) => (
              <li key={p.key} className="panel bd rounded-xl border px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-[12.5px] font-bold">{p.label}</span>
                  {p.advantage !== null && (
                    <Badge tone={tone(p)}>
                      {p.advantage > 0 ? '+' : ''}
                      {p.advantage}
                    </Badge>
                  )}
                  <span className="tnum muted ml-auto text-[11px]">
                    관찰 {p.runs}회 · 표본 {p.samples}편
                  </span>
                </div>
                <p className="muted mt-1 text-[11px] leading-relaxed">{p.note}</p>
              </li>
            ))}
        </ul>
      )}

      {/*
        참고 판 — 전국 키워드.

        회원 요청("전국에서 잘 되는 블로그 톤을 참고하자")으로 만든 자리다. **우리 판과
        섞지 않는다** — 실측에서 규칙이 정반대였다 (최신성 지역 +0.63 / 전국 +0.04,
        홍보 요소 지역 -0.18 / 전국 +0.63). 그래서 「참고」라고 이름을 박아두고 따로 보여준다.
      */}
      <div className="bd mt-4 rounded-xl border p-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] font-bold">참고 판 — 전국 키워드</span>
          {data?.reference.lastDate && (
            <Badge tone="default">
              {data.reference.lastDate} · 관찰 {data.reference.runs}회
            </Badge>
          )}
        </div>
        <p className="muted mt-1.5 text-[11.5px] leading-relaxed">
          전국에서 잘 되는 글의 방식을 보려고 같은 지표로 잰 자리입니다. <b>우리 판 숫자와 섞지
          않습니다</b> — 실측에서 최신성이 우리 판 +0.63 인데 전국 「다이어트 정체기」는 +0.04,
          홍보 요소는 우리 판 -0.18 인데 전국은 +0.63 으로 정반대였습니다. 판이 다르면 답도
          다릅니다.
        </p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {(data?.benchmarkKeywords ?? []).map((k) => (
            <span
              key={k}
              className="surface bd inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold"
            >
              {k}
              <button
                type="button"
                onClick={() => void editBenchmark({ remove: k })}
                disabled={kwBusy}
                className="muted hover:text-rose-600 disabled:opacity-50"
                aria-label={`${k} 지우기`}
              >
                ×
              </button>
            </span>
          ))}
          {!(data?.benchmarkKeywords ?? []).length && (
            <span className="muted text-[11.5px]">
              아직 없습니다. 전국 정보 키워드를 넣으면 매일 함께 잽니다 (예: 다이어트 정체기, 헬스 초보 루틴).
            </span>
          )}
        </div>

        <div className="mt-2.5 flex gap-2">
          <input
            value={kwInput}
            onChange={(e) => setKwInput(e.target.value)}
            placeholder="참고할 전국 키워드"
            className="bd surface min-w-0 flex-1 rounded-xl border px-3 py-2 text-[12.5px]"
          />
          <button
            type="button"
            onClick={() => kwInput.trim() && void editBenchmark({ add: kwInput.trim() })}
            disabled={kwBusy || !kwInput.trim()}
            className="bd shrink-0 rounded-xl border px-3 py-2 text-[12px] font-semibold hover:bg-slate-500/8 disabled:opacity-50"
          >
            추가
          </button>
        </div>

        {data && data.reference.runs > 0 ? (
          <>
            <p className="mt-3 text-[12px] leading-relaxed">{data.reference.headline}</p>
            <ul className="mt-2 space-y-1">
              {data.reference.pooled
                .filter((p) => p.runs > 0)
                .slice()
                .sort((a, b) => Math.abs(b.advantage ?? 0) - Math.abs(a.advantage ?? 0))
                .slice(0, 5)
                .map((p) => {
                  const mine = data.local.pooled.find((x) => x.key === p.key)
                  return (
                    <li key={p.key} className="muted flex flex-wrap gap-x-2 text-[11px]">
                      <span className="font-semibold">{p.label}</span>
                      <span className="tnum">
                        참고 {p.advantage !== null && p.advantage > 0 ? '+' : ''}
                        {p.advantage}
                      </span>
                      {mine && mine.advantage !== null && (
                        <span className="tnum">
                          / 우리 판 {mine.advantage > 0 ? '+' : ''}
                          {mine.advantage}
                        </span>
                      )}
                    </li>
                  )
                })}
            </ul>
          </>
        ) : (
          <p className="muted mt-3 text-[11.5px] leading-relaxed">
            아직 참고 판 관찰이 없습니다. 키워드를 넣으면 매일 크론이 우리 판을 먼저 재고 남는
            자리에서 참고 판을 잽니다 (참고보다 우리 판이 먼저입니다).
          </p>
        )}
      </div>

      {/* 지수(등급)로는 순위가 설명되지 않았다는 실측 — 업계 상식과 반대라 근거를 붙인다 */}
      <p className="muted mt-3 rounded-xl border border-sky-500/30 bg-sky-500/8 px-3 py-2 text-[11.5px] leading-relaxed">
        {GRADE_NOTE}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={observe}
          disabled={busy || !keyword?.trim()}
          className="bd rounded-xl border px-3.5 py-2 text-[12.5px] font-semibold hover:bg-slate-500/8 disabled:opacity-50"
        >
          {busy ? '재는 중… (20~40초)' : keyword ? `「${keyword}」 지금 관찰하기` : '키워드를 먼저 분석하세요'}
        </button>
        {data && data.local.keywords.length > 0 && (
          <span className="muted text-[11px]">
            지금까지 {data.local.keywords.length}개 키워드를 관찰했습니다.
          </span>
        )}
      </div>

      {error && (
        <p className="mt-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-700 dark:text-rose-300">
          {error}
        </p>
      )}

      {one && (
        <div className="surface mt-3 rounded-xl p-3.5">
          <p className="text-[12px] font-bold">
            「{one.keyword}」 관찰 결과 — 상위 {one.sampled}편 (본문 {one.measured}편 실측)
          </p>
          {one.note && <p className="muted mt-1 text-[11px] leading-relaxed">{one.note}</p>}
          <ul className="mt-2 space-y-1">
            {one.results.map((r) => (
              <li key={r.key} className="muted text-[11px] leading-relaxed">
                {r.note}
              </li>
            ))}
          </ul>
          {!one.saved && (
            <p className="muted mt-2 text-[11px] leading-relaxed">
              이번 관찰은 저장되지 않았습니다 (저장소 미연결). 결과는 위에 그대로 있습니다.
            </p>
          )}
        </div>
      )}

      <details className="muted mt-3 text-[11px] leading-relaxed">
        <summary className="cursor-pointer font-semibold select-none">이 숫자를 어떻게 읽나</summary>
        <div className="mt-2 space-y-2">
          <p>
            +1 에 가까우면 <b>그 신호가 큰 글이 위에 있다</b>, -1 에 가까우면 <b>거꾸로</b>, 0 이면
            관계가 안 보인다는 뜻입니다. 순위와 값의 <b>순서</b>만 비교하므로(스피어만), 2만 자짜리
            글 한 편이 섞여도 결과가 뒤집히지 않습니다.
          </p>
          <p>
            표본 {MIN_SAMPLE}편 미만이면 판정하지 않습니다. 그리고 <b>같이 움직이는 것과 원인은
            다릅니다</b> — 상위 글이 최신인 것은 최신이라서 올라간 것일 수도, 요즘 그 주제로 많이
            써서일 수도 있습니다. 그래서 규격으로 삼기보다 「상위권이 실제로 그렇게 쓰고 있다」로
            읽으세요.
          </p>
          <p>
            매일 자동으로 키워드 3개씩 돌아가며 다시 잽니다. 기준이 바뀌면 방향이 바뀌고, 그게 여기
            숫자로 보입니다.
          </p>
        </div>
      </details>
    </Card>
  )
}
