import { cookies } from "next/headers"
import { prisma } from "./prisma"
import { SESSION_COOKIE_NAME, verifySessionToken } from "./session"
import { hasAdminRole, type AdminRole } from "./roles"

export interface AdminSession {
  userId: string
  role: AdminRole
  email?: string
  /** token 签发时间（Unix 秒），供改密吊销比对 */
  iat?: number
}

/**
 * 读取并校验当前请求的管理员会话。
 *
 * 供 API 路由与 Server Actions 统一使用：仅当会话 token 签名有效、
 * 未过期、角色为任一管理角色（SUPER_ADMIN/ADMIN）且用户在数据库中
 * 仍然存在时返回会话信息。
 * 三层校验：签名验证防伪造，查库确认防数据库重建/删除用户后
 * 旧 token 在有效期内继续生效，改密时间比对保证改密后旧会话立即失效。
 *
 * 角色以数据库为准（token 中的 r 仅作粗筛）：账号被降级后
 * 旧会话立即失效，无需等待 token 过期。
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value
  if (!token) return null
  const session = await verifySessionToken(token)
  if (!session || !hasAdminRole(session.role)) return null

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { role: true, passwordChangedAt: true, email: true },
  })
  if (!user || !hasAdminRole(user.role)) return null

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

  return {
    userId: session.userId,
    // 以数据库中的最新角色为准（token 签发后角色可能已被调整）
    role: user.role as AdminRole,
    email: user.email,
    iat: session.iat,
  }
}
