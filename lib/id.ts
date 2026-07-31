/** 짧고 충돌 안 나는 ID. node 의존이 없어 클라이언트에서도 쓸 수 있다. */
export function newId(prefix = ''): string {
  const s = Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4)
  return prefix ? `${prefix}_${s}` : s
}
