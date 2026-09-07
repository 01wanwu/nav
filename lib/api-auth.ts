import { cookies } from "next/headers"
import { prisma } from "./prisma"
import { SESSION_COOKIE_NAME, verifySessionToken } from "./session"

export interface AdminSession {
  userId: string
  role: string
}

/**
 * 读取并校验当前请求的管理员会话。
 *
 * 供 API 路由与 Server Actions 统一使用：仅当会话 token 签名有效、
 * 未过期、角色为 ADMIN 且用户在数据库中仍然存在时返回会话信息。
 * 三层校验：签名验证防伪造，查库确认防数据库重建/删除用户后
 * 旧 token 在有效期内继续生效，改密时间比对保证改密后旧会话立即失效。
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value
  if (!token) return null
  const session = await verifySessionToken(token)
  if (!session || session.role !== "ADMIN") return null

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { role: true, passwordChangedAt: true },
  })
  if (!user || user.role !== "ADMIN") return null

  // 改密吊销：token 签发早于最近一次改密即失效。iat 为秒级、changedAt 为毫秒级，
  // 改密时间截断到秒再比较，避免「改密后同一秒内重新登录的新 token 被误杀」；
  // 旧版 token 无签发时间（iat 缺失），无法证明晚于改密，同样拒绝——重新登录一次即可。
  if (
    user.passwordChangedAt &&
    (session.iat === undefined ||
      session.iat < Math.floor(user.passwordChangedAt.getTime() / 1000))
  ) {
    return null
  }

  return session
}
