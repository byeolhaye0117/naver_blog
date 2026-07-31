'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

const NAV = [
  { href: '/', label: '대시보드', short: '홈' },
  { href: '/keywords', label: '키워드 조사', short: '키워드' },
  { href: '/serp', label: '상위노출 분석', short: '상위분석' },
  { href: '/write', label: '글 작성', short: '글쓰기' },
  { href: '/posts', label: '발행 관리', short: '발행' },
  { href: '/rank', label: '순위 추적', short: '순위' },
  { href: '/stores', label: '지점 정보', short: '지점' },
  { href: '/guide', label: '가이드', short: '가이드' },
]

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="min-h-dvh lg:flex">
      {/* 데스크톱 사이드바 */}
      <aside className="bd panel hidden shrink-0 border-r lg:flex lg:w-60 lg:flex-col">
        <div className="bd border-b px-5 py-5">
          <Link href="/" className="block">
            <span className="text-brand-600 dark:text-brand-100 text-[11px] font-bold tracking-wide">
              NAVER BLOG
            </span>
            <h1 className="mt-0.5 text-[17px] leading-tight font-bold">상위노출 매니저</h1>
          </Link>
          <p className="muted mt-1.5 text-[11px] leading-snug">헬스장·피트니스 블로그 운영 도구</p>
        </div>
        <nav className="flex-1 overflow-y-auto p-3">
          <ul className="space-y-0.5">
            {NAV.map((n) => (
              <li key={n.href}>
                <Link
                  href={n.href}
                  className={`block rounded-lg px-3 py-2 text-sm font-medium transition ${
                    isActive(pathname, n.href)
                      ? 'bg-brand-500/15 text-brand-700 dark:text-brand-100'
                      : 'muted hover:bg-slate-500/8'
                  }`}
                >
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="bd muted border-t px-5 py-3 text-[10px] leading-snug">
          데이터는 이 컴퓨터의 data/db.json 에만 저장됩니다.
        </div>
      </aside>

      {/* 모바일·태블릿 상단 헤더 + 가로 스크롤 탭 */}
      <div className="min-w-0 flex-1">
        <header className="panel bd sticky top-0 z-20 border-b lg:hidden">
          <div className="flex items-center justify-between px-4 pt-3 pb-2">
            <Link href="/" className="min-w-0">
              <span className="text-brand-600 dark:text-brand-100 text-[10px] font-bold tracking-wide">
                NAVER BLOG
              </span>
              <h1 className="text-[15px] leading-tight font-bold">상위노출 매니저</h1>
            </Link>
            <Link
              href="/write"
              className="bg-brand-600 shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
            >
              새 글
            </Link>
          </div>
          <nav className="scroll-x no-scrollbar px-4 pb-2">
            <ul className="flex gap-1.5">
              {NAV.map((n) => (
                <li key={n.href}>
                  <Link
                    href={n.href}
                    className={`block rounded-full px-3 py-1.5 text-[13px] font-semibold whitespace-nowrap transition ${
                      isActive(pathname, n.href)
                        ? 'bg-brand-600 text-white'
                        : 'muted bg-slate-500/10'
                    }`}
                  >
                    {n.short}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </header>

        <main className="mx-auto max-w-5xl px-4 py-5 pb-16 sm:px-6 sm:py-7">{children}</main>
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
        <h1 className="text-xl font-bold sm:text-2xl">{title}</h1>
        {desc && <p className="muted mt-1 text-[13px] leading-relaxed">{desc}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  )
}
