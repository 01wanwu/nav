"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { AdminAvatar, clearUserCache } from "./admin-avatar"
import {
  LayoutDashboard,
  Globe,
  FolderKanban,
  Users,
  LogOut,
} from "lucide-react"

// 缓存设置数据，避免每次页面切换都重新加载
let settingsCache: any = null
let cacheTimestamp = 0
const CACHE_DURATION = 5 * 60 * 1000 // 5分钟缓存

const navItems = [
  {
    title: "数据统计",
    href: "/admin/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "网站管理",
    href: "/admin/sites",
    icon: Globe,
  },
  {
    title: "分类管理",
    href: "/admin/categories",
    icon: FolderKanban,
  },
  {
    title: "系统管理",
    href: "/admin/users",
    icon: Users,
  },
]

interface SidebarProps {
  className?: string
}

export function AdminSidebar({ className }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [siteName, setSiteName] = useState("Conan Nav")
  const [siteLogo, setSiteLogo] = useState<string | null>(null)

  useEffect(() => {
    async function loadSettings() {
      // 检查缓存
      const now = Date.now()
      if (settingsCache && (now - cacheTimestamp) < CACHE_DURATION) {
        if (settingsCache.siteName) setSiteName(settingsCache.siteName)
        if (settingsCache.siteLogo) setSiteLogo(settingsCache.siteLogo)
        return
      }

      try {
        const res = await fetch("/api/settings")
        if (res.ok) {
          const settings = await res.json()
          settingsCache = settings
          cacheTimestamp = now
          if (settings.siteName) setSiteName(settings.siteName)
          if (settings.siteLogo) setSiteLogo(settings.siteLogo)
        }
      } catch (error) {
        console.error("Failed to load settings:", error)
      }
    }
    loadSettings()
  }, [])

  return (
    <div className={`flex h-screen w-64 flex-col border-r bg-background ${className || ""}`}>
      <div className="flex h-16 items-center border-b px-6">
        <Link href="/admin" className="flex items-center space-x-2">
          {siteLogo ? (
            <img src={siteLogo} alt="Logo" className="h-6 w-6 object-contain" />
          ) : null}
          <span className="text-lg font-bold">{siteName} Admin</span>
        </Link>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href

          return (
            <Link key={item.href} href={item.href}>
              <Button
                variant={isActive ? "secondary" : "ghost"}
                className="w-full justify-start"
              >
                <Icon className="mr-2 h-4 w-4" />
                {item.title}
              </Button>
            </Link>
          )
        })}
      </nav>

      <Separator />

      <div className="p-3 space-y-2">
        <AdminAvatar />

        {/* 退出登录按钮 */}
        <Button
          variant="ghost"
          className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={async () => {
            try {
              // 清除用户缓存
              clearUserCache()
              // 调用退出 API
              await fetch("/api/admin/logout", { method: "POST", credentials: "include" })
              // 跳转到登录页
              router.push("/admin/login")
              router.refresh()
            } catch (error) {
              console.error("Logout error:", error)
            }
          }}
        >
          <LogOut className="mr-2 h-4 w-4" />
          退出登录
        </Button>
      </div>
    </div>
  )
}
