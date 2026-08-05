/**
 * 「이 상위 글은 돈을 주고 맡긴 글인가」 판단 보조.
 *
 * **왜 조심해야 하나.** 남이 대가를 받았다고 단정하는 것은 사실 주장이다. 틀리면
 * 명예훼손이고, 맞아도 우리가 공개할 일은 아니다. 그래서 이 모듈은 **판정하지 않고
 * 관찰한 것만 돌려준다.** 표현 규칙을 코드로 못 박아 둔다.
 *
 *  1. 본인이 표기한 것 → 사실로 말한다. 「협찬 표기가 있습니다」는 본인 진술이다.
 *  2. 표기가 없고 패턴만 있는 것 → 「…로 보입니다」까지만. **표기가 없다고 대가를 받은
 *     것도, 안 받은 것도 아니다.**
 *  3. 어떤 경우에도 「돈을 받았다」·「대행업체가 썼다」고 쓰지 않는다.
 *
 * **왜 보나 (쓸모).** 상위권이 체험단·대행 글로 채워져 있으면 우리 전략이 달라진다.
 *  - 협찬 후기가 상위를 먹는 판이면, 우리도 후기 글이 통하는 판이다.
 *  - 다만 그 자리는 사람을 섭외해 만든 자리라, 우리 홍보글 한 편으로 뒤집기 어렵다.
 *  - 반대로 업체 본인 글(owner)이 상위에 있으면 우리도 직접 써서 이길 수 있는 판이다.
 *
 * 대가성 표기는 법으로 정해진 의무다(공정위 추천·보증 심사지침). 그래서 표기 문구는
 * 실제로 쓰이는 정형 표현이 있고, 그걸 찾는 것이 가장 확실한 근거다.
 */

/** 대가를 받았다고 **본인이 밝힌** 문구 */
export const PAID_MARKERS = [
  '협찬',
  '원고료',
  '소정의',
  '제공받아',
  '제공 받아',
  '제공받았',
  '무상으로 제공',
  '무료로 제공',
  '대가를 받',
  '대가성',
  '수수료를 지급',
  '유료광고',
  '유료 광고',
  '광고 포함',
  '업체로부터',
  '업체에서 제공',
]

/** 체험단·서포터즈 같은 캠페인으로 쓴 글임을 밝힌 문구 */
export const CAMPAIGN_MARKERS = [
  '체험단',
  '서포터즈',
  '앰배서더',
  '앰버서더',
  '리뷰어',
  '기자단',
  '인플루언서 캠페인',
  '무료 체험',
  '무료체험단',
]

/** 반대 표기 — 본인 돈으로 썼다고 밝힌 문구 */
export const OWN_MONEY_MARKERS = ['내돈내산', '내 돈 내산', '제 돈으로', '직접 결제', '자비로']

export type SponsorLevel =
  /** 본인이 대가성을 밝혔다 (사실) */
  | 'paidDisclosed'
  /** 캠페인(체험단·서포터즈)으로 썼다고 밝혔다 (사실) */
  | 'campaignDisclosed'
  /** 본인 돈으로 썼다고 밝혔다 (사실, 본인 진술) */
  | 'ownMoney'
  /** 아무 표기가 없다 — **아무 뜻도 아니다** */
  | 'noMark'

export interface SponsorScan {
  level: SponsorLevel
  /** 찾은 문구 (본문에 실제로 있던 말) */
  found: string[]
  /** 화면에 그대로 띄우는 한 줄 */
  note: string
}

export const SPONSOR_LABEL: Record<SponsorLevel, string> = {
  paidDisclosed: '대가성 표기 있음',
  campaignDisclosed: '체험단 표기 있음',
  ownMoney: '내돈내산 표기',
  noMark: '표기 없음',
}

/**
 * 글 하나의 본문·제목에서 대가성 표기를 찾는다 (순수 함수 — 테스트 대상).
 *
 * 본문을 이미 읽어둔 곳에서 쓰라고 만들었다 (상위노출 분석은 커트라인을 재려고 이미
 * 상위 글 본문을 읽는다). 그래서 조회가 더 늘지 않는다.
 */
