'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import type { KeywordMetric, Store } from '@/lib/types'
import { GRADE_LABEL } from '@/lib/types'
import {
  COMPETITION_GOOD,
  INTENT_SUFFIXES,
  areasFromStore,
  buildManualMetrics,
  buildMetric,
  combineLocalKeywords,
  parseManualRows,
  suffixesForStore,
} from '@/lib/analysis/keyword'
import { parseTotalCount } from '@/lib/analysis/paste'
import { areasFromPlace } from '@/lib/naver/place'
import { naverBlogSectionUrl } from '@/lib/analysis/rank'
import type { TrendSeries } from '@/lib/naver/datalab'
import { Badge, Card, Empty, Field, MockNotice, inputClass } from '@/components/ui'
import LineChart, { MiniBar } from '@/components/LineChart'

type Sort = 'competition' | 'volume'

function gradeTone(g: KeywordMetric['grade']) {
  return g === 'gold' ? 'good' : g === 'good' ? 'info' : g === 'hard' ? 'bad' : g === 'toobig' ? 'warn' : 'default'
}

const NUM = (n: number | null) => (n === null ? '—' : n.toLocaleString())

function sortMetrics(list: KeywordMetric[], mode: Sort): KeywordMetric[] {
  const copy = [...list]
  if (mode === 'competition') {
    // 진입 가능한 것부터: 등급 좋은 순 → 경쟁률 낮은 순
    const order: Record<string, number> = { gold: 0, good: 1, toobig: 2, hard: 3, toosmall: 4, unknown: 5 }
    copy.sort((a, b) => order[a.grade] - order[b.grade] || a.competition - b.competition)
  } else {
    copy.sort((a, b) => b.monthlySearch - a.monthlySearch)
  }
  return copy
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

  /** 조회로 못 읽은 발행량을 표에서 바로 채워 넣는 값 (키워드 → 입력한 문자열) */
  const [totalInput, setTotalInput] = useState<Record<string, string>>({})
  /** 표시 순서 (키워드 목록) — 입력 중에 줄이 튀지 않게 고정해 둔다 */
  const [order, setOrder] = useState<string[]>([])
  /** 플레이스 조회 진행·결과 안내 */
  const [placeMsg, setPlaceMsg] = useState<string | null>(null)

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

  /** 새 결과를 받을 때 — 표시 순서를 새로 잡고 이전에 넣은 발행량은 비운다 */
  function applyRows(list: KeywordMetric[]) {
    setRows(list)
    setTotalInput({})
    setOrder(sortMetrics(list, sort).map((r) => r.keyword))
  }

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
      applyRows(json.rows)
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
      setError('"키워드, 월검색량, 30일 발행량" 형식으로 한 줄씩 넣어주세요.')
      return
    }
    setError(null)
    applyRows(buildManualMetrics(parsed))
  }

  /**
   * 지점 정보에서 동네를 뽑아 조합까지 만들어 준다.
   * 인자가 없으면 전 지점을 합친다. 지점 성격(24시·여성전용)에 맞는 의도를 곱한다.
   */
  async function fillFromStore(store?: Store) {
    const list = store ? [store] : stores
    if (!list.length) return
    const local = Array.from(new Set(list.flatMap(areasFromStore)))
    // 여러 지점을 합칠 때는 어느 한 지점 성격에만 맞추면 안 되니 공통 의도를 쓴다
    const suffixes = store ? suffixesForStore(store) : INTENT_SUFFIXES

    // 1) 적어둔 정보로 즉시 채운다 — 조회가 느리거나 실패해도 버튼이 먹통이 되지 않게
    if (local.length) {
      setError(null)
      setAreas(local.join(', '))
      setCombos(combineLocalKeywords(local, suffixes))
      setPicked([])
    }

    // 2) 네이버 플레이스에서 실제 등록 주소를 확인해 빠진 동네를 더한다
    setPlaceMsg('네이버 플레이스에서 등록 주소 확인 중…')
    const found = new Set(local)
    for (const s of list) {
      const areas = await placeAreas(s.legalName || s.name)
      areas.forEach((a) => found.add(a))
    }
    const allAreas = Array.from(found)

    if (!allAreas.length) {
      setPlaceMsg(null)
      setError('지점 주소와 플레이스 모두에서 동네를 찾지 못했습니다. 지역명을 직접 넣어주세요.')
      return
    }
    setError(null)
    setAreas(allAreas.join(', '))
    setCombos(combineLocalKeywords(allAreas, suffixes))
    setPicked([])
    const added = allAreas.length - local.length
    setPlaceMsg(
      added > 0
        ? `플레이스 등록 주소에서 ${added}개 동네를 더 찾아 넣었습니다.`
        : '플레이스 등록 주소도 같은 동네였습니다.'
    )
  }

  /** 상호명으로 플레이스를 찾아 동네만 돌려준다. 실패하면 빈 배열 */
  async function placeAreas(name: string): Promise<string[]> {
    if (!name.trim()) return []
    try {
      const res = await fetch('/api/place', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: name }),
      })
      const json = await res.json()
      const places: { commonAddress: string; address: string }[] = json.places ?? []
      // 여러 후보가 나오면 첫 번째(가장 관련도 높은 것)만 쓴다
      return places.length ? areasFromPlace(places[0]) : []
    } catch {
      return []
    }
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

  /** 조회 결과에 발행량이 빠진 행 — 입력칸을 계속 보여줘야 하므로 원본 기준으로 기억한다 */
  const needsTotal = useMemo(
    () => new Set((rows ?? []).filter((r) => r.blogRecent === null).map((r) => r.keyword)),
    [rows]
  )

  /**
   * 검색량은 검색광고 API 실측, 발행량은 회원이 눈으로 본 값 — 둘을 합쳐 등급을 다시 낸다.
   * 등급 기준은 조회와 완전히 동일한 buildMetric 을 그대로 쓴다.
   */
  const merged = useMemo(() => {
    if (!rows) return null
    return rows.map((r) => {
      if (r.blogRecent !== null) return r
      const raw = totalInput[r.keyword]?.trim()
      if (!raw) return r
      const n = parseTotalCount(raw) ?? Number(raw.replace(/[^\d]/g, ''))
      if (!Number.isFinite(n) || n <= 0) return r
      return buildMetric({
        keyword: r.keyword,
        monthlySearch: r.monthlySearch,
        monthlyPc: r.monthlyPc,
        monthlyMobile: r.monthlyMobile,
        blogRecent: n,
        compIdx: r.compIdx,
        mock: r.mock,
        source: r.source,
      })
    })
  }, [rows, totalInput])

  /**
   * 화면에 그릴 순서.
   *
   * 발행량을 타이핑하면 등급이 바뀌는데, 그때마다 다시 정렬하면 편집 중인 줄이 위아래로
   * 튀어서 못 쓴다. 그래서 순서는 키워드 목록으로 고정해 두고, 다시 정렬은 명시적으로만 한다.
   */
  const sorted = useMemo(() => {
    if (!merged) return null
    if (!order.length) return merged
    const byKeyword = new Map(merged.map((r) => [r.keyword, r]))
    const out = order.map((k) => byKeyword.get(k)).filter((r): r is KeywordMetric => Boolean(r))
    const seen = new Set(order)
    for (const r of merged) if (!seen.has(r.keyword)) out.push(r)
    return out
  }, [merged, order])

  function resort(mode: Sort = sort) {
    setOrder(sortMetrics(merged ?? [], mode).map((r) => r.keyword))
  }

  const dirty = Object.values(totalInput).some((v) => v.trim())

  const maxVolume = useMemo(() => Math.max(1, ...(rows?.map((r) => r.monthlySearch) ?? [1])), [rows])
  const isMock = Boolean(rows?.some((r) => r.mock))
  const isManual = Boolean(rows?.length && rows.every((r) => r.source === 'manual'))
  const unknownCount = merged?.filter((r) => r.grade === 'unknown').length ?? 0

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
      {/* 카드가 여러 개라 무엇부터 해야 하는지 안 보인다. 순서를 먼저 적어둔다. */}
      <div className="bd panel rounded-xl border px-4 py-3">
        <p className="text-[13px] font-bold">쓰는 순서</p>
        <ol className="mt-2 grid gap-1.5 text-[12px] leading-relaxed sm:grid-cols-2">
          {[
            ['지점 버튼 한 번', '아래 「지역 키워드 조합」에서 지점을 누르면 주소에서 동네를 뽑아 후보를 만듭니다'],
            ['조회', '고른 키워드 + 연관 키워드까지 검색량·발행량·등급이 자동으로 나옵니다'],
            ['「황금 키워드」 줄 고르기', '검색은 되는데 새 글이 적은 자리입니다'],
            ['상위노출 분석 → 글쓰기', '그 줄의 링크로 바로 이어집니다'],
          ].map(([t, d], i) => (
            <li key={t} className="flex gap-2">
              <span className="bg-brand-500/15 text-brand-700 dark:text-brand-100 tnum mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold">
                {i + 1}
              </span>
              <span className="min-w-0">
                <b>{t}</b>
                <br />
                <span className="muted text-[11px]">{d}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>

      <Card
        title="키워드 조회"
        subtitle="한 번에 5개까지. 입력한 키워드의 연관 키워드도 함께 등급을 매깁니다. 무엇을 넣을지 모르겠으면 아래 「지역 키워드 조합」부터 쓰세요."
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
                  aria-label={`${s.name} 지역 키워드를 조회칸에 채우기`}
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
          월 검색량은 네이버 <b>검색광고 API</b>, 최근 30일 발행량은 <b>블로그 섹션 검색</b>에서
          자동으로 가져옵니다. 발행량 쪽은 공식 API 가 아니라 네이버 화면이 쓰는 경로라, 막히거나
          응답이 바뀌면 <b>판정 불가</b>로 표시되고 그 줄만 직접 넣으면 됩니다.
        </p>

        {error && (
          <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-700 dark:text-rose-300">
            {error}
          </p>
        )}
      </Card>

      <Card
        title="지역 키워드 조합 만들기"
        subtitle="스마트블록은 세부 의도를 가진 키워드에 걸릴 기회가 큽니다. 지역명에 의도를 곱해 후보를 만드세요."
      >
        {stores.length > 0 ? (
          <div className="bd mb-3 rounded-lg border border-dashed p-3">
            <p className="text-[12px] font-semibold">내 지점에서 자동으로 채우기</p>
            <p className="muted mt-1 text-[11px] leading-relaxed">
              지점 버튼을 누르면 <b>네이버 플레이스에 등록된 주소</b>와 지점 정보에서 동네를 뽑고,
              지점 성격에 맞는 의도까지 곱해 후보를 만듭니다 (24시간 운영이면 새벽·주말, 여성전용이면
              여성전용 계열).
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {stores.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => fillFromStore(s)}
                  aria-label={`${s.name} 동네로 조합 만들기`}
                  className="bg-brand-600 rounded-full px-3 py-1.5 text-[11px] font-semibold text-white"
                >
                  {s.name}
                </button>
              ))}
              {stores.length > 1 && (
                <button
                  type="button"
                  onClick={() => fillFromStore()}
                  className="bd rounded-full border px-3 py-1.5 text-[11px] font-semibold hover:bg-slate-500/8"
                >
                  전 지점 합쳐서
                </button>
              )}
            </div>
            {placeMsg && <p className="muted mt-2 text-[11px] leading-relaxed">{placeMsg}</p>}
          </div>
        ) : (
          <p className="muted mb-3 text-[11px] leading-relaxed">
            <Link href="/stores" className="text-brand-600 dark:text-brand-100 font-semibold underline">
              지점
            </Link>
            을 먼저 등록하면 주소에서 동네를 자동으로 뽑아 채워드립니다.
          </p>
        )}

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

      {/* 자동 조회가 되는 동안에는 쓸 일이 없어서 접어 둔다 — 비상용 경로 */}
      <details className="bd panel rounded-xl border px-4 py-3">
        <summary className="cursor-pointer text-[13px] font-bold select-none">
          직접 입력으로 경쟁률 계산
          <span className="muted ml-2 text-[11px] font-normal">
            자동 조회가 막혔을 때만 — 평소에는 열지 않아도 됩니다
          </span>
        </summary>
        <div className="mt-3">
          <p className="muted mb-3 text-[12px] leading-relaxed">
            위 조회에서 <b>판정 불가</b>로 나온 줄은 표 안의 입력칸에 발행량만 넣는 쪽이 빠릅니다
            (검색량을 다시 적지 않아도 되니까요). 이 칸은 검색량까지 손으로 넣어야 할 때 씁니다.
          </p>
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
                2. <b>최근 30일 발행량</b> — 아래 링크로 <b>블로그 섹션 검색</b>을 열고 기간을{' '}
                <b>1개월</b>로 맞추면 총 건수가 나옵니다. (통합검색 블로그 탭에는 총 건수가 이제
                표시되지 않습니다)
              </li>
            </ol>
          </div>

          <div className="mt-3">
            <Field
              label="키워드, 월검색량, 30일 발행량 (한 줄에 하나)"
              hint="콤마·탭·| 로 구분합니다. 1,200 처럼 천단위 콤마를 써도 되고 '회'·'건' 을 붙여도 됩니다."
            >
              <textarea
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                rows={4}
                className={`${inputClass} font-mono text-[12px]`}
                placeholder={'쌍용동 헬스장, 1,430, 437\n성정동 여성전용 헬스장, 320, 96'}
              />
            </Field>
          </div>

          {manualKeywords.length > 0 && (
            <div className="mt-2.5">
              <p className="muted mb-1.5 text-[11px] font-semibold">
                30일 발행량 보러 가기 (기간을 1개월로 맞추세요)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {manualKeywords.map((k) => (
                  <a
                    key={k}
                    href={naverBlogSectionUrl(k)}
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
        </div>
      </details>

      {sorted && (
        <Card
          title={`조회 결과 ${sorted.length}개`}
          subtitle="경쟁률 = 최근 30일 발행량 ÷ 월간 검색량. 0.3이면 검색 3회당 새 글 1개꼴로 시장이 비어 있다는 뜻입니다. 1을 넘으면 검색보다 새 글이 더 많이 쏟아지는 포화 상태입니다."
          right={
            <div className="flex flex-wrap items-center gap-1.5">
              {dirty && (
                <button
                  type="button"
                  onClick={() => resort()}
                  className="bd rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold hover:bg-slate-500/8"
                >
                  다시 정렬
                </button>
              )}
              <select
                value={sort}
                onChange={(e) => {
                  const mode = e.target.value as Sort
                  setSort(mode)
                  resort(mode)
                }}
                className="bd panel rounded-lg border px-2 py-1.5 text-xs"
              >
                <option value="competition">진입 쉬운 순</option>
                <option value="volume">검색량 많은 순</option>
              </select>
            </div>
          }
        >
          {isMock && <MockNotice what="검색광고·검색" />}
          {unknownCount > 0 && (
            <p className="mb-3 rounded-lg border border-slate-500/30 bg-slate-500/10 px-3 py-2 text-[12px] leading-relaxed">
              {unknownCount}개가 <strong>판정 불가</strong>입니다 — 그 줄만 발행량 자동 조회가
              실패했습니다. 없는 값을 0으로 넣고 계산하면 경쟁률이 0이 되어 실제로는 과열된 키워드가
              &quot;황금 키워드&quot;로 보이기 때문에 판정을 내리지 않았습니다.{' '}
              <strong>「건수 보기」로 네이버를 열어 최근 30일 글 수를 넣으면</strong> 그 줄의 등급이
              바로 나옵니다 — 검색량은 이미 실측값이라 다시 적지 않아도 됩니다.
            </p>
          )}
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
                  <th className="py-2 pr-3 font-semibold">30일 발행량</th>
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
                    <td className="py-2.5 pr-3 whitespace-nowrap">
                      {needsTotal.has(r.keyword) ? (
                        <div className="flex flex-col gap-1">
                          <input
                            value={totalInput[r.keyword] ?? ''}
                            onChange={(e) =>
                              setTotalInput((prev) => ({ ...prev, [r.keyword]: e.target.value }))
                            }
                            placeholder="437"
                            aria-label={`${r.keyword} 30일 발행량`}
                            className="panel w-24 rounded-lg border px-2 py-1.5 text-[12px] outline-none focus:border-brand-500"
                          />
                          <a
                            href={naverBlogSectionUrl(r.keyword)}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="text-brand-600 dark:text-brand-100 text-[11px] font-semibold hover:underline"
                          >
                            30일 건수 →
                          </a>
                        </div>
                      ) : (
                        <>
                          <div className="tnum">
                            {r.blogRecentNote === 'estimated' ? '~' : ''}
                            {NUM(r.blogRecent)}
                            {r.blogRecentNote === 'atLeast' ? '+' : ''}
                          </div>
                          {r.blogRecentNote && (
                            <div className="muted text-[11px]">
                              {r.blogRecentNote === 'estimated' ? '7일 실측 환산' : '1,000건 초과'}
                            </div>
                          )}
                        </>
                      )}
                    </td>
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
