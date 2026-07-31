import type { ReactNode } from 'react'
import type { CheckLevel } from '@/lib/types'

export function Card({
  id,
  title,
  subtitle,
  right,
  children,
  className = '',
}: {
  id?: string
  title?: ReactNode
  subtitle?: ReactNode
  right?: ReactNode
  children: ReactNode
  className?: string
}) {
  // min-w-0: grid/flex 안에서 카드가 컨테이너를 밀지 않게 한다.
  // (내부에 truncate = white-space:nowrap 텍스트가 있으면 min-content 바닥이 커져서
  //  좁은 화면에서 열이 늘어나고 글자가 잘린다.)
  return (
    <section id={id} className={`panel min-w-0 scroll-mt-28 rounded-xl ${className}`}>
      {(title || right) && (
        <header className="bd flex flex-wrap items-start justify-between gap-2 border-b px-4 py-3 sm:px-5">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold sm:text-base">{title}</h2>}
            {subtitle && <p className="muted mt-0.5 text-xs leading-relaxed sm:text-[13px]">{subtitle}</p>}
          </div>
          {right && <div className="shrink-0">{right}</div>}
        </header>
      )}
      <div className="px-4 py-4 sm:px-5">{children}</div>
    </section>
  )
}

export function Stat({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: 'default' | 'good' | 'warn' | 'bad'
}) {
  const toneClass =
    tone === 'good'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'warn'
        ? 'text-amber-600 dark:text-amber-400'
        : tone === 'bad'
          ? 'text-rose-600 dark:text-rose-400'
          : ''
  return (
    <div className="panel rounded-xl px-3.5 py-3">
      <div className="muted text-[11px] font-medium sm:text-xs">{label}</div>
      <div className={`tnum mt-1 text-xl font-bold sm:text-2xl ${toneClass}`}>{value}</div>
      {hint && <div className="muted mt-1 text-[11px] leading-snug sm:text-xs">{hint}</div>}
    </div>
  )
}

export function Badge({
  children,
  tone = 'default',
  className = '',
}: {
  children: ReactNode
  tone?: 'default' | 'good' | 'warn' | 'bad' | 'info' | 'brand'
  className?: string
}) {
  const map = {
    default: 'bg-slate-500/12 text-slate-600 dark:text-slate-300 border-slate-500/25',
    good: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
    warn: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
    bad: 'bg-rose-500/12 text-rose-700 dark:text-rose-300 border-rose-500/30',
    info: 'bg-sky-500/12 text-sky-700 dark:text-sky-300 border-sky-500/30',
    brand: 'bg-brand-500/15 text-brand-700 dark:text-brand-100 border-brand-500/30',
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${map[tone]} ${className}`}
    >
      {children}
    </span>
  )
}

export function levelTone(l: CheckLevel): 'good' | 'warn' | 'bad' {
  return l === 'pass' ? 'good' : l === 'warn' ? 'warn' : 'bad'
}

export function levelLabel(l: CheckLevel): string {
  return l === 'pass' ? '통과' : l === 'warn' ? '주의' : '수정필요'
}

export function Field({
  label,
  hint,
  children,
  className = '',
}: {
  label: string
  hint?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-[13px] font-semibold">{label}</span>
      {children}
      {hint && <span className="muted mt-1 block text-[11px] leading-snug">{hint}</span>}
    </label>
  )
}

/** 입력창 공통 클래스 — 모바일 확대 방지를 위해 16px(text-base) 유지 */
export const inputClass =
  'panel w-full rounded-lg border px-3 py-2.5 text-base outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 sm:text-sm'

export function Empty({ children }: { children: ReactNode }) {
  return <p className="muted py-8 text-center text-sm">{children}</p>
}

export function MockNotice({ what }: { what: string }) {
  return (
    <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-[12px] leading-relaxed text-amber-800 dark:text-amber-200">
      <strong className="font-semibold">샘플 데이터입니다.</strong> {what} API 키가 없어 실제 네이버
      데이터가 아닌 예시 값을 보여주고 있습니다. 화면·계산 로직은 실제와 같으니 키만 넣으면 바로 실데이터로
      바뀝니다.{' '}
      <a href="/deploy" className="underline">
        키 발급 방법 보기
      </a>
    </div>
  )
}

export function Progress({ value, tone }: { value: number; tone?: 'good' | 'warn' | 'bad' }) {
  const color =
    tone === 'good' ? 'bg-emerald-500' : tone === 'warn' ? 'bg-amber-500' : tone === 'bad' ? 'bg-rose-500' : 'bg-brand-500'
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-500/15">
      <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  )
}
