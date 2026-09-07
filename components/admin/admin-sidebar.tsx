"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import {
  LayoutDashboard,
  Globe,
  FolderKanban,
  Users,
  Database,
  Layers,
  Puzzle,
  Settings,
  ScrollText,
} from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { AdminAvatar } from "./admin-avatar"
import { VersionBadge } from "./version-badge"
import { fetchPublicSettings } from "@/lib/client-settings"

// 菜单标题使用 admin.sidebar 命名空间的消息 key
const navItems = [
  {
    titleKey: "dashboard",
    href: "/admin/dashboard",
    icon: LayoutDashboard,
  },
  {
    titleKey: "sites",
    href: "/admin/sites",
    icon: Globe,
  },
  {
    titleKey: "categories",
    href: "/admin/categories",
    icon: FolderKanban,
  },
  {
    titleKey: "data",
    href: "/admin/data",
    icon: Database,
  },
  {
    titleKey: "workspaces",
    href: "/admin/workspaces",
    icon: Layers,
  },
  {
    titleKey: "plugins",
    href: "/admin/plugins",
    icon: Puzzle,
  },
  {
    titleKey: "settings",
    href: "/admin/settings",
    icon: Settings,
  },
] as const

// 仅超管可见的菜单项（用户管理/审计日志）。
// 隐藏入口只是展示层控制，真正的权限校验在页面服务端与 Server Actions 内。
const superAdminNavItems = [
  {
    titleKey: "users",
    href: "/admin/users",
    icon: Users,
  },
  {
    titleKey: "audit",
    href: "/admin/audit",
    icon: ScrollText,
  },
] as const

export function AdminSidebar() {
  const pathname = usePathname()
  const t = useTranslations("admin.sidebar")
  const [siteName, setSiteName] = useState("Conan Nav")
  const [siteLogo, setSiteLogo] = useState<string | null>(null)
  // 当前登录者是否超管：决定「用户管理/审计日志」入口是否展示。
  // 与 /api/admin/me 同源获取，复用其缓存策略
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function loadSettings() {
      const settings = await fetchPublicSettings()
      if (!cancelled) {
        if (settings.siteName) setSiteName(settings.siteName)
        if (settings.siteLogo) setSiteLogo(settings.siteLogo)
      }
    }
    loadSettings()
    return () => {
      cancelled = true
    }
  }, [])

  // 获取当前登录者角色：决定「用户管理/审计日志」入口是否展示。
  // AdminAvatar 也请求 /api/admin/me，浏览器层 HTTP 缓存不适用，
  // 但同一渲染周期内两次请求成本可忽略
  useEffect(() => {
    let cancelled = false
    async function loadRole() {
      try {
        const res = await fetch("/api/admin/me", { credentials: "include" })
        if (res.ok) {
          const data = await res.json()
          if (!cancelled && data.user) {
            setIsSuperAdmin(data.user.role === "SUPER_ADMIN")
          }
        }
      } catch {
        // 网络错误时保持默认隐藏，不影响其他菜单
      }
    }
    loadRole()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader className="px-4 pt-4 pb-2 group-data-[collapsible=icon]:!px-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild className="transition-all duration-200 active:scale-95 group">
              <Link href="/admin">
                {siteLogo ? (
                  <div className="flex aspect-square size-8 items-center justify-center">
                    <Image
                      src={siteLogo}
                      alt="Logo"
                      width={24}
                      height={24}
                      className="h-6 w-6 object-contain transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3"
                      referrerPolicy="no-referrer"
                      priority
                    />
                  </div>
                ) : (
                  <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                    <span className="text-sm font-bold">{siteName.charAt(0)}</span>
                  </div>
                )}
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-bold">{siteName}</span>
                  <span className="truncate text-xs text-muted-foreground">{t("adminTitle")}</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="px-3 py-4 group-data-[collapsible=icon]:!px-2">
          <SidebarGroupLabel className="px-2 text-xs text-muted-foreground">{t("menuLabel")}</SidebarGroupLabel>
          <SidebarGroupContent className="mt-1">
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.href}
                    tooltip={t(item.titleKey)}
                  >
                    <Link href={item.href}>
                      <item.icon />
                      <span>{t(item.titleKey)}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              {isSuperAdmin &&
                superAdminNavItems.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === item.href}
                      tooltip={t(item.titleKey)}
                    >
                      <Link href={item.href}>
                        <item.icon />
                        <span>{t(item.titleKey)}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3 group-data-[collapsible=icon]:!p-2">
        <div className="mb-2 group-data-[collapsible=icon]:mb-0">
          <VersionBadge />
        </div>
        <AdminAvatar />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
