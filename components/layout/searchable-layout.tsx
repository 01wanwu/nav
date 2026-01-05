"use client"

import { useState, useMemo } from "react"
import { ScrollHeader } from "./scroll-header"
import { Footer } from "./footer"
import { SiteCard } from "./site-card"

interface Site {
  id: string
  name: string
  url: string
  description: string
  iconUrl: string | null
  category?: {
    name: string
  }
}

interface SearchableLayoutProps {
  allCategories: Array<{
    id: string
    name: string
    slug: string
  }>
  flatSites: Site[]
  siteName?: string
  currentCategory?: string
  children: React.ReactNode
}

export function SearchableLayout({
  allCategories,
  flatSites,
  siteName,
  currentCategory,
  children,
}: SearchableLayoutProps) {
  const [searchQuery, setSearchQuery] = useState("")

  const filteredSites = useMemo(() => {
    if (!searchQuery.trim()) return []

    const query = searchQuery.toLowerCase()
    return flatSites.filter(site =>
      site.name.toLowerCase().includes(query) ||
      site.description.toLowerCase().includes(query) ||
      site.url.toLowerCase().includes(query)
    )
  }, [searchQuery, flatSites])

  const isSearching = searchQuery.trim().length > 0

  return (
    <div className="min-h-screen flex flex-col">
      <ScrollHeader
        categories={allCategories}
        siteName={siteName}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        currentCategory={currentCategory}
      />

      <main className="flex-1 px-4 sm:px-6 lg:px-8 py-8 page-enter">
        <div className="mx-auto max-w-7xl w-full">
          {isSearching ? (
            // 搜索结果
            <>
              <div className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight">搜索结果</h1>
                <p className="text-muted-foreground mt-2">
                  关键词：<span className="font-semibold text-foreground">「{searchQuery}」</span>
                  <span className="ml-2">
                    找到 <span className="font-semibold">{filteredSites.length}</span> 个结果
                  </span>
                </p>
              </div>

              {filteredSites.length === 0 ? (
                <div className="flex min-h-[400px] flex-col items-center justify-center rounded-lg border border-dashed">
                  <p className="text-lg text-muted-foreground">未找到匹配的网站</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    请尝试其他关键词
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {filteredSites.map((site) => (
                    <SiteCard key={site.id} site={site} />
                  ))}
                </div>
              )}
            </>
          ) : (
            // 页面内容（由父组件传入）
            children
          )}
        </div>
      </main>

      <Footer />
    </div>
  )
}
