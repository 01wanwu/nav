"use server"

import { prisma, Prisma, ciContains } from "./prisma"
import { revalidatePath } from "next/cache"
import bcrypt from "bcryptjs"
import { isLocale, type Locale } from "./i18n"
import { getSystemSettingsRecord } from "./settings"
import { z } from "zod"

// 分页参数钳制：客户端可传任意值——pageSize=1e9 会全表拉取、负 page 产生负 skip
// 直接抛 Prisma 错误。非法输入回退默认值，越界输入钳到安全范围。
function clampPagination(page?: number, pageSize?: number, defaultPageSize = 10) {
  const toInt = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : fallback
  return {
    page: Math.max(1, toInt(page, 1)),
    pageSize: Math.min(100, Math.max(1, toInt(pageSize, defaultPageSize))),
  }
}
import { getAdminSession } from "./api-auth"
import { verifyDomainHost } from "./domain-verify"
import { isPluginEnabled, firePluginWebhook } from "./plugins/runtime"
import {
  getCurrentWorkspace,
  getAdminWorkspace,
  normalizeHost,
  isValidWorkspaceSlug,
} from "./workspace"
import type { WorkspaceItem } from "./prisma"
// 动态渲染信号错误判定已收敛到 lib/next-errors.ts（含 NEXT_DYNAMIC_NO_SSR_CODE）
import { isNextDynamicError } from "@/lib/next-errors"

// ==================== 安全辅助 ====================

// 管理操作统一鉴权闸门：会话无效返回统一错误结果。
// Server Actions 可被客户端直接构造调用，每个写操作/敏感读操作
// 必须自行校验，不能依赖页面层拦截。
// getAdminSession 已含双层校验：签名验证（防伪造）+ 查库确认用户仍存在且为 ADMIN
// （防数据库重建/删除用户后旧 token 在有效期内继续生效），此处不再重复查库。
async function requireAdmin(): Promise<{ success: false; error: string } | null> {
  if (!(await getAdminSession())) {
    return { success: false, error: "Unauthorized" }
  }
  return null
}

// 站点 URL 协议白名单：仅允许 http/https，
// 防止导入/提交 javascript: 等协议 URL 造成存储型 XSS
function isSafeSiteUrl(url: unknown): boolean {
  if (typeof url !== "string" || url.trim().length === 0) return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === "http:" || parsed.protocol === "https:"
  } catch {
    return false
  }
}

// 取当前工作区下的分类 id 集合。Site 经 Category 归属工作区，
// 用「先取分类 ids 再 categoryId in」策略在真实库与内存模式下行为一致
async function getWorkspaceCategoryIds(workspaceId: string): Promise<string[]> {
  const cats = await prisma.category.findMany({
    where: { workspaceId },
    select: { id: true },
  })
  return cats.map((c: { id: string }) => c.id)
}

// ==================== Workspaces ====================

export async function getWorkspaces() {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized
  try {
    // 按创建顺序展示（工作区无业务排序概念）
    const workspaces = await prisma.workspace.findMany({
      orderBy: { createdAt: 'asc' },
      include: { domains: true },
    })
    return { success: true, data: workspaces as WorkspaceItem[] }
  } catch (error) {
    if (isNextDynamicError(error)) throw error
    console.error("Error fetching workspaces:", error)
    return { success: false, error: "Failed to fetch workspaces" }
  }
}

// 后台顶栏切换器数据源：仅必要字段
export async function getWorkspaceOptions() {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized
  try {
    const workspaces = await prisma.workspace.findMany({
      orderBy: { createdAt: 'asc' },
    })
    return {
      success: true,
      data: workspaces.map((w: WorkspaceItem) => ({
        id: w.id,
        name: w.name,
        slug: w.slug,
        isDefault: w.isDefault,
        isPublished: w.isPublished,
      })),
    }
  } catch (error) {
    if (isNextDynamicError(error)) throw error
    console.error("Error fetching workspace options:", error)
    return { success: false, error: "Failed to fetch workspace options" }
  }
}

// 当前后台选中的工作区（供页面展示上下文）
export async function getCurrentAdminWorkspace() {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized
  const workspace = await getAdminWorkspace()
  return { success: true, data: workspace }
}

// 系统设置页「基本信息」区块数据源：按当前工作区上下文返回展示配置。
// 默认工作区 → 全局 SystemSettings；非默认 → 工作区覆盖值（null 表示未覆盖，回退全局）
export async function getWorkspaceDisplaySettings() {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized
  try {
    const workspace = await getAdminWorkspace()
    const settings = await getSystemSettingsRecord()

    if (workspace.isDefault) {
      return {
        success: true,
        data: {
          workspace: { id: workspace.id, name: workspace.name, isDefault: true },
          display: {
            siteName: settings?.siteName ?? "",
            siteDescription: settings?.siteDescription ?? "",
            siteLogo: settings?.siteLogo ?? "",
            favicon: settings?.favicon ?? "",
            aboutContent: settings?.aboutContent ?? "",
          },
        },
      }
    }

    return {
      success: true,
      data: {
        workspace: { id: workspace.id, name: workspace.name, isDefault: false },
        display: {
          siteName: workspace.siteName ?? "",
          siteDescription: workspace.siteDescription ?? "",
          siteLogo: workspace.siteLogo ?? "",
          favicon: workspace.favicon ?? "",
          aboutContent: workspace.aboutContent ?? "",
        },
      },
    }
  } catch (error) {
    if (isNextDynamicError(error)) throw error
    console.error("Error fetching workspace display settings:", error)
    return { success: false, error: "Failed to fetch display settings" }
  }
}

// 系统设置页「基本信息」保存：默认工作区写 SystemSettings；
// 非默认工作区写覆盖字段（空串归一为 null，表示回退全局）
export async function updateWorkspaceDisplaySettings(data: {
  siteName: string
  siteDescription: string
  siteLogo: string
  favicon: string
  aboutContent?: string
}) {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized
  try {
    const workspace = await getAdminWorkspace()

    if (workspace.isDefault) {
      return await updateSystemSettings({
        siteName: data.siteName,
        siteDescription: data.siteDescription,
        siteLogo: data.siteLogo || undefined,
        favicon: data.favicon || undefined,
        aboutContent: data.aboutContent,
      })
    }

    const updated = await prisma.workspace.update({
      where: { id: workspace.id },
      data: {
        siteName: data.siteName.trim() || null,
        siteDescription: data.siteDescription.trim() || null,
        siteLogo: data.siteLogo.trim() || null,
        favicon: data.favicon.trim() || null,
        aboutContent: data.aboutContent?.trim() || null,
      },
    })
    revalidatePath("/", "layout")
    revalidatePath("/about")
    revalidatePath("/admin/workspaces")
    return { success: true, data: updated }
  } catch (error) {
    if (isNextDynamicError(error)) throw error
    console.error("Error updating workspace display settings:", error)
    return { success: false, error: "Failed to update display settings" }
  }
}

export async function createWorkspace(data: {
  name: string
  slug: string
  description?: string | null
  siteName?: string | null
  siteDescription?: string | null
  siteLogo?: string | null
  favicon?: string | null
  isPublished?: boolean
  order?: number
}) {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized
  try {
    const name = data.name?.trim()
    if (!name) return { success: false, error: "WORKSPACE_NAME_REQUIRED" }
    if (!isValidWorkspaceSlug(data.slug)) {
      return { success: false, error: "WORKSPACE_SLUG_INVALID" }
    }
    const existing = await prisma.workspace.findUnique({
      where: { slug: data.slug },
    })
    if (existing) {
      return { success: false, error: "WORKSPACE_SLUG_TAKEN" }
    }

    const workspace = await prisma.workspace.create({
      data: {
        name,
        slug: data.slug,
        description: data.description?.trim() || null,
        siteName: data.siteName?.trim() || null,
        siteDescription: data.siteDescription?.trim() || null,
        siteLogo: data.siteLogo?.trim() || null,
        favicon: data.favicon?.trim() || null,
        // 新建工作区默认未发布，由管理员显式发布
        isPublished: data.isPublished ?? false,
        order: data.order ?? 0,
      },
    })
    revalidatePath("/", "layout")
    revalidatePath("/admin/workspaces")
    return { success: true, data: workspace }
  } catch (error) {
    if (isNextDynamicError(error)) throw error
    console.error("Error creating workspace:", error)
    return { success: false, error: "Failed to create workspace" }
  }
}

export async function updateWorkspace(id: string, data: {
  name?: string
  slug?: string
  description?: string | null
  siteName?: string | null
  siteDescription?: string | null
  siteLogo?: string | null
  favicon?: string | null
  isPublished?: boolean
  order?: number
}) {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized
  try {
    if (data.name !== undefined && !data.name.trim()) {
      return { success: false, error: "WORKSPACE_NAME_REQUIRED" }
    }
    if (data.slug !== undefined) {
      if (!isValidWorkspaceSlug(data.slug)) {
        return { success: false, error: "WORKSPACE_SLUG_INVALID" }
      }
      const existing = await prisma.workspace.findUnique({
        where: { slug: data.slug },
      })
      if (existing && existing.id !== id) {
        return { success: false, error: "WORKSPACE_SLUG_TAKEN" }
      }
    }

    const updateData: Record<string, unknown> = {}
    if (data.name !== undefined) updateData.name = data.name.trim()
    if (data.slug !== undefined) updateData.slug = data.slug
    if (data.description !== undefined) updateData.description = data.description?.trim() || null
    if (data.siteName !== undefined) updateData.siteName = data.siteName?.trim() || null
    if (data.siteDescription !== undefined) updateData.siteDescription = data.siteDescription?.trim() || null
    if (data.siteLogo !== undefined) updateData.siteLogo = data.siteLogo?.trim() || null
    if (data.favicon !== undefined) updateData.favicon = data.favicon?.trim() || null
    if (data.isPublished !== undefined) updateData.isPublished = data.isPublished
    if (data.order !== undefined) updateData.order = data.order

    const workspace = await prisma.workspace.update({
      where: { id },
      data: updateData,
    })
    revalidatePath("/", "layout")
    revalidatePath("/admin/workspaces")
    return { success: true, data: workspace }
  } catch (error) {
    if (isNextDynamicError(error)) throw error
    console.error("Error updating workspace:", error)
    return { success: false, error: "Failed to update workspace" }
  }
}

export async function deleteWorkspace(id: string) {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized
  try {
    const workspace = await prisma.workspace.findUnique({ where: { id } })
    if (!workspace) return { success: false, error: "Workspace not found" }
    if (workspace.isDefault) {
      return { success: false, error: "WORKSPACE_DEFAULT_UNDELETABLE" }
    }
    const categoryCount = await prisma.category.count({
      where: { workspaceId: id },
    })
    if (categoryCount > 0) {
      return { success: false, error: "WORKSPACE_HAS_CATEGORIES" }
    }

    // 事务化：清域名与删工作区同成败，第二步失败不再留下「域名已丢、工作区仍在」
    await prisma.$transaction(async (tx) => {
      await tx.domain.deleteMany({ where: { workspaceId: id } })
      await tx.workspace.delete({ where: { id } })
    })
    revalidatePath("/", "layout")
    revalidatePath("/admin/workspaces")
    return { success: true }
  } catch (error) {
    if (isNextDynamicError(error)) throw error
    console.error("Error deleting workspace:", error)
    return { success: false, error: "Failed to delete workspace" }
  }
}

// 设为默认工作区：事务内先清全部默认标记再设置目标，保证唯一默认
export async function setPrimaryWorkspace(id: string) {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized
  try {
    const workspace = await prisma.workspace.findUnique({ where: { id } })
    if (!workspace) return { success: false, error: "Workspace not found" }

    await prisma.$transaction(async (tx: any) => {
      // 单条 updateMany 原子清除其他默认标记：先读后改的写法在并发下
      // 可能都读到旧快照，最终留下两个 isDefault=true
      await tx.workspace.updateMany({
        where: { isDefault: true, id: { not: id } },
        data: { isDefault: false },
      })
      await tx.workspace.update({
        where: { id },
        data: { isDefault: true, isPublished: true },
      })
    })
    revalidatePath("/", "layout")
    revalidatePath("/admin/workspaces")
    return { success: true }
  } catch (error) {
    if (isNextDynamicError(error)) throw error
    console.error("Error setting primary workspace:", error)
    return { success: false, error: "Failed to set primary workspace" }
  }
}

