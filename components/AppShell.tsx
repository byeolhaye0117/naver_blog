'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import {
  IconBook,
  IconChart,
  IconDoc,
  IconHome,
  IconMore,
  IconPencil,
  IconPhone,
  IconSearch,
  IconSpark,
  IconStore,
  IconTrend,
} from './icons'

type Item = { href: string; label: string; short: string; icon: ReactNode }

/**
 * 메뉴를 하는 일 기준으로 묶는다.
 * 9개를 한 줄로 늘어놓으면 어디서 무엇을 하는지 매번 읽어야 한다 —
 * "고르고 → 쓰고 → 관리한다" 순서가 그대로 보이게 나눴다.
 */
const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: '살펴보기',
    items: [
      { href: '/', label: '대시보드', short: '홈', icon: <IconHome /> },
      { href: '/keywords', label: '키워드 조사', short: '키워드', icon: <IconSearch /> },
      { href: '/serp', label: '상위노출 분석', short: '상위분석', icon: <IconChart /> },
    ],
  },
  {
    title: '글쓰기',
    items: [
      { href: '/write', label: '글 작성', short: '글쓰기', icon: <IconPencil /> },
      { href: '/autodraft', label: '자동 작성', short: '자동작성', icon: <IconSpark /> },
      { href: '/posts', label: '발행 관리', short: '발행', icon: <IconDoc /> },
    ],
  },
  {
    title: '성과·설정',
    items: [
      { href: '/rank', label: '순위 추적', short: '순위', icon: <IconTrend /> },
      { href: '/blog', label: '블로그 진단', short: '블로그', icon: <IconSearch /> },
      { href: '/stores', label: '지점 정보', short: '지점', icon: <IconStore /> },
      { href: '/guide', label: '가이드', short: '가이드', icon: <IconBook /> },
      { href: '/deploy', label: '휴대폰에서 쓰기', short: '배포', icon: <IconPhone /> },
    ],
  },
]

const NAV: Item[] = GROUPS.flatMap((g) => g.items)

/**
 * 휴대폰 하단 탭 — 손가락이 닿는 자리에 자주 쓰는 4개만 둔다.
 * 예전에는 9개를 상단에 가로로 늘어놓아서, 뒤쪽 메뉴는 옆으로 밀어야 보였다.
 *
 * 「순위」가 여기 있는 이유: 순위를 매일 자동으로 재고 진단까지 해두는데, 그 화면이
 * 「더보기」 안에 있어서 회원이 진단 버튼을 못 찾았다. 매일 볼 화면은 손가락이 닿는
 * 자리에 있어야 한다.
 *
 * 「글쓰기」는 여기서 뺐다 — 상단 「새 글」 버튼이 어느 화면에서나 보이고, 순위·키워드
 * 화면의 「이 처방으로 쓰기」·「이 세트로 글쓰기」로 들어가는 길이 이미 여러 개다.
 *
 * 「자동작성」을 넣은 이유 (2026-08-24 회원 요청: "어디 있는지 모르겠으니까 자동작성 탭을
 * 하나 만들어서 볼수 있게 해줘"): 매일 도는 기능인데 발행 관리 화면의 **접이식 칸 안**에
 * 있었다. 매일 결과가 나오는 화면은 손가락이 닿는 자리에 있어야 한다.
 */
const TAB_HREFS = ['/', '/autodraft', '/keywords', '/serp', '/rank']
const TABS: Item[] = TAB_HREFS.map((h) => NAV.find((n) => n.href === h)!)
/** 하단 탭에 없는 나머지 — 「더보기」 시트에서 보여준다 */
const REST: Item[] = NAV.filter((n) => !TAB_HREFS.includes(n.href))

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

