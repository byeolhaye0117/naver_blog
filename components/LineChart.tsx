'use client'

import { useRef, useState } from 'react'

export interface LinePoint {
  /** x축 라벨 (날짜 등) */
  label: string
  /** null = 측정값 없음 (예: 순위 밖) */
  value: number | null
}

interface Props {
  points: LinePoint[]
  /** true 면 작은 값이 위로 — 순위 차트 (1위가 맨 위) */
  invert?: boolean
  yMin?: number
  yMax?: number
  /** 강조 밴드 — 예: 1~10위 = 검색 1페이지 */
  band?: { from: number; to: number; label: string }
  ticks?: number[]
  format?: (v: number) => string
  /** null 값을 뭐라고 부를지 */
  nullLabel?: string
  height?: number
  valueName?: string
}

const PAD = { top: 16, right: 46, bottom: 24, left: 38 }

export default function LineChart({
  points,
  invert = false,
  yMin,
  yMax,
  band,
  ticks,
  format = (v) => String(v),
  nullLabel = '없음',
  height = 168,
  valueName = '값',
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)

  const W = 640
  const H = height
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom

  const values = points.map((p) => p.value).filter((v): v is number => v !== null)
  const lo = yMin ?? (values.length ? Math.min(...values) : 0)
  const hi = yMax ?? (values.length ? Math.max(...values) : 1)
  const span = hi - lo || 1

  const x = (i: number) =>
    PAD.left + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW)
  const y = (v: number) => {
    const t = (Math.max(lo, Math.min(hi, v)) - lo) / span
    return PAD.top + (invert ? t : 1 - t) * innerH
  }

  // null 을 만나면 선을 끊는다 — 없는 값을 이어 그리면 거짓이 된다
  const segments: { i: number; v: number }[][] = []
  let current: { i: number; v: number }[] = []
  points.forEach((p, i) => {
    if (p.value === null) {
      if (current.length) segments.push(current)
      current = []
    } else {
      current.push({ i, v: p.value })
    }
  })
  if (current.length) segments.push(current)

  let lastRealIdx = -1
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].value !== null) {
      lastRealIdx = i
      break
    }
  }

  const tickList = ticks ?? [lo, Math.round((lo + hi) / 2), hi]
  const hovered = hover !== null ? points[hover] : null

  function onMove(e: React.PointerEvent) {
    const el = wrapRef.current
    if (!el || !points.length) return
    const rect = el.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * W
    const t = (px - PAD.left) / (innerW || 1)
    const idx = Math.round(t * (points.length - 1))
    setHover(Math.max(0, Math.min(points.length - 1, idx)))
  }

  const bandTop = band ? Math.min(y(band.from), y(band.to)) : 0
  const bandHeight = band ? Math.abs(y(band.to) - y(band.from)) : 0

  return (
    <div className="viz">
      <div
        ref={wrapRef}
        className="relative touch-pan-y"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block w-full"
          style={{ height }}
          role="img"
          aria-label={`${valueName} 변화 추이. 정확한 값은 아래 "표로 보기"에 있습니다.`}
        >
          {band && (
            <>
              <rect x={PAD.left} y={bandTop} width={innerW} height={bandHeight} className="viz-band-rect" />
              <text x={PAD.left + 5} y={bandTop + 11} className="viz-bandlabel">
                {band.label}
              </text>
            </>
          )}

          {tickList.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="viz-grid" />
              <text x={PAD.left - 6} y={y(t) + 3.5} textAnchor="end" className="viz-tick">
                {format(t)}
              </text>
            </g>
          ))}

          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={H - PAD.bottom}
            y2={H - PAD.bottom}
            className="viz-axis-line"
          />

          {/* 측정 못한 날 — 값이 없다는 것을 명시적으로 표시 */}
          {points.map((p, i) =>
            p.value === null ? (
              <g key={`n${i}`}>
                <line
                  x1={x(i) - 3.5}
                  x2={x(i) + 3.5}
                  y1={H - PAD.bottom - 4}
                  y2={H - PAD.bottom + 3}
                  className="viz-null"
                />
                <line
                  x1={x(i) - 3.5}
                  x2={x(i) + 3.5}
                  y1={H - PAD.bottom + 3}
                  y2={H - PAD.bottom - 4}
                  className="viz-null"
                />
              </g>
            ) : null
          )}

          {segments.map((seg, si) =>
            seg.length > 1 ? (
              <polyline key={si} className="viz-line" points={seg.map((s) => `${x(s.i)},${y(s.v)}`).join(' ')} />
            ) : null
          )}

          {points.map((p, i) =>
            p.value !== null ? <circle key={`p${i}`} cx={x(i)} cy={y(p.value)} r={4} className="viz-dot" /> : null
          )}

          {/* 마지막 값만 직접 라벨 — 모든 점에 숫자를 달지 않는다 */}
          {lastRealIdx >= 0 && (
            <text x={x(lastRealIdx) + 9} y={y(points[lastRealIdx].value!) + 4} className="viz-valuelabel">
              {format(points[lastRealIdx].value!)}
            </text>
          )}

          {points.length > 0 && (
            <>
              <text x={PAD.left} y={H - 6} className="viz-tick">
                {points[0].label}
              </text>
              {points.length > 1 && (
                <text x={W - PAD.right} y={H - 6} textAnchor="end" className="viz-tick">
                  {points[points.length - 1].label}
                </text>
              )}
            </>
          )}

          {hover !== null && (
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={H - PAD.bottom} className="viz-crosshair" />
          )}
        </svg>

        {hovered && hover !== null && (
          <div className="viz-tooltip" style={{ left: `${(x(hover) / W) * 100}%`, top: 0 }}>
            <span className="viz-tt-date">{hovered.label}</span>
            <span className="viz-tt-val">{hovered.value === null ? nullLabel : format(hovered.value)}</span>
          </div>
        )}
      </div>

      {/* 색·그래프를 못 읽는 경우의 대체 경로 */}
      <details className="mt-2">
        <summary className="muted cursor-pointer text-[11px] select-none">표로 보기</summary>
        <div className="scroll-x mt-2 max-h-48">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="muted text-left">
                <th className="py-1 pr-3 font-semibold">날짜</th>
                <th className="py-1 font-semibold">{valueName}</th>
              </tr>
            </thead>
            <tbody className="tnum">
              {points.map((p, i) => (
                <tr key={`${p.label}-${i}`}>
                  <td className="py-0.5 pr-3">{p.label}</td>
                  <td className="py-0.5">{p.value === null ? nullLabel : format(p.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}

/** 표 안에 넣는 작은 크기 비교 바 — 숫자와 항상 함께 쓴다 (색 단독으로 의미를 싣지 않음) */
export function MiniBar({ ratio }: { ratio: number }) {
  const pct = Math.max(2, Math.min(100, ratio * 100))
  return (
    <span className="viz inline-block h-1.5 w-16 overflow-hidden rounded-full bg-slate-500/15 align-middle">
      <span
        className="block h-full rounded-r-[4px]"
        style={{ width: `${pct}%`, background: 'var(--viz-series)' }}
      />
    </span>
  )
}