export async function addWorkspaceDomain(workspaceId: string, rawHost: string) {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized
  try {
    const host = normalizeHost(rawHost)
    if (!host) {
      return { success: false, error: "DOMAIN_INVALID" }
    }
    const existing = await prisma.domain.findUnique({ where: { host } })
    if (existing) {
      if (existing.workspaceId === workspaceId) {
        return { success: false, error: "DOMAIN_ALREADY_BOUND" }
      }
      const owner = await prisma.workspace.findUnique({
        where: { id: existing.workspaceId },
      })
      return {
        success: false,
        error: "DOMAIN_BOUND_TO_OTHER_WORKSPACE",
        data: { workspace: owner?.name || existing.workspaceId },
      }
    }

    // 目标工作区必须存在：内存模式无外键约束，否则会创建指向不存在工作区的孤儿域名
    const targetWorkspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true },
    })
    if (!targetWorkspace) {
      return { success: false, error: "WORKSPACE_NOT_FOUND" }
    }

    const domain = await prisma.domain.create({
      data: { host, workspaceId },
    })
    revalidatePath("/", "layout")
    revalidatePath("/admin/workspaces")
    return { success: true, data: domain }
  } catch (error) {
    if (isNextDynamicError(error)) throw error
    console.error("Error adding workspace domain:", error)
    return { success: false, error: "Failed to add domain" }
  }
}

export async function removeWorkspaceDomain(domainId: string) {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized
  try {
    await prisma.domain.delete({ where: { id: domainId } })
    revalidatePath("/", "layout")
    revalidatePath("/admin/workspaces")
    return { success: true }
  } catch (error) {
    if (isNextDynamicError(error)) throw error
    console.error("Error removing workspace domain:", error)
    return { success: false, error: "Failed to remove domain" }
  }
}

// 域名反向探测：以服务端身份访问绑定的域名，比对页面工作区标记，
// 结果持久化到 Domain 供管理页常驻展示（三态：ok / fallback / unreachable）
export async function verifyWorkspaceDomain(domainId: string) {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized
  try {
    const domain = await prisma.domain.findUnique({ where: { id: domainId } })
    if (!domain) {
      return { success: false, error: "DOMAIN_NOT_FOUND" }
    }
    const workspace = await prisma.workspace.findUnique({
      where: { id: domain.workspaceId },
    })
    if (!workspace) {
      return { success: false, error: "WORKSPACE_NOT_FOUND" }
    }

    const result = await verifyDomainHost(domain.host, workspace.slug)
    const verifiedAt = new Date()
    await prisma.domain.update({
      where: { id: domainId },
      data: {
        lastVerifiedStatus: result.status,
        lastVerifiedAt: verifiedAt,
      },
    })
    revalidatePath("/admin/workspaces")
    return {
      success: true,
      data: { status: result.status, detail: result.detail, verifiedAt },
    }
  } catch (error) {
    if (isNextDynamicError(error)) throw error
    console.error("Error verifying workspace domain:", error)
    return { success: false, error: "Failed to verify domain" }
  }
}

// ==================== Categories ====================

export async function getCategories() {
  try {
    // 前台按当前请求的工作区（域名/预览参数解析）过滤
    const workspace = await getCurrentWorkspace()
    const categories = await prisma.category.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { order: 'asc' },
      // 显式投影：此结果直接序列化进首页 RSC payload，
      // 必须排除 detailContent 等大字段（详情弹窗按需经 getSiteDetail 拉取）
      select: {
        id: true,
        name: true,
        slug: true,
        icon: true,
        order: true,
        sites: {
          where: { isPublished: true },
          orderBy: [{ isPinned: 'desc' }, { order: 'asc' }],
          select: {
            id: true,
            name: true,
            url: true,
            description: true,
            iconUrl: true,
            categoryId: true,
            isPinned: true,
            isPublished: true,
            hasDetail: true,
            order: true,
            category: { select: { name: true } },
          },
        },
      },
    })
    return { success: true, data: categories }
  } catch (error) {
    if (isNextDynamicError(error)) throw error
    console.error("Error fetching categories:", error)
    return { success: false, error: "Failed to fetch categories" }
  }
}

export async function getCategoryBySlug(slug: string) {
  try {
    // slug 唯一性收敛到工作区内：同一 slug 可在不同工作区各自存在
    const workspace = await getCurrentWorkspace()
    const category = await prisma.category.findFirst({
      where: { slug, workspaceId: workspace.id },
      // 显式投影：与 getCategories 同口径，避免 detailContent 进入列表 payload
      select: {
        id: true,
        name: true,
        slug: true,
        icon: true,
        order: true,
        sites: {
          where: { isPublished: true },
          orderBy: [{ isPinned: 'desc' }, { order: 'asc' }],
          select: {
            id: true,
            name: true,
            url: true,
            description: true,
            iconUrl: true,
            categoryId: true,
            isPinned: true,
            isPublished: true,
            hasDetail: true,
            order: true,
            category: { select: { name: true } },
          },
        },
      },
    })
    if (!category) {
      return { success: false, error: "Category not found" }
    }
    return { success: true, data: category }
  } catch (error) {
    if (isNextDynamicError(error)) throw error
    console.error("Error fetching category:", error)
    return { success: false, error: "Failed to fetch category" }
  }
}

export async function getAllCategories() {
  try {
    const workspace = await getCurrentWorkspace()
    const categories = await prisma.category.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { order: 'asc' },
      // 仅顶栏/筛选所需的导航字段
      select: { id: true, name: true, slug: true, icon: true },
    })
    return { success: true, data: categories }
  } catch (error) {
    if (isNextDynamicError(error)) throw error
    console.error("Error fetching all categories:", error)
    return { success: false, error: "Failed to fetch categories" }
  }
}

// 后台专用：当前选中工作区的全部分类（网址编辑表单等）
export async function getAdminCategories() {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized
  try {
    const workspace = await getAdminWorkspace()
    const categories = await prisma.category.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { order: 'asc' },
    })
    return { success: true, data: categories }
  } catch (error) {
    if (isNextDynamicError(error)) throw error
    console.error("Error fetching admin categories:", error)
    return { success: false, error: "Failed to fetch categories" }
  }
}

export async function getCategoriesWithPagination(params: {
  page?: number
  pageSize?: number
  search?: string
}) {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized
  try {
    const { page, pageSize } = clampPagination(params.page, params.pageSize)
    const skip = (page - 1) * pageSize

    // 后台按当前选中的工作区上下文过滤
    const workspace = await getAdminWorkspace()
    const where: Prisma.CategoryWhereInput = { workspaceId: workspace.id }

    if (params.search) {
      where.OR = [
        { name: ciContains(params.search) },
        { slug: ciContains(params.search) },
      ]
    }

    const [categories, total] = await Promise.all([
      prisma.category.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { order: 'asc' },
        include: {
          _count: {
            select: { sites: true },
          },
        },
      }),
      prisma.category.count({ where }),
    ])

    return {
      success: true,
      data: categories,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    }
  } catch (error) {
    if (isNextDynamicError(error)) throw error
    console.error("Error fetching categories with pagination:", error)
    return { success: false, error: "Failed to fetch categories" }
  }
}

export async function getCategoryById(id: string) {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized
  try {
    const category = await prisma.category.findUnique({
      where: { id },
    })
    if (!category) {
      return { success: false, error: "Category not found" }
    }
    return { success: true, data: category }
  } catch (error) {
    if (isNextDynamicError(error)) throw error
    console.error("Error fetching category:", error)
    return { success: false, error: "Failed to fetch category" }
  }
}

export async function createCategory(data: {
  name: string
  slug: string
  icon?: string | null
  order?: number
}) {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized
  try {
    // slug 唯一性收敛到工作区内（内存模式无数据库约束，显式查重）
    const workspace = await getAdminWorkspace()
    const duplicate = await prisma.category.findFirst({
      where: { slug: data.slug, workspaceId: workspace.id },
    })
    if (duplicate) {
      return { success: false, error: "CATEGORY_SLUG_TAKEN" }
    }
    const category = await prisma.category.create({
      data: {
        name: data.name,
        slug: data.slug,
        icon: data.icon || null,
        order: data.order ?? 0,
        workspaceId: workspace.id,
      },
    })
    revalidatePath("/admin/categories")
    revalidatePath("/")
    return { success: true, data: category }
  } catch (error) {
    if (isNextDynamicError(error)) throw error
    console.error("Error creating category:", error)
    return { success: false, error: "Failed to create category" }
  }
}

export async function updateCategory(id: string, data: {
  name?: string
  slug?: string
  icon?: string | null
  order?: number
}) {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized
  try {
    if (!(await isCategoryInCurrentWorkspace(id))) {
      return { success: false, error: "CATEGORY_NOT_IN_WORKSPACE" }
    }
    if (data.slug !== undefined) {
      // 工作区内 slug 查重（排除自身）
      const workspace = await getAdminWorkspace()
      const duplicate = await prisma.category.findFirst({
        where: { slug: data.slug, workspaceId: workspace.id },
      })
      if (duplicate && duplicate.id !== id) {
        return { success: false, error: "CATEGORY_SLUG_TAKEN" }
      }
    }
    // 字段白名单拷贝：Server Action 入参类型注解运行时不存在，
    // 直接透传客户端对象会让 workspaceId 等字段穿透（跨工作区越权移动数据）
    const existing = await prisma.category.findUnique({ where: { id } })
    const updateData: {
      name?: string
      slug?: string
      icon?: string | null
      order?: number
    } = {}
    if (data.name !== undefined) updateData.name = data.name
    if (data.slug !== undefined) updateData.slug = data.slug
    if (data.icon !== undefined) updateData.icon = data.icon
    if (data.order !== undefined) updateData.order = data.order
    const category = await prisma.category.update({
      where: { id },
      data: updateData,
    })
    revalidatePath("/admin/categories")
    revalidatePath("/")
    // slug 变更时旧路径也要失效，避免旧 URL 持续返回旧内容
    if (existing && existing.slug !== category.slug) {
      revalidatePath(`/category/${existing.slug}`)
    }
    revalidatePath(`/category/${category.slug}`)
    return { success: true, data: category }
  } catch (error) {
    if (isNextDynamicError(error)) throw error
    console.error("Error updating category:", error)
    return { success: false, error: "Failed to update category" }
  }
}

export async function updateCategoriesOrder(items: { id: string; order: number }[]) {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized
  try {
    // 仅更新当前工作区的分类；事务化避免中途失败留下半新半旧的排序号
    const workspace = await getAdminWorkspace()
    const workspaceCategoryIds = new Set(await getWorkspaceCategoryIds(workspace.id))
    const validItems = items.filter(item => workspaceCategoryIds.has(item.id))
    await prisma.$transaction(async (tx) => {
      for (const item of validItems) {
        await tx.category.update({
          where: { id: item.id },
          data: { order: item.order },
        })
      }
    })
    revalidatePath("/admin/categories")
    revalidatePath("/")
    return { success: true }
  } catch (error) {
    if (isNextDynamicError(error)) throw error
    console.error("Error updating categories order:", error)
    return { success: false, error: "Failed to update categories order" }
  }
}

