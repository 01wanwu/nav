import { SearchableLayout } from "@/components/layout/searchable-layout"
import { SiteCard } from "@/components/layout/site-card"
import { getAllCategories, getCategoryBySlug, getSystemSettings, getSites } from "@/lib/actions"
import { notFound } from "next/navigation"
import { Badge } from "@/components/ui/badge"

// ISR 配置：每 1 小时自动重新生成页面
// 当后台更新数据时，revalidatePath("/category/[slug]") 会触发立即重新生成
export const revalidate = 3600

interface CategoryPageProps {
  params: Promise<{
    slug: string
  }>
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { slug } = await params
  const { data: category } = await getCategoryBySlug(slug)
  const { data: allCategories } = await getAllCategories()
  const { data: settings } = await getSystemSettings()
  const { data: allSites } = await getSites()

  if (!category) {
    notFound()
  }

  // 将所有网站扁平化，用于客户端搜索
  const flatSites = allSites?.filter(site => site.isPublished) || []

  return (
    <SearchableLayout
      allCategories={allCategories || []}
      flatSites={flatSites}
      siteName={settings?.siteName}
      currentCategory={slug}
    >
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">{category.name}</h1>
        {category.sites && category.sites.length > 0 && (
          <p className="text-muted-foreground mt-2">
            共 {category.sites.length} 个网站
          </p>
        )}
      </div>

      {category.sites && category.sites.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {category.sites.map((site) => (
            <SiteCard key={site.id} site={site} />
          ))}
        </div>
      ) : (
        <div className="flex min-h-[400px] flex-col items-center justify-center rounded-lg border border-dashed">
          <p className="text-lg text-muted-foreground">该分类下暂无网站</p>
          <p className="text-sm text-muted-foreground mt-2">
            请在后台添加网站到此分类
          </p>
        </div>
      )}
    </SearchableLayout>
  )
}
