import { AdminLayout } from "@/components/admin/admin-layout"

export default function CategoriesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AdminLayout>{children}</AdminLayout>
}
