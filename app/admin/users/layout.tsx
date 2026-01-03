import { AdminLayout } from "@/components/admin/admin-layout"

export default function UsersLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AdminLayout>{children}</AdminLayout>
}
