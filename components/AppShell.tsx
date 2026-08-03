'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, type ReactNode } from 'react'
import {
  IconBook,
  IconChart,
  IconDoc,
  IconGrid,
  IconPencil,
  IconPhone,
  IconSearch,
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
      { href: '/', label: '대시보드', short: '홈', icon: <IconGrid /> },
      { href: '/keywords', label: '키워드 조사', short: '키워드', icon: <IconSearch /> },
      { href: '/serp', label: '상위노출 분석', short: '상위분석', icon: <IconChart /> },
    ],
  },
  {
    title: '글쓰기',
    items: [
      { href: '/write', label: '글 작성', short: '글쓰기', icon: <IconPencil /> },
      { href: '/posts', label: '발행 관리', short: '발행', icon: <IconDoc /> },
    ],
  },
  {
    title: '성과·설정',
    items: [
      { href: '/rank', label: '순위 추적', short: '순위', icon: <IconTrend /> },
      { href: '/stores', label: '지점 정보', short: '지점', icon: <IconStore /> },
      { href: '/guide', label: '가이드', short: '가이드', icon: <IconBook /> },
      { href: '/deploy', label: '휴대폰에서 쓰기', short: '배포', icon: <IconPhone /> },
    ],
  },
]

const NAV: Item[] = GROUPS.flatMap((g) => g.items)

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

function Logo({ small = false }: { small?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span
        className={`bg-brand-600 flex shrink-0 items-center justify-center rounded-xl font-bold text-white shadow-sm ${
          small ? 'size-8 text-[15px]' : 'size-9 text-[17px]'
        }`}
      >
        N
      </span>
      <span className="min-w-0">
        <span className={`block leading-tight font-bold ${small ? 'text-[15px]' : 'text-[16px]'}`}>
          상위노출 매니저
        </span>
        <span className="muted block text-[10.5px] leading-tight">헬스장·피트니스 블로그</span>
      </span>
    </span>
  )
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const activeTab = useRef<HTMLAnchorElement>(null)

  // 모바일 탭이 가로로 스크롤되므로, 현재 화면 탭이 오른쪽으로 밀려 안 보일 수 있다.
  // 지금 어느 화면인지 늘 보이도록 활성 탭을 시야로 끌어온다.
  useEffect(() => {
    activeTab.current?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [pathname])

  return (
    <div className="min-h-dvh lg:flex">
      {/* 데스크톱 사이드바 */}
      <aside className="bd panel hidden shrink-0 border-r lg:flex lg:w-[248px] lg:flex-col">
        <div className="px-4 py-5">
          <Link href="/" className="block">
            <Logo />
          </Link>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-3">
          {GROUPS.map((g) => (
            <div key={g.title} className="mb-5 last:mb-0">
              <p className="muted mb-1.5 px-2.5 text-[11px] font-bold tracking-[0.06em]">{g.title}</p>
              <ul className="space-y-0.5">
                {g.items.map((n) => {
                  const active = isActive(pathname, n.href)
                  return (
                    <li key={n.href}>
                      <Link
                        href={n.href}
                        aria-current={active ? 'page' : undefined}
                        className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13.5px] transition ${
                          active
                            ? 'bg-brand-500/12 text-brand-700 dark:text-brand-100 font-bold'
                            : 'muted font-medium hover:bg-slate-500/8'
                        }`}
                      >
                        <span className={`block size-[17px] shrink-0 ${active ? '' : 'opacity-80'}`}>
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
            href="/write"
            className="bg-brand-600 hover:bg-brand-700 flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-[13px] font-bold text-white shadow-sm transition"
          >
            <span className="block size-4">
              <IconPencil />
            </span>
            새 글 쓰기
          </Link>
        </div>
      </aside>

      {/* 모바일·태블릿 상단 헤더 + 가로 스크롤 탭 */}
      <div className="min-w-0 flex-1">
        <header className="panel bd sticky top-0 z-20 border-b lg:hidden">
          <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-2.5">
            <Link href="/" className="min-w-0">
              <Logo small />
            </Link>
            <Link
              href="/write"
              className="bg-brand-600 shrink-0 rounded-xl px-3 py-2 text-xs font-bold text-white shadow-sm"
            >
              새 글
            </Link>
          </div>
          <nav className="scroll-x no-scrollbar px-4 pb-2.5">
            <ul className="flex gap-1.5">
              {NAV.map((n) => {
                const active = isActive(pathname, n.href)
                return (
                  <li key={n.href}>
                    <Link
                      href={n.href}
                      ref={active ? activeTab : undefined}
                      aria-current={active ? 'page' : undefined}
                      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold whitespace-nowrap transition ${
                        active ? 'bg-brand-600 text-white shadow-sm' : 'muted surface bd border'
                      }`}
                    >
                      <span className="block size-[14px]">{n.icon}</span>
                      {n.short}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </nav>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-5 pb-16 sm:px-6 sm:py-7">{children}</main>
      </div>
    </div>
  )
}

export function PageHeader({
  title,
  desc,
  right,
}: {
  title: string
  desc?: ReactNode
  right?: ReactNode
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-bold sm:text-[26px]">{title}</h1>
        {desc && <p className="muted mt-1.5 max-w-3xl text-[13px] leading-relaxed">{desc}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  )
}
