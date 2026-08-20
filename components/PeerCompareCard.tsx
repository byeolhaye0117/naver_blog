'use client'

import { useState } from 'react'
import { Badge, Card, Field, btnPrimary, inputClass } from './ui'
import type { PeerAxis, PeerRow } from '@/lib/analysis/peers'

interface Result {
  keyword: string
  measuredAt: string
  peers: PeerRow[]
  mine: PeerRow | null
  axes: PeerAxis[]
  missing: { label: string; peersWith: number; of: number }[]
  failed: string[]
  sampleNote: string
}

const n = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v.toLocaleString())

const TONE: Record<PeerAxis['verdict'], 'good' | 'warn' | 'bad' | 'info'> = {
  ahead: 'good',
  behind: 'bad',
  same: 'info',
  unknown: 'warn',
}
const LABEL: Record<PeerAxis['verdict'], string> = {
  ahead: '우리가 앞섬',
  behind: '우리가 뒤짐',
  same: '비슷함',
  unknown: '못 읽음',
}

/**
 * **상위 5편의 블로그와 우리를 블로그 단위로 비교한다.**
 *
 * 회원 요청 (2026-08-20): "경쟁 있는 키워드는 … 상위 5편의 블로그와 비교해서 블로그 개설일,
 * 이웃수, 글의 유형, 글 발행 간격, 포스팅당 좋아요나 댓글 수 등을 비교분석해서 알려달라."
 *
 * **점수로 합치지 않는다.** 축마다 방향이 다르고(간격은 작은 게 좋다), 어느 축이 순위를
 * 만드는지 우리는 모른다 — 합치면 모르는 것을 아는 것처럼 만든다. 숫자를 나란히 놓고
 * 판단은 회원이 한다.
 */
