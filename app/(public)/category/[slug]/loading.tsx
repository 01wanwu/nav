import { Header } from "@/components/layout/header"
import { Footer } from "@/components/layout/footer"
import { Skeleton } from "@/components/ui/skeleton"

export default function CategoryLoading() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header categories={[]} siteName="" />

      <main className="flex-1 px-4 sm:px-6 lg:px-8 py-8">
        <div className="mx-auto max-w-7xl w-full">
          <div className="mb-8">
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-5 w-32 mt-2" />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-32 rounded-lg border bg-muted/20" />
            ))}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
