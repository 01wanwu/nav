import { SearchableLayout } from "@/components/layout/searchable-layout"
import { SiteGrid } from "@/components/layout/site-grid"
import { CategoryIconBadge } from "@/components/category-icon"
import type { OverviewData } from "@/components/layout/overview-view"
import { getCategories } from "@/lib/actions"
import { getCachedDisplaySettings } from "@/lib/workspace-render"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { getTranslations } from "next-intl/server"

// 语言解析依赖请求级 Cookie（i18n/request.ts），页面按请求动态渲染；
// 后台数据更新时由 revalidatePath("/") 触发立即重新渲染
export default async function HomePage() {
  // 分类（含站点）与展示设置互不依赖，并行取数
  const [{ data: categories }, settings] = await Promise.all([
    getCategories(),
    getCachedDisplaySettings(),
  ])
  const t = await getTranslations("home")

  // 顶栏导航与全局搜索数据直接从分类结果投影，避免再发起两份近重复的全量加载
  const allCategories = (categories || []).map(c => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    icon: c.icon,
  }))
  const flatSites = (categories || []).flatMap(c => c.sites ?? [])

  // 图鉴视图数据：服务端渲染时就地投影给整页视图，避免运行时请求
  const overviewData: OverviewData = {
    siteName: settings?.siteName || "Conan Nav",
    siteDescription: settings?.siteDescription,
    footerCopyright: settings?.footerCopyright,
    categories: (categories || []).map((category) => ({
      id: category.id,
      name: category.name,
      sites: (category.sites || []).map((site) => ({
        id: site.id,
        name: site.name,
        url: site.url,
        iconUrl: site.iconUrl,
      })),
    })),
  }

    return (
      <SearchableLayout
        allCategories={allCategories || []}
        flatSites={flatSites}
        siteName={settings?.siteName}
        overviewData={overviewData}
      >
      <div className="space-y-8">
        {/* 分类内容 */}
        {categories && categories.length > 0 ? (
          <>
            {categories.map((category, index) => (
            <section key={category.id} id={`category-${category.slug}`} className="scroll-mt-20">
              <div className="flex items-center justify-between mb-3.5">
                <div className="flex items-center gap-2.5">
                  {category.icon && (
                    <CategoryIconBadge icon={category.icon} size="md" />
                  )}
                  <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground/95">{category.name}</h2>
                  {category.sites && category.sites.length > 0 && (
                    <Badge variant="secondary" className="px-1.5 py-0 text-[11px] font-medium h-5 rounded-full">
                      {category.sites.length}
                    </Badge>
                  )}
                </div>
              </div>

              {category.sites && category.sites.length > 0 ? (
                <SiteGrid sites={category.sites} categoryId={category.id} enableDrag />
              ) : (
                <div className="flex min-h-[100px] items-center justify-center rounded-xl border border-dashed border-border/80 bg-muted/20">
                  <p className="text-xs text-muted-foreground">{t("noSitesInCategory")}</p>
                </div>
              )}

              {index < categories.length - 1 && <Separator className="mt-8 opacity-60" />}
            </section>
          ))}
          </>
        ) : (
          <div className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-muted/20 p-8">
            <p className="text-sm font-semibold text-foreground">{t("noCategoriesTitle")}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {t("noCategoriesDesc")}
            </p>
          </div>
        )}
      </div>
    </SearchableLayout>
  )
}