// 读取分类下站点的当前显示顺序（与前台/后台默认排序同口径：置顶优先 + order + id）
export async function getCategorySiteOrder(categoryId: string) {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized
  try {
    if (!(await isCategoryInCurrentWorkspace(categoryId))) {
      return { success: false, error: "CATEGORY_NOT_IN_WORKSPACE" }
    }
    const sites = await prisma.site.findMany({
      where: { categoryId },
      orderBy: [{ isPinned: "desc" }, { order: "asc" }, { id: "asc" }],
      select: { id: true, isPinned: true },
    })
    return { success: true, data: sites }
  } catch (error) {
    if (isNextDynamicError(error)) throw error
    console.error("Error fetching category site order:", error)
    return { success: false, error: "Failed to fetch category site order" }
  }
}

// 保存分类下站点的显示顺序：入参为该分类完整的站点 id 序列，
// 整体重编号 1..N（存量数据 order 全为默认 0 时也能得到确定顺序）；
// 入参未覆盖的站点按原顺序追加到末尾，防拖拽期间新增/删除造成丢项
export async function updateSitesOrder(categoryId: string, orderedIds: string[]) {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized
  try {
    if (!(await isCategoryInCurrentWorkspace(categoryId))) {
      return { success: false, error: "CATEGORY_NOT_IN_WORKSPACE" }
    }
    const sites = await prisma.site.findMany({
      where: { categoryId },
      select: { id: true },
      orderBy: [{ isPinned: "desc" }, { order: "asc" }, { id: "asc" }],
    })
    const siteIdSet = new Set(sites.map(s => s.id))
    const seen = new Set<string>()
    const validOrdered = orderedIds.filter(id => {
      if (!siteIdSet.has(id) || seen.has(id)) return false
      seen.add(id)
      return true
    })
    const missing = sites.map(s => s.id).filter(id => !seen.has(id))
    const finalOrder = [...validOrdered, ...missing]
    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < finalOrder.length; i++) {
        await tx.site.update({
          where: { id: finalOrder[i] },
          data: { order: i + 1 },
        })
      }
    })
    revalidatePath("/admin/sites")
    revalidatePath("/")
    return { success: true }
  } catch (error) {
    if (isNextDynamicError(error)) throw error
    console.error("Error updating sites order:", error)
    return { success: false, error: "Failed to update sites order" }
  }
}

export async function deleteCategory(id: string) {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized
  try {
    if (!(await isCategoryInCurrentWorkspace(id))) {
      return { success: false, error: "CATEGORY_NOT_IN_WORKSPACE" }
    }
    // 级联删除会连带销毁分类下全部站点与访问记录，显式预检阻断而非静默清空。
    // 预检与删除必须在同一事务：分离写在并发下存在「预检时无站点、删除瞬间
    // 新站点恰好创建并被级联清掉」的窗口
    const result = await prisma.$transaction(async (tx) => {
      const siteCount = await tx.site.count({ where: { categoryId: id } })
      if (siteCount > 0) {
        return { blocked: true as const, siteCount }
      }
      await tx.category.delete({ where: { id } })
      return { blocked: false as const, siteCount: 0 }
    })
    if (result.blocked) {
      return {
        success: false,
        error: "CATEGORY_HAS_SITES",
        data: { count: result.siteCount },
      }
    }
    revalidatePath("/admin/categories")
    revalidatePath("/")
    return { success: true }
  } catch (error) {
    if (isNextDynamicError(error)) throw error
    console.error("Error deleting category:", error)
    return { success: false, error: "Failed to delete category" }
  }
}

// ==================== Sites ====================

export async function getSites() {
  try {
    // 仅返回已发布站点：此 Action 可被客户端直接调用，
    // 按当前请求的工作区过滤（Site 经 Category 归属工作区）
    const workspace = await getCurrentWorkspace()
    const categoryIds = await getWorkspaceCategoryIds(workspace.id)
    const sites = await prisma.site.findMany({
      where: { isPublished: true, categoryId: { in: categoryIds } },
      orderBy: [{ isPinned: 'desc' }, { order: 'asc' }],
      // 显式投影：仅搜索/卡片所需字段，排除 detailContent 等大字段
      select: {
        id: true,
        name: true,
        url: true,
        description: true,
        iconUrl: true,
        categoryId: true,
        isPublished: true,
        isPinned: true,
        hasDetail: true,
        order: true,
        category: { select: { name: true } },
      },
    })
    return { success: true, data: sites }
  } catch (error) {
    if (isNextDynamicError(error)) throw error
    console.error("Error fetching sites:", error)
    return { success: false, error: "Failed to fetch sites" }
  }
}

export async function getSitesWithPagination(params: {
  page?: number
  pageSize?: number
  categoryId?: string
  search?: string
  isPublished?: boolean
  // site-submission 插件：按来源筛选（"true"=仅投稿，"false"=仅管理员创建）
  submitterIp?: string
  sortBy?: "default" | "health" | "createdAt"
  sortDir?: "asc" | "desc"
}) {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized
  try {
    const { page, pageSize } = clampPagination(params.page, params.pageSize)
    const skip = (page - 1) * pageSize

    // 后台按当前选中工作区过滤；显式传入的分类筛选与工作区取交集，
    // 防止跨工作区数据操作
    const workspace = await getAdminWorkspace()
    const workspaceCategoryIds = await getWorkspaceCategoryIds(workspace.id)
    const where: Prisma.SiteWhereInput = {
      categoryId: { in: workspaceCategoryIds },
    }

    if (params.categoryId) {
      if (!workspaceCategoryIds.includes(params.categoryId)) {
        return {
          success: true,
          data: [],
          pagination: { page, pageSize, total: 0, totalPages: 0 },
        }
      }
      where.categoryId = params.categoryId
    }

    if (params.search) {
      where.OR = [
        { name: ciContains(params.search) },
        { description: ciContains(params.search) },
        { url: ciContains(params.search) },
      ]
    }

    if (params.isPublished !== undefined) {
      where.isPublished = params.isPublished
    }

    // site-submission 插件：来源筛选（投稿记录带 submitterIp，管理员创建为空）
    if (params.submitterIp === "true") {
      where.submitterIp = { not: null }
    } else if (params.submitterIp === "false") {
      where.submitterIp = null
    }

    // 排序规则：默认置顶优先 + 手动 order；
    // health 利用字符串序 down < suspicious < unknown < up，asc 即「测活异常优先」；
    // createdAt 用于快速定位新收录条目；非默认排序为纯排序，不再叠加置顶优先
    const sortDir = params.sortDir === "asc" || params.sortDir === "desc" ? params.sortDir : undefined
    let orderBy: Prisma.SiteOrderByWithRelationInput[]
    switch (params.sortBy) {
      case "health":
        orderBy = [{ healthStatus: sortDir || "asc" }, { order: "asc" }]
        break
      case "createdAt":
        orderBy = [{ createdAt: sortDir || "desc" }, { name: "asc" }]
        break
      default:
        orderBy = [{ isPinned: 'desc' }, { order: 'asc' }]
    }

    const [sites, total] = await Promise.all([
      prisma.site.findMany({
        where,
        skip,
        take: pageSize,
        orderBy,
        include: {
          category: true,
          // 编辑回填用：仅元数据，不含 base64 data 字段
          screenshots: {
            orderBy: { order: 'asc' },
            select: { id: true, source: true, url: true, mimeType: true, order: true },
          },
        },
      }),
      prisma.site.count({ where }),
    ])

    return {
      success: true,
      data: sites,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    }
  } catch (error) {
    if (isNextDynamicError(error)) throw error
    console.error("Error fetching sites with pagination:", error)
    return { success: false, error: "Failed to fetch sites" }
  }
}

export async function getCategoriesForFilter() {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized
  try {
    const workspace = await getAdminWorkspace()
    const categories = await prisma.category.findMany({
      where: { workspaceId: workspace.id },
      orderBy: [{ order: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
      },
    })

    return { success: true, data: categories }
  } catch (error) {
    if (isNextDynamicError(error)) throw error
    console.error("Error fetching categories:", error)
    return { success: false, error: "Failed to fetch categories" }
  }
}

export async function getSiteById(id: string) {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized
  try {
    const site = await prisma.site.findUnique({
      where: { id },
      include: {
        category: true,
      },
    })
    if (!site) {
      return { success: false, error: "Site not found" }
    }
    return { success: true, data: site }
  } catch (error) {
    if (isNextDynamicError(error)) throw error
    console.error("Error fetching site:", error)
    return { success: false, error: "Failed to fetch site" }
  }
}

// ==================== Site Detail ====================

const MAX_SCREENSHOTS_PER_SITE = 10
const MAX_SCREENSHOT_BYTES = 2 * 1024 * 1024
const ALLOWED_SCREENSHOT_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']

export interface ScreenshotInput {
  source: 'URL' | 'UPLOAD'
  // 已有截图保留标识：更新时命中站点现有截图则原样保留（不删除重建），
  // 未命中（不属于该站点或已不存在）则整体忽略该条目
  keepId?: string
  url?: string
  data?: string
  mimeType?: string
  order?: number
}

// 校验截图入参：数量、类型、大小、字段完整性
function validateScreenshots(screenshots: ScreenshotInput[]): string | null {
  if (screenshots.length > MAX_SCREENSHOTS_PER_SITE) {
    return `Screenshots exceed the limit of ${MAX_SCREENSHOTS_PER_SITE}`
  }
  for (const shot of screenshots) {
    // 保留型条目不携带 url/data，仅校验标识存在；未命中的条目由 updateSite 事务内丢弃
    if (shot.keepId !== undefined) {
      if (typeof shot.keepId !== 'string' || !shot.keepId) {
        return 'Kept screenshot requires a valid id'
      }
      continue
    }
    if (shot.source === 'URL') {
      if (!shot.url || typeof shot.url !== 'string') {
        return 'URL screenshot requires a valid url'
      }
      try {
        const parsed = new URL(shot.url)
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          return 'Screenshot url must use http or https'
        }
      } catch {
        return 'Screenshot url is invalid'
      }
    } else if (shot.source === 'UPLOAD') {
      if (!shot.data || typeof shot.data !== 'string') {
        return 'Uploaded screenshot requires base64 data'
      }
      if (!shot.mimeType || !ALLOWED_SCREENSHOT_MIME_TYPES.includes(shot.mimeType)) {
        return 'Screenshot mime type is not allowed'
      }
      const approxBytes = Math.floor((shot.data.length * 3) / 4)
      if (approxBytes > MAX_SCREENSHOT_BYTES) {
        return 'Screenshot exceeds the 2MB size limit'
      }
    } else {
      return 'Invalid screenshot source'
    }
  }
  return null
}

// 规范化详情内容：空白文本视为无内容
function normalizeDetailContent(content?: string | null): string | null {
  if (content === undefined || content === null) return null
  const trimmed = content.trim()
  return trimmed.length > 0 ? trimmed : null
}

// 计算冗余标志：详情文本或截图任一存在即为 true
function computeHasDetail(detailContent: string | null, screenshotCount: number): boolean {
  return detailContent !== null || screenshotCount > 0
}

// 单条截图入库行构造：order 由调用方显式传入（提交列表的全局下标），
// 避免「保留旧图 + 新增新图」混排时保留项与新增项各自编号导致 order 错位
function buildScreenshotRow(siteId: string, shot: ScreenshotInput, order: number) {
  return {
    siteId,
    source: shot.source,
    url: shot.source === 'URL' ? shot.url! : null,
    data: shot.source === 'UPLOAD' ? shot.data! : null,
    mimeType: shot.source === 'UPLOAD' ? shot.mimeType! : null,
    order,
  }
}

// 替换式重写站点截图记录（事务内调用）：入参必须是已剔除 keepId 的纯新增列表
function buildScreenshotCreateMany(siteId: string, screenshots: ScreenshotInput[]) {
  return screenshots.map((shot, index) => buildScreenshotRow(siteId, shot, index))
}

// 后台写操作的工作区归属校验：目标必须属于当前选中的工作区。
// 与 getSitesWithPagination 的交集防护对齐，防止客户端构造调用跨工作区改/删数据
async function isCategoryInCurrentWorkspace(categoryId: string): Promise<boolean> {
  const workspace = await getAdminWorkspace()
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { workspaceId: true },
  })
  return Boolean(category && category.workspaceId === workspace.id)
}

