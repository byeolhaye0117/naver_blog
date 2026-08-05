'use client'

import { useMemo } from 'react'
import {
  MINE_CAVEAT,
  MIN_LENGTH,
  OVERLAP_HIGH,
  OVERLAP_SOME,
  compareWithMine,
} from '@/lib/analysis/similarity'
import type { Post, Store } from '@/lib/types'
import { Badge, Card } from '@/components/ui'

/**
 * 내 글끼리 겹치는지 — **특히 지점이 다른 글끼리.**
 *
 * 이게 없어서 지점 4곳에 같은 글을 지점명만 바꿔 올려도 경고가 하나도 뜨지 않았다
 * (실측 90.4% 겹침, 876자 연속 동일). lib/analysis/similarity.ts 의 compareWithMine 주석.
 *
 * 버튼이 없다 — 내 글은 이미 화면에 있어서 네트워크 없이 즉시 잰다. 다 쓰고 나서
 * 「대부분 다시 쓰세요」라고 하면 조치가 아니므로, 쓰는 동안 보여야 한다.
 */
export default function MineOverlapCard({
  text,
  posts,
  stores,
  storeId,
  postId,
}: {
  text: string
  posts: Post[]
  stores: Store[]
  storeId: string
  /** 지금 편집 중인 글 — 자기 자신과는 비교하지 않는다 */
  postId?: string
}) {
  const report = useMemo(() => {
    const others = posts
      .filter((p) => p.id !== postId && p.body.trim())
      .map((p) => ({
        id: p.id,
        title: p.title,
        body: p.body,
        storeId: p.storeId,
        storeName: stores.find((s) => s.id === p.storeId)?.name,
      }))
    if (!others.length) return null
    return compareWithMine(text, others, storeId)
  }, [text, posts, stores, storeId, postId])

  const plainLen = text.replace(/\s/g, '').length
  const tooShort = plainLen < MIN_LENGTH
  const others = posts.filter((p) => p.id !== postId && p.body.trim()).length

  const tone = !report
    ? 'default'
    : report.worst.overlap >= OVERLAP_HIGH
      ? 'bad'
      : report.worst.overlap >= OVERLAP_SOME
        ? 'warn'
        : 'good'

  return (
    <Card
      title="내 글끼리 겹침"
      subtitle="지점만 바꿔 같은 글을 올리면 지역 키워드가 달라도 같은 문서로 묶일 수 있습니다"
      right={
        report ? (
          <Badge tone={tone}>
            {report.worst.overlap >= OVERLAP_HIGH
              ? '고쳐야 함'
              : report.worst.overlap >= OVERLAP_SOME
                ? '살펴볼 것'
                : '괜찮음'}
          </Badge>
        ) : undefined
      }
    >
      {!others ? (
        <p className="muted text-[12px] leading-relaxed">
          견줄 내 글이 아직 없습니다. 두 번째 글부터 여기서 자동으로 비교합니다.
        </p>
      ) : tooShort ? (
        <p className="muted text-[12px] leading-relaxed">
          본문이 {plainLen}자입니다. {MIN_LENGTH}자부터 비교합니다 — 짧은 글은 비율이 튀어서 없는
          문제를 만들어냅니다.
        </p>
      ) : !report ? (
        <p className="muted text-[12px] leading-relaxed">아직 비교할 수 있는 글이 없습니다.</p>
      ) : (
        <>
          <p className="text-[12.5px] leading-relaxed">{report.headline}</p>

          <ul className="mt-3 space-y-2">
            {report.hits.slice(0, 4).map((h) => (
              <li key={h.postId} className="bd border-t pt-2 first:border-0 first:pt-0">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 text-[12px] font-semibold">
                    {h.storeName && (
                      <span
                        className={`mr-1.5 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          h.otherStore
                            ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                            : 'bg-slate-500/12'
                        }`}
                      >
                        {h.storeName}
                        {h.otherStore ? ' · 다른 지점' : ''}
                      </span>
                    )}
                    {h.title || '(제목 없음)'}
                  </span>
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
                {h.overlap >= OVERLAP_SOME && h.samples[0] && (
                  <p className="muted mt-1 text-[11px] leading-snug">
                    그대로 겹치는 구절 ({h.samples[0].length}자): 「{h.samples[0].slice(0, 70)}
                    {h.samples[0].length > 70 ? '…' : ''}」
                  </p>
                )}
              </li>
            ))}
          </ul>

          {report.needsWork && (
            <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-[11.5px] leading-relaxed text-amber-800 dark:text-amber-200">
              {MINE_CAVEAT}
            </p>
          )}
        </>
      )}
    </Card>
  )
}