export function scanSponsorship(text: string, title = ''): SponsorScan {
  const hay = `${title} ${text ?? ''}`

  const paid = PAID_MARKERS.filter((m) => hay.includes(m))
  const campaign = CAMPAIGN_MARKERS.filter((m) => hay.includes(m))
  const own = OWN_MONEY_MARKERS.filter((m) => hay.includes(m))

  if (paid.length) {
    return {
      level: 'paidDisclosed',
      found: paid,
      note: `본문에 대가성 표기가 있습니다 (${paid.slice(0, 3).join('·')}) — 글쓴이가 직접 밝힌 내용입니다. 업체가 비용을 들여 만든 자리로 보는 편이 맞습니다.`,
    }
  }
  if (campaign.length) {
    return {
      level: 'campaignDisclosed',
      found: campaign,
      note: `본문에 캠페인 표기가 있습니다 (${campaign.slice(0, 3).join('·')}) — 체험단·서포터즈로 쓴 글이라고 글쓴이가 밝혔습니다.`,
    }
  }
  if (own.length) {
    return {
      level: 'ownMoney',
      found: own,
      note: `본문에 내돈내산 표기가 있습니다 (${own.slice(0, 2).join('·')}) — 글쓴이 본인 진술입니다.`,
    }
  }
  return {
    level: 'noMark',
    found: [],
    /*
     * 여기서 「그러니 대가를 안 받았다」로 읽히면 안 되고, 「그러니 몰래 받았다」로
     * 읽혀도 안 된다. 둘 다 근거 없는 추측이다.
     */
    note: '대가성 표기가 없습니다 — 표기가 없다는 사실만 알 수 있고, 대가를 받았는지 안 받았는지는 알 수 없습니다.',
  }
}

// ─── 블로그 단위 판단 ──────────────────────────────────────────

export type AgencyLevel =
  /** 표기가 있는 글이 실제로 확인됐다 */
  | 'confirmedByMark'
  /** 표기는 못 봤지만 캠페인 블로그 성격이 강하다 */
  | 'campaignLike'
  /** 업체 본인이 직접 운영하는 것으로 보인다 */
  | 'ownerLike'
  /** 판단할 근거가 모자라다 */
  | 'unclear'

export interface AgencySignal {
  label: string
  /** 이 신호가 캠페인(대가성) 쪽을 가리키는지 */
  toward: 'campaign' | 'owner' | 'neutral'
  detail: string
}

export interface AgencyJudgement {
  level: AgencyLevel
  signals: AgencySignal[]
  /** 이 판단이 우리에게 뜻하는 것 */
  meaning: string
  /** 절대 빼지 않는 단서 */
  caveat: string
}

export const AGENCY_LABEL: Record<AgencyLevel, string> = {
  confirmedByMark: '대가성 표기 확인',
  campaignLike: '체험단·대행으로 보임',
  ownerLike: '업체 본인 운영으로 보임',
  unclear: '판단 근거 부족',
}

/**
 * 이 문장은 어떤 경우에도 함께 나간다.
 *
 * 화면에서 이 카드를 보는 사람은 「경쟁사가 돈 썼다」는 결론을 갖고 나가기 쉽다.
 * 그 결론을 밖으로 옮기면(고객에게 말하거나 신고하거나) 우리 쪽 위험이 된다.
 */
export const AGENCY_CAVEAT =
  '표기가 없는 글을 두고 대가를 받았다고 단정할 수 없습니다. 여기 있는 것은 밖에서 볼 수 있는 흔적뿐이고, 사실 확인은 당사자만 할 수 있습니다. 이 판단은 우리 전략을 정하는 데만 쓰고, 남에게 「돈 받은 글」이라고 말하지 마세요.'

/**
 * 블로그 하나가 캠페인 블로그인지 (순수 함수 — 테스트 대상).
 *
 * 근거로 쓰는 것 — 전부 밖에서 관찰되는 값이다.
 *  1. 최근 글에서 대가성·캠페인 표기를 실제로 봤는지 (가장 확실)
 *  2. 여러 업종을 오가며 리뷰하는지 (헬스장·맛집·미용을 같은 달에 쓰면 업체 본인일 수 없다)
 *  3. 발행량이 많은지 (캠페인 블로그는 마감이 있어 꾸준히 많이 쓴다)
 *  4. 우리 업종 글 비중이 낮은지 (업체 본인이면 자기 업종이 대부분이다)
 */
