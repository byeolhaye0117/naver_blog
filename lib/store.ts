import fs from 'node:fs'
import path from 'node:path'
import type { DB } from '@/lib/types'
import { SEED_STORES } from './seed/stores'

/**
 * 파일 기반 저장소. 네이티브 모듈 없이 동작하므로 npm install 이 깨질 일이 없다.
 *
 * 로컬 실행(npm run dev / start)에서는 data/db.json 에 저장된다.
 * Vercel 같은 읽기전용 파일시스템에서는 쓰기가 실패하므로 메모리로 자동 폴백한다
 * (그 환경에서는 서버 인스턴스가 재시작되면 데이터가 사라진다 — README 참고).
 */

const DATA_DIR = process.env.NAVER_BLOG_DATA_DIR || path.join(process.cwd(), 'data')
const DB_PATH = path.join(DATA_DIR, 'db.json')

function emptyDB(): DB {
  return {
    stores: SEED_STORES,
    posts: [],
    rankTargets: [],
    rankSnapshots: [],
  }
}

let memory: DB | null = null
let readOnly = false

function normalize(raw: unknown): DB {
  const base = emptyDB()
  if (!raw || typeof raw !== 'object') return base
  const r = raw as Partial<DB>
  return {
    stores: Array.isArray(r.stores) && r.stores.length ? r.stores : base.stores,
    posts: Array.isArray(r.posts) ? r.posts : [],
    rankTargets: Array.isArray(r.rankTargets) ? r.rankTargets : [],
    rankSnapshots: Array.isArray(r.rankSnapshots) ? r.rankSnapshots : [],
  }
}

export function readDB(): DB {
  if (memory) return memory
  try {
    const text = fs.readFileSync(DB_PATH, 'utf8')
    memory = normalize(JSON.parse(text))
  } catch {
    memory = emptyDB()
  }
  return memory
}

export function writeDB(db: DB): void {
  memory = db
  if (readOnly) return
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8')
  } catch {
    // 읽기전용 환경 — 이후 시도는 건너뛰고 메모리만 사용한다.
    readOnly = true
  }
}

/** 읽고-수정하고-쓰기를 한 번에. 반환값은 갱신된 DB */
export function mutate<T>(fn: (db: DB) => T): { db: DB; result: T } {
  const db = readDB()
  const result = fn(db)
  writeDB(db)
  return { db, result }
}

export function isReadOnlyStorage(): boolean {
  return readOnly
}

export { newId } from './id'
