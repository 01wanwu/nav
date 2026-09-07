import { prisma } from "./prisma"

// 操作审计日志：多管理员协作下记录关键管理操作。
// actor 信息从会话冗余快照（id/email），管理员被删除后日志仍可追溯，
// 故不使用外键关联 User。

// 保留策略：审计日志仅保留 90 天，过期条目在写入/查询时惰性清理。
// 审计的定位是「近期操作可追溯」，不是永久存档；需要长期留存请自行导出归档。
export const AUDIT_LOG_RETENTION_DAYS = 90

export type AuditActionType = "CREATE" | "UPDATE" | "DELETE" | "LOGIN"

interface AuditLogInput {
  actorId: string
  actorEmail: string
  action: AuditActionType
  entityType: string
  entityId?: string
  detail?: string
}

/**
 * 写入一条审计日志。记录失败不抛出——审计是旁路能力，
 * 不能因日志写失败阻塞正常业务操作（只打错误日志便于排查）。
 */
export async function recordAuditLog(input: AuditLogInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: input.actorId,
        actorEmail: input.actorEmail,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        detail: input.detail ?? null,
      },
    })
  } catch (error) {
    console.error("[audit] Failed to record audit log:", error)
  }
}

// 过期清理节流：每个进程每小时最多执行一次 deleteMany。
// 多实例部署下各实例各自节流即可——deleteMany 幂等，多删几次无害；
// 模块级时间戳在进程重启后归零，漏删的部分由下一次触发补上（最终一致）。
let lastPrunedAt = 0
const PRUNE_INTERVAL_MS = 60 * 60 * 1000

/**
 * 清理超过保留期的审计日志。节流 + 静默失败：清理不是关键路径，
 * 失败只打日志，绝不影响写入或查询。
 */
export async function maybePruneAuditLogs(): Promise<void> {
  const now = Date.now()
  if (now - lastPrunedAt < PRUNE_INTERVAL_MS) return
  lastPrunedAt = now
  try {
    const cutoff = new Date(now - AUDIT_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000)
    const result = await prisma.auditLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    })
    if (result.count > 0) {
      console.log(
        `[audit] Pruned ${result.count} audit log entries older than ${AUDIT_LOG_RETENTION_DAYS} days`
      )
    }
  } catch (error) {
    console.error("[audit] Failed to prune audit logs:", error)
  }
}
