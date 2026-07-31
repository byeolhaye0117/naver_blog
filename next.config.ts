import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // 스마트폰·태블릿에서 같은 와이파이로 접속해 쓰는 경우가 많아
  // dev 서버 origin 제한을 사설 IP 대역까지 열어둔다.
  allowedDevOrigins: ['192.168.*.*', '172.*.*.*', '10.*.*.*'],
}

export default nextConfig
