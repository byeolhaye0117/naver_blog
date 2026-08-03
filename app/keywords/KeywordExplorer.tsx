'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import type { KeywordMetric, PlaceRank, Store } from '@/lib/types'
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
import { parsePlaceList, parseTotalCount } from '@/lib/analysis/paste'
import { findMyPlaceIndex, type PlaceInfo } from '@/lib/naver/place'
import { naverBlogSectionUrl, naverPlaceSearchUrl } from '@/lib/analysis/rank'
import type { TrendSeries } from '@/lib/naver/datalab'
import { Badge, Card, Empty, Field, MockNotice, inputClass } from '@/components/ui'
import LineChart, { MiniBar } from '@/components/LineChart'

type Sort = 'competition' | 'volume'

function gradeTone(g: KeywordMetric['grade']) {
  return g === 'gold' ? 'good' : g === 'good' ? 'info' : g === 'hard' ? 'bad' : g === 'toobig' ? 'warn' : 'default'
}

const NUM = (n: number | null) => (n === null ? '—' : n.toLocaleString())

/** 내가 넣은 키워드는 어떤 정렬에서도 위에 둔다 — 연관 키워드에 묻히면 안 된다 */
function sortMetrics(list: KeywordMetric[], mode: Sort, requested: string[] = []): KeywordMetric[] {
  const mine = new Set(requested)
  const isMine = (k: string) => mine.has(k.replace(/\s+/g, ''))
  const copy = [...list]
  if (mode === 'competition') {
    // 진입 가능한 것부터: 등급 좋은 순 → 경쟁률 낮은 순
    const order: Record<string, number> = { gold: 0, good: 1, toobig: 2, hard: 3, toosmall: 4, unknown: 5 }
    copy.sort(
      (a, b) =>
        Number(isMine(b.keyword)) - Number(isMine(a.keyword)) ||
        order[a.grade] - order[b.grade] ||
        a.competition - b.competition
    )
  } else {
    copy.sort(
      (a, b) =>
        Number(isMine(b.keyword)) - Number(isMine(a.keyword)) ||
        b.monthlySearch - a.monthlySearch
    )
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

  /** 연관 키워드도 함께 볼지 — 기본은 끔. 켜면 내 동네 것만 붙는다 */
  const [withRelated, setWithRelated] = useState(false)
  /** 내가 넣은 키워드 (표에서 구분 표시) */
  const [requested, setRequested] = useState<string[]>([])

  const [manual, setManual] = useState('')
  const [badLines, setBadLines] = useState<string[]>([])

  /** 조회로 못 읽은 발행량을 표에서 바로 채워 넣는 값 (키워드 → 입력한 문자열) */
  const [totalInput, setTotalInput] = useState<Record<string, string>>({})
  /** 표시 순서 (키워드 목록) — 입력 중에 줄이 튀지 않게 고정해 둔다 */
  const [order, setOrder] = useState<string[]>([])
  /** 플레이스 노출 확인 (키워드별) */
  const [placeKeyword, setPlaceKeyword] = useState<string | null>(null)
  const [places, setPlaces] = useState<PlaceInfo[] | null>(null)
  const [placeLoading, setPlaceLoading] = useState(false)
  /** 직접 본 플레이스 순위 기록 */
  const [placeRanks, setPlaceRanks] = useState<PlaceRank[]>([])
  const [prStore, setPrStore] = useState('')
  const [prRank, setPrRank] = useState('')
  const [prSaving, setPrSaving] = useState(false)
  const [prMsg, setPrMsg] = useState<string | null>(null)
  /** 플레이스 목록을 붙여넣어 번호를 세는 경로 */
  const [prPaste, setPrPaste] = useState('')

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
  function applyRows(list: KeywordMetric[], mine: string[] = []) {
    setRows(list)
    setTotalInput({})
    setRequested(mine)
    // setRequested 는 비동기라 정렬에는 인자로 받은 값을 쓴다
    setOrder(sortMetrics(list, sort, mine).map((r) => r.keyword))
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
        body: JSON.stringify({ keywords: list, includeRelated: withRelated }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '조회에 실패했습니다.')
      applyRows(
        json.rows,
        (json.requested ?? list).map((k: string) => k.replace(/\s+/g, ''))
      )
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
  function fillFromStore(store?: Store) {
    const list = store ? [store] : stores
    if (!list.length) return
    const found = Array.from(new Set(list.flatMap(areasFromStore)))
    if (!found.length) {
      setError('지점 주소에서 동네를 찾지 못했습니다. 지역명을 직접 넣어주세요.')
      return
    }
    setError(null)
    setAreas(found.join(', '))
    // 여러 지점을 합칠 때는 어느 한 지점 성격에만 맞추면 안 되니 공통 의도를 쓴다
    setCombos(combineLocalKeywords(found, store ? suffixesForStore(store) : INTENT_SUFFIXES))
    setPicked([])
  }

  /**
   * 그 키워드로 네이버 플레이스에 노출되는 업체와 내 지점 순위.
   *
   * 블로그 순위와 완전히 다른 자리다 — 지역 키워드에서는 플레이스 블록이 블로그보다
   * 위에 붙는 경우가 많아서, 블로그만 보면 실제 유입 경쟁을 절반만 보는 셈이다.
   */
  async function loadPlaces(keyword: string) {
    setPlaceKeyword(keyword)
    setPlaceLoading(true)
    setPlaces(null)
    setPrMsg(null)
    setPrRank('')
    setPrPaste('')
    // 키워드에 든 동네로 지점을 미리 골라둔다 (예: "두정동 헬스장" → 두정점)
    const guess = stores.find((s) => areasFromStore(s).some((a) => keyword.includes(a)))
    setPrStore(guess?.id ?? '')
    try {
      const [res, ranks] = await Promise.all([
        fetch('/api/place', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: keyword }),
        }),
        fetch('/api/place/rank', { cache: 'no-store' }),
      ])
      const json = await res.json()
      setPlaces(json.places ?? [])
      const rj = await ranks.json().catch(() => ({}))
      setPlaceRanks(rj.placeRanks ?? [])
    } catch {
      setPlaces([])
    } finally {
      setPlaceLoading(false)
    }
  }

  /** 눈으로 확인한 플레이스 순위를 기록 */
  async function savePlaceRank() {
    if (!placeKeyword) return
    if (!prStore) {
      setPrMsg('어느 지점 순위인지 골라주세요.')
      return
    }
    const rank = Number(prRank.replace(/[^\d]/g, ''))
    if (!Number.isInteger(rank) || rank < 1) {
      setPrMsg('순위를 숫자로 넣어주세요 (예: 13).')
      return
    }
    setPrSaving(true)
    setPrMsg(null)
    try {
      const res = await fetch('/api/place/rank', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: placeKeyword, storeId: prStore, rank }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '저장에 실패했습니다.')
      const list = await fetch('/api/place/rank', { cache: 'no-store' }).then((r) => r.json())
      setPlaceRanks(list.placeRanks ?? [])
      setPrRank('')
      setPrMsg('기록했습니다.')
    } catch (e) {
      setPrMsg(e instanceof Error ? e.message : '저장 중 오류가 발생했습니다.')
    } finally {
      setPrSaving(false)
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
    setOrder(sortMetrics(merged ?? [], mode, requested).map((r) => r.keyword))
  }

  const dirty = Object.values(totalInput).some((v) => v.trim())

  /** 내가 직접 넣은 키워드인지 (연관 키워드와 구분해 표시) */
  const isMine = (k: string) => requested.includes(k.replace(/\s+/g, ''))

  /** 붙여넣은 플레이스 목록에서 뽑은 업체명 (순서 = 순위) */
  const pastedPlaces = useMemo(() => parsePlaceList(prPaste), [prPaste])

  /** 지금 보고 있는 키워드에 대한 순위 기록 (최근 것부터 3개) */
  const savedRanks = useMemo(
    () =>
      placeRanks
        .filter((r) => r.keyword === placeKeyword)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 3),
    [placeRanks, placeKeyword]
  )

  /** 플레이스 목록에서 내 지점이 몇 번째인지 — 목록을 그릴 때마다 다시 찾지 않게 한 번만 */
  const myPlace = useMemo(
    () => (places?.length ? findMyPlaceIndex(places, stores) : { index: -1, storeName: undefined }),
    [places, stores]
  )

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
          <label className="ml-auto flex items-center gap-2 text-[12px] font-semibold">
            <input
              type="checkbox"
              checked={withRelated}
              onChange={(e) => setWithRelated(e.target.checked)}
              className="size-4"
            />
            연관 키워드도 함께
          </label>
        </div>
        <p className="muted mt-2 text-[11px] leading-relaxed">
          월 검색량은 네이버 <b>검색광고 API</b>, 최근 30일 발행량은 <b>블로그 섹션 검색</b>에서
          자동으로 가져옵니다. 발행량 쪽은 공식 API 가 아니라 네이버 화면이 쓰는 경로라, 막히거나
          응답이 바뀌면 <b>판정 불가</b>로 표시되고 그 줄만 직접 넣으면 됩니다.
          <br />
          <b>연관 키워드</b>를 켜면 검색광고 API 가 제안하는 키워드도 함께 등급을 매깁니다 — 다만
          전국 동네가 섞여 오므로 <b>내 지점이 있는 동네가 아닌 것은 빼고</b> 보여줍니다. 내가 넣은
          키워드는 어떤 정렬에서도 맨 위에 둡니다.
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
              지점 버튼을 누르면 그 지점 <b>주소·지역 키워드에서 동네를 뽑고</b>, 지점 성격에 맞는
              의도까지 곱해 후보를 만듭니다 (24시간 운영이면 새벽·주말, 여성전용이면 여성전용 계열).
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
                      {isMine(r.keyword) && (
                        <div className="mt-1">
                          <Badge tone="brand">내가 넣은 키워드</Badge>
                        </div>
                      )}
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
                          onClick={() => loadPlaces(r.keyword)}
                          className="text-brand-600 dark:text-brand-100 text-left text-[11px] font-semibold hover:underline"
                        >
                          플레이스 노출 →
                        </button>
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

      {placeKeyword && (
        <Card
          title={`"${placeKeyword}" 플레이스 노출`}
          subtitle="지역 키워드는 블로그보다 플레이스 블록이 위에 붙는 경우가 많습니다. 블로그 순위만 보면 경쟁을 절반만 보는 셈입니다."
        >
          {placeLoading ? (
            <Empty>불러오는 중…</Empty>
          ) : !places?.length ? (
            <Empty>
              이 키워드로는 플레이스 업체가 잡히지 않았습니다. 네이버가 응답 구조를 바꿨거나, 그
              키워드에 플레이스 블록이 안 붙는 경우입니다.
            </Empty>
          ) : (
            <>
              {(() => {
                const { index, storeName } = myPlace
                return (
                  <p
                    className={`mb-3 rounded-lg border px-3 py-2 text-[12px] leading-relaxed ${
                      index === 0
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                        : index > 0
                          ? 'border-sky-500/30 bg-sky-500/10 text-sky-900 dark:text-sky-200'
                          : 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200'
                    }`}
                  >
                    {index >= 0 ? (
                      <>
                        <strong>
                          내 지점({storeName}) {index + 1}번째
                        </strong>{' '}
                        — 이 키워드로 플레이스에 노출되고 있습니다.
                        {index > 0 && ' 위에 있는 업체들이 무엇으로 앞서는지 보세요.'}
                      </>
                    ) : (
                      <>
                        <strong>위 {places.length}곳 안에는 내 지점이 없습니다.</strong> 자동으로 읽을
                        수 있는 건 여기까지입니다 — 더 아래(2페이지 이후)에 있을 수 있으니, 없다는
                        뜻이 아닙니다. 네이버에서 직접 넘겨 확인하고 아래에 순위를 적어두세요.
                      </>
                    )}
                  </p>
                )
              })()}

              <ul className="space-y-2">
                {places.map((p, i) => {
                  const mine = myPlace.index === i
                  return (
                    <li
                      key={p.id}
                      className={`bd flex gap-3 rounded-lg border p-2.5 ${
                        mine ? 'border-brand-500/50 bg-brand-500/8' : ''
                      }`}
                    >
                      <span className="tnum muted mt-0.5 w-5 shrink-0 text-right text-[13px] font-bold">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <a
                          href={p.placeUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-[13px] leading-snug font-semibold hover:underline"
                        >
                          {p.name}
                        </a>
                        {mine && (
                          <span className="ml-1.5">
                            <Badge tone="good">내 지점</Badge>
                          </span>
                        )}
                        <div className="muted mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px]">
                          {p.category && <span>{p.category}</span>}
                          <span>{p.commonAddress.split(' ').slice(-1)[0]}</span>
                          {p.phone && <span className="tnum">{p.phone}</span>}
                          {p.bookingUrl && <Badge tone="info">예약 연결</Badge>}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
              <p className="muted mt-3 text-[11px] leading-relaxed">
                네이버 통합검색 플레이스 블록에 노출되는 순서를 그대로 읽은 것입니다.{' '}
                <b>자동으로는 이 {places.length}곳까지만 읽힙니다</b> — 그 아래 목록을 주는 네이버
                플레이스 API 는 서버에서 차단됩니다. 검색 위치·기기에 따라 순서가 달라질 수 있으니 절대
                순위가 아니라 경쟁 구도를 보는 데 쓰세요.
              </p>

              {/* 7곳 아래는 사람이 봐야 안다 — 블로그 순위 추적과 같은 방식으로 기록해 둔다 */}
              <div className="bd mt-3 rounded-lg border border-dashed p-3">
                <p className="text-[12px] font-semibold">직접 본 순위 적어두기</p>
                <p className="muted mt-1 text-[11px] leading-relaxed">
                  네이버에서 플레이스 목록을 끝까지 넘겨 내 지점이 몇 번째인지 확인해 넣으세요. 한 번
                  넣으면 기억해 두고, 다음에 조회할 때 함께 보여줍니다.
                </p>
                <a
                  href={naverPlaceSearchUrl(placeKeyword)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="bg-brand-600 mt-2 inline-block rounded-lg px-3 py-1.5 text-[11px] font-semibold text-white"
                >
                  플레이스 목록 열기 →
                </a>

                {/* 세지 않아도 되게 — 목록을 붙여넣으면 번호를 붙여 보여준다 */}
                <details className="mt-2.5">
                  <summary className="text-brand-600 dark:text-brand-100 cursor-pointer text-[11px] font-semibold select-none">
                    세기 귀찮으면 목록을 붙여넣기 →
                  </summary>
                  <div className="mt-2">
                    <textarea
                      value={prPaste}
                      onChange={(e) => setPrPaste(e.target.value)}
                      rows={4}
                      aria-label="플레이스 목록 붙여넣기"
                      className={`${inputClass} font-mono text-[12px]`}
                      placeholder={'플레이스 목록 화면을 전체 선택·복사해서 그대로 붙여넣으세요'}
                    />
                    {pastedPlaces.length > 0 && (
                      <>
                        <p className="muted mt-2 text-[11px]">
                          {pastedPlaces.length}곳을 읽었습니다 — 내 지점을 누르면 그 번호가 순위로
                          들어갑니다. 잘못 읽혔으면 위 칸에 숫자를 직접 넣으세요.
                        </p>
                        <ol className="mt-1.5 max-h-52 space-y-0.5 overflow-y-auto">
                          {pastedPlaces.map((name, i) => (
                            <li key={`${i}-${name}`}>
                              <button
                                type="button"
                                onClick={() => setPrRank(String(i + 1))}
                                className={`bd w-full rounded border px-2 py-1 text-left text-[11px] hover:bg-slate-500/8 ${
                                  prRank === String(i + 1) ? 'border-brand-500/60 bg-brand-500/10' : ''
                                }`}
                              >
                                <span className="tnum muted mr-1.5 font-bold">{i + 1}</span>
                                {name}
                              </button>
                            </li>
                          ))}
                        </ol>
                      </>
                    )}
                  </div>
                </details>

                <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
                  <select
                    value={prStore}
                    onChange={(e) => setPrStore(e.target.value)}
                    aria-label="순위를 적을 지점"
                    className={inputClass}
                  >
                    <option value="">지점 고르기</option>
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <input
                    value={prRank}
                    onChange={(e) => setPrRank(e.target.value)}
                    inputMode="numeric"
                    placeholder="13"
                    aria-label="플레이스 순위"
                    className={`${inputClass} sm:w-24`}
                  />
                  <button
                    type="button"
                    onClick={savePlaceRank}
                    disabled={prSaving}
                    className="bg-brand-600 shrink-0 rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {prSaving ? '저장 중…' : '기록'}
                  </button>
                </div>
                {prMsg && <p className="muted mt-2 text-[11px] leading-relaxed">{prMsg}</p>}

                {savedRanks.length > 0 && (
                  <ul className="mt-2.5 space-y-1">
                    {savedRanks.map((r) => (
                      <li key={r.id} className="muted text-[11px]">
                        <span className="tnum font-semibold">{r.date}</span> ·{' '}
                        {stores.find((s) => s.id === r.storeId)?.name ?? r.storeId} —{' '}
                        <span className="tnum font-semibold">{r.rank}번째</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
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
