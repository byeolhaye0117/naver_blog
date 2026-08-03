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
    <section id={id} className={`card min-w-0 scroll-mt-28 rounded-[22px] ${className}`}>
      {(title || right) && (
        // 제목과 내용 사이에 선을 넣지 않는다 — 여백만으로 나누면 화면이 훨씬 조용해진다
        <header className="flex flex-wrap items-start justify-between gap-2 px-4 pt-4 pb-1 sm:px-5 sm:pt-5">
          <div className="min-w-0">
            {title && (
              <h2 className="text-[15.5px] leading-snug font-bold tracking-[-0.02em] sm:text-[17px]">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="muted mt-1 text-xs leading-relaxed sm:text-[12.5px]">{subtitle}</p>
            )}
          </div>
          {/* 줄이 넘어가면 오른쪽 끝에 붙는다 — 부제목 아래 어중간하게 걸리지 않게 */}
          {right && <div className="ml-auto shrink-0">{right}</div>}
        </header>
      )}
      <div className="px-4 py-4 sm:px-5">{children}</div>
    </section>
  )
}

/** 아이콘 타일 색 — 파스텔 배경 + 진한 글씨 */
const ICON_TONE = {
  brand: 'bg-brand-500/12 text-brand-700 dark:text-brand-100',
  gold: 'bg-gold-500/16 text-gold-700 dark:text-gold-100',
  blue: 'bg-sky-500/12 text-sky-700 dark:text-sky-300',
  violet: 'bg-violet-500/12 text-violet-700 dark:text-violet-300',
  slate: 'bg-slate-500/12 text-slate-600 dark:text-slate-300',
} as const

export type IconTone = keyof typeof ICON_TONE

/** 아이콘을 담는 둥근 타일 — 통계 카드·목록 앞머리에 공통으로 쓴다 */
export function IconTile({
  children,
  tone = 'slate',
  size = 'md',
}: {
  children: ReactNode
  tone?: IconTone
  size?: 'sm' | 'md' | 'lg'
}) {
  const box = size === 'lg' ? 'size-11 rounded-[15px]' : size === 'sm' ? 'size-7 rounded-[10px]' : 'size-9 rounded-xl'
  const inner = size === 'lg' ? 'size-[22px]' : size === 'sm' ? 'size-[15px]' : 'size-[18px]'
  return (
    <span className={`flex shrink-0 items-center justify-center ${box} ${ICON_TONE[tone]}`}>
      <span className={`block ${inner}`}>{children}</span>
    </span>
  )
}

export function Stat({
  label,
  value,
  hint,
  tone = 'default',
  icon,
  iconTone = 'slate',
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: 'default' | 'good' | 'warn' | 'bad'
  /** 왼쪽 아이콘 타일 (없으면 안 그린다) */
  icon?: ReactNode
  iconTone?: IconTone
}) {
  const toneClass =
    tone === 'good'
      ? 'text-brand-700 dark:text-brand-100'
      : tone === 'warn'
        ? 'text-gold-700 dark:text-gold-100'
        : tone === 'bad'
          ? 'text-rose-600 dark:text-rose-400'
          : ''
  return (
    <div className="card rounded-[20px] px-4 py-4">
      <div className="flex items-center gap-2.5">
        {icon && (
          <IconTile tone={iconTone} size="sm">
            {icon}
          </IconTile>
        )}
        <div className="muted min-w-0 truncate text-[11.5px] font-bold">{label}</div>
      </div>
      <div className={`tnum mt-2 text-[27px] leading-none font-extrabold tracking-[-0.03em] ${toneClass}`}>
        {value}
      </div>
      {hint && <div className="muted mt-2 text-[11.5px] leading-snug">{hint}</div>}
    </div>
  )
}