async function isSiteInCurrentWorkspace(siteId: string): Promise<boolean> {
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: { categoryId: true },
  })
  if (!site) return false
  return isCategoryInCurrentWorkspace(site.categoryId)
}

// 获取站点详情（弹窗渲染与管理编辑回填共用）
// 仅返回截图元数据与展示地址，不返回 base64 大字段
export async function getSiteDetail(siteId: string) {
  try {
    // 「禁用即收权」在数据源头收口：本函数位于 "use server" 文件，
    // 是公开可调用的 RPC 端点，仅在 API 路由层检查插件开关防不住直连调用
    if (!(await isPluginEnabled("site-detail"))) {
      return { success: false, error: "Site not found" }
    }
    // 工作区隔离：detailContent 只对站点所属工作区可见，
    // 与 searchSites/getSites 的公开读取口径一致
    if (!(await isSiteInCurrentWorkspace(siteId))) {
      return { success: false, error: "Site not found" }
    }
    const site = await prisma.site.findUnique({
      where: { id: siteId },
      select: {
        id: true,
        name: true,
        url: true,
        description: true,
        iconUrl: true,
        isPublished: true,
        detailContent: true,
        hasDetail: true,
        category: {
          select: { name: true, slug: true },
        },
        screenshots: {
          orderBy: { order: 'asc' },
          select: { id: true, source: true, url: true, order: true },
        },
      },
    })
    if (!site) {
      return { success: false, error: "Site not found" }
    }
    // 未发布站点：仅管理员可见（管理预览），公开访问与前台弹窗口径一致返回不存在
    if (!site.isPublished && !(await getAdminSession())) {
      return { success: false, error: "Site not found" }
    }
    const data = {
      ...site,
      screenshots: site.screenshots.map(shot => ({
        id: shot.id,
        source: shot.source,
        order: shot.order,
        displayUrl: shot.source === 'URL' ? shot.url! : `/api/screenshots/${shot.id}`,
      })),
    }
    return { success: true, data }
  } catch (error) {
    if (isNextDynamicError(error)) throw error
    console.error("Error fetching site detail:", error)
    return { success: false, error: "Failed to fetch site detail" }
  }
}

// 截图上传能力检测：对 SystemSettings 执行一次同值写探测（不产生数据变化）
// 结果内存缓存 60 秒，避免频繁探测
let capabilityCache: { supported: boolean; checkedAt: number; reason?: string } | null = null

export async function checkScreenshotUploadCapability() {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized
  const now = Date.now()
  if (capabilityCache && now - capabilityCache.checkedAt < 60_000) {
    return { success: true, data: capabilityCache }
  }
  try {
    const probe = await prisma.$transaction(async (tx) => {
      // 确保设置记录存在
      const settings = await tx.systemSettings.upsert({
        where: { id: 'default' },
        update: {},
        create: {
          id: 'default',
          footerCopyright: `© ${new Date().getFullYear()} Conan Nav. All rights reserved.`,
        },
      })
      // 同值写入：验证写权限且不改变任何数据
      await tx.systemSettings.update({
        where: { id: settings.id },
        data: { siteName: settings.siteName },
      })
      return true
    }, { timeout: 10_000 })
    capabilityCache = { supported: probe, checkedAt: now }
    return { success: true, data: capabilityCache }
  } catch (error) {
    if (isNextDynamicError(error)) throw error
    console.warn("Screenshot upload capability check failed:", error)
    capabilityCache = {
      supported: false,
      checkedAt: now,
      reason: "Database is not writable",
    }
    return { success: true, data: capabilityCache }
  }
}

export async function createSite(data: {
  name: string
  url: string
  description: string
  iconUrl?: string
  categoryId: string
  isPublished?: boolean
  isPinned?: boolean
  order?: number
  detailContent?: string | null
  screenshots?: ScreenshotInput[]
}) {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized
  try {
    // URL 协议白名单校验，防止 javascript: 等协议入库
    if (!isSafeSiteUrl(data.url)) {
      return { success: false, error: "SITE_URL_INVALID_PROTOCOL" }
    }
    const detailContent = normalizeDetailContent(data.detailContent)
    // 新建场景不存在「已有截图」，带 keepId 的条目（无 url/data）一律剔除，
    // 防止恶意构造的 keepId 绕过校验后落库为 NULL 字段脏行
    const screenshots = (data.screenshots ?? []).filter((shot) => !shot.keepId)
    const validationError = validateScreenshots(screenshots)
    if (validationError) {
      return { success: false, error: validationError }
    }
    const hasDetail = computeHasDetail(detailContent, screenshots.length)

    // 归属校验：目标分类必须属于当前选中的工作区
    if (!(await isCategoryInCurrentWorkspace(data.categoryId))) {
      return { success: false, error: "TARGET_CATEGORY_NOT_IN_WORKSPACE" }
    }

    const site = await prisma.$transaction(async (tx) => {
      const created = await tx.site.create({
        data: {
          name: data.name,
          url: data.url,
          description: data.description,
          iconUrl: data.iconUrl,
          categoryId: data.categoryId,
          isPublished: data.isPublished ?? false,
          isPinned: data.isPinned ?? false,
          order: data.order ?? 0,
          detailContent,
          hasDetail,
        },
        include: {
          category: true,
        },
      })
      if (screenshots.length > 0) {
        await tx.screenshot.createMany({
          data: buildScreenshotCreateMany(created.id, screenshots),
        })
      }
      return created
    })

    revalidatePath("/admin/sites")
    revalidatePath("/")
    revalidatePath(`/category/${site.category?.slug || ''}`)

    // 事件总线：以发布状态创建时通知订阅插件
    if (site.isPublished) {
      await firePluginWebhook("sitePublished", {
        siteId: site.id,
        name: site.name,
        url: site.url,
        description: site.description,
      })
    }

    return { success: true, data: site }
  } catch (error) {
    if (isNextDynamicError(error)) throw error
    console.error("Error creating site:", error)
    return { success: false, error: "Failed to create site" }
  }
}

export async function updateSite(id: string, data: {
  name?: string
  url?: string
  description?: string
  iconUrl?: string
  categoryId?: string
  isPublished?: boolean
  isPinned?: boolean
  order?: number
  detailContent?: string | null
  screenshots?: ScreenshotInput[]
}) {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized
  try {
    // 归属校验：站点及其目标分类（如迁移）都必须属于当前选中的工作区
    if (!(await isSiteInCurrentWorkspace(id))) {
      return { success: false, error: "SITE_NOT_IN_WORKSPACE" }
    }
    if (data.categoryId !== undefined && !(await isCategoryInCurrentWorkspace(data.categoryId))) {
      return { success: false, error: "TARGET_CATEGORY_NOT_IN_WORKSPACE" }
    }
    if (data.url !== undefined && !isSafeSiteUrl(data.url)) {
      return { success: false, error: "SITE_URL_INVALID_PROTOCOL" }
    }
    let detailContent: string | null | undefined = undefined
    if (data.detailContent !== undefined) {
      detailContent = normalizeDetailContent(data.detailContent)
    }
    const screenshotsProvided = data.screenshots !== undefined
    const screenshots = data.screenshots ?? []
    const validationError = validateScreenshots(screenshots)
    if (validationError) {
      return { success: false, error: validationError }
    }

    // 发布状态初值在事务内读取：与最终 update 同一快照，
    // 并发 toggle 时不会基于过期状态漏发/双发 webhook
    let publishedBefore: boolean | null = null
    // 迁移分类时记录旧分类 slug：更新后新旧分类页缓存都要失效
    let oldCategorySlug: string | null = null

    const site = await prisma.$transaction(async (tx) => {
      if (data.isPublished !== undefined) {
        publishedBefore = (await tx.site.findUnique({ where: { id }, select: { isPublished: true } }))?.isPublished ?? null
      }
      if (data.categoryId !== undefined) {
        const oldSite = await tx.site.findUnique({
          where: { id },
          select: { category: { select: { slug: true } } },
        })
        oldCategorySlug = oldSite?.category?.slug ?? null
      }
      const updateData: Prisma.SiteUpdateInput = {}
      if (data.name !== undefined) updateData.name = data.name
      if (data.url !== undefined) updateData.url = data.url
      if (data.description !== undefined) updateData.description = data.description
      if (data.iconUrl !== undefined) updateData.iconUrl = data.iconUrl
      if (data.categoryId !== undefined) updateData.category = { connect: { id: data.categoryId } }
      if (data.isPublished !== undefined) updateData.isPublished = data.isPublished
      if (data.isPinned !== undefined) updateData.isPinned = data.isPinned
      if (data.order !== undefined) updateData.order = data.order

      // 详情相关：合并现值与新值后统一计算 hasDetail
      // - 仅传 detailContent → 截图数取现值
      // - 仅传 screenshots  → 详情文本取现值
      // - 都传或都不传之外的情况按需补查
      // 截图增量 diff 先于 site.update 执行：hasDetail 需要用 diff 后的真实截图数
      //（未命中的 keepId 条目会被丢弃，不能按提交列表长度计数）
      let finalShotCount = 0
      if (screenshotsProvided) {
        // 增量 diff：keepId 命中站点现有截图的原样保留（含上传截图的二进制数据），
        // 其余删除；带 keepId 但未命中的条目直接丢弃（可能是并发已被删除的旧图，
        // 或恶意伪造的跨站点引用——它们没有 url/data，绝不能落入新建路径产生 NULL 脏行）
        const existingShots = await tx.screenshot.findMany({
          where: { siteId: id },
          select: { id: true },
        })
        const existingIdSet = new Set(existingShots.map((shot) => shot.id))
        const keptIdSet = new Set(
          screenshots
            .map((shot) => shot.keepId)
            .filter((keepId): keepId is string => typeof keepId === 'string' && existingIdSet.has(keepId))
        )
        const deleteIds = existingShots.filter((shot) => !keptIdSet.has(shot.id)).map((shot) => shot.id)
        if (deleteIds.length > 0) {
          await tx.screenshot.deleteMany({ where: { id: { in: deleteIds } } })
        }
        // 新增条目使用提交列表的全局下标作为 order，与保留项的排序同步口径一致
        const newShotEntries = screenshots
          .map((shot, index) => ({ shot, index }))
          .filter(({ shot }) => !shot.keepId)
        if (newShotEntries.length > 0) {
          await tx.screenshot.createMany({
            data: newShotEntries.map(({ shot, index }) => buildScreenshotRow(id, shot, index)),
          })
        }
        // 保留截图按提交顺序同步排序，保证前端重排结果落库
        const keptOrderUpdates = screenshots
          .map((shot, index) => ({ keepId: shot.keepId, index }))
          .filter((entry): entry is { keepId: string; index: number } =>
            typeof entry.keepId === 'string' && keptIdSet.has(entry.keepId)
          )
        for (const entry of keptOrderUpdates) {
          await tx.screenshot.update({ where: { id: entry.keepId }, data: { order: entry.index } })
        }
        finalShotCount = keptIdSet.size + newShotEntries.length
      }

      if (detailContent !== undefined || screenshotsProvided) {
        const [currentContent, currentShotCount] = await Promise.all([
          detailContent === undefined
            ? tx.site.findUnique({ where: { id }, select: { detailContent: true } })
            : null,
          !screenshotsProvided
            ? tx.screenshot.count({ where: { siteId: id } })
            : null,
        ])
        const effectiveContent = detailContent !== undefined
          ? detailContent
          : normalizeDetailContent(currentContent?.detailContent)
        const effectiveShotCount = screenshotsProvided ? finalShotCount : (currentShotCount ?? 0)
        if (detailContent !== undefined) updateData.detailContent = detailContent
        updateData.hasDetail = computeHasDetail(effectiveContent, effectiveShotCount)
      }

      const updated = await tx.site.update({
        where: { id },
        data: updateData,
        include: { category: true },
      })

      return updated
    })

    revalidatePath("/admin/sites")
    revalidatePath("/")
    // 分类迁移时新旧两个分类页都要失效（与 updateCategory 的 slug 变更口径一致）
    if (oldCategorySlug && oldCategorySlug !== site.category?.slug) {
      revalidatePath(`/category/${oldCategorySlug}`)
    }
    revalidatePath(`/category/${site.category?.slug || ''}`)

    // 事件总线：发布状态变化时通知订阅插件（false→true 发布 / true→false 下架）
    if (publishedBefore !== null && site.isPublished !== publishedBefore) {
      await firePluginWebhook(site.isPublished ? "sitePublished" : "siteUnpublished", {
        siteId: site.id,
        name: site.name,
        url: site.url,
        description: site.description,
      })
    }

    return { success: true, data: site }
  } catch (error) {
    if (isNextDynamicError(error)) throw error
    console.error("Error updating site:", error)
    return { success: false, error: "Failed to update site" }
  }
}

