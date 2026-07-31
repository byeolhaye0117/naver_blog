'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import type { KeywordMetric, Store } from '@/lib/types'
import { GRADE_LABEL } from '@/lib/types'
import {
  COMPETITION_GOOD,
  INTENT_SUFFIXES,
  buildManualMetrics,
  combineLocalKeywords,
  parseManualRows,
} from '@/lib/analysis/keyword'
import { naverBlogTabUrl } from '@/lib/analysis/rank'
import type { TrendSeries } from '@/lib/naver/datalab'
import { Badge, Card, Empty, Field, MockNotice, inputClass } from '@/components/ui'
import LineChart, { MiniBar } from '@/components/LineChart'

type Sort = 'competition' | 'volume'

function gradeTone(g: KeywordMetric['grade']) {
  return g === 'gold' ? 'good' : g === 'good' ? 'info' : g === 'hard' ? 'bad' : g === 'toobig' ? 'warn' : 'default'
}

export default function KeywordExplorer({ stores, keys }: { stores: Store[]; keys: { search: boolean; searchAd: boolean } }) {
  const [raw, setRaw] = useState('')
  const [rows, setRows] = useState<KeywordMetric[] | null>(null)
  const [sort, setSort] = useState<Sort>('competition')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [areas, setAreas] = useState('')
  const [combos, setCombos] = useState<string[]>([])
  const [picked, setPicked] = useState<string[]>([])

  const [manual, setManual] = useState('')
  const [badLines, setBadLines] = useState<string[]>([])

  const [trendKeyword, setTrendKeyword] = useState<string | null>(null)
  const [trend, setTrend] = useState<TrendSeries | null>(null)
  const [trendLoading, setTrendLoading] = useState(false)

  const keywords = useMemo(
    () =>
      raw
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 5),
    [raw]
  )

  async function run(list = keywords) {
    if (!list.length) {
      setError('키워드를 1개 이상 입력하세요.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords: list }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '조회에 실패했습니다.')
      setRows(json.rows)
    } catch (e) {
      setError(e instanceof Error ? e.message : '조회 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  /** 직접 입력한 검색량·발행량으로 등급 매기기 — API 없이 굴러가는 경로 */
  function runManual() {
    const { rows: parsed, bad } = parseManualRows(manual)
    setBadLines(bad)
    if (!parsed.length) {
      setError('"키워드, 월검색량, 발행량" 형식으로 한 줄씩 넣어주세요.')
      return
    }
    setError(null)
    setRows(buildManualMetrics(parsed))
  }

  /** 입력한 키워드·고른 조합으로 빈 표를 만들어 준다 (숫자만 채우면 됨) */
  function prefillManual() {
    const list = picked.length ? picked : keywords
    if (!list.length) return
    setManual(list.map((k) => `${k}, , `).join('\n'))
  }

  async function loadTrend(keyword: string) {
    setTrendKeyword(keyword)
    setTrendLoading(true)
    setTrend(null)
    try {
      const res = await fetch('/api/trend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords: [keyword] }),
      })
      const json = await res.json()
      if (res.ok && json.series?.length) setTrend(json.series[0])
    } finally {
      setTrendLoading(false)
    }
  }

  const sorted = useMemo(() => {
    if (!rows) return null
    const copy = [...rows]
    if (sort === 'competition') {
      // 진입 가능한 것부터: 등급 좋은 순 → 경쟁률 낮은 순
      const order: Record<string, number> = { gold: 0, good: 1, toobig: 2, hard: 3, toosmall: 4 }
      copy.sort((a, b) => order[a.grade] - order[b.grade] || a.competition - b.competition)
    } else {
      copy.sort((a, b) => b.monthlySearch - a.monthlySearch)
    }
    return copy
  }, [rows, sort])

  const maxVolume = useMemo(() => Math.max(1, ...(rows?.map((r) => r.monthlySearch) ?? [1])), [rows])
  const isMock = Boolean(rows?.some((r) => r.mock))
  const isManual = Boolean(rows?.length && rows.every((r) => r.source === 'manual'))

  const manualKeywords = useMemo(
    () =>
      Array.from(
        new Set(
          manual
            .split(/\r?\n/)
            .map((l) => l.split(/[|\t,]/)[0].trim())
            .filter(Boolean)
        )
      ).slice(0, 12),
    [manual]
  )

  function togglePick(k: string) {
    setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : p.length >= 5 ? p : [...p, k]))
  }

  return (
    <div className="space-y-4">
      <Card
        title="키워드 조회"
        subtitle="한 번에 5개까지. 입력한 키워드의 연관 키워드도 함께 등급을 매깁니다."
      >
        <Field
          label="키워드 (쉼표 또는 줄바꿈으로 구분)"
          hint="예: 쌍용동 헬스장, 다이어트 정체기 극복, 교대근무 운동"
        >
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={2}
            className={inputClass}
            placeholder="쌍용동 헬스장, 성정동 여성전용"
          />
        </Field>

        {stores.length > 0 && (
          <div className="mt-3">
            <p className="muted mb-1.5 text-[11px] font-semibold">지점 지역 키워드로 바로 채우기</p>
            <div className="flex flex-wrap gap-1.5">
              {stores.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setRaw(s.localKeywords.slice(0, 5).join(', '))}
                  className="bd rounded-full border px-2.5 py-1 text-[11px] font-semibold hover:bg-slate-500/8"
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => run()}
            disabled={loading}
            className="bg-brand-600 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {loading ? '조회 중…' : '검색량 · 경쟁률 조회'}
          </button>
          {keywords.length > 0 && <span className="muted text-xs">{keywords.length}개 입력됨</span>}
        </div>
        <p className="muted mt-2 text-[11px] leading-relaxed">
          이 조회는 네이버 <b>검색광고 API</b>(월 검색량)와 <b>검색 API</b>(발행량)를 씁니다. 키가
          없거나 권한이 없으면 샘플 숫자가 나오니, 그때는 아래 <b>직접 입력</b>을 쓰세요 — 등급 기준은
          똑같습니다.
        </p>

        {error && (
          <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-700 dark:text-rose-300">
            {error}
          </p>
        )}
      </Card>

      <Card
        title="직접 입력으로 경쟁률 계산"
        subtitle="검색 API·검색광고 API 없이 쓰는 경로입니다. 네이버에서 눈으로 본 숫자를 그대로 넣으면 같은 기준으로 등급을 매깁니다 — 실측값이라 오히려 정확합니다."
      >
        <div className="bd rounded-lg border border-dashed p-3">
          <p className="text-[12px] font-semibold">숫자 두 개를 어디서 보나요</p>
          <ol className="muted mt-1.5 space-y-1 text-[11px] leading-relaxed">
            <li>
              1. <b>월간 검색량</b> —{' '}
              <a
                href="https://searchad.naver.com"
                target="_blank"
                rel="noreferrer noopener"
                className="text-brand-600 dark:text-brand-100 font-semibold underline"
              >
                네이버 검색광고
              </a>{' '}
              로그인 → 도구 → 키워드 도구 → 키워드 입력 → PC·모바일 검색량을 더한 값
            </li>
            <li>
              2. <b>발행량</b> — 블로그 탭 검색 결과 위쪽의 <b>○○건</b> 숫자 (아래 링크로 바로 열
              수 있습니다)
            </li>
          </ol>
        </div>

        <div className="mt-3">
          <Field
            label="키워드, 월검색량, 발행량 (한 줄에 하나)"
            hint="콤마·탭·| 로 구분합니다. 1,200 처럼 천단위 콤마를 써도 되고 '회'·'건' 을 붙여도 됩니다."
          >
            <textarea
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              rows={4}
              className={`${inputClass} font-mono text-[12px]`}
              placeholder={'쌍용동 헬스장, 1,200, 45,000\n성정동 여성전용 헬스장, 320, 3,100'}
            />
          </Field>
        </div>

        {manualKeywords.length > 0 && (
          <div className="mt-2.5">
            <p className="muted mb-1.5 text-[11px] font-semibold">
              발행량 보러 가기 (블로그 탭 열기)
            </p>
            <div className="flex flex-wrap gap-1.5">
              {manualKeywords.map((k) => (
                <a
                  key={k}
                  href={naverBlogTabUrl(k)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="bd rounded-full border px-2.5 py-1 text-[11px] font-semibold hover:bg-slate-500/8"
                >
                  {k} →
                </a>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={runManual}
            className="bg-brand-600 rounded-lg px-4 py-2 text-sm font-semibold text-white"
          >
            등급 매기기
          </button>
          {(keywords.length > 0 || picked.length > 0) && (
            <button
              type="button"
              onClick={prefillManual}
              className="bd rounded-lg border px-3.5 py-2 text-sm font-semibold hover:bg-slate-500/8"
            >
              위에 적은 키워드로 빈 줄 만들기
            </button>
          )}
        </div>

        {badLines.length > 0 && (
          <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-800 dark:text-amber-200">
            <p className="font-semibold">형식을 못 읽은 줄 {badLines.length}개 — 숫자 두 개가 다 있어야 합니다</p>
            <ul className="mt-1 space-y-0.5 font-mono text-[11px]">
              {badLines.slice(0, 5).map((l, i) => (
                <li key={i} className="truncate">
                  {l}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Card
        title="지역 키워드 조합 만들기"
        subtitle="스마트블록은 세부 의도를 가진 키워드에 걸릴 기회가 큽니다. 지역명에 의도를 곱해 후보를 만드세요."
      >
        <Field label="지역명 (쉼표로 구분)" hint="예: 쌍용동, 봉명동, 성정동, 두정동">
          <input
            value={areas}
            onChange={(e) => setAreas(e.target.value)}
            className={inputClass}
            placeholder="쌍용동, 봉명동"
          />
        </Field>
        <button
          type="button"
          onClick={() =>
            setCombos(
              combineLocalKeywords(
                areas.split(',').map((s) => s.trim()).filter(Boolean),
                INTENT_SUFFIXES
              )
            )
          }
          className="bd mt-3 rounded-lg border px-3.5 py-2 text-sm font-semibold hover:bg-slate-500/8"
        >
          조합 생성
        </button>

        {combos.length > 0 && (
          <>
            <p className="muted mt-4 mb-2 text-[11px]">
              {combos.length}개 생성. 조회할 것을 최대 5개까지 고르세요 ({picked.length}/5)
            </p>
            <div className="flex flex-wrap gap-1.5">
              {combos.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => togglePick(c)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                    picked.includes(c)
                      ? 'bg-brand-600 border-brand-600 text-white'
                      : 'bd hover:bg-slate-500/8'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            {picked.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setRaw(picked.join(', '))
                  run(picked)
                }}
                disabled={loading}
                className="bg-brand-600 mt-3 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                고른 {picked.length}개 조회
              </button>
            )}
          </>
        )}
      </Card>

      {sorted && (
        <Card
          title={`조회 결과 ${sorted.length}개`}
          subtitle="경쟁률 = 블로그 누적 발행량 ÷ 월간 검색량. 찾는 사람 대비 이미 쓰인 글이 몇 배인지를 뜻합니다."
          right={
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="bd panel rounded-lg border px-2 py-1.5 text-xs"
            >
              <option value="competition">진입 쉬운 순</option>
              <option value="volume">검색량 많은 순</option>
            </select>
          }
        >
          {isMock && <MockNotice what="검색광고·검색" />}
          {isManual && (
            <p className="mb-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[12px] leading-relaxed text-emerald-800 dark:text-emerald-200">
              회원님이 직접 넣은 숫자로 계산한 결과입니다 — 샘플이 아닙니다. 등급 기준은 API 조회와
              똑같습니다 (월 검색량 500~5,000 + 경쟁률 {COMPETITION_GOOD} 이하 = 황금 키워드).
            </p>
          )}

          <div className="scroll-x -mx-4 px-4 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[620px] text-[12px]">
              <thead>
                <tr className="muted bd border-b text-left">
                  <th className="py-2 pr-3 font-semibold">키워드</th>
                  <th className="py-2 pr-3 font-semibold">월 검색량</th>
                  <th className="py-2 pr-3 font-semibold">발행량</th>
                  <th className="py-2 pr-3 font-semibold">경쟁률</th>
                  <th className="py-2 pr-3 font-semibold">등급</th>
                  <th className="py-2 font-semibold">할 일</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.keyword} className="bd border-b last:border-0 align-top">
                    <td className="py-2.5 pr-3">
                      <div className="font-semibold">{r.keyword}</div>
                      {r.source === 'manual' ? (
                        <div className="muted mt-0.5 text-[11px]">직접 입력</div>
                      ) : (
                        <div className="muted mt-0.5 text-[11px]">모바일 {r.mobileShare}%</div>
                      )}
                    </td>
                    <td className="tnum py-2.5 pr-3 whitespace-nowrap">
                      <div>{r.monthlySearch.toLocaleString()}</div>
                      <MiniBar ratio={r.monthlySearch / maxVolume} />
                    </td>
                    <td className="tnum py-2.5 pr-3 whitespace-nowrap">{r.blogTotal.toLocaleString()}</td>
                    <td className="tnum py-2.5 pr-3 whitespace-nowrap font-semibold">
                      {r.competition >= 999 ? '—' : r.competition}
                      {r.compIdx && <div className="muted text-[11px] font-normal">{r.compIdx}</div>}
                    </td>
                    <td className="py-2.5 pr-3">
                      <Badge tone={gradeTone(r.grade)}>{GRADE_LABEL[r.grade]}</Badge>
                      <p className="muted mt-1 max-w-[240px] text-[11px] leading-snug">{r.gradeReason}</p>
                    </td>
                    <td className="py-2.5 whitespace-nowrap">
                      <div className="flex flex-col gap-1">
                        <Link
                          href={`/serp?keyword=${encodeURIComponent(r.keyword)}`}
                          className="text-brand-600 dark:text-brand-100 text-[11px] font-semibold hover:underline"
                        >
                          상위노출 분석 →
                        </Link>
                        <Link
                          href={`/write?main=${encodeURIComponent(r.keyword)}`}
                          className="text-brand-600 dark:text-brand-100 text-[11px] font-semibold hover:underline"
                        >
                          이 키워드로 글쓰기 →
                        </Link>
                        <button
                          type="button"
                          onClick={() => loadTrend(r.keyword)}
                          className="muted text-left text-[11px] font-semibold hover:underline"
                        >
                          검색 추이 보기
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {trendKeyword && (
        <Card
          title={`"${trendKeyword}" 검색 추이`}
          subtitle="최근 13개월. 최고값을 100으로 놓은 상대 지수입니다 — 계절성과 상승세를 봅니다."
        >
          {trendLoading ? (
            <Empty>불러오는 중…</Empty>
          ) : trend ? (
            <>
              {trend.mock && <MockNotice what="데이터랩" />}
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge tone={trend.momentum > 10 ? 'good' : trend.momentum < -10 ? 'bad' : 'default'}>
                  최근 3개월 {trend.momentum > 0 ? `+${trend.momentum}` : trend.momentum}%
                </Badge>
                <span className="muted text-[11px]">직전 3개월 평균 대비</span>
              </div>
              <LineChart
                points={trend.data.map((d) => ({ label: d.period.slice(2, 7), value: d.ratio }))}
                yMin={0}
                yMax={100}
                ticks={[0, 50, 100]}
                valueName="검색 지수"
                height={180}
              />
            </>
          ) : (
            <Empty>추이 데이터를 불러오지 못했습니다.</Empty>
          )}
        </Card>
      )}
    </div>
  )
}