function Logo({ small = false }: { small?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span
        className={`bg-brand-600 relative flex shrink-0 items-center justify-center overflow-hidden font-extrabold text-white shadow-[0_6px_16px_-6px_var(--color-brand-600)] ${
          small ? 'size-9 rounded-[12px] text-[16px]' : 'size-10 rounded-[13px] text-[18px]'
        }`}
      >
        <span className="bg-brand-400/45 absolute -top-2 -right-2 size-6 rounded-full blur-[6px]" />
        <span className="relative">N</span>
      </span>
      <span className="min-w-0">
        <span
          className={`block leading-tight font-extrabold tracking-[-0.03em] ${
            small ? 'text-[15.5px]' : 'text-[16.5px]'
          }`}
        >
          상위노출 매니저
        </span>
        <span className="muted block text-[10.5px] leading-tight font-semibold">
          헬스장·피트니스 블로그
        </span>
      </span>
    </span>
  )
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [moreOpen, setMoreOpen] = useState(false)

  // 화면을 옮기면 시트는 닫는다 (뒤로가기로 돌아왔을 때 열려 있으면 안 된다)
  useEffect(() => setMoreOpen(false), [pathname])

  // 시트가 열려 있을 때 Esc 로 닫기
  useEffect(() => {
    if (!moreOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMoreOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [moreOpen])

  const restActive = REST.some((n) => isActive(pathname, n.href))

  return (
    <div className="min-h-dvh lg:flex">
      {/* 데스크톱 사이드바 */}
      <aside className="bd panel hidden shrink-0 border-r lg:flex lg:w-[252px] lg:flex-col">
        <div className="px-4 py-5">
          <Link href="/" className="block">
            <Logo />
          </Link>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-3">
          {GROUPS.map((g) => (
            <div key={g.title} className="mb-5 last:mb-0">
              <p className="eyebrow mb-1.5 px-2.5">{g.title}</p>
              <ul className="space-y-0.5">
                {g.items.map((n) => {
                  const active = isActive(pathname, n.href)
                  return (
                    <li key={n.href}>
                      <Link
                        href={n.href}
                        aria-current={active ? 'page' : undefined}
                        className={`group relative flex items-center gap-2.5 rounded-[13px] px-2.5 py-2.5 text-[13.5px] transition ${
                          active
                            ? 'bg-brand-500/12 text-brand-700 dark:text-brand-100 font-bold'
                            : 'muted font-semibold hover:bg-slate-500/8'
                        }`}
                      >
                        {active && (
                          <span className="bg-brand-500 absolute top-1/2 left-0 h-4 w-[3px] -translate-y-1/2 rounded-r-full" />
                        )}
                        <span className={`block size-[18px] shrink-0 ${active ? '' : 'opacity-70'}`}>
                          {n.icon}
                        </span>
                        {n.label}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="p-3">
          <Link
            href="/write?new=1"
            className="bg-brand-600 hover:bg-brand-700 flex items-center justify-center gap-1.5 rounded-[14px] px-3 py-3 text-[13.5px] font-bold text-white shadow-[0_8px_20px_-10px_var(--color-brand-600)] transition"
          >
            <span className="block size-[17px]">
              <IconPencil />
            </span>
            새 글 쓰기
          </Link>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* 휴대폰·태블릿 상단 — 이름표와 새 글만. 이동은 아래 탭으로 한다 */}
        <header className="bd sticky top-0 z-20 border-b bg-[var(--bg)]/85 backdrop-blur-xl lg:hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <Link href="/" className="min-w-0">
              <Logo small />
            </Link>
            <Link
              href="/write?new=1"
              className="bg-brand-600 shrink-0 rounded-full px-4 py-2.5 text-[12.5px] font-bold text-white shadow-[0_8px_18px_-10px_var(--color-brand-600)]"
            >
              새 글
            </Link>
          </div>
        </header>

        {/* 하단 탭바(떠 있는 형태)를 위해 본문 아래를 넉넉히 비운다 */}
        <main className="mx-auto max-w-6xl px-4 py-5 pb-28 sm:px-6 sm:py-7 lg:pb-16">{children}</main>
      </div>

      {/* ─── 휴대폰 하단 탭바 ─── */}
      <nav
        aria-label="주요 화면"
        className="fixed inset-x-0 bottom-0 z-30 px-3 pb-[calc(env(safe-area-inset-bottom)+10px)] lg:hidden"
      >
        <ul className="card card-lg flex rounded-[20px] px-1.5 py-1.5">
          {TABS.map((n) => {
            const active = isActive(pathname, n.href)
            return (
              <li key={n.href} className="flex-1">
                <Link
                  href={n.href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex flex-col items-center gap-1 rounded-[15px] py-2 text-[10px] font-bold transition ${
                    active
                      ? 'bg-brand-500/12 text-brand-700 dark:text-brand-100'
                      : 'muted active:bg-slate-500/8'
                  }`}
                >
                  <span className="block size-[21px]">{n.icon}</span>
                  {n.short}
                </Link>
              </li>
            )
          })}
          <li className="flex-1">
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              aria-expanded={moreOpen}
              className={`flex w-full flex-col items-center gap-1 rounded-[15px] py-2 text-[10px] font-bold transition ${
                moreOpen || restActive
                  ? 'bg-brand-500/12 text-brand-700 dark:text-brand-100'
                  : 'muted active:bg-slate-500/8'
              }`}
            >
              <span className="block size-[21px]">
                <IconMore />
              </span>
              더보기
            </button>
          </li>
        </ul>
      </nav>

      {/* ─── 「더보기」 시트 ─── */}
      {moreOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="메뉴 닫기"
            onClick={() => setMoreOpen(false)}
            className="absolute inset-0 bg-slate-900/45 backdrop-blur-[2px]"
          />
          <div className="panel card-lg absolute inset-x-0 bottom-0 rounded-t-[26px] px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+18px)]">
            <div className="mx-auto mb-3 h-1.5 w-11 rounded-full bg-slate-500/25" />
            {GROUPS.map((g) => {
              const items = g.items.filter((n) => REST.includes(n))
              if (!items.length) return null
              return (
                <div key={g.title} className="mb-3.5 last:mb-0">
                  <p className="eyebrow mb-2">{g.title}</p>
                  <ul className="grid grid-cols-2 gap-2">
                    {items.map((n) => {
                      const active = isActive(pathname, n.href)
                      return (
                        <li key={n.href}>
                          <Link
                            href={n.href}
                            aria-current={active ? 'page' : undefined}
                            className={`flex items-center gap-2.5 rounded-[15px] px-3 py-3 text-[13px] transition ${
                              active
                                ? 'bg-brand-500/12 text-brand-700 dark:text-brand-100 font-bold'
                                : 'surface font-bold'
                            }`}
                          >
                            <span className="block size-[18px] shrink-0 opacity-70">{n.icon}</span>
                            {n.label}
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export function PageHeader({
  title,
  desc,
  right,
  eyebrow,
}: {
  title: string
  desc?: ReactNode
  right?: ReactNode
  /** 제목 위에 얹는 작은 안내 (예: 화면 이름) */
  eyebrow?: string
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
        <h1 className="text-[25px] leading-[1.2] font-extrabold tracking-[-0.035em] sm:text-[30px]">
          {title}
        </h1>
        {desc && <p className="muted mt-2 max-w-3xl text-[13px] leading-relaxed">{desc}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  )
}