export async function toggleSitePin(id: string) {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized
  try {
    if (!(await isSiteInCurrentWorkspace(id))) {
      return { success: false, error: "SITE_NOT_IN_WORKSPACE" }
    }
    const existing = await prisma.site.findUnique({ where: { id } })
    if (!existing) return { success: false, error: "Site not found" }
    const updated = await prisma.site.update({
      where: { id },
      data: { isPinned: !existing.isPinned },
      include: { category: true },
    })
    revalidatePath("/admin/sites")
    revalidatePath("/")
    revalidatePath(`/category/${updated.category?.slug || ''}`)
    return { success: true, data: updated }
  } catch (error) {
    if (isNextDynamicError(error)) throw error
    console.error("Error toggling site pin:", error)
    return { success: false, error: "Failed to toggle pin" }
  }
}

export async function deleteSite(id: string) {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized
  try {
    if (!(await isSiteInCurrentWorkspace(id))) {
      return { success: false, error: "SITE_NOT_IN_WORKSPACE" }
    }
    const site = await prisma.site.delete({
      where: { id },
      include: {
        category: true,
      },
    })
    revalidatePath("/admin/sites")
    revalidatePath("/")
    revalidatePath(`/category/${site.category?.slug || ''}`)

    // 事件总线：删除站点时通知订阅插件
    await firePluginWebhook("siteDeleted", {
      siteId: site.id,
      name: site.name,
      url: site.url,
      description: site.description,
    })

    return { success: true }
  } catch (error) {
    if (isNextDynamicError(error)) throw error
    console.error("Error deleting site:", error)
    return { success: false, error: "Failed to delete site" }
  }
}

export async function toggleSitePublish(id: string) {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized
  try {
    if (!(await isSiteInCurrentWorkspace(id))) {
      return { success: false, error: "SITE_NOT_IN_WORKSPACE" }
    }
    const currentSite = await prisma.site.findUnique({
      where: { id },
      select: { isPublished: true },
    })

    if (!currentSite) {
      return { success: false, error: "Site not found" }
    }

    const site = await prisma.site.update({
      where: { id },
      data: { isPublished: !currentSite.isPublished },
      include: {
        category: true,
      },
    })
    revalidatePath("/admin/sites")
    revalidatePath("/")
    revalidatePath(`/category/${site.category?.slug || ''}`)

    // 事件总线：发布状态翻转时通知订阅插件
    await firePluginWebhook(site.isPublished ? "sitePublished" : "siteUnpublished", {
      siteId: site.id,
      name: site.name,
      url: site.url,
      description: site.description,
    })

    return { success: true, data: site }
  } catch (error) {
    if (isNextDynamicError(error)) throw error
    console.error("Error toggling site publish status:", error)
    return { success: false, error: "Failed to toggle site publish status" }
  }
}

// ==================== 站点测活（健康检测） ====================

// 探测超时（毫秒）：兼顾死链判定准确性与单次 Action 执行时长（兼容 Serverless 超时）
const HEALTH_CHECK_TIMEOUT_MS = 10_000

// 三态取值：unknown 未检测 / up 在线 / suspicious 疑似受限（防护拦截）/ down 失效

// 多数站点拒绝默认 Node fetch UA，伪装成浏览器访问以降低误判
const HEALTH_CHECK_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"

interface ProbeResult {
  status: number | null
  latencyMs: number
  server: string | null
}

// 探测被拦时常见的响应状态码：认证拦截/防护拦截/限流/JS 挑战页。
// 这些响应本身证明站点存活，不应判为失效。
const SUSPICIOUS_STATUS_CODES = [401, 403, 429, 503]

// 常见 CDN/WAF 的 Server 响应头特征（参考 OneNav 的判定）：
// 命中时即使状态码异常也判为“疑似受限”而非失效。
const PROTECTED_SERVER_SIGNATURES = [
  "cloudflare",
  "waf",
  "akamaighost",
  "jdcloudstarshield",
  "aliyunoss",
  "yunjiasu",
]

// 特殊哨兵值：响应头超过 undici 默认 16KB 上限（UND_ERR_HEADERS_OVERFLOW）。
// Google 等服务的 Set-Cookie 数量巨大导致 fetch 抛错，但收到响应头本身证明站点存活。
const HEADERS_OVERFLOW_STATUS = -1

// 三态取值：unknown 未检测 / up 在线 / suspicious 疑似受限（防护拦截）/ down 失效。
// down 仅限：网络层失败（DNS/超时/拒连）或未被防护特征解释的 4xx/5xx。
function classifyProbe(probe: ProbeResult): "up" | "suspicious" | "down" {
  if (probe.status === HEADERS_OVERFLOW_STATUS) return "suspicious"
  if (probe.status === null) return "down"
  if (probe.status < 400) return "up"
  const server = probe.server?.toLowerCase() ?? ""
  if (PROTECTED_SERVER_SIGNATURES.some((sig) => server.includes(sig))) {
    return "suspicious"
  }
  if (SUSPICIOUS_STATUS_CODES.includes(probe.status)) return "suspicious"
  return "down"
}

// 对单个 URL 发起探测：优先 HEAD，被拒（403/405/501，部分站点不接受 HEAD）时回退 GET。
// 仅允许 http/https 协议（复用 isSafeSiteUrl 白名单），网络错误/超时视为无响应。
async function probeUrl(url: string): Promise<ProbeResult> {
  if (!isSafeSiteUrl(url)) {
    return { status: null, latencyMs: 0, server: null }
  }

  const startedAt = Date.now()

  const doFetch = async (method: "HEAD" | "GET") => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS)
    try {
      const res = await fetch(url, {
        method,
        redirect: "follow",
        signal: controller.signal,
        headers: { "User-Agent": HEALTH_CHECK_USER_AGENT },
      })
      return {
        status: res.status,
        latencyMs: Date.now() - startedAt,
        server: res.headers.get("server"),
      }
    } finally {
      clearTimeout(timer)
    }
  }

  try {
    const head = await doFetch("HEAD")
    // 403：部分站点拒绝 HEAD（真正的防护拦截会在 GET 时再次命中，多一次请求无副作用）；
    // 405/501：不支持 HEAD，回退 GET 再判定
    if (head.status === 403 || head.status === 405 || head.status === 501) {
      return await doFetch("GET")
    }
    return head
  } catch (error) {
    if (isNextDynamicError(error)) throw error
    // undici 默认响应头上限 16KB，Google 等服务 Set-Cookie 数量巨大会触发
    // UND_ERR_HEADERS_OVERFLOW；能收到响应头说明站点活着，判疑似受限而非失效。
    // （部署层可通过 --max-http-header-size 根治，见 package.json/entrypoint.sh）
    const cause =
      error instanceof Error
        ? (error.cause as { code?: string; message?: string } | undefined)
        : undefined
    if (
      cause?.code === "UND_ERR_HEADERS_OVERFLOW" ||
      /headers overflow/i.test(cause?.message ?? "")
    ) {
      return {
        status: HEADERS_OVERFLOW_STATUS,
        latencyMs: Date.now() - startedAt,
        server: null,
      }
    }
    return { status: null, latencyMs: Date.now() - startedAt, server: null }
  }
}

// 单站测活：探测后把结果持久化到 Site 表。
// 单站粒度、请求短（≤ 超时时长），“全部测活”由前端并发编排逐个调用。
export async function checkSiteHealth(siteId: string) {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized
  try {
    const site = await prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true, url: true },
    })
    if (!site) {
      return { success: false, error: "Site not found" }
    }

    const probe = await probeUrl(site.url)
    const updated = await prisma.site.update({
      where: { id: siteId },
      data: {
        healthStatus: classifyProbe(probe),
        // 哨兵值（响应头超限）不入库，避免展示 HTTP -1
        lastHttpStatus:
          probe.status !== null && probe.status > 0 ? probe.status : null,
        latencyMs: probe.latencyMs,
        lastCheckedAt: new Date(),
      },
    })
    return { success: true, data: updated }
  } catch (error) {
    if (isNextDynamicError(error)) throw error
    console.error("Error checking site health:", error)
    return { success: false, error: "Failed to check site health" }
  }
}

// 获取全部站点的 id/url，供前端“全部测活”编排使用（不分页，按当前工作区）
export async function getSiteIdsForHealthCheck() {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized
  try {
    const workspace = await getAdminWorkspace()
    const categoryIds = await getWorkspaceCategoryIds(workspace.id)
    const sites = await prisma.site.findMany({
      where: { categoryId: { in: categoryIds } },
      select: { id: true, name: true, url: true },
      orderBy: [{ isPinned: "desc" }, { order: "asc" }],
    })
    return { success: true, data: sites }
  } catch (error) {
    if (isNextDynamicError(error)) throw error
    console.error("Error fetching sites for health check:", error)
    return { success: false, error: "Failed to fetch sites" }
  }
}

// ==================== Users ====================

export async function getUsersWithPagination(params: {
  page?: number
  pageSize?: number
  search?: string
}) {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized
  try {
    const { page, pageSize } = clampPagination(params.page, params.pageSize)
    const skip = (page - 1) * pageSize

    const where: Prisma.UserWhereInput = {}

    if (params.search) {
      where.OR = [
        { email: ciContains(params.search) },
        { name: ciContains(params.search) },
      ]
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
        },
      }),
      prisma.user.count({ where }),
    ])

    return {
      success: true,
      data: users,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    }
  } catch (error) {
    if (isNextDynamicError(error)) throw error
    console.error("Error fetching users with pagination:", error)
    return { success: false, error: "Failed to fetch users" }
  }
}


// 修改资料（邮箱/姓名/头像）。密码修改不走此通道，
// 一律经由 changePassword 强制校验旧密码，且身份以会话为准，
// 不再信任客户端传入的 userId
export async function updateUser(
  id: string,
  data: {
    email?: string
    name?: string | null
    avatar?: string
  }
) {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized
  try {
    type UserUpdateData = {
      email?: string
      name?: string | null
      avatar?: string | null
    }

    const updateData: UserUpdateData = {
      email: data.email,
      name: data.name,
      avatar: data.avatar,
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
    })
    revalidatePath("/admin/users")
    // 只回传安全字段，避免 password 哈希随响应外泄（内存模式下
    // update 不支持 select，故在应用层投影）
    return {
      success: true,
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
      },
    }
  } catch (error) {
    if (isNextDynamicError(error)) throw error
    console.error("Error updating user:", error)
    return { success: false, error: "Failed to update user" }
  }
}

