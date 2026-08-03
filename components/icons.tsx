/**
 * 화면에 쓰는 아이콘 — 외부 아이콘 패키지를 넣지 않고 직접 그린다.
 *
 * 이 앱은 런타임 의존성이 next/react 뿐이다. 아이콘 하나 때문에 패키지를 늘리면
 * 배포 크기와 업데이트 부담만 생긴다. 선 굵기·크기를 한 곳에서 맞추기도 쉽다.
 */
import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

function Svg({ children, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  )
}

export function IconGrid(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3" y="3" width="7.5" height="7.5" rx="2" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="2" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="2" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" />
    </Svg>
  )
}

export function IconSearch(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </Svg>
  )
}

export function IconChart(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 19.5V4" />
      <path d="M4 19.5h16" />
      <path d="M7.5 16v-4" />
      <path d="M12 16V8" />
      <path d="M16.5 16v-6" />
    </Svg>
  )
}

export function IconPencil(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 20h4l10-10a2.5 2.5 0 0 0-3.5-3.5L4.5 16.5V20z" />
      <path d="M13.5 6.5 17.5 10.5" />
    </Svg>
  )
}

export function IconDoc(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6 3.5h7l5 5v12a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 5 20.5v-15A2 2 0 0 1 6 3.5z" />
      <path d="M13 3.5V9h5" />
      <path d="M8.5 13.5h7M8.5 17h4.5" />
    </Svg>
  )
}

export function IconTrend(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3.5 16.5 9 11l3.5 3.5L20 7" />
      <path d="M15.5 7H20v4.5" />
    </Svg>
  )
}

export function IconStore(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 9.5V19a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19V9.5" />
      <path d="M3 9.5 5 4h14l2 5.5a3 3 0 0 1-5.5 1.5 3 3 0 0 1-5 0 3 3 0 0 1-5.5-1.5z" />
      <path d="M9.5 20.5v-5h5v5" />
    </Svg>
  )
}

export function IconBook(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 4.5h5.5A2.5 2.5 0 0 1 12 7v13a2 2 0 0 0-2-2H4z" />
      <path d="M20 4.5h-5.5A2.5 2.5 0 0 0 12 7v13a2 2 0 0 1 2-2h6z" />
    </Svg>
  )
}

export function IconPhone(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
      <path d="M10.5 18.5h3" />
    </Svg>
  )
}

export function IconTarget(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3.5" />
    </Svg>
  )
}

export function IconBalance(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 4v16" />
      <path d="M6 8h12" />
      <path d="M6 8 3.5 13.5h5z" />
      <path d="M18 8l-2.5 5.5h5z" />
    </Svg>
  )
}

export function IconCheck(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 12.5l2.5 2.5 4.5-5" />
    </Svg>
  )
}
