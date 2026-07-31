import { NextResponse } from 'next/server'
import { exportDB, importDB, storageStatus } from '@/lib/store'
import { guard } from '@/lib/api'

export const dynamic = 'force-dynamic'

/** 전체 내보내기 — 백업, 그리고 내 컴퓨터 기록을 배포한 앱으로 옮길 때 */
export const GET = guard('내보내기에 실패했습니다.', async () => {
  const db = await exportDB()
  return new NextResponse(JSON.stringify(db, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="naver-blog-backup-${new Date()
        .toISOString()
        .slice(0, 10)}.json"`,
    },
  })
})

/** 가져오기 — 기존 기록을 덮어쓴다 */
export const PUT = guard('가져오기에 실패했습니다.', async (req: Request) => {
  const raw = await req.json()
  const db = await importDB(raw)
  return NextResponse.json({
    ok: true,
    counts: {
      stores: db.stores.length,
      posts: db.posts.length,
      rankTargets: db.rankTargets.length,
      rankSnapshots: db.rankSnapshots.length,
    },
    storage: storageStatus(),
  })
})