export function Badge({
  children,
  tone = 'default',
  className = '',
  dot = false,
}: {
  children: ReactNode
  tone?: 'default' | 'good' | 'warn' | 'bad' | 'info' | 'brand' | 'gold'
  className?: string
  /** 앞에 점을 붙인다 — 상태 표시일 때 */
  dot?: boolean
}) {
  // 테두리 없는 부드러운 알약 — 표·목록에 여러 개 들어가도 시끄럽지 않다
  const map = {
    default: 'bg-slate-500/12 text-slate-600 dark:text-slate-300',
    good: 'bg-brand-500/14 text-brand-700 dark:text-brand-100',
    warn: 'bg-gold-500/18 text-gold-700 dark:text-gold-100',
    bad: 'bg-rose-500/14 text-rose-700 dark:text-rose-300',
    info: 'bg-sky-500/14 text-sky-700 dark:text-sky-300',
    brand: 'bg-brand-500/14 text-brand-700 dark:text-brand-100',
    gold: 'bg-gold-500/18 text-gold-700 dark:text-gold-100',
  }
  const dotColor = {
    default: 'bg-slate-500',
    good: 'bg-brand-500',
    warn: 'bg-gold-500',
    bad: 'bg-rose-500',
    info: 'bg-sky-500',
    brand: 'bg-brand-500',
    gold: 'bg-gold-500',
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold whitespace-nowrap ${map[tone]} ${className}`}
    >
      {dot && <i className={`size-1.5 rounded-full ${dotColor[tone]}`} />}
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
  group = false,
}: {
  label: string
  hint?: ReactNode
  children: ReactNode
  className?: string
  /**
   * 안에 든 것이 입력창 하나가 아니라 버튼 묶음일 때 켠다.
   * <label> 을 탭하면 안의 첫 번째 버튼이 눌리기 때문에, 설명 문구를 잘못 눌러
   * 글 유형·대가성 같은 값이 조용히 바뀌는 일이 생긴다. 그럴 땐 <div> 로 감싼다.
   */
  group?: boolean
}) {
  const Wrap = group ? 'div' : 'label'
  return (
    <Wrap className={`block ${className}`}>
      <span className="mb-1.5 block text-[13px] font-bold">{label}</span>
      {children}
      {hint && <span className="muted mt-1.5 block text-[11.5px] leading-snug">{hint}</span>}
    </Wrap>
  )
}

/** 입력창 공통 클래스 — 모바일 확대 방지를 위해 16px(text-base) 유지 */
export const inputClass =
  'surface bd w-full rounded-[14px] border px-3.5 py-3 text-base font-medium outline-none transition placeholder:text-[color:var(--muted)] placeholder:font-normal focus:border-brand-500 focus:bg-[var(--panel)] focus:ring-4 focus:ring-brand-500/14 sm:text-sm'

/** 주 버튼 — 화면에서 지금 눌러야 하는 것 하나 */
export const btnPrimary =
  'bg-brand-600 hover:bg-brand-700 active:scale-[.98] inline-flex items-center justify-center gap-1.5 rounded-[14px] px-4 py-3 text-sm font-bold text-white shadow-[0_1px_2px_rgb(0_0_0/.08),0_8px_20px_-10px_var(--color-brand-600)] transition disabled:opacity-50 disabled:active:scale-100'

/** 보조 버튼 */
export const btnGhost =
  'bd surface hover:bg-slate-500/8 active:scale-[.98] inline-flex items-center justify-center gap-1.5 rounded-[14px] border px-3.5 py-3 text-sm font-bold transition disabled:opacity-50 disabled:active:scale-100'

/** 흰 카드 위의 작은 알약 버튼 */
export const btnChip =
  'bd panel hover:bg-slate-500/8 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-bold transition'

export function Empty({ children }: { children: ReactNode }) {
  return <p className="muted py-10 text-center text-[13px] leading-relaxed">{children}</p>
}

export function MockNotice({ what }: { what: string }) {
  return (
    <div className="bg-gold-500/10 border-gold-500/25 text-gold-700 dark:text-gold-100 mb-4 rounded-[16px] border px-3.5 py-3 text-[12px] leading-relaxed">
      <strong className="font-bold">샘플 데이터입니다.</strong> {what} API 키가 없어 실제 네이버
      데이터가 아닌 예시 값을 보여주고 있습니다. 화면·계산 로직은 실제와 같으니 키만 넣으면 바로 실데이터로
      바뀝니다.{' '}
      <a href="/deploy" className="font-bold underline">
        키 발급 방법 보기
      </a>
    </div>
  )
}

export function Progress({ value, tone }: { value: number; tone?: 'good' | 'warn' | 'bad' }) {
  const color =
    tone === 'good'
      ? 'bg-brand-500'
      : tone === 'warn'
        ? 'bg-gold-500'
        : tone === 'bad'
          ? 'bg-rose-500'
          : 'bg-brand-500'
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-500/12">
      <div
        className={`h-full rounded-full ${color} transition-all`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}
