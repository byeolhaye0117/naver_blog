'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Badge, Card, btnPrimary } from './ui'
import {
  CHANGE_LABEL,
  FRESH_DAYS,
  QUIET_MAX,
  detoursFor,
  openingChanges,
  type OpeningChange,
  type OpeningTier,
} from '@/lib/analysis/openings'
import type { OpeningRun } from '@/lib/types'

interface Row {
  keyword: string
  stores: string[]
  tier: OpeningTier
  label: string
  fresh: number
  youngest: number | null
  medianAge: number | null
  recent30: number | null
  dated: number
  sampled: number
  why: string
  /** detour = 굳은 자리 우회로 후보로 함께 잰 세부 의도 키워드 (표에는 올리지 않는다) */
  kind?: 'store' | 'detour'
}

const TONE: Record<OpeningTier, 'good' | 'warn' | 'bad'> = {
  'open-quiet': 'good',
  open: 'good',
  quiet: 'warn',
  shut: 'bad',
}

/**
 * **지금 뚫릴 만한 키워드** — 지점 키워드를 한꺼번에 재서 순위표로 보여준다.
 *
 * 회원 질문 (2026-08-18): "페이지에 업데이트된 거야?" 아니었다. 같은 순위표를 스크립트로만
 * 뽑고 있었으니 회원은 볼 방법이 없었다. 판단에 쓰는 자료를 터미널에만 두면 도구가 아니다.
 *
 * 무엇을 근거로 나눴는지 화면에 적는다 — 등급만 보여주면 확인할 수 없고, 확인할 수 없는
 * 판단은 믿을 근거가 없다.
 */
