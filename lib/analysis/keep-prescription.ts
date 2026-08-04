import type { SerpAnalysis } from '@/lib/types'
import { mutate } from '@/lib/store'
import { prescriptionKey, upsertPrescription } from './prescription'

/**
 * 분석 결과의 처방을 저장한다 (서버 전용 — 저장소를 만진다).
 *
 * 분석은 읽기 동작이라 저장이 실패해도 화면은 정상이어야 한다. 그래서 실패를 삼킨다 —
 * 처방이 안 남으면 글 쓸 때 자동으로 안 채워질 뿐, 분석 결과 자체는 그대로 보인다.
 */
export async function keepPrescription(analysis: SerpAnalysis): Promise<void> {
  if (!analysis.prescription.length || analysis.mock) return
  try {
    await mutate((d) => {
      d.prescriptions = upsertPrescription(d.prescriptions, {
        key: prescriptionKey(analysis.keyword),
        keyword: analysis.keyword,
        items: analysis.prescription,
        date: new Date().toISOString().slice(0, 10),
        sampled: analysis.items.length,
      })
    })
  } catch {
    /* 저장 실패는 분석을 막지 않는다 */
  }
}
