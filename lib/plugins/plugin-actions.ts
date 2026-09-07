"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { getAdminSession } from "@/lib/api-auth"
import { recordAuditLog } from "@/lib/audit-log"
import { pluginRegistry } from "./registry"
import { validatePluginManifest } from "./manifest-schema"
import { resolveConfig } from "./runtime"
import type { PluginConfigField, PluginManifest } from "./types"

// 管理动作：插件启停、配置、上传、删除。
// getAdminSession 已含双层校验（签名 + 查库确认角色），不再重复查库
async function requireAdmin(): Promise<{ success: false; error: string } | null> {
  if (!(await getAdminSession())) {
    return { success: false, error: "Unauthorized" }
  }
  return null
}

// 插件管理操作的审计旁路：身份取当前会话，记录失败不阻塞业务
async function auditPluginAction(
  action: "CREATE" | "UPDATE" | "DELETE",
  pluginId: string,
  detail: string
): Promise<void> {
  const actor = await getAdminSession()
  if (!actor) return
  await recordAuditLog({
    actorId: actor.userId,
    actorEmail: actor.email || "",
    action,
    entityType: "plugin",
    entityId: pluginId,
    detail,
  })
}

function parseStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((v): v is string => typeof v === "string")
}

async function ensureSettings() {
  let settings = await prisma.systemSettings.findFirst()
  if (!settings) {
    settings = await prisma.systemSettings.create({
      data: {
        id: "default",
        footerCopyright: `© ${new Date().getFullYear()} Conan Nav. All rights reserved.`,
      },
    })
  }
  return settings
}

// ==================== 启停 ====================

export async function setPluginEnabled(id: string, enabled: boolean) {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized

  try {
    const builtin = pluginRegistry.find((p) => p.id === id)
    if (builtin) {
      const settings = await ensureSettings()
      const current = parseStringArray(settings.enabledPlugins)
      const next = enabled
        ? Array.from(new Set([...current, id]))
        : current.filter((x) => x !== id)
      await prisma.systemSettings.update({
        where: { id: settings.id },
        data: { enabledPlugins: next },
      })
    } else {
      await prisma.plugin.update({ where: { id }, data: { enabled } })
    }

    revalidatePath("/", "layout")
    revalidatePath("/about")
    revalidatePath("/admin/plugins")
    await auditPluginAction(
      "UPDATE",
      id,
      `${enabled ? "启用" : "停用"}插件 ${id}`
    )
    return { success: true }
  } catch (error) {
    console.error("Error setting plugin enabled:", error)
    return { success: false, error: "Failed to update plugin state" }
  }
}

// ==================== 配置 ====================

function sanitizeConfig(
  fields: PluginConfigField[],
  patch: Record<string, unknown>
): Record<string, number | string | boolean> {
  const typed: Record<string, number | string | boolean> = {}
  for (const field of fields) {
    const raw = patch[field.key]
    if (raw === undefined) continue
    if (field.type === "number" && typeof raw === "number" && Number.isFinite(raw)) {
      typed[field.key] = raw
    } else if (field.type === "boolean" && typeof raw === "boolean") {
      typed[field.key] = raw
    } else if (field.type === "string" && typeof raw === "string") {
      typed[field.key] = raw
    }
  }
  return resolveConfig(fields, typed)
}

export async function updatePluginConfig(
  id: string,
  patch: Record<string, number | string | boolean>
) {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized

  try {
    const builtin = pluginRegistry.find((p) => p.id === id)
    if (builtin) {
      const settings = await ensureSettings()
      const map = (settings.pluginConfigs ?? {}) as Record<
        string,
        Record<string, number | string | boolean>
      >
      const next = {
        ...map,
        [id]: { ...(map[id] || {}), ...sanitizeConfig(builtin.configFields, patch) },
      }
      await prisma.systemSettings.update({
        where: { id: settings.id },
        data: { pluginConfigs: next },
      })
    } else {
      const row = await prisma.plugin.findUnique({ where: { id } })
      if (!row) return { success: false, error: "Plugin not found" }
      const manifest = row.manifest as unknown as PluginManifest
      const map = (row.configs ?? {}) as Record<string, number | string | boolean>
      await prisma.plugin.update({
        where: { id },
        data: {
          configs: { ...map, ...sanitizeConfig(manifest.configFields || [], patch) },
        },
      })
    }

    revalidatePath("/admin/plugins")
    revalidatePath("/", "layout")
    await auditPluginAction("UPDATE", id, `更新插件 ${id} 的配置`)
    return { success: true }
  } catch (error) {
    console.error("Error updating plugin config:", error)
    return { success: false, error: "Failed to update plugin config" }
  }
}

// ==================== 上传 / 删除 ====================

export async function uploadPluginManifest(raw: string) {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized

  const result = validatePluginManifest(raw)
  if (!result.ok) {
    return { success: false, error: result.errors.join("; ") }
  }

  try {
    const exists = await prisma.plugin.findUnique({ where: { id: result.manifest.id } })
    if (exists) {
      return { success: false, error: `Plugin id "${result.manifest.id}" already exists` }
    }

    await prisma.plugin.create({
      data: {
        id: result.manifest.id,
        manifest: result.manifest,
        enabled: false,
        configs: {},
      },
    })

    revalidatePath("/admin/plugins")
    revalidatePath("/", "layout")
    await auditPluginAction(
      "CREATE",
      result.manifest.id,
      `上传插件 ${result.manifest.id}（${result.manifest.name}）`
    )
    return { success: true, data: { id: result.manifest.id } }
  } catch (error) {
    console.error("Error uploading plugin manifest:", error)
    return { success: false, error: "Failed to save plugin" }
  }
}
export async function deleteUploadedPlugin(id: string) {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized

  if (pluginRegistry.some((p) => p.id === id)) {
    return { success: false, error: "Builtin plugins cannot be deleted" }
  }

  try {
    await prisma.plugin.delete({ where: { id } })
  } catch {
    return { success: false, error: "Plugin not found" }
  }

  revalidatePath("/admin/plugins")
  revalidatePath("/", "layout")
  await auditPluginAction("DELETE", id, `删除插件 ${id}`)
  return { success: true }
}
