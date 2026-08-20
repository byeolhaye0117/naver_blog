import type { PlaceReview } from '@/lib/analysis/reviews'

/**
 * **모아둔 리뷰를 원본 화면과 함께 보여준다.**
 *
 * 회원 요청 (2026-08-19): "리뷰는 그대로 인용하면 되지, 글이랑 사진이랑 함께 첨부해서
 * 홈페이지에 보일 수 있게 해줘."
 *
 * 앞 판은 문장만 한 줄씩 쌓아 보여줬다. 그러면 **이게 진짜 리뷰인지 확인할 방법이 화면에
 * 없다.** 인용은 글에 그대로 옮겨지고, 없는 리뷰를 옮기면 표시광고법 위반이다 — 확인이
 * 필요한 자료를 확인할 수 없게 두면 안 된다.
 *
 * 그래서 작성자·예약일·원본 화면을 문장과 붙여 놓는다. 눌러서 원본 크기로 볼 수 있다.
 * 사진은 **꾸밈이 아니라 근거**다.
 */
export default function ReviewProof({ reviews }: { reviews: PlaceReview[] }) {
  const withProof = reviews.filter((r) => r.kind === 'text' && (r.image || r.author))
  if (!withProof.length) return null

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {withProof.map((r, i) => (
        <figure key={`${r.author ?? i}-${r.at ?? i}`} className="bd overflow-hidden rounded-xl border">
          {r.image && (
            /*
              next/image 를 쓰지 않는다 — 이 이미지는 캡처라 크기가 제각각이고, 원본을 그대로
              보여주는 것이 목적이다. 넓이만 맞추고 높이는 원본 비율로 둔다.
            */
            // eslint-disable-next-line @next/next/no-img-element
            <a href={r.image} target="_blank" rel="noreferrer" className="block bg-slate-500/5">
              <img
                src={r.image}
                alt={`${r.author ?? '방문자'} 리뷰 원본 화면`}
                loading="lazy"
                className="h-auto w-full"
              />
            </a>
          )}
          <figcaption className="px-3 py-2">
            <p className="text-[11.5px] font-semibold">
              {r.author ?? '방문자'}
              {r.at && <span className="muted font-normal"> · {r.at}</span>}
            </p>
            <p className="mt-1 text-[11.5px] leading-relaxed">{r.text}</p>
          </figcaption>
        </figure>
      ))}
    </div>
  )
}
