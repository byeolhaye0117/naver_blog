import Link from 'next/link'
import { keyStatus } from '@/lib/naver/client'
import { RISK_TERMS, COMMERCIAL_LIMITS } from '@/lib/writing/banned'
import { SPECS } from '@/lib/writing/checker'
import { PageHeader } from '@/components/AppShell'
import { Badge, Card } from '@/components/ui'

export const dynamic = 'force-dynamic'

/** 지식 베이스 기준일 — 3개월 이상 지나면 최신 알고리즘 변화를 다시 확인해야 한다 */
const KB_DATE = '2026-07-23'

function monthsSince(d: string): number {
  const then = new Date(d)
  const now = new Date()
  return (now.getFullYear() - then.getFullYear()) * 12 + (now.getMonth() - then.getMonth())
}

export default function GuidePage() {
  const keys = keyStatus()
  const stale = monthsSince(KB_DATE) >= 3

  return (
    <>
      <PageHeader
        title="가이드"
        desc="이 앱의 모든 검수 기준이 나오는 근거 문서입니다. 규칙에 없는 상황을 판단할 때 여기를 보세요."
      />

      <div className="space-y-4">
        {stale && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3.5 text-[12px] leading-relaxed text-amber-800 dark:text-amber-200">
            <strong className="font-bold">기준일이 {KB_DATE} 입니다 (3개월 이상 경과).</strong> 네이버 랭킹
            기준은 바뀝니다. 노출이 떨어졌거나 알고리즘이 바뀐 것 같으면 최신 변화를 검색해 확인하고, 달라진
            점을 이 문서에 반영하세요. Claude에게 &quot;네이버 블로그 알고리즘 최신 변화 확인해줘&quot;라고
            요청하면 됩니다.
          </div>
        )}

        {/* ─── API 키 · 배포 (상세 절차는 /deploy 한 곳에만 둔다) ─── */}
        <Card
          id="api"
          title="API 키 · 휴대폰에서 쓰기"
          subtitle="키가 없어도 앱은 전부 동작합니다 — 다만 숫자가 샘플 값입니다."
        >
          <div className="flex flex-wrap gap-2">
            <Badge tone={keys.search ? 'good' : 'warn'}>
              검색 API {keys.search ? '연결됨' : '미설정'}
            </Badge>
            <Badge tone={keys.searchAd ? 'good' : 'warn'}>
              검색광고 API {keys.searchAd ? '연결됨' : '미설정'}
            </Badge>
          </div>
          <p className="mt-3 text-[12px] leading-relaxed">
            네이버 API 키 발급 절차, 휴대폰에서 쓰기 위한 배포, 휴대폰·PC 기록을 합치는 저장소 연결은{' '}
            <Link href="/deploy" className="text-brand-600 dark:text-brand-100 font-semibold underline">
              휴대폰에서 쓰기 · 배포
            </Link>{' '}
            화면에 한 번만 정리해 두었습니다.
          </p>
          <div className="mt-3 rounded-lg border border-sky-500/30 bg-sky-500/8 px-3.5 py-3 text-[12px] leading-relaxed text-sky-900 dark:text-sky-200">
            <strong className="font-bold">발행(업로드)은 왜 자동이 아닌가요?</strong> 네이버는 블로그
            글쓰기 공식 API를 제공하지 않습니다. 로그인 자동화로 우회하는 방법이 있지만 캡차·2단계 인증에
            막히고 계정 제재 위험이 있어, 이 앱은 대신{' '}
            <Link href="/posts" className="underline">
              발행 패키지
            </Link>
            를 만들어 줍니다 — 제목·본문·태그를 순서대로 복사해 붙이고, 이미지 배치표와 체크리스트대로
            올리면 됩니다.
          </div>
        </Card>

        {/* ─── 랭킹 로직 ─── */}
        <Card title="랭킹 알고리즘 3층 구조" subtitle="✓ 공식 발표 기준">
          <div className="space-y-3.5">
            {[
              {
                t: 'C-Rank — 출처 신뢰도',
                d: '문서가 아니라 블로그 자체를 평가합니다. 한 주제로 꾸준히 양질의 글을 쌓은 블로그의 글이 상위에 갑니다. 2025~26년 들어 주제 집중도가 핵심 평가요소로 강화됐습니다.',
                m: '헬스·운동·지역생활 범위를 벗어난 글을 섞지 않습니다. 카테고리는 2~3개 이내로 집중.',
              },
              {
                t: 'D.I.A. / D.I.A.+ — 문서 품질·의도 분석',
                d: '개별 문서의 경험·정보성·검색 의도 부합을 봅니다. 직접 경험이 들어간 글, 문서 맥락이 검색 의도와 맞는 글에 가산점. 영상 삽입 문서에도 가산점이 있습니다.',
                m: '검색한 사람이 알고 싶은 것에 실제로 답해야 합니다. 홍보만 있고 정보가 없으면 감점.',
              },
              {
                t: '에어서치 · 스마트블록',
                d: 'AI가 검색어를 의도 단위로 쪼개 블록별로 노출합니다("○○동 헬스장" → 가격·후기·시설 등). 통합검색 1페이지 개념이 약해지고, 구체적 의도를 가진 세부 키워드에 걸릴 기회가 늘었습니다.',
                m: '제목에 메인 키워드 + 세부 의도(새벽 운동·여성전용 등)를 함께 담으면 진입에 유리.',
              },
            ].map((x) => (
              <div key={x.t} className="bd rounded-lg border p-3.5">
                <h3 className="text-[13px] font-bold">{x.t}</h3>
                <p className="mt-1.5 text-[12px] leading-relaxed">{x.d}</p>
                <p className="text-brand-700 dark:text-brand-100 mt-2 text-[12px] leading-relaxed font-semibold">
                  → {x.m}
                </p>
              </div>
            ))}
          </div>
        </Card>

        {/* ─── 발행 후 타임라인 ─── */}
        <Card
          id="timeline"
          title="발행 후 언제 순위가 잡히나"
          subtitle="같은 '순위 밖'도 발행 3일차와 3주차는 뜻이 전혀 다릅니다. 순위 추적 화면이 이 구간을 함께 알려줍니다."
        >
          <div className="space-y-3">
            {[
              {
                t: '0~3일 · 색인 구간',
                d: '검색에 등록되는 단계입니다. 자동 색인은 24~72시간, 서치어드바이저에서 수동으로 요청하면 수 시간 내에 등록됩니다. 이 구간에 순위가 없는 것은 정상입니다.',
                mark: '✓',
              },
              {
                t: '24~48시간 · 초기 반응 수집',
                d: '조회·체류·공감 같은 초기 반응이 반영되는 구간입니다. 지인 공유 같은 자연 유입은 괜찮지만 품앗이·매크로는 조작 트래픽으로 판정됩니다.',
                mark: '≈',
              },
              {
                t: '~3주 · 자리 잡는 구간',
                d: '순위가 오르내리다 안정됩니다. 이 구간에 뒤늦게 올라오는 경우도 있습니다. 다만 며칠 만에 자리가 잡힌다거나 정확히 몇 주가 걸린다는 공개 수치는 없습니다 — 이 3주는 판단 기준선이지 네이버가 밝힌 값이 아닙니다.',
                mark: '?',
              },
              {
                t: '3주 이후에도 순위 밖',
                d: '진입 실패로 보는 편이 낫습니다. 세부 의도를 붙여 키워드를 좁히거나(예: "+ 새벽", "+ 초보"), 정보량을 늘려 다시 쓰세요. 글을 계속 붙들고 있는 것보다 다음 글이 낫습니다.',
                mark: '?',
              },
            ].map((x) => (
              <div key={x.t} className="bd rounded-lg border p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-[13px] font-bold">{x.t}</h3>
                  <Badge tone={x.mark === '✓' ? 'good' : x.mark === '≈' ? 'info' : 'warn'}>
                    {x.mark === '✓' ? '공식 확인' : x.mark === '≈' ? '실무 통설' : '근거 불충분'}
                  </Badge>
                </div>
                <p className="muted mt-1.5 text-[12px] leading-relaxed">{x.d}</p>
              </div>
            ))}

            <div className="rounded-lg border border-sky-500/30 bg-sky-500/8 px-3.5 py-3 text-[12px] leading-relaxed text-sky-900 dark:text-sky-200">
              <strong className="font-bold">블로그 지수가 낮은데도 새 글이 바로 상위에 뜨는 이유</strong>
              <p className="mt-1.5">
                2025년에 C-Rank·D.I.A.+ 평가가 스마트블록에 완전히 통합됐습니다. D.I.A.+는{' '}
                <strong>문서 하나</strong>의 검색 의도 적합성을 보기 때문에, 특정 스마트블록에서는 블로그
                지수보다 그 글 자체의 의도 적합성이 더 세게 작동합니다. 지수가 낮은 블로그도 세부 의도가 딱
                맞는 글 하나로 뚫을 수 있다는 뜻이고, 반대로 지수가 높아도 의도가 어긋난 글은 밀립니다.
              </p>
              <p className="mt-2">
                → 실무적 결론: <strong>큰 키워드로 지수 싸움을 하기보다, 세부 의도를 좁힌 키워드로 문서 단위
                승부를 보는 편이 빠릅니다.</strong> 키워드 조사 화면의 지역 키워드 조합 생성기가 이걸 위한
                기능입니다.
              </p>
            </div>
          </div>
        </Card>

        {/* ─── 가산 요소 ─── */}
        <Card title="지수 향상 조건 (가산 요소)">
          <div className="scroll-x -mx-4 px-4 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[480px] text-[12px]">
              <thead>
                <tr className="muted bd border-b text-left">
                  <th className="py-2 pr-3 font-semibold">요소</th>
                  <th className="py-2 font-semibold">내용</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['체류시간', '지수 가산 중 가장 빠른 요소. 발행 후 24시간~7일 사이 누적이 중요'],
                  ['주제 일관성', '한 주제로 쌓인 글 → C-Rank 상승. 협찬 글도 주제와 안 맞으면 역효과'],
                  ['발행 주기', '주 2~3회 꾸준히. 몰아서 대량 발행은 역효과'],
                  ['초기 반응', '발행 후 24시간 내 자연스러운 조회·공감·댓글 (품앗이·매크로는 금지)'],
                  ['정보 밀도', '검색 의도에 답하는 실질 정보. 상위글 평균 2,000~3,000자'],
                  ['원본 콘텐츠', '직접 촬영 이미지 5장 이상, 영상 30초~3분 1개'],
                  ['서치어드바이저', '발행 후 색인 요청하면 수 시간 내 검색 등록'],
                ].map(([a, b]) => (
                  <tr key={a} className="bd border-b last:border-0 align-top">
                    <td className="py-2 pr-3 font-semibold whitespace-nowrap">{a}</td>
                    <td className="py-2 leading-relaxed">{b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* ─── 저품질 트리거 ─── */}
        <Card title="저품질 · 미노출 트리거 (감점 요소)" subtitle="키워드 규칙보다 이쪽이 더 중요합니다">
          <div className="scroll-x -mx-4 px-4 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[480px] text-[12px]">
              <thead>
                <tr className="muted bd border-b text-left">
                  <th className="py-2 pr-3 font-semibold">트리거</th>
                  <th className="py-2 font-semibold">내용</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['키워드 반복', '제목·본문 과도 반복(10회 이상 페널티 통설). 등간격 배치도 패턴 신호'],
                  [
                    '유사문서',
                    '문장 단위 중복 판정. 같은 블로그 내 비슷한 키워드·내용 반복, 타 블로그와 겹치는 글, 이미지 재사용',
                  ],
                  [
                    '상업성 과다',
                    '홍보만 있는 글 연속 발행, 상업성 외부 링크 다수, 가격·전화번호 도배 → 이탈률 상승 → 어뷰징 의심',
                  ],
                  ['조작 트래픽', '매크로 공감·댓글·스크랩, 품앗이, 불량 IP'],
                  ['금지 업종·표현', '의료·금융 등 규제 표현, 과장·허위 (아래 위험 표현 표 참고)'],
                  ['대량·복붙 발행', '짧은 시간 다수 발행, 템플릿 복붙 글'],
                ].map(([a, b]) => (
                  <tr key={a} className="bd border-b last:border-0 align-top">
                    <td className="py-2 pr-3 font-semibold whitespace-nowrap">{a}</td>
                    <td className="py-2 leading-relaxed">{b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/8 px-3.5 py-3 text-[12px] leading-relaxed">
            <strong className="font-bold">미노출 자가진단</strong> — 발행한 글 제목을 그대로 검색해서 안
            나오면 검색누락입니다. 여러 글이 동시에 안 나오거나 순위가 일제히 밀리면 블로그 단위 감점을
            의심하세요. 그때는 발행을 늦추고 정보성 글 위주로 회복 운영합니다.
          </div>
        </Card>

        {/* ─── 수치 기준 ─── */}
        <Card
          title="글 유형별 수치 기준"
          subtitle="글 작성 화면의 검수가 이 표를 그대로 검사합니다"
        >
          <div className="scroll-x -mx-4 px-4 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[560px] text-[12px]">
              <thead>
                <tr className="muted bd border-b text-left">
                  <th className="py-2 pr-3 font-semibold">항목</th>
                  <th className="py-2 pr-3 font-semibold">홍보글</th>
                  <th className="py-2 pr-3 font-semibold">정보글</th>
                  <th className="py-2 font-semibold">후기글</th>
                </tr>
              </thead>
              <tbody className="tnum">
                {[
                  [
                    '메인 키워드 횟수',
                    `${SPECS.promo.mainMin}~${SPECS.promo.mainMax}회`,
                    `${SPECS.info.mainMin}~${SPECS.info.mainMax}회`,
                    `${SPECS.review.mainMin}~${SPECS.review.mainMax}회`,
                  ],
                  ['키워드 밀도', `${SPECS.promo.densityMax}% 이내`, `${SPECS.info.densityMax}% 이내`, `${SPECS.review.densityMax}% 이내`],
                  [
                    '본문 글자수',
                    `${SPECS.promo.charMin.toLocaleString()}~${SPECS.promo.charMax.toLocaleString()}자`,
                    `${SPECS.info.charMin.toLocaleString()}~${SPECS.info.charMax.toLocaleString()}자`,
                    `${SPECS.review.charMin.toLocaleString()}~${SPECS.review.charMax.toLocaleString()}자`,
                  ],
                  ['정식 상호명', `${SPECS.promo.legalNameMin}회 이상`, '—', '—'],
                  ['지역 키워드', '메인이 지역', '본문 1~2회 + 태그', '메인이 지역'],
                  ['제목', '28~40자', '28~40자', '28~40자 + "후기" 명시'],
                  ['소제목', '4~5개', '4~5개', '4~5개'],
                  ['이미지', '5~10장', '5~10장', '5~10장'],
                  ['해시태그', '8~12개', '8~12개', '8~12개'],
                  ['외부 링크', '1~2개', '0~1개 권장', '1~2개'],
                ].map((row) => (
                  <tr key={row[0]} className="bd border-b last:border-0">
                    <td className="py-2 pr-3 font-semibold whitespace-nowrap">{row[0]}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{row[1]}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{row[2]}</td>
                    <td className="py-2 whitespace-nowrap">{row[3]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted mt-3 text-[11px] leading-relaxed">
            키워드 선정은 월 검색량 500~5,000 구간이 진입 적정입니다. 이미지는 가로 800~1,200px · 500KB 이내,
            영상은 30초~3분.
          </p>
        </Card>

        {/* ─── 운영 전략 ─── */}
        <Card title="블로그 운영 전략" subtitle="글 단위가 아니라 블로그 단위로 관리해야 합니다">
          <ul className="space-y-3 text-[12px] leading-relaxed">
            <li>
              <strong className="font-bold">정보글 : 홍보글 ≈ 2 : 1</strong> — 홍보글만 연속 발행하면 상업성
              과다 신호가 됩니다. 사이에 정보성 글(운동법·초보 가이드·건강습관)을 끼워 C-Rank를 키우세요.
              정보글이 키운 신뢰도를 홍보글이 수확하는 구조입니다.
            </li>
            <li>
              <strong className="font-bold">같은 메인 키워드 반복 주의</strong> — 같은 지점 글이라도 매번
              같은 지역 키워드만 쓰면 블로그 내 유사문서·자기잠식이 생깁니다. 지점의 지역 키워드 목록을
              로테이션하세요.
            </li>
            <li>
              <strong className="font-bold">동일 지점 글은 2~3주 간격</strong> — 서로 다른 지점 글도 같은 날
              연속 발행보다 하루 이상 간격을 권합니다.
            </li>
            <li>
              <strong className="font-bold">발행 직후 24시간</strong> — 지인 공유 같은 자연 유입은 좋지만
              품앗이·매크로류는 절대 금지입니다(조작 트래픽 판정).
            </li>
            <li>
              <strong className="font-bold">유사성 방지 3축</strong> — 도입 유형 / 주력 앵글 / 문장 표현을 매
              글 다르게 조합합니다. 소제목은 매번 새로 짓고, 필수 메시지도 문장은 새로 씁니다.
            </li>
          </ul>
        </Card>

        {/* ─── 위험 표현 ─── */}
        <Card
          title="위험 표현 치환 가이드"
          subtitle="글 작성 화면에서 자동으로 검사하는 항목입니다. 철자를 바꿔 숨기지 마세요 — 변칙 표기는 그 자체가 어뷰징 신호입니다."
        >
          <div className="space-y-3">
            {['A. 최상급·단정', 'B. 효과 보장', 'C. 의료·치료성', 'E. 절대 금지'].map((cat) => {
              const terms = RISK_TERMS.filter((t) => t.category === cat)
              if (!terms.length) return null
              return (
                <div key={cat} className="bd rounded-lg border p-3.5">
                  <h3 className="text-[13px] font-bold">{cat}</h3>
                  <ul className="mt-2 space-y-2">
                    {terms.map((t, i) => (
                      <li key={i} className="text-[12px] leading-relaxed">
                        <code className="rounded bg-rose-500/12 px-1.5 py-0.5 text-[11px] font-semibold text-rose-700 dark:text-rose-300">
                          {t.pattern.replace(/\\\\s\*/g, ' ').replace(/\\\\s/g, ' ').replace(/\|/g, ' / ')}
                        </code>
                        <span className="muted mt-1 block">→ {t.fix}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}

            <div className="bd rounded-lg border p-3.5">
              <h3 className="text-[13px] font-bold">D. 상업 단어 빈도 (도배 방지)</h3>
              <p className="muted mt-1 text-[12px] leading-relaxed">
                단어 하나하나는 문제가 없지만 반복되면 광고성 문서 신호가 됩니다.
              </p>
              <ul className="mt-2 space-y-1.5">
                {COMMERCIAL_LIMITS.filter((c) => c.note).map((c) => (
                  <li key={c.term} className="text-[12px] leading-relaxed">
                    <strong className="font-semibold">
                      {c.term} — {c.max}회 이내
                    </strong>
                    <span className="muted"> · {c.note}</span>
                  </li>
                ))}
              </ul>
              <p className="muted mt-2.5 text-[12px] leading-relaxed">
                가격 숫자 나열은 쓰지 않습니다. 이벤트 혜택은 조건·기간 중심으로 쓰고 구체 금액은 상담
                안내로 넘기세요. 전화번호는 글 전체에 1회 — CTA 구간에만.
              </p>
            </div>
          </div>
        </Card>

        {/* ─── Claude 스킬 연동 ─── */}
        <Card
          title="Claude 스킬과 함께 쓰기"
          subtitle="이 앱은 검수·관리 도구이고, 글 본문을 실제로 써주는 것은 Claude 스킬입니다"
        >
          <div className="space-y-2.5 text-[12px] leading-relaxed">
            <p>
              이 앱에서 키워드를 고르고 상위노출 분석으로 처방을 받은 다음, Claude에게 아래처럼 요청하면
              스킬이 본문을 써줍니다. 결과를 이 앱의 글 작성 화면에 붙여넣으면 실시간 검수가 돌아갑니다.
            </p>
            <ul className="space-y-2">
              {[
                ['gym-blog-writer', '홍보글', '"쌍용점 홍보글 써줘, 메인 키워드는 쌍용동 24시헬스장, 이벤트는 …"'],
                ['gym-info-writer', '정보글', '"다이어트 정체기 극복 정보글 써줘, 지역 키워드는 성정동 헬스장"'],
                ['gym-review-writer', '후기글', '"용곡점 방문후기 써줘, 내돈내산, 메인 키워드는 용곡동 여성전용"'],
              ].map(([skill, kind, example]) => (
                <li key={skill} className="bd rounded-lg border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="text-[11px] font-bold">{skill}</code>
                    <Badge tone="info">{kind}</Badge>
                  </div>
                  <p className="muted mt-1.5 text-[11px] leading-relaxed">{example}</p>
                </li>
              ))}
            </ul>
            <p>
              발행 관리 화면의 <strong className="font-semibold">발행 기록 복사</strong> 버튼으로 뽑은 한 줄을
              다음 글 요청 때 함께 붙여넣으면, 스킬이 소재·앵글·소제목이 겹치지 않게 잡아줍니다.
            </p>
          </div>
        </Card>

        <p className="muted px-1 text-[11px] leading-relaxed">
          지식 베이스 기준일 {KB_DATE}. ✓ 표시는 네이버 공식 발표, 그 외는 실무 검증 통설입니다. 네이버는
          &quot;저품질 블로그&quot;라는 개념을 공식적으로 부인하지만, 의심 콘텐츠를 자체 시스템에서
          후순위로 걸러냅니다.
        </p>
      </div>
    </>
  )
}