// 修改密码：强制校验旧密码，目标用户以会话身份为准，
// 不接受客户端传入的用户 ID
export async function changePassword(
  currentPassword: string,
  newPassword: string
) {
  const session = await getAdminSession()
  if (!session) return { success: false, error: "Unauthorized" }
  try {
    if (typeof newPassword !== "string" || newPassword.length < 6) {
      return { success: false, error: "PASSWORD_TOO_SHORT" }
    }
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
    })
    if (!user) {
      return { success: false, error: "USER_NOT_FOUND" }
    }
    const matched = await bcrypt.compare(
      typeof currentPassword === "string" ? currentPassword : "",
      user.password
    )
    if (!matched) {
      return { success: false, error: "PASSWORD_INCORRECT" }
    }
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: await bcrypt.hash(newPassword, 10),
        // 记录改密时间：getAdminSession 会与 token 签发时间比对，吊销改密前签发的所有旧会话
        passwordChangedAt: new Date(),
      },
    })
    revalidatePath("/admin/users")
    return { success: true }
  } catch (error) {
    if (isNextDynamicError(error)) throw error
    console.error("Error changing password:", error)
    return { success: false, error: "Failed to change password" }
  }
}


// ==================== Search ====================

export async function searchSites(query: string) {
  try {
    // trim：避免 ?q=%20foo 以含前导空格的串做精确 contains 搜索
    const keyword = query.trim()
    if (!keyword) {
      return { success: true, data: [] }
    }

    // 搜索范围限定在当前请求的工作区
    const workspace = await getCurrentWorkspace()
    const categoryIds = await getWorkspaceCategoryIds(workspace.id)
    const sites = await prisma.site.findMany({
      where: {
        AND: [
          { isPublished: true },
          { categoryId: { in: categoryIds } },
          {
            OR: [
              { name: ciContains(keyword) },
              { description: ciContains(keyword) },
              { url: ciContains(keyword) },
            ],
          },
        ],
      },
      orderBy: { order: 'asc' },
      // 显式投影：此 Action 可被客户端直接调用，整行返回会泄露
      // submitterIp/submitterContact 并外带 detailContent 大字段，与 getSites 同口径
      select: {
        id: true,
        name: true,
        url: true,
        description: true,
        iconUrl: true,
        categoryId: true,
        isPublished: true,
        isPinned: true,
        hasDetail: true,
        order: true,
        category: { select: { name: true } },
      },
    })

    return { success: true, data: sites }
  } catch (error) {
    if (isNextDynamicError(error)) throw error
    console.error("Error searching sites:", error)
    return { success: false, error: "Failed to search sites" }
  }
}

// ==================== System Settings ====================

export async function getSystemSettings() {
  // 管理员专用：完整设置行含 enabledPlugins/pluginConfigs 等敏感字段，
  // 本文件所有导出函数皆可被客户端直接 RPC，无鉴权的读取等于公开泄露
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized
  try {
    const settings = await getSystemSettingsRecord()
    return { success: true, data: settings }
  } catch (error) {
    if (isNextDynamicError(error)) throw error
    console.error("Error fetching system settings:", error)
    return { success: false, error: "Failed to fetch system settings" }
  }
}

// 前台展示配置：工作区覆盖项优先，未设置时回退全局 SystemSettings。
// 显式字段投影——本函数同样可被客户端直接调用，
// 绝不能整行返回（aboutContent/enabledPlugins/pluginConfigs 不外泄）

export async function getDisplaySettings() {
  const workspace = await getCurrentWorkspace()
  let settings: Record<string, unknown> = {}
  try {
    settings = ((await getSystemSettingsRecord()) ?? {}) as Record<string, unknown>
  } catch (error) {
    if (isNextDynamicError(error)) throw error
    console.error("Error fetching display settings:", error)
  }
  const str = (v: unknown) => (typeof v === "string" ? v : undefined)
  const bool = (v: unknown) => (typeof v === "boolean" ? v : undefined)
  const num = (v: unknown) => (typeof v === "number" ? v : undefined)
  // 显式字段投影——本函数同样可被客户端直接调用，
  // 绝不能整行返回（aboutContent/enabledPlugins/pluginConfigs 不外泄）
  return {
    siteName: workspace.siteName || str(settings.siteName),
    siteDescription: workspace.siteDescription || str(settings.siteDescription),
    siteLogo: workspace.siteLogo || (settings.siteLogo as string | null | undefined),
    favicon: workspace.favicon || (settings.favicon as string | null | undefined),
    pageSize: num(settings.pageSize),
    showFooter: bool(settings.showFooter),
    footerCopyright: str(settings.footerCopyright),
    footerLinks: Array.isArray(settings.footerLinks)
      ? (settings.footerLinks as Array<{ name: string; url: string }>)
      : undefined,
    showAdminLink: bool(settings.showAdminLink),
    showIcp: bool(settings.showIcp),
    icpNumber: (settings.icpNumber as string | null | undefined) ?? undefined,
    icpLink: (settings.icpLink as string | null | undefined) ?? undefined,
    githubUrl: (settings.githubUrl as string | null | undefined) ?? undefined,
    defaultLanguage: str(settings.defaultLanguage),
    enableAnimations: bool(settings.enableAnimations) ?? true,
    // 自定义代码为全局配置（不参与工作区覆盖），显式透传以保证类型可见；
    // 公开接口 /api/settings 会在装配层剔除这两个字段，不外泄给客户端
    customHeadCode: settings.customHeadCode as string | null | undefined,
    customBodyCode: settings.customBodyCode as string | null | undefined,
  }
}

// About 页数据：总开关取 about-page 内置插件的启用状态，
// 内容按工作区覆盖、空则回退全局。仅供 /about 页与 sitemap 服务端调用，
// 避免整篇 Markdown 进入公开设置接口
export async function getAboutPage() {
  const [workspace, settingsRecord, aboutEnabled] = await Promise.all([
    getCurrentWorkspace(),
    getSystemSettingsRecord().catch(() => null),
    isPluginEnabled("about-page"),
  ])
  const settings = settingsRecord
  return {
    enabled: aboutEnabled,
    siteName:
      workspace.siteName || (settings?.siteName ?? "Conan Nav"),
    content: workspace.aboutContent || settings?.aboutContent || "",
  }
}

// 允许写入的设置字段白名单：拒绝任意字段注入（如伪造 footerHtml 等）
const ALLOWED_SETTINGS_FIELDS = [
  "siteName",
  "siteDescription",
  "siteLogo",
  "favicon",
  "pageSize",
  "showFooter",
  "footerCopyright",
  "footerLinks",
  "showAdminLink",
  "showIcp",
  "icpNumber",
  "icpLink",
  "aboutContent",
  "githubUrl",
  "defaultLanguage",
  "customHeadCode",
  "customBodyCode",
  "enableAnimations",
] as const

// 系统设置值校验：白名单只过滤键不过滤值，类型/长度/范围必须在这里卡住
// （API 路由与客户端直接 RPC 都经由此函数，一处校验两条路径全覆盖）
const updateSystemSettingsSchema = z
  .object({
    siteName: z.string().max(100),
    siteDescription: z.string().max(500),
    // siteLogo/favicon 容许存量 data URL 形式（base64 可达数十 KB）；
    // 仅管理员可写，上限只为拦截意外垃圾值
    siteLogo: z.string().max(100000),
    favicon: z.string().max(100000),
    pageSize: z.number().int().min(1).max(100),
    showFooter: z.boolean(),
    footerCopyright: z.string().max(200),
    footerLinks: z
      .array(
        z.object({
          // name 允许空：设置页「添加链接」会先插入空行，历史数据也可能有空 name；
          // 全空行由客户端在提交前过滤
          name: z.string().max(100),
          url: z.string().max(500),
        })
      )
      .max(50),
    showAdminLink: z.boolean(),
    showIcp: z.boolean(),
    icpNumber: z.string().max(100).nullable(),
    icpLink: z.string().max(500).nullable(),
    aboutContent: z.string().max(50000).nullable(),
    githubUrl: z.string().max(500),
    defaultLanguage: z.string().max(10),
    customHeadCode: z.string().max(20000).nullable(),
    customBodyCode: z.string().max(20000).nullable(),
    enableAnimations: z.boolean(),
  })
  .partial()

export async function updateSystemSettings(data: {
  siteName?: string
  siteDescription?: string
  siteLogo?: string
  favicon?: string
  pageSize?: number
  showFooter?: boolean
  footerCopyright?: string
  footerLinks?: Array<{ name: string; url: string }>
  showAdminLink?: boolean
  showIcp?: boolean
  icpNumber?: string | null
  icpLink?: string | null
  aboutContent?: string | null
  githubUrl?: string
  defaultLanguage?: Locale
  customHeadCode?: string | null
  customBodyCode?: string | null
  enableAnimations?: boolean
}) {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized
  try {
    // 白名单过滤：只保留已知字段，丢弃任何额外注入的键
    const whitelisted = Object.fromEntries(
      Object.entries(data).filter(([key]) =>
        (ALLOWED_SETTINGS_FIELDS as readonly string[]).includes(key)
      )
    ) as unknown

    // 类型/长度/范围校验：pageSize: -1、siteName: {} 之类脏值不得直通 Prisma
    const parsed = updateSystemSettingsSchema.safeParse(whitelisted)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      return {
        success: false,
        error: `Invalid settings: ${issue.path.join(".")} ${issue.message}`,
      }
    }
    const allowed = parsed.data as Partial<typeof data>

    // 校验默认语言取值
    if (allowed.defaultLanguage && !isLocale(allowed.defaultLanguage)) {
      return { success: false, error: "Invalid defaultLanguage" }
    }

    // URL 类字段协议白名单：这些值会直接渲染为前台 <a href>，
    // javascript: 等协议可成为存储型 XSS 载体（空串视为清除，放行）
    const unsafeUrlField =
      (allowed.footerLinks?.some(
        link => typeof link?.url === 'string' && link.url !== '' && !isSafeSiteUrl(link.url)
      ) && '友情链接') ||
      (allowed.icpLink && !isSafeSiteUrl(allowed.icpLink) && '备案链接') ||
      (allowed.githubUrl && !isSafeSiteUrl(allowed.githubUrl) && 'GitHub 链接')
    if (unsafeUrlField) {
      return { success: false, error: "SITE_URL_INVALID_PROTOCOL" }
    }

    // 获取第一条设置记录
    let settings = await prisma.systemSettings.findFirst()

    if (!settings) {
      // 如果不存在，创建新的
      settings = await prisma.systemSettings.create({
        data: {
          ...allowed,
          footerCopyright: allowed.footerCopyright || `© ${new Date().getFullYear()} Conan Nav. All rights reserved.`,
        },
      })
    } else {
      // 更新现有记录
      settings = await prisma.systemSettings.update({
        where: { id: settings.id },
        data: allowed,
      })
    }

    revalidatePath("/admin/users")
    revalidatePath("/")
    revalidatePath("/about")
    revalidatePath("/admin/dashboard")

    return { success: true, data: settings }
  } catch (error) {
    if (isNextDynamicError(error)) throw error
    console.error("Error updating system settings:", error)
    return { success: false, error: "Failed to update system settings" }
  }
}

// ==================== Visit Tracking ====================
// 访问统计能力已迁移至内置插件 plugins/visit-tracking（装配层薄壳见 app/api/visit 等路由）

// ==================== Data Import/Export ====================

