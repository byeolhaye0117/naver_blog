import fs from 'node:fs'
import path from 'node:path'
import type { DB } from '@/lib/types'
import { SEED_STORES } from './seed/stores'

/**
 * 저장소. 환경에 따라 백엔드가 자동으로 바뀐다.
 *
 * 1) 클라우드 (Upstash Redis REST) — 환경변수가 있으면 무조건 이걸 쓴다.
 *    휴대폰과 PC가 같은 기록을 보려면 이 모드여야 한다. HTTP 로만 통신하므로
 *    서버리스(Vercel)에서 커넥션 풀 문제가 없고, 추가 패키지도 필요 없다.
 * 2) 파일 (data/db.json) — 내 컴퓨터에서 실행할 때.
 * 3) 메모리 — 파일 쓰기까지 막힌 환경의 최후 폴백. 재시작하면 사라진다.
 *
 * DB 전체가 JSON 한 덩어리라서 키-값 저장소 하나로 충분하다.
 */

const KEY = process.env.NAVER_BLOG_KV_KEY?.trim() || 'naver-blog-manager:db'
const DATA_DIR = process.env.NAVER_BLOG_DATA_DIR || path.join(process.cwd(), 'data')
const DB_PATH = path.join(DATA_DIR, 'db.json')

/**
 * 서버리스 환경 감지.
 *
 * Vercel 같은 곳은 요청마다 새 인스턴스가 뜰 수 있어서, 파일 쓰기가 막히는 것은 물론
 * 메모리 폴백조차 다음 요청까지 남지 않는다. 그런데도 저장이 성공한 것처럼 응답하면
 * 사용자는 글을 다 쓰고 저장했는데 새로고침 한 번에 사라지는 일을 겪는다.
 * 그래서 이 환경에서 클라우드 저장소가 없으면 저장을 조용히 넘기지 않고 실패시킨다.
 */
const EPHEMERAL = Boolean(
  process.env.VERCEL ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.NETLIFY ||
    process.env.CF_PAGES
)

const NO_STORE_MESSAGE =
  '저장소가 연결되지 않아 저장할 수 없습니다. 이 환경은 요청마다 서버가 새로 뜨기 때문에 저장한 내용이 남지 않습니다. "휴대폰에서 쓰기 · 배포" 화면 3단계에서 저장소를 연결한 뒤 다시 시도하세요.'

export type StorageMode = 'cloud' | 'file' | 'memory'

/**
 * 클라우드 저장소 자격증명 찾기.
 *
 * 이름이 환경마다 다르다. Vercel 마켓플레이스는 KV_*, Upstash 직접 가입은 UPSTASH_*,
 * 연동할 때 Custom Prefix 를 넣으면 또 다른 이름이 된다. 그래서 아는 이름을 먼저 보고,
 * 없으면 **값을 보고** 찾는다 — REST 엔드포인트는 https://…upstash.io 형태이므로
 * 그 값을 가진 변수를 찾아 같은 접두사의 토큰과 짝지운다.
 */
function cloudConfig(): { url: string; token: string; source: string } | null {
  const known: [string, string][] = [
    ['KV_REST_API_URL', 'KV_REST_API_TOKEN'],
    ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'],
  ]
  for (const [uKey, tKey] of known) {
    const url = process.env[uKey]?.trim()
    const token = process.env[tKey]?.trim()
    if (url && token) return { url: url.replace(/\/+$/, ''), token, source: uKey }
  }

  for (const [key, raw] of Object.entries(process.env)) {
    const url = raw?.trim()
    // rediss:// 커넥션 문자열(REDIS_URL 등)은 REST 엔드포인트가 아니므로 걸러진다
    if (!url || !/^https:\/\/[^/]*upstash\.io/i.test(url)) continue

    const base = key.replace(/_?(REST_API_)?URL$/i, '')
    const candidates = [
      key.replace(/URL$/i, 'TOKEN'),
      `${base}_REST_API_TOKEN`,
      `${base}_TOKEN`,
      `${base}REST_API_TOKEN`,
      `${base}TOKEN`,
    ]
    for (const c of candidates) {
      const token = process.env[c]?.trim()
      if (token) return { url: url.replace(/\/+$/, ''), token, source: key }
    }
  }

  return null
}

export function isCloudConfigured(): boolean {
  return cloudConfig() !== null
}

let memory: DB | null = null
let fileReadOnly = false
let lastError: string | null = null

export function storageStatus(): { mode: StorageMode; error: string | null; detail: string } {
  const cfg = cloudConfig()
  if (cfg) {
    return {
      mode: 'cloud',
      error: lastError,
      // 어떤 환경변수를 집었는지 같이 보여준다 — 연결이 꼬였을 때 원인을 바로 알 수 있다
      detail: `클라우드 저장소 — 휴대폰·PC가 같은 기록을 봅니다. (${cfg.source} 사용)`,
    }
  }
  // 첫 저장을 시도해보기 전에 미리 알려준다. 저장하고 나서 알게 되면 이미 늦다.
  if (EPHEMERAL) {
    return {
      mode: 'memory',
      error: null,
      detail:
        '저장소가 연결되지 않았습니다. 조사·분석·글 작성·발행 패키지는 그대로 쓸 수 있지만, 글과 순위 기록은 저장되지 않습니다 (저장을 시도하면 오류로 알려줍니다). 아래 3단계에서 저장소를 연결하세요.',
    }
  }
  if (fileReadOnly) {
    return {
      mode: 'memory',
      error: lastError,
      detail:
        '메모리 임시 저장 — 파일 쓰기가 막힌 환경입니다. 서버가 재시작되면 기록이 사라지니 클라우드 저장소를 연결하세요.',
    }
  }
  return { mode: 'file', error: lastError, detail: `이 컴퓨터의 ${DB_PATH} 에 저장됩니다.` }
}