export default function PeerCompareCard({ defaultBlogId = '' }: { defaultBlogId?: string }) {
  const [keyword, setKeyword] = useState('')
  const [myId, setMyId] = useState(defaultBlogId)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<Result | null>(null)

  async function run() {
    if (!keyword.trim()) {
      setError('키워드를 넣어주세요.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/blog/peers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: keyword.trim(), myBlogId: myId.trim() || undefined }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '비교하지 못했습니다.')
      setData(json as Result)
    } catch (e) {
      setError(e instanceof Error ? e.message : '비교하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const behind = data?.axes.filter((a) => a.verdict === 'behind') ?? []

  return (
    <Card
      title="상위 5편의 블로그와 비교"
      subtitle="글 한 편이 아니라 블로그를 봅니다 — 첫 글 날짜·이웃·발행 간격·글 유형·댓글·공감."
      right={data ? <Badge tone={behind.length ? 'warn' : 'good'}>뒤진 항목 {behind.length}개</Badge> : undefined}
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="비교할 키워드" hint="경쟁 있는 키워드를 넣으세요 (예: 쌍용동 헬스장)">
          <input
            className={inputClass}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="쌍용동 헬스장"
            onKeyDown={(e) => {
              if (e.key === 'Enter') run()
            }}
          />
        </Field>
        <Field label="우리 블로그 아이디" hint="비우면 상위 블로그끼리만 비교합니다">
          <input className={inputClass} value={myId} onChange={(e) => setMyId(e.target.value)} placeholder="sulliha8277" />
        </Field>
        <button type="button" onClick={run} disabled={busy} className={`${btnPrimary} sm:mb-[2px]`}>
          {busy ? '재는 중… (1~2분)' : '비교하기'}
        </button>
      </div>

      {error && (
        <p className="mt-3 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-[12px] text-rose-900">{error}</p>
      )}

      {data && (
        <div className="mt-4 space-y-4">
          <p className="muted text-[11.5px]">
            {data.sampleNote} ·{' '}
            {new Date(data.measuredAt).toLocaleString('ko-KR', {
              month: 'numeric',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}{' '}
            기준
          </p>

          {/* ── 축 비교 ── */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-[12px]">
              <thead>
                <tr className="muted bd border-b text-left">
                  <th className="py-1.5 pr-2 font-semibold">항목</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">상위 블로그 중간값</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">우리</th>
                  <th className="py-1.5 font-semibold">판정</th>
                </tr>
              </thead>
              <tbody>
                {data.axes.map((a) => (
                  <tr key={a.key} className="bd border-b last:border-0 align-top" title={a.note || undefined}>
                    <td className="py-1.5 pr-2 font-semibold whitespace-nowrap">
                      {a.label}
                      {!a.higherIsBetter && <span className="muted font-normal"> (작을수록 좋음)</span>}
                    </td>
                    <td className="tnum py-1.5 pr-2 text-right">{n(a.peers)}</td>
                    <td className="tnum py-1.5 pr-2 text-right font-bold">{n(a.mine)}</td>
                    <td className="py-1.5">
                      <Badge tone={TONE[a.verdict]}>{LABEL[a.verdict]}</Badge>
                      {a.note && <span className="muted ml-1.5 text-[11px]">{a.note}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── 우리에게 없는 글 유형 ── */}
          {data.missing.length > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-[12px] leading-relaxed text-amber-800 dark:text-amber-200">
              <b>우리 최근 글에 없는 유형</b> —{' '}
              {data.missing.map((m) => `「${m.label}」 (상위 ${m.of}곳 중 ${m.peersWith}곳이 씁니다)`).join(' · ')}.
              순위 근거가 아니라 <b>빈칸</b>입니다. 빈칸은 채울 수 있습니다.
            </div>
          )}

          {/* ── 블로그별 ── */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-[12px]">
              <thead>
                <tr className="muted bd border-b text-left">
                  <th className="py-1.5 pr-2 font-semibold">블로그</th>
                  <th className="py-1.5 pr-2 font-semibold">순위</th>
                  <th className="py-1.5 pr-2 font-semibold">첫 글</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">이웃</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">오늘</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">주당</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">댓글</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">공감</th>
                  <th className="py-1.5 font-semibold">최근 {data.peers[0]?.sampled ?? 30}편 유형</th>
                </tr>
              </thead>
              <tbody>
                {[...data.peers, ...(data.mine ? [data.mine] : [])].map((r) => (
                  <tr
                    key={r.blogId}
                    className={`bd border-b last:border-0 align-top ${
                      r.where.includes('우리') ? 'font-semibold' : ''
                    }`}
                  >
                    <td className="py-1.5 pr-2">
                      {r.blogId}
                      {r.where.includes('우리') && <span className="text-brand-600 dark:text-brand-100"> (우리)</span>}
                    </td>
                    <td className="muted py-1.5 pr-2 whitespace-nowrap">{r.where.join('·')}</td>
                    <td className="tnum py-1.5 pr-2 whitespace-nowrap">
                      {r.firstPost ?? '—'}
                      {r.ageYears !== null && <span className="muted"> ({r.ageYears}년)</span>}
                    </td>
                    <td className="tnum py-1.5 pr-2 text-right">{n(r.buddies)}</td>
                    <td className="tnum py-1.5 pr-2 text-right">{n(r.dayVisitors)}</td>
                    <td className="tnum py-1.5 pr-2 text-right">{n(r.pace.perWeek)}편</td>
                    <td className="tnum py-1.5 pr-2 text-right">{n(r.commentAvg)}</td>
                    <td className="tnum py-1.5 pr-2 text-right">{n(r.likeAvg)}</td>
                    <td className="py-1.5">
                      {r.types.map((t) => `${t.label} ${t.share}%`).join(' · ')}
                      {r.onTopic !== null && (
                        <span className="muted"> · 헬스·운동 {r.onTopic}%</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="muted text-[11px] leading-relaxed">
            <b>「첫 글」은 개설일이 아닙니다</b> — 개설일은 밖에서 볼 수 없어서 가장 오래된 글 날짜를 하한으로
            씁니다.
            <br />
            <b>점수로 합치지 않았습니다.</b> 축마다 방향이 다르고, 어느 축이 순위를 만드는지 우리는 모릅니다.
            2026-08-20 실측에서 상위 블로그는 대부분 <b>잡블로그</b>였고(헬스·운동 글 중간값 10%), 블로그 나이도
            우리보다 짧았습니다(중간값 1.7년 / 우리 4.8년). 두정동 헬스장 1위 블로그의 첫 글은 2.5개월 전입니다.
            <br />
            우리가 뚜렷하게 뒤진 것은 <b>오늘 방문자</b>와 <b>발행 빈도</b>였습니다. 다만 발행 빈도도 순위를
            만든다는 근거는 없습니다 — 1~2위 그룹과 3~5위 그룹이 겹쳤습니다.
          </p>

          {data.failed.length > 0 && (
            <p className="muted text-[11px]">못 읽은 블로그 {data.failed.length}곳: {data.failed.join(' · ')}</p>
          )}
        </div>
      )}
    </Card>
  )
}
