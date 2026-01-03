import { ScrollHeader } from "@/components/layout/scroll-header"
import { Footer } from "@/components/layout/footer"
import { SiteCard } from "@/components/layout/site-card"
import { getAllCategories, getCategories, getSystemSettings } from "@/lib/actions"
import { Separator } from "@/components/ui/separator"

// ISR 配置：每 1 小时自动重新生成页面
// 当后台更新数据时，revalidatePath("/") 会触发立即重新生成
export const revalidate = 3600

export default async function HomePage() {
  const { data: categories } = await getCategories()
  const { data: allCategories } = await getAllCategories()
  const { data: settings } = await getSystemSettings()

  return (
    <div className="min-h-screen flex flex-col">
      <ScrollHeader categories={allCategories || []} siteName={settings?.siteName} />

      <main className="flex-1 px-4 sm:px-6 lg:px-8 py-8 page-enter">
        <div className="mx-auto max-w-7xl w-full">
          {categories && categories.length > 0 ? (
            <div className="space-y-12">
              {categories.map((category, index) => (
                <section key={category.id} id={`category-${category.slug}`}>
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-bold tracking-tight">{category.name}</h2>
                    {category.sites && category.sites.length > 0 && (
                      <span className="text-sm text-muted-foreground">
                        {category.sites.length} 个网站
                      </span>
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
        </div>
      </main>

      <Footer />
    </div>
  )
}
