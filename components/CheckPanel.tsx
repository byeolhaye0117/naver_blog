'use client'

import type { CheckGroup, CheckResult } from '@/lib/types'
import { Badge, Progress, levelLabel, levelTone } from '@/components/ui'

const GROUP_ORDER: CheckGroup[] = [
  '키워드',
  '내용 균형',
  '분량·구조',
  '이미지·태그',
  '저품질 위험',
  'AI 티 제거',
]

const GROUP_NOTE: Record<CheckGroup, string> = {
  키워드: '횟수보다 패턴이 중요합니다. 6회를 자연스럽게 쓰면 통과하고 4회를 어색하게 쓰면 걸립니다.',
  // 「2,000~3,000자」는 업계 통설이고 우리 실측과 어긋난다 (분량은 순위와 반대로 갔다).
  // 그래서 이 묶음은 「맞추면 오른다」가 아니라 「너무 짧으면 쓸 내용이 없다」로 말한다.
  '분량·구조': '분량은 실측에서 순위와 반대로 갔습니다 (1위 2,197자 · 2위 1,422자). 규격을 맞추기보다 쓸 내용이 있는지를 보세요 — 소제목은 읽기 편하게 만듭니다.',
  '내용 균형':
    '상위 글 11편을 세본 결과입니다 — 1~3위는 정보 5.2종류·홍보 2.0종류, 4위 이하는 정보 3.6·홍보 3.8이었습니다. 시설·이벤트 안내만으로는 위로 못 갑니다.',
  '이미지·태그': '직접 촬영 원본만 씁니다. 재사용 이미지는 중복 판정 위험이 있습니다.',
  '저품질 위험': '표현을 안전하게 바꾸는 것이지 홍보를 약하게 만드는 게 아닙니다.',
  'AI 티 제거': '문장이 고르면 기계가 쓴 글로 읽힙니다.',
}

