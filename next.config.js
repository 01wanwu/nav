const path = require('path')
const createNextIntlPlugin = require('next-intl/plugin')
const crypto = require('crypto')

// 会话签名回退密钥：未配置 SESSION_SECRET 时使用。
// 必须在「构建期」随机生成并经 next.config env 内联——Edge middleware 与 Node
// runtime 是两套独立的模块实例，进程内随机会让两边密钥不一致、验签必然失败；
// 而源码内置固定常量则会被任何知晓开源代码的攻击者用来伪造会话（历史严重漏洞）。
// 构建期随机随产物分发（不进源码仓库），镜像重建后需重新登录。
const FALLBACK_SESSION_SECRET = crypto.randomBytes(32).toString('hex')

// JSON 导入大小上限（MB）：/api/data/import 的 MAX_IMPORT_BYTES 与此处的
// middleware 请求体缓冲上限（Next 15 默认 10MB）须保持一致，否则大文件
// 会在传输层被截断、FormData 解析失败。上限口径：MAX_IMPORT_MB + multipart 封装余量
function resolveImportLimitMb() {
  const parsed = parseInt(process.env.MAX_IMPORT_MB || '10', 10)
  if (!Number.isFinite(parsed) || parsed < 1) return 10
  return Math.min(parsed, 500)
}
const IMPORT_LIMIT_MB = resolveImportLimitMb()

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname),
  // 允许预览环境域名跨域访问开发服务器（Next.js 15 使用 allowedDevOrigins）
  allowedDevOrigins: ['*.monkeycode-ai.online'],
  // 双数据库客户端（sqlite / postgres）与其 query engine 二进制需完整进入 standalone 产物
  outputFileTracingIncludes: {
    '/**': ['./generated/**/*'],
  },
  env: {
    FALLBACK_SESSION_SECRET,
  },
  experimental: {
    // middleware 请求体缓冲上限（默认 10MB）：有 middleware 的项目里，
    // 超过该值的请求体只有前 10MB 可用，大文件 multipart 导入会解析失败
    middlewareClientMaxBodySize: `${IMPORT_LIMIT_MB + 2}mb`,
    // 站点详情截图以 base64 随 server action 提交，需放宽默认 1MB 限制。
    // 上限口径：10 张 × 2MB 原始数据，base64 膨胀 4/3 ≈ 26.7MB，再加表单余量取 30mb。
    // 若调低此值，需同步收紧 lib/actions.ts 的 MAX_SCREENSHOTS_PER_SITE / MAX_SCREENSHOT_BYTES，
    // 否则满配上传会在传输层 413 失败、到不了 validateScreenshots 的友好校验提示。
    serverActions: {
      bodySizeLimit: '30mb',
    },
  },
  images: {
    // 站点图标为带查询参数的本地接口，放行以免 Next.js 16 起默认拒绝
    localPatterns: [
      {
        pathname: '/api/icon',
      },
    ],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'http',
        hostname: '**',
      },
    ],
  },
}

const withNextIntl = createNextIntlPlugin()

module.exports = withNextIntl(nextConfig)
