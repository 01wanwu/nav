"use server"

import { prisma } from "./prisma"
import { revalidatePath } from "next/cache"
import { Prisma } from "@prisma/client"
import bcrypt from "bcrypt"

// ==================== Categories ====================

export async function getCategories() {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { order: 'asc' },
      include: {
        sites: {
          where: { isPublished: true },
          orderBy: { order: 'asc' },
        },
      },
    })
    return { success: true, data: categories }
  } catch (error) {
    console.error("Error fetching categories:", error)
    return { success: false, error: "Failed to fetch categories" }
  }
}

export async function getCategoryBySlug(slug: string) {
  try {
    const category = await prisma.category.findUnique({
      where: { slug },
      include: {
        sites: {
          where: { isPublished: true },
          orderBy: { order: 'asc' },
        },
      },
    })
    if (!category) {
      return { success: false, error: "Category not found" }
    }
    return { success: true, data: category }
  } catch (error) {
    console.error("Error fetching category:", error)
    return { success: false, error: "Failed to fetch category" }
  }
}

export async function getAllCategories() {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { order: 'asc' },
    })
    return { success: true, data: categories }
  } catch (error) {
    console.error("Error fetching all categories:", error)
    return { success: false, error: "Failed to fetch categories" }
  }
}

export async function getCategoriesWithPagination(params: {
  page?: number
  pageSize?: number
  search?: string
}) {
  try {
    const page = params.page || 1
    const pageSize = params.pageSize || 10
    const skip = (page - 1) * pageSize

    const where: Prisma.CategoryWhereInput = {}

    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { slug: { contains: params.search, mode: 'insensitive' } },
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
    console.error("Error fetching categories with pagination:", error)
    return { success: false, error: "Failed to fetch categories" }
  }
}

export async function getCategoryById(id: string) {
  try {
    const category = await prisma.category.findUnique({
      where: { id },
    })
    if (!category) {
      return { success: false, error: "Category not found" }
    }
    return { success: true, data: category }
  } catch (error) {
    console.error("Error fetching category:", error)
    return { success: false, error: "Failed to fetch category" }
  }
}

export async function createCategory(data: {
  name: string
  slug: string
  order?: number
}) {
  try {
    const category = await prisma.category.create({
      data: {
        name: data.name,
        slug: data.slug,
        order: data.order ?? 0,
      },
    })
    revalidatePath("/admin/categories")
    revalidatePath("/")
    return { success: true, data: category }
  } catch (error) {
    console.error("Error creating category:", error)
    return { success: false, error: "Failed to create category" }
  }
}

export async function updateCategory(id: string, data: {
  name?: string
  slug?: string
  order?: number
}) {
  try {
    const category = await prisma.category.update({
      where: { id },
      data,
    })
    revalidatePath("/admin/categories")
    revalidatePath("/")
    revalidatePath(`/category/${category.slug}`)
    return { success: true, data: category }
  } catch (error) {
    console.error("Error updating category:", error)
    return { success: false, error: "Failed to update category" }
  }
}

export async function deleteCategory(id: string) {
  try {
    await prisma.category.delete({
      where: { id },
    })
    revalidatePath("/admin/categories")
    revalidatePath("/")
    return { success: true }
  } catch (error) {
    console.error("Error deleting category:", error)
    return { success: false, error: "Failed to delete category" }
  }
}

// ==================== Sites ====================

export async function getSites() {
  try {
    const sites = await prisma.site.findMany({
      orderBy: { order: 'asc' },
      include: {
        category: true,
      },
    })
    return { success: true, data: sites }
  } catch (error) {
    console.error("Error fetching sites:", error)
    return { success: false, error: "Failed to fetch sites" }
  }
}

export async function getSitesWithPagination(params: {
  page?: number
  pageSize?: number
  categoryId?: string
  search?: string
}) {
  try {
    const page = params.page || 1
    const pageSize = params.pageSize || 10
    const skip = (page - 1) * pageSize

    const where: Prisma.SiteWhereInput = {}

    if (params.categoryId) {
      where.categoryId = params.categoryId
    }

    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { description: { contains: params.search, mode: 'insensitive' } },
        { url: { contains: params.search, mode: 'insensitive' } },
      ]
    }

    const [sites, total] = await Promise.all([
      prisma.site.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { order: 'asc' },
        include: {
          category: true,
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
    console.error("Error fetching sites with pagination:", error)
    return { success: false, error: "Failed to fetch sites" }
  }
}

export async function getSiteById(id: string) {
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
    console.error("Error fetching site:", error)
    return { success: false, error: "Failed to fetch site" }
  }
}

export async function createSite(data: {
  name: string
  url: string
  description: string
  iconUrl?: string
  categoryId: string
  isPublished?: boolean
  order?: number
}) {
  try {
    const site = await prisma.site.create({
      data: {
        name: data.name,
        url: data.url,
        description: data.description,
        iconUrl: data.iconUrl,
        categoryId: data.categoryId,
        isPublished: data.isPublished ?? false,
        order: data.order ?? 0,
      },
      include: {
        category: true,
      },
    })
    revalidatePath("/admin/sites")
    revalidatePath("/")
    revalidatePath(`/category/${site.category?.slug || ''}`)
    return { success: true, data: site }
  } catch (error) {
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
  order?: number
}) {
  try {
    const site = await prisma.site.update({
      where: { id },
      data,
      include: {
        category: true,
      },
    })
    revalidatePath("/admin/sites")
    revalidatePath("/")
    revalidatePath(`/category/${site.category?.slug || ''}`)
    return { success: true, data: site }
  } catch (error) {
    console.error("Error updating site:", error)
    return { success: false, error: "Failed to update site" }
  }
}

