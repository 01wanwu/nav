"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import Link from "next/link"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ThemeToggle } from "@/components/theme-toggle"
import { LocaleToggle } from "@/components/locale-toggle"
import { FaviconServiceToggle } from "@/components/favicon-service-toggle"
import { CardDensityToggle } from "@/components/card-density-toggle"
import type { OverviewData } from "@/components/layout/overview-view"
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import { useMediaQuery } from "@/hooks/use-media-query"
import { useCardDensity } from "@/hooks/use-card-density"
import { Search, X } from "lucide-react"
import { fetchPublicSettings } from "@/lib/client-settings"
import { PluginHeaderSlot, PluginSlot } from "@/lib/plugins/client"
import { CategoryIcon, CategoryIconBadge } from "@/components/category-icon"

interface HeaderProps {
  categories: Array<{
    id: string
    name: string
    slug: string
    icon?: string | null
  }>
  currentCategory?: string
  siteName?: string
  siteLogo?: string | null
  searchQuery?: string
  onSearchChange?: (query: string) => void
  // 回车提交搜索：URL 驱动的搜索页（/search）需要，首页客户端过滤无需传
  onSearchSubmit?: (query: string) => void
  useAnchorLinks?: boolean
  onCategoryClick?: (slug: string) => void
  // 图鉴视图数据：仅首页传入，该模式下的精简顶栏也随之只在首页生效
  overviewData?: OverviewData
}

