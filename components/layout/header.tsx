"use client"

import { useState, FormEvent, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { ThemeToggle } from "@/components/theme-toggle"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Search, Menu } from "lucide-react"

// 缓存设置数据，避免每次页面切换都重新加载
let settingsCache: any = null
let cacheTimestamp = 0
const CACHE_DURATION = 5 * 60 * 1000 // 5分钟缓存

interface HeaderProps {
  categories: Array<{
    id: string
    name: string
    slug: string
  }>
  currentCategory?: string
  siteName?: string
  siteLogo?: string | null
}

export function Header({
  categories,
  currentCategory = "",
  siteName = "Conan Nav",
  siteLogo = null
}: HeaderProps) {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState("")
  const [logo, setLogo] = useState<string | null>(siteLogo)

  useEffect(() => {
    async function loadSettings() {
      // 检查缓存
      const now = Date.now()
      if (settingsCache && (now - cacheTimestamp) < CACHE_DURATION) {
        if (settingsCache.siteLogo) setLogo(settingsCache.siteLogo)
        return
      }

      try {
        const res = await fetch("/api/settings")
        if (res.ok) {
          const settings = await res.json()
          settingsCache = settings
          cacheTimestamp = now
          if (settings.siteLogo) setLogo(settings.siteLogo)
        }
      } catch (error) {
        console.error("Failed to load settings:", error)
      }
    }
    loadSettings()
  }, [])

  const handleSearch = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`)
    }
  }

  // 生成短名称
  const shortName = siteName
    .split(" ")
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="px-2 sm:px-4 lg:px-6">
        <div className="flex h-16 items-center">
          <div className="flex-shrink-0 pr-6 sm:pr-8">
            <Link href="/" className="flex items-center space-x-2">
              {logo && (
                <img src={logo} alt="Logo" className="h-8 w-8 object-contain" />
              )}
              <span className="hidden font-bold sm:inline-block text-xl">
                {siteName}
              </span>
              <span className="font-bold sm:hidden text-xl">{shortName}</span>
            </Link>
          </div>

          {/* 移动端下拉菜单 */}
          <div className="md:hidden flex-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center space-x-2 px-2 py-1.5 text-sm font-medium hover:bg-accent rounded-md transition-colors">
                  <Menu className="h-4 w-4" />
                  <span>分类</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                {categories.map((category) => (
                  <DropdownMenuItem key={category.id} asChild>
                    <Link
                      href={`/category/${category.slug}`}
                      className={currentCategory === category.slug ? "text-foreground" : "text-foreground/60"}
                    >
                      {category.name}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* 桌面端横向导航 */}
          <nav className="hidden md:flex flex-1 items-center space-x-4 lg:space-x-6 text-sm font-medium overflow-x-auto overflow-y-hidden scrollbar-hide">
            {categories.map((category) => (
              <Link
                key={category.id}
                href={`/category/${category.slug}`}
                className={`transition-colors hover:text-foreground/80 whitespace-nowrap ${
                  currentCategory === category.slug
                    ? "text-foreground"
                    : "text-foreground/60"
                }`}
              >
                {category.name}
              </Link>
            ))}
          </nav>

          <div className="flex-shrink-0 pl-2 sm:pl-4 flex items-center gap-2">
            <form onSubmit={handleSearch} className="relative hidden sm:block">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                type="search"
                placeholder="搜索..."
                className="h-9 w-40 sm:w-48 lg:w-64 pl-8"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </form>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  )
}