export async function deleteSite(id: string) {
  try {
    const site = await prisma.site.delete({
      where: { id },
      include: {
        category: true,
      },
    })
    revalidatePath("/admin/sites")
    revalidatePath("/")
    revalidatePath(`/category/${site.category?.slug || ''}`)
    return { success: true }
  } catch (error) {
    console.error("Error deleting site:", error)
    return { success: false, error: "Failed to delete site" }
  }
}

export async function toggleSitePublish(id: string) {
  try {
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
    return { success: true, data: site }
  } catch (error) {
    console.error("Error toggling site publish status:", error)
    return { success: false, error: "Failed to toggle site publish status" }
  }
}

// ==================== Users ====================

export async function getUsersWithPagination(params: {
  page?: number
  pageSize?: number
  search?: string
}) {
  try {
    const page = params.page || 1
    const pageSize = params.pageSize || 10
    const skip = (page - 1) * pageSize

    const where: Prisma.UserWhereInput = {}

    if (params.search) {
      where.OR = [
        { email: { contains: params.search, mode: 'insensitive' } },
        { name: { contains: params.search, mode: 'insensitive' } },
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
    console.error("Error fetching users with pagination:", error)
    return { success: false, error: "Failed to fetch users" }
  }
}


export async function updateUser(
  id: string,
  data: {
    email?: string
    password?: string
    name?: string
    avatar?: string
  }
) {
  try {
    // 定义更新数据类型
    type UserUpdateData = {
      email?: string
      password?: string
      name?: string | null
      avatar?: string | null
    }

    const updateData: UserUpdateData = {
      ...data,
    }

    if (data.password) {
      updateData.password = await bcrypt.hash(data.password, 10)
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
    })
    revalidatePath("/admin/users")
    return { success: true, data: user }
  } catch (error) {
    console.error("Error updating user:", error)
    return { success: false, error: "Failed to update user" }
  }
}


// ==================== Search ====================

export async function searchSites(query: string) {
  try {
    if (!query || query.trim().length === 0) {
      return { success: true, data: [] }
    }

    const sites = await prisma.site.findMany({
      where: {
        AND: [
          { isPublished: true },
          {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { description: { contains: query, mode: "insensitive" } },
              { url: { contains: query, mode: "insensitive" } },
            ],
          },
        ],
      },
      include: {
        category: true,
      },
      orderBy: { order: 'asc' },
    })

    return { success: true, data: sites }
  } catch (error) {
    console.error("Error searching sites:", error)
    return { success: false, error: "Failed to search sites" }
  }
}

// ==================== System Settings ====================

export async function getSystemSettings() {
  try {
    // 系统设置只有一条记录，使用第一条
    let settings = await prisma.systemSettings.findFirst()

    // 如果不存在，创建默认设置
    if (!settings) {
      settings = await prisma.systemSettings.create({
        data: {
          id: "default",
          footerCopyright: `© ${new Date().getFullYear()} Conan Nav. All rights reserved.`,
        },
      })
    }

    return { success: true, data: settings }
  } catch (error) {
    console.error("Error fetching system settings:", error)
    return { success: false, error: "Failed to fetch system settings" }
  }
}

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
  enableVisitTracking?: boolean
  githubUrl?: string
}) {
  try {
    // 获取第一条设置记录
    let settings = await prisma.systemSettings.findFirst()

    if (!settings) {
      // 如果不存在，创建新的
      settings = await prisma.systemSettings.create({
        data: {
          ...data,
          footerCopyright: data.footerCopyright || `© ${new Date().getFullYear()} Conan Nav. All rights reserved.`,
        },
      })
    } else {
      // 更新现有记录
      settings = await prisma.systemSettings.update({
        where: { id: settings.id },
        data,
      })
    }

    revalidatePath("/admin/settings")
    revalidatePath("/")
    revalidatePath("/admin/dashboard")

    return { success: true, data: settings }
  } catch (error) {
    console.error("Error updating system settings:", error)
    return { success: false, error: "Failed to update system settings" }
  }
}

// ==================== Visit Tracking ====================

export async function recordVisit(siteId: string, request?: Request) {
  try {
    // 获取系统设置，检查是否启用访问统计
    const settingsResult = await getSystemSettings()
    if (!settingsResult.success || !settingsResult.data?.enableVisitTracking) {
      return { success: true }
    }

    let ipAddress = null
    let userAgent = null
    let referer = null

    if (request) {
      ipAddress = request.headers.get('x-forwarded-for') ||
                  request.headers.get('x-real-ip') ||
                  null
      userAgent = request.headers.get('user-agent') || null
      referer = request.headers.get('referer') || null
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

export async function getVisitStats(days: number = 30) {
  try {
    const topSites = await prisma.visit.groupBy({
      by: ['siteId'],
      where: days > 0 ? {
        visitedAt: {
          gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
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
      take: 10,
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
      where: days > 0 ? {
        visitedAt: {
          gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
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

export async function getVisitFrequency(days: number = 30) {
  try {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    const visits = await prisma.visit.findMany({
      where: days > 0 ? {
        visitedAt: {
          gte: startDate,
        },
      } : undefined,
      select: {
        visitedAt: true,
      },
      orderBy: {
        visitedAt: 'asc',
      },
    })

    // 按日期分组统计
    const visitsByDate = visits.reduce((acc, visit) => {
      const date = new Date(visit.visitedAt)
      const dateKey = date.toISOString().split('T')[0] // YYYY-MM-DD
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