export function Header({
  categories,
  currentCategory = "",
  siteName = "Conan Nav",
  siteLogo = null,
  searchQuery = "",
  onSearchChange,
  onSearchSubmit,
  useAnchorLinks = false,
  onCategoryClick,
  overviewData,
}: HeaderProps) {
  const [logo, setLogo] = useState<string | null>(siteLogo)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const isDesktop = useMediaQuery("(min-width: 768px)")
  const { isOverview } = useCardDensity()
  const t = useTranslations("header")
  const overviewMode = Boolean(overviewData) && isOverview

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadSettings() {
      const settings = await fetchPublicSettings()
      if (!cancelled) {
        if (settings.siteLogo) setLogo(settings.siteLogo)
      }
    }

    loadSettings()

    const handleFocus = () => {
      loadSettings()
    }

    window.addEventListener('focus', handleFocus)

    return () => {
      cancelled = true
      window.removeEventListener('focus', handleFocus)
    }
  }, [])

  const handleClearSearch = () => {
    onSearchChange?.("")
  }

  const getCategoryHref = (slug: string) =>
    useAnchorLinks ? `#category-${slug}` : `/category/${slug}`

  // 滚动代际：新点击立即作废旧循环的等待与滚动，避免多个重试循环
  // 先后执行滚动互相打断（表现为页面连续跳动、落点错乱）
  const scrollGenerationRef = useRef(0)

  // 单次滚动尝试：vaul 抽屉关闭动画期间 body 带 data-scroll-locked（滚动锁定态），
  // 此时滚动指令会被吞掉，返回 false 交给重试循环。
  // 使用瞬时滚动（无动画）：不受移动端浏览器对 smooth 支持差异影响，执行即完成
  const tryScrollToCategory = (slug: string): boolean => {
    if (document.body.hasAttribute("data-scroll-locked")) return false
    const target = document.getElementById(`category-${slug}`)
    if (!target) return false
    const headerOffset = 80
    const top = target.getBoundingClientRect().top + window.scrollY - headerOffset
    window.scrollTo(0, top)
    return true
  }

  // 立即尝试一次；失败（滚动锁未释放/目标未渲染）则以 100ms 间隔重试至多 2s。
  // 每次执行前校验代际：仅当前最新一次点击的循环允许真正滚动。
  // 成功后在 350/800/1200ms 追加确认滚动（幂等 + 代际保护）：
  // vaul 关闭时恢复「打开抽屉前的滚动位置」的时刻在慢设备上可能晚至动画结束，
  // 拉长补枪窗口保证我们是滚动竞争中最后出手的一方
  const scrollToCategory = (slug: string) => {
    const generation = ++scrollGenerationRef.current
    const isStale = () => generation !== scrollGenerationRef.current
    const confirmScroll = (delay: number) => {
      window.setTimeout(() => {
        if (!isStale()) tryScrollToCategory(slug)
      }, delay)
    }

    if (tryScrollToCategory(slug)) {
      confirmScroll(350)
      confirmScroll(800)
      confirmScroll(1200)
      return
    }

    let attempts = 0
    const retry = () => {
      if (isStale()) return
      attempts += 1
      if (tryScrollToCategory(slug)) {
        confirmScroll(350)
        confirmScroll(800)
        confirmScroll(1200)
        return
      }
      if (attempts < 20) {
        window.setTimeout(retry, 100)
      }
    }
    window.setTimeout(retry, 100)
  }

  const handleAnchorClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    slug: string
  ) => {
    if (!useAnchorLinks) return
    e.preventDefault()
    setMobileMenuOpen(false)
    onCategoryClick?.(slug)
    scrollToCategory(slug)
  }

  // 快捷键支持：按 '/' 或 'Cmd+K / Ctrl+K' 聚焦搜索输入框
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase()
      if (activeTag === 'input' || activeTag === 'textarea') return

      if (e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault()
        const input = document.getElementById('search') as HTMLInputElement | null
        input?.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // 顶栏分类导航横向滑动：分类溢出时支持滚轮横滑与按住拖拽，边缘渐隐提示可滑方向
  const navRef = useRef<HTMLElement>(null)
  const [navOverflow, setNavOverflow] = useState({ left: false, right: false })

  const updateNavOverflow = useCallback(() => {
    const el = navRef.current
    if (!el) return
    setNavOverflow({
      left: el.scrollLeft > 1,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
    })
  }, [])

  // 滚轮默认只产生纵向 deltaY，这里转为横向滚动（React 根节点的 wheel 监听是
  // 被动的，preventDefault 需要手动挂非 passive 监听）
  useEffect(() => {
    const el = navRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return
      const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX
      if (!delta) return
      e.preventDefault()
      el.scrollLeft += delta
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [])

  useEffect(() => {
    updateNavOverflow()
    const el = navRef.current
    if (!el) return
    el.addEventListener("scroll", updateNavOverflow, { passive: true })
    const ro = new ResizeObserver(updateNavOverflow)
    ro.observe(el)
    return () => {
      el.removeEventListener("scroll", updateNavOverflow)
      ro.disconnect()
    }
  }, [updateNavOverflow, categories])

  // 激活分类居中滚入视野：分类多、当前项被溢出遮挡时保持可见
  useEffect(() => {
    const el = navRef.current
    if (!el || !currentCategory) return
    const active = el.querySelector<HTMLElement>(
      `[data-category-slug="${CSS.escape(currentCategory)}"]`
    )
    if (!active) return
    const target = active.offsetLeft - (el.clientWidth - active.offsetWidth) / 2
    el.scrollTo({ left: Math.max(0, target), behavior: "smooth" })
  }, [currentCategory, categories])

  // 按住拖拽滑动：pointer 拖动超过阈值进入拖拽态，随后的 click 在捕获阶段被吞掉，
  // 避免松手时误触分类链接
  const navDragRef = useRef({ down: false, startX: 0, startScroll: 0, moved: false })

  const handleNavPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return
    navDragRef.current = { down: true, startX: e.clientX, startScroll: navRef.current?.scrollLeft ?? 0, moved: false }
  }

  const handleNavPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const drag = navDragRef.current
    if (!drag.down) return
    const dx = e.clientX - drag.startX
    // 超过阈值才进入拖拽态并捕获指针。捕获会把后续 click 重定向到 nav，
    // 若在 pointerdown 无条件捕获，普通点击永远无法触达分类链接（点击滚动失效）
    if (!drag.moved && Math.abs(dx) > 4) {
      drag.moved = true
      navRef.current?.setPointerCapture(e.pointerId)
    }
    if (drag.moved && navRef.current) {
      navRef.current.scrollLeft = drag.startScroll - dx
    }
  }

  // 拖拽结束停止跟踪：捕获隐式释放，未按下状态下的 pointermove 不再滚动
  const handleNavPointerEnd = () => {
    navDragRef.current.down = false
  }

  const handleNavClickCapture = (e: React.MouseEvent<HTMLElement>) => {
    if (navDragRef.current.moved) {
      e.preventDefault()
      e.stopPropagation()
      navDragRef.current.moved = false
    }
  }

  return (
    <header
      className={`sticky top-0 z-50 w-full bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 ${
        overviewMode ? "border-b border-transparent" : "border-b"
      }`}
    >
      <div className="px-2 sm:px-4 lg:px-6">
        <div className="flex h-16 items-center">
          {/* 桌面端：Logo + 站点名 */}
          <div className={`hidden flex-shrink-0 items-center ${overviewMode ? "md:hidden" : "md:flex pr-6 sm:pr-8"}`}>
            <Link href="/" className="flex items-center space-x-2">
              {logo && (
                <Image
                  src={logo}
                  alt="Logo"
                  width={24}
                  height={24}
                  className="h-6 w-6 object-contain"
                  referrerPolicy="no-referrer"
                  priority
                />
              )}
              <span className="font-bold text-xl">{siteName}</span>
            </Link>
          </div>

          {/* 移动端：分类按钮（drawer 触发器），靠最左侧 */}
          <div className={`flex-shrink-0 items-center gap-1 md:hidden ${overviewMode ? "hidden" : "flex"}`}>
            <Drawer open={mobileMenuOpen} onOpenChange={setMobileMenuOpen} direction="left">
              <DrawerTrigger asChild>
                <button className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-9 w-9">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-5 w-5"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="M9 3v18" />
                  </svg>
                  <span className="sr-only">{t("categoriesSr")}</span>
                </button>
              </DrawerTrigger>
              <DrawerContent className="h-full w-[280px] rounded-none border-r">
                <DrawerHeader className="sr-only">
                  <DrawerTitle>{t("selectCategory")}</DrawerTitle>
                </DrawerHeader>
                <div className="grid gap-1 px-4 py-6">
                  {/* 移动端搜索入口：桌面搜索框为 hidden sm:block，<640px 只有这里能搜索。
                      图鉴模式下搜索结果分支不渲染（见 searchable-layout），维持无搜索设计 */}
                  {!overviewMode && (
                    <div className="relative mb-2">
                      <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none select-none" />
                      <Input
                        type="text"
                        placeholder={t("searchPlaceholder")}
                        className="h-9 w-full pl-8 pr-3 text-xs bg-muted/40"
                        value={searchQuery}
                        onChange={(e) => onSearchChange?.(e.target.value)}
                        onKeyDown={(e) => {
                          // isComposing：中文输入法确认候选词的 Enter 不算提交
                          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                            e.preventDefault()
                            onSearchSubmit?.(searchQuery)
                            setMobileMenuOpen(false)
                          }
                        }}
                      />
                    </div>
                  )}
                  {categories.map((category) => (
                    <Link
                      key={category.id}
                      href={getCategoryHref(category.slug)}
                      onClick={(e) => {
                        handleAnchorClick(e, category.slug)
                        setMobileMenuOpen(false)
                      }}
                      className={`flex items-center gap-2.5 py-3 px-4 rounded-md transition-colors ${
                        currentCategory === category.slug
                          ? "bg-accent text-foreground font-medium"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground"
                      }`}
                    >
{category.icon && (
                        <CategoryIconBadge icon={category.icon} size="sm" />
                      )}
                      <span>{category.name}</span>
                    </Link>
                  ))}
                </div>
              </DrawerContent>
            </Drawer>
            <Link
              href="/"
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 hover:bg-accent hover:text-accent-foreground h-9 w-9"
              aria-label={t("backHome")}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
              >
                <path d="M3 9.5L12 3l9 6.5" className="transition-transform duration-200 group-hover:scale-105" />
                <path d="M5 9.5V21h14V9.5" />
                <path d="M10 21v-6h4v6" />
              </svg>
            </Link>
          </div>

          {/* 桌面端：Tabs 风格横向分类导航（分类溢出时滚轮/拖拽横滑，边缘渐隐提示） */}
          <div className={`relative hidden min-w-0 flex-1 ${overviewMode ? "md:hidden" : "md:block"}`}>
            <nav
              ref={navRef}
              onPointerDown={handleNavPointerDown}
              onPointerMove={handleNavPointerMove}
              onPointerUp={handleNavPointerEnd}
              onPointerCancel={handleNavPointerEnd}
              onDragStart={(e) => e.preventDefault()}
              onClickCapture={handleNavClickCapture}
              className="flex flex-1 select-none items-center overflow-x-auto overflow-y-hidden scrollbar-hide"
            >
              <div className="bg-muted inline-flex h-9 items-center justify-center rounded-lg p-[3px] gap-0.5">
                {categories.map((category) => (
                  <Link
                    key={category.id}
                    data-category-slug={category.slug}
                    href={getCategoryHref(category.slug)}
                    onClick={(e) => handleAnchorClick(e, category.slug)}
                    className={`inline-flex h-[calc(100%-1px)] items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-all duration-200 ease-out active:scale-95 ${
                      currentCategory === category.slug
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                    }`}
                  >
                    {category.icon && (
                      <CategoryIcon icon={category.icon} className="h-3.5 w-3.5 shrink-0" size={14} />
                    )}
                    <span>{category.name}</span>
                  </Link>
                ))}
              </div>
            </nav>
            {navOverflow.left && (
              <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-background to-transparent" />
            )}
            {navOverflow.right && (
              <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent" />
            )}
          </div>

          <div className="flex-shrink-0 ml-auto pl-2 sm:pl-4 flex items-center gap-2">
            <div className={`relative hidden group ${overviewMode ? "sm:hidden" : "sm:block"}`}>
              <Label htmlFor="search" className="sr-only">{t("searchSr")}</Label>
              <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none select-none transition-colors group-focus-within:text-foreground" />
              <Input
                id="search"
                type="text"
                placeholder={t("searchPlaceholder")}
                className="h-9 w-40 sm:w-48 lg:w-64 pl-8 pr-8 text-xs bg-muted/40 transition-all duration-300 ease-spring focus:bg-background focus:w-56 sm:focus:w-60 lg:focus:w-72 focus:shadow-xs [&::-webkit-search-cancel-button]:hidden [&::-ms-clear]:hidden"
                value={searchQuery}
                onChange={(e) => onSearchChange?.(e.target.value)}
                onKeyDown={(e) => {
                  // isComposing：中文输入法确认候选词的 Enter 不算提交搜索
                  if (e.key === "Enter" && !e.nativeEvent.isComposing && onSearchSubmit) {
                    e.preventDefault()
                    onSearchSubmit(searchQuery)
                  }
                }}
                suppressHydrationWarning
              />
              {searchQuery ? (
                <button
                  onClick={handleClearSearch}
                  className="absolute top-1/2 right-2 size-4 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-all duration-150 animate-in zoom-in-75 active:scale-90"
                  type="button"
                  aria-label={t("clearSearch")}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : (
                <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 hidden lg:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-70">
                  /
                </kbd>
              )}
            </div>

            {/* 插件注入点：启用的插件在此渲染前台入口（如网站收录按钮） */}
            {!overviewMode && <PluginHeaderSlot />}
            <CardDensityToggle />
            {!overviewMode && (
              <>
                <FaviconServiceToggle />
                {/* 插件工具按钮槽（如诗词显隐切换） */}
                <PluginSlot position="headerTools" />
                <LocaleToggle />
              </>
            )}
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  )
}
