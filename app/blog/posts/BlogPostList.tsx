'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { BlogStat } from '@/lib/naver/blogstat'
import { Badge, Card, Empty, btnGhost, btnPrimary, inputClass } from '@/components/ui'

interface Row {
  logNo: string
  title: string
  date: string
  /** 네이버가 준 그대로 — 방금 올린 글은 「7분 전」이 날짜보다 알아보기 쉽다 */
  dateRaw: string
  commentCount: number
  searchable: boolean
  open: boolean
  url: string
  /** 앱에서 쓴 글이면 그 글의 id */
  postId?: string
  /** 순위 추적에 등록돼 있으면 그 항목의 id */
  targetId?: string
}

interface Result {
  blogId: string
  page: number
  pages: number | null
  posts: Row[]
  stat: BlogStat | null
  note: string
}

/**
 * **아이디 하나로 그 블로그가 무슨 글을 썼는지 본다** (2026-09-01 회원 요청).
 *
 * 회원: "블로그 url 앞에 있는 아이디를 보고 이 아이디에 어떤 글들을 썼는지 확인할 수
 * 있는 페이지 만들어주면 좋겠어."
 *
 * 옆 화면(블로그 진단)과 헷갈리지 않게 **하는 일을 좁게 잡았다** — 성격 판정도, 점수도
 * 없다. 무엇을 언제 썼는지 죽 훑어보는 목록이다.
 */
