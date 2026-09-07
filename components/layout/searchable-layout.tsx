"use client"

import { useState, useMemo, useEffect } from "react"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { ScrollHeader } from "./scroll-header"
import { Footer } from "./footer"
import { SiteGrid } from "./site-grid"
import { BackToTop } from "./back-to-top"
import { SiteDetailProvider } from "./site-detail-provider"
import { OverviewView, type OverviewData } from "./overview-view"
import { useCardDensity } from "@/hooks/use-card-density"
import { Badge } from "@/components/ui/badge"
import { TooltipProvider } from "@/components/ui/tooltip"
import {
  PluginSlot,
  useHomeSideActive,
} from "@/lib/plugins/client"

interface Site {
  id: string
  name: string
  url: string
  description: string
  iconUrl: string | null
  isPinned?: boolean
  hasDetail?: boolean
  category?: {
    name: string
  } | null
}

interface SearchableLayoutProps {
  allCategories: Array<{
    id: string
    name: string
    slug: string
    icon?: string | null
  }>
  flatSites: Site[]
  siteName?: string
  currentCategory?: string
  useAnchorLinks?: boolean
  // 图鉴视图数据：仅首页传入，第三种卡片视图随之只在首页生效
  overviewData?: OverviewData
  children: React.ReactNode
}

export function SearchableLayout({
  allCategories,
  flatSites,
  siteName,
  currentCategory,
  useAnchorLinks,
  overviewData,
  children,
}: SearchableLayoutProps) {
  const [searchQuery, setSearchQuery] = useState("")
  // homeSide 插件（如今日诗词）启用时，为右侧浮动卡片预留稳定槽位
  const homeSideActive = useHomeSideActive()
  const { isOverview } = useCardDensity()
  const t = useTranslations("search")

  // usePathname 随客户端导航自动更新；旧的 window.location.pathname 方案
  // 导航后不更新，会导致非首页的锚点链接判断失效
  const pathname = usePathname()
  const anchorLinks = useAnchorLinks ?? pathname === "/"

  // pinyin-pro 含全量词典（约 1MB），且为全站逐条计算拼音有明显 CPU 开销：
  // 只在用户开始搜索时懒加载引擎并计算映射，首屏不加载、不计算
  const [pinyinModule, setPinyinModule] = useState<typeof import("pinyin-pro") | null>(null)
  useEffect(() => {
    if (!searchQuery.trim() || pinyinModule) return
    let cancelled = false
    import("pinyin-pro").then(mod => {
      if (!cancelled) setPinyinModule(mod)
    })
    return () => {
      cancelled = true
    }
  }, [searchQuery, pinyinModule])

  const pinyinMap = useMemo(() => {
    const map = new Map<string, { namePinyin: string; descPinyin: string }>()
    if (!pinyinModule) return map
    const { pinyin } = pinyinModule
    for (const site of flatSites) {
      map.set(site.id, {
        namePinyin: pinyin(site.name, { toneType: "none", type: "array" }).join("").toLowerCase(),
        descPinyin: pinyin(site.description, { toneType: "none", type: "array" }).join("").toLowerCase(),
      })
    }
    return map
  }, [flatSites, pinyinModule])

  const filteredSites = useMemo(() => {
    if (!searchQuery.trim()) return []

    const query = searchQuery.toLowerCase()
    return flatSites.filter(site => {
      // 原文匹配
      if (
        site.name.toLowerCase().includes(query) ||
        site.description.toLowerCase().includes(query) ||
        site.url.toLowerCase().includes(query)
      ) {
        return true
      }
      // 拼音匹配
      const py = pinyinMap.get(site.id)
      if (py) {
        if (py.namePinyin.includes(query) || py.descPinyin.includes(query)) {
          return true
        }
      }
      return false
    })
  }, [searchQuery, flatSites, pinyinMap])

  const isSearching = searchQuery.trim().length > 0
  // 侧栏槽位宽度只跟随站长级插件开关；用户级显隐只切换浮动卡片，
  // 不改变网站网格宽度，避免读取 localStorage 后首屏再次重排
  const overviewActive = Boolean(overviewData) && isOverview
  const hasHomeSideSpace = homeSideActive && !overviewActive

  return (
    <SiteDetailProvider>
      {/* 全网格共享一个 TooltipProvider：SiteCard 每卡自包 Provider 在大网格下
          会创建数百个 Radix Provider 树，挂载耗时与内存都不可观 */}
      <TooltipProvider delayDuration={150}>
      <div className="min-h-screen flex flex-col">
      <ScrollHeader
        categories={allCategories}
        siteName={siteName}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        currentCategory={currentCategory}
        useAnchorLinks={anchorLinks}
        overviewData={overviewData}
      />

      <main className="flex-1 px-4 sm:px-6 lg:px-8 py-8">
        <div className="mx-auto max-w-[1600px] w-full">
          {/* 插件 homeSide 槽位 - 固定在右上角（如今日诗词卡片） */}
          {!overviewActive && <PluginSlot position="homeSide" />}

          {/* 内容区域：为右侧侧栏插件预留空间 */}
          <div className={hasHomeSideSpace ? "lg:pr-36 lg:pl-2" : "lg:pl-2"}>
            {overviewActive ? (
              // 图鉴模式：首页正文整体替换为分享卡片样式的站点全览
              <OverviewView data={overviewData!} />
            ) : isSearching ? (
              // 搜索结果
              <div className="animate-fade-in">
                <div className="mb-6 flex flex-wrap items-center gap-2 sm:gap-3">
                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{t("resultsTitle")}</h1>
                  <Badge variant="secondary" className="px-2 py-0.5 text-xs font-medium animate-scale-in">
                    {t("found", { count: filteredSites.length })}
                  </Badge>
                  <p className="text-sm text-muted-foreground">
                    {t("keywordLabel")}<span className="font-semibold text-foreground">{t("quoted", { query: searchQuery })}</span>
                  </p>
                </div>

                {filteredSites.length === 0 ? (
                  <div className="flex min-h-[360px] flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-muted/20 p-8 text-center animate-scale-in">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground mb-4">
                      <svg
                        className="h-6 w-6"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    </div>
                    <p className="text-base font-semibold text-foreground">{t("notFoundTitle")}</p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                      {t("notFoundDesc", { query: searchQuery })}
                    </p>
                  </div>
                ) : (
                  <SiteGrid sites={filteredSites} />
                )}
              </div>
            ) : (
              // 页面内容（由父组件传入）
              children
            )}
          </div>

          {!overviewActive && <BackToTop />}
        </div>
      </main>

      {!overviewActive && <Footer />}
      </div>
      </TooltipProvider>
    </SiteDetailProvider>
  )
}