export function judgeAgency(input: {
  /** 최근 글 본문을 훑은 결과 */
  scans: SponsorScan[]
  /** 섞여 있는 업종 수 */
  tradeGroups: number
  /** 가장 큰 업종 비율 (%) */
  topTradeShare: number
  /** 우리 업종 글 비율 (%) */
  gymShare: number
  /** 최근 30일 발행 편수 */
  last30: number
}): AgencyJudgement {
  const signals: AgencySignal[] = []

  const marked = input.scans.filter(
    (s) => s.level === 'paidDisclosed' || s.level === 'campaignDisclosed'
  )
  if (marked.length) {
    signals.push({
      label: '대가성·캠페인 표기',
      toward: 'campaign',
      detail: `최근 글 ${input.scans.length}편 중 ${marked.length}편에 표기가 있습니다 (${Array.from(
        new Set(marked.flatMap((s) => s.found))
      )
        .slice(0, 4)
        .join('·')}).`,
    })
  } else if (input.scans.length) {
    signals.push({
      label: '대가성·캠페인 표기',
      toward: 'neutral',
      detail: `읽어본 ${input.scans.length}편에는 표기가 없었습니다 (읽은 글에 없었다는 뜻일 뿐입니다).`,
    })
  }

  const own = input.scans.filter((s) => s.level === 'ownMoney')
  if (own.length) {
    signals.push({
      label: '내돈내산 표기',
      toward: 'neutral',
      detail: `${own.length}편에 내돈내산 표기가 있습니다 — 본인 진술입니다.`,
    })
  }

  if (input.tradeGroups >= 4) {
    signals.push({
      label: '업종 넘나들기',
      toward: 'campaign',
      detail: `${input.tradeGroups}개 업종 글이 섞여 있습니다 — 한 업체가 쓰는 블로그로 보기 어렵습니다.`,
    })
  } else if (input.gymShare >= 70) {
    signals.push({
      label: '한 업종에 집중',
      toward: 'owner',
      detail: `우리 업종 글이 ${input.gymShare}% 입니다 — 업체 본인이 운영하는 모양입니다.`,
    })
  }

  if (input.last30 >= 20) {
    signals.push({
      label: '발행량',
      toward: 'campaign',
      detail: `최근 30일 ${input.last30}편 — 마감을 두고 쓰는 블로그의 발행량입니다.`,
    })
  } else if (input.last30 <= 4 && input.gymShare >= 50) {
    signals.push({
      label: '발행량',
      toward: 'owner',
      detail: `최근 30일 ${input.last30}편으로 많지 않습니다 — 본업이 따로 있는 쪽에 가깝습니다.`,
    })
  }

  const towardCampaign = signals.filter((s) => s.toward === 'campaign').length
  const towardOwner = signals.filter((s) => s.toward === 'owner').length

  let level: AgencyLevel
  if (marked.length) level = 'confirmedByMark'
  else if (towardCampaign >= 2) level = 'campaignLike'
  else if (towardOwner >= 2 || (towardOwner >= 1 && towardCampaign === 0 && input.gymShare >= 70))
    level = 'ownerLike'
  else level = 'unclear'

  const meaning: Record<AgencyLevel, string> = {
    confirmedByMark:
      '업체가 비용을 들여 만든 자리입니다. 우리 홍보글 한 편으로 뒤집기는 어렵고, 같은 방식(후기 글)이 통하는 판이라는 뜻이기도 합니다 — 우리 회원 후기를 정식으로 부탁하거나, 세부 의도 키워드로 옆자리를 노리세요.',
    campaignLike:
      '체험단·대행으로 쓰이는 블로그로 보입니다. 다만 표기를 못 봤으니 단정할 수는 없습니다. 이 자리를 정면으로 뺏기보다, 이 블로그가 안 쓰는 세부 의도(가격·초보·새벽 같은 것)로 옆자리를 잡는 편이 빠릅니다.',
    ownerLike:
      '업체 본인이 직접 쓰는 블로그로 보입니다. 우리도 직접 써서 이길 수 있는 판이라는 뜻입니다 — 글 품질과 최신성으로 승부가 납니다.',
    unclear:
      '판단할 근거가 모자랍니다. 최근 글을 더 읽어보거나, 그 블로그의 카테고리 구성을 직접 확인해 보세요.',
  }

  return { level, signals, meaning: meaning[level], caveat: AGENCY_CAVEAT }
}
