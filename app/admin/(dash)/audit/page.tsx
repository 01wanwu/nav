import { redirect } from "next/navigation"
import { getAdminSession } from "@/lib/api-auth"
import { AuditLogViewer } from "@/components/admin/audit-log-viewer"

export const dynamic = "force-dynamic"

// 审计日志页：仅超管可见。普通 ADMIN 直接访问时重定向到仪表盘
export default async function AdminAuditPage() {
  const session = await getAdminSession()
  if (!session) {
    redirect("/admin/login")
  }
  if (session.role !== "SUPER_ADMIN") {
    redirect("/admin/dashboard")
  }
  return <AuditLogViewer />
}
