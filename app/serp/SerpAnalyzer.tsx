'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { SerpAnalysis } from '@/lib/types'
import { Badge, Card, Empty, MockNotice, Stat, inputClass } from '@/components/ui'
import { naverBlogTabUrl, naverSearchUrl } from '@/lib/analysis/rank'

export default function SerpAnalyzer({ initialKeyword }: { initialKeyword: string }) {
  const [keyword, setKeyword] = useState(initialKeyword)
  const [limit, setLimit] = useState(15)
  const [data, setData] = useState<SerpAnalysis | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const autoRan = useRef(false)

  const run = useCallback(
    async (kw: string, n: number) => {
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
      } finally {
        setLoading(false)
      }
    },
    []
  )

  // 키워드 조사 화면에서 넘어온 경우 자동 실행
  useEffect(() => {
    if (initialKeyword && !autoRan.current) {
      autoRan.current = true
      run(initialKeyword, 15)
    }
  }, [initialKeyword, run])

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1">
            <span className="mb-1.5 block text-[13px] font-semibold">분석할 키워드</span>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && run(keyword, limit)}
              className={inputClass}
              placeholder="쌍용동 헬스장"
            />
          </label>
          <label className="sm:w-32">
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
            className="bg-brand-600 rounded-lg px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {loading ? '분석 중…' : '분석'}
          </button>
        </div>
        {error && (
          <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-700 dark:text-rose-300">
            {error}
          </p>
        )}
      </Card>

      {!data && !loading && (
        <Card>
          <Empty>
            키워드를 입력하고 분석을 누르세요.{' '}
            <Link href="/keywords" className="text-brand-600 dark:text-brand-100 font-semibold underline">
              키워드 조사
            </Link>
            에서 넘어오면 자동으로 실행됩니다.
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

          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
            <Stat label="누적 발행량" value={data.total.toLocaleString()} hint="이 키워드로 쌓인 글" />
            <Stat label="상위 글 평균 제목" value={`${data.stats.avgTitleLength}자`} hint="모바일 표시 ~35자" />
            <Stat
              label="제목 앞쪽 키워드"
              value={`${data.stats.keywordFrontRate}%`}
              hint={`제목에 포함 ${data.stats.keywordInTitleRate}%`}
              tone={data.stats.keywordFrontRate >= 60 ? 'good' : 'default'}
            />
            <Stat
              label="30일 이내 글"
              value={`${data.stats.freshWithin30dRate}%`}
              hint={`평균 ${data.stats.avgAgeDays}일`}
              tone={data.stats.freshWithin30dRate >= 50 ? 'warn' : 'good'}
            />
          </div>

          <Card
            title="이 키워드로 상위 가려면"
            subtitle="위 수치를 실제 작성 지시로 번역한 것입니다"
            right={
              <Link
                href={`/write?main=${encodeURIComponent(data.keyword)}`}
                className="bg-brand-600 rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
              >
                이 키워드로 글쓰기
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
            subtitle="관련도순(sim) 기준. 키워드 위치는 제목에서 메인 키워드가 시작되는 글자 번호입니다"
            right={
              <div className="flex gap-1.5">
                <a
                  href={naverSearchUrl(data.keyword)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="bd rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold hover:bg-slate-500/8"
                >
                  통합검색
                </a>
                <a
                  href={naverBlogTabUrl(data.keyword)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="bd rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold hover:bg-slate-500/8"
                >
                  블로그 탭
                </a>
              </div>
            }
          >
            <ul className="space-y-3">
              {data.items.map((item) => (
                <li key={`${item.rank}-${item.link}`} className="bd border-b pb-3 last:border-0 last:pb-0">
                  <div className="flex gap-3">
                    <span className="tnum muted mt-0.5 w-6 shrink-0 text-right text-[13px] font-bold">
                      {item.rank}
                    </span>
                    <div className="min-w-0 flex-1">
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-[13px] leading-snug font-semibold hover:underline"
                      >
                        {item.title}
                      </a>
                      <div className="muted mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px]">
                        <span>{item.bloggerName}</span>
                        <span className="tnum">{item.postdate || '날짜 미상'}</span>
                        <span className="tnum">{item.ageDays}일 전</span>
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
