"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { ThemeToggle } from "@/components/theme-toggle"
import { LocaleToggle } from "@/components/locale-toggle"
import Link from "next/link"
import { Home } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { WorkspaceSwitcher } from "./workspace-switcher"
import { cn } from "@/lib/utils"

// 路径到标题 key 的映射（文案位于 admin.sidebar 命名空间）
type PageTitleKey =
  | "dashboard"
  | "sites"
  | "categories"
  | "workspaces"
  | "data"
  | "settings"
  | "plugins"
  | "users"
  | "audit"

// 路由语义：/admin/users 是超管的用户管理，/admin/settings 是系统设置，
// 两者不可混用（一度沿用旧映射把用户管理页标题显示成「系统设置」）
const pageTitleKeyMap: Record<string, PageTitleKey> = {
  "/admin/dashboard": "dashboard",
  "/admin/sites": "sites",
  "/admin/categories": "categories",
  "/admin/workspaces": "workspaces",
  "/admin/data": "data",
  "/admin/settings": "settings",
  "/admin/users": "users",
  "/admin/audit": "audit",
  "/admin/plugins": "plugins",
}

// 导出供内容区使用的页面标题 hook
export function usePageTitle(pathname: string) {
  const t = useTranslations("admin.sidebar")
  const key = pageTitleKeyMap[pathname]
  return key ? t(key) : t("adminTitle")
}

export function AdminHeader() {
  const t = useTranslations("admin.sidebar")
  const [offset, setOffset] = useState(0)

  useEffect(() => {
    const onScroll = (event: Event) => {
      const target = event.target
      if (target instanceof HTMLElement && target.hasAttribute("data-admin-scroll")) {
        setOffset(target.scrollTop)
        return
      }
      setOffset(document.body.scrollTop || document.documentElement.scrollTop)
    }
    document.addEventListener("scroll", onScroll, { capture: true, passive: true })
    return () => document.removeEventListener("scroll", onScroll, { capture: true })
  }, [])

  const scrolled = offset > 10

  return (
    <header
      className={cn(
        "sticky top-0 z-50 h-16 w-full shrink-0",
        scrolled ? "shadow" : "shadow-none"
      )}
    >
      <div
        className={cn(
          "relative flex h-full items-center gap-2 px-4 lg:px-6",
          scrolled &&
            "after:absolute after:inset-0 after:-z-10 after:bg-background/20 after:backdrop-blur-lg after:rounded-t-xl"
        )}
      >
        <SidebarTrigger variant="outline" className="-ml-1 max-md:scale-125" />
        <div className="ml-auto flex items-center gap-2">
          <WorkspaceSwitcher />
          <Button variant="ghost" size="icon" asChild>
            <Link href="/">
              <Home className="h-5 w-5" />
              <span className="sr-only">{t("visitSite")}</span>
            </Link>
          </Button>
          <LocaleToggle />
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
