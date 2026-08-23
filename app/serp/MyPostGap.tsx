'use client'

import Link from 'next/link'
import type { Fix } from '@/lib/analysis/diagnose'
import type { MyGap } from './SerpAnalyzer'
import { Badge, Card } from '@/components/ui'

/**
 * **우리 글은 무엇이 부족한가 — 그리고 지금 뭘 하고, 다음 글은 어떻게 쓰나.**
 *
 * ── 왜 만들었나 (2026-08-23) ────────────────────────────────
 * 회원: "이거는 상위노출 분석이랑 똑같잖아. 발행한 우리 글에 정확이 부족한점 그래서
 * 발행한 후 어떻게해야하고 앞으로발행할건 어떻게 해야하는지 알려주면 좋겠어."
 *
 * 맞는 지적이었다. 이 화면은 「상위 글 평균 제목은 38자입니다」처럼 **남의 글 통계**만
 * 늘어놓고, 정작 우리 글이 몇 자인지는 한 번도 말하지 않았다. 진단기는 이미 있었는데
 * 순위 화면에서만 돌고 있었다.
 *
 * 그래서 여기서 세 가지를 한 화면에 놓는다:
 *   ① 우리 글 값 ↔ 상위 글 기준을 **항목마다 나란히**
 *   ② **지금 그 글을 열어 고칠 것** (제목·본문·사진 — 고쳐서 되는 것)
 *   ③ **다음 글부터 할 것** (최신성·선점 — 그 글을 고쳐도 안 되는 것)
 *
 * ②와 ③을 가르는 것이 핵심이다. 섞어 놓으면 안 되는 일에 시간을 쓰게 된다.
 */
export default function MyPostGap({ mine, keyword }: { mine: MyGap; keyword: string }) {
  const { plan, diagnosis } = mine
  const checked = diagnosis.fixes.length + diagnosis.passed.length + diagnosis.skipped.length

  return (
    <Card
      title="우리 글은 무엇이 부족한가"
      subtitle={`이 키워드로 발행한 우리 글을 상위 글 기준과 항목마다 맞대어 봤습니다. 위쪽 「상위 글 분석」이 남의 글 이야기라면, 이건 우리 글 이야기입니다.`}
      right={
        <Link
          href={`/write?id=${mine.postId}`}
          className="bg-brand-600 rounded-xl px-3 py-1.5 text-xs font-semibold text-white"
        >
          그 글 열기 →
        </Link>
      }
    >
      {/* 어느 글을 잰 것인지 먼저 밝힌다 — 여러 편 썼으면 헷갈린다 */}
      <div className="panel mb-3 rounded-xl px-3.5 py-3">
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          <Badge tone={mine.rank === null ? 'bad' : mine.rank <= 10 ? 'good' : 'warn'}>
            {mine.rank === null ? '순위 밖' : `${mine.rank}위`}
          </Badge>
          {mine.publishedAt && <Badge tone="default">발행 {mine.days}일째</Badge>}
        </div>
        <p className="text-[13px] leading-snug font-semibold">{mine.title || '(제목 없음)'}</p>
        {mine.publishedUrl && (
          <a
            href={mine.publishedUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="muted mt-1 block truncate text-[11px] underline"
          >
            {mine.publishedUrl}
          </a>
        )}
        <p className="mt-2 text-[12px] leading-relaxed font-semibold">{diagnosis.verdict}</p>
      </div>

      <Group
        tone="now"
        title="① 지금 그 글을 열어 고치세요"
        note={plan.nowNote}
        fixes={plan.now}
        empty="이미 올린 글에서 고칠 것은 없습니다."
      />
      <Group
        tone="next"
        title="② 다음 글부터는 이렇게 쓰세요"
        note={plan.nextNote}
        fixes={plan.next}
        empty="다음 글은 지금 방식 그대로 이어가시면 됩니다."
      />

      {diagnosis.note && (
        <p className="muted mt-3 text-[12px] leading-relaxed">{diagnosis.note}</p>
      )}

      {/*
        「고칠 곳 3개」만 보이면 3개만 검사한 것처럼 읽힌다. 무엇을 이미 맞췄는지,
        무엇을 못 쟀는지까지 밝혀야 진단을 믿을 수 있다.
      */}
      <details className="bd mt-3 border-t pt-3">
        <summary className="muted cursor-pointer text-[12px] font-semibold select-none">
          검사 {checked}개 항목 중 고칠 곳 {diagnosis.fixes.length}개 · 이미 맞춘 것{' '}
          {diagnosis.passed.length}개
          {diagnosis.skipped.length ? ` · 못 잰 것 ${diagnosis.skipped.length}개` : ''}
        </summary>
        {diagnosis.passed.length > 0 && (
          <div className="mt-2">
            <p className="muted mb-1 text-[11px] font-bold">이미 맞춘 것</p>
            <ul className="space-y-1">
              {diagnosis.passed.map((t) => (
                <li key={t} className="muted text-[11.5px] leading-relaxed">
                  ✓ {t}
                </li>
              ))}
            </ul>
          </div>
        )}
        {diagnosis.skipped.length > 0 && (
          <div className="mt-2">
            <p className="muted mb-1 text-[11px] font-bold">못 잰 것</p>
            <ul className="space-y-1">
              {diagnosis.skipped.map((t) => (
                <li key={t} className="muted text-[11.5px] leading-relaxed">
                  · {t}
                </li>
              ))}
            </ul>
          </div>
        )}
      </details>

      <p className="muted mt-3 text-[11px] leading-relaxed">
        이 진단은 「{keyword}」 처방으로 저장됩니다 — 이 키워드로 새 글을 쓰면 AI 지시문에 자동으로
        실립니다. 외워서 옮겨 적지 않으셔도 됩니다.
      </p>
    </Card>
  )
}

/** 한 갈래 — 지금 고칠 것 / 다음 글부터 할 것 */
function Group({
  tone,
  title,
  note,
  fixes,
  empty,
}: {
  tone: 'now' | 'next'
  title: string
  note: string
  fixes: Fix[]
  empty: string
}) {
  return (
    <div className="mt-3 first:mt-0">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <h3 className="text-[13.5px] font-bold">{title}</h3>
        <Badge tone={tone === 'now' ? 'bad' : 'info'}>{fixes.length}가지</Badge>
      </div>
      <p className="muted mb-2 text-[12px] leading-relaxed">{note}</p>
      {fixes.length === 0 ? (
        <p className="muted text-[12px] leading-relaxed">{empty}</p>
      ) : (
        <ol className="space-y-2">
          {fixes.map((f, i) => (
            <li key={f.id} className="panel rounded-xl px-3.5 py-3">
              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                <span className="bg-brand-500/15 text-brand-700 dark:text-brand-100 tnum flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold">
                  {i + 1}
                </span>
                <span className="text-[13px] font-bold">{f.label}</span>
                {f.severity === 'high' && <Badge tone="bad">먼저</Badge>}
              </div>
              {/* 우리 값과 상위 기준을 **나란히** 놓는다 — 이게 없으면 남의 글 통계와 다를 게 없다 */}
              <p className="muted mb-1 text-[12px] leading-relaxed">
                우리 글 <b className="text-[color:var(--fg)]">{f.mine}</b> · {f.theirs}
              </p>
              <p className="text-[12.5px] leading-relaxed">{f.action}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