// 数据导出：workspace 模式导出当前后台选中工作区（兼容旧格式数组）；
// full 模式导出含工作区结构与域名绑定的全量备份
export async function exportData(mode: "workspace" | "full" = "workspace") {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized
  try {
    if (mode === "full") {
      const workspaces = await prisma.workspace.findMany({
        orderBy: { order: 'asc' },
        include: { domains: true },
      })
      const categories = await prisma.category.findMany({
        orderBy: { order: 'asc' },
        include: {
          sites: {
            orderBy: { order: 'asc' },
            include: {
              screenshots: {
                orderBy: { order: 'asc' },
                select: { source: true, url: true, data: true, mimeType: true, order: true },
              },
            },
          },
        },
      })

      return {
        success: true,
        data: {
          format: "nav-full-backup",
          version: 2,
          workspaces: workspaces.map((ws: any) => ({
            slug: ws.slug,
            name: ws.name,
            description: ws.description,
            siteName: ws.siteName,
            siteDescription: ws.siteDescription,
            siteLogo: ws.siteLogo,
            favicon: ws.favicon,
            aboutContent: ws.aboutContent,
            isDefault: ws.isDefault,
            isPublished: ws.isPublished,
            order: ws.order,
            domains: (ws.domains || []).map((d: any) => ({
              host: d.host,
              isPrimary: d.isPrimary,
            })),
            categories: categories
              .filter((c: any) => c.workspaceId === ws.id)
              .map((category: any) => ({
                name: category.name,
                slug: category.slug,
                icon: category.icon,
                order: category.order,
                sites: (category.sites || []).map((site: any) => ({
                  name: site.name,
                  url: site.url,
                  description: site.description,
                  iconUrl: site.iconUrl,
                  order: site.order,
                  isPublished: site.isPublished,
                  isPinned: site.isPinned,
                  detailContent: site.detailContent,
                  screenshots: (site.screenshots || []).map((shot: any) => ({
                    source: shot.source,
                    url: shot.url,
                    data: shot.data,
                    mimeType: shot.mimeType,
                    order: shot.order,
                  })),
                })),
              })),
          })),
        },
      }
    }

    // workspace 模式：导出当前选中工作区（保持旧版数组格式，便于单站迁移）
    const workspace = await getAdminWorkspace()
    const categories = await prisma.category.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { order: 'asc' },
      include: {
        sites: {
          orderBy: { order: 'asc' },
          include: {
            screenshots: {
              orderBy: { order: 'asc' },
              select: { source: true, url: true, data: true, mimeType: true, order: true },
            },
          },
        },
      },
    })

    // 导出完整数据（包含描述、排序、图标、置顶、详情内容、截图等所有字段）
    const fullData = categories.map(category => ({
      name: category.name,
      slug: category.slug,
      icon: category.icon,
      order: category.order,
      sites: (category.sites || []).map(site => ({
        name: site.name,
        url: site.url,
        description: site.description,
        iconUrl: site.iconUrl,
        order: site.order,
        isPublished: site.isPublished,
        isPinned: site.isPinned,
        detailContent: site.detailContent,
        screenshots: (site.screenshots || []).map(shot => ({
          source: shot.source,
          url: shot.url,
          data: shot.data,
          mimeType: shot.mimeType,
          order: shot.order,
        })),
      })),
    }))

    return {
      success: true,
      data: fullData,
    }
  } catch (error) {
    if (isNextDynamicError(error)) throw error
    console.error("Error exporting data:", error)
    return { success: false, error: "Failed to export data" }
  }
}

// Chrome书签导出（HTML格式，仅基本字段，兼容浏览器；按当前选中工作区导出）
export async function exportBookmarks() {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized
  try {
    const workspace = await getAdminWorkspace()
    const categories = await prisma.category.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { order: 'asc' },
      include: {
        sites: {
          orderBy: { order: 'asc' },
          where: { isPublished: true },
        },
      },
    })

    // 转换为书签格式（仅基本字段）
    const bookmarkData = categories.map(category => ({
      name: category.name,
      sites: (category.sites || []).map(site => ({
        name: site.name,
        url: site.url,
        icon: site.iconUrl || undefined,
      })),
    }))

    return {
      success: true,
      data: bookmarkData,
    }
  } catch (error) {
    if (isNextDynamicError(error)) throw error
    console.error("Error exporting bookmarks:", error)
    return { success: false, error: "Failed to export bookmarks" }
  }
}

// JSON数据导入：
// - 旧版/工作区格式（分类数组）→ 导入到当前后台选中的工作区
// - 全量备份（{ format: "nav-full-backup", workspaces: [...] }）→ 按 slug
//   upsert 工作区与域名，内容跟随各自工作区
// 校验并规范化导入的分类/站点数据（importData 与 importFullBackup 共用）：
// - 结构非法（缺 name/url、URL 非 http/https）的记录跳过并计数
// - 截图校验失败（MIME 白名单 / 大小上限）视为整份文件不可信，直接拒绝
// 校验必须发生在 overwrite 删除旧数据之前，避免脏数据导致"旧数据已删、新数据只导入一半"
interface NormalizedImportSite {
  name: string
  url: string
  description: string
  iconUrl: string | null
  order: number
  isPublished: boolean
  isPinned: boolean
  detailContent: string | null
  screenshots: ScreenshotInput[]
}

interface NormalizedImportCategory {
  name: string
  slug: string
  icon: string | null
  order?: number
  sites: NormalizedImportSite[]
}

function normalizeImportCategories(
  rawCategories: any[]
): { error: string } | { categories: NormalizedImportCategory[]; skippedSites: number } {
  const transliteration = require('transliteration')
  const categories: NormalizedImportCategory[] = []
  let skippedSites = 0
  const batchSlugs = new Set<string>()

  for (const categoryData of rawCategories) {
    if (
      !categoryData || typeof categoryData !== 'object' ||
      typeof categoryData.name !== 'string' || !categoryData.name.trim()
    ) continue
    // 批内 slug 去重：与 importBookmarks 的 batchSlugs 后缀口径一致，
    // 避免同 slug 分类撞 @@unique([workspaceId, slug]) 使整个导入事务回滚
    const baseSlug =
      (typeof categoryData.slug === 'string' && categoryData.slug.trim()) ||
      transliteration.slugify(categoryData.name)
    let slug = baseSlug
    let suffix = 2
    while (batchSlugs.has(slug)) {
      slug = `${baseSlug}-${suffix}`
      suffix++
    }
    batchSlugs.add(slug)

    const sites: NormalizedImportSite[] = []
    for (const siteData of Array.isArray(categoryData.sites) ? categoryData.sites : []) {
      if (
        !siteData || typeof siteData !== 'object' ||
        typeof siteData.name !== 'string' || !siteData.name.trim() ||
        typeof siteData.url !== 'string' || !isSafeSiteUrl(siteData.url)
      ) {
        skippedSites++
        continue
      }
      // keepId 仅对 updateSite 的增量 diff 有意义；导入是纯新建，
      // 带 keepId 的条目没有 url/data，剔除防止落库为 NULL 字段脏行
      const screenshots: ScreenshotInput[] = Array.isArray(siteData.screenshots)
        ? siteData.screenshots
            .filter((shot: any) => shot && typeof shot === 'object' && !shot.keepId)
        : []
      const screenshotError = validateScreenshots(screenshots)
      if (screenshotError) {
        // 细节原因仅入服务端日志；对外返回稳定错误码由前端按 locale 渲染
        console.warn("[importFullBackup] screenshot validation failed:", siteData.name, screenshotError)
        return {
          error: "IMPORT_SITE_VALIDATION_FAILED",
        }
      }
      const detailContent = normalizeDetailContent(siteData.detailContent)
      sites.push({
        name: siteData.name,
        url: siteData.url,
        description: typeof siteData.description === 'string' ? siteData.description : '',
        iconUrl: typeof siteData.iconUrl === 'string' && siteData.iconUrl ? siteData.iconUrl : null,
        order: typeof siteData.order === 'number' ? siteData.order : 0,
        isPublished: siteData.isPublished !== undefined ? Boolean(siteData.isPublished) : true,
        isPinned: Boolean(siteData.isPinned),
        detailContent,
        screenshots,
      })
    }

    categories.push({
      name: categoryData.name,
      slug,
      icon: typeof categoryData.icon === 'string' && categoryData.icon ? categoryData.icon : null,
      order: typeof categoryData.order === 'number' ? categoryData.order : undefined,
      sites,
    })
  }

  return { categories, skippedSites }
}

// 批量写入一个分类下的站点（含截图）。append 模式按 url 去重：
// 跳过库内已存在与本批次已写入的 url，避免重复导入产生成倍冗余。
async function importCategorySites(
  tx: any,
  categoryId: string,
  sites: NormalizedImportSite[],
  mode: 'overwrite' | 'append',
  onSkipped: () => void
) {
  const existingUrls = new Set<string>()
  if (mode === 'append') {
    const existingSites = await tx.site.findMany({
      where: { categoryId },
      select: { url: true },
    })
    for (const s of existingSites) existingUrls.add(s.url)
  }

  for (const siteData of sites) {
    if (existingUrls.has(siteData.url)) {
      onSkipped()
      continue
    }
    existingUrls.add(siteData.url)

    const createdSite = await tx.site.create({
      data: {
        name: siteData.name,
        url: siteData.url,
        description: siteData.description,
        iconUrl: siteData.iconUrl,
        categoryId,
        order: siteData.order,
        isPublished: siteData.isPublished,
        isPinned: siteData.isPinned,
        detailContent: siteData.detailContent,
        hasDetail: computeHasDetail(siteData.detailContent, siteData.screenshots.length),
      },
    })
    if (siteData.screenshots.length > 0) {
      await tx.screenshot.createMany({
        data: siteData.screenshots.map((shot, index) => ({
          siteId: createdSite.id,
          source: shot.source,
          url: shot.source === 'URL' ? shot.url || null : null,
          data: shot.source === 'UPLOAD' ? shot.data || null : null,
          mimeType: shot.source === 'UPLOAD' ? shot.mimeType || null : null,
          order: shot.order !== undefined ? shot.order : index,
        })),
      })
    }
  }
}

export async function importData(
  jsonData: any,
  mode: 'overwrite' | 'append'
) {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized
  try {
    // 全量备份格式：分流到独立处理
    if (jsonData && typeof jsonData === 'object' && Array.isArray(jsonData.workspaces)) {
      return importFullBackup(jsonData, mode)
    }

    // 验证数据格式
    if (!Array.isArray(jsonData)) {
      return { success: false, error: "Invalid data format" }
    }

    // 先整体校验/规范化，再动库
    const normalized = normalizeImportCategories(jsonData)
    if ('error' in normalized) {
      return { success: false, error: normalized.error }
    }
    const importCategories = normalized.categories
    let skippedSites = normalized.skippedSites

    // 覆盖导入的内容为空（空数组、全非法被静默跳过、或没有任何可导入站点）时拒绝执行：
    // 否则会先清空工作区再导入 0 条，造成不可逆数据丢失却报告成功
    const totalImportSites = importCategories.reduce((sum, c) => sum + c.sites.length, 0)
    if (mode === 'overwrite' && (importCategories.length === 0 || totalImportSites === 0)) {
      return { success: false, error: "IMPORT_EMPTY_OR_INVALID" }
    }

    const workspace = await getAdminWorkspace()

    // 事务化：overwrite 的"清空 + 重写"同成败，脏数据不再造成不可逆丢失
    await prisma.$transaction(async (tx: any) => {
      // 覆盖模式：仅清空当前工作区的分类与网址（不影响其他工作区）
      if (mode === 'overwrite') {
        const workspaceCategoryIds = await getWorkspaceCategoryIds(workspace.id)
        if (workspaceCategoryIds.length > 0) {
          await tx.site.deleteMany({
            where: { categoryId: { in: workspaceCategoryIds } },
          })
          await tx.category.deleteMany({
            where: { workspaceId: workspace.id },
          })
        }
      }

      // 追加模式：获取当前工作区最大排序值
      let currentMaxOrder = 0
      if (mode === 'append') {
        const maxOrderCategory = await tx.category.findFirst({
          where: { workspaceId: workspace.id },
          orderBy: { order: 'desc' },
          select: { order: true },
        })
        currentMaxOrder = maxOrderCategory?.order || 0
      }

      // 导入分类和网站
      for (const categoryData of importCategories) {
        // 检查分类是否已存在（追加模式，限定当前工作区）
        let category
        if (mode === 'append') {
          category = await tx.category.findFirst({
            where: { slug: categoryData.slug, workspaceId: workspace.id },
          })
        }

        if (!category) {
          currentMaxOrder++
          category = await tx.category.create({
            data: {
              name: categoryData.name,
              slug: categoryData.slug,
              icon: categoryData.icon,
              order: categoryData.order !== undefined ? categoryData.order : currentMaxOrder,
              workspaceId: workspace.id,
            },
          })
        }

        await importCategorySites(tx, category.id, categoryData.sites, mode, () => {
          skippedSites++
        })
      }
    }, { timeout: 30_000, maxWait: 10_000 })

    // 重新验证缓存
    revalidatePath('/', 'layout')
    revalidatePath('/category/[slug]', 'page')

    const skippedNote = skippedSites > 0 ? `，已跳过 ${skippedSites} 条非法或重复URL记录` : ''
    return {
      success: true,
      message: (mode === 'overwrite'
        ? `成功导入 ${importCategories.length} 个分类`
        : `成功追加 ${importCategories.length} 个分类`) + skippedNote,
      importedCount: importCategories.length,
    }
  } catch (error) {
    if (isNextDynamicError(error)) throw error
    console.error("Error importing data:", error)
    return { success: false, error: "Failed to import data" }
  }
}

