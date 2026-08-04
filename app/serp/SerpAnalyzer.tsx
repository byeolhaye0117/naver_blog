'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import type { SerpAnalysis } from '@/lib/types'
import { Badge, Card, Empty, Field, MockNotice, Stat, inputClass } from '@/components/ui'
import { IconDoc, IconPencil, IconTarget, IconTrend } from '@/components/icons'
import { naverBlogTabUrl, naverSearchUrl } from '@/lib/analysis/rank'
import { parsePastedSerp, toEditableText } from '@/lib/analysis/paste'

type Mode = 'auto' | 'paste'

export default function SerpAnalyzer({ initialKeyword }: { initialKeyword: string }) {
  const [mode, setMode] = useState<Mode>('auto')
  const [keyword, setKeyword] = useState(initialKeyword)
  const [limit, setLimit] = useState(15)
  const [data, setData] = useState<SerpAnalysis | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 붙여넣기 모드
  const [pasted, setPasted] = useState('')
  const [list, setList] = useState('')
  const [extracted, setExtracted] = useState<{ kept: number; dropped: number } | null>(null)

  async function run(kw: string, n: number) {
    const q = kw.trim()
    if (!q) {
      setError('분석할 키워드를 입력하세요.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/serp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: q, limit: n }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '분석에 실패했습니다.')
      setData(json.analysis)
    } catch (e) {
      setError(e instanceof Error ? e.message : '분석 중 오류가 발생했습니다.')
      // 자동이 막혔을 때 사용자가 손으로 탭을 찾아 옮겨가지 않게, 붙여넣기 칸을 바로 펼쳐 준다
      setMode('paste')
    } finally {
      setLoading(false)
    }
  }

  /** 붙여넣은 덩어리에서 제목·날짜를 1차로 뽑아 편집칸에 넣는다 */
  function extract() {
    // 키워드를 같이 넘기면 블로거명 줄을 제목과 구분해 준다
    const r = parsePastedSerp(pasted, keyword)
    if (!r.items.length) {
      setError('제목으로 보이는 줄을 찾지 못했습니다. 아래 편집칸에 직접 한 줄씩 넣어도 됩니다.')
      setExtracted(null)
      return
    }
    setError(null)
    setList(toEditableText(r.items))
    setExtracted({ kept: r.items.length, dropped: r.dropped })
  }

  async function runPaste() {
    const q = keyword.trim()
    if (!q) {
      setError('분석할 키워드를 입력하세요.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/serp/paste', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: q, list }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '분석에 실패했습니다.')
      setData(json.analysis)
    } catch (e) {
      setError(e instanceof Error ? e.message : '분석 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  // 키워드 조사에서 「상위노출 분석」을 눌러 넘어온 경우 — 한 번 더 누르게 하지 않고 바로 분석한다
  const autoRan = useRef(false)
  useEffect(() => {
    if (autoRan.current || !initialKeyword.trim()) return
    autoRan.current = true
    void run(initialKeyword, 15)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKeyword])

  const searchLinks = keyword.trim() && (
    <div className="flex flex-wrap gap-1.5">
      <a
        href={naverBlogTabUrl(keyword)}
        target="_blank"
        rel="noreferrer noopener"
        className="bg-brand-600 rounded-xl px-3 py-1.5 text-[11px] font-semibold text-white"
      >
        블로그 탭 열기
      </a>
      <a
        href={naverSearchUrl(keyword)}
        target="_blank"
        rel="noreferrer noopener"
        className="bd rounded-xl border px-3 py-1.5 text-[11px] font-semibold hover:bg-slate-500/8"
      >
        통합검색 열기
      </a>
    </div>
  )

  return (
    <div className="space-y-4">
      <Card>
        <div className="bd mb-4 flex gap-1 rounded-xl border bg-slate-500/8 p-1">
          {(
            [
              ['auto', '자동 분석', ''],
              // 좁은 화면에서는 괄호 설명을 접는다 — 탭 두 줄이 되면 화면 맨 위가 탭으로 찬다
              ['paste', '붙여넣어 분석', '자동이 막혔을 때'],
            ] as [Mode, string, string][]
          ).map(([m, label, note]) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              // 고른 쪽만 하얗게 떠 보이는 형태 — 통째로 초록을 칠하면 화면에서 제일 센 것이 탭이 된다
              className={`flex-1 rounded-lg px-3 py-2 text-[12px] font-semibold whitespace-nowrap transition ${
                mode === m
                  ? 'text-brand-700 dark:text-brand-100 bg-[var(--panel)] shadow-sm'
                  : 'muted hover:bg-slate-500/8'
              }`}
            >
              {label}
              {note && <span className="hidden font-medium opacity-70 sm:inline"> ({note})</span>}
            </button>
          ))}
        </div>

        <Field label="분석할 키워드" hint="상위에 있는 글들을 뜯어볼 검색어">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && mode === 'auto' && run(keyword, limit)}
            className={inputClass}
            placeholder="쌍용동 헬스장"
          />
        </Field>

        {mode === 'auto' ? (
          <>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="sm:w-40">
                <span className="mb-1.5 block text-[13px] font-semibold">분석 개수</span>
                <select
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                  className={inputClass}
                >
                  <option value={10}>상위 10개</option>
                  <option value={15}>상위 15개</option>
                  <option value={30}>상위 30개</option>
                </select>
              </label>
              <button
                type="button"
                onClick={() => run(keyword, limit)}
                disabled={loading}
                className="bg-brand-600 rounded-xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {loading ? '분석 중…' : '분석'}
              </button>
            </div>
            <div className="surface mt-3 rounded-xl p-3.5">
              <p className="text-[12px] font-semibold">이 화면이 하는 일</p>
              <p className="muted mt-1.5 text-[11px] leading-relaxed">
                지금 이 키워드로 <b>이미 상위에 올라 있는 블로그 글들</b>을 앱이 직접 읽어와서, 그
                글들의 공통점을 셉니다. 제목을 몇 자로 쓰는지, 키워드를 제목 앞쪽에 두는지, 최근에
                쓴 글이라야 올라오는 자리인지, 어떤 소재가 반복되는지 —{' '}
                <b>내 글이 무엇을 맞춰야 하는지</b>가 「이 키워드로 상위 가려면」에 문장으로 나옵니다.
                그대로 「이 키워드로 글쓰기」를 누르면 그 조건이 반영된 골격이 나옵니다.
              </p>
            </div>
            <div className="mt-2.5">{searchLinks}</div>
          </>
        ) : (
          <div className="mt-1 space-y-4">
            <div className="surface rounded-xl p-3.5">
              <p className="text-[12px] font-semibold">붙여넣는 방법</p>
              <p className="muted mt-1.5 text-[11px] leading-relaxed">
                평소에는 쓰지 않아도 됩니다 — <b>자동 분석</b>이 같은 목록을 알아서 읽어옵니다. 자동이
                막혔을 때, 또는 스마트블록 순서까지 눈으로 본 대로 넣고 싶을 때만 쓰세요.
              </p>
              <ol className="muted mt-1.5 space-y-1 text-[11px] leading-relaxed">
                <li>1. 아래 <b>블로그 탭 열기</b>를 누릅니다 (관련도순 화면입니다).</li>
                <li>2. 상위 10~15개가 보일 만큼 스크롤한 뒤 그 영역을 전체 선택·복사합니다.</li>
                <li>3. 아래 칸에 붙여넣고 <b>제목 뽑기</b>를 누릅니다.</li>
                <li>4. 뽑힌 목록을 눈으로 확인·수정한 뒤 <b>분석</b>을 누릅니다. (발행량은 자동으로 가져옵니다)</li>
              </ol>
              <div className="mt-2.5">{searchLinks}</div>
            </div>

            <Field
              label="검색 결과 붙여넣기"
              hint="화면에서 복사한 그대로 넣으세요. 순서가 곧 순위입니다."
            >
              <textarea
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                rows={5}
                className={`${inputClass} font-mono text-[12px]`}
                placeholder={'천안 운동일기\n쌍용동 헬스장 3개월 다녀본 솔직 후기\n직접 다녀오고 정리한 내용입니다...\n2026. 7. 28.'}
              />
            </Field>
            <button
              type="button"
              onClick={extract}
              disabled={!pasted.trim()}
              className="bd rounded-xl border px-3.5 py-2 text-sm font-semibold hover:bg-slate-500/8 disabled:opacity-50"
            >
              제목 뽑기
            </button>

            <Field
              label="분석할 목록 (한 줄에 하나, 순서 = 순위)"
              hint='"제목 | 날짜 | 블로거" 형식. 날짜·블로거는 몰라도 됩니다 — 아는 것만 계산에 씁니다.'
            >
              <textarea
                value={list}
                onChange={(e) => setList(e.target.value)}
                rows={8}
                className={`${inputClass} font-mono text-[12px]`}
                placeholder={'쌍용동 헬스장 3개월 다녀본 솔직 후기 | 2026-07-28 | 천안 운동일기\n쌍용동 헬스장 등록 전에 꼭 확인할 것들 | 2026-07-11'}
              />
            </Field>

            {extracted && (
              <p className="muted text-[11px]">
                {extracted.kept}개를 뽑았고 {extracted.dropped}줄은 제목이 아니라고 보고 버렸습니다.
                빠진 게 있으면 위 칸에 직접 추가하세요 — 저장된 목록을 그대로 분석합니다.
              </p>
            )}

            <button
              type="button"
              onClick={runPaste}
              disabled={loading || !list.trim()}
              className="bg-brand-600 rounded-xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {loading ? '분석 중…' : '분석'}
            </button>
            <p className="muted text-[11px] leading-relaxed">
              발행량은 앱이 자동으로 가져옵니다 (최근 30일 기준). 경쟁률 등급까지 보려면{' '}
              <Link href="/keywords" className="text-brand-600 dark:text-brand-100 font-semibold underline">
                키워드 조사
              </Link>
              에서 같은 키워드를 조회하세요.
            </p>
          </div>
        )}

        {error && (
          <p className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-700 dark:text-rose-300">
            {error}
          </p>
        )}
      </Card>

      {!data && !loading && (
        <Card>
          <Empty>
            키워드를 넣고 「분석」을 누르면 상위 글들을 읽어옵니다.{' '}
            <Link href="/keywords" className="text-brand-600 dark:text-brand-100 font-semibold underline">
              키워드 조사
            </Link>
            에서 「상위노출 분석」을 눌러 넘어오면 바로 분석까지 됩니다.
          </Empty>
        </Card>
      )}

      {data && (
        <>
          {data.mock && (
            <div>
              <MockNotice what="검색" />
            </div>
          )}
          {data.source !== 'api' && (
            <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[12px] leading-relaxed text-emerald-800 dark:text-emerald-200">
              {data.source === 'section'
                ? `지금 네이버 블로그 검색 관련도순 상위 ${data.items.length}개를 읽어와 분석한 결과입니다 — 샘플이 아니라 실제 화면 기준입니다.`
                : `회원님이 직접 붙여넣은 ${data.items.length}개를 분석한 결과입니다 — 샘플이 아니라 실제 화면 기준입니다.`}
              {data.stats.datedCount < data.items.length &&
                ` 날짜를 아는 항목은 ${data.stats.datedCount}개라, 최신성은 그 ${data.stats.datedCount}개로만 계산했습니다.`}
            </p>
          )}

          <Card
            title="이 키워드로 상위 가려면"
            subtitle="위 수치를 실제 작성 지시로 번역한 것입니다. 이 처방은 저장돼서, 같은 키워드로 글을 쓰면 AI 지시문에 자동으로 들어갑니다 — 외워서 옮겨 적지 않아도 됩니다."
            right={
              <Link
                href={`/write?main=${encodeURIComponent(data.keyword)}`}
                className="bg-brand-600 rounded-xl px-3 py-1.5 text-xs font-semibold text-white"
              >
                이 처방으로 글쓰기 →
              </Link>
            }
          >
            <ol className="space-y-2.5">
              {data.prescription.map((p, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="bg-brand-500/15 text-brand-700 dark:text-brand-100 tnum mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold">
                    {i + 1}
                  </span>
                  <span className="text-[13px] leading-relaxed">{p}</span>
                </li>
              ))}
            </ol>
          </Card>

          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
            <Stat
              label="최근 30일 발행량"
              value={data.total > 0 ? data.total.toLocaleString() : '—'}
              hint={data.total > 0 ? '이 키워드로 한 달 새 올라온 글' : '자동 조회가 막혔습니다'}
              icon={<IconDoc />}
              iconTone="blue"
            />
            <Stat
              label="상위 글 평균 제목"
              value={`${data.stats.avgTitleLength}자`}
              hint="모바일 표시 ~35자"
              icon={<IconPencil />}
              iconTone="violet"
            />
            <Stat
              label="제목 앞쪽 키워드"
              value={`${data.stats.keywordFrontRate}%`}
              hint={`제목에 포함 ${data.stats.keywordInTitleRate}%`}
              tone={data.stats.keywordFrontRate >= 60 ? 'good' : 'default'}
              icon={<IconTarget />}
              iconTone="brand"
            />
            <Stat
              label="30일 이내 글"
              value={data.stats.datedCount ? `${data.stats.freshWithin30dRate}%` : '—'}
              hint={
                data.stats.datedCount
                  ? `날짜 확인 ${data.stats.datedCount}개 · 평균 ${data.stats.avgAgeDays}일`
                  : '날짜를 넣으면 계산됩니다'
              }
              tone={
                !data.stats.datedCount
                  ? 'default'
                  : data.stats.freshWithin30dRate >= 50
                    ? 'warn'
                    : 'good'
              }
              icon={<IconTrend />}
              iconTone="gold"
            />
          </div>

          {data.stats.commonTokens.length > 0 && (
            <Card
              title="상위 제목에 반복되는 말"
              subtitle="검색한 사람이 실제로 알고 싶은 것의 신호입니다. 소제목 소재로 쓰세요."
            >
              <div className="flex flex-wrap gap-1.5">
                {data.stats.commonTokens.map((t) => (
                  <span
                    key={t.token}
                    className="bd rounded-full border px-2.5 py-1 text-[12px] font-medium"
                  >
                    {t.token}
                    <span className="muted tnum ml-1.5 text-[10px]">{t.count}</span>
                  </span>
                ))}
              </div>
            </Card>
          )}

          <Card
            title={`상위 ${data.items.length}개 글`}
            subtitle={
              data.source === 'paste'
                ? '붙여넣은 순서를 순위로 봤습니다. 키워드 위치는 제목에서 메인 키워드가 시작되는 글자 번호입니다'
                : '관련도순(sim) 기준. 키워드 위치는 제목에서 메인 키워드가 시작되는 글자 번호입니다'
            }
            right={
              <div className="flex gap-1.5">
                <a
                  href={naverSearchUrl(data.keyword)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="bd rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold hover:bg-slate-500/8"
                >
                  통합검색
                </a>
                <a
                  href={naverBlogTabUrl(data.keyword)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="bd rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold hover:bg-slate-500/8"
                >
                  블로그 탭
                </a>
              </div>
            }
          >
            <ul className="space-y-3">
              {data.items.map((item) => (
                <li key={item.rank} className="bd border-b pb-3 last:border-0 last:pb-0">
                  <div className="flex gap-3">
                    <span className="tnum muted mt-0.5 w-6 shrink-0 text-right text-[13px] font-bold">
                      {item.rank}
                    </span>
                    <div className="min-w-0 flex-1">
                      {item.link ? (
                        <a
                          href={item.link}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-[13px] leading-snug font-semibold hover:underline"
                        >
                          {item.title}
                        </a>
                      ) : (
                        <p className="text-[13px] leading-snug font-semibold">{item.title}</p>
                      )}
                      <div className="muted mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px]">
                        {item.bloggerName && <span>{item.bloggerName}</span>}
                        {item.postdate ? (
                          <>
                            <span className="tnum">{item.postdate}</span>
                            <span className="tnum">{item.ageDays}일 전</span>
                          </>
                        ) : (
                          <span>날짜 미상</span>
                        )}
                        <span className="tnum">제목 {item.titleLength}자</span>
                        {item.keywordPos >= 0 ? (
                          <Badge tone={item.keywordPos <= 6 ? 'good' : 'default'}>
                            키워드 {item.keywordPos + 1}번째
                          </Badge>
                        ) : (
                          <Badge tone="default">제목에 키워드 없음</Badge>
                        )}
                        {item.isOfficialBlog && <Badge tone="info">업체 블로그 추정</Badge>}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  )
}
