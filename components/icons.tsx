/**
 * 화면에 쓰는 아이콘 — 외부 아이콘 패키지를 넣지 않고 직접 그린다.
 *
 * 이 앱은 런타임 의존성이 next/react 뿐이다. 아이콘 하나 때문에 패키지를 늘리면
 * 배포 크기와 업데이트 부담만 생긴다. 선 굵기·모서리를 한 곳에서 맞추기도 쉽다.
 *
 * 규칙: 24 격자, 선 굵기 1.7, 끝은 둥글게. 채운 도형은 currentColor 에 투명도를 줘서
 * 선과 같은 색으로 층을 만든다 (아이콘 하나가 두 겹으로 보이는 효과).
 */
import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

function Svg({ children, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  )
}

/** 채움 층 — 선 아래에 깔아 입체감을 준다 */
function Fill({ d, o = 0.16 }: { d: string; o?: number }) {
  return <path d={d} fill="currentColor" fillOpacity={o} stroke="none" />
}

export function IconHome(p: IconProps) {
  return (
    <Svg {...p}>
      <Fill d="M4 10.4 12 4l8 6.4V19a1.6 1.6 0 0 1-1.6 1.6H5.6A1.6 1.6 0 0 1 4 19z" />
      <path d="M4 10.4 12 4l8 6.4V19a1.6 1.6 0 0 1-1.6 1.6H5.6A1.6 1.6 0 0 1 4 19z" />
      <path d="M9.5 20.6v-5.2h5v5.2" />
    </Svg>
  )
}

export function IconGrid(p: IconProps) {
  return (
    <Svg {...p}>
      <Fill d="M3.5 3.5h7v7h-7zM13.5 13.5h7v7h-7z" />
      <rect x="3.5" y="3.5" width="7" height="7" rx="2.2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="2.2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="2.2" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="2.2" />
    </Svg>
  )
}

export function IconSearch(p: IconProps) {
  return (
    <Svg {...p}>
      <Fill d="M11 4.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13z" />
      <circle cx="11" cy="11" r="6.5" />
      <path d="M15.8 15.8 20.5 20.5" />
    </Svg>
  )
}

export function IconChart(p: IconProps) {
  return (
    <Svg {...p}>
      <Fill d="M7 12h2.6v6H7zM11.7 7.5h2.6V18h-2.6zM16.4 10h2.6v8h-2.6z" o={0.2} />
      <path d="M4 20.2h16.5" />
      <path d="M7 18v-6M12 18V7.5M17.5 18v-8" />
    </Svg>
  )
}

export function IconPencil(p: IconProps) {
  return (
    <Svg {...p}>
      <Fill d="M4.6 19.4h3.6L18 9.6a2.4 2.4 0 0 0-3.4-3.4L4.6 15.8z" />
      <path d="M4.6 19.4h3.6L18 9.6a2.4 2.4 0 0 0-3.4-3.4L4.6 15.8z" />
      <path d="M13.4 7 17 10.6" />
    </Svg>
  )
}

export function IconDoc(p: IconProps) {
  return (
    <Svg {...p}>
      <Fill d="M6.4 3.6h6.4l5 5v11a1.4 1.4 0 0 1-1.4 1.4H6.4A1.4 1.4 0 0 1 5 19.6V5a1.4 1.4 0 0 1 1.4-1.4z" />
      <path d="M6.4 3.6h6.4l5 5v11a1.4 1.4 0 0 1-1.4 1.4H6.4A1.4 1.4 0 0 1 5 19.6V5a1.4 1.4 0 0 1 1.4-1.4z" />
      <path d="M12.6 3.6V9h5" />
      <path d="M8.6 13.4h6.2M8.6 16.6h4" />
    </Svg>
  )
}

export function IconTrend(p: IconProps) {
  return (
    <Svg {...p}>
      <Fill d="M3.6 16.4 9 11l3.5 3.5L20 7v9.4z" o={0.14} />
      <path d="M3.6 16.4 9 11l3.5 3.5L20 7" />
      <path d="M15.4 7H20v4.6" />
    </Svg>
  )
}