function emptyDB(): DB {
  return { stores: SEED_STORES, posts: [], rankTargets: [], rankSnapshots: [], placeRanks: [], prescriptions: [] }
}

function normalize(raw: unknown): DB {
  const base = emptyDB()
  if (!raw || typeof raw !== 'object') return base
  const r = raw as Partial<DB>
  return {
    stores: Array.isArray(r.stores) && r.stores.length ? r.stores : base.stores,
    posts: Array.isArray(r.posts) ? r.posts : [],
    rankTargets: Array.isArray(r.rankTargets) ? r.rankTargets : [],
    rankSnapshots: Array.isArray(r.rankSnapshots) ? r.rankSnapshots : [],
    placeRanks: Array.isArray(r.placeRanks) ? r.placeRanks : [],
    prescriptions: Array.isArray(r.prescriptions) ? r.prescriptions : [],
  }
}

async function redis(cmd: (string | number)[]): Promise<unknown> {
  const cfg = cloudConfig()
  if (!cfg) throw new Error('클라우드 저장소 환경변수가 없습니다.')

  const res = await fetch(cfg.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(cmd),
    cache: 'no-store',
  })

  const text = await res.text()
  if (!res.ok) {
    throw new Error(`클라우드 저장소 오류 (${res.status}). ${text.slice(0, 160)}`)
  }
  const json = JSON.parse(text) as { result?: unknown; error?: string }
  if (json.error) throw new Error(`클라우드 저장소 오류: ${json.error}`)
  return json.result
}

export async function readDB(): Promise<DB> {
  if (isCloudConfigured()) {
    try {
      const raw = await redis(['GET', KEY])
      lastError = null
      if (typeof raw === 'string' && raw.trim()) return normalize(JSON.parse(raw))
      return emptyDB()
    } catch (e) {
      // 읽기 실패는 화면 자체를 못 띄우게 만들지 않는다.
      // 대신 storageStatus() 로 경고를 노출해서 저장이 안 되고 있음을 알린다.
      lastError = e instanceof Error ? e.message : String(e)
      return emptyDB()
    }
  }

  if (memory) return memory
  try {
    memory = normalize(JSON.parse(fs.readFileSync(DB_PATH, 'utf8')))
  } catch {
    memory = emptyDB()
  }
  return memory
}

/** 저장 실패는 조용히 넘기지 않는다 — 호출자가 사용자에게 알려야 한다 */
export async function writeDB(db: DB): Promise<void> {
  if (isCloudConfigured()) {
    await redis(['SET', KEY, JSON.stringify(db)])
    lastError = null
    return
  }

  // 서버리스에서는 메모리도 다음 요청까지 남지 않는다.
  // "저장됨"으로 응답한 뒤 사라지는 것이 오류보다 나쁘므로 여기서 끊는다.
  if (EPHEMERAL) {
    throw new Error(NO_STORE_MESSAGE)
  }

  memory = db
  if (fileReadOnly) return
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8')
  } catch (e) {
    fileReadOnly = true
    lastError = e instanceof Error ? e.message : String(e)
  }
}

/**
 * 읽고-수정하고-쓰기.
 *
 * 단일 JSON 덩어리를 통째로 덮어쓰므로, 두 기기에서 같은 순간에 저장하면
 * 나중 저장이 이깁니다. 한 사람이 쓰는 도구라 이 정도로 둡니다.
 */
export async function mutate<T>(fn: (db: DB) => T): Promise<{ db: DB; result: T }> {
  const db = await readDB()
  const result = fn(db)
  await writeDB(db)
  return { db, result }
}

/** 전체 내보내기 / 가져오기 — 기기 간 이전·백업용 */
export async function exportDB(): Promise<DB> {
  return readDB()
}

/**
 * 가져오기.
 *
 * normalize() 는 읽기용이라 모르는 값이 오면 조용히 빈 DB 로 떨어진다. 그 동작을
 * 가져오기에 그대로 쓰면 엉뚱한 파일을 골랐을 때 기존 기록이 지워지고도 "성공"으로
 * 보인다. 그래서 여기서는 우리 백업 파일 형태인지 먼저 확인하고, 아니면 거부한다.
 */
export async function importDB(raw: unknown): Promise<DB> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('백업 파일 형식이 아닙니다. 이 앱의 "내보내기" 로 받은 JSON 파일을 고르세요.')
  }

  const r = raw as Record<string, unknown>
  const known = ['stores', 'posts', 'rankTargets', 'rankSnapshots', 'placeRanks', 'prescriptions'] as const
  const present = known.filter((k) => Array.isArray(r[k]))
  if (present.length === 0) {
    throw new Error(
      '백업 파일 형식이 아닙니다 (stores·posts·rankTargets·rankSnapshots 가 하나도 없습니다). 이 앱의 "내보내기" 로 받은 JSON 파일을 고르세요.'
    )
  }

  const db = normalize(raw)
  await writeDB(db)
  return db
}

export { newId } from './id'