export default function OpeningsCard({
  hasStores,
  saved,
  previous,
}: {
  hasStores: boolean
  /** 매일 도는 크론이 남긴 마지막 측정 (없으면 아직 한 번도 안 돈 것) */
  saved?: OpeningRun | null
  /** 그 전 측정 — 「어제와 무엇이 달라졌나」를 보려고 함께 받는다 */
  previous?: OpeningRun | null
}) {
  const [busy, setBusy] = useState(false)
  const [rows, setRows] = useState<Row[] | null>((saved?.rows as Row[] | undefined) ?? null)
  const [failed, setFailed] = useState<string[]>(saved?.failed ?? [])
  const [at, setAt] = useState<string | null>(saved?.at ?? null)
  const [by, setBy] = useState<'cron' | 'user' | null>(saved?.by ?? null)
  const [error, setError] = useState<string | null>(null)

  /*
   * 어제와 비교한다. **매일 재는 값이 있는 이유가 이것이다** — 같은 표를 다시 그리는 게
   * 목적이면 손으로 눌러도 된다. 열린 자리는 며칠 만에 다시 굳으니, 열린 날을 놓치지 않는
   * 것이 값이다. 회원이 방금 다시 잰 경우에도 어제 값과 비교한다 (기준은 늘 지난 측정).
   */
  const changes = useMemo(
    () => (rows ? openingChanges(previous?.rows ?? null, rows) : new Map<string, OpeningChange>()),
    [rows, previous]
  )
  /*
   * 표에는 **지점 키워드만** 올린다. 우회로 후보(세부 의도 키워드)는 수십 개라 표에 섞으면
   * 「우리가 잡은 키워드가 어떤 상태인가」를 못 읽는다. 굳은 줄 아래에 문으로만 보여준다.
   */
  const table = rows?.filter((r) => r.kind !== 'detour') ?? []
  const newlyOpen = table.filter((r) => changes.get(r.keyword) === 'opened')
  /** 굳은 줄마다 붙일 문 — 같은 동네에서 지금 열려 있는 세부 의도 키워드 */
  const doors = useMemo(() => {
    const m = new Map<string, Row[]>()
    if (!rows) return m
    for (const r of rows) {
      if (r.kind === 'detour') continue
      const d = detoursFor(r, rows) as Row[]
      if (d.length) m.set(r.keyword, d)
    }
    return m
  }, [rows])

  async function run() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/keywords/openings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '재지 못했습니다.')
      setRows(json.rows as Row[])
      setFailed(json.failed ?? [])
      setAt(json.measuredAt ?? null)
      setBy('user')
    } catch (e) {
      setError(e instanceof Error ? e.message : '재지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const open = table.filter((r) => r.tier === 'open-quiet' || r.tier === 'open')

  return (
    <Card
      title="지금 뚫릴 만한 키워드"
      subtitle={`지점에 저장된 지역 키워드를 한꺼번에 재서, 1페이지에 ${FRESH_DAYS}일 이내 글이 실제로 들어오는 자리인지 봅니다.`}
      right={rows ? <Badge tone={open.length ? 'good' : 'warn'}>열린 자리 {open.length}개</Badge> : undefined}
    >
      {/*
        왜 이걸 보는지 먼저 밝힌다. 실측 결과가 「글을 이렇게 쓰면 빨리 뜬다」가 아니었기
        때문에, 회원이 이 표를 글쓰기 규칙으로 오해하면 안 된다.
      */}
      <p className="muted text-[12px] leading-relaxed">
        2026-08-18 실측(천안·아산 1페이지 140편)에서 <b>{FRESH_DAYS}일 안에 올라온 글과 오래된 글은 글의 형태로
        갈리지 않았습니다</b> — 글자수·이미지·정보량·홍보량이 사실상 같았습니다. 갈린 것은 블로그 힘이고, 그건 글
        한 편으로 못 바꿉니다. 대신 <b>어느 키워드를 잡느냐는 고를 수 있습니다.</b> 그걸 재는 표입니다.
      </p>

      {!hasStores ? (
        <p className="mt-3 text-[12.5px]">
          지점에 저장된 지역 키워드가 없습니다.{' '}
          <Link href="/stores" className="text-brand-600 dark:text-brand-100 font-semibold underline">
            지점 관리
          </Link>{' '}
          에서 먼저 넣어주세요.
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={run} disabled={busy} className={btnPrimary}>
            {busy ? '재는 중… (키워드당 2~4초)' : rows ? '지금 다시 재기' : '전 지점 키워드 재기'}
          </button>
          {/*
            언제·누가 잰 값인지 밝힌다. 자동으로 도는 줄 모르면 회원은 매일 버튼을 누르고,
            버튼을 누른 값인 줄 모르면 자동이 안 돈다고 오해한다.
          */}
          {at ? (
            <span className="muted text-[11px]">
              {new Date(at).toLocaleString('ko-KR', {
                month: 'numeric',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}{' '}
              기준 · {by === 'user' ? '직접 재기' : '매일 아침 6시 자동 측정'}
            </span>
          ) : (
            <span className="muted text-[11px]">매일 아침 6시에 자동으로 잽니다 (첫 측정 전입니다)</span>
          )}
        </div>
      )}

      {error && (
        <p className="mt-2 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-[12px] text-rose-900">
          {error}
        </p>
      )}

      {rows && table.length > 0 && (
        <>
          {/*
            매일 재는 값의 쓸모는 「어제는 굳어 있었는데 오늘 열렸다」를 잡는 것이다.
            열린 자리는 며칠 만에 다시 굳으니, 이 줄이 곧 「오늘 이 키워드로 쓰세요」다.
          */}
          {newlyOpen.length > 0 && (
            <p className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[12px] leading-relaxed text-emerald-900 dark:text-emerald-100">
              <b>지난 측정보다 새로 열린 자리 {newlyOpen.length}개</b> — {newlyOpen.map((r) => r.keyword).join(' · ')}.
              열린 자리는 며칠 만에 다시 굳습니다. 오늘 쓸 글이 있다면 여기서 고르세요.
            </p>
          )}

          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[620px] text-[12px]">
              <thead>
                <tr className="muted bd border-b text-left">
                  <th className="py-1.5 pr-2 font-semibold">등급</th>
                  <th className="py-1.5 pr-2 font-semibold">키워드</th>
                  <th className="py-1.5 pr-2 font-semibold">지점</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">{FRESH_DAYS}일 이내</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">가장 어린 글</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">나이 중간값</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">최근 30일 발행</th>
                  <th className="py-1.5 font-semibold">글쓰기</th>
                </tr>
              </thead>
              <tbody>
                {table.flatMap((r) => [
                  <tr key={r.keyword} className="bd border-b last:border-0 align-top" title={r.why}>
                    <td className="py-1.5 pr-2">
                      <Badge tone={TONE[r.tier]}>{r.label}</Badge>
                    </td>
                    <td className="py-1.5 pr-2 font-semibold">
                      {r.keyword}
                      {/* 지난 측정과 달라진 줄만 표시한다 — 전부 표시하면 「그대로」가 표를 덮는다 */}
                      {(changes.get(r.keyword) === 'opened' || changes.get(r.keyword) === 'shut') && (
                        <span
                          className={`ml-1.5 align-middle text-[10.5px] font-bold ${
                            changes.get(r.keyword) === 'opened'
                              ? 'text-emerald-700 dark:text-emerald-300'
                              : 'text-rose-700 dark:text-rose-300'
                          }`}
                        >
                          {CHANGE_LABEL[changes.get(r.keyword) as OpeningChange]}
                        </span>
                      )}
                    </td>
                    <td className="muted py-1.5 pr-2">{r.stores.join('·') || '—'}</td>
                    <td className="tnum py-1.5 pr-2 text-right font-bold">{r.fresh}편</td>
                    <td className="tnum py-1.5 pr-2 text-right">{r.youngest === null ? '—' : `${r.youngest}일`}</td>
                    <td className="tnum py-1.5 pr-2 text-right">{r.medianAge === null ? '—' : `${r.medianAge}일`}</td>
                    <td className="tnum py-1.5 pr-2 text-right">
                      {r.recent30 === null ? '—' : `${r.recent30.toLocaleString()}편`}
                    </td>
                    <td className="py-1.5">
                      <Link
                        href={`/write?main=${encodeURIComponent(r.keyword)}&new=1`}
                        className="text-brand-600 dark:text-brand-100 font-semibold underline"
                      >
                        이 키워드로 →
                      </Link>
                    </td>
                  </tr>,
                  /*
                    굳은 줄 아래에 **들어가는 문**을 붙인다 (2026-08-20 실측). 굳은 자리를 정면으로
                    뚫는 방법은 실측에 없었다 — 갈린 것은 1페이지 글의 나이였고 그건 글로 못 바꾼다.
                    대신 같은 동네의 세부 의도 키워드는 열려 있었다.
                  */
                  doors.get(r.keyword) && (
                    <tr key={`${r.keyword}-door`} className="bd border-b last:border-0">
                      <td />
                      <td colSpan={7} className="pb-2 pl-0 pr-2">
                        <span className="muted text-[11px]">들어가는 문 · 같은 동네에서 지금 열린 자리 → </span>
                        {doors.get(r.keyword)!.map((d, i) => (
                          <span key={d.keyword} className="text-[11.5px]">
                            {i > 0 && <span className="muted"> · </span>}
                            <Link
                              href={`/write?main=${encodeURIComponent(d.keyword)}&new=1`}
                              className="text-brand-600 dark:text-brand-100 font-semibold underline"
                              title={d.why}
                            >
                              {d.keyword}
                            </Link>
                            <span className="muted">
                              {' '}
                              (발행 {d.recent30 === null ? '?' : d.recent30.toLocaleString()}편 · {FRESH_DAYS}일 이내{' '}
                              {d.fresh}편)
                            </span>
                          </span>
                        ))}
                      </td>
                    </tr>
                  ),
                ])}
              </tbody>
            </table>
          </div>

          <p className="muted mt-2 text-[11px] leading-relaxed">
            <b>등급 기준</b>: 1페이지에 {FRESH_DAYS}일 이내 글이 있으면 「열려 있음」, 최근 30일 발행이{' '}
            {QUIET_MAX}편 이하면 「경쟁 적음」. 둘 다면 맨 위입니다. 각 줄에 손을 올리면 왜 그 등급인지 나옵니다.
            <br />
            <b>블로그 크기는 등급에 넣지 않았습니다</b> — 우리 블로그 누적 방문자가 지금 힘(1페이지 진입률)을
            대변하지 못해서, 그 숫자로 나누면 없는 근거를 만드는 셈이 됩니다.
            <br />
            <b>굳은 자리는 「블로그가 커서」 굳은 게 아닙니다</b> (2026-08-20, 굳은 자리 6개 · 열린 자리 5개의 1페이지를
            30위까지 재봤습니다). 굳은 자리 1페이지에도 누적 <b>314명 · 396명 · 503명 · 769명</b> 블로그가 앉아
            있었고, 열린 자리(271~10,597명)와 크기가 겹쳤습니다. 갈린 것은 <b>1페이지 글의 나이</b>였습니다 — 열린
            자리는 1~7일 글이 1페이지에 있고, 굳은 자리는 가장 어린 글이 8~38일입니다. 새 글이 1페이지로 못 올라오는
            상태라 글을 잘 써서 뚫는 문제가 아닙니다. 그래서 굳은 줄 아래에 <b>같은 동네의 열린 문</b>을 함께
            잽니다 (예: 「성정동 여성전용」은 굳었지만 「성정동 여성전용 헬스장」은 발행 28편으로 열려 있었습니다 —
            낱말 하나 차이입니다).
            <br />
            날짜를 읽은 글이 적은 키워드는 근거가 약합니다 (잰 글 수와 날짜 확인 수는 표 아래 원자료에
            남습니다).
            <br />
            <b>매일 아침 6시에 자동으로 다시 잽니다</b> — 열린 자리는 며칠 만에 굳으므로 생각날 때 눌러서 재면
            대부분 놓칩니다. 「새로 열림」·「닫힘」은 <b>지난 측정과 비교한 등급 변화</b>이고, 최근 2주치를 남깁니다.
            네이버 호출이 막힌 날은 저장하지 않습니다 (빈 표로 덮으면 전부 굳은 자리로 보입니다).
          </p>

          {failed.length > 0 && (
            <p className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11.5px] text-amber-800 dark:text-amber-200">
              못 잰 키워드 {failed.length}개: {failed.join(' · ')} — 네이버 호출이 막혔을 수 있습니다. 다시 재기를
              눌러보세요. (빈 줄로 두면 「자리가 굳었다」로 오해하게 되므로 밝혀 둡니다.)
            </p>
          )}
        </>
      )}

      {rows && table.length === 0 && (
        <p className="mt-3 text-[12.5px]">잰 키워드가 없습니다. 지점에 지역 키워드를 넣어주세요.</p>
      )}
    </Card>
  )
}