export function IconStore(p: IconProps) {
  return (
    <Svg {...p}>
      <Fill d="M4.4 10.2h15.2V19a1.5 1.5 0 0 1-1.5 1.5H5.9A1.5 1.5 0 0 1 4.4 19z" />
      <path d="M4.4 10.2V19a1.5 1.5 0 0 0 1.5 1.5h12.2A1.5 1.5 0 0 0 19.6 19v-8.8" />
      <path d="M3.2 9.6 5.2 4h13.6l2 5.6a3 3 0 0 1-5.5 1.5 3 3 0 0 1-5 0 3 3 0 0 1-5.6-1.5z" />
      <path d="M9.8 20.5v-4.8h4.4v4.8" />
    </Svg>
  )
}

export function IconBook(p: IconProps) {
  return (
    <Svg {...p}>
      <Fill d="M4 4.6h5.4A2.6 2.6 0 0 1 12 7.2v12.6a2 2 0 0 0-2-1.9H4z" />
      <path d="M4 4.6h5.4A2.6 2.6 0 0 1 12 7.2v12.6a2 2 0 0 0-2-1.9H4z" />
      <path d="M20 4.6h-5.4A2.6 2.6 0 0 0 12 7.2v12.6a2 2 0 0 1 2-1.9h6z" />
    </Svg>
  )
}

export function IconPhone(p: IconProps) {
  return (
    <Svg {...p}>
      <Fill d="M7.4 2.6h9.2A1.8 1.8 0 0 1 18.4 4.4v15.2a1.8 1.8 0 0 1-1.8 1.8H7.4a1.8 1.8 0 0 1-1.8-1.8V4.4a1.8 1.8 0 0 1 1.8-1.8z" />
      <rect x="5.6" y="2.6" width="12.8" height="18.8" rx="2.6" />
      <path d="M10.4 18.6h3.2" />
    </Svg>
  )
}

export function IconMore(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="5.2" cy="12" r="1.7" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none" />
      <circle cx="18.8" cy="12" r="1.7" fill="currentColor" stroke="none" />
    </Svg>
  )
}

export function IconTarget(p: IconProps) {
  return (
    <Svg {...p}>
      <Fill d="M12 8.2a3.8 3.8 0 1 1 0 7.6 3.8 3.8 0 0 1 0-7.6z" o={0.22} />
      <circle cx="12" cy="12" r="8.2" />
      <circle cx="12" cy="12" r="3.8" />
    </Svg>
  )
}

export function IconBalance(p: IconProps) {
  return (
    <Svg {...p}>
      <Fill d="M3.4 13.4 6 8l2.6 5.4zM15.4 13.4 18 8l2.6 5.4z" o={0.18} />
      <path d="M12 4.2v15.6M8.4 19.8h7.2" />
      <path d="M6 8h12" />
      <path d="M3.4 13.4 6 8l2.6 5.4a2.7 2.7 0 0 1-5.2 0z" />
      <path d="M15.4 13.4 18 8l2.6 5.4a2.7 2.7 0 0 1-5.2 0z" />
    </Svg>
  )
}

export function IconCheck(p: IconProps) {
  return (
    <Svg {...p}>
      <Fill d="M12 3.6a8.4 8.4 0 1 1 0 16.8 8.4 8.4 0 0 1 0-16.8z" />
      <circle cx="12" cy="12" r="8.4" />
      <path d="M8.4 12.4 11 15l4.6-5.2" />
    </Svg>
  )
}

/** 황금 키워드·추천 표시 */
export function IconSpark(p: IconProps) {
  return (
    <Svg {...p}>
      <Fill d="M12 3.2 13.9 9l6 1.9-6 1.9-1.9 6-1.9-6-6-1.9 6-1.9z" o={0.2} />
      <path d="M12 3.2 13.9 9l6 1.9-6 1.9-1.9 6-1.9-6-6-1.9 6-1.9z" />
    </Svg>
  )
}

/** 오른쪽 화살표 — 목록 항목 끝에 */
export function IconChevron(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M9.5 5.5 16 12l-6.5 6.5" />
    </Svg>
  )
}

export function IconArrowRight(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4.5 12h15" />
      <path d="M13.5 6 19.5 12l-6 6" />
    </Svg>
  )
}
