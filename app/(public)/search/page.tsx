import { Header } from "@/components/layout/header"
import { Footer } from "@/components/layout/footer"
import { SiteCard } from "@/components/layout/site-card"
import { searchSites, getAllCategories, getSystemSettings } from "@/lib/actions"
import { redirect } from "next/navigation"

interface SearchPageProps {
  searchParams: Promise<{
    q?: string
  }>
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q: query } = await searchParams
  const { data: categories } = await getAllCategories()
  const { data: settings } = await getSystemSettings()

  if (!query) {
    redirect("/")
  }

  const { data: sites } = await searchSites(query)

  return (
    <div className="min-h-screen flex flex-col">
      <Header categories={categories || []} siteName={settings?.siteName} />

      <main className="flex-1 px-4 sm:px-6 lg:px-8 py-8 page-enter">
        <div className="mx-auto max-w-7xl w-full">
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight">搜索结果</h1>
            <p className="text-muted-foreground mt-2">
              关键词：<span className="font-semibold text-foreground">「{query}」</span>
              {sites && (
                <span className="ml-2">
                  找到 <span className="font-semibold">{sites.length}</span> 个结果
                </span>
              )}
            </p>
          </div>

          {!sites || sites.length === 0 ? (
            <div className="flex min-h-[400px] flex-col items-center justify-center rounded-lg border border-dashed">
              <p className="text-lg text-muted-foreground">未找到匹配的网站</p>
              <p className="text-sm text-muted-foreground mt-2">
                请尝试其他关键词
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {sites.map((site) => (
                <SiteCard key={site.id} site={site} />
              ))}
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  )
}
