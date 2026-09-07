import { prisma } from "./prisma"

// 操作审计日志：多管理员协作下记录关键管理操作。
// actor 信息从会话冗余快照（id/email），管理员被删除后日志仍可追溯，
// 故不使用外键关联 User。

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
