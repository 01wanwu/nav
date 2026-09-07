import { prisma } from "@/lib/prisma"
import { assertPluginEnabled } from "@/lib/plugins/runtime"
import { PluginDisabledError } from "@/lib/plugins/types"
import { getAdminSession } from "@/lib/api-auth"
import { PLUGIN_ID } from "./constants"

// 访问统计插件后端能力。
// API 路由（/api/visit、/api/admin/stats/*）作为装配层薄壳调用本模块。

// getAdminSession 已含双层校验（签名 + 查库确认角色），不再重复查库
async function requireAdmin(): Promise<{ success: false; error: string } | null> {
  if (!(await getAdminSession())) {
    return { success: false, error: "Unauthorized" }
  }
  return null
}

// 整数参数钳制：非法输入（NaN/越界）回退默认值，防止退化全表扫描或 Prisma 报错
function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(Math.max(Math.trunc(value), min), max)
}

// 埋点：仅对存在且已发布的站点记录访问，防止伪造 siteId 污染统计
export async function recordVisit(siteId: string, request?: Request) {
  try {
    await assertPluginEnabled(PLUGIN_ID)
  } catch (error) {
    if (error instanceof PluginDisabledError) {
      // 插件禁用时静默成功：调用方无需感知统计开关
      return { success: true }
    }
    throw error
  }

  try {
    const site = await prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true, isPublished: true },
    })
    if (!site || !site.isPublished) {
      return { success: false, error: "Site not found" }
    }

    let ipAddress = null
    let userAgent = null
    let referer = null

    if (request) {
      // x-forwarded-for 可能为逗号分隔的 IP 链，取首段作为客户端 IP。
      // 头字段原文入库且无长度上限时单行可被塞入 MB 级数据（公开端点可滥用），统一截断
      ipAddress = (request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                  request.headers.get('x-real-ip') ||
                  '')?.slice(0, 64) || null
      userAgent = request.headers.get('user-agent')?.slice(0, 512) || null
      referer = request.headers.get('referer')?.slice(0, 2048) || null
    }

    const visit = await prisma.visit.create({
      data: {
        siteId,
        ipAddress,
        userAgent,
        referer,
      },
    })

    return { success: true, data: visit }
  } catch (error) {
    console.error("Error recording visit:", error)
    return { success: false, error: "Failed to record visit" }
  }
}

// 访问排行（admin）
export async function getVisitStats(days: number = 30, limit: number = 10) {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized
  try {
    // 插件守卫在 try 内：PluginDisabledError 转为业务失败而非逸出成 500
    await assertPluginEnabled(PLUGIN_ID)
    // 参数 clamp：days/limit 为 0 表示「不限」（前端"全部"选项），
    // NaN/负数回退默认值——防退化全表扫描的同时保留全量语义
    const safeDays = clampInt(days, 0, 365, 30)
    const safeLimit = clampInt(limit, 0, 100, 10)
    const topSites = await prisma.visit.groupBy({
      by: ['siteId'],
      where: safeDays > 0 ? {
        visitedAt: {
          gte: new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000),
        },
      } : undefined,
      _count: {
        id: true,
      },
      orderBy: {
        _count: {
          id: 'desc',
        },
      },
      take: safeLimit > 0 ? safeLimit : undefined,
    })

    const siteIds = topSites.map(s => s.siteId)
    const sites = await prisma.site.findMany({
      where: {
        id: { in: siteIds },
      },
      include: {
        category: true,
      },
    })

    const topSitesWithDetails = topSites.map(stat => {
      const site = sites.find(s => s.id === stat.siteId)
      return {
        ...site,
        visitCount: stat._count.id,
      }
    })

    const totalVisits = await prisma.visit.count({
      where: safeDays > 0 ? {
        visitedAt: {
          gte: new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000),
        },
      } : undefined,
    })

    return {
      success: true,
      data: {
        topSites: topSitesWithDetails,
        totalVisits,
      },
    }
  } catch (error) {
    console.error("Error fetching visit stats:", error)
    return { success: false, error: "Failed to fetch visit stats" }
  }
}

// 访问频次按日分布（admin）
export async function getVisitFrequency(days: number = 30) {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized
  try {
    // 插件守卫在 try 内；days=0 表示「全部数据」（前端"全部"选项）
    await assertPluginEnabled(PLUGIN_ID)
    const safeDays = clampInt(days, 0, 365, 30)
    const visits = await prisma.visit.findMany({
      where: safeDays > 0 ? {
        visitedAt: {
          gte: new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000),
        },
      } : undefined,
      select: {
        visitedAt: true,
      },
      orderBy: {
        visitedAt: 'asc',
      },
    })

    // 按日期分组统计（本地时区日界，与 getTodayVisitStats 的"今日"口径一致：
    // toISOString 的 UTC 日界会在非 UTC 服务器上把同一天的访问拆到两列）
    const localDateKey = (date: Date) => {
      const y = date.getFullYear()
      const m = String(date.getMonth() + 1).padStart(2, '0')
      const d = String(date.getDate()).padStart(2, '0')
      return `${y}-${m}-${d}`
    }
    const visitsByDate = visits.reduce((acc, visit) => {
      const dateKey = localDateKey(new Date(visit.visitedAt))
      acc[dateKey] = (acc[dateKey] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    // 转换为数组格式
    const frequencyData = Object.entries(visitsByDate).map(([date, count]) => ({
      date,
      count,
    }))

    return {
      success: true,
      data: frequencyData,
    }
  } catch (error) {
    console.error("Error fetching visit frequency:", error)
    return { success: false, error: "Failed to fetch visit frequency" }
  }
}

// 今日/昨日访问量与环比（admin）
export async function getTodayVisitStats() {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized
  try {
    // 插件守卫在 try 内：PluginDisabledError 转为业务失败而非逸出成 500
    await assertPluginEnabled(PLUGIN_ID)
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterdayStart = new Date(todayStart)
    yesterdayStart.setDate(yesterdayStart.getDate() - 1)

    const [today, yesterday] = await Promise.all([
      prisma.visit.count({
        where: { visitedAt: { gte: todayStart } },
      }),
      prisma.visit.count({
        where: {
          visitedAt: {
            gte: yesterdayStart,
            lt: todayStart,
          },
        },
      }),
    ])

    // 环比增长率：(今日 - 昨日) / 昨日 * 100，昨日为 0 时今日大于 0 记为 100
    let growthRate: number | null = null
    if (yesterday > 0) {
      growthRate = Math.round(((today - yesterday) / yesterday) * 100)
    } else if (today > 0) {
      growthRate = 100
    }

    return { success: true, data: { today, yesterday, growthRate } }
  } catch (error) {
    console.error("Error fetching today stats:", error)
    return { success: false, error: "Failed to fetch today stats" }
  }
}