export default function BlogPostList({ initialId }: { initialId: string }) {
  const [id, setId] = useState(initialId)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [res, setRes] = useState<Result | null>(null)

  async function load(page = 0, who = id) {
    if (!who.trim()) return
    setLoading(true)
    setError(null)
    try {
      const r = await fetch('/api/blog/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: who, page }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data?.error ?? '글 목록을 읽지 못했습니다.')
      setRes(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : '글 목록을 읽지 못했습니다.')
      setRes(null)
    }
    setLoading(false)
  }

  const stat = res?.stat
  return (
    <div className="space-y-4">
      <Card title="어느 블로그를 볼까요">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void load(0)
          }}
          className="flex flex-wrap items-end gap-2"
        >
          <label className="min-w-[15rem] flex-1">
            <span className="muted mb-1 block text-[11px] font-semibold">블로그 아이디 또는 글 주소</span>
            <input
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="sulliha8277 또는 https://blog.naver.com/sulliha8277/224396966420"
              className={inputClass}
            />
          </label>
          <button type="submit" disabled={loading || !id.trim()} className={`${btnPrimary} disabled:opacity-50`}>
            {loading ? '읽는 중…' : '글 목록 보기'}
          </button>
        </form>
        {/*
          **주소를 통째로 넣어도 되게 한다.** 회원이 이 기능을 떠올린 자리가 순위 추적
          화면이고, 거기 있는 것은 아이디가 아니라 글 주소다 — 아이디만 받으면 회원이
          주소에서 손으로 잘라 내야 한다.
        */}
        <p className="muted mt-2 text-[11px] leading-relaxed">
          글 주소를 그대로 붙여 넣으셔도 됩니다 — 앞의 아이디만 뽑아 씁니다. <b>남의 블로그도 됩니다</b>{' '}
          (로그인 없이 읽히는 공개 목록입니다). 다만 <b>방문자 수 추이·유입 경로</b>는 블로그 주인이 로그인해야
          열리는 값이라 여기서 볼 수 없습니다. 이 블로그가 <b>어떤 성격인지·얼마나 힘이 있는지</b>까지 보시려면{' '}
          <Link href="/blog" className="font-semibold underline">
            블로그 진단
          </Link>{' '}
          화면을 쓰세요 (조회를 수십 번 해서 2분쯤 걸립니다).
        </p>
      </Card>

      {error && (
        <Card title="읽지 못했습니다">
          <p className="text-[12.5px] leading-relaxed font-semibold text-rose-600">{error}</p>
        </Card>
      )}

      {res && (
        <Card
          title={`${res.blogId} 의 글`}
          subtitle={res.note}
          right={
            <a href={`https://blog.naver.com/${res.blogId}`} target="_blank" rel="noreferrer" className={btnGhost}>
              블로그 열기 ↗
            </a>
          }
        >
          {/*
            **밖에서 볼 수 있는 숫자만 적는다.** 못 보는 것은 위 안내에 적어 뒀다 —
            여기 0 으로 채워 넣으면 없는 사실을 만드는 셈이다.
          */}
          {stat && (
            <dl className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-[11.5px]">
              {[
                ['전체 글', stat.postCount],
                ['오늘 방문', stat.dayVisitors],
                ['누적 방문', stat.totalVisitors],
                ['이웃', stat.buddies],
              ].map(([label, v]) => (
                <div key={String(label)} className="flex gap-1.5">
                  <dt className="muted font-semibold">{label}</dt>
                  <dd className="tnum font-bold">
                    {typeof v === 'number' ? v.toLocaleString() : <span className="muted font-semibold">못 읽음</span>}
                  </dd>
                </div>
              ))}
            </dl>
          )}

          {res.posts.length === 0 ? (
            <Empty>글이 없거나 목록을 읽지 못했습니다.</Empty>
          ) : (
            <ul className="space-y-1.5">
              {res.posts.map((p) => (
                <li key={p.logNo} className="bd rounded-xl border px-3 py-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {/*
                      **방금 올린 글은 「7분 전」이 낫다** (2026-09-01). 네이버가 하루 안에
                      올린 글을 그렇게 준다 — 오늘 날짜로 바꿔 적으면 오늘 올린 글 여러 편이
                      전부 같은 줄로 보인다. 원문이 상대 시각이면 그대로 쓴다.
                    */}
                    <span className="muted tnum text-[11px] font-semibold">
                      {/전$/.test(p.dateRaw?.trim() ?? '') ? p.dateRaw.trim() : p.date || '날짜 모름'}
                    </span>
                    {/*
                      **우리가 아는 글에는 표시를 붙인다.** 목록만 보면 남의 글도 내 글도
                      제목 한 줄이라, 자기 블로그를 볼 때 「이건 앱에서 쓴 글인가」를
                      다시 대조해야 한다. 글 번호로만 맞춘다 — 제목으로 맞추면 올리기 직전에
                      제목을 손본 글이 어긋난다.
                    */}
                    {p.postId && <Badge tone="good">앱에서 쓴 글</Badge>}
                    {p.targetId && <Badge tone="info">순위 추적 중</Badge>}
                    {/*
                      **검색 허용 안 함은 눈에 띄어야 한다.** 이건 참고가 아니라 순위와
                      직결된다 — 꺼 두면 아무리 잘 써도 검색에 안 나온다.
                    */}
                    {!p.searchable && <Badge tone="bad">검색 허용 안 함</Badge>}
                    {!p.open && <Badge tone="warn">전체공개 아님</Badge>}
                    {p.commentCount > 0 && <span className="muted text-[11px]">댓글 {p.commentCount}</span>}
                  </div>
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-0.5 block text-[12.5px] leading-relaxed font-semibold underline-offset-2 hover:underline"
                  >
                    {p.title || '(제목 없음)'}
                  </a>
                  {p.postId && (
                    <Link href={`/write?id=${p.postId}`} className="muted mt-0.5 inline-block text-[11px] underline">
                      앱에서 이 글 열기 →
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* 넘겨 보기 — 몇 쪽인지 모를 때는 「다음」만 둔다 (없는 수를 지어내지 않는다) */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={loading || res.page === 0}
              onClick={() => void load(res.page - 1)}
              className={`${btnGhost} !px-3 !py-1.5 !text-[11.5px] disabled:opacity-40`}
            >
              ← 이전
            </button>
            <span className="muted text-[11.5px] font-semibold">
              {res.page + 1}
              {res.pages ? ` / ${res.pages}` : ''} 쪽
            </span>
            <button
              type="button"
              disabled={loading || (res.pages !== null && res.page + 1 >= res.pages) || res.posts.length === 0}
              onClick={() => void load(res.page + 1)}
              className={`${btnGhost} !px-3 !py-1.5 !text-[11.5px] disabled:opacity-40`}
            >
              다음 →
            </button>
          </div>
        </Card>
      )}
    </div>
  )
}