export default function CheckPanel({ result }: { result: CheckResult }) {
  const tone = result.score >= 85 ? 'good' : result.score >= 65 ? 'warn' : 'bad'
  const fails = result.items.filter((i) => i.level === 'fail')

  return (
    <div className="space-y-4">
      <div className="panel rounded-xl px-4 py-4">
        <div className="flex items-end justify-between">
          <div>
            <div className="muted text-xs font-semibold">검수 점수</div>
            <div
              className={`tnum text-3xl font-bold ${
                tone === 'good'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : tone === 'warn'
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {result.score}
              <span className="muted ml-0.5 text-base font-semibold">점</span>
            </div>
          </div>
          <div className="muted tnum text-right text-[11px] leading-relaxed">
            통과 {result.items.filter((i) => i.level === 'pass').length}
            <br />
            주의 {result.items.filter((i) => i.level === 'warn').length}
            <br />
            수정필요 {fails.length}
          </div>
        </div>
        <div className="mt-3">
          <Progress value={result.score} tone={tone} />
        </div>
        <p className="muted mt-2.5 text-[11px] leading-relaxed">
          {result.score >= 85
            ? '발행해도 좋은 상태입니다. 아래 주의 항목만 훑어보세요.'
            : fails.length
              ? `먼저 고칠 것: ${fails.slice(0, 2).map((f) => f.label).join(', ')}`
              : '수정필요 항목은 없습니다. 주의 항목을 줄이면 점수가 올라갑니다.'}
        </p>

        {/*
          이 점수의 근거가 얼마나 되는지 먼저 밝힌다.
          26개 항목 중 관찰로 확인된 게 몇 개인지 말하지 않으면, 85점이 근거 있는 85점처럼
          보인다. 관찰이 쌓이면 이 줄의 숫자가 저절로 올라간다.
        */}
        {result.evidenceNote && (
          <details className="bd mt-2.5 border-t pt-2.5">
            <summary className="muted cursor-pointer text-[11px] font-semibold select-none">
              이 기준은 어디서 왔나
            </summary>
            <p className="muted mt-1.5 text-[11px] leading-relaxed">{result.evidenceNote}</p>
            <p className="muted mt-1.5 text-[11px] leading-relaxed">
              관찰은 매일 자동으로 다시 잽니다. 항목마다 붙은 「관찰 N회」가 그 근거이고, 방향이
              갈리거나 거꾸로 나온 항목은 점수 비중이 내려갑니다. 목표 수치 자체는 자동으로 바꾸지
              않습니다 — 상위 글이 그렇다는 것과 그래야 오른다는 것은 다릅니다.
            </p>
          </details>
        )}
      </div>

      {result.risks.length > 0 && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/8 px-4 py-3.5">
          <h3 className="text-[13px] font-bold text-rose-700 dark:text-rose-300">
            위험 표현 {result.risks.length}건
          </h3>
          <p className="mt-1 text-[11px] leading-relaxed text-rose-700/80 dark:text-rose-300/80">
            철자를 바꿔 숨기지 마세요. 변칙 표기는 그 자체가 어뷰징 신호라 위험이 더 커집니다. 주장 자체를
            사실로 바꾸는 것이 유일한 안전한 방법입니다.
          </p>
          <ul className="mt-3 space-y-3">
            {result.risks.map((r, i) => (
              <li key={i} className="bd border-t pt-2.5 first:border-0 first:pt-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={r.level === 'fail' ? 'bad' : 'warn'}>{r.level === 'fail' ? '즉시 수정' : '주의'}</Badge>
                  <span className="muted text-[10px] font-semibold">{r.category}</span>
                  <code className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[11px] font-bold text-rose-700 dark:text-rose-300">
                    {r.term}
                  </code>
                  {r.count > 1 && <span className="muted tnum text-[10px]">{r.count}회</span>}
                </div>
                <p className="muted mt-1.5 text-[11px] leading-snug italic">{r.context}</p>
                <p className="mt-1.5 text-[12px] leading-relaxed">{r.fix}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {GROUP_ORDER.map((group) => {
        const items = result.items.filter((i) => i.group === group)
        if (!items.length) return null
        const worst = items.some((i) => i.level === 'fail')
          ? 'bad'
          : items.some((i) => i.level === 'warn')
            ? 'warn'
            : 'good'
        return (
          <div key={group} className="panel rounded-xl">
            <div className="bd flex items-center justify-between border-b px-4 py-2.5">
              <h3 className="text-[13px] font-bold">{group}</h3>
              <Badge tone={worst}>
                {worst === 'good' ? '전부 통과' : worst === 'warn' ? '주의 있음' : '수정 필요'}
              </Badge>
            </div>
            <p className="muted bd border-b px-4 py-2 text-[11px] leading-snug">{GROUP_NOTE[group]}</p>
            <ul className="divide-y divide-[var(--border)]">
              {items.map((i) => (
                <li key={i.id} className="px-4 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[12px] font-semibold">{i.label}</span>
                    <Badge tone={levelTone(i.level)}>{levelLabel(i.level)}</Badge>
                  </div>
                  <div className="muted tnum mt-1 text-[11px]">
                    현재 <span className="font-semibold">{i.value}</span> · 기준 {i.target}
                  </div>
                  {i.hint && i.level !== 'pass' && (
                    <p className="mt-1.5 text-[11px] leading-relaxed">{i.hint}</p>
                  )}
                  {/*
                    이 기준이 어디서 왔는지 — 관찰소 근거.
                    근거가 갈리거나 거꾸로인 항목은 점수 비중이 이미 내려가 있고, 그 사실을
                    숨기지 않고 적는다. 「왜 이 기준이냐」에 답하지 못하는 검수는 신뢰를 잃는다.
                  */}
                  {i.evidence && (
                    <p
                      className={`mt-1.5 text-[10.5px] leading-relaxed ${
                        i.evidenceVerdict === 'against' ||
                        i.evidenceVerdict === 'mixed' ||
                        i.evidenceVerdict === 'flat'
                          ? 'text-amber-700 dark:text-amber-300'
                          : i.evidenceVerdict === 'supported'
                            ? 'text-emerald-700 dark:text-emerald-300'
                            : 'muted'
                      }`}
                    >
                      {i.evidence}
                      {typeof i.baseWeight === 'number' && i.weight !== i.baseWeight && (
                        <span className="tnum font-semibold">
                          {' '}
                          (비중 {i.baseWeight} → {i.weight})
                        </span>
                      )}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
