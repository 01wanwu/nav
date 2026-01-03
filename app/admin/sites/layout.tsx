import { AdminLayout } from "@/components/admin/admin-layout"

export default function SitesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AdminLayout>{children}</AdminLayout>
}
