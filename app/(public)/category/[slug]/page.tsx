import { SearchableLayout } from "@/components/layout/searchable-layout"
import { SiteGrid } from "@/components/layout/site-grid"
import { CategoryIconBadge } from "@/components/category-icon"
import { getAllCategories, getCategoryBySlug, getSites } from "@/lib/actions"
import { getCachedDisplaySettings } from "@/lib/workspace-render"
import { notFound } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { getTranslations } from "next-intl/server"

// 语言解析依赖请求级 Cookie（i18n/request.ts），页面按请求动态渲染
interface CategoryPageProps {
  params: Promise<{
    slug: string
  }>
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { slug } = await params
  // 四路数据互不依赖，并行取数；workspace/settings 已由请求级 cache() 合并解析
  const [categoryResult, allCategoriesResult, settings, allSitesResult] = await Promise.all([
    getCategoryBySlug(slug),
    getAllCategories(),
    getCachedDisplaySettings(),
    getSites(),
  ])
  const { data: category } = categoryResult
  const { data: allCategories } = allCategoriesResult
  const { data: allSites } = allSitesResult
  const t = await getTranslations("category")

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
      <div className="mb-6">
        <div className="flex items-center gap-3">
          {(category as any).icon && (
            <CategoryIconBadge icon={(category as any).icon} size="lg" />
          )}
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground/95">{category.name}</h1>
          {category.sites && category.sites.length > 0 && (
            <Badge variant="secondary" className="px-2 py-0 text-[11px] font-medium h-5 rounded-full">
              {t("siteCount", { count: category.sites.length })}
            </Badge>
          )}
        </div>
      </div>

      {category.sites && category.sites.length > 0 ? (
        <SiteGrid sites={category.sites} categoryId={category.id} enableDrag />
      ) : (
        <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-muted/20 p-6 text-center">
          <p className="text-sm font-semibold text-foreground">{t("noSitesTitle")}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {t("noSitesDesc")}
          </p>
        </div>
      )}
    </SearchableLayout>
  )
}

