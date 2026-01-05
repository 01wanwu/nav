import { SearchableLayout } from "@/components/layout/searchable-layout"
import { SiteCard } from "@/components/layout/site-card"
import { getAllCategories, getCategories, getSystemSettings, getSites } from "@/lib/actions"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"

// ISR 配置：每 1 小时自动重新生成页面
// 当后台更新数据时，revalidatePath("/") 会触发立即重新生成
export const revalidate = 3600

export default async function HomePage() {
  const { data: categories } = await getCategories()
  const { data: allCategories } = await getAllCategories()
  const { data: settings } = await getSystemSettings()
  const { data: allSites } = await getSites()

  // 将所有网站扁平化，用于客户端搜索
  const flatSites = allSites?.filter(site => site.isPublished) || []

  return (
    <SearchableLayout
      allCategories={allCategories || []}
      flatSites={flatSites}
      siteName={settings?.siteName}
    >
      {categories && categories.length > 0 ? (
        <div className="space-y-12">
          {categories.map((category, index) => (
            <section key={category.id} id={`category-${category.slug}`}>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold tracking-tight">{category.name}</h2>
                {category.sites && category.sites.length > 0 && (
                  <Badge variant="secondary" className="text-sm">
                    {category.sites.length}
                  </Badge>
                )}
              </div>

              {category.sites && category.sites.length > 0 ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {category.sites.map((site) => (
                    <SiteCard key={site.id} site={site} />
                  ))}
                </div>
              ) : (
                <div className="flex min-h-[200px] items-center justify-center rounded-lg border">
                  <p className="text-sm text-muted-foreground">暂无网站</p>
                </div>
              )}

              {index < categories.length - 1 && <Separator className="mt-12" />}
            </section>
          ))}
        </div>
      ) : (
        <div className="flex min-h-[400px] flex-col items-center justify-center rounded-lg border">
          <p className="text-lg text-muted-foreground">暂无分类数据</p>
          <p className="text-sm text-muted-foreground mt-2">
            请先在后台创建分类和网站
          </p>
        </div>
      )}
    </SearchableLayout>
  )
}