// 全量备份导入：按 slug upsert 工作区；域名冲突（已绑其他工作区）跳过并计数
async function importFullBackup(
  backup: { workspaces: Array<Record<string, any>> },
  mode: 'overwrite' | 'append'
) {
  let importedWorkspaces = 0
  let skippedDomains = 0
  let skippedSites = 0

  for (const wsData of backup.workspaces) {
    if (!wsData.slug || !isValidWorkspaceSlug(wsData.slug)) continue

    // 先校验/规范化该工作区的内容数据，再动库（overwrite 会先清空该工作区）
    const normalized = normalizeImportCategories(
      Array.isArray(wsData.categories) ? wsData.categories : []
    )
    if ('error' in normalized) {
      console.warn("[importFullBackup] workspace validation failed:", wsData.slug, normalized.error)
      return { success: false, error: "IMPORT_WORKSPACE_VALIDATION_FAILED" }
    }

    // 每个工作区整体一个事务：元数据 upsert、域名绑定、清空与内容写入同成败。
    // 之前元数据/域名在事务外，内容导入失败会留下「元数据已写入但内容为空」的半成品
    await prisma.$transaction(async (tx: any) => {
      let workspace = await tx.workspace.findUnique({
        where: { slug: wsData.slug },
      })
      if (!workspace) {
        workspace = await tx.workspace.create({
          data: {
            slug: wsData.slug,
            name: wsData.name || wsData.slug,
            description: wsData.description || null,
            siteName: wsData.siteName || null,
            siteDescription: wsData.siteDescription || null,
            siteLogo: wsData.siteLogo || null,
            favicon: wsData.favicon || null,
            aboutContent: wsData.aboutContent || null,
            isPublished: Boolean(wsData.isPublished),
            order: wsData.order ?? 0,
          },
        })
      } else if (mode === 'overwrite') {
        workspace = await tx.workspace.update({
          where: { id: workspace.id },
          data: {
            name: wsData.name || workspace.name,
            description: wsData.description || null,
            siteName: wsData.siteName || null,
            siteDescription: wsData.siteDescription || null,
            siteLogo: wsData.siteLogo || null,
            favicon: wsData.favicon || null,
            aboutContent: wsData.aboutContent || null,
            isPublished: Boolean(wsData.isPublished),
            order: wsData.order ?? workspace.order,
          },
        })
      }
      importedWorkspaces++
      const wsId = workspace.id

      // 域名绑定：冲突项跳过
      for (const domainData of wsData.domains || []) {
        const host = normalizeHost(domainData.host)
        if (!host) continue
        const existing = await tx.domain.findUnique({ where: { host } })
        if (existing) {
          if (existing.workspaceId !== wsId) skippedDomains++
          continue
        }
        await tx.domain.create({
          data: { host, isPrimary: Boolean(domainData.isPrimary), workspaceId: wsId },
        })
      }

      // 分类与网址：overwrite 模式先清空该工作区内容。
      // 该工作区没有任何可导入站点时不执行清空——防止备份中某个空/损坏工作区
      // 借 overwrite 清空线上数据（全量备份的其余工作区正常导入）
      if (mode === 'overwrite') {
        const hasImportableSites = normalized.categories.some((c) => c.sites.length > 0)
        if (hasImportableSites) {
          const catIds = (
            await tx.category.findMany({
              where: { workspaceId: wsId },
              select: { id: true },
            })
          ).map((c: { id: string }) => c.id)
          if (catIds.length > 0) {
            await tx.site.deleteMany({
              where: { categoryId: { in: catIds } },
            })
            await tx.category.deleteMany({
              where: { workspaceId: wsId },
            })
          }
        }
      }

      let order = 0
      for (const categoryData of normalized.categories) {
        order++
        const existingCategory = mode === 'append'
          ? await tx.category.findFirst({
              where: { slug: categoryData.slug, workspaceId: wsId },
            })
          : null
        let category = existingCategory
        if (!category) {
          category = await tx.category.create({
            data: {
              name: categoryData.name,
              slug: categoryData.slug,
              icon: categoryData.icon,
              order: categoryData.order ?? order,
              workspaceId: wsId,
            },
          })
        }
        await importCategorySites(tx, category.id, categoryData.sites, mode, () => {
          skippedSites++
        })
      }
    }, { timeout: 30_000, maxWait: 10_000 })
  }

  // 备份中的默认工作区标记恢复：清掉多默认
  const defaults = await prisma.workspace.findMany({ where: { isDefault: true } })
  if (defaults.length === 0) {
    const anyWs = await prisma.workspace.findFirst({})
    if (anyWs) {
      await prisma.workspace.update({
        where: { id: anyWs.id },
        data: { isDefault: true, isPublished: true },
      })
    }
  } else if (defaults.length > 1) {
    // 保留备份中标记为默认的第一个
    for (const ws of defaults.slice(1)) {
      await prisma.workspace.update({
        where: { id: ws.id },
        data: { isDefault: false },
      })
    }
  }

  revalidatePath('/', 'layout')
  revalidatePath('/category/[slug]', 'page')

  const domainNote = skippedDomains > 0 ? `，跳过 ${skippedDomains} 个冲突域名` : ''
  const siteNote = skippedSites > 0 ? `，跳过 ${skippedSites} 条非法或重复站点` : ''
  return {
    success: true,
    message: `全量备份导入完成：${importedWorkspaces} 个工作区${domainNote}${siteNote}`,
    importedCount: importedWorkspaces,
  }
}

export async function importBookmarks(
  html: string,
  mode: 'overwrite' | 'append'
) {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized
  try {
    const { parseChromeBookmarks } = await import('./bookmarks')
    const parsed = parseChromeBookmarks(html)
    // 覆盖导入的内容为空（如误传普通网页 HTML，或文件夹里没有任何合法 URL）时拒绝执行，
    // 防止清空工作区后导入 0 条——与 importData 的空内容保护口径一致
    const totalBookmarkSites = parsed.categories.reduce((sum, c) => sum + c.sites.length, 0)
    if (mode === 'overwrite' && (parsed.categories.length === 0 || totalBookmarkSites === 0)) {
      return { success: false, error: "BOOKMARKS_IMPORT_EMPTY" }
    }
    // 书签导入归属当前后台选中的工作区
    const workspace = await getAdminWorkspace()
    const { slugify } = require('transliteration') as { slugify: (s: string) => string }

    // 整体事务化：overwrite 的清空与后续导入同成败，
    // 中途失败（slug 冲突、连接抖动等）不再留下「旧数据已删、新数据只导一半」的不可逆状态。
    // 大书签文件逐条写入耗时可观，显式放大默认 5s 的事务超时
    const { importedCategories, skippedSites } = await prisma.$transaction(async (tx) => {
      // 覆盖模式：仅清空当前工作区的数据（事务内用 tx 查询，避免事务外读取漏删并发新增）
      if (mode === 'overwrite') {
        const workspaceCategoryIds = (
          await tx.category.findMany({
            where: { workspaceId: workspace.id },
            select: { id: true },
          })
        ).map((category) => category.id)
        if (workspaceCategoryIds.length > 0) {
          await tx.site.deleteMany({
            where: { categoryId: { in: workspaceCategoryIds } },
          })
          await tx.category.deleteMany({
            where: { workspaceId: workspace.id },
          })
        }
      }

      // 追加模式：保留现有数据，只添加新的（限定当前工作区）
      let currentMaxOrder = 0
      if (mode === 'append') {
        const maxOrderCategory = await tx.category.findFirst({
          where: { workspaceId: workspace.id },
          orderBy: { order: 'desc' },
          select: { order: true },
        })
        currentMaxOrder = maxOrderCategory?.order || 0
      }

      // 导入分类和网站
      let skipped = 0
      const batchSlugs = new Set<string>()
      // 批次内 URL 去重：书签文件中同一站点常出现在多个文件夹
      const seenUrls = new Set<string>()
      for (const categoryData of parsed.categories) {
        // 生成分类 slug（中文转拼音）；同名文件夹 slug 冲突时追加序号，
        // 否则撞 workspaceId+slug 唯一约束会让整个导入事务回滚
        const baseSlug = slugify(categoryData.name)
        let slug = baseSlug
        let suffix = 2
        while (batchSlugs.has(slug)) {
          slug = `${baseSlug}-${suffix}`
          suffix++
        }
        batchSlugs.add(slug)

        // 检查分类是否已存在（追加模式，限定当前工作区）
        let category
        if (mode === 'append') {
          category = await tx.category.findFirst({
            where: { slug, workspaceId: workspace.id },
          })
        }

        if (!category) {
          currentMaxOrder++
          category = await tx.category.create({
            data: {
              name: categoryData.name,
              slug,
              order: currentMaxOrder,
              workspaceId: workspace.id,
            },
          })
        }

        // 导入网站
        let currentSiteOrder = 0
        if (mode === 'append') {
          const maxOrderSite = await tx.site.findFirst({
            where: { categoryId: category.id },
            orderBy: { order: 'desc' },
            select: { order: true },
          })
          currentSiteOrder = maxOrderSite?.order || 0
        }

        for (const siteData of categoryData.sites) {
          // 跳过非 http/https 的非法 URL，防止存储型 XSS
          if (!isSafeSiteUrl(siteData.url)) {
            skipped++
            continue
          }
          // 去重：批次内已导入过、或 append 模式下该分类已有同 URL 站点时跳过
          if (seenUrls.has(siteData.url)) {
            skipped++
            continue
          }
          if (mode === 'append') {
            const dup = await tx.site.findFirst({
              where: { url: siteData.url, categoryId: category.id },
              select: { id: true },
            })
            if (dup) {
              skipped++
              continue
            }
          }
          seenUrls.add(siteData.url)
          currentSiteOrder++
          await tx.site.create({
            data: {
              name: siteData.name,
              url: siteData.url,
              description: siteData.url, // 使用URL作为描述
              // 图标地址仅接受 http/https，防止 javascript: 等协议入库
              iconUrl: siteData.icon && isSafeSiteUrl(siteData.icon) ? siteData.icon : null,
              categoryId: category.id,
              order: currentSiteOrder,
              isPublished: true,
            },
          })
        }
      }

      return { importedCategories: parsed.categories.length, skippedSites: skipped }
    }, { timeout: 30_000, maxWait: 10_000 })

    // 重新验证缓存
    revalidatePath('/', 'layout')
    revalidatePath('/category/[slug]', 'page')

    const bookmarkSkippedNote = skippedSites > 0 ? `，已跳过 ${skippedSites} 条非法URL记录` : ''
    return {
      success: true,
      message: (mode === 'overwrite'
        ? `成功导入 ${importedCategories} 个分类`
        : `成功追加 ${importedCategories} 个分类`) + bookmarkSkippedNote,
      importedCount: importedCategories,
    }
  } catch (error) {
    if (isNextDynamicError(error)) throw error
    console.error("Error importing bookmarks:", error)
    return { success: false, error: "Failed to import bookmarks" }
  }
}

