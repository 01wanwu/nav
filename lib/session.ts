// 签名会话（HMAC-SHA256）。
//
// 历史版本将会话以 user_id / user_role 明文 Cookie 存储，middleware 与各 API
// 仅读取 Cookie 值判断权限，任意访客伪造 user_role=ADMIN 即可通过检查。
// 现改为单一签名会话 Cookie：base64url(payload).base64url(signature)，
// 使用 Web Crypto 签名/验签，Edge runtime（middleware）与 Node runtime
// （API 路由 / Server Actions）均可直接使用。

export const SESSION_COOKIE_NAME = "session"

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7 // 7 days

// 旧版明文 Cookie：登录/登出/中间件流转时统一清理，防止脏会话残留
export const LEGACY_COOKIE_NAMES = ["user_id", "user_role"]

// 未配置 SESSION_SECRET 时的回退方案：next.config.js 在构建期随机生成，
// 经 env 内联进 Edge middleware 与 Node runtime 的产物（不进源码仓库）。
// 固定常量写死在源码曾导致会话可被知晓开源代码的攻击者伪造（严重漏洞）；
// 进程内随机会导致两个 runtime 密钥不一致、验签必然失败，均不可行。
// 代价：镜像重建后需重新登录。
let secretWarned = false

function getFallbackSecret(): string {
  return process.env.FALLBACK_SESSION_SECRET || ""
}

function getSessionSecret(): string {
  const configured =
    process.env.SESSION_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim()
  if (configured) return configured

  // 生产运行时 fail-closed：回退密钥经 env 内联进构建产物，公开镜像的下载者
  // 可提取后伪造任意管理员会话。构建期（静态生成）放行，运行时强制显式配置。
  if (
    process.env.NODE_ENV === "production" &&
    process.env.NEXT_PHASE !== "phase-production-build"
  ) {
    throw new Error(
      "[session] 生产环境必须配置 SESSION_SECRET（或 NEXTAUTH_SECRET），" +
        "否则会话可被提取构建产物密钥的攻击者伪造。生成方式：openssl rand -base64 32"
    )
  }

  if (!secretWarned) {
    secretWarned = true
    console.warn(
      "[session] 未配置 SESSION_SECRET（或 NEXTAUTH_SECRET），会话签名使用构建期生成的回退密钥：" +
        "重建镜像/产物后所有用户需重新登录。生产部署请配置 SESSION_SECRET（openssl rand -base64 32）。"
    )
  }
  return getFallbackSecret()
}

interface SessionPayload {
  /** userId */
  u: string
  /** role */
  r: string
  /** 过期时间（Unix 秒） */
  e: number
  /** 签发时间（Unix 秒）：供改密后吊销旧会话比对（旧版 token 无此字段） */
  i?: number
}

export interface SessionInfo {
  userId: string
  role: string
  /** 签发时间（Unix 秒）；旧版 token 无此字段时为 undefined */
  iat?: number
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ""
  bytes.forEach((b) => {
    binary += String.fromCharCode(b)
  })
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 =
    value.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - (value.length % 4)) % 4)
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

async function getHmacKey(): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(getSessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  )
}

/**
 * 生成签名会话 token。
 * payload 携带 userId、role 与过期时间，签名防篡改，过期时间防长期重放。
 */
export async function createSessionToken(
  userId: string,
  role: string
): Promise<string> {
  const payload: SessionPayload = {
    u: userId,
    r: role,
    e: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
    i: Math.floor(Date.now() / 1000),
  }
  const encoder = new TextEncoder()
  const body = bytesToBase64Url(encoder.encode(JSON.stringify(payload)))
  const key = await getHmacKey()
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body))
  return `${body}.${bytesToBase64Url(new Uint8Array(signature))}`
}

/**
 * 校验签名会话 token：签名无效、格式错误、已过期均返回 null。
 */
export async function verifySessionToken(
  token: string | undefined | null
): Promise<SessionInfo | null> {
  if (!token) return null
  const separatorIndex = token.lastIndexOf(".")
  if (separatorIndex <= 0 || separatorIndex === token.length - 1) return null
  const body = token.slice(0, separatorIndex)
  const signature = token.slice(separatorIndex + 1)

  try {
    const encoder = new TextEncoder()
    const key = await getHmacKey()
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlToBytes(signature),
      encoder.encode(body)
    )
    if (!valid) return null

    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(body))
    ) as SessionPayload
    if (
      typeof payload.u !== "string" ||
      typeof payload.r !== "string" ||
      typeof payload.e !== "number"
    ) {
      return null
    }
    if (payload.e < Math.floor(Date.now() / 1000)) return null

    return {
      userId: payload.u,
      role: payload.r,
      iat: typeof payload.i === "number" ? payload.i : undefined,
    }
  } catch {
    return null
  }
}
